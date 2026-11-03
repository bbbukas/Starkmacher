/**
 * Verbindet die Oberfläche (über src/preload) mit Datenbaustein und Sicherungen.
 * Alles, was von der Oberfläche kommt, wird hier oder im Datenbaustein geprüft.
 */
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { Aenderung, Antwort, ProgrammInfo } from '@shared/api';
import { StarkFehler } from '@shared/fehler';
import type { DatenDienst } from './daten/dienst';
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

export function ipcEinrichten(dienst: DatenDienst, sicherungen: Sicherungen, info: ProgrammInfo): void {
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
