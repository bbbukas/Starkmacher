/**
 * Der Datenzugriff als eigener Baustein: Wer Daten braucht, kennt nur diese
 * Schnittstelle. So lässt sich der Speicherort später austauschen, zum Beispiel
 * gegen eine Datenbank auf einem Server in der EU.
 */
import type { Umrechnung } from '@shared/einheiten';
import type { LebensmittelEingabe } from '@shared/lebensmittel';
import type { Hashtag, Rezept } from '@shared/rezepte';
import type { Gewicht, Profil, Stand } from '@shared/profil';
import type { TagebuchEintrag } from '@shared/tagebuch';
import type { Teller } from '@shared/teller';

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
  /** Die Einträge von bis, beide Tage eingeschlossen. */
  tagebuchZeitraum(von: string, bis: string): TagebuchEintrag[];
  tagebuchEintrag(id: string): TagebuchEintrag | null;
  tagebuchSpeichern(eintrag: TagebuchEintrag): void;
  tagebuchLoeschen(id: string): void;
  /** Kennungen der zuletzt gegessenen Lebensmittel, das neueste zuerst, jedes einmal. */
  tagebuchZuletzt(anzahl: number): string[];
  rezepteListe(): Rezept[];
  rezeptHolen(id: string): Rezept | null;
  rezeptSpeichern(rezept: Rezept): void;
  rezeptLoeschen(id: string): void;
  hashtagsListe(): Hashtag[];
  hashtagSpeichern(hashtag: Hashtag): void;
  /** Nimmt den Hashtag auch aus allen Rezepten, alles auf einmal oder gar nicht. */
  hashtagLoeschen(id: string): void;
  tellerListe(): Teller[];
  tellerHolen(id: string): Teller | null;
  tellerSpeichern(teller: Teller): void;
  tellerLoeschen(id: string): void;
  /** Gibt es schon etwas, das sich zu sichern lohnt? */
  hatDaten(): boolean;
  /** Bringt die Datenbank auf den neuesten Aufbau. */
  migrieren(): void;
  laden(): Stand;
  /** Speichert alles auf einmal oder gar nichts. */
  speichern(aenderung: { profil?: Profil; gewicht?: Gewicht; gewichtWeg?: string }): void;
  /** Schreibt eine vollständige, in sich stimmige Kopie, auch im laufenden Betrieb. */
  kopieSchreiben(zielDatei: string): void;
  schliessen(): void;
}
