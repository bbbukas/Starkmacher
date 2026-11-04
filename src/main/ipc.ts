/**
 * Verbindet die Oberfläche (über src/preload) mit Datenbaustein und Sicherungen.
 * Alles, was von der Oberfläche kommt, wird hier oder im Datenbaustein geprüft.
 */
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { Aenderung, Antwort, ProgrammInfo, SuchAnfrage } from '@shared/api';
import { StarkFehler } from '@shared/fehler';
import type { DatenDienst } from './daten/dienst';
import type { LebensmittelDienst } from './daten/lebensmittelDienst';
import type { TagebuchDienst } from './daten/tagebuchDienst';
import { fotoEinlesen, fotoEntfernen, fotoLesen } from './fotos';
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

export function ipcEinrichten(dienst: DatenDienst, lebensmittel: LebensmittelDienst, tagebuch: TagebuchDienst, sicherungen: Sicherungen, info: ProgrammInfo): void {
  ipcMain.handle('tagebuch:tag', (_e, datum: unknown) => alsAntwort(() => tagebuch.tag(datum)));
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
        filters: [{ name: 'Bilder', extensions: ['jpg', 'jpeg', 'png', 'heic', 'webp'] }],
      };
      const wahl = fenster ? await dialog.showOpenDialog(fenster, optionen) : await dialog.showOpenDialog(optionen);
      const pfad = wahl.filePaths[0];
      if (wahl.canceled || !pfad) return null;
      return fotoEinlesen(pfad, dienst.fotoOrdner);
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
