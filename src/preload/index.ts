/**
 * Die schmale Brücke zwischen Oberfläche und Hauptprozess. Die Oberfläche
 * sieht nur window.starkmacher – kein Dateizugriff, kein Netzwerk, kein Node.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { MenueBefehl, StarkmacherApi } from '@shared/api';

const api: StarkmacherApi = {
  daten: {
    laden: () => ipcRenderer.invoke('daten:laden'),
    speichern: (aenderung) => ipcRenderer.invoke('daten:speichern', aenderung),
    speichernSofort: (aenderung) => ipcRenderer.sendSync('daten:speichernSofort', aenderung) === true,
  },
  sicherung: {
    zustand: () => ipcRenderer.invoke('sicherung:zustand'),
    erstellen: () => ipcRenderer.invoke('sicherung:erstellen'),
    liste: () => ipcRenderer.invoke('sicherung:liste'),
    wiederherstellen: (name) => ipcRenderer.invoke('sicherung:wiederherstellen', name),
    ordnerWaehlen: () => ipcRenderer.invoke('sicherung:ordnerWaehlen'),
    ordnerZeigen: () => ipcRenderer.send('sicherung:ordnerZeigen'),
  },
  programm: {
    info: () => ipcRenderer.invoke('programm:info'),
  },
  beiMenue: (rueckruf) => {
    const hoerer = (_e: IpcRendererEvent, befehl: MenueBefehl) => rueckruf(befehl);
    ipcRenderer.on('menue', hoerer);
    return () => ipcRenderer.removeListener('menue', hoerer);
  },
};

contextBridge.exposeInMainWorld('starkmacher', api);
