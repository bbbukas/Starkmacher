/**
 * Rezepte und Hashtags (Bauauftrag Abschnitt 6). Alle Rezepte trägt Lukas selbst ein. Mengen gelten roh, so wie
 * sie im Rezept stehen. Die Nährwerte ergeben sich aus den Zutaten und ändern sich mit, wenn sich ein Lebensmittel ändert.
 * Vergangene Tage im Tagebuch bleiben davon unberührt, denn ein Eintrag hält seinen eigenen Stand fest.
 */
import type { Groesse, MengenEinheit } from './einheiten';
import { StarkFehler } from './fehler';
import { fotoNameErlaubt } from './lebensmittel';
import { mengenAngabePruefen, tagessumme, type Bestandteil, type SummenWert, type Tagessumme } from './tagebuch';

export const REZEPT_PREFIX = 'rezept:';
export const istRezeptId = (id: string) => id.startsWith(REZEPT_PREFIX);

export const HASHTAG_FARBEN = ['tomate', 'karotte', 'sonne', 'salbei', 'minze', 'himmel', 'pflaume', 'rose'] as const;
export type HashtagFarbe = (typeof HASHTAG_FARBEN)[number];

export interface Hashtag {
  id: string;
  name: string;
  farbe: HashtagFarbe;
}

export interface RezeptZutat {
  id: string;
  lebensmittelId: string;
  /** Name beim Speichern, falls es das Lebensmittel später nicht mehr gibt. */
  name: string;
  menge: number;
  einheit: MengenEinheit;
  groesse: Groesse | null;
}

export interface Rezept {
  id: string;
  name: string;
  portionen: number;
  zutaten: RezeptZutat[];
  zubereitung: string;
  notiz: string;
  /** Kennungen der Hashtags. */
  hashtags: string[];
  /** Dateinamen im Fotoordner. */
  fotos: string[];
  geaendertAm: string;
}

export type RezeptEingabe = Omit<Rezept, 'id' | 'geaendertAm'> & { id?: string };

/** Eine Zutat, wie sie gerade rechenbar ist. Null: Das Lebensmittel fehlt oder sein Gewicht ist unbekannt. */
export interface ZutatStand {
  zutat: RezeptZutat;
  bestandteil: Bestandteil | null;
  problem: 'gibt-es-nicht-mehr' | 'gewicht-fehlt' | null;
}

export interface RezeptAnsicht {
  rezept: Rezept;
  zutaten: ZutatStand[];
}

export interface RezeptKurz {
  id: string;
  name: string;
  portionen: number;
  kcalJePortion: number | null;
  eiweissJePortion: number | null;
  hashtags: string[];
  foto: string | null;
}

export interface RezeptAnfrage {
  text: string;
  /** Es müssen alle diese Hashtags dabei sein. */
  hashtags: readonly string[];
}

const NAME_LAENGE = 160;
const TEXT_LAENGE = 20_000;
const FOTOS_HOECHST = 12;

export const portionenErlaubt = (z: number) => Number.isFinite(z) && z > 0 && z <= 200;

/** Prüft, was von der Oberfläche kommt. Das Lebensmittel selbst prüft der Dienst. */
export function rezeptPruefen(roh: unknown): RezeptEingabe {
  if (typeof roh !== 'object' || roh === null) throw new StarkFehler('UNGUELTIG', 'Das Rezept stimmt nicht.');
  const r = roh as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (name === '' || name.length > NAME_LAENGE) throw new StarkFehler('UNGUELTIG', 'Bitte gib dem Rezept einen Namen.');
  if (typeof r.portionen !== 'number' || !portionenErlaubt(r.portionen)) throw new StarkFehler('UNGUELTIG', 'Die Anzahl der Portionen stimmt nicht.');
  if (!Array.isArray(r.zutaten) || r.zutaten.length === 0) throw new StarkFehler('UNGUELTIG', 'Bitte trag mindestens eine Zutat ein.');
  const zutaten: RezeptZutat[] = r.zutaten.map((roheZutat: unknown) => {
    if (typeof roheZutat !== 'object' || roheZutat === null) throw new StarkFehler('UNGUELTIG', 'Eine Zutat stimmt nicht.');
    const z = roheZutat as Record<string, unknown>;
    if (typeof z.lebensmittelId !== 'string' || typeof z.id !== 'string') throw new StarkFehler('UNGUELTIG', 'Eine Zutat stimmt nicht.');
    return { ...mengenAngabePruefen(z), id: z.id, lebensmittelId: z.lebensmittelId, name: typeof z.name === 'string' ? z.name : '' };
  });
  const text = (wert: unknown) => (typeof wert === 'string' ? wert.slice(0, TEXT_LAENGE) : '');
  const liste = (wert: unknown) => (Array.isArray(wert) ? wert.filter((x): x is string => typeof x === 'string') : []);
  const fotos = liste(r.fotos);
  if (fotos.some((f) => !fotoNameErlaubt(f)) || fotos.length > FOTOS_HOECHST) throw new StarkFehler('UNGUELTIG', 'Ein Foto stimmt nicht.');
  return {
    ...(typeof r.id === 'string' && istRezeptId(r.id) ? { id: r.id } : {}),
    name,
    portionen: r.portionen,
    zutaten,
    zubereitung: text(r.zubereitung),
    notiz: text(r.notiz),
    hashtags: [...new Set(liste(r.hashtags))],
    fotos: [...new Set(fotos)],
  };
}

/** „#unter 30 Minuten“ wird zu „unter30Minuten“. Das # zeigt die Oberfläche selbst. */
export function hashtagName(roh: unknown): string {
  const name = typeof roh === 'string' ? roh.replace(/[^\p{L}\p{N}_-]+/gu, '') : '';
  if (name === '' || name.length > 40) throw new StarkFehler('UNGUELTIG', 'Bitte gib dem Hashtag einen Namen aus Buchstaben und Zahlen.');
  return name;
}

export const farbeOderErste = (roh: unknown): HashtagFarbe => (HASHTAG_FARBEN.includes(roh as HashtagFarbe) ? (roh as HashtagFarbe) : HASHTAG_FARBEN[0]);

/** Die Nährwerte des ganzen Rezepts aus den Zutaten, die rechenbar sind. */
export const rezeptSumme = (zutaten: readonly ZutatStand[]): Tagessumme => tagessumme(zutaten.flatMap((z) => (z.bestandteil ? [z.bestandteil] : [])));

const geteilt = (s: SummenWert, teiler: number): SummenWert => ({ menge: s.menge / teiler, fehltBei: s.fehltBei });

/** Eine Summe für eine Portion. */
export function jePortion(summe: Tagessumme, portionen: number): Tagessumme {
  const werte: Record<string, SummenWert> = {};
  for (const [code, s] of Object.entries(summe.werte)) werte[code] = geteilt(s, portionen);
  return { anzahl: summe.anzahl, werte, freierZuckerG: geteilt(summe.freierZuckerG, portionen), epaDhaMg: geteilt(summe.epaDhaMg, portionen) };
}

/** Die Zubereitung als einzelne Schritte, eine Zeile je Schritt. */
export const zubereitungsSchritte = (text: string) =>
  text
    .split('\n')
    .map((z) => z.trim())
    .filter(Boolean);
