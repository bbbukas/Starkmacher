import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { MenueBefehl } from '@shared/api';

/** Deutsche Menüleiste. Befehle, die die Oberfläche betreffen, gehen als Nachricht an das Fenster. */
export function menueEinrichten(fenster: () => BrowserWindow | null): void {
  const senden = (befehl: MenueBefehl) => () => fenster()?.webContents.send('menue', befehl);

  const vorlage: MenuItemConstructorOptions[] = [
    {
      label: 'Starkmacher',
      submenu: [
        { label: 'Über Starkmacher', role: 'about' },
        { type: 'separator' },
        { label: 'Einstellungen …', accelerator: 'CmdOrCtrl+,', click: senden('einstellungen') },
        { type: 'separator' },
        { label: 'Dienste', role: 'services' },
        { type: 'separator' },
        { label: 'Starkmacher ausblenden', role: 'hide' },
        { label: 'Andere ausblenden', role: 'hideOthers' },
        { label: 'Alle einblenden', role: 'unhide' },
        { type: 'separator' },
        { label: 'Starkmacher beenden', role: 'quit' },
      ],
    },
    {
      label: 'Ablage',
      submenu: [
        { label: 'Mein Bedarf', accelerator: 'CmdOrCtrl+B', click: senden('bedarf') },
        { label: 'Sicherung jetzt erstellen', click: senden('sicherung-erstellen') },
        { type: 'separator' },
        { label: 'Fenster schließen', role: 'close' },
      ],
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { label: 'Widerrufen', role: 'undo' },
        { label: 'Wiederholen', role: 'redo' },
        { type: 'separator' },
        { label: 'Ausschneiden', role: 'cut' },
        { label: 'Kopieren', role: 'copy' },
        { label: 'Einsetzen', role: 'paste' },
        { label: 'Alles auswählen', role: 'selectAll' },
      ],
    },
    {
      label: 'Darstellung',
      submenu: [
        { label: 'Originalgröße', role: 'resetZoom' },
        { label: 'Vergrößern', role: 'zoomIn' },
        { label: 'Verkleinern', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Vollbild', role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' as const }, { label: 'Entwicklerwerkzeuge', role: 'toggleDevTools' as const }]),
      ],
    },
    {
      label: 'Fenster',
      submenu: [
        { label: 'Im Dock ablegen', role: 'minimize' },
        { label: 'Zoomen', role: 'zoom' },
        { type: 'separator' },
        { label: 'Alle nach vorne bringen', role: 'front' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(vorlage));
}
