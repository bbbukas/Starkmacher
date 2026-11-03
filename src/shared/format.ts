/**
 * Deutsches Zahlenformat und gerundete Anzeige (Bauauftrag: „ungefähr reicht“,
 * keine Scheingenauigkeit): Kalorien als ganze Zahl, Gramm mit höchstens einer
 * Nachkommastelle, Mikronährstoffe sinnvoll gerundet.
 */
import type { NaehrstoffZiel } from './bedarf';
import type { Einheit, Naehrstoff } from './naehrstoffe';

export function zahlText(wert: number, stellen = 0): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: stellen }).format(wert);
}

/** Sinnvolle Rundung: je kleiner die Zahl, desto mehr Stellen, höchstens zwei. */
function stellenFuer(wert: number, einheit: Einheit | 'mg'): number {
  if (einheit === 'kcal' || einheit === 'kJ') return 0;
  const betrag = Math.abs(wert);
  if (betrag >= 100) return 0;
  if (betrag >= 10) return einheit === 'g' ? 1 : 0;
  if (betrag >= 1) return 1;
  return einheit === 'g' ? 1 : 2;
}

/** Wert in der Einheit des BLS, passend gerundet und mit Einheit („1,6 mg“, wo der BLS 1600 µg führt). */
export function mengeText(wert: number, n: Pick<Naehrstoff, 'einheit' | 'zeigeInMg'>): string {
  const inMg = n.zeigeInMg === true;
  const anzeige = inMg ? wert / 1000 : wert;
  const einheit = inMg ? 'mg' : n.einheit;
  return `${zahlText(anzeige, stellenFuer(anzeige, einheit))} ${einheit}`;
}

/** Das Ziel in Worten: „110 mg“, „1–1,5 mg“, „höchstens 6 g“ oder null, wenn es keins gibt. */
export function zielText(ziel: NaehrstoffZiel | undefined, n: Pick<Naehrstoff, 'einheit' | 'zeigeInMg'>): string | null {
  if (!ziel) return null;
  if (ziel.von !== undefined && ziel.bis !== undefined) {
    const inMg = n.zeigeInMg === true;
    const von = inMg ? ziel.von / 1000 : ziel.von;
    return `${zahlText(von, stellenFuer(von, inMg ? 'mg' : n.einheit))}–${mengeText(ziel.bis, n)}`;
  }
  if (ziel.von !== undefined) return mengeText(ziel.von, n);
  if (ziel.hoechst !== undefined) return `höchstens ${mengeText(ziel.hoechst, n)}`;
  return null;
}

/**
 * Liest, was in einem Zahlenfeld steht: deutsches Komma, auch Punkt.
 * Leer oder Unsinn ergibt null.
 */
export function zahlLesen(text: string): number | null {
  const sauber = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(sauber)) return null;
  const wert = Number(sauber);
  return Number.isFinite(wert) ? wert : null;
}

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** „Dienstag, 3. November“ */
export function tagText(d: Date): string {
  return `${WOCHENTAGE[d.getDay()]}, ${d.getDate()}. ${MONATE[d.getMonth()]}`;
}

/** „03.11.2026“ aus „2026-11-03“ */
export function datumText(datum: string): string {
  const [j, m, t] = datum.split('-');
  return `${t}.${m}.${j}`;
}
