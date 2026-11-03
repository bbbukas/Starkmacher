/**
 * Was die Oberfläche über window.starkmacher (src/preload) erreichen kann.
 * Mehr nicht: kein Dateizugriff, kein Netzwerk.
 */
import type { FehlerCode } from './fehler';
import type { Gewicht, Profil, Stand } from './profil';

export type Antwort<T> = { ok: true; wert: T } | { ok: false; code: FehlerCode; meldung: string };

/** Ergebnis von „Daten laden“. Ist die Datei kaputt, kommt der Grund mit – Speichern ist dann gesperrt. */
export type LadeErgebnis = { ok: true; stand: Stand } | { ok: false; code: FehlerCode; meldung: string };

export interface Aenderung {
  profil?: Profil;
  gewicht?: Gewicht;
}

export interface SicherungsEintrag {
  /** Name des Ordners im Sicherungsordner, z. B. „Starkmacher-Sicherung-2026-11-03_21-40-05“. */
  name: string;
  /** Zeitpunkt aus dem Namen (ISO, Ortszeit ohne Zone). */
  zeit: string;
  groesse: number;
  fotos: number;
  lesbar: boolean;
}

export interface SicherungsZustand {
  ordner: string;
  /** true, solange Lukas keinen eigenen Ordner gewählt hat (Kopien liegen dann nur auf diesem Mac). */
  standardOrdner: boolean;
  /** Liegt der Ordner in iCloud? Dann wird dort nicht gesichert. */
  imIcloud: boolean;
  letzteSicherung: SicherungsEintrag | null;
  anzahl: number;
  /** Fehler der letzten Sicherung (z. B. Ordner nicht erreichbar) – oder null. */
  fehler: string | null;
}

export interface ProgrammInfo {
  version: string;
  datenOrdner: string;
  entwicklung: boolean;
}

export type MenueBefehl = 'einstellungen' | 'bedarf' | 'sicherung-erstellen';

export interface StarkmacherApi {
  daten: {
    laden(): Promise<LadeErgebnis>;
    speichern(aenderung: Aenderung): Promise<Antwort<Stand>>;
    /** Beim Schließen des Fensters: speichert sofort und wartet darauf. */
    speichernSofort(aenderung: Aenderung): boolean;
  };
  sicherung: {
    zustand(): Promise<SicherungsZustand>;
    erstellen(): Promise<Antwort<SicherungsEintrag | null>>;
    liste(): Promise<Antwort<SicherungsEintrag[]>>;
    wiederherstellen(name: string): Promise<Antwort<Stand>>;
    ordnerWaehlen(): Promise<Antwort<SicherungsZustand | null>>;
    ordnerZeigen(): void;
  };
  programm: {
    info(): Promise<ProgrammInfo>;
  };
  beiMenue(rueckruf: (befehl: MenueBefehl) => void): () => void;
}

/** Name der Sicherungsordner – nur solche Ordner räumt Starkmacher je auf. */
export const SICHERUNG_MUSTER = /^Starkmacher-Sicherung-(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:-(\d+))?$/;
export const SICHERUNGEN_BEHALTEN = 30;
