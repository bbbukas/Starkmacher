/**
 * Teller (Bauauftrag Abschnitt 7): einfache Mahlzeiten ohne Rezept, zum Beispiel Nudeln und ein veganes Steak mit Soße.
 * Ein Teller besteht aus Lebensmitteln und Rezepten, jeweils mit Menge und Rolle. Wie ein Rezept rechnet er immer mit dem
 * heutigen Stand. Im Tagebuch hält ein Eintrag seine Zutaten fest.
 */
import { StarkFehler } from './fehler';
import type { EintragEinheit, Groesse } from './einheiten';
import { istRezeptId } from './rezepte';
import { mengenAngabePruefen, portionenPruefen, tagessumme, type Bestandteil, type Tagessumme } from './tagebuch';

export const TELLER_PREFIX = 'teller:';
export const istTellerId = (id: string) => id.startsWith(TELLER_PREFIX);

export type Rolle = 'hauptsache' | 'beilage' | 'gemuese' | 'sosse' | 'topping' | 'extra';

/** In dieser Reihenfolge zeigt die Ansicht die Bestandteile. */
export const ROLLEN: readonly { id: Rolle; titel: string }[] = [
  { id: 'hauptsache', titel: 'Hauptsache' },
  { id: 'beilage', titel: 'Beilage' },
  { id: 'gemuese', titel: 'Gemüse und Salat' },
  { id: 'sosse', titel: 'Soße und Dip' },
  { id: 'topping', titel: 'Topping' },
  { id: 'extra', titel: 'Extra' },
];

const ROLLEN_IDS = ROLLEN.map((r) => r.id);
export const rolleTitel = (rolle: Rolle) => ROLLEN.find((r) => r.id === rolle)?.titel ?? rolle;

/** Ein Lebensmittel oder ein Rezept auf dem Teller. Rezepte zählen in Portionen. */
export interface TellerPosten {
  id: string;
  /** Kennung eines Lebensmittels oder Rezepts. */
  bezugId: string;
  /** Name beim Speichern, falls es den Bestandteil später nicht mehr gibt. */
  name: string;
  menge: number;
  einheit: EintragEinheit;
  groesse: Groesse | null;
  rolle: Rolle;
}

export interface Teller {
  id: string;
  name: string;
  posten: TellerPosten[];
  geaendertAm: string;
}

export type TellerEingabe = { id?: string; name: string; posten: TellerPosten[] };

/** Ein Bestandteil, wie er gerade rechenbar ist. Ein Rezept bringt mehrere Zutaten mit. */
export interface PostenStand {
  posten: TellerPosten;
  bestandteile: Bestandteil[];
  problem: 'gibt-es-nicht-mehr' | 'gewicht-fehlt' | null;
}

export interface TellerAnsicht {
  teller: Teller;
  posten: PostenStand[];
}

export interface TellerKurz {
  id: string;
  name: string;
  kcal: number | null;
  eiweiss: number | null;
  /** „Nudeln, Veganes Steak und Soße“ */
  inhalt: string;
}

export function postenPruefen(roh: unknown): TellerPosten[] {
  if (!Array.isArray(roh) || roh.length === 0) throw new StarkFehler('UNGUELTIG', 'Bitte leg mindestens etwas auf den Teller.');
  return roh.map((r: unknown) => {
    if (typeof r !== 'object' || r === null) throw new StarkFehler('UNGUELTIG', 'Ein Bestandteil stimmt nicht.');
    const p = r as Record<string, unknown>;
    if (typeof p.id !== 'string' || typeof p.bezugId !== 'string') throw new StarkFehler('UNGUELTIG', 'Ein Bestandteil stimmt nicht.');
    if (!ROLLEN_IDS.includes(p.rolle as Rolle)) throw new StarkFehler('UNGUELTIG', 'Die Rolle stimmt nicht.');
    const grund = { id: p.id, bezugId: p.bezugId, name: typeof p.name === 'string' ? p.name : '', rolle: p.rolle as Rolle };
    if (istRezeptId(p.bezugId)) return { ...grund, menge: portionenPruefen(p.menge), einheit: 'Portion' as const, groesse: null };
    return { ...grund, ...mengenAngabePruefen(p) };
  });
}

/** Prüft, was von der Oberfläche kommt. Ohne Namen lässt sich ein Teller eintragen, aber nicht aufheben. */
export function tellerPruefen(roh: unknown): TellerEingabe {
  if (typeof roh !== 'object' || roh === null) throw new StarkFehler('UNGUELTIG', 'Der Teller stimmt nicht.');
  const t = roh as Record<string, unknown>;
  const name = typeof t.name === 'string' ? t.name.trim() : '';
  if (name === '' || name.length > 160) throw new StarkFehler('UNGUELTIG', 'Bitte gib dem Teller einen Namen, damit du ihn wiederfindest.');
  return { ...(typeof t.id === 'string' && istTellerId(t.id) ? { id: t.id } : {}), name, posten: postenPruefen(t.posten) };
}

/** Nach Rollen geordnet, innerhalb einer Rolle in der eingetragenen Reihenfolge. */
export function nachRollen<T extends { rolle: Rolle }>(liste: readonly T[]): { rolle: Rolle; titel: string; eintraege: T[] }[] {
  return ROLLEN.map((r) => ({ rolle: r.id, titel: r.titel, eintraege: liste.filter((x) => x.rolle === r.id) })).filter((g) => g.eintraege.length > 0);
}

const reihe = (namen: readonly string[]) => (namen.length <= 1 ? (namen[0] ?? '') : `${namen.slice(0, -1).join(', ')} und ${namen.at(-1)}`);

/** Der Inhalt in Worten. Nur die erste Angabe des Namens, sonst wird es zu lang: „Teigwaren eifrei, gekocht“ wird „Teigwaren eifrei“. */
export function tellerInhalt(posten: readonly Pick<TellerPosten, 'name' | 'rolle'>[], hoechstens = 3): string {
  const namen = nachRollen(posten).flatMap((g) => g.eintraege.map((p) => p.name.split(',')[0]!.trim()));
  if (namen.length <= hoechstens) return reihe(namen);
  return `${namen.slice(0, hoechstens).join(', ')} und ${namen.length - hoechstens} mehr`;
}

export const tellerSumme = (posten: readonly PostenStand[]): Tagessumme => tagessumme(posten.flatMap((p) => p.bestandteile));
