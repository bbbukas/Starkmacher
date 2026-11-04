/**
 * Liest ein Rezept aus dem, was das Hilfsprogramm auf dem Foto erkannt hat (Bauauftrag Abschnitt 6): Name, Portionen,
 * Zutaten mit Menge und Einheit, Zubereitung. Das Ergebnis ist nie endgültig: Es landet auf der Prüfseite.
 * Reine Rechnung, damit sie sich mit erfundenen Beispielen prüfen lässt.
 */
import type { Groesse, MengenEinheit } from './einheiten';
import { zeilenOrdnen, type TextStueck } from './fotoText';
import { sortierteTreffer, suchText, suchWorte } from './suche';

export interface GeleseneZutat {
  /** So steht die Zeile auf dem Foto. */
  zeile: string;
  /** Wonach in den Lebensmitteln gesucht wird. */
  name: string;
  /** Null: Auf dem Foto steht keine Menge. */
  menge: number | null;
  einheit: MengenEinheit | null;
  groesse: Groesse | null;
  /** Warum diese Zeile auf der Prüfseite markiert ist. Null: alles klar. */
  unklar: string | null;
}

export interface GelesenesRezept {
  name: string;
  portionen: number | null;
  zutaten: GeleseneZutat[];
  /** Jede Zeile ein Schritt. */
  zubereitung: string;
}

const BRUECHE: Readonly<Record<string, number>> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const ZAHLWORTE: Readonly<Record<string, number>> = { ein: 1, eine: 1, einen: 1, einem: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, halbe: 0.5, halber: 0.5, halbes: 0.5, halben: 0.5 };

/** Einheiten, die das Programm kennt. `faktor` rechnet zum Beispiel Zentiliter in Milliliter um. */
const EINHEITEN: readonly { muster: RegExp; einheit: MengenEinheit; faktor?: number }[] = [
  { muster: /^(g|gr|gramm)\.?$/i, einheit: 'g' },
  { muster: /^(kg|kilo|kilogramm)\.?$/i, einheit: 'kg' },
  { muster: /^(ml|milliliter)\.?$/i, einheit: 'ml' },
  { muster: /^cl\.?$/i, einheit: 'ml', faktor: 10 },
  { muster: /^dl\.?$/i, einheit: 'ml', faktor: 100 },
  { muster: /^(l|ltr|liter)\.?$/i, einheit: 'l' },
  { muster: /^(el|essl|esslöffel|eßl|eßlöffel)\.?$/i, einheit: 'EL' },
  { muster: /^(tl|teel|teelöffel)\.?$/i, einheit: 'TL' },
  { muster: /^(prise|prisen|msp|messerspitze|messerspitzen)\.?$/i, einheit: 'Prise' },
  { muster: /^(stück|stücke|stk|st)\.?$/i, einheit: 'Stück' },
  { muster: /^(zehe|zehen)\.?$/i, einheit: 'Stück' },
  { muster: /^(scheibe|scheiben)\.?$/i, einheit: 'Scheibe' },
  { muster: /^(dose|dosen)\.?$/i, einheit: 'Dose' },
  { muster: /^becher\.?$/i, einheit: 'Becher' },
  { muster: /^(packung|packungen|pck|pkg|pack|päckchen|päckchen|tüte|tüten)\.?$/i, einheit: 'Packung' },
];

/** Küchenmaße, die das Programm nicht führt. Sie werden grob umgerechnet und auf der Prüfseite markiert. */
const GROB: readonly { muster: RegExp; menge: number; einheit: MengenEinheit; text: string }[] = [
  { muster: /^bund\.?$/i, menge: 40, einheit: 'g', text: 'Bund' },
  { muster: /^(handvoll|hand)$/i, menge: 30, einheit: 'g', text: 'Handvoll' },
  { muster: /^(tasse|tassen)$/i, menge: 150, einheit: 'ml', text: 'Tasse' },
  { muster: /^(glas|gläser)$/i, menge: 200, einheit: 'g', text: 'Glas' },
  { muster: /^(schuss|schluck)$/i, menge: 10, einheit: 'ml', text: 'Schuss' },
  { muster: /^(spritzer)$/i, menge: 2, einheit: 'ml', text: 'Spritzer' },
  { muster: /^(zweig|zweige|stiel|stiele)$/i, menge: 2, einheit: 'g', text: 'Zweig' },
  { muster: /^(blatt|blätter)$/i, menge: 1, einheit: 'g', text: 'Blatt' },
  { muster: /^(stange|stangen)$/i, menge: 60, einheit: 'g', text: 'Stange' },
  { muster: /^(kopf|köpfe)$/i, menge: 500, einheit: 'g', text: 'Kopf' },
];

/** Für Gewürze ohne Menge reicht die Prise als Vorschlag. Andere Zutaten ohne Menge muss man selbst ausfüllen. */
const GEWUERZ = /^(salz|pfeffer|muskat|muskatnuss|zimt|paprikapulver|paprika|cayennepfeffer|chili|chilipulver|kurkuma|kreuzkümmel|kümmel|oregano|thymian|basilikum|majoran|rosmarin|curry|currypulver|zucker|meersalz)\b/i;

/** Leseslips, die in Rezepten immer wieder vorkommen (Phase 0, Abschnitt 7). */
export function textSaeubern(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/(?<![A-Za-zÄÖÜäöüß])(ÖI|Ol|OI|Ö1|O1)(?![A-Za-zÄÖÜäöüß])/g, 'Öl')
    .replace(/\b(oliven|raps|sonnenblumen|sesam|lein|walnuss|kokos|erdnuss|pflanzen|speise)(ol|oI|öI)\b/gi, (_ganz, wort: string) => `${wort}öl`)
    .trim();
}

function mengeLesen(rest: string): { menge: number; rest: string; spanne: boolean } | null {
  const t = rest.replace(/^(ca\.?|circa|etwa|ungefähr|gut|knapp|rund)\s+/i, '');
  const m1 = /^(\d+)\s+(\d+)\s*\/\s*(\d+)(?=\s|$)/.exec(t);
  if (m1 && Number(m1[3]) > 0) return { menge: Number(m1[1]) + Number(m1[2]) / Number(m1[3]), rest: t.slice(m1[0].length), spanne: false };
  const m2 = /^(\d+)\s*\/\s*(\d+)(?=\s|$)/.exec(t);
  if (m2 && Number(m2[2]) > 0) return { menge: Number(m2[1]) / Number(m2[2]), rest: t.slice(m2[0].length), spanne: false };
  const m3 = /^(\d+)?\s*([½¼¾⅓⅔⅛])/.exec(t);
  if (m3) return { menge: Number(m3[1] ?? 0) + BRUECHE[m3[2]!]!, rest: t.slice(m3[0].length), spanne: false };
  const m4 = /^(\d+(?:[.,]\d+)?)\s*(?:-|–|bis)\s*(\d+(?:[.,]\d+)?)/.exec(t);
  if (m4) return { menge: (Number(m4[1]!.replace(',', '.')) + Number(m4[2]!.replace(',', '.'))) / 2, rest: t.slice(m4[0].length), spanne: true };
  const m5 = /^(\d+(?:[.,]\d+)?)/.exec(t);
  if (m5) return { menge: Number(m5[1]!.replace(',', '.')), rest: t.slice(m5[0].length), spanne: false };
  // „l EL“ und „I TL“: Das erste Zeichen ist eine 1, die falsch gelesen wurde.
  const m6 = /^[lI]\s+(?=(el|tl|prise|dose|becher|stück|packung|scheibe|zehe)\b)/i.exec(t);
  if (m6) return { menge: 1, rest: t.slice(m6[0].length), spanne: false };
  const wort = /^([a-zäöüß]+)\s+/i.exec(t);
  if (wort && ZAHLWORTE[wort[1]!.toLowerCase()] !== undefined) return { menge: ZAHLWORTE[wort[1]!.toLowerCase()]!, rest: t.slice(wort[0].length), spanne: false };
  return null;
}

/** Name, ohne das, was nur zur Zubereitung gehört: „Zwiebel, fein gewürfelt“, „Butter (weich)“, „Öl zum Braten“. */
function nameSaeubern(roh: string): string {
  return roh
    .replace(/\([^)]*\)?/g, ' ')
    .split(/,|;| zum | für | nach Geschmack| nach Belieben| zum Abschmecken/i)[0]!
    .replace(/\s+/g, ' ')
    .replace(/^(von|vom|der|die|das|etwas|frische[rsn]?|frisch|kleine[rsn]?|große[rsn]?|mittelgroße[rsn]?|gehackte[rsn]?|geriebene[rsn]?|getrocknete[rsn]?)\s+/i, '')
    .trim();
}

/** „(240 g)“ oder „à 200 g“: das Gewicht, das auf der Packung steht. */
function klammerGewicht(text: string): { menge: number; einheit: 'g' | 'ml' } | null {
  const m = /(?:\(|à\s*|a\s+)\s*(?:ca\.?\s*)?(?:à\s*)?(\d+(?:[.,]\d+)?)\s*(g|ml|kg|l)\b/i.exec(text);
  if (!m) return null;
  const wert = Number(m[1]!.replace(',', '.'));
  const einheit = m[2]!.toLowerCase();
  if (einheit === 'kg') return { menge: wert * 1000, einheit: 'g' };
  if (einheit === 'l') return { menge: wert * 1000, einheit: 'ml' };
  return { menge: wert, einheit: einheit as 'g' | 'ml' };
}

/** Zerlegt eine Zutatenzeile. Null: Das ist keine Zutat, zum Beispiel eine Zwischenüberschrift. */
export function zutatLesen(roheZeile: string): GeleseneZutat[] {
  const zeile = textSaeubern(roheZeile).replace(/^[•·\-–*]\s*/, '');
  if (zeile.length < 2 || /:$/.test(zeile) || !/[a-zäöüß]/i.test(zeile)) return [];
  const gelesen = mengeLesen(zeile);

  if (!gelesen) {
    // Ohne Menge: „Salz und Pfeffer“ sind zwei Zutaten.
    const teile = zeile
      .split(/\s+und\s+|,\s*|\s+\+\s+/)
      .map(nameSaeubern)
      .filter((t) => t.length > 1);
    const alleGewuerz = teile.length > 1 && teile.every((t) => GEWUERZ.test(t));
    return (alleGewuerz ? teile : [nameSaeubern(zeile)]).filter(Boolean).map((name) => {
      const gewuerz = GEWUERZ.test(name);
      return {
        zeile,
        name,
        menge: gewuerz ? 1 : null,
        einheit: gewuerz ? 'Prise' : null,
        groesse: null,
        unklar: gewuerz ? 'Auf dem Foto steht keine Menge, angenommen ist eine Prise.' : 'Auf dem Foto steht keine Menge.',
      };
    });
  }

  const rest = gelesen.rest.trim();
  const erstes = /^([^\s]+)\s*/.exec(rest);
  const wort = erstes?.[1] ?? '';
  const einheit = EINHEITEN.find((e) => e.muster.test(wort));
  const grob = GROB.find((e) => e.muster.test(wort));
  const nachEinheit = einheit || grob ? rest.slice(erstes![0].length) : rest;
  const name = nameSaeubern(nachEinheit);
  const unklarSpanne = gelesen.spanne ? 'Auf dem Foto steht eine Spanne, angenommen ist die Mitte.' : null;
  if (name === '') return [];

  // Steht das Gewicht dabei, ist es genauer als „1 Dose“.
  const gewicht = einheit?.einheit === 'g' || einheit?.einheit === 'ml' ? null : klammerGewicht(nachEinheit);
  if (gewicht) return [{ zeile, name, menge: gewicht.menge * gelesen.menge, einheit: gewicht.einheit, groesse: null, unklar: unklarSpanne }];

  if (grob) {
    return [{ zeile, name, menge: grob.menge * gelesen.menge, einheit: grob.einheit, groesse: null, unklar: `Das Programm rechnet ${grob.text} grob um (${grob.menge} ${grob.einheit}), bitte prüfen.` }];
  }
  if (einheit) {
    const unklar = einheit.einheit === 'Dose' || einheit.einheit === 'Packung' ? `Wie viel ist in der ${einheit.einheit}? Auf dem Foto steht kein Gewicht.` : unklarSpanne;
    return [{ zeile, name, menge: gelesen.menge * (einheit.faktor ?? 1), einheit: einheit.einheit, groesse: null, unklar }];
  }
  // „3 Eier“, „1 Zwiebel“
  return [{ zeile, name, menge: gelesen.menge, einheit: 'Stück', groesse: null, unklar: unklarSpanne }];
}

const KOPF_ZUTATEN = /^(die\s+)?(zutaten|du brauchst|das brauchst du|ihr braucht|sie brauchen|einkaufsliste|ingredients)\b/i;
const KOPF_ZUBEREITUNG = /^(die\s+)?(zubereitung|anleitung|arbeitsschritte|und so geht|so geht|so wird|so gehts|schritt für schritt|methode|preparation|directions|instructions)\b/i;
const PORTIONEN = /(?:(?:für|ergibt|reicht für)\s+)?(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\s*(portionen|portion|personen|person|pers\.?|port\.?|servings)\b/i;

const zeilenText = (z: readonly TextStueck[]) => textSaeubern(z.map((s) => s.text).join(' '));

/** Baut aus Textzeilen die Schritte: Eine Nummer oder ein Satzende beginnt einen neuen. */
export function schritteBauen(zeilen: readonly string[]): string {
  const schritte: string[] = [];
  let offen = '';
  const abschliessen = () => {
    if (offen.trim() !== '') schritte.push(offen.trim());
    offen = '';
  };
  for (const roh of zeilen) {
    const nummer = /^(?:schritt\s*)?\d{1,2}\s*[.):]\s*/i.exec(roh);
    if (nummer) abschliessen();
    const text = nummer ? roh.slice(nummer[0].length) : roh;
    if (offen.endsWith('-') && /^[a-zäöüß]/.test(text)) offen = `${offen.slice(0, -1)}${text}`;
    else offen = offen === '' ? text : `${offen} ${text}`;
    if (/[.!?]$/.test(text)) abschliessen();
  }
  abschliessen();
  return schritte.join('\n');
}

/** Sieht diese Zeile ohne Überschrift nach einer Zutat aus? Sätze sind Zubereitung. */
function siehtNachZutatAus(text: string): boolean {
  if (text.length > 45 || /[.!?]$/.test(text)) return false;
  return mengeLesen(text) !== null || GEWUERZ.test(text);
}

/** Liest ein Foto. Rezepte über mehrere Fotos setzt die Prüfseite zusammen. */
export function rezeptLesen(stuecke: readonly TextStueck[]): GelesenesRezept {
  const kopfZutaten = stuecke.find((s) => KOPF_ZUTATEN.test(s.text.trim()));
  const kopfSchritte = stuecke.find((s) => KOPF_ZUBEREITUNG.test(s.text.trim()));
  const hoehe = kopfZutaten?.h ?? kopfSchritte?.h ?? 0.03;

  let zutatenStuecke: TextStueck[] = [];
  let schritteStuecke: TextStueck[] = [];
  let obenStuecke: TextStueck[] = [];

  const zweiSpalten = kopfZutaten && kopfSchritte && Math.abs(kopfZutaten.y - kopfSchritte.y) < hoehe * 3 && Math.abs(kopfZutaten.x - kopfSchritte.x) > 0.15;
  if (zweiSpalten) {
    // Die Spalten trennen sich zwischen den beiden Überschriften.
    const zutatenLinks = kopfZutaten.x < kopfSchritte.x;
    const grenze = zutatenLinks ? kopfSchritte.x - 0.02 : kopfZutaten.x - 0.02;
    const oberkante = Math.min(kopfZutaten.y, kopfSchritte.y) - hoehe / 2;
    for (const s of stuecke) {
      if (s === kopfZutaten || s === kopfSchritte) continue;
      if (s.y + s.h < oberkante) obenStuecke.push(s);
      else if (s.x < grenze === zutatenLinks) zutatenStuecke.push(s);
      else schritteStuecke.push(s);
    }
  } else {
    const zeilen = zeilenOrdnen(stuecke);
    const stelle = (kopf: TextStueck | undefined) => (kopf ? zeilen.findIndex((z) => z.includes(kopf)) : -1);
    const beiZutaten = stelle(kopfZutaten);
    const beiSchritten = stelle(kopfSchritte);
    zeilen.forEach((z, i) => {
      const ohneKopf = z.filter((s) => s !== kopfZutaten && s !== kopfSchritte);
      if (beiZutaten === -1 && beiSchritten === -1) return;
      const erster = Math.min(...[beiZutaten, beiSchritten].filter((n) => n !== -1));
      if (i < erster) obenStuecke.push(...ohneKopf);
      else if (beiSchritten !== -1 && i > beiSchritten && (beiZutaten === -1 || beiZutaten < beiSchritten || i < beiZutaten)) schritteStuecke.push(...ohneKopf);
      else if (beiZutaten !== -1 && i > beiZutaten) zutatenStuecke.push(...ohneKopf);
    });
    if (beiZutaten === -1 && beiSchritten === -1) {
      // Ganz ohne Überschriften: Der erste kurze Text oben ist der Name, danach entscheidet jede Zeile selbst.
      const texte = zeilen.map((z) => ({ z, text: zeilenText(z) }));
      const zutaten = texte.filter((t) => siehtNachZutatAus(t.text));
      const ersteZutat = zutaten[0] ? texte.indexOf(zutaten[0]) : texte.length;
      for (const [i, t] of texte.entries()) {
        if (zutaten.includes(t)) zutatenStuecke.push(...t.z);
        else if (i < ersteZutat && t.text.length <= 60 && !/[.!?]$/.test(t.text)) obenStuecke.push(...t.z);
        else schritteStuecke.push(...t.z);
      }
    }
  }

  const oben = zeilenOrdnen(obenStuecke);
  const obenTexte = oben.map(zeilenText);
  // Der Name: die größte Schrift über den Zutaten, die keine Portionsangabe ist.
  const kandidaten = oben.filter((z) => !PORTIONEN.test(zeilenText(z)) && zeilenText(z).length > 2);
  const hoeheVon = (z: readonly TextStueck[]) => Math.max(...z.map((s) => s.h));
  const titel = kandidaten.length > 0 ? kandidaten.reduce((beste, z) => (hoeheVon(z) > hoeheVon(beste) * 1.15 ? z : beste)) : null;

  const portionenTreffer = [kopfZutaten?.text ?? '', ...obenTexte, kopfSchritte?.text ?? ''].map((t) => PORTIONEN.exec(t)).find(Boolean);

  // Eine Klammer in der nächsten Zeile gehört zur Zeile davor: „1 Dose Kichererbsen“ und darunter „(240 g)“.
  const zutatenZeilen: string[] = [];
  for (const z of zeilenOrdnen(zutatenStuecke)) {
    const text = zeilenText(z);
    if (zutatenZeilen.length > 0 && text.startsWith('(')) zutatenZeilen[zutatenZeilen.length - 1] += ` ${text}`;
    else zutatenZeilen.push(text);
  }

  return {
    name: titel ? zeilenText(titel) : '',
    portionen: portionenTreffer ? Number(portionenTreffer[1]) : null,
    zutaten: zutatenZeilen.flatMap(zutatLesen),
    zubereitung: schritteBauen(zeilenOrdnen(schritteStuecke).map(zeilenText)),
  };
}

/**
 * Rezeptzutaten, unter denen der BLS etwas anderes oder vieles führt. Rezepte nennen die rohe Menge, deshalb der rohe
 * Eintrag. tests/blsEcht.test.ts prüft, dass es jeden Namen wirklich gibt. Geschrieben wie suchText sie liefert.
 */
export const ZUTAT_EINTRAEGE: Readonly<Record<string, string>> = {
  mehl: 'Weizen Mehl, Type 405',
  weizenmehl: 'Weizen Mehl, Type 405',
  vollkornmehl: 'Weizen Vollkornmehl',
  dinkelmehl: 'Dinkel Mehl, Type 630',
  zwiebel: 'Speisezwiebel roh',
  zwiebeln: 'Speisezwiebel roh',
  'rote zwiebel': 'Speisezwiebel roh',
  'rote zwiebeln': 'Speisezwiebel roh',
  milch: 'Vollmilch frisch, 3,5 % Fett, pasteurisiert',
  butter: 'Süßrahmbutter',
  linsen: 'Linse reif',
  'rote linsen': 'Linse rot reif',
  kichererbsen: 'Kichererbse reif',
  kidneybohnen: 'Kidneybohne reif',
  paprika: 'Gemüsepaprika rot, roh',
  paprikaschote: 'Gemüsepaprika rot, roh',
  paprikaschoten: 'Gemüsepaprika rot, roh',
  'rote paprika': 'Gemüsepaprika rot, roh',
  'gelbe paprika': 'Gemüsepaprika gelb, roh',
  'grune paprika': 'Gemüsepaprika grün, roh',
  hackfleisch: 'Rind/Schwein, Hackfleisch gemischt, roh',
  hack: 'Rind/Schwein, Hackfleisch gemischt, roh',
  rinderhack: 'Rind Hackfleisch, roh',
  rinderhackfleisch: 'Rind Hackfleisch, roh',
  hahnchenbrust: 'Hähnchen Brustfilet, roh',
  hahnchenbrustfilet: 'Hähnchen Brustfilet, roh',
  champignons: 'Champignon roh',
  champignon: 'Champignon roh',
  pilze: 'Champignon roh',
  brokkoli: 'Broccoli roh',
  broccoli: 'Broccoli roh',
  essig: 'Weinessig',
  weissweinessig: 'Weinessig',
  rotweinessig: 'Weinessig',
  balsamico: 'Balsamicoessig',
  balsamicoessig: 'Balsamicoessig',
  hefe: 'Backhefe frisch (Frischbackhefe)',
  trockenhefe: 'Backhefe getrocknet (Trockenbackhefe)',
  quark: 'Speisequark Magerstufe, Magerquark < 10 % Fett i. Tr.',
  magerquark: 'Speisequark Magerstufe, Magerquark < 10 % Fett i. Tr.',
  schinken: 'Schwein Kochschinken, Kochpökelware',
  kochschinken: 'Schwein Kochschinken, Kochpökelware',
  sahne: 'Schlagsahne mind. 30 % Fett',
  schlagsahne: 'Schlagsahne mind. 30 % Fett',
  schmand: 'Sauerrahm/Schmand, mind. 20 % Fett',
  kartoffeln: 'Kartoffel geschält, roh',
  kartoffel: 'Kartoffel geschält, roh',
  reis: 'Reis poliert, roh',
  nudeln: 'Teigwaren eifrei, roh',
  spaghetti: 'Teigwaren eifrei, roh',
  penne: 'Teigwaren eifrei, roh',
  tomaten: 'Tomate roh',
  tomate: 'Tomate roh',
  gurke: 'Gurke roh',
  salatgurke: 'Gurke roh',
  mohre: 'Karotte/Möhre, roh',
  mohren: 'Karotte/Möhre, roh',
  karotte: 'Karotte/Möhre, roh',
  karotten: 'Karotte/Möhre, roh',
  petersilie: 'Petersilienblatt roh',
  knoblauch: 'Knoblauch roh',
  knoblauchzehe: 'Knoblauch roh',
  knoblauchzehen: 'Knoblauch roh',
  lauch: 'Porree/Lauch, roh',
  porree: 'Porree/Lauch, roh',
  sellerie: 'Knollensellerie roh',
  kurbis: 'Kürbis Hokkaido (C. maxima) roh',
  speisestarke: 'Mais Stärke',
  starke: 'Mais Stärke',
  mandeln: 'Mandel süß',
  walnusse: 'Walnuss',
  bruhe: 'Gemüsebrühe',
  wasser: 'Trinkwasser',
  mozzarella: 'Mozzarella mind. 45 % Fett i. Tr.',
  gouda: 'Gouda mind. 40 % Fett i. Tr.',
  ingwer: 'Ingwer/Ingwerwurzel, roh',
};

const GEGART = /\b(gekocht|gebraten|gebacken|gegrillt|gedünstet|geschmort|frittiert|pochiert|überbacken|paniert|gefüllt)\b/i;
const AUS_DER_DOSE = /dose|konserve|(^|\s)glas(\s|$)/i;

export interface ZutatSuche<T> {
  /** Das Beste zuerst, dahinter die Alternativen. */
  treffer: T[];
  /** Falsch: nur über einen Teil des Namens gefunden. */
  sicher: boolean;
}

/**
 * Sucht zu einer Zutat die passenden Lebensmittel: Eigenes mit genau diesem Namen, dann der übliche Eintrag, dann Rohes vor
 * Gegartem. Findet der ganze Name nichts, zählt das letzte Wort: Im Deutschen steht das Hauptwort hinten („frische Tomaten“).
 */
export function zutatSuchen<T extends { name: string; gruppe?: string | null }>(zutat: Pick<GeleseneZutat, 'name' | 'zeile'>, bestand: readonly T[], anzahl = 5): ZutatSuche<T> {
  const worte = suchWorte(zutat.name);
  if (worte.length === 0) return { treffer: [], sicher: false };
  let treffer = sortierteTreffer(bestand, zutat.name);
  let sicher = treffer.length > 0;
  if (treffer.length === 0 && worte.length > 1) treffer = sortierteTreffer(bestand, worte.at(-1)!);

  const ganzesWort = new RegExp(`(^| )${worte.join(' ')}( |$)`);
  const eigene = treffer.filter((t) => t.gruppe === null && ganzesWort.test(suchText(t.name)));
  const ueblich = ZUTAT_EINTRAEGE[suchText(zutat.name)];
  const eintrag = ueblich === undefined ? undefined : bestand.find((t) => t.name === ueblich);
  if (eintrag) sicher = true;
  const dose = AUS_DER_DOSE.test(zutat.zeile) ? treffer.filter((t) => /konserve/i.test(t.name)).slice(0, 1) : [];
  const rest = [...treffer.filter((t) => !GEGART.test(t.name)), ...treffer.filter((t) => GEGART.test(t.name))];
  const liste = [...new Set([...eigene, ...dose, ...(eintrag ? [eintrag] : []), ...rest])];
  return { treffer: liste.slice(0, anzahl), sicher };
}
