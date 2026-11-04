/**
 * Liest die Nährwerttabelle aus dem, was das Hilfsprogramm auf dem Foto erkannt hat (Bauauftrag 5.3). Das Ergebnis ist
 * nie endgültig: Es landet auf der Prüfseite, und was zweifelhaft ist, ist dort markiert.
 * Reine Rechnung, damit sie sich mit erfundenen Beispielen prüfen lässt.
 */
import { enthaeltWort, wortForm, zeilenOrdnen, type TextStueck } from './fotoText';
import type { Basis, Werte } from './lebensmittel';
import { naehrstoff } from './naehrstoffe';

/** Was neben einem Wert steht, wenn er nicht glatt zu lesen war. */
export type Zweifel = 'einheit' | 'gelesen' | 'kleiner-als' | 'passt-nicht';

export const ZWEIFEL_TEXT: Readonly<Record<Zweifel, string>> = {
  einheit: 'Hier war die Einheit nicht sicher zu lesen.',
  gelesen: 'Hier war eine Zahl nicht sicher zu lesen.',
  'kleiner-als': 'Auf der Packung steht „weniger als“ diese Menge.',
  'passt-nicht': 'Das passt nicht zu den anderen Werten, bitte nachsehen.',
};

export interface GeleseneTabelle {
  /** Werte so, wie sie auf der Packung stehen, je 100 g bzw. 100 ml oder je Portion. */
  gelesen: Record<string, number>;
  /** Die gelesenen Werte gelten für … */
  bezug: 'je100' | 'portion';
  basis: Basis;
  /** Gramm oder Milliliter einer Portion, wenn die Packung sie nennt. */
  portionMenge: number | null;
  /** So heißt die Portion auf der Packung, zum Beispiel „Riegel“. */
  portionName: string | null;
  zweifel: Record<string, Zweifel>;
}

/** Zeilen der Tabelle. `nur`: Ein Stichwort reicht, solange kein `ohne`-Wort dabei ist. Die erste passende Regel gilt. */
const ZEILEN: readonly { code: string; worte: readonly string[]; ohne?: readonly string[]; einheitNoetig?: boolean }[] = [
  { code: 'ENERCC', worte: ['brennwert', 'energie', 'energy'] },
  { code: 'FASAT', worte: ['gesaettigt', 'saturate', 'saturated'], ohne: ['ungesaettigt', 'unsaturated'] },
  { code: 'SUGAR', worte: ['zucker', 'sugar'], ohne: ['zuckeralkohol', 'mehrwertig', 'polyol'] },
  { code: 'CHO', worte: ['kohlenhydrat', 'carbohydrate'] },
  { code: 'FIBT', worte: ['ballaststoff', 'fibre', 'fiber'] },
  { code: 'PROT625', worte: ['eiweiss', 'protein'] },
  { code: 'NACL', worte: ['salz', 'salt'] },
  { code: 'FAT', worte: ['fett', 'fat'], ohne: ['fettsaeure', 'ungesaettigt', 'gesaettigt', 'fatty'] },
  // Was manche Packungen zusätzlich nennen. Hier muss die Einheit dabeistehen, sonst ist die Zahl zu unsicher.
  { code: 'VITC', worte: ['vitamin c'], einheitNoetig: true },
  { code: 'VITD', worte: ['vitamin d'], einheitNoetig: true },
  { code: 'VITE', worte: ['vitamin e'], einheitNoetig: true },
  { code: 'THIA', worte: ['vitamin b1', 'thiamin'], einheitNoetig: true },
  { code: 'RIBF', worte: ['vitamin b2', 'riboflavin'], einheitNoetig: true },
  { code: 'VITB6', worte: ['vitamin b6'], einheitNoetig: true },
  { code: 'VITB12', worte: ['vitamin b12'], einheitNoetig: true },
  { code: 'FOL', worte: ['folat', 'folsaeure'], einheitNoetig: true },
  { code: 'NIAEQ', worte: ['niacin'], einheitNoetig: true },
  { code: 'BIOT', worte: ['biotin'], einheitNoetig: true },
  { code: 'PANTAC', worte: ['pantothensaeure'], einheitNoetig: true },
  { code: 'CA', worte: ['calcium', 'kalzium'], einheitNoetig: true },
  { code: 'MG', worte: ['magnesium'], einheitNoetig: true },
  { code: 'FE', worte: ['eisen'], einheitNoetig: true },
  { code: 'ZN', worte: ['zink'], einheitNoetig: true },
  { code: 'ID', worte: ['jod', 'iod'], einheitNoetig: true },
  { code: 'K', worte: ['kalium'], einheitNoetig: true },
  { code: 'P', worte: ['phosphor'], einheitNoetig: true },
];

const KURZE_WORTE = new Set(['fett', 'fat', 'salz', 'salt', 'jod', 'iod', 'zink']);

function zeileFinden(text: string): (typeof ZEILEN)[number] | null {
  const form = wortForm(text);
  for (const z of ZEILEN) {
    if (z.ohne?.some((w) => form.includes(w))) continue;
    const passt = z.worte.some((w) => {
      // Kurze Wörter müssen als ganzes Wort dastehen: „Fett“ steckt sonst auch in „Fettarm“.
      if (KURZE_WORTE.has(w)) return new RegExp(`(^|[^a-z])${w}($|[^a-z])`).test(form);
      // Bei Vitaminen zählt jeder Buchstabe: „Vitamin B1“ ist nicht „Vitamin B12“.
      if (w.startsWith('vitamin ')) return new RegExp(`${w}($|[^a-z0-9])`).test(form);
      return enthaeltWort(text, w);
    });
    if (passt) return z;
  }
  return null;
}

type Einheit = 'kJ' | 'kcal' | 'g' | 'mg' | 'µg' | null;

interface Zahl {
  wert: number;
  einheit: Einheit;
  /** Waagerechte Mitte im Bild. */
  x: number;
  zweifel: Zweifel | null;
}

const ZAHL = /(<\s*)?([0-9OolI]{1,5}(?:[.,][0-9OolI]{1,3})?)\s*(kJ|KJ|kj|kcal|Kcal|KCAL|mg|µg|ug|mcg|μg|g|9)?(?![a-zA-ZäöüÄÖÜ0-9])(\s*%)?/g;

const einheitAus = (roh: string | undefined): { einheit: Einheit; slip: boolean } => {
  switch (roh?.toLowerCase()) {
    case 'kj':
      return { einheit: 'kJ', slip: false };
    case 'kcal':
      return { einheit: 'kcal', slip: false };
    case 'mg':
      return { einheit: 'mg', slip: false };
    case 'µg':
    case 'μg':
    case 'ug':
    case 'mcg':
      return { einheit: 'µg', slip: false };
    case 'g':
      return { einheit: 'g', slip: false };
    case '9':
      // „11,6 g“ wird oft „11,6 9“ gelesen (Phase 0, Abschnitt 7).
      return { einheit: 'g', slip: true };
    default:
      return { einheit: null, slip: false };
  }
};

/** Alle Zahlen eines Textstücks mit Einheit und ungefährer Lage. Prozentangaben (% RM) fallen weg. */
function zahlenIn(s: TextStueck): Zahl[] {
  const aus: Zahl[] = [];
  for (const m of s.text.matchAll(ZAHL)) {
    if (m[4]) continue; // Prozent
    const vorher = s.text[m.index - 1];
    if (vorher !== undefined && /[a-zA-ZäöüÄÖÜ]/.test(vorher)) continue; // „B12“, „D3“
    const roh = m[2]!;
    if (!/[0-9]/.test(roh)) continue;
    const repariert = roh.replace(/[Oo]/g, '0').replace(/[lI]/g, '1');
    const { einheit, slip } = einheitAus(m[3]);
    const wert = Number(repariert.replace(',', '.'));
    if (!Number.isFinite(wert)) continue;
    let zweifel: Zweifel | null = null;
    if (repariert !== roh) zweifel = 'gelesen';
    if (slip) zweifel = 'einheit';
    if (m[1]) zweifel = 'kleiner-als';
    const x = s.x + (s.b * (m.index + m[0].length / 2)) / Math.max(1, s.text.length);
    aus.push({ wert, einheit, x, zweifel });
  }
  return aus;
}

/** „559“ war vermutlich „55 g“, „11,69“ vermutlich „11,6 g“: Die 9 ist ein g, das am Wert hängt. */
function fehlendesG(z: Zahl, code: string): Zahl {
  if (z.einheit !== null) return z;
  if (naehrstoff(code)?.einheit !== 'g') return z;
  const text = String(z.wert);
  const hinten9 = text.endsWith('9');
  if (hinten9 && z.wert > 100) return { ...z, wert: Number(text.slice(0, -1)), einheit: 'g', zweifel: 'einheit' };
  if (hinten9 && /[.]\d9$/.test(text)) return { ...z, wert: Number(text.slice(0, -1)), einheit: 'g', zweifel: 'einheit' };
  return z;
}

/** Rechnet in die Einheit um, die das Programm für diesen Nährstoff führt. */
function inEinheit(z: Zahl, code: string): number | null {
  const ziel = naehrstoff(code)?.einheit;
  if (!ziel) return null;
  const von = z.einheit;
  if (von === null || von === ziel) return z.wert;
  const faktor: Partial<Record<string, number>> = { 'g-mg': 1000, 'g-µg': 1_000_000, 'mg-g': 0.001, 'mg-µg': 1000, 'µg-mg': 0.001, 'µg-g': 0.000001 };
  const f = faktor[`${von}-${ziel}`];
  return f === undefined ? null : z.wert * f;
}

interface Spalte {
  art: 'je100' | 'portion';
  x: number | null;
}

interface Kopf {
  spalten: Spalte[];
  basis: Basis;
  portionMenge: number | null;
  portionName: string | null;
  /** Steht wirklich eine Spaltenüberschrift da? „100 g Butter“ in einem Rezept ist keine. */
  eindeutig: boolean;
}

const PORTION_WORT = /portion|serving|riegel|st(ü|ue)ck|scheibe|glas|becher|tasse|t(ü|ue)te|beutel|flasche|dose|packung|keks|tafel|kapsel/i;

function kopfLesen(zeilen: readonly TextStueck[][]): Kopf {
  const kopf: Kopf = { spalten: [], basis: 'g', portionMenge: null, portionName: null, eindeutig: false };
  for (const zeile of zeilen) {
    for (const s of zeile) {
      const hundert = /(?:^|[^0-9.,])100\s*(g|ml)\b/i.exec(s.text);
      const mitte = s.x + s.b / 2;
      // Steht viel Text davor („Nährwertangaben je 100 ml“), ist das keine Spalte, sondern gilt für alles.
      const breit = s.text.length > 16;
      if (hundert) {
        kopf.basis = hundert[1]!.toLowerCase() === 'ml' ? 'ml' : 'g';
        kopf.spalten.push({ art: 'je100', x: breit ? null : mitte });
      }
      const klammer = /(\d+(?:[.,]\d+)?)\s*(g|ml)\b/gi;
      const portionWort = PORTION_WORT.exec(s.text);
      const mengen = [...s.text.matchAll(klammer)].filter((m) => Number(m[1]!.replace(',', '.')) !== 100);
      if (/\b(pro|je|per)\b/i.test(s.text) && (hundert || portionWort)) kopf.eindeutig = true;
      if (/^\(?\d+(?:[.,]\d+)?\s*(g|ml)\)?$/i.test(s.text.trim())) kopf.eindeutig = true;
      if (portionWort || (mengen.length > 0 && !hundert)) {
        const menge = mengen[0];
        if (menge) {
          kopf.portionMenge = Number(menge[1]!.replace(',', '.'));
          if (menge[2]!.toLowerCase() === 'ml') kopf.basis = 'ml';
        }
        if (portionWort && !/portion|serving/i.test(portionWort[0])) kopf.portionName = portionWort[0][0]!.toUpperCase() + portionWort[0].slice(1);
        if (!hundert) kopf.spalten.push({ art: 'portion', x: breit ? null : mitte });
      }
    }
  }
  return kopf;
}

/** Sucht in einer Zeile die Zahl der Spalte, die gelten soll. */
function zahlDerSpalte(zahlen: readonly Zahl[], kopf: Kopf, art: Spalte['art']): Zahl | null {
  if (zahlen.length === 0) return null;
  const spalten = kopf.spalten.filter((s) => s.x !== null).sort((a, b) => a.x! - b.x!);
  const ziel = spalten.find((s) => s.art === art);
  // Stehen so viele Zahlen wie Spalten da, zählt die Reihenfolge. Das hält auch bei schiefen Fotos.
  if (spalten.length > 0 && ziel && zahlen.length === spalten.length) return zahlen[spalten.indexOf(ziel)]!;
  if (spalten.length > 0 && ziel) {
    return [...zahlen].sort((a, b) => Math.abs(a.x - ziel.x!) - Math.abs(b.x - ziel.x!))[0]!;
  }
  return zahlen[0]!;
}

/** Prüft die Werte gegeneinander: Eine verrutschte Zahl fällt so meist auf. */
function pruefen(w: Record<string, number>, zweifel: Record<string, Zweifel>, je100: boolean): void {
  const markieren = (code: string) => {
    if (w[code] !== undefined) zweifel[code] ??= 'passt-nicht';
  };
  if (w.FASAT !== undefined && w.FAT !== undefined && w.FASAT > w.FAT) {
    markieren('FASAT');
    markieren('FAT');
  }
  if (w.SUGAR !== undefined && w.CHO !== undefined && w.SUGAR > w.CHO) {
    markieren('SUGAR');
    markieren('CHO');
  }
  const { ENERCC: kcal, FAT: fett, CHO: kh, PROT625: eiweiss, FIBT: ballast } = w;
  if (je100) {
    for (const code of ['FAT', 'FASAT', 'CHO', 'SUGAR', 'FIBT', 'PROT625', 'NACL']) if ((w[code] ?? 0) > 100) markieren(code);
    if ((kcal ?? 0) > 950) markieren('ENERCC');
    const gramm = (fett ?? 0) + (kh ?? 0) + (eiweiss ?? 0);
    if (gramm > 105) for (const code of ['FAT', 'CHO', 'PROT625']) markieren(code);
  }
  // Die Kalorien müssen ungefähr zu den Makros passen. Kleine Mengen rechnen wegen der Rundung großzügiger.
  if (kcal !== undefined && fett !== undefined && kh !== undefined && eiweiss !== undefined) {
    const gerechnet = fett * 9 + kh * 4 + eiweiss * 4 + (ballast ?? 0) * 2;
    if (Math.abs(gerechnet - kcal) > Math.max(25, kcal * 0.2)) markieren('ENERCC');
  }
}

/** „Energie und Nährwerte pro 100 g“ ist eine Überschrift, keine Zeile der Tabelle. „Salz 100 g“ dagegen schon. */
const istKopfzeile = (text: string) => /\b(pro|je|per|für)\s*100\s*(g|ml)\b/i.test(text);

/** Liest die Tabelle. Null: Auf dem Foto steht keine Nährwerttabelle. */
export function tabelleLesen(stuecke: readonly TextStueck[]): GeleseneTabelle | null {
  const zeilen = zeilenOrdnen(stuecke);
  const ersteMitWert = zeilen.findIndex((z) => {
    const text = z.map((s) => s.text).join(' ');
    return !istKopfzeile(text) && zeileFinden(text);
  });
  if (ersteMitWert === -1) return null;
  const kopf = kopfLesen(zeilen.slice(Math.max(0, ersteMitWert - 3), ersteMitWert));

  // Gibt es eine Spalte je 100 g, gilt sie. Sonst die Portion, und ganz ohne Kopf die erste Zahl als je 100 g.
  const bezug: GeleseneTabelle['bezug'] = kopf.spalten.some((s) => s.art === 'je100') || kopf.spalten.length === 0 ? 'je100' : 'portion';

  const gelesen: Record<string, number> = {};
  const zweifel: Record<string, Zweifel> = {};
  // Nur Kilojoule gelten erst am Ende: Eine spätere Zeile mit kcal steht genauer auf der Packung.
  let ausKilojoule: number | null = null;
  const uebernehmen = (code: string, z: Zahl | null) => {
    if (!z || gelesen[code] !== undefined) return;
    const fertig = fehlendesG(z, code);
    const wert = inEinheit(fertig, code);
    if (wert === null) return;
    gelesen[code] = wert;
    if (fertig.zweifel) zweifel[code] = fertig.zweifel;
  };

  for (const zeile of zeilen.slice(ersteMitWert)) {
    const text = zeile.map((s) => s.text).join(' ');
    const regel = zeileFinden(text);
    let zahlen = zeile.flatMap(zahlenIn);
    if (!regel) {
      // Steht „364 kcal“ in einer eigenen Zeile unter dem Brennwert
      const kcal = zahlen.filter((z) => z.einheit === 'kcal');
      if (kcal.length > 0) uebernehmen('ENERCC', zahlDerSpalte(kcal, kopf, bezug));
      continue;
    }
    if (regel.code === 'ENERCC') {
      const kcal = zahlen.filter((z) => z.einheit === 'kcal');
      if (kcal.length > 0) {
        uebernehmen('ENERCC', zahlDerSpalte(kcal, kopf, bezug));
        continue;
      }
      const kj = zahlen.filter((z) => z.einheit === 'kJ');
      const z = zahlDerSpalte(kj, kopf, bezug);
      if (z) ausKilojoule ??= Math.round(z.wert / 4.184);
      continue;
    }
    if (regel.einheitNoetig) zahlen = zahlen.filter((z) => z.einheit !== null);
    uebernehmen(regel.code, zahlDerSpalte(zahlen, kopf, bezug));
  }
  if (gelesen.ENERCC === undefined && ausKilojoule !== null) gelesen.ENERCC = ausKilojoule;
  // „1 TL Salz“ und „200 g Zucker“ in einem Rezept sind noch keine Tabelle: Dazu gehört eine Überschrift, der Brennwert oder mehr Zeilen.
  const nennt = zeilen.slice(0, ersteMitWert).some((z) => z.some((s) => /n(ä|ae)hrw|nutrition/i.test(s.text)));
  const istTabelle = kopf.eindeutig || nennt || gelesen.ENERCC !== undefined || Object.keys(gelesen).length >= 3;
  if (!istTabelle || Object.keys(gelesen).length === 0) return null;
  pruefen(gelesen, zweifel, bezug === 'je100');
  return { gelesen, bezug, basis: kopf.basis, portionMenge: kopf.portionMenge, portionName: kopf.portionName, zweifel };
}

const gerundet = (wert: number, stellen: number) => Math.round(wert * 10 ** stellen) / 10 ** stellen;

/** Die Werte je 100 g bzw. 100 ml. Bei einer Portion ohne bekannte Menge: null, dann fragt die Prüfseite danach. */
export function aufHundert(gelesen: Readonly<Record<string, number>>, bezug: GeleseneTabelle['bezug'], portionMenge: number | null): Werte | null {
  if (bezug === 'je100') return gelesen;
  if (!portionMenge || portionMenge <= 0) return null;
  const aus: Record<string, number> = {};
  for (const [code, wert] of Object.entries(gelesen)) {
    const je100 = (wert * 100) / portionMenge;
    aus[code] = code === 'ENERCC' ? Math.round(je100) : gerundet(je100, naehrstoff(code)?.einheit === 'g' ? 1 : 2);
  }
  return aus;
}
