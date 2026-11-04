/**
 * Die Referenzwerte, gesammelt an einer Stelle mit Quelle und Stand, damit sie
 * sich später leicht aktualisieren lassen. Alle Werte stehen in der Einheit des
 * BLS (siehe naehrstoffe.ts).
 *
 * Regel (Lukas, 03.11.2026: „der heutige Stand der Wissenschaft, in jeder
 * Information“): Für jeden Nährstoff gilt die jüngste eigene wissenschaftliche
 * Herleitung einer europäischen Fachstelle (DGE/ÖGE, EFSA, Nordische Empfehlungen
 * NNR) oder der WHO. Übernimmt eine Stelle nur den Wert einer anderen, zählt das
 * Original. Geprüft am 03.11.2026.
 *
 * Zwei Stufen (Lukas, 04.11.2026): Die Werte nach dieser Regel sind das Minimum. Das Optimum ist der
 * Bereich, für den die Forschung einen Nutzen über das Minimum hinaus zeigt, immer mit Quelle: Eiweiß
 * (bedarf.ts), Fett, Ballaststoffe, EPA und DHA (ganz unten). Für Vitamine und Mineralstoffe ist so ein
 * Nutzen bei ausreichender Versorgung nicht belegt (USPSTF 2022, DGE-Arbeitsgruppe Sporternährung 2020),
 * deshalb gibt es dort nur das Minimum. Bewusst kein Ziel: Omega-6 zu Omega-3 (NNR 2023, AHA 2009) und
 * Leucin je Mahlzeit (Schwelle umstritten, Übersichtsarbeit 2023).
 *
 * Bewusste Ausnahmen von der Regel:
 * - Folat: EFSA 2014 statt DGE 2015, weil der BLS Folat genauso rechnet wie die
 *   EFSA (Folsäure × 1,7). Die Nordischen Empfehlungen 2023 bestätigen den Wert.
 *
 * Wochenschnitt (Lukas, 04.11.2026): Vitamine und Mineralstoffe stehen hier als Tageswert, zählen im Tagebuch aber im
 * Schnitt der Woche, weil die Referenzwerte nicht an jedem einzelnen Tag erfüllt werden müssen (DGE 2018, DGE 2012). Siehe woche.ts.
 *
 * Annahmen, wo die Quelle nach etwas unterscheidet, das Starkmacher nicht abfragt:
 * - Zink: Wert für mittlere Phytatzufuhr (bei viel Vollkorn und Hülsenfrüchten
 *   nennt die DGE 16 mg statt 14 mg bzw. 10 mg statt 8 mg).
 * - Eisen bei Frauen: unter 51 Jahren 16 mg, ab 51 Jahren 14 mg (die DGE
 *   unterscheidet vor und nach den Wechseljahren).
 * - Vitamin C: ohne den Zuschlag für Rauchende (155 mg bzw. 135 mg).
 */
export const QUELLEN = [
  { kurz: 'DGE/ÖGE', titel: 'DGE/ÖGE-Referenzwerte für die Nährstoffzufuhr, 3. Auflage 2025, mit Korrektur vom Mai 2026', adresse: 'dge.de/wissenschaft/referenzwerte' },
  { kurz: 'EFSA', titel: 'EFSA: Dietary Reference Values for nutrients, Summary report (2017), dazu Natrium und Chlorid (2019), Chrom (2014)', adresse: 'efsa.europa.eu' },
  { kurz: 'EFSA, Höchstwerte', titel: 'EFSA: Overview on Tolerable Upper Intake Levels, Version 11, August 2025', adresse: 'efsa.europa.eu' },
  { kurz: 'NNR', titel: 'Nordic Nutrition Recommendations 2023, Nordic Council of Ministers', adresse: 'pub.norden.org/nord2023-003' },
  { kurz: 'DGE, Woche', titel: 'DGE: Ausgewählte Fragen und Antworten zu den Referenzwerten, Oktober 2018, Frage 4: Der Durchschnitt einer Woche reicht', adresse: 'dge.de' },
  { kurz: 'WHO', titel: 'WHO-Leitlinien zu Fett und Kohlenhydraten (2023), Natrium (2012), freiem Zucker (2015)', adresse: 'who.int' },
] as const;

export type WertArt = 'empfehlung' | 'schaetzwert' | 'richtwert';

/** Vier Altersgruppen für Erwachsene: 18 bis unter 25, 25 bis unter 51, 51 bis unter 65, ab 65. */
export type Altersgruppe = 0 | 1 | 2 | 3;
type JeAlter = readonly [number, number, number, number];
type Wert = number | JeAlter;

export interface ReferenzEintrag {
  code: string;
  art: WertArt;
  /** Woher der Wert stammt und aus welchem Jahr die Herleitung ist. */
  quelle: string;
  maennlich?: Wert;
  weiblich?: Wert;
  /** Statt fester Menge: je Megajoule Energie (Vitamin B1). */
  jeMJ?: number;
  /** Ab diesem Alter gilt ein anderer Wert (Vitamin D). */
  abAlter?: { alter: number; wert: number };
  /** Kurzer Satz neben dem Wert. */
  hinweis?: string;
  /** Wird angezeigt, aber nicht als Lücke gemeldet (Lukas, 03.11.2026 für Vitamin D). */
  keineLuecke?: true;
}

const gleich = (wert: Wert) => ({ maennlich: wert, weiblich: wert });

export const REFERENZWERTE: readonly ReferenzEintrag[] = [
  // Vitamine
  { code: 'VITAA', art: 'empfehlung', quelle: 'DGE/ÖGE 2020', maennlich: [850, 850, 850, 800], weiblich: 700 },
  {
    code: 'VITD',
    art: 'empfehlung',
    quelle: 'NNR 2023',
    ...gleich(10),
    abAlter: { alter: 71, wert: 20 },
    keineLuecke: true,
    hinweis: 'Kommt vor allem von der Sonne. Über Essen allein ist der Wert schwer zu erreichen.',
  },
  { code: 'VITE', art: 'schaetzwert', quelle: 'DGE/ÖGE 2025', ...gleich(8) },
  { code: 'VITK', art: 'schaetzwert', quelle: 'EFSA 2017', ...gleich(70) },
  { code: 'VITC', art: 'empfehlung', quelle: 'DGE/ÖGE 2015', maennlich: 110, weiblich: 95 },
  { code: 'THIA', art: 'empfehlung', quelle: 'EFSA 2016', jeMJ: 0.1 },
  { code: 'RIBF', art: 'empfehlung', quelle: 'EFSA 2017', ...gleich(1.6) },
  { code: 'NIAEQ', art: 'empfehlung', quelle: 'DGE/ÖGE 2015', maennlich: [16, 15, 15, 14], weiblich: [13, 12, 11, 11] },
  { code: 'PANTAC', art: 'schaetzwert', quelle: 'DGE/ÖGE 2021', ...gleich(5) },
  { code: 'VITB6', art: 'empfehlung', quelle: 'DGE/ÖGE 2019', maennlich: 1600, weiblich: 1400 },
  { code: 'BIOT', art: 'schaetzwert', quelle: 'DGE/ÖGE 2020', ...gleich(40) },
  { code: 'FOL', art: 'empfehlung', quelle: 'EFSA 2014, bestätigt NNR 2023', ...gleich(330) },
  { code: 'VITB12', art: 'schaetzwert', quelle: 'DGE/ÖGE 2018', ...gleich(4) },

  // Mineralstoffe und Spurenelemente
  { code: 'CA', art: 'empfehlung', quelle: 'EFSA 2015', ...gleich([1000, 950, 950, 950]) },
  { code: 'MG', art: 'schaetzwert', quelle: 'DGE/ÖGE 2021', maennlich: 350, weiblich: 300 },
  { code: 'K', art: 'schaetzwert', quelle: 'EFSA 2016, bestätigt NNR 2023', ...gleich(3500) },
  { code: 'CLD', art: 'schaetzwert', quelle: 'EFSA 2019', ...gleich(3100), keineLuecke: true, hinweis: 'Kommt fast nur aus Salz, das muss man nicht gezielt essen.' },
  { code: 'P', art: 'schaetzwert', quelle: 'DGE/ÖGE 2024', ...gleich(550) },
  { code: 'FE', art: 'empfehlung', quelle: 'DGE/ÖGE 2024', maennlich: 11, weiblich: [16, 16, 14, 14] },
  { code: 'ZN', art: 'empfehlung', quelle: 'DGE/ÖGE 2019', maennlich: 14, weiblich: 8 },
  { code: 'ID', art: 'empfehlung', quelle: 'DGE/ÖGE 2025', ...gleich(150) },
  { code: 'CU', art: 'schaetzwert', quelle: 'EFSA 2015', maennlich: 1600, weiblich: 1300 },
  { code: 'MN', art: 'schaetzwert', quelle: 'EFSA 2013', ...gleich(3000) },
  {
    code: 'FD',
    art: 'schaetzwert',
    quelle: 'DGE/ÖGE 2024',
    maennlich: 3500,
    weiblich: 3000,
    keineLuecke: true,
    hinweis: 'Gilt für die gesamte Zufuhr: Fluorid kommt auch aus Trinkwasser und Zahnpasta.',
  },
  { code: 'MO', art: 'schaetzwert', quelle: 'EFSA 2013', ...gleich(65) },

  // Makros und Ballaststoffe
  { code: 'FIBT', art: 'richtwert', quelle: 'DGE/ÖGE 2021', ...gleich(30) },
  {
    code: 'WATER',
    art: 'schaetzwert',
    quelle: 'EFSA 2010, bestätigt NNR 2023',
    maennlich: 2500,
    weiblich: 2000,
    keineLuecke: true,
    hinweis: 'Zählt alles Getrunkene und das Wasser im Essen, soweit es eingetragen ist.',
  },
];

export type HoechstArt = 'hoechstwert' | 'sichere-menge';

export interface Hoechstwert {
  code: string;
  wert: number;
  art: HoechstArt;
  quelle: string;
  hinweis?: string;
}

/**
 * Höchstwerte für Erwachsene. „Sichere Menge“: Für diesen Stoff gibt es keinen
 * echten Höchstwert, aber eine Menge, bei der Fachleute keine Nachteile erwarten.
 *
 * Bewusst ohne:
 * - Magnesium: Die 250 mg gelten nur für Nahrungsergänzung, nicht für normales Essen.
 * - Fluorid: Die sichere Menge der EFSA (3,3 mg) liegt unter dem, was die DGE für
 *   Männer als angemessen nennt (3,5 mg). Das gäbe bei normalem Essen widersprüchliche Hinweise.
 */
export const HOECHSTWERTE: readonly Hoechstwert[] = [
  { code: 'RETOL', wert: 3000, art: 'hoechstwert', quelle: 'EFSA 2024', hinweis: 'Gilt nur für Retinol, nicht für Beta-Carotin.' },
  { code: 'VITD', wert: 100, art: 'hoechstwert', quelle: 'EFSA 2023' },
  { code: 'VITE', wert: 300, art: 'hoechstwert', quelle: 'EFSA, Stand 2025' },
  { code: 'VITB6', wert: 12000, art: 'hoechstwert', quelle: 'EFSA 2023' },
  { code: 'FOLAC', wert: 1000, art: 'hoechstwert', quelle: 'EFSA 2023', hinweis: 'Gilt nur für zugesetzte Folsäure, nicht für natürliches Folat.' },
  { code: 'CA', wert: 2500, art: 'hoechstwert', quelle: 'EFSA 2012' },
  { code: 'CU', wert: 5000, art: 'hoechstwert', quelle: 'EFSA, Stand 2025' },
  { code: 'ID', wert: 600, art: 'hoechstwert', quelle: 'EFSA, Stand 2025' },
  { code: 'MO', wert: 600, art: 'hoechstwert', quelle: 'EFSA, Stand 2025' },
  { code: 'ZN', wert: 25, art: 'hoechstwert', quelle: 'EFSA, Stand 2025' },
  { code: 'FE', wert: 40, art: 'sichere-menge', quelle: 'EFSA 2024' },
  { code: 'MN', wert: 8000, art: 'sichere-menge', quelle: 'EFSA 2023' },
  { code: 'NA', wert: 2000, art: 'hoechstwert', quelle: 'EFSA 2019, WHO' },
];

/** Sätze zu Nährstoffen, für die es bewusst kein Ziel gibt. */
export const HINWEISE_OHNE_ZIEL: Readonly<Record<string, string>> = {
  ALC: 'Keine Menge gilt als sicher (DGE 2024). Deshalb gibt es hier kein Ziel.',
  CR: 'Kein Ziel: Es ist nicht belegt, dass der Körper Chrom braucht (EFSA 2014, NNR 2023).',
};

// Optimum: der Bereich, für den die Forschung einen Nutzen über das Minimum hinaus zeigt. Geprüft am 04.11.2026.
// Fett, Anteil an der Energie: dort, wo sich EFSA (20–35 %) und NNR 2023 (25–40 %) überschneiden.
export const FETT_OPTIMUM_ANTEIL = { von: 0.25, bis: 0.35, quelle: 'EFSA 2017, NNR 2023' };
// Größter belegter Nutzen bei 25–29 g, die Kurven deuten mehr an (Reynolds 2019). 35 g sind das höchste gut untersuchte Ziel
// (Reynolds 2020, bei Diabetes). Über 40 g ist kein zusätzlicher Nutzen belegt, auch wenn 45 g machbar sind (Wastyk 2021, 10 Wochen).
export const BALLASTSTOFFE_OPTIMUM_G = { von: 30, bis: 40, quelle: 'Reynolds 2019 und 2020' };
export const BALLASTSTOFFE_ZUM_PLANEN_G = 35;
// 1 g am Tag: bei 25.871 Gesunden keine sichere Senkung schwerer Herzereignisse, aber weniger Herzinfarkte (VITAL 2019).
// Über 1 g in Kapseln deutlich mehr Vorhofflimmern (Gencer 2021). Keine Kapsel-Empfehlung für Gesunde (AHA 2017).
export const EPA_DHA_OPTIMUM_MG = { von: 250, bis: 1000, quelle: 'VITAL 2019, Gencer 2021' };

// Minimum und Grenzen, Anteile an der Energie
export const FETT_MINIMUM_ANTEIL = 0.25; // NNR 2023
export const EPA_DHA_MINIMUM_MG = 250; // EFSA 2010
export const SALZ_HOECHST_G = 5; // EFSA 2019 und WHO: 2 g Natrium am Tag, das sind 5 g Salz (DGE 2016 nennt noch 6 g)
export const GESAETTIGT_HOECHST_ANTEIL = 0.1; // WHO 2023, NNR 2023
export const FREIER_ZUCKER_HOECHST_ANTEIL = 0.1; // WHO 2015, NNR 2023 (Lukas, 04.11.2026: nur freier Zucker zählt). Laut WHO wären unter 5 % noch besser.
export const EINFACH_UNGESAETTIGT_ANTEIL = { von: 0.1, bis: 0.2 }; // NNR 2023
export const MEHRFACH_UNGESAETTIGT_ANTEIL = { von: 0.05, bis: 0.1 }; // NNR 2023
export const OMEGA3_ANTEIL = 0.01; // NNR 2023: mindestens 1 %
export const LINOLSAEURE_ANTEIL = 0.025; // NNR 2023: LA und ALA zusammen mindestens 3 %, davon ALA mindestens 0,5 %
export const ALPHA_LINOLENSAEURE_ANTEIL = 0.005; // NNR 2023
