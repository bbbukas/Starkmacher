/**
 * Alle 138 Nährstoffe des Bundeslebensmittelschlüssels (BLS 4.0), geordnet nach
 * den neun Gruppen aus dem Bauauftrag (Abschnitt 4.4). Die Codes und Einheiten
 * sind die des BLS: So stehen die Werte auch in der Datenbank (pro 100 g).
 *
 * Quelle: BLS 4.0, Dokumentation, Kapitel 3.
 * Selen führt der BLS nicht – deshalb gibt es dafür hier weder Eintrag noch Ziel.
 */
export type GruppenId =
  | 'energie'
  | 'makros'
  | 'kohlenhydrate'
  | 'ballaststoffe'
  | 'fettsaeuren'
  | 'aminosaeuren'
  | 'vitamine'
  | 'mineralstoffe'
  | 'sonstiges';

export interface Gruppe {
  id: GruppenId;
  titel: string;
}

export const GRUPPEN: readonly Gruppe[] = [
  { id: 'energie', titel: 'Energie' },
  { id: 'makros', titel: 'Makros' },
  { id: 'kohlenhydrate', titel: 'Kohlenhydrate' },
  { id: 'ballaststoffe', titel: 'Ballaststoffe' },
  { id: 'fettsaeuren', titel: 'Fettsäuren' },
  { id: 'aminosaeuren', titel: 'Aminosäuren' },
  { id: 'vitamine', titel: 'Vitamine' },
  { id: 'mineralstoffe', titel: 'Mineralstoffe und Spurenelemente' },
  { id: 'sonstiges', titel: 'Sonstiges' },
];

export type Einheit = 'kJ' | 'kcal' | 'g' | 'mg' | 'µg';

export interface Naehrstoff {
  code: string;
  name: string;
  /** Einheit im BLS, pro 100 g. Auch alle Ziele stehen in dieser Einheit. */
  einheit: Einheit;
  gruppe: GruppenId;
  /** Gezeigt wird in mg, wo der BLS µg führt, aber jeder in mg denkt (Vitamin B6, Kupfer, …). */
  zeigeInMg?: true;
}

type Kurz = readonly [code: string, name: string, einheit: Einheit, zeigeInMg?: true];

const liste = (gruppe: GruppenId, zeilen: readonly Kurz[]): Naehrstoff[] =>
  zeilen.map(([code, name, einheit, zeigeInMg]) => ({ code, name, einheit, gruppe, ...(zeigeInMg ? { zeigeInMg } : {}) }));

export const NAEHRSTOFFE: readonly Naehrstoff[] = [
  ...liste('energie', [
    ['ENERCC', 'Kalorien', 'kcal'],
    ['ENERCJ', 'Kilojoule', 'kJ'],
  ]),
  ...liste('makros', [
    ['PROT625', 'Eiweiß', 'g'],
    ['FAT', 'Fett', 'g'],
    ['CHO', 'Kohlenhydrate', 'g'],
    ['ALC', 'Alkohol', 'g'],
    ['WATER', 'Wasser', 'g'],
    ['ASH', 'Rohasche', 'g'],
  ]),
  ...liste('kohlenhydrate', [
    ['SUGAR', 'Zucker gesamt', 'g'],
    ['STARCH', 'Stärke', 'g'],
    ['MNSAC', 'Einfachzucker gesamt', 'g'],
    ['GLUS', 'Glucose', 'g'],
    ['FRUS', 'Fructose', 'g'],
    ['GALS', 'Galactose', 'g'],
    ['DISAC', 'Zweifachzucker gesamt', 'g'],
    ['SUCS', 'Saccharose', 'g'],
    ['MALS', 'Maltose', 'g'],
    ['LACS', 'Lactose', 'g'],
    ['OLSAC', 'Oligosaccharide', 'g'],
  ]),
  ...liste('ballaststoffe', [
    ['FIBT', 'Ballaststoffe gesamt', 'g'],
    ['FIBHMW', 'Hochmolekular', 'g'],
    ['FIBLMW', 'Niedermolekular', 'g'],
    ['FIBINS', 'Wasserunlöslich', 'g'],
    ['FIBSOL', 'Wasserlöslich', 'g'],
    ['FIBHMWI', 'Hochmolekular, wasserunlöslich', 'g'],
    ['FIBHMWS', 'Hochmolekular, wasserlöslich', 'g'],
  ]),
  ...liste('fettsaeuren', [
    ['FASAT', 'Gesättigte Fettsäuren', 'g'],
    ['FAMS', 'Einfach ungesättigte Fettsäuren', 'g'],
    ['FAPU', 'Mehrfach ungesättigte Fettsäuren', 'g'],
    ['FAPUN3', 'Omega-3-Fettsäuren', 'g'],
    ['FAPUN6', 'Omega-6-Fettsäuren', 'g'],
    ['F18:2CN6', 'Linolsäure (Omega-6)', 'g'],
    ['F18:3CN3', 'Alpha-Linolensäure (Omega-3)', 'g'],
    ['F20:5CN3', 'EPA (Omega-3)', 'g'],
    ['F22:6CN3', 'DHA (Omega-3)', 'g'],
    ['F22:5CN3', 'Docosapentaensäure (Omega-3)', 'g'],
    ['F18:4CN3', 'Stearidonsäure (Omega-3)', 'g'],
    ['F18:3CN6', 'Gamma-Linolensäure (Omega-6)', 'g'],
    ['F20:2CN6', 'Eicosadiensäure (Omega-6)', 'g'],
    ['F20:3CN6', 'Dihomogamma-Linolensäure (Omega-6)', 'g'],
    ['F20:4CN6', 'Arachidonsäure (Omega-6)', 'g'],
    ['F18:2C9T11', 'Konjugierte Linolsäure', 'g'],
    ['F18:1CN9', 'Ölsäure', 'g'],
    ['F18:1CN7', 'Vaccensäure', 'g'],
    ['F14:1CN5', 'Myristoleinsäure', 'g'],
    ['F16:1CN7', 'Palmitoleinsäure', 'g'],
    ['F20:1CN9', 'Gondosäure', 'g'],
    ['F22:1CN9', 'Erucasäure', 'g'],
    ['F4:0', 'Buttersäure', 'g'],
    ['F6:0', 'Capronsäure', 'g'],
    ['F8:0', 'Caprylsäure', 'g'],
    ['F10:0', 'Caprinsäure', 'g'],
    ['F12:0', 'Laurinsäure', 'g'],
    ['F14:0', 'Myristinsäure', 'g'],
    ['F15:0', 'Pentadecylsäure', 'g'],
    ['F16:0', 'Palmitinsäure', 'g'],
    ['F17:0', 'Margarinsäure', 'g'],
    ['F18:0', 'Stearinsäure', 'g'],
    ['F20:0', 'Arachinsäure', 'g'],
    ['F22:0', 'Behensäure', 'g'],
    ['F24:0', 'Lignocerinsäure', 'g'],
    ['FAX', 'Sonstige Fettsäuren', 'g'],
  ]),
  ...liste('aminosaeuren', [
    ['AAE9', 'Unentbehrliche Aminosäuren gesamt', 'g'],
    ['HIS', 'Histidin', 'g'],
    ['ILE', 'Isoleucin', 'g'],
    ['LEU', 'Leucin', 'g'],
    ['LYS', 'Lysin', 'g'],
    ['MET', 'Methionin', 'g'],
    ['PHE', 'Phenylalanin', 'g'],
    ['THR', 'Threonin', 'g'],
    ['TRP', 'Tryptophan', 'g'],
    ['VAL', 'Valin', 'g'],
    ['ALA', 'Alanin', 'g'],
    ['ARG', 'Arginin', 'g'],
    ['ASP', 'Asparaginsäure', 'g'],
    ['CYS', 'Cystein', 'g'],
    ['GLU', 'Glutaminsäure', 'g'],
    ['GLY', 'Glycin', 'g'],
    ['PRO', 'Prolin', 'g'],
    ['SER', 'Serin', 'g'],
    ['TYR', 'Tyrosin', 'g'],
  ]),
  ...liste('vitamine', [
    ['VITAA', 'Vitamin A', 'µg'],
    ['VITD', 'Vitamin D', 'µg'],
    ['VITE', 'Vitamin E', 'mg'],
    ['VITK', 'Vitamin K', 'µg'],
    ['VITC', 'Vitamin C', 'mg'],
    ['THIA', 'Vitamin B1 (Thiamin)', 'mg'],
    ['RIBF', 'Vitamin B2 (Riboflavin)', 'mg'],
    ['NIAEQ', 'Niacin (B3)', 'mg'],
    ['PANTAC', 'Pantothensäure (B5)', 'mg'],
    ['VITB6', 'Vitamin B6', 'µg', true],
    ['BIOT', 'Biotin (B7)', 'µg'],
    ['FOL', 'Folat (B9)', 'µg'],
    ['VITB12', 'Vitamin B12', 'µg'],
    ['VITA', 'Vitamin A, ältere Rechenart', 'µg'],
    ['RETOL', 'Retinol', 'µg'],
    ['CARTB', 'Beta-Carotin', 'µg'],
    ['CAROTPAXB', 'Andere Carotinoide', 'µg'],
    ['ERGCAL', 'Vitamin D2', 'µg'],
    ['CHOCAL', 'Vitamin D3', 'µg'],
    ['TOCPHA', 'Alpha-Tocopherol', 'mg'],
    ['TOCPHB', 'Beta-Tocopherol', 'mg'],
    ['TOCPHG', 'Gamma-Tocopherol', 'mg'],
    ['TOCPHD', 'Delta-Tocopherol', 'mg'],
    ['TOCTRA', 'Alpha-Tocotrienol', 'mg'],
    ['VITK1', 'Vitamin K1', 'µg'],
    ['VITK2', 'Vitamin K2', 'µg'],
    ['NIA', 'Niacin ohne Tryptophan', 'mg'],
    ['FOLFD', 'Natürliches Folat', 'µg'],
    ['FOLAC', 'Folsäure, zugesetzt', 'µg'],
  ]),
  ...liste('mineralstoffe', [
    ['NACL', 'Salz', 'g'],
    ['CA', 'Calcium', 'mg'],
    ['MG', 'Magnesium', 'mg'],
    ['K', 'Kalium', 'mg'],
    ['NA', 'Natrium', 'mg'],
    ['CLD', 'Chlorid', 'mg'],
    ['P', 'Phosphor', 'mg'],
    ['S', 'Schwefel', 'mg'],
    ['FE', 'Eisen', 'mg'],
    ['ZN', 'Zink', 'mg'],
    ['ID', 'Jod', 'µg'],
    ['CU', 'Kupfer', 'µg', true],
    ['MN', 'Mangan', 'µg', true],
    ['FD', 'Fluorid', 'µg', true],
    ['CR', 'Chrom', 'µg'],
    ['MO', 'Molybdän', 'µg'],
  ]),
  ...liste('sonstiges', [
    ['CHORL', 'Cholesterin', 'mg'],
    ['OA', 'Organische Säuren gesamt', 'g'],
    ['ACEAC', 'Essigsäure', 'g'],
    ['CITAC', 'Zitronensäure', 'g'],
    ['LACAC', 'Milchsäure', 'g'],
    ['MALAC', 'Äpfelsäure', 'g'],
    ['TARAC', 'Weinsäure', 'g'],
    ['POLYL', 'Zuckeralkohole gesamt', 'g'],
    ['MANTL', 'Mannit', 'g'],
    ['SORTL', 'Sorbit', 'g'],
    ['XYLTL', 'Xylit', 'g'],
    ['NT', 'Stickstoff gesamt', 'g'],
  ]),
];

const NACH_CODE = new Map(NAEHRSTOFFE.map((n) => [n.code, n]));

export function naehrstoff(code: string): Naehrstoff | undefined {
  return NACH_CODE.get(code);
}

export function naehrstoffeDerGruppe(gruppe: GruppenId): Naehrstoff[] {
  return NAEHRSTOFFE.filter((n) => n.gruppe === gruppe);
}
