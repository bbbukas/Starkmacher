/**
 * Das Profil und alles, was daran hängt. Vorerst gibt es genau ein Profil. Weil
 * alle persönlichen Daten daran hängen, wären später mehrere Nutzer möglich.
 */
import { StarkFehler } from './fehler';
import { NAEHRSTOFFE } from './naehrstoffe';

export const PROFIL_ID = 'ich';

export type Geschlecht = 'weiblich' | 'maennlich';
export type Aktivitaet = 'sitzend' | 'wechselnd' | 'gehend' | 'anstrengend';
export type Ziel = 'abnehmen' | 'halten' | 'aufbauen' | 'eigene';
export type Tempo = 'sanft' | 'mittel';
export type Stueckware = 'groesse' | 'gramm';

/** Was zuletzt als Bedarf galt, damit Starkmacher sagen kann, wenn er sich ändert. */
export interface ZielStand {
  kcal: number;
  eiweissG: number;
}

export interface Profil {
  id: string;
  geschlecht: Geschlecht | null;
  geburtsjahr: number | null;
  groesseCm: number | null;
  aktivitaet: Aktivitaet | null;
  sport: boolean;
  ziel: Ziel | null;
  tempo: Tempo;
  eigeneKcal: number | null;
  eigeneEiweissG: number | null;
  eigeneFettG: number | null;
  eigeneKohlenhydrateG: number | null;
  /** Ist „Mein Bedarf“ beim ersten Start einmal durchlaufen? */
  einrichtungFertig: boolean;
  stueckware: Stueckware;
  /** Codes der Nährstoffe, die Lukas ausgeblendet hat. */
  ausgeblendet: string[];
  letzteZiele: ZielStand | null;
}

export interface Gewicht {
  /** JJJJ-MM-TT */
  datum: string;
  kg: number;
}

export interface Stand {
  profil: Profil;
  gewichte: Gewicht[];
}

export function leeresProfil(): Profil {
  return {
    id: PROFIL_ID,
    geschlecht: null,
    geburtsjahr: null,
    groesseCm: null,
    aktivitaet: null,
    sport: false,
    ziel: null,
    tempo: 'sanft',
    eigeneKcal: null,
    eigeneEiweissG: null,
    eigeneFettG: null,
    eigeneKohlenhydrateG: null,
    einrichtungFertig: false,
    stueckware: 'groesse',
    ausgeblendet: [],
    letzteZiele: null,
  };
}

/** Grenzen der Eingabefelder. */
export const GRENZEN = {
  groesseCm: { von: 100, bis: 250 },
  gewichtKg: { von: 30, bis: 350 },
  alter: { von: 10, bis: 110 },
  kcal: { von: 500, bis: 8000 },
  makroG: { von: 0, bis: 1500 },
} as const;

const inGrenzen = (wert: number, g: { von: number; bis: number }) => Number.isFinite(wert) && wert >= g.von && wert <= g.bis;

export function geburtsjahrErlaubt(jahr: number, diesesJahr: number): boolean {
  return Number.isInteger(jahr) && inGrenzen(diesesJahr - jahr, GRENZEN.alter);
}
export const groesseErlaubt = (cm: number) => inGrenzen(cm, GRENZEN.groesseCm);
export const gewichtErlaubt = (kg: number) => inGrenzen(kg, GRENZEN.gewichtKg);
export const kcalErlaubt = (kcal: number) => inGrenzen(kcal, GRENZEN.kcal);
export const makroErlaubt = (g: number) => inGrenzen(g, GRENZEN.makroG);

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

export function datumErlaubt(datum: unknown): datum is string {
  return typeof datum === 'string' && DATUM.test(datum) && !Number.isNaN(new Date(`${datum}T12:00:00`).getTime());
}

/** Heute als JJJJ-MM-TT in Ortszeit. */
export function datumVon(d: Date): string {
  const zwei = (z: number) => String(z).padStart(2, '0');
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

/** Der neueste Eintrag zählt. */
export function neuestesGewicht(gewichte: readonly Gewicht[]): Gewicht | null {
  return gewichte.reduce<Gewicht | null>((neu, g) => (!neu || g.datum > neu.datum ? g : neu), null);
}

export function gewichtPruefen(datum: unknown, kg: unknown): Gewicht {
  if (!datumErlaubt(datum)) throw new StarkFehler('UNGUELTIG', 'Das Datum stimmt nicht.');
  if (typeof kg !== 'number' || !gewichtErlaubt(kg)) throw new StarkFehler('UNGUELTIG', 'Das Gewicht stimmt nicht.');
  return { datum, kg };
}

const NAEHRSTOFF_CODES = new Set(NAEHRSTOFFE.map((n) => n.code));

function auswahl<T extends string>(wert: unknown, erlaubt: readonly T[], feld: string): T | null {
  if (wert === null || wert === undefined) return null;
  if (!erlaubt.includes(wert as T)) throw new StarkFehler('UNGUELTIG', `${feld} stimmt nicht.`);
  return wert as T;
}

function zahl(wert: unknown, passt: (z: number) => boolean, feld: string): number | null {
  if (wert === null || wert === undefined) return null;
  if (typeof wert !== 'number' || !passt(wert)) throw new StarkFehler('UNGUELTIG', `${feld} stimmt nicht.`);
  return wert;
}

/** Alles, was von der Oberfläche kommt, wird hier geprüft, bevor es gespeichert wird. */
export function profilPruefen(roh: unknown, diesesJahr: number): Profil {
  if (typeof roh !== 'object' || roh === null) throw new StarkFehler('UNGUELTIG', 'Das Profil stimmt nicht.');
  const p = roh as Record<string, unknown>;
  const ausgeblendet = Array.isArray(p.ausgeblendet) ? p.ausgeblendet : [];
  if (ausgeblendet.some((c) => typeof c !== 'string' || !NAEHRSTOFF_CODES.has(c))) throw new StarkFehler('UNGUELTIG', 'Die Nährstoffauswahl stimmt nicht.');
  const ziele = p.letzteZiele as ZielStand | null | undefined;
  return {
    id: PROFIL_ID,
    geschlecht: auswahl<Geschlecht>(p.geschlecht, ['weiblich', 'maennlich'], 'Das Geschlecht'),
    geburtsjahr: zahl(p.geburtsjahr, (j) => geburtsjahrErlaubt(j, diesesJahr), 'Das Geburtsjahr'),
    groesseCm: zahl(p.groesseCm, groesseErlaubt, 'Die Größe'),
    aktivitaet: auswahl<Aktivitaet>(p.aktivitaet, ['sitzend', 'wechselnd', 'gehend', 'anstrengend'], 'Die Aktivität'),
    sport: p.sport === true,
    ziel: auswahl<Ziel>(p.ziel, ['abnehmen', 'halten', 'aufbauen', 'eigene'], 'Das Ziel'),
    tempo: auswahl<Tempo>(p.tempo, ['sanft', 'mittel'], 'Das Tempo') ?? 'sanft',
    eigeneKcal: zahl(p.eigeneKcal, kcalErlaubt, 'Die Kalorienzahl'),
    eigeneEiweissG: zahl(p.eigeneEiweissG, makroErlaubt, 'Das Eiweiß'),
    eigeneFettG: zahl(p.eigeneFettG, makroErlaubt, 'Das Fett'),
    eigeneKohlenhydrateG: zahl(p.eigeneKohlenhydrateG, makroErlaubt, 'Die Kohlenhydrate'),
    einrichtungFertig: p.einrichtungFertig === true,
    stueckware: auswahl<Stueckware>(p.stueckware, ['groesse', 'gramm'], 'Die Stückware') ?? 'groesse',
    ausgeblendet: [...new Set(ausgeblendet as string[])],
    letzteZiele: ziele && typeof ziele.kcal === 'number' && typeof ziele.eiweissG === 'number' ? { kcal: ziele.kcal, eiweissG: ziele.eiweissG } : null,
  };
}
