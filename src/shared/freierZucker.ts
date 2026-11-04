/**
 * Schätzt den freien Zucker je Lebensmittel (Bauauftrag 4.2). Weder BLS noch Packungen nennen ihn.
 *
 * Frei ist nach WHO 2015 und NNR 2023, was zugesetzt wurde, dazu der Zucker in Honig, Sirup und Säften.
 * Zucker aus ganzem Obst, Gemüse und Milch zählt nicht. Die Regel je Lebensmittel lautet deshalb:
 * - „kein“: Es zählt nichts (Obst, Gemüse, ungesüßte Milch, Getreide, herzhafte Gerichte …).
 * - „frei“: Es zählt der Zucker ohne die Laktose, denn Zucker aus Milch ist auch in Gesüßtem nicht frei.
 *
 * Das ist eine Schätzung aus BLS-Gruppe und Name, ohne die Rezepturen des BLS. In süßen Gerichten mit
 * Früchten zählt der Fruchtzucker daher mit, und in gesüßtem Dosenobst der ganze Zucker.
 * Muss ohne Abhängigkeiten bleiben, weil auch scripts/bls-bauen.mjs diese Datei einliest.
 */
export type ZuckerRegel = 'kein' | 'frei';

const UNGESUESST = /ungesüßt|ungezuckert|ohne zucker|zuckerfrei/;
const GESUESST = /gesüßt|gezuckert/;
/** Das Wort Zucker für sich, nicht Zuckermais oder Zuckerschote. */
const ZUCKER_WORT = /(^|[^a-zäöüß])zucker([^a-zäöüß]|$)|zimtzucker|puderzucker|zuckerguss|zuckerglasur|zuckerreduziert/;
const SAEFTE = /saft|nektar|smoothie|sirup|konzentrat/;
const SUESSE_ZUTATEN =
  /honig|sirup|konfitüre|marmelade|gelee|kompott|glasur|glasiert|kandiert|schokol|schoko|karamell|krokant|sorbet|marzipan|nougat|malzextrakt|baiser/;
const EIS = /speiseeis|(sahne|creme|frucht|vanille|schokoladen|nuss|milch|joghurt)eis|eistorte|eisbecher|(^|[^a-zäöüß])eis([^a-zäöüß]|$)/;
const SUESSE_GERICHTE =
  /pudding|flammeri|dessert|torte|kuchen|gebäck|grütze|kaltschale|früchtequark|fruchtquark|vanillequark|quarkspeise|quarkklöße|quarkauflauf|zwiebackauflauf|schaumspeise|schaum |mousse|zabaione|creme brulee|rumtopf|schlafrock|charlotte|kakao|erdbeermilch|milchshake|schmarren|strudel|bratapfel|apfelklöße|rohrnudeln|dampfnudeln|hefeklöße|germknödel|zwetschgenknödel|rahmnockerln|vanilleäpfel|birne helene|pfirsich melba|hagebutten|fruchtsauce|barbecuesauce|grillsauce|ketchup|chutney|cocktail-dressing|rotweinmarinade|süßsauer|süß-sauer|(^|[^a-zäöüß])süß([^a-zäöüß]|$)/;
const CREME = /creme/;
const HERZHAFTE_CREME = /suppe|gemüse|käse|spinat|pilz|krabben|lachs|kartoffel|sellerie|broccoli|blumenkohl|spargel|tomaten/;
const HERZHAFT_TROTZDEM = /zwiebelkuchen|speckkuchen|quiche|flammkuchen|kartoffelkuchen|kartoffel-gemüse-kuchen|fischkuchen|gemüsekuchen|fleischkuchen|lauchkuchen|pizza|gefüllt mit gedünstetem/;
const NUR_SUESSSTOFF = /mit süßstoff|mit süßungsmitteln/;
const SUESSE_MILCH =
  /gesüßt|gezuckert|frucht|schoko|kakao|milchmisch|milchshake|pudding|dessert|vanille|konfitüre|aromatisiert|honig|karamell|müsli|getreidezubereitung/;

const hatSuesses = (name: string) => GESUESST.test(name) || ZUCKER_WORT.test(name) || SUESSE_ZUTATEN.test(name) || EIS.test(name);

/** Die Regel für ein BLS-Lebensmittel aus Code (erster Buchstabe = Gruppe) und Name. */
export function zuckerRegel(code: string, roherName: string): ZuckerRegel {
  const name = roherName.toLowerCase();
  const gruppe = code[0];
  switch (gruppe) {
    // Süßwaren und Kuchen: alles
    case 'S':
    case 'D':
      return 'frei';
    // Getränke: alles außer dem Zucker aus Milch, auch Saftschorlen und Wein
    case 'N':
    case 'P':
      return 'frei';
    // Fisch, Fleisch, Wurst und Fette enthalten von sich aus kaum Zucker: Was drin ist, wurde zugesetzt.
    case 'T':
    case 'U':
    case 'V':
    case 'W':
    case 'Q':
      return 'frei';
    case 'F':
    case 'G':
      // In Saft eingelegt und abgetropft: Übrig bleibt vor allem der Zucker der Frucht selbst.
      if (/in (frucht)?saft/.test(name)) return 'kein';
      if (SAEFTE.test(name)) return 'frei';
      if (UNGESUESST.test(name)) return 'kein';
      if (gruppe === 'G') return GESUESST.test(name) || /gesäuert|instantpulver|küchenfertig/.test(name) ? 'frei' : 'kein';
      return hatSuesses(name) ? 'frei' : 'kein';
    case 'M':
      if (UNGESUESST.test(name)) return 'kein';
      return SUESSE_MILCH.test(name) ? 'frei' : 'kein';
    // Würzmittel und Backzutaten: meist gesüßt. Reine Tomaten und Hefe nicht.
    case 'R':
      if (UNGESUESST.test(name)) return 'kein';
      return /tomaten? |tomatenmark|^hefe|backhefe/.test(name) && !hatSuesses(name) ? 'kein' : 'frei';
    // Brot: nur Süßes, der Rest des Zuckers stammt großteils aus Mehl und Gärung
    case 'B':
      if (UNGESUESST.test(name)) return 'kein';
      return hatSuesses(name) || /toast|milchbrötchen|rosinen|stuten|brioche|zopf|hefezopf/.test(name) ? 'frei' : 'kein';
    // Gerichte: Süßes ja, Herzhaftes nein
    case 'X':
    case 'Y':
      if (UNGESUESST.test(name)) return 'kein';
      if (HERZHAFT_TROTZDEM.test(name)) return 'kein';
      if (NUR_SUESSSTOFF.test(name) && !ZUCKER_WORT.test(name)) return 'kein';
      return hatSuesses(name) || SUESSE_GERICHTE.test(name) || (CREME.test(name) && !HERZHAFTE_CREME.test(name)) ? 'frei' : 'kein';
    // Getreide, Hülsenfrüchte und Nüsse, Eier und Teigwaren, Kartoffeln und Pilze
    default:
      if (UNGESUESST.test(name)) return 'kein';
      return hatSuesses(name) || /dessert|pudding/.test(name) ? 'frei' : 'kein';
  }
}

/** Gramm freier Zucker je 100 g. Unbekannter Zucker bleibt unbekannt, unbekannte Laktose zählt nicht ab. */
export function freierZuckerG(regel: ZuckerRegel, zucker: number | null, laktose: number | null): number | null {
  if (zucker === null) return null;
  if (regel === 'kein') return 0;
  return Math.max(0, Math.round((zucker - (laktose ?? 0)) * 100) / 100);
}
