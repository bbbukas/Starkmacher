/**
 * Womit sich die Lücken des Tages füllen lassen (Bauauftrag Abschnitt 8). Jeder Vorschlag hat eine alltagstaugliche
 * Menge und bleibt unter allen Grenzen: Kalorien, Salz, freier Zucker, gesättigte Fettsäuren und die Höchstwerte der EFSA.
 * Reine Rechnung, damit sie sich mit erfundenen Daten prüfen lässt.
 */
import type { Bedarf } from './bedarf';
import { standardUmrechnung, type EintragEinheit, type Groesse, type MengenEinheit, type Umrechnung } from './einheiten';
import { mengeText, zahlText } from './format';
import type { Herkunft, Werte } from './lebensmittel';
import { naehrstoff, type GruppenId } from './naehrstoffe';
import type { Stueckware } from './profil';
import { EPA_DHA_CODE, type Luecke, type Tagessumme } from './tagebuch';

export interface VorschlagKandidat {
  id: string;
  name: string;
  marke: string | null;
  herkunft: Herkunft;
  /** BLS-Code, bei eigenen null. */
  code: string | null;
  werte: Werte;
  freierZuckerG: number | null;
  umrechnung?: Umrechnung;
  /** Nur bei Rezepten und Tellern: Gramm je Portion. Vorgeschlagen wird dann eine ganze oder halbe Portion. */
  portionG?: number;
  portionEinheit?: 'Portion' | 'Teller';
  /** Schon einmal gegessen? Vertrautes kommt etwas eher dran. */
  vertraut?: boolean;
}

export interface Grenze {
  code: string;
  /** So viel darf noch dazukommen. */
  bleibt: number;
}

export interface VorschlagWirkung {
  text: string;
  gruppe: GruppenId;
}

export interface Vorschlag {
  lebensmittelId: string;
  name: string;
  marke: string | null;
  herkunft: Herkunft;
  menge: number;
  einheit: EintragEinheit;
  groesse: Groesse | null;
  gramm: number;
  kcal: number;
  wirkung: VorschlagWirkung[];
  /** Eine kleine Ergänzung wie etwas Öl. */
  klein: boolean;
  punkte: number;
}

export const FREIER_ZUCKER_GRENZE = 'FREIER_ZUCKER';

/** Alle Grenzen des Tages: Kalorien, freier Zucker und jeder Nährstoff mit Obergrenze. */
export function grenzenAus(summe: Tagessumme, bedarf: Bedarf): Grenze[] {
  const grenzen: Grenze[] = [
    { code: 'ENERCC', bleibt: bedarf.kcal - summe.werte.ENERCC!.menge },
    { code: FREIER_ZUCKER_GRENZE, bleibt: bedarf.freierZuckerHoechstG - summe.freierZuckerG.menge },
  ];
  for (const ziel of Object.values(bedarf.ziele)) {
    if (ziel.hoechst !== undefined) grenzen.push({ code: ziel.code, bleibt: ziel.hoechst - (summe.werte[ziel.code]?.menge ?? 0) });
  }
  return grenzen;
}

const wertVon = (k: VorschlagKandidat, code: string): number | undefined => (code === FREIER_ZUCKER_GRENZE ? (k.freierZuckerG ?? undefined) : k.werte[code]);

/** So viele Gramm passen höchstens, ohne eine Grenze zu überschreiten. Ein unbekannter Wert bremst nicht, außer bei den Kalorien. */
export function hoechstenGramm(k: VorschlagKandidat, grenzen: readonly Grenze[]): number {
  let gramm = Number.POSITIVE_INFINITY;
  for (const g of grenzen) {
    const je100 = wertVon(k, g.code);
    if (je100 === undefined || je100 <= 0) continue;
    gramm = Math.min(gramm, Math.max(0, g.bleibt) / (je100 / 100));
  }
  return gramm;
}

/** Eine alltagstaugliche Portion in Gramm. Mehr schlägt das Programm nie auf einmal vor. */
export function typischePortionG(roherName: string, code: string | null): number {
  const name = roherName.toLowerCase();
  const gruppe = code?.[0] ?? '';
  if (gruppe === 'Q' || /[a-zäöüß]öl( |$)|^öl( |$)|^butter|margarine/.test(name)) return 10;
  if (/nuss|nüsse|mandel|kerne|samen|saat|pistazie/.test(name) && !/riegel/.test(name)) return 30;
  if (/dip|dressing|sauce|soße/.test(name)) return 40;
  if (gruppe === 'H') return /gekocht|tofu|sprossen|bohne|linse|erbse/.test(name) ? 150 : 30;
  // Eigene Lebensmittel haben keine Gruppe, dort entscheidet der Name.
  if (gruppe === 'M' || gruppe === '') {
    if (/milch|kefir|drink/.test(name)) return 200;
    if (/quark|joghurt|skyr|hüttenkäse/.test(name)) return 150;
    if (gruppe === 'M' || /käse/.test(name)) return 40;
  }
  if (gruppe === 'E') return /hühnerei/.test(name) ? 60 : 150;
  if (gruppe === 'B') return 50;
  if (gruppe === 'C') return /flocken|müsli|cornflakes/.test(name) ? 50 : 150;
  if (gruppe === 'K') return 200;
  if (gruppe === 'T' || gruppe === 'U' || gruppe === 'V') return 125;
  if (gruppe === 'W') return 30;
  if (gruppe === 'F' || gruppe === 'G') return 150;
  return 100;
}

/**
 * Die Alltagsliste: gewöhnliche Lebensmittel in einer üblichen Zubereitung, genau wie sie im BLS heißen. Würde das
 * Programm aus allen 7.140 Einträgen wählen, gewönne rechnerisch das Exotischste (200 g Nährhefe, Kaviar, Hummer).
 * tests/blsEcht.test.ts prüft, dass es jeden Namen wirklich gibt. Eigene Lebensmittel taugen immer.
 */
export const ALLTAGS_NAMEN: ReadonlySet<string> = new Set([
  // Milchprodukte und Eier
  'Skyr, Frischkäse < 10 % Fett i. Tr.',
  'Speisequark Magerstufe, Magerquark < 10 % Fett i. Tr.',
  'Körniger Frischkäse < 10 % Fett i. Tr.',
  'Joghurt fettarm, mind. 1,5 % bis max. 1,8 % Fett',
  'Joghurt mild, mind. 3,5 % Fett',
  'Milch fettarm, frisch, 1,5 % Fett, pasteurisiert',
  'Vollmilch frisch, 3,5 % Fett, pasteurisiert',
  'Kefir fettarm, mind. 1,5 % bis max. 1,8 % Fett',
  'Buttermilch',
  'Emmentaler mind. 45 % Fett i. Tr.',
  'Gouda mind. 40 % Fett i. Tr.',
  'Feta mind. 45 % Fett i. Tr.',
  'Mozzarella mind. 45 % Fett i. Tr.',
  'Parmesan mind. 30 % Fett i. Tr.',
  'Hühnerei roh',
  // Getreide und Kartoffeln
  'Hafer Flocken',
  'Reis unpoliert, gekocht',
  'Reis poliert, gekocht',
  'Teigwaren eifrei, gekocht',
  'Roggenvollkornbrot',
  'Weizenvollkornbrot',
  'Roggenmischbrot',
  'Kartoffel geschält, gekocht',
  'Kartoffel ungeschält, gekocht',
  'Batate/Süßkartoffel, gekocht',
  // Hülsenfrüchte, Nüsse und Samen
  'Linse reif, gekocht',
  'Linse rot, reif, gekocht',
  'Kichererbse reif, gekocht',
  'Kidneybohne reif, gekocht',
  'Erbse grün, gekocht',
  'Tofu',
  'Sojadrink ungesüßt, angereichert mit Vitaminen und Calcium',
  'Haferdrink ungesüßt, angereichert mit Vitaminen, Calcium und Jod',
  'Erdnuss geröstet',
  'Walnuss',
  'Mandel süß',
  'Haselnuss',
  'Paranuss',
  'Kürbiskern',
  'Sonnenblumenkern',
  'Leinsamen geschrotet',
  'Sesam',
  // Fisch und Fleisch
  'Lachs gedünstet',
  'Lachs gegrillt',
  'Hering gebraten ohne Fett (Pfanne)',
  'Makrele gegrillt',
  'Thunfisch gegrillt',
  'Dorsch/Kabeljau, gedünstet',
  'Hähnchen Brustfilet, gegrillt',
  'Pute Fleisch, ohne Haut, gekocht',
  'Rind Hackfleisch, gebraten ohne Fett (Pfanne)',
  // Gemüse
  'Spinat gedünstet',
  'Broccoli gedünstet',
  'Grünkohl gekocht',
  'Blumenkohl gedünstet',
  'Karotte/Möhre, roh',
  'Karotte/Möhre, gekocht',
  'Gemüsepaprika rot, roh',
  'Tomate roh',
  'Gurke roh',
  'Kohlrabi roh',
  'Zucchini gedünstet',
  'Feldsalat/Rapunzel, roh',
  'Rucola roh',
  'Kopfsalat roh',
  'Mais gekocht',
  'Avocado roh',
  // Obst
  'Apfel roh',
  'Birne roh',
  'Banane roh',
  'Erdbeere roh',
  'Himbeere roh',
  'Heidelbeere roh',
  'Weintraube roh',
  'Aprikose getrocknet',
  'Pflaume getrocknet',
  // Öle, als kleine Ergänzung
  'Rapsöl/Rüböl',
  'Olivenöl',
  'Leinöl',
  'Walnussöl',
]);

/** Taugt dieser BLS-Eintrag als Vorschlag? */
export const taugtAlsVorschlag = (name: string) => ALLTAGS_NAMEN.has(name);

const abrunden = (gramm: number) => (gramm >= 100 ? Math.floor(gramm / 10) * 10 : gramm >= 20 ? Math.floor(gramm / 5) * 5 : Math.floor(gramm));

/**
 * Die Menge in Alltagsworten: ein Ei in Stück, Öl in Löffeln, sonst Gramm. Rundet nur ab, damit keine Grenze
 * durch die schöne Zahl überschritten wird.
 */
export function mengeFuerVorschlag(gramm: number, u: Umrechnung, stueckware: Stueckware): { menge: number; einheit: MengenEinheit; groesse: Groesse | null; gramm: number } | null {
  if (u.groessen && stueckware === 'groesse') {
    const stueck = Math.floor(gramm / u.groessen.M);
    if (stueck >= 1) return { menge: Math.min(stueck, 2), einheit: 'Stück', groesse: 'M', gramm: Math.min(stueck, 2) * u.groessen.M };
  }
  if (u.stueck && !u.groessen) {
    const stueck = Math.floor(gramm / u.stueck);
    if (stueck >= 1) return { menge: Math.min(stueck, 3), einheit: 'Stück', groesse: null, gramm: Math.min(stueck, 3) * u.stueck };
  }
  if (gramm <= 15 && u.el === 10 && gramm >= u.el) return { menge: 1, einheit: 'EL', groesse: null, gramm: u.el };
  if (gramm <= 15 && u.tl <= gramm) {
    const tl = Math.floor(gramm / u.tl);
    if (u.tl === 4) return { menge: tl, einheit: 'TL', groesse: null, gramm: tl * u.tl };
  }
  const g = abrunden(gramm);
  return g >= 1 ? { menge: g, einheit: 'g', groesse: null, gramm: g } : null;
}

/** Eine kleine Portion lohnt sich nur bis zu einem Mindestmaß, sonst steht „3 g Skyr“ da. */
const MINDEST_ANTEIL = 0.35;
const LUECKE_MINIMUM_GEWICHT = 1;
const LUECKE_OPTIMUM_GEWICHT = 0.35;
const KCAL_GEWICHT = 0.25;

function gewinn(k: VorschlagKandidat, gramm: number, l: Luecke): number {
  if (l.code === EPA_DHA_CODE) return (((k.werte['F20:5CN3'] ?? 0) + (k.werte['F22:6CN3'] ?? 0)) * 1000 * gramm) / 100;
  return ((k.werte[l.code] ?? 0) * gramm) / 100;
}

function punkteFuer(k: VorschlagKandidat, gramm: number, luecken: readonly Luecke[], kcalFrei: number): number {
  let punkte = 0;
  for (const l of luecken) {
    const anteil = Math.min(1, gewinn(k, gramm, l) / l.fehlt);
    punkte += anteil * l.gewicht * (l.stufe === 'minimum' ? LUECKE_MINIMUM_GEWICHT : LUECKE_OPTIMUM_GEWICHT);
  }
  const kcal = ((k.werte.ENERCC ?? 0) * gramm) / 100;
  // Wenig Energie für viel Nutzen ist besser, solange noch Lücken offen sind.
  const anteilKcal = kcalFrei > 0 ? kcal / kcalFrei : 1;
  return punkte + Math.min(anteilKcal, 0.5) * KCAL_GEWICHT - anteilKcal * 0.5;
}

const ZUERST = new Set(['PROT625', 'FIBT', EPA_DHA_CODE]);

function wirkungFuer(k: VorschlagKandidat, gramm: number, luecken: readonly Luecke[]): VorschlagWirkung[] {
  const bewertet = luecken
    .map((l) => ({ l, gewinn: gewinn(k, gramm, l) }))
    .filter((x) => x.gewinn > 0)
    .map((x) => ({ ...x, anteil: Math.min(1, x.gewinn / x.l.fehlt) * x.l.gewicht }))
    .filter((x) => x.anteil >= 0.08)
    // Eiweiß, Ballaststoffe sowie EPA und DHA zuerst: Das ist es, was man an einem Lebensmittel sucht.
    .sort((a, b) => Number(ZUERST.has(b.l.code)) - Number(ZUERST.has(a.l.code)) || b.anteil - a.anteil)
    .slice(0, 3);
  const wirkung: VorschlagWirkung[] = [];
  for (const { l, gewinn: g } of bewertet) {
    if (l.code === EPA_DHA_CODE) wirkung.push({ text: `+${zahlText(g)} mg EPA und DHA`, gruppe: 'fettsaeuren' });
    else {
      const n = naehrstoff(l.code);
      if (n) wirkung.push({ text: `+${mengeText(g, n)} ${l.name}`, gruppe: n.gruppe });
    }
  }
  return wirkung;
}

/** Der erste Teil des Namens, damit nicht fünfmal Lachs dasteht. */
const stamm = (name: string) => name.toLowerCase().split(/[ ,/(-]/)[0] ?? name;

export interface VorschlagOptionen {
  anzahl?: number;
  stueckware?: Stueckware;
}

function mengeFuerLebensmittel(k: VorschlagKandidat, passt: number, stueckware: Stueckware) {
  const portion = typischePortionG(k.name, k.code);
  const moeglich = Math.min(portion, passt);
  if (moeglich < portion * MINDEST_ANTEIL) return null;
  return mengeFuerVorschlag(moeglich, k.umrechnung ?? standardUmrechnung(k.name, k.code), stueckware);
}

/** Ein Rezept oder Teller kommt ganz oder halb. */
function mengeFuerRezept(portionG: number, passt: number, einheit: EintragEinheit): { menge: number; einheit: EintragEinheit; groesse: null; gramm: number } | null {
  if (passt >= portionG) return { menge: 1, einheit, groesse: null, gramm: portionG };
  if (passt >= portionG / 2) return { menge: 0.5, einheit, groesse: null, gramm: portionG / 2 };
  return null;
}

export function vorschlagen(kandidaten: readonly VorschlagKandidat[], luecken: readonly Luecke[], grenzen: readonly Grenze[], optionen: VorschlagOptionen = {}): Vorschlag[] {
  const anzahl = optionen.anzahl ?? 4;
  const stueckware = optionen.stueckware ?? 'groesse';
  if (luecken.length === 0) return [];
  const kcalFrei = grenzen.find((g) => g.code === 'ENERCC')?.bleibt ?? 0;

  const bewertet: Vorschlag[] = [];
  for (const k of kandidaten) {
    if (k.werte.ENERCC === undefined) continue; // Ohne Kalorien lässt sich die Grenze nicht einhalten.
    const passt = hoechstenGramm(k, grenzen);
    const menge = k.portionG ? mengeFuerRezept(k.portionG, passt, k.portionEinheit ?? 'Portion') : mengeFuerLebensmittel(k, passt, stueckware);
    if (!menge || menge.gramm > passt) continue;
    const eigen = k.herkunft !== 'bls';
    const wirkung = wirkungFuer(k, menge.gramm, luecken);
    if (wirkung.length === 0) continue;
    const punkte = punkteFuer(k, menge.gramm, luecken, kcalFrei) * (eigen ? 1.25 : 1) * (k.vertraut ? 1.15 : 1);
    if (punkte <= 0) continue;
    bewertet.push({
      lebensmittelId: k.id,
      name: k.name,
      marke: k.marke,
      herkunft: k.herkunft,
      menge: menge.menge,
      einheit: menge.einheit,
      groesse: menge.groesse,
      gramm: menge.gramm,
      kcal: (k.werte.ENERCC * menge.gramm) / 100,
      wirkung,
      klein: menge.gramm <= 15,
      punkte,
    });
  }
  bewertet.sort((a, b) => b.punkte - a.punkte || a.name.localeCompare(b.name, 'de'));

  // Abwechslung: jeder Stamm nur einmal, je BLS-Gruppe ein Vorschlag, von Eigenem höchstens zwei.
  const aus: Vorschlag[] = [];
  const staemme = new Set<string>();
  const gruppen = new Map<string, number>();
  const gruppeVon = (v: Vorschlag) => (v.herkunft === 'bls' ? blsGruppe(kandidaten, v.lebensmittelId) : 'eigen');
  const passtDazu = (v: Vorschlag) => {
    const gruppe = gruppeVon(v);
    return !staemme.has(stamm(v.name)) && (gruppen.get(gruppe) ?? 0) < (gruppe === 'eigen' ? 2 : 1);
  };
  const nehmen = (v: Vorschlag) => {
    aus.push(v);
    staemme.add(stamm(v.name));
    gruppen.set(gruppeVon(v), (gruppen.get(gruppeVon(v)) ?? 0) + 1);
  };
  for (const v of bewertet) {
    if (aus.length >= anzahl) break;
    if (passtDazu(v)) nehmen(v);
  }
  // Eine kleine Ergänzung darf dabei sein, wenn sie etwas bringt.
  if (!aus.some((v) => v.klein)) {
    const klein = bewertet.find((v) => v.klein);
    if (klein) {
      if (aus.length >= anzahl) aus.pop();
      aus.push(klein);
    }
  }
  return aus;
}

const blsGruppe = (kandidaten: readonly VorschlagKandidat[], id: string) => kandidaten.find((k) => k.id === id)?.code?.[0] ?? '';
