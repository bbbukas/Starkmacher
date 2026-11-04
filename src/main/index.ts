/**
 * Hauptprozess von Starkmacher: startet das Fenster, die Menüleiste und den
 * Datenbaustein und legt beim Start eine Sicherung an. Verbindungen ins Internet
 * sind gesperrt – Starkmacher braucht keine.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { app, BrowserWindow, nativeTheme, session } from 'electron';
import { grundbestandOeffnen } from './daten/bls';
import { DatenDienst } from './daten/dienst';
import { LebensmittelDienst } from './daten/lebensmittelDienst';
import { RezeptDienst } from './daten/rezeptDienst';
import { TagebuchDienst } from './daten/tagebuchDienst';
import { TellerDienst } from './daten/tellerDienst';
import { Einstellungen } from './einstellungen';
import { fotoEntfernen } from './fotos';
import { ipcEinrichten } from './ipc';
import { menueEinrichten } from './menue';
import { Sicherungen } from './sicherung';

// Für die automatischen Tests ein eigener, leerer Datenordner. Beim Entwickeln nie die echten Daten.
const entwicklung = !app.isPackaged;
if (process.env.STARKMACHER_DATEN_ORDNER) app.setPath('userData', process.env.STARKMACHER_DATEN_ORDNER);
else if (entwicklung) app.setPath('userData', join(app.getPath('appData'), 'Starkmacher Entwicklung'));

app.setName('Starkmacher');
app.commandLine.appendSwitch('lang', 'de-DE');
nativeTheme.themeSource = 'light';

let hauptfenster: BrowserWindow | null = null;

/** Ordner, die mit iCloud abgeglichen werden – dorthin wird nie gesichert. */
function icloudOrdner(): string[] {
  const mobil = process.env.STARKMACHER_ICLOUD_ORDNER ?? join(homedir(), 'Library/Mobile Documents');
  const drive = join(mobil, 'com~apple~CloudDocs');
  return [
    mobil,
    // „Schreibtisch & Dokumente“ in iCloud an? Dann gehören auch diese beiden Ordner dazu.
    ...(existsSync(join(drive, 'Desktop')) ? [join(homedir(), 'Desktop')] : []),
    ...(existsSync(join(drive, 'Documents')) ? [join(homedir(), 'Documents')] : []),
  ];
}

function fensterOeffnen(): void {
  hauptfenster = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 420,
    minHeight: 560,
    title: 'Starkmacher',
    backgroundColor: '#FFEFE6',
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  hauptfenster.once('ready-to-show', () => hauptfenster?.show());
  hauptfenster.on('closed', () => {
    hauptfenster = null;
  });

  const adresse = process.env.ELECTRON_RENDERER_URL;
  if (entwicklung && adresse) void hauptfenster.loadURL(adresse);
  else void hauptfenster.loadFile(join(import.meta.dirname, '../renderer/index.html'));
}

function sicherheitEinrichten(): void {
  // Keine fremden Seiten, keine neuen Fenster, keine Kamera/Mikrofon/Standort.
  app.on('web-contents-created', (_e, inhalt) => {
    inhalt.on('will-navigate', (ereignis, ziel) => {
      if (ziel !== inhalt.getURL()) ereignis.preventDefault();
    });
    inhalt.setWindowOpenHandler(() => ({ action: 'deny' }));
    inhalt.on('will-attach-webview', (ereignis) => ereignis.preventDefault());
  });
  session.defaultSession.setPermissionRequestHandler((_inhalt, _recht, antwort) => antwort(false));

  // Keine Verbindungen ins Internet (beim Entwickeln nur zum eigenen Vite-Server).
  const vite = entwicklung && process.env.ELECTRON_RENDERER_URL ? new URL(process.env.ELECTRON_RENDERER_URL) : null;
  session.defaultSession.webRequest.onBeforeRequest((anfrage, antwort) => {
    const url = new URL(anfrage.url);
    const lokal = ['file:', 'data:', 'blob:', 'devtools:', 'chrome-extension:'].includes(url.protocol);
    const erlaubt = lokal || (vite !== null && url.hostname === vite.hostname && url.port === vite.port);
    if (!erlaubt) console.warn('[starkmacher] Verbindung blockiert:', anfrage.url);
    antwort({ cancel: !erlaubt });
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (hauptfenster?.isMinimized()) hauptfenster.restore();
    hauptfenster?.focus();
  });

  void app.whenReady().then(async () => {
    sicherheitEinrichten();

    const ordner = app.getPath('userData');
    const einstellungen = new Einstellungen(join(ordner, 'einstellungen.json'));
    await einstellungen.laden();
    const dienst = new DatenDienst(ordner);
    dienst.oeffnen();
    const sicherungen = new Sicherungen({
      fotoOrdner: dienst.fotoOrdner,
      standardOrdner: join(ordner, 'Sicherungen'),
      icloudOrdner: icloudOrdner(),
      gewaehlterOrdner: () => einstellungen.sicherungsOrdner(),
      ordnerMerken: (neu) => einstellungen.sicherungsOrdnerSetzen(neu),
      hatDaten: () => dienst.hatDaten(),
      datenbankKopieren: (ziel) => dienst.kopieSchreiben(ziel),
    });
    // Sicherung bei jedem Start – bevor irgendetwas geändert wird. Klappt sie nicht, zeigt die Oberfläche es an.
    await sicherungen.erstellen().catch((fehler) => console.error('[starkmacher] Start-Sicherung fehlgeschlagen', fehler));
    dienst.migrieren();
    // Der Grundbestand liegt im Programm (electron-builder.yml), beim Entwickeln im Projektordner.
    const grundbestand = grundbestandOeffnen(app.isPackaged ? join(process.resourcesPath, 'bls-4.0.sqlite') : join(app.getAppPath(), 'ressourcen/bls-4.0.sqlite'));
    const lebensmittel = new LebensmittelDienst(() => dienst.bereit(), grundbestand, (name) => fotoEntfernen(name, dienst.fotoOrdner));
    const rezepte = new RezeptDienst(() => dienst.bereit(), lebensmittel, (name) => fotoEntfernen(name, dienst.fotoOrdner));
    const teller = new TellerDienst(() => dienst.bereit(), lebensmittel, rezepte);
    const tagebuch = new TagebuchDienst(() => dienst.bereit(), lebensmittel, rezepte, teller, grundbestand);
    ipcEinrichten(dienst, lebensmittel, rezepte, teller, tagebuch, sicherungen, { version: app.getVersion(), datenOrdner: ordner, entwicklung });
    menueEinrichten(() => hauptfenster);

    app.setAboutPanelOptions({
      applicationName: 'Starkmacher',
      applicationVersion: app.getVersion(),
      copyright: 'Lukas',
      credits: 'Schriften: Fraunces und Nunito (SIL Open Font License). Symbole: Lucide (ISC-Lizenz).',
    });
    // Beim Entwickeln trägt Electron sein eigenes Symbol – dann unseres zeigen.
    const symbol = join(app.getAppPath(), 'build/icon.png');
    if (entwicklung && process.platform === 'darwin' && existsSync(symbol)) app.dock?.setIcon(symbol);

    app.on('before-quit', () => {
      dienst.schliessen();
      grundbestand.schliessen();
    });
    fensterOeffnen();
  });

  // Ein Fenster, ein Programm: Fenster zu = Programm beendet.
  app.on('window-all-closed', () => app.quit());
}
