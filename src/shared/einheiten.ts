/**
 * Mengen und Einheiten (Bauauftrag 5.4). Gerechnet wird immer in Gramm, in der Anzeige bleibt ein EL ein EL.
 * Der BLS kennt keine Gewichte für EL, Stück oder Dichte. Die Standardwerte hier sind übliche Küchenwerte für den
 * essbaren Anteil („ungefähr reicht“), und jedes Lebensmittel lässt sich einzeln anpassen.
 */
import { StarkFehler } from './fehler';

export type MengenEinheit = 'g' | 'kg' | 'ml' | 'l' | 'EL' | 'TL' | 'Prise' | 'Stück' | 'Scheibe' | 'Dose' | 'Becher' | 'Packung';
export type Groesse = 'S' | 'M' | 'L';

export const EINHEITEN: readonly { id: MengenEinheit; titel: string }[] = [
  { id: 'g', titel: 'g' },
  { id: 'kg', titel: 'kg' },
  { id: 'ml', titel: 'ml' },
  { id: 'l', titel: 'l' },
  { id: 'EL', titel: 'EL' },
  { id: 'TL', titel: 'TL' },
  { id: 'Prise', titel: 'Prise' },
  { id: 'Stück', titel: 'Stück' },
  { id: 'Scheibe', titel: 'Scheibe' },
  { id: 'Dose', titel: 'Dose' },
  { id: 'Becher', titel: 'Becher' },
  { id: 'Packung', titel: 'Packung' },
];

export interface Umrechnung {
  /** Gramm je Milliliter. */
  dichte: number;
  el: number;
  tl: number;
  prise: number;
  /** Gramm je Stück, null: unbekannt. */
  stueck: number | null;
  /** Bei Eiern und anderer Stückware nach Größe. Dann gilt das statt `stueck`. */
  groessen: Readonly<Record<Groesse, number>> | null;
  scheibe: number | null;
  /** Füllmenge bzw. Abtropfgewicht laut Packung. */
  dose: number | null;
  becher: number | null;
  packung: number | null;
}

export const GRUNDWERTE: Umrechnung = { dichte: 1, el: 15, tl: 5, prise: 0.5, stueck: null, groessen: null, scheibe: null, dose: null, becher: null, packung: null };

type Teil = Partial<Umrechnung>;

/** Die erste passende Regel gilt. Muster laufen über den kleingeschriebenen Namen, `gruppen` über den BLS-Code. */
const LOEFFEL: readonly { muster: RegExp; gruppen?: string; werte: Teil }[] = [
  { muster: /mayonnaise|salatcreme/, gruppen: 'Q', werte: { dichte: 0.95, el: 15, tl: 5 } },
  { muster: /butter|margarine|schmalz|fett|plattenfett/, gruppen: 'Q', werte: { dichte: 0.92, el: 15, tl: 5 } },
  { muster: /./, gruppen: 'Q', werte: { dichte: 0.92, el: 10, tl: 4 } },
  { muster: /^[^ ]*öl( |$)/, werte: { dichte: 0.92, el: 10, tl: 4 } },
  { muster: /honig|sirup|dicksaft|melasse|malzextrakt/, werte: { dichte: 1.4, el: 20, tl: 7 } },
  { muster: /puderzucker/, werte: { dichte: 0.6, el: 10, tl: 3 } },
  { muster: /(^|[^a-zäöüß])zucker|vanillinzucker|traubenzucker|rohrzucker/, werte: { dichte: 0.85, el: 15, tl: 5 } },
  { muster: /salz/, gruppen: 'R', werte: { dichte: 1.2, el: 18, tl: 6 } },
  { muster: /backpulver|natron|hirschhorn|pottasche/, werte: { el: 12, tl: 4 } },
  { muster: /mehl|stärke|grieß|paniermehl|semmelbrösel|grütze/, werte: { dichte: 0.6, el: 10, tl: 3 } },
  { muster: /flocken|müsli|cornflakes|cerealien|pops/, werte: { dichte: 0.4, el: 8, tl: 3 } },
  { muster: /(^|[^a-zäöüß])reis |couscous|bulgur|hirse|quinoa|amaranth/, werte: { dichte: 0.8, el: 15, tl: 5 } },
  { muster: /kakao.*pulver|instantpulver|pulver/, werte: { dichte: 0.5, el: 8, tl: 3 } },
  { muster: /./, gruppen: 'H', werte: { el: 10, tl: 3 } },
  { muster: /pfeffer|paprika|zimt|kurkuma|kümmel|muskat|curry|kräuter|gewürz/, gruppen: 'R', werte: { el: 7, tl: 2 } },
  { muster: /senf|ketchup|tomatenmark|mark|paste|meerrettich/, werte: { dichte: 1.1, el: 20, tl: 6 } },
  { muster: /quark|joghurt|skyr|schmand|crème|creme|frischkäse|saure sahne/, gruppen: 'M', werte: { dichte: 1.05, el: 20, tl: 7 } },
  { muster: /sahne|milch|buttermilch|kefir/, gruppen: 'M', werte: { dichte: 1.03, el: 15, tl: 5 } },
  { muster: /essig|saft|wein|bier|limonade|nektar/, werte: { dichte: 1.03, el: 15, tl: 5 } },
  { muster: /spirituose|likör|korn|wodka|whisky|rum|weinbrand|schnaps/, werte: { dichte: 0.95, el: 15, tl: 5 } },
];

const NICHT_ALS_STUECK = /saft|mus|pulver|getrocknet|konserve|konzentrat|chips|nektar|konfitüre|kuchen|salat|suppe|mehl|stärke|püree|gewürz|essig/;

/** Mittlere Gewichte ohne Schale und Kerngehäuse. */
const STUECKE: readonly [RegExp, number][] = [
  [/^apfel\b/, 140],
  [/^birne\b/, 140],
  [/^banane\b/, 115],
  [/^orange\b|^apfelsine\b/, 150],
  [/^mandarine\b|^clementine\b|^satsuma\b/, 60],
  [/^kiwi/, 75],
  [/^pfirsich\b|^nektarine\b/, 125],
  [/^aprikose\b/, 40],
  [/^pflaume\b|^zwetsch/, 35],
  [/^zitrone\b/, 80],
  [/^limette\b/, 45],
  [/^avocado\b/, 140],
  [/^mango\b/, 300],
  [/^tomate\b/, 90],
  [/^kartoffel\b/, 90],
  [/^speisezwiebel\b|^zwiebel\b/, 80],
  [/^schalotte\b/, 25],
  [/^knoblauch\b/, 3],
  [/^karotte\b|^möhre\b/, 70],
  [/^gemüsepaprika\b/, 140],
  [/^gurke\b|^salatgurke\b/, 350],
  [/^zucchini\b/, 200],
  [/^aubergine\b/, 250],
  [/^champignon\b/, 20],
  [/brötchen|semmel/, 50],
  [/^croissant/, 45],
];

const BECHER: readonly [RegExp, number][] = [
  [/skyr|joghurt/, 150],
  [/quark/, 250],
  [/saure sahne|schmand|crème fraîche|creme fraiche/, 150],
  [/sahne/, 200],
  [/kefir|buttermilch/, 500],
];

/** Hühnereier nach EU-Größenklassen, ohne Schale: S unter 53 g, M 53–63 g, L 63–73 g mit Schale. */
export const EI_GROESSEN: Readonly<Record<Groesse, number>> = { S: 44, M: 52, L: 60 };

function scheibeFuer(name: string, gruppe: string): number | null {
  if (gruppe === 'B') return /toast/.test(name) ? 28 : /knäcke|zwieback/.test(name) ? 10 : /brötchen|semmel/.test(name) ? null : 45;
  if (gruppe === 'M' && /gouda|edamer|emmentaler|tilsiter|butterkäse|bergkäse|cheddar|schnittkäse|schmelzkäse|leerdamer|maasdamer/.test(name)) return 25;
  if (gruppe === 'W') return /schinken/.test(name) ? 25 : /salami/.test(name) ? 8 : 15;
  return null;
}

/** Sinnvolle Standardwerte aus Name und BLS-Code. Bei eigenen Lebensmitteln fehlt der Code. */
export function standardUmrechnung(roherName: string, code: string | null): Umrechnung {
  const name = roherName.toLowerCase();
  const gruppe = code?.[0] ?? '';
  // Eigene Lebensmittel haben keine Gruppe: Für sie zählt nur der Name, nie eine Regel, die für die ganze Gruppe gilt.
  const passtZurGruppe = (r: (typeof LOEFFEL)[number]) => r.gruppen === undefined || (gruppe === '' ? r.muster.source !== '.' : r.gruppen.includes(gruppe));
  const loeffel = LOEFFEL.find((r) => passtZurGruppe(r) && r.muster.test(name))?.werte ?? {};
  const aus: Umrechnung = { ...GRUNDWERTE, ...loeffel, scheibe: scheibeFuer(name, gruppe) };

  if (/^(hühner)?ei\b|^hühnerei( roh|,|$)/.test(name) && !/pulver|getrocknet|eigelb|eiklar/.test(name)) return { ...aus, groessen: EI_GROESSEN };
  if (/^hühnerei eigelb/.test(name) && !/pulver|getrocknet/.test(name)) return { ...aus, stueck: 17 };
  if (/^hühnerei eiklar/.test(name) && !/pulver|getrocknet/.test(name)) return { ...aus, stueck: 33 };
  if (!NICHT_ALS_STUECK.test(name)) {
    const stueck = STUECKE.find(([m]) => m.test(name))?.[1];
    if (stueck !== undefined) aus.stueck = stueck;
  }
  if (gruppe === 'M' || gruppe === '') {
    const becher = BECHER.find(([m]) => m.test(name))?.[1];
    if (becher !== undefined) aus.becher = becher;
  }
  return aus;
}

/** Die für die Einheit nötige Zahl: Gramm je Einheit. Null: Das Lebensmittel weiß es noch nicht. */
export function grammJeEinheit(einheit: MengenEinheit, u: Umrechnung, groesse: Groesse = 'M'): number | null {
  switch (einheit) {
    case 'g':
      return 1;
    case 'kg':
      return 1000;
    case 'ml':
      return u.dichte;
    case 'l':
      return u.dichte * 1000;
    case 'EL':
      return u.el;
    case 'TL':
      return u.tl;
    case 'Prise':
      return u.prise;
    case 'Stück':
      return u.groessen ? u.groessen[groesse] : u.stueck;
    case 'Scheibe':
      return u.scheibe;
    case 'Dose':
      return u.dose;
    case 'Becher':
      return u.becher;
    case 'Packung':
      return u.packung;
  }
}

export function inGramm(menge: number, einheit: MengenEinheit, u: Umrechnung, groesse?: Groesse): number | null {
  const je = grammJeEinheit(einheit, u, groesse);
  return je === null ? null : menge * je;
}

/** Umgerechnete Werte zeigt das Programm mit „≈“ an. Nur Gramm und Kilogramm sind genau. */
export const istUngefaehr = (einheit: MengenEinheit) => einheit !== 'g' && einheit !== 'kg';

/** Das Feld, in dem eine Umrechnung steht, die das Lebensmittel noch nicht kennt. */
export function feldFuerEinheit(einheit: MengenEinheit): 'stueck' | 'scheibe' | 'dose' | 'becher' | 'packung' | null {
  switch (einheit) {
    case 'Stück':
      return 'stueck';
    case 'Scheibe':
      return 'scheibe';
    case 'Dose':
      return 'dose';
    case 'Becher':
      return 'becher';
    case 'Packung':
      return 'packung';
    default:
      return null;
  }
}

const gramm = (wert: unknown): wert is number => typeof wert === 'number' && Number.isFinite(wert) && wert > 0 && wert <= 100_000;

/** Prüft, was von der Oberfläche kommt. Bei einer Zahl außerhalb der Grenzen sagt es, welche nicht stimmt. */
export function umrechnungPruefen(roh: unknown): Umrechnung {
  if (typeof roh !== 'object' || roh === null) throw new StarkFehler('UNGUELTIG', 'Die Umrechnung stimmt nicht.');
  const u = roh as Record<string, unknown>;
  for (const feld of ['el', 'tl', 'prise'] as const) {
    if (!gramm(u[feld])) throw new StarkFehler('UNGUELTIG', 'Die Umrechnung stimmt nicht.');
  }
  if (typeof u.dichte !== 'number' || !(u.dichte >= 0.1 && u.dichte <= 3)) throw new StarkFehler('UNGUELTIG', 'Die Dichte stimmt nicht.');
  const offen = (wert: unknown): number | null => {
    if (wert === null || wert === undefined) return null;
    if (!gramm(wert)) throw new StarkFehler('UNGUELTIG', 'Die Umrechnung stimmt nicht.');
    return wert;
  };
  let groessen: Umrechnung['groessen'] = null;
  if (u.groessen) {
    const g = u.groessen as Record<string, unknown>;
    if (!gramm(g.S) || !gramm(g.M) || !gramm(g.L)) throw new StarkFehler('UNGUELTIG', 'Die Stückgrößen stimmen nicht.');
    groessen = { S: g.S, M: g.M, L: g.L };
  }
  return {
    dichte: u.dichte,
    el: u.el as number,
    tl: u.tl as number,
    prise: u.prise as number,
    stueck: offen(u.stueck),
    groessen,
    scheibe: offen(u.scheibe),
    dose: offen(u.dose),
    becher: offen(u.becher),
    packung: offen(u.packung),
  };
}
