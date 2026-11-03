/**
 * Der Datenzugriff als eigener Baustein: Wer Daten braucht, kennt nur diese
 * Schnittstelle. So lässt sich der Speicherort später austauschen, zum Beispiel
 * gegen eine Datenbank auf einem Server in der EU.
 */
import type { Gewicht, Profil, Stand } from '@shared/profil';

export interface Datenquelle {
  /** Gibt es schon etwas, das sich zu sichern lohnt? */
  hatDaten(): boolean;
  /** Bringt die Datenbank auf den neuesten Aufbau. */
  migrieren(): void;
  laden(): Stand;
  /** Speichert alles auf einmal oder gar nichts. */
  speichern(aenderung: { profil?: Profil; gewicht?: Gewicht }): void;
  /** Schreibt eine vollständige, in sich stimmige Kopie, auch im laufenden Betrieb. */
  kopieSchreiben(zielDatei: string): void;
  schliessen(): void;
}
