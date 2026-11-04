/**
 * Der Datenzugriff als eigener Baustein: Wer Daten braucht, kennt nur diese
 * Schnittstelle. So lässt sich der Speicherort später austauschen, zum Beispiel
 * gegen eine Datenbank auf einem Server in der EU.
 */
import type { Umrechnung } from '@shared/einheiten';
import type { LebensmittelEingabe } from '@shared/lebensmittel';
import type { Gewicht, Profil, Stand } from '@shared/profil';
import type { TagebuchEintrag } from '@shared/tagebuch';

/** Ein eigenes Lebensmittel oder eine persönliche Version, wie es gespeichert ist. */
export type GespeichertesLebensmittel = Omit<LebensmittelEingabe, 'id'> & { id: string; geaendertAm: string };

export interface Datenquelle {
  eigeneListe(): GespeichertesLebensmittel[];
  eigenesHolen(id: string): GespeichertesLebensmittel | null;
  eigenesSpeichern(lebensmittel: GespeichertesLebensmittel): void;
  eigenesLoeschen(id: string): void;
  /** Eigene Umrechnung eines Lebensmittels, null: Es gelten die Standardwerte. */
  umrechnungHolen(id: string): Umrechnung | null;
  umrechnungSpeichern(id: string, umrechnung: Umrechnung | null): void;
  verwendetMerken(id: string, zeit: string): void;
  /** Kennungen, die zuletzt verwendeten zuerst. */
  zuletztVerwendet(anzahl: number): string[];
  /** Die Einträge eines Tages in der Reihenfolge, in der sie eingetragen wurden. */
  tagebuchTag(datum: string): TagebuchEintrag[];
  tagebuchEintrag(id: string): TagebuchEintrag | null;
  tagebuchSpeichern(eintrag: TagebuchEintrag): void;
  tagebuchLoeschen(id: string): void;
  /** Kennungen der zuletzt gegessenen Lebensmittel, das neueste zuerst, jedes einmal. */
  tagebuchZuletzt(anzahl: number): string[];
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
