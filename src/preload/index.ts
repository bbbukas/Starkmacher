/**
 * Die schmale Brücke zwischen Oberfläche und Hauptprozess. Die Oberfläche
 * sieht nur window.starkmacher – kein Dateizugriff, kein Netzwerk, kein Node.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { MenueBefehl, StarkmacherApi } from '@shared/api';

const api: StarkmacherApi = {
  tagebuch: {
    tag: (datum) => ipcRenderer.invoke('tagebuch:tag', datum),
    eintragen: (eingabe) => ipcRenderer.invoke('tagebuch:eintragen', eingabe),
    aendern: (id, aenderung) => ipcRenderer.invoke('tagebuch:aendern', id, aenderung),
    loeschen: (id) => ipcRenderer.invoke('tagebuch:loeschen', id),
    zuletzt: () => ipcRenderer.invoke('tagebuch:zuletzt'),
    vorschlaege: (datum) => ipcRenderer.invoke('tagebuch:vorschlaege', datum),
  },
  lebensmittel: {
    suchen: (anfrage) => ipcRenderer.invoke('lebensmittel:suchen', anfrage),
    holen: (id) => ipcRenderer.invoke('lebensmittel:holen', id),
    speichern: (eingabe) => ipcRenderer.invoke('lebensmittel:speichern', eingabe),
    loeschen: (id) => ipcRenderer.invoke('lebensmittel:loeschen', id),
    aehnliche: (anfrage) => ipcRenderer.invoke('lebensmittel:aehnliche', anfrage),
    umrechnungSpeichern: (id, umrechnung) => ipcRenderer.invoke('lebensmittel:umrechnungSpeichern', id, umrechnung),
    verwendet: (id) => ipcRenderer.send('lebensmittel:verwendet', id),
    fotoWaehlen: () => ipcRenderer.invoke('lebensmittel:fotoWaehlen'),
    fotoLesen: (name) => ipcRenderer.invoke('lebensmittel:fotoLesen', name),
    fotoVerwerfen: (name) => ipcRenderer.send('lebensmittel:fotoVerwerfen', name),
  },
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
