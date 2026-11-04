/**
 * Was die Oberfläche über window.starkmacher (src/preload) erreichen kann.
 * Mehr nicht: kein Dateizugriff, kein Netzwerk.
 */
import type { KopieProdukt } from './barcode';
import type { Umrechnung } from './einheiten';
import type { FehlerCode } from './fehler';
import type { Lebensmittel, LebensmittelEingabe, LebensmittelKurz, Schaetzung, SuchFilter, Werte } from './lebensmittel';
import type { GeleseneTabelle } from './naehrwertFoto';
import type { Gewicht, Profil, Stand } from './profil';
import type { GeleseneZutat, GelesenesRezept } from './rezeptFoto';
import type { Hashtag, RezeptAnfrage, RezeptAnsicht, RezeptEingabe, RezeptKurz, RezeptZutat, ZutatStand } from './rezepte';
import type { EintragAenderung, EintragEingabe, Mahlzeit, TagebuchEintrag } from './tagebuch';
import type { PostenStand, TellerAnsicht, TellerEingabe, TellerKurz, TellerPosten } from './teller';
import type { Vorschlag } from './vorschlaege';

export type FotoZweck = 'lebensmittel' | 'rezept';

export type BarcodeTreffer =
  /** Das hat Lukas schon einmal gespeichert. */
  | { art: 'eigen'; code: string; id: string; name: string }
  | { art: 'kopie'; code: string; produkt: KopieProdukt }
  | { art: 'keiner'; code: string; kopieDa: boolean };

/** Eine Zutat vom Foto mit dem vorgeschlagenen Eintrag und den Alternativen. */
export interface ZutatVorschlag extends GeleseneZutat {
  lebensmittelId: string | null;
  lebensmittelName: string | null;
  alternativen: { id: string; name: string }[];
}

export type FotoErgebnis =
  | { zweck: 'lebensmittel'; foto: string; tabelle: GeleseneTabelle | null; barcode: BarcodeTreffer | null }
  | { zweck: 'rezept'; foto: string; rezept: Omit<GelesenesRezept, 'zutaten'> & { zutaten: ZutatVorschlag[] } };

export type HandyEreignis = { art: 'foto'; ergebnis: FotoErgebnis } | { art: 'fehler'; meldung: string } | { art: 'ende' };

export interface HandyVerbindung {
  /** Die Einmal-Adresse für den QR-Code. */
  adresse: string;
}

export interface TagAntwort {
  datum: string;
  eintraege: TagebuchEintrag[];
  /** Alle Einträge der Woche dieses Tages, Montag bis Sonntag, für den Wochenstand. */
  woche: TagebuchEintrag[];
}

export interface VorschlagsAntwort {
  vorschlaege: Vorschlag[];
  /** Die Kalorien für heute sind ausgeschöpft: Dann passt kaum noch etwas, und das ist in Ordnung. */
  kalorienErreicht: boolean;
}

export type Antwort<T> = { ok: true; wert: T } | { ok: false; code: FehlerCode; meldung: string };

/** Ergebnis von „Daten laden“. Ist die Datei kaputt, kommt der Grund mit – Speichern ist dann gesperrt. */
export type LadeErgebnis = { ok: true; stand: Stand } | { ok: false; code: FehlerCode; meldung: string };

export interface Aenderung {
  profil?: Profil;
  gewicht?: Gewicht;
  /** Das Datum eines Gewichts, das wegfallen soll. */
  gewichtWeg?: string;
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

export interface SuchAnfrage {
  text: string;
  filter: SuchFilter;
}

export interface SuchErgebnis {
  zuletzt: LebensmittelKurz[];
  treffer: LebensmittelKurz[];
  /** Alle Treffer, auch die, die nicht mehr in die Liste passen. */
  gesamt: number;
  grundbestandDa: boolean;
}

/** Ein Vorschlag für die Schätzung fehlender Werte. */
export interface AehnlichesLebensmittel {
  code: string;
  name: string;
  gruppe: string | null;
  /** Packungswerte zum Vergleichen. */
  vergleich: Werte;
  /** Was beim Übernehmen dazukäme. */
  schaetzung: Schaetzung;
}

export interface StarkmacherApi {
  teller: {
    liste(text: string): Promise<Antwort<TellerKurz[]>>;
    holen(id: string): Promise<Antwort<TellerAnsicht | null>>;
    speichern(eingabe: TellerEingabe): Promise<Antwort<TellerAnsicht>>;
    loeschen(id: string): Promise<Antwort<null>>;
    /** Nährwerte, während der Teller noch entsteht. */
    vorschau(posten: TellerPosten[]): Promise<Antwort<PostenStand[]>>;
  };
  rezepte: {
    liste(anfrage: RezeptAnfrage): Promise<Antwort<RezeptKurz[]>>;
    holen(id: string): Promise<Antwort<RezeptAnsicht | null>>;
    speichern(eingabe: RezeptEingabe): Promise<Antwort<RezeptAnsicht>>;
    loeschen(id: string): Promise<Antwort<null>>;
    /** Nährwerte für das Formular, bevor das Rezept gespeichert ist. */
    vorschau(zutaten: RezeptZutat[]): Promise<Antwort<ZutatStand[]>>;
    hashtags(): Promise<Antwort<Hashtag[]>>;
    hashtagSpeichern(hashtag: { id?: string; name: string; farbe?: string }): Promise<Antwort<Hashtag>>;
    hashtagLoeschen(id: string): Promise<Antwort<null>>;
  };
  /** Fotos auswerten: gewählt, hineingezogen oder vom Handy. Das Ergebnis geht immer auf eine Prüfseite. */
  fotos: {
    /** Null: abgebrochen. */
    waehlen(zweck: FotoZweck): Promise<Antwort<FotoErgebnis | null>>;
    einlesen(daten: Uint8Array, zweck: FotoZweck): Promise<Antwort<FotoErgebnis>>;
    barcode(code: string): Promise<Antwort<BarcodeTreffer>>;
    handyOeffnen(zweck: FotoZweck): Promise<Antwort<HandyVerbindung>>;
    handySchliessen(): void;
    /** Ein Foto vom Handy ist da, oder die Verbindung hat sich von selbst geschlossen. */
    beiHandy(rueckruf: (ereignis: HandyEreignis) => void): () => void;
  };
  tagebuch: {
    tag(datum: string): Promise<Antwort<TagAntwort>>;
    /** Alle Einträge von bis, für den Rückblick. */
    zeitraum(von: string, bis: string): Promise<Antwort<TagebuchEintrag[]>>;
    eintragen(eingabe: EintragEingabe): Promise<Antwort<TagebuchEintrag>>;
    /** Trägt ein, was gerade auf dem Teller liegt, gespeichert oder nicht. */
    tellerEintragen(eingabe: { datum: string; mahlzeit: Mahlzeit; menge: number; name: string; posten: TellerPosten[]; tellerId?: string }): Promise<Antwort<TagebuchEintrag>>;
    aendern(id: string, aenderung: EintragAenderung): Promise<Antwort<TagebuchEintrag>>;
    loeschen(id: string): Promise<Antwort<null>>;
    zuletzt(): Promise<Antwort<LebensmittelKurz[]>>;
    vorschlaege(datum: string): Promise<Antwort<VorschlagsAntwort>>;
  };
  lebensmittel: {
    suchen(anfrage: SuchAnfrage): Promise<Antwort<SuchErgebnis>>;
    holen(id: string): Promise<Antwort<Lebensmittel | null>>;
    speichern(eingabe: LebensmittelEingabe): Promise<Antwort<Lebensmittel>>;
    /** Löscht ein eigenes Lebensmittel oder setzt eine persönliche Version auf das Original zurück. */
    loeschen(id: string): Promise<Antwort<null>>;
    aehnliche(anfrage: { name: string; werte: Werte }): Promise<Antwort<AehnlichesLebensmittel[]>>;
    /** Null setzt auf die Standardwerte zurück. */
    umrechnungSpeichern(id: string, umrechnung: Umrechnung | null): Promise<Antwort<Lebensmittel>>;
    verwendet(id: string): void;
    /** Öffnet die Dateiauswahl und gibt den Namen im Fotoordner, null bei Abbruch. */
    fotoWaehlen(): Promise<Antwort<string | null>>;
    fotoLesen(name: string): Promise<Antwort<string | null>>;
    /** Ein gewähltes, aber nicht gespeichertes Foto wieder entfernen. */
    fotoVerwerfen(name: string): void;
  };
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
