/**
 * Die Einkaufsliste (Bauauftrag Abschnitt 10): Aus gewählten Rezepten und Tellern entsteht eine Liste mit zusammengerechneten
 * Mengen, zum Abhaken. Reine Rechnung, damit sie sich prüfen lässt. Sie läuft jedes Mal mit dem heutigen Stand der Rezepte und Teller.
 *
 * - Gleiche Einheiten werden addiert, auch g und kg sowie ml und l.
 * - Verschiedene Einheiten rechnet die Umrechnung des Lebensmittels zusammen. Das Ergebnis trägt ein „≈“, die Teile stehen darunter.
 * - Fehlt ein Gewicht, gibt es keine erfundene Summe: Die Teile bleiben nebeneinander stehen.
 * - Was man nur ganz kaufen kann, wird aufgerundet. Was wirklich gebraucht wird, steht dabei.
 */
import { EINHEITEN, inGramm, type Groesse, type MengenEinheit, type Umrechnung } from './einheiten';
import { zahlText } from './format';

export type EinkaufArt = 'rezept' | 'teller';

/** Was auf der Liste steht: bei einem Rezept in Portionen, bei einem Teller, wie oft. */
export interface EinkaufQuelle {
  bezugId: string;
  name: string;
  anzahl: number;
}

/** Ein Haken gilt für eine bestimmte Menge. Wird es mehr, muss man noch einmal los. */
export interface EinkaufHaken {
  schluessel: string;
  stand: string;
}

export interface EinkaufDaten {
  quellen: EinkaufQuelle[];
  haken: EinkaufHaken[];
}

export const LEERE_EINKAUFSLISTE: EinkaufDaten = { quellen: [], haken: [] };

/** Eine Zutat, auf die gewählte Anzahl umgerechnet. Umrechnung null: Das Lebensmittel gibt es nicht mehr. */
export interface EinkaufPosten {
  schluessel: string;
  name: string;
  menge: number;
  einheit: MengenEinheit;
  groesse: Groesse | null;
  umrechnung: Umrechnung | null;
  /** Das Rezept oder der Teller, für das es gebraucht wird. */
  fuer: string;
}

export interface EinkaufZeile {
  schluessel: string;
  name: string;
  /** Was man kaufen muss: „500 g“, „≈ 230 g“, „2 Stück“. */
  menge: string;
  /** Woraus es sich zusammensetzt: „200 g und 2 EL“, „1,5 gebraucht“. */
  genauer: string | null;
  fuer: string[];
  gegart: boolean;
  abgehakt: boolean;
  /** Merkt sich der Haken: So erkennt er, ob sich die Menge geändert hat. */
  stand: string;
}

export interface EinkaufQuellenStand extends EinkaufQuelle {
  art: EinkaufArt;
  /** Das Rezept oder der Teller ist inzwischen gelöscht. */
  fehlt: boolean;
  /** Die Notiz eines Rezepts: Dort können Zutaten stehen, die kein Lebensmittel haben. */
  notiz: string | null;
  /** Rezepte auf einem Teller, die es nicht mehr gibt. */
  ohne: string[];
}

export interface EinkaufAnsicht {
  quellen: EinkaufQuellenStand[];
  zeilen: EinkaufZeile[];
}

export const anzahlErlaubt = (z: number) => Number.isFinite(z) && z > 0 && z <= 200;

/** „4 Portionen“, „1 Teller“ */
export function anzahlText(q: Pick<EinkaufQuellenStand, 'art' | 'anzahl'>): string {
  const zahl = zahlText(q.anzahl, 2);
  if (q.art === 'teller') return `${zahl} Teller`;
  return `${zahl} ${q.anzahl === 1 ? 'Portion' : 'Portionen'}`;
}

interface Teil {
  einheit: MengenEinheit;
  groesse: Groesse | null;
  menge: number;
}

/** Was man nur ganz kaufen kann. */
const ZAEHLBAR: readonly MengenEinheit[] = ['Stück', 'Scheibe', 'Dose', 'Becher', 'Packung'];
const MEHRZAHL: Partial<Record<MengenEinheit, string>> = { Prise: 'Prisen', Scheibe: 'Scheiben', Dose: 'Dosen', Packung: 'Packungen' };
const LOEFFEL: readonly MengenEinheit[] = ['EL', 'TL', 'Prise'];

/** Aufgerundet: Lieber etwas zu viel im Korb als zu wenig. Die winzige Zugabe fängt Rundungsreste beim Rechnen ab. */
const aufgerundet = (wert: number, stellen = 0) => {
  const faktor = 10 ** stellen;
  return Math.ceil(wert * faktor - 1e-9) / faktor;
};

function gewichtText(wert: number, klein: 'g' | 'ml'): string {
  const gerundet = aufgerundet(wert, wert < 10 ? 1 : 0);
  if (gerundet >= 1000) return `${zahlText(aufgerundet(wert / 1000, 2), 2)} ${klein === 'g' ? 'kg' : 'l'}`;
  return `${zahlText(gerundet, 1)} ${klein}`;
}

function teilText(t: Teil): string {
  if (t.einheit === 'g' || t.einheit === 'ml') return gewichtText(t.menge, t.einheit);
  const zahl = t.einheit === 'EL' || t.einheit === 'TL' ? aufgerundet(t.menge, 1) : aufgerundet(t.menge);
  const wort = zahl === 1 ? t.einheit : (MEHRZAHL[t.einheit] ?? t.einheit);
  return `${zahlText(zahl, 1)} ${wort}${t.groesse ? ` (${t.groesse})` : ''}`;
}

const aufzaehlen = (teile: readonly string[]) => (teile.length <= 1 ? (teile[0] ?? '') : `${teile.slice(0, -1).join(', ')} und ${teile.at(-1)}`);

/** Gleiche Einheiten zusammen, g und kg sowie ml und l als eine. Die Reihenfolge hängt nicht davon ab, was zuerst gewählt wurde. */
function teileBilden(liste: readonly EinkaufPosten[]): Teil[] {
  const teile = new Map<string, Teil>();
  for (const p of liste) {
    const einheit: MengenEinheit = p.einheit === 'kg' ? 'g' : p.einheit === 'l' ? 'ml' : p.einheit;
    const menge = p.einheit === 'kg' || p.einheit === 'l' ? p.menge * 1000 : p.menge;
    // Ohne Größe rechnet das Programm bei Eiern mit M, also gehört es auch hier dazu.
    const groesse = einheit !== 'Stück' ? null : p.umrechnung ? (p.umrechnung.groessen ? (p.groesse ?? 'M') : null) : p.groesse;
    const schluessel = `${einheit}:${groesse ?? ''}`;
    const da = teile.get(schluessel);
    if (da) da.menge += menge;
    else teile.set(schluessel, { einheit, groesse, menge });
  }
  const rang = (t: Teil) => EINHEITEN.findIndex((e) => e.id === t.einheit);
  return [...teile.values()].sort((a, b) => rang(a) - rang(b) || (a.groesse ?? '').localeCompare(b.groesse ?? ''));
}

function grammVon(t: Teil, u: Umrechnung | null): number | null {
  if (u) return inGramm(t.menge, t.einheit, u, t.groesse ?? 'M');
  return t.einheit === 'g' ? t.menge : null;
}

function mengeLesen(teile: readonly Teil[], u: Umrechnung | null): { menge: string; genauer: string | null } {
  if (teile.length === 1) {
    const t = teile[0]!;
    const gramm = grammVon(t, u);
    const zusatz: string[] = [];
    if (ZAEHLBAR.includes(t.einheit) && aufgerundet(t.menge) !== Math.round(t.menge * 100) / 100) zusatz.push(`${zahlText(t.menge, 2)} gebraucht`);
    if (gramm !== null && t.einheit !== 'g' && t.einheit !== 'ml' && t.einheit !== 'Prise') zusatz.push(`≈ ${gewichtText(gramm, 'g')}`);
    return { menge: teilText(t), genauer: zusatz.length > 0 ? zusatz.join(', ') : null };
  }

  // Eier in verschiedenen Größen bleiben Eier. Niemand kauft „≈ 156 g“ davon.
  if (teile.every((t) => t.einheit === 'Stück')) {
    const summe = teile.reduce((s, t) => s + t.menge, 0);
    return { menge: teilText({ einheit: 'Stück', groesse: null, menge: summe }), genauer: aufzaehlen(teile.map((t) => `${zahlText(t.menge, 2)} ${t.groesse ?? 'ohne Größe'}`)) };
  }

  const alle = aufzaehlen(teile.map(teilText));
  const gramm = teile.map((t) => grammVon(t, u));
  if (gramm.some((g) => g === null)) return { menge: alle, genauer: null };
  const summe = gramm.reduce<number>((s, g) => s + g!, 0);
  // Milch bleibt in Millilitern, solange nur Flüssiges und Löffel dabei sind.
  const fluessig = teile.some((t) => t.einheit === 'ml') && teile.every((t) => t.einheit === 'ml' || LOEFFEL.includes(t.einheit));
  return { menge: `≈ ${fluessig ? gewichtText(summe / u!.dichte, 'ml') : gewichtText(summe, 'g')}`, genauer: alle };
}

const GEGART = /gekocht|gegart|gebraten|gedünstet|gebacken|gegrillt|frittiert/i;

/** Die Liste aus allen Zutaten, nach Namen geordnet. Ein Lebensmittel steht nur einmal darauf. */
export function einkaufZeilen(posten: readonly EinkaufPosten[], haken: readonly EinkaufHaken[]): EinkaufZeile[] {
  const gruppen = new Map<string, EinkaufPosten[]>();
  for (const p of posten) gruppen.set(p.schluessel, [...(gruppen.get(p.schluessel) ?? []), p]);
  const zeilen = [...gruppen.entries()].map(([schluessel, liste]): EinkaufZeile => {
    const erster = liste[0]!;
    const { menge, genauer } = mengeLesen(teileBilden(liste), erster.umrechnung);
    const stand = `${menge}|${genauer ?? ''}`;
    return {
      schluessel,
      name: erster.name,
      menge,
      genauer,
      fuer: [...new Set(liste.map((p) => p.fuer))],
      gegart: GEGART.test(erster.name),
      abgehakt: haken.some((h) => h.schluessel === schluessel && h.stand === stand),
      stand,
    };
  });
  return zeilen.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Zum Mitnehmen: nur, was noch fehlt, eine Zeile je Lebensmittel. */
export function einkaufText(zeilen: readonly EinkaufZeile[]): string {
  return zeilen
    .filter((z) => !z.abgehakt)
    .map((z) => `${z.menge} ${z.name}`)
    .join('\n');
}
