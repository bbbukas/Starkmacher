/**
 * Die Referenzwerte, gesammelt an einer Stelle mit Quelle und Stand, damit sie
 * sich später leicht aktualisieren lassen (Bauauftrag 4.2). Alle Werte stehen in
 * der Einheit des BLS (siehe naehrstoffe.ts).
 *
 * Abgelesen am 03.11.2026 von den Seiten der DGE, einschließlich der Korrektur
 * vom Mai 2026 (sie betrifft nur eine Tabellenüberschrift, keinen Wert).
 *
 * Annahmen, wo die DGE nach etwas unterscheidet, das Starkmacher nicht abfragt:
 * - Zink: Wert für mittlere Phytatzufuhr (bei viel Vollkorn und Hülsenfrüchten
 *   nennt die DGE 16 mg statt 14 mg bzw. 10 mg statt 8 mg).
 * - Eisen bei Frauen: unter 51 Jahren 16 mg, ab 51 Jahren 14 mg (die DGE
 *   unterscheidet vor und nach den Wechseljahren).
 * - Vitamin C: ohne den Zuschlag für Rauchende (155 mg bzw. 135 mg).
 */
export const QUELLE_DGE = {
  name: 'DGE/ÖGE-Referenzwerte für die Nährstoffzufuhr',
  fassung: '3. Auflage, 1. Ausgabe 2025, mit Korrektur vom Mai 2026',
  abgelesen: '2026-11-03',
  adresse: 'dge.de/wissenschaft/referenzwerte',
} as const;

export const QUELLE_EFSA = {
  name: 'EFSA: Overview on Tolerable Upper Intake Levels',
  fassung: 'Version 11, August 2025',
  abgelesen: '2026-11-03',
  adresse: 'efsa.europa.eu',
} as const;

export type WertArt = 'empfehlung' | 'schaetzwert' | 'richtwert';

/** Vier Altersgruppen der DGE für Erwachsene: 19 bis unter 25, 25 bis unter 51, 51 bis unter 65, ab 65. */
export type Altersgruppe = 0 | 1 | 2 | 3;
type JeAlter = readonly [number, number, number, number];
type Wert = number | JeAlter;

export interface ReferenzEintrag {
  code: string;
  art: WertArt;
  /** Stand der Ableitung laut DGE. */
  stand: string;
  maennlich: Wert;
  weiblich: Wert;
  /** Obere Grenze, wo die DGE eine Spanne nennt (Kupfer, Mangan, Chrom, Molybdän). */
  bis?: number;
  /** Kurzer Satz neben dem Wert. */
  hinweis?: string;
  /** Wird angezeigt, aber nicht als Lücke gemeldet (Lukas, 03.11.2026 für Vitamin D). */
  keineLuecke?: true;
}

const gleich = (wert: Wert) => ({ maennlich: wert, weiblich: wert });

export const REFERENZWERTE: readonly ReferenzEintrag[] = [
  // Vitamine
  { code: 'VITAA', art: 'empfehlung', stand: '2020', maennlich: [850, 850, 850, 800], weiblich: 700 },
  {
    code: 'VITD',
    art: 'schaetzwert',
    stand: '2012',
    ...gleich(20),
    keineLuecke: true,
    hinweis: 'Kommt vor allem von der Sonne: Der Wert gilt nur ohne eigene Bildung in der Haut, über Essen kommen laut DGE meist 2–4 µg.',
  },
  { code: 'VITE', art: 'schaetzwert', stand: '2025', ...gleich(8) },
  { code: 'VITK', art: 'schaetzwert', stand: '2000', maennlich: [70, 70, 80, 80], weiblich: [60, 60, 65, 65] },
  { code: 'VITC', art: 'empfehlung', stand: '2015', maennlich: 110, weiblich: 95 },
  { code: 'THIA', art: 'empfehlung', stand: '2015', maennlich: [1.3, 1.2, 1.2, 1.1], weiblich: 1.0 },
  { code: 'RIBF', art: 'empfehlung', stand: '2015', maennlich: [1.4, 1.4, 1.3, 1.3], weiblich: [1.1, 1.1, 1.0, 1.0] },
  { code: 'NIAEQ', art: 'empfehlung', stand: '2015', maennlich: [16, 15, 15, 14], weiblich: [13, 12, 11, 11] },
  { code: 'PANTAC', art: 'schaetzwert', stand: '2021', ...gleich(5) },
  { code: 'VITB6', art: 'empfehlung', stand: '2019', maennlich: 1600, weiblich: 1400 },
  { code: 'BIOT', art: 'schaetzwert', stand: '2020', ...gleich(40) },
  { code: 'FOL', art: 'empfehlung', stand: '2015', ...gleich(300) },
  { code: 'VITB12', art: 'schaetzwert', stand: '2018', ...gleich(4) },

  // Mineralstoffe und Spurenelemente
  { code: 'CA', art: 'empfehlung', stand: '2013', ...gleich(1000) },
  { code: 'MG', art: 'schaetzwert', stand: '2021', maennlich: 350, weiblich: 300 },
  { code: 'K', art: 'schaetzwert', stand: '2016', ...gleich(4000) },
  { code: 'NA', art: 'schaetzwert', stand: '2016', ...gleich(1500) },
  { code: 'CLD', art: 'schaetzwert', stand: '2016', ...gleich(2300) },
  { code: 'P', art: 'schaetzwert', stand: '2024', ...gleich(550) },
  { code: 'FE', art: 'empfehlung', stand: '2024', maennlich: 11, weiblich: [16, 16, 14, 14] },
  { code: 'ZN', art: 'empfehlung', stand: '2019', maennlich: 14, weiblich: 8 },
  { code: 'ID', art: 'empfehlung', stand: '2025', ...gleich(150) },
  { code: 'CU', art: 'schaetzwert', stand: '2000', ...gleich(1000), bis: 1500 },
  { code: 'MN', art: 'schaetzwert', stand: '2000', ...gleich(2000), bis: 5000 },
  {
    code: 'FD',
    art: 'schaetzwert',
    stand: '2024',
    maennlich: 3500,
    weiblich: 3000,
    keineLuecke: true,
    hinweis: 'Gilt für die gesamte Zufuhr: Fluorid kommt auch aus Trinkwasser und Zahnpasta.',
  },
  { code: 'CR', art: 'schaetzwert', stand: '2000', ...gleich(30), bis: 100 },
  { code: 'MO', art: 'schaetzwert', stand: '2000', ...gleich(50), bis: 100 },

  // Ballaststoffe
  { code: 'FIBT', art: 'richtwert', stand: '2021', ...gleich(30) },
];

export type HoechstArt = 'hoechstwert' | 'sichere-menge';

export interface Hoechstwert {
  code: string;
  wert: number;
  art: HoechstArt;
  hinweis?: string;
}

/**
 * Höchstwerte für Erwachsene von der EFSA. „Sichere Menge“: Für diesen Stoff gibt
 * es keinen echten Höchstwert, aber eine Menge, bei der Fachleute keine Nachteile erwarten.
 *
 * Bewusst ohne:
 * - Magnesium: Die 250 mg gelten nur für Nahrungsergänzung, nicht für normales Essen.
 * - Fluorid: Die sichere Menge der EFSA (3,3 mg) liegt unter dem, was die DGE für
 *   Männer als angemessen nennt (3,5 mg). Das gäbe bei normalem Essen widersprüchliche Hinweise.
 */
export const HOECHSTWERTE: readonly Hoechstwert[] = [
  { code: 'RETOL', wert: 3000, art: 'hoechstwert', hinweis: 'Gilt nur für Retinol, nicht für Beta-Carotin.' },
  { code: 'VITD', wert: 100, art: 'hoechstwert' },
  { code: 'VITE', wert: 300, art: 'hoechstwert' },
  { code: 'VITB6', wert: 12000, art: 'hoechstwert' },
  { code: 'FOLAC', wert: 1000, art: 'hoechstwert', hinweis: 'Gilt nur für zugesetzte Folsäure, nicht für natürliches Folat.' },
  { code: 'CA', wert: 2500, art: 'hoechstwert' },
  { code: 'CU', wert: 5000, art: 'hoechstwert' },
  { code: 'ID', wert: 600, art: 'hoechstwert' },
  { code: 'MO', wert: 600, art: 'hoechstwert' },
  { code: 'ZN', wert: 25, art: 'hoechstwert' },
  { code: 'FE', wert: 40, art: 'sichere-menge' },
  { code: 'MN', wert: 8000, art: 'sichere-menge' },
];

/** Stand und Herkunft der Grenzen, die im Bauauftrag stehen. */
export const SALZ_HOECHST_G = 6; // DGE-Orientierungswert (Stellungnahme 2016)
export const GESAETTIGT_HOECHST_ANTEIL = 0.1; // DGE-Fettleitlinie 2015
export const ZUCKER_HOECHST_ANTEIL = 0.1; // Lukas, 03.11.2026: Zucker gesamt, ob frei oder aus Obst. Strenger als die DGE (freier Zucker, DAG/DDG/DGE 2018).
export const LINOLSAEURE_ANTEIL = 0.025; // DGE, Stand 2000
export const ALPHA_LINOLENSAEURE_ANTEIL = 0.005; // DGE, Schätzwert, Stand 2000
