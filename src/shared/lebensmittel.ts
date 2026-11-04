/**
 * Lebensmittel aus dem BLS und eigene: wie sie aussehen, wie sie geprüft werden und was sie je Menge liefern.
 * Reine Rechnungen ohne Abhängigkeit vom Mac.
 *
 * Alle Werte sind je 100 g (oder je 100 ml, wenn `basis` es sagt). Ein fehlender Schlüssel heißt „keine Angabe“, nie null.
 */
import { barcodeGueltig } from './barcode';
import type { Bedarf, NaehrstoffZiel } from './bedarf';
import { umrechnungPruefen, type Umrechnung } from './einheiten';
import { StarkFehler } from './fehler';
import { NAEHRSTOFFE, naehrstoff, type GruppenId, type Naehrstoff } from './naehrstoffe';

export type Werte = Readonly<Record<string, number>>;
export type Basis = 'g' | 'ml';
/** bls: unverändert aus dem BLS. eigen: selbst angelegt. version: persönliche Version eines BLS-Lebensmittels. rezept und teller: ein eigenes Rezept oder ein eigener Teller in einer Auswahl. */
export type Herkunft = 'bls' | 'eigen' | 'version' | 'rezept' | 'teller';
export type SuchFilter = 'alle' | 'bls' | 'eigene';

export const BLS_PREFIX = 'bls:';
export const EIGEN_PREFIX = 'eigen:';
export const blsId = (code: string) => `${BLS_PREFIX}${code}`;
export const istBlsId = (id: string) => id.startsWith(BLS_PREFIX);
export const blsCodeAus = (id: string) => id.slice(BLS_PREFIX.length);

/** Aus einem ähnlichen BLS-Lebensmittel übernommene Werte, getrennt von den eigenen. */
export interface Schaetzung {
  code: string;
  name: string;
  werte: Werte;
}

export interface Lebensmittel {
  id: string;
  herkunft: Herkunft;
  name: string;
  marke: string | null;
  /** Lebensmittelgruppe des BLS (erster Buchstabe des Codes), bei eigenen null. */
  gruppe: string | null;
  basis: Basis;
  werte: Werte;
  /** Codes, die nur in Spuren vorkommen (der Wert steht dann auf 0). */
  spuren: readonly string[];
  /** Nur bei eigenen Lebensmitteln und Versionen. */
  schaetzung: Schaetzung | null;
  /** Freier Zucker je 100 g, geschätzt. Null: Zucker ist nicht bekannt. */
  freierZuckerG: number | null;
  /** Haken „nur natürlicher Zucker“: Bei eigenen Lebensmitteln zählt sonst der ganze Zucker als frei. */
  nurNatuerlicherZucker: boolean;
  /** Packungsgröße in g bzw. ml, je nach Basis. */
  packung: number | null;
  /** Dateiname im Fotoordner. */
  foto: string | null;
  /** Einmal gespeichert, merkt sich das Lebensmittel seinen Barcode. */
  barcode?: string | null;
  /** Hinweise zu Korrekturen des Max Rubner-Instituts. */
  hinweise: readonly string[];
  anmerkung: string | null;
  umrechnung: Umrechnung;
  /** Eigene Umrechnung gespeichert? */
  umrechnungAngepasst: boolean;
}

/** Eine Zeile in der Trefferliste. */
export interface LebensmittelKurz {
  id: string;
  herkunft: Herkunft;
  name: string;
  marke: string | null;
  gruppe: string | null;
  kcal: number | null;
  eiweiss: number | null;
  fett: number | null;
  kohlenhydrate: number | null;
}

/** Was das Formular zum Speichern schickt. */
export interface LebensmittelEingabe {
  /** Fehlt bei neuen Lebensmitteln. Mit `bls:CODE` entsteht oder ändert sich die persönliche Version. */
  id?: string;
  name: string;
  marke: string | null;
  basis: Basis;
  werte: Werte;
  schaetzung: Schaetzung | null;
  nurNatuerlicherZucker: boolean;
  packung: number | null;
  foto: string | null;
  barcode?: string | null;
}

export const GRUPPEN_BLS: Readonly<Record<string, string>> = {
  B: 'Brot und Brötchen',
  C: 'Getreide',
  D: 'Kuchen und Gebäck',
  E: 'Eier und Teigwaren',
  F: 'Obst',
  G: 'Gemüse',
  H: 'Hülsenfrüchte, Nüsse, Samen',
  K: 'Kartoffeln und Pilze',
  M: 'Milch und Käse',
  N: 'Alkoholfreie Getränke',
  P: 'Alkoholische Getränke',
  Q: 'Fette und Öle',
  R: 'Würzen und Backzutaten',
  S: 'Süßwaren',
  T: 'Fisch',
  U: 'Fleisch',
  V: 'Geflügel, Wild, Innereien',
  W: 'Wurst und Schinken',
  X: 'Gerichte',
  Y: 'Gerichte',
};

/** Die Zeilen, die auf Packungen stehen. Das Formular zeigt sie zuerst. */
export const PACKUNGS_CODES = ['ENERCC', 'FAT', 'FASAT', 'CHO', 'SUGAR', 'FIBT', 'PROT625', 'NACL'] as const;

/** Diese Werte stehen auf der Packung oder folgen daraus. Eine Schätzung ersetzt sie nie. */
const NIE_GESCHAETZT = new Set<string>(['ENERCC', 'ENERCJ', 'FAT', 'FASAT', 'CHO', 'SUGAR', 'PROT625', 'NACL', 'NA', 'WATER', 'ASH']);

const KJ_JE_KCAL = 4.184;
const SALZ_JE_MG_NATRIUM = 2.5 / 1000; // BLS-Dokumentation: Salz = Natrium × 2,5

/** Grenzen je 100 g oder 100 ml, grob: Sie fangen Tippfehler ab, nicht jede Unstimmigkeit. */
function hoechstJe100(n: Naehrstoff): number {
  switch (n.einheit) {
    case 'kcal':
      return 1000;
    case 'kJ':
      return 4200;
    case 'g':
      return 100;
    case 'mg':
      return 100_000;
    default:
      return 100_000_000;
  }
}

export function wertErlaubt(code: string, wert: number): boolean {
  const n = naehrstoff(code);
  return n !== undefined && Number.isFinite(wert) && wert >= 0 && wert <= hoechstJe100(n);
}

export const packungErlaubt = (wert: number) => Number.isFinite(wert) && wert > 0 && wert <= 100_000;

const FOTO_NAME = /^[0-9a-f-]{36}\.jpg$/;
export const fotoNameErlaubt = (name: unknown): name is string => typeof name === 'string' && FOTO_NAME.test(name);

function werteLesen(roh: unknown, feld: string): Record<string, number> {
  if (typeof roh !== 'object' || roh === null) throw new StarkFehler('UNGUELTIG', `${feld} stimmen nicht.`);
  const aus: Record<string, number> = {};
  for (const [code, wert] of Object.entries(roh)) {
    if (typeof wert !== 'number' || !wertErlaubt(code, wert)) {
      const name = naehrstoff(code)?.name ?? code;
      throw new StarkFehler('UNGUELTIG', `Der Wert für ${name} stimmt nicht.`);
    }
    aus[code] = wert;
  }
  return aus;
}

/** Alles, was von der Oberfläche kommt, wird hier geprüft, bevor es gespeichert wird. */
export function eingabePruefen(roh: unknown): LebensmittelEingabe {
  if (typeof roh !== 'object' || roh === null) throw new StarkFehler('UNGUELTIG', 'Das Lebensmittel stimmt nicht.');
  const e = roh as Record<string, unknown>;
  const name = typeof e.name === 'string' ? e.name.trim() : '';
  if (name === '' || name.length > 160) throw new StarkFehler('UNGUELTIG', 'Bitte gib dem Lebensmittel einen Namen.');
  const marke = typeof e.marke === 'string' && e.marke.trim() !== '' ? e.marke.trim().slice(0, 100) : null;
  const basis: Basis = e.basis === 'ml' ? 'ml' : 'g';
  const packung = e.packung === null || e.packung === undefined ? null : Number(e.packung);
  if (packung !== null && !packungErlaubt(packung)) throw new StarkFehler('UNGUELTIG', 'Die Packungsgröße stimmt nicht.');
  if (e.foto !== null && e.foto !== undefined && !fotoNameErlaubt(e.foto)) throw new StarkFehler('UNGUELTIG', 'Das Foto stimmt nicht.');
  const barcode = typeof e.barcode === 'string' && e.barcode.trim() !== '' ? e.barcode.trim() : null;
  if (barcode !== null && !barcodeGueltig(barcode)) throw new StarkFehler('UNGUELTIG', 'Der Barcode stimmt nicht. Bitte prüf die Ziffern.');
  let schaetzung: Schaetzung | null = null;
  if (e.schaetzung !== null && e.schaetzung !== undefined) {
    const s = e.schaetzung as Record<string, unknown>;
    if (typeof s.code !== 'string' || typeof s.name !== 'string') throw new StarkFehler('UNGUELTIG', 'Die Schätzung stimmt nicht.');
    schaetzung = { code: s.code, name: s.name, werte: werteLesen(s.werte, 'Die Schätzwerte') };
  }
  const id = typeof e.id === 'string' && (e.id.startsWith(BLS_PREFIX) || e.id.startsWith(EIGEN_PREFIX)) ? e.id : undefined;
  return {
    ...(id ? { id } : {}),
    name,
    marke,
    basis,
    werte: werteLesen(e.werte, 'Die Nährwerte'),
    schaetzung,
    nurNatuerlicherZucker: e.nurNatuerlicherZucker === true,
    packung,
    foto: (e.foto as string | null | undefined) ?? null,
    barcode,
  };
}

export { umrechnungPruefen };

/** Eigene Lebensmittel: Der ganze Zucker zählt als frei, außer der Haken sagt „nur natürlicher Zucker“. */
export function freierZuckerEigen(werte: Werte, nurNatuerlich: boolean): number | null {
  const zucker = werte.SUGAR;
  if (zucker === undefined) return null;
  return nurNatuerlich ? 0 : zucker;
}

/**
 * Alle bekannten Werte je 100 g: eigene Angaben, dann die übernommene Schätzung, dazu was sich daraus
 * ergibt (Kilojoule aus Kalorien, Natrium aus Salz und umgekehrt). Bei Angaben je 100 ml rechnet die Dichte um.
 */
export function werteJe100g(lm: Pick<Lebensmittel, 'werte' | 'schaetzung' | 'basis' | 'umrechnung'>): Record<string, number> {
  const faktor = lm.basis === 'ml' ? 1 / lm.umrechnung.dichte : 1;
  const alle: Record<string, number> = {};
  for (const [code, wert] of Object.entries(lm.schaetzung?.werte ?? {})) alle[code] = wert * faktor;
  for (const [code, wert] of Object.entries(lm.werte)) alle[code] = wert * faktor;
  if (alle.ENERCC !== undefined && alle.ENERCJ === undefined) alle.ENERCJ = alle.ENERCC * KJ_JE_KCAL;
  if (alle.ENERCJ !== undefined && alle.ENERCC === undefined) alle.ENERCC = alle.ENERCJ / KJ_JE_KCAL;
  if (alle.NACL !== undefined && alle.NA === undefined) alle.NA = alle.NACL / SALZ_JE_MG_NATRIUM;
  if (alle.NA !== undefined && alle.NACL === undefined) alle.NACL = alle.NA * SALZ_JE_MG_NATRIUM;
  return alle;
}

/** Was von einem BLS-Lebensmittel als Schätzung übernommen wird: alles, was das eigene nicht selbst angibt und nicht auf Packungen steht. */
export function schaetzungAus(quelle: { code: string; name: string; werte: Werte }, eigene: Werte): Schaetzung {
  const werte: Record<string, number> = {};
  for (const [code, wert] of Object.entries(quelle.werte)) {
    if (!NIE_GESCHAETZT.has(code) && eigene[code] === undefined) werte[code] = wert;
  }
  return { code: quelle.code, name: quelle.name, werte };
}

export interface NaehrwertZeile {
  naehrstoff: Naehrstoff;
  /** Menge je 100 g. Null: keine Angabe. */
  je100g: number | null;
  /** Menge in der gewählten Menge. Null: keine Angabe. */
  jeMenge: number | null;
  /** Anteil am Tagesbedarf für die gewählte Menge in Prozent. Null: kein Ziel oder keine Angabe. */
  anteil: number | null;
  /** Der Wert stammt aus der übernommenen Schätzung. */
  geschaetzt: boolean;
  spur: boolean;
  ziel: NaehrstoffZiel | null;
}

/** Der Tagesbedarf, an dem sich der Anteil misst: das Minimum, sonst die Obergrenze. */
const bezugswert = (ziel: NaehrstoffZiel | undefined) => (ziel ? (ziel.von ?? ziel.hoechst ?? null) : null);

export function anteilAmBedarf(menge: number, ziel: NaehrstoffZiel | undefined): number | null {
  const bezug = bezugswert(ziel);
  return bezug && bezug > 0 ? (menge / bezug) * 100 : null;
}

/** Alle Nährstoffe eines Lebensmittels für die gewählte Menge in Gramm. */
export function naehrwertZeilen(lm: Lebensmittel, gramm: number, bedarf: Bedarf | null): NaehrwertZeile[] {
  const werte = werteJe100g(lm);
  const eigeneCodes = new Set(Object.keys(lm.werte));
  return NAEHRSTOFFE.map((n) => {
    const je100 = werte[n.code] ?? null;
    const jeMenge = je100 === null ? null : (je100 * gramm) / 100;
    const ziel = bedarf?.ziele[n.code];
    return {
      naehrstoff: n,
      je100g: je100,
      jeMenge,
      anteil: jeMenge === null ? null : anteilAmBedarf(jeMenge, ziel),
      geschaetzt: !eigeneCodes.has(n.code) && lm.schaetzung?.werte[n.code] !== undefined,
      spur: lm.spuren.includes(n.code),
      ziel: ziel ?? null,
    };
  });
}

export function zeilenDerGruppe(zeilen: readonly NaehrwertZeile[], gruppe: GruppenId): NaehrwertZeile[] {
  return zeilen.filter((z) => z.naehrstoff.gruppe === gruppe);
}

/** Die Quellenangabe, die zu jedem BLS-Lebensmittel gehört (Bauauftrag 5.1). */
export const BLS_QUELLE = 'Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 – Deutsche Nährstoffdatenbank. DOI 10.25826/Data20251217-134202-0. Lizenz CC BY 4.0.';
/** CC BY verlangt, Änderungen anzugeben. */
export const BLS_AENDERUNGEN =
  'Starkmacher übernimmt die Korrekturen aus dem Erratum des Instituts (Stand August 2026), setzt Werte ohne belastbare Angabe auf „keine Angabe“ und ergänzt eine eigene Schätzung des freien Zuckers.';
