/**
 * Verbindet die Oberfläche (über src/preload) mit Datenbaustein und Sicherungen.
 * Alles, was von der Oberfläche kommt, wird hier oder im Datenbaustein geprüft.
 */
import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import type { Aenderung, Antwort, FotoZweck, HandyEreignis, ProgrammInfo, SuchAnfrage } from '@shared/api';
import { StarkFehler } from '@shared/fehler';
import type { RezeptAnfrage } from '@shared/rezepte';
import type { DatenDienst } from './daten/dienst';
import type { EinkaufDienst } from './daten/einkaufDienst';
import type { LebensmittelDienst } from './daten/lebensmittelDienst';
import type { RezeptDienst } from './daten/rezeptDienst';
import type { TagebuchDienst } from './daten/tagebuchDienst';
import type { TellerDienst } from './daten/tellerDienst';
import { zweckPruefen, type FotoDienst } from './fotoDienst';
import { fotoEinlesen, fotoEntfernen, fotoLesen } from './fotos';
import { HandySeite, lokaleAdresse } from './handy';
import type { Sehen } from './sehen';
import type { Sicherungen } from './sicherung';

async function alsAntwort<T>(aufgabe: () => T | Promise<T>): Promise<Antwort<T>> {
  try {
    return { ok: true, wert: await aufgabe() };
  } catch (fehler) {
    if (fehler instanceof StarkFehler) return { ok: false, code: fehler.code, meldung: fehler.message };
    console.error('[starkmacher] unerwarteter Fehler', fehler);
    return { ok: false, code: 'FEHLER', meldung: 'Das hat gerade nicht geklappt. Bitte noch einmal versuchen.' };
  }
}

const HANDY_TITEL: Readonly<Record<FotoZweck, string>> = {
  lebensmittel: 'Foto für dein Lebensmittel',
  rezept: 'Foto für dein Rezept',
};

const BILD_FILTER: Electron.FileFilter[] = [{ name: 'Bilder', extensions: ['jpg', 'jpeg', 'png', 'heic', 'webp'] }];

export function ipcEinrichten(dienst: DatenDienst, lebensmittel: LebensmittelDienst, rezepte: RezeptDienst, teller: TellerDienst, tagebuch: TagebuchDienst, einkauf: EinkaufDienst, sicherungen: Sicherungen, fotos: FotoDienst, sehen: Sehen, handy: HandySeite, info: ProgrammInfo): void {
  ipcMain.handle('fotos:waehlen', (e, zweck: unknown) =>
    alsAntwort(async () => {
      const wofuer = zweckPruefen(zweck);
      const fenster = BrowserWindow.fromWebContents(e.sender);
      const optionen: Electron.OpenDialogOptions = { title: 'Foto wählen', buttonLabel: 'Dieses Foto nehmen', properties: ['openFile'], filters: BILD_FILTER };
      const wahl = fenster ? await dialog.showOpenDialog(fenster, optionen) : await dialog.showOpenDialog(optionen);
      const pfad = wahl.filePaths[0];
      if (wahl.canceled || !pfad) return null;
      return fotos.auswerten(pfad, wofuer);
    }),
  );
  ipcMain.handle('fotos:einlesen', (_e, daten: unknown, zweck: unknown) =>
    alsAntwort(() => {
      if (!(daten instanceof Uint8Array)) throw new StarkFehler('UNGUELTIG', 'Das ist kein Bild.');
      return fotos.ausDaten(daten, zweckPruefen(zweck));
    }),
  );
  ipcMain.handle('fotos:barcode', (_e, code: unknown) => alsAntwort(() => fotos.barcodeNachschlagen(code)));
  ipcMain.handle('fotos:handyOeffnen', (e, zweck: unknown) =>
    alsAntwort(async () => {
      const wofuer = zweckPruefen(zweck);
      // STARKMACHER_HANDY_ADRESSE: Die Klick-Tests bleiben auf diesem Mac und gehen nie ins WLAN.
      const adresse = process.env.STARKMACHER_HANDY_ADRESSE ?? lokaleAdresse();
      if (!adresse) throw new StarkFehler('UNGUELTIG', 'Dein Mac ist gerade in keinem WLAN. Bitte verbinde ihn und versuch es noch einmal.');
      const senden = (ereignis: HandyEreignis) => {
        if (!e.sender.isDestroyed()) e.sender.send('fotos:handy', ereignis);
      };
      const url = await handy.oeffnen({
        titel: HANDY_TITEL[wofuer],
        adresse,
        beiBild: (daten) => {
          void alsAntwort(() => fotos.ausDaten(daten, wofuer)).then((a) => senden(a.ok ? { art: 'foto', ergebnis: a.wert } : { art: 'fehler', meldung: a.meldung }));
        },
        beiEnde: () => senden({ art: 'ende' }),
      });
      return { adresse: url };
    }),
  );
  ipcMain.on('fotos:handySchliessen', () => handy.schliessen());

  ipcMain.handle('einkauf:ansicht', () => alsAntwort(() => einkauf.ansicht()));
  ipcMain.handle('einkauf:hinzufuegen', (_e, id: unknown) => alsAntwort(() => einkauf.hinzufuegen(id)));
  ipcMain.handle('einkauf:anzahl', (_e, id: unknown, anzahl: unknown) => alsAntwort(() => einkauf.anzahlSetzen(id, anzahl)));
  ipcMain.handle('einkauf:entfernen', (_e, id: unknown) => alsAntwort(() => einkauf.entfernen(id)));
  ipcMain.handle('einkauf:abhaken', (_e, schluessel: unknown, ja: unknown) => alsAntwort(() => einkauf.abhaken(schluessel, ja)));
  ipcMain.handle('einkauf:hakenEntfernen', () => alsAntwort(() => einkauf.hakenEntfernen()));
  ipcMain.handle('einkauf:leeren', () => alsAntwort(() => einkauf.leeren()));
  ipcMain.handle('einkauf:kopieren', () =>
    alsAntwort(() => {
      clipboard.writeText(einkauf.text());
      return null;
    }),
  );

  ipcMain.handle('teller:liste', (_e, text: unknown) => alsAntwort(() => teller.liste(text)));
  ipcMain.handle('teller:holen', (_e, id: unknown) => alsAntwort(() => teller.holen(id)));
  ipcMain.handle('teller:speichern', (_e, eingabe: unknown) => alsAntwort(() => teller.speichern(eingabe)));
  ipcMain.handle('teller:loeschen', (_e, id: unknown) =>
    alsAntwort(() => {
      teller.loeschen(id);
      return null;
    }),
  );
  ipcMain.handle('teller:vorschau', (_e, posten: unknown) => alsAntwort(() => teller.vorschau(posten)));
  ipcMain.handle('tagebuch:tellerEintragen', (_e, eingabe: unknown) => alsAntwort(() => tagebuch.tellerEintragen(eingabe)));

  ipcMain.handle('rezepte:liste', (_e, anfrage: Partial<RezeptAnfrage> | undefined) => alsAntwort(() => rezepte.liste(anfrage)));
  ipcMain.handle('rezepte:holen', (_e, id: unknown) => alsAntwort(() => rezepte.holen(id)));
  ipcMain.handle('rezepte:speichern', (_e, eingabe: unknown) => alsAntwort(() => rezepte.speichern(eingabe)));
  ipcMain.handle('rezepte:loeschen', (_e, id: unknown) =>
    alsAntwort(() => {
      rezepte.loeschen(id);
      return null;
    }),
  );
  ipcMain.handle('rezepte:vorschau', (_e, zutaten: unknown) => alsAntwort(() => rezepte.vorschau(zutaten)));
  ipcMain.handle('rezepte:hashtags', () => alsAntwort(() => rezepte.hashtags()));
  ipcMain.handle('rezepte:hashtagSpeichern', (_e, hashtag: unknown) => alsAntwort(() => rezepte.hashtagSpeichern(hashtag)));
  ipcMain.handle('rezepte:hashtagLoeschen', (_e, id: unknown) =>
    alsAntwort(() => {
      rezepte.hashtagLoeschen(id);
      return null;
    }),
  );

  ipcMain.handle('tagebuch:tag', (_e, datum: unknown) => alsAntwort(() => tagebuch.tag(datum)));
  ipcMain.handle('tagebuch:zeitraum', (_e, von: unknown, bis: unknown) => alsAntwort(() => tagebuch.zeitraum(von, bis)));
  ipcMain.handle('tagebuch:eintragen', (_e, eingabe: unknown) => alsAntwort(() => tagebuch.eintragen(eingabe)));
  ipcMain.handle('tagebuch:aendern', (_e, id: unknown, aenderung: unknown) => alsAntwort(() => tagebuch.aendern(id, aenderung)));
  ipcMain.handle('tagebuch:loeschen', (_e, id: unknown) =>
    alsAntwort(() => {
      tagebuch.loeschen(id);
      return null;
    }),
  );
  ipcMain.handle('tagebuch:zuletzt', () => alsAntwort(() => tagebuch.zuletztGegessen()));
  ipcMain.handle('tagebuch:vorschlaege', (_e, datum: unknown) => alsAntwort(() => tagebuch.vorschlaege(datum)));

  ipcMain.handle('lebensmittel:suchen', (_e, anfrage: SuchAnfrage) => alsAntwort(() => lebensmittel.suchen(anfrage)));
  ipcMain.handle('lebensmittel:holen', (_e, id: unknown) => alsAntwort(() => lebensmittel.holen(id)));
  ipcMain.handle('lebensmittel:speichern', (_e, eingabe: unknown) => alsAntwort(() => lebensmittel.speichern(eingabe)));
  ipcMain.handle('lebensmittel:loeschen', (_e, id: unknown) =>
    alsAntwort(() => {
      lebensmittel.loeschen(id);
      return null;
    }),
  );
  ipcMain.handle('lebensmittel:aehnliche', (_e, anfrage: { name?: unknown; werte?: unknown }) => alsAntwort(() => lebensmittel.aehnliche(anfrage)));
  ipcMain.handle('lebensmittel:umrechnungSpeichern', (_e, id: unknown, umrechnung: unknown) => alsAntwort(() => lebensmittel.umrechnungSpeichern(id, umrechnung)));
  ipcMain.on('lebensmittel:verwendet', (_e, id: unknown) => {
    try {
      lebensmittel.verwendet(id);
    } catch (fehler) {
      console.error('[starkmacher] „zuletzt verwendet“ nicht gespeichert', fehler);
    }
  });
  ipcMain.handle('lebensmittel:fotoWaehlen', (e) =>
    alsAntwort(async () => {
      const fenster = BrowserWindow.fromWebContents(e.sender);
      const optionen: Electron.OpenDialogOptions = {
        title: 'Foto wählen',
        buttonLabel: 'Dieses Foto nehmen',
        properties: ['openFile'],
        filters: BILD_FILTER,
      };
      const wahl = fenster ? await dialog.showOpenDialog(fenster, optionen) : await dialog.showOpenDialog(optionen);
      const pfad = wahl.filePaths[0];
      if (wahl.canceled || !pfad) return null;
      return fotoEinlesen(pfad, dienst.fotoOrdner, sehen);
    }),
  );
  ipcMain.handle('lebensmittel:fotoLesen', (_e, name: unknown) => alsAntwort(() => fotoLesen(name, dienst.fotoOrdner)));
  ipcMain.on('lebensmittel:fotoVerwerfen', (_e, name: unknown) => fotoEntfernen(name, dienst.fotoOrdner));

  ipcMain.handle('daten:laden', () => dienst.laden());
  ipcMain.handle('daten:speichern', (_e, aenderung: Aenderung) => alsAntwort(() => dienst.speichern(aenderung)));
  ipcMain.on('daten:speichernSofort', (e, aenderung: Aenderung) => {
    try {
      dienst.speichern(aenderung);
      e.returnValue = true;
    } catch (fehler) {
      console.error('[starkmacher] Speichern beim Schließen fehlgeschlagen', fehler);
      e.returnValue = false;
    }
  });

  ipcMain.handle('sicherung:zustand', () => sicherungen.zustand());
  ipcMain.handle('sicherung:erstellen', () => alsAntwort(() => sicherungen.erstellen()));
  ipcMain.handle('sicherung:liste', () => alsAntwort(() => sicherungen.liste()));
  ipcMain.handle('sicherung:wiederherstellen', (_e, name: unknown) =>
    alsAntwort(async () => {
      const ordner = await sicherungen.pruefen(name);
      // Der jetzige Stand wird vorher selbst gesichert – so lässt sich auch das Wiederherstellen rückgängig machen.
      await sicherungen.erstellen();
      return dienst.ersetzen(ordner);
    }),
  );
  ipcMain.handle('sicherung:ordnerWaehlen', (e) =>
    alsAntwort(async () => {
      const fenster = BrowserWindow.fromWebContents(e.sender);
      const optionen: Electron.OpenDialogOptions = {
        title: 'Ordner für Sicherungen wählen',
        buttonLabel: 'Diesen Ordner verwenden',
        defaultPath: sicherungen.ordner(),
        properties: ['openDirectory', 'createDirectory'],
      };
      const wahl = fenster ? await dialog.showOpenDialog(fenster, optionen) : await dialog.showOpenDialog(optionen);
      const ordner = wahl.filePaths[0];
      if (wahl.canceled || !ordner) return null;
      await sicherungen.ordnerSetzen(ordner);
      return sicherungen.zustand();
    }),
  );
  ipcMain.on('sicherung:ordnerZeigen', () => {
    void shell.openPath(sicherungen.ordner());
  });

  ipcMain.handle('programm:info', () => info);
}
