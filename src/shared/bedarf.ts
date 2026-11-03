/**
 * Die Rechenlogik für „Mein Bedarf“ (Bauauftrag Abschnitt 4). Reine Rechnungen
 * ohne Abhängigkeit vom Mac, damit eine spätere Website sie übernehmen kann.
 * Die Zahlen selbst stehen in referenzwerte.ts.
 */
import type { Aktivitaet, Geschlecht, Gewicht, Profil, Tempo, Ziel, ZielStand } from './profil';
import { neuestesGewicht } from './profil';
import {
  ALPHA_LINOLENSAEURE_ANTEIL,
  BALLASTSTOFFE_OPTIMUM_G,
  EINFACH_UNGESAETTIGT_ANTEIL,
  FETT_MINIMUM_ANTEIL,
  FETT_OPTIMUM_ANTEIL,
  FREIER_ZUCKER_HOECHST_ANTEIL,
  GESAETTIGT_HOECHST_ANTEIL,
  HOECHSTWERTE,
  LINOLSAEURE_ANTEIL,
  MEHRFACH_UNGESAETTIGT_ANTEIL,
  OMEGA3_ANTEIL,
  REFERENZWERTE,
  SALZ_HOECHST_G,
  type Altersgruppe,
  type HoechstArt,
  type WertArt,
} from './referenzwerte';

export const AKTIVITAETEN: readonly { id: Aktivitaet; pal: number; titel: string; text: string }[] = [
  { id: 'sitzend', pal: 1.4, titel: 'Fast nur sitzend', text: 'Büro, wenig Bewegung in der Freizeit' },
  { id: 'wechselnd', pal: 1.6, titel: 'Sitzend, zwischendurch auf den Beinen', text: 'Sitzt viel, geht und steht aber immer wieder' },
  { id: 'gehend', pal: 1.8, titel: 'Überwiegend gehend oder stehend', text: 'Verkauf, Kellnern, Handwerk' },
  { id: 'anstrengend', pal: 2.0, titel: 'Körperlich anstrengend', text: 'Bau, Landwirtschaft, Waldarbeit' },
];

/** Wer 4–5 Mal pro Woche 30–60 Minuten Sport macht, rechnet 0,3 dazu (DGE). */
export const SPORT_ZUSCHLAG = 0.3;

/**
 * Abnehmen: Abstand zum Verbrauch in kcal am Tag, das sind etwa 0,25 oder 0,5 kg pro Woche
 * (7.700 kcal je kg). Starr gerechnet überschätzt das den Verlust auf Dauer, weil der Verbrauch
 * mit dem Gewicht sinkt (Hall 2011, Thomas 2013); weil Starkmacher bei jedem neuen Gewicht neu
 * rechnet, bleibt der Abstand zum Verbrauch trotzdem passend. S3-Leitlinie Adipositas: 500–600 kcal.
 */
export const ABNEHMEN_KCAL: Readonly<Record<Tempo, number>> = { sanft: -275, mittel: -550 };

/**
 * Muskelaufbau: Zuschlag auf den Verbrauch. Ein größeres Plus bringt vor allem mehr Fett, nicht
 * mehr Muskeln (Helms 2023: +5 % und +15 %, kleine Studie). Das beste Plus ist nicht genau bekannt (Slater 2019).
 */
export const AUFBAU_ANTEIL: Readonly<Record<Tempo, number>> = { sanft: 0.05, mittel: 0.15 };

export const UNTERGRENZE_KCAL: Readonly<Record<Geschlecht, number>> = { weiblich: 1200, maennlich: 1500 };

/**
 * Eiweiß hat zwei Stufen (Lukas, 04.11.2026).
 * Minimum: 0,83 g je kg (EFSA 2012, NNR 2023), ab 65 Jahren 1,2 g je kg (NNR 2023), beim Abnehmen und
 * Muskelaufbau 1,6 g je kg (DGE-Positionspapier „Proteinzufuhr im Sport“ 2020, Morton 2018).
 * Optimum: 1,2–1,6 g je kg, bei Sport oder Kaloriendefizit 1,6–2,0 g je kg. Geplant wird mit der Mitte des Optimums.
 */
const EIWEISS_MINIMUM_G_JE_KG = 0.83;
const EIWEISS_MINIMUM_AB_65_G_JE_KG = 1.2;
const EIWEISS_MINIMUM_FUER_ZIELE_G_JE_KG = 1.6;
export const EIWEISS_OPTIMUM_G_JE_KG = { von: 1.2, bis: 1.6 };
export const EIWEISS_OPTIMUM_HOCH_G_JE_KG = { von: 1.6, bis: 2.0 };
const FETT_ANTEIL = 0.3;
const FETT_ANTEIL_HOHE_AKTIVITAET = 0.35;

const KCAL_JE_G_EIWEISS = 4;
const KCAL_JE_G_FETT = 9;
const KCAL_JE_G_KOHLENHYDRATE = 4;
const KCAL_JE_G_BALLASTSTOFFE = 2;
const KCAL_JE_MJ = 239;

/**
 * Formel der DGE für den Ruheenergieverbrauch (Müller-Formel), in kcal am Tag. Die Größe kommt darin nicht vor.
 * Bleibt: Sie stammt aus deutschen Messdaten und liegt für die Referenzpersonen meist nur wenige Prozent (höchstens
 * etwa 6 %) neben den Werten der Nordischen Empfehlungen 2023 (Henry-Formel). Alle diese Formeln sind Schätzungen.
 */
export function grundumsatz(geschlecht: Geschlecht, gewichtKg: number, alter: number): number {
  const zuschlag = geschlecht === 'maennlich' ? 1.009 : 0;
  return (0.047 * gewichtKg + zuschlag - 0.01452 * alter + 3.21) * 239;
}

export function palWert(aktivitaet: Aktivitaet, sport: boolean): number {
  const stufe = AKTIVITAETEN.find((a) => a.id === aktivitaet);
  if (!stufe) throw new Error(`Unbekannte Aktivität: ${aktivitaet}`);
  return Math.round((stufe.pal + (sport ? SPORT_ZUSCHLAG : 0)) * 10) / 10;
}

/** Nie unter dem Grundumsatz, nie unter 1.200 kcal (weiblich) bzw. 1.500 kcal (männlich). */
export function untergrenze(geschlecht: Geschlecht, grundumsatzKcal: number): number {
  return Math.max(Math.round(grundumsatzKcal), UNTERGRENZE_KCAL[geschlecht]);
}

/** Die Altersgruppen der DGE. Unter 19 gilt die jüngste Erwachsenengruppe: Für Jugendliche gibt es keine Sonderberechnung. */
export function altersgruppe(alter: number): Altersgruppe {
  if (alter < 25) return 0;
  if (alter < 51) return 1;
  if (alter < 65) return 2;
  return 3;
}

/**
 * Mehr Körperfett braucht nicht mehr Eiweiß. Gerechnet wird deshalb mit dem
 * echten Gewicht, höchstens aber mit dem Gewicht bei BMI 25 (Lukas, 03.11.2026).
 * Die DGE nimmt bei Übergewicht BMI 22; das gäbe beim Abnehmen einen Sprung im Ziel.
 */
export function rechengewichtFuerEiweiss(gewichtKg: number, groesseCm: number): number {
  const meter = groesseCm / 100;
  return Math.min(gewichtKg, 25 * meter * meter);
}

const brauchtVielEiweiss = (ziel: Ziel, sport: boolean) => ziel === 'abnehmen' || ziel === 'aufbauen' || sport;

/** Eiweißziel in Gramm: das Minimum, das Optimum und dessen Mitte zum Planen. */
export function eiweissZiel(ziel: Ziel, sport: boolean, alter: number, rechengewichtKg: number): { minimum: number; von: number; bis: number; gramm: number } {
  const optimum = brauchtVielEiweiss(ziel, sport) ? EIWEISS_OPTIMUM_HOCH_G_JE_KG : EIWEISS_OPTIMUM_G_JE_KG;
  const fuerZiel = ziel === 'abnehmen' || ziel === 'aufbauen';
  const minimum = fuerZiel ? EIWEISS_MINIMUM_FUER_ZIELE_G_JE_KG : alter >= 65 ? EIWEISS_MINIMUM_AB_65_G_JE_KG : EIWEISS_MINIMUM_G_JE_KG;
  return {
    minimum: Math.round(rechengewichtKg * minimum),
    von: Math.round(rechengewichtKg * optimum.von),
    bis: Math.round(rechengewichtKg * optimum.bis),
    gramm: Math.round((rechengewichtKg * (optimum.von + optimum.bis)) / 2),
  };
}

export interface BedarfEingabe {
  geschlecht: Geschlecht;
  alter: number;
  groesseCm: number;
  gewichtKg: number;
  aktivitaet: Aktivitaet;
  sport: boolean;
  ziel: Ziel;
  tempo: Tempo;
  eigeneKcal?: number | null;
  eigeneEiweissG?: number | null;
  eigeneFettG?: number | null;
  eigeneKohlenhydrateG?: number | null;
}

export type ZielArt = WertArt | 'hoechstwert' | 'eigener-wert';

export interface NaehrstoffZiel {
  code: string;
  art: ZielArt;
  /** Das Minimum: Darauf soll man mindestens kommen. Fehlt, wenn es nur eine Obergrenze gibt (Salz, …). */
  von?: number;
  /** Obere Grenze einer Spanne (einfach und mehrfach ungesättigte Fettsäuren). */
  bis?: number;
  /** Das Optimum, Lukas' Vorgabe. Gibt es nur bei Eiweiß, Fett und Ballaststoffen. */
  optimum?: { von: number; bis: number };
  /** Darüber sollte man auf Dauer nicht liegen. */
  hoechst?: number;
  hoechstArt?: HoechstArt;
  hinweis?: string;
  /** Wird angezeigt, aber nicht als Lücke gemeldet (Vitamin D, Fluorid, Chlorid, Wasser). */
  keineLuecke?: true;
  /** Woher der Wert stammt. */
  quelle: string;
  hoechstQuelle?: string;
}

export interface Bedarf {
  grundumsatz: number;
  pal: number;
  /** Grundumsatz × PAL. */
  gesamtumsatz: number;
  /** Was ohne Untergrenze herauskäme: Gesamtumsatz plus Tempo, oder der eigene Wert. */
  wunschKcal: number;
  untergrenze: number;
  /** Wurde das Ziel auf die Untergrenze angehoben? Dann sagt das Programm freundlich, warum. */
  untergrenzeGegriffen: boolean;
  kcal: number;
  eiweissG: number;
  fettG: number;
  kohlenhydrateG: number;
  rechengewichtKg: number;
  fettAnteil: number;
  /** Obergrenze für freien Zucker. Der BLS kennt ihn nicht, deshalb ist er kein Eintrag in `ziele`. */
  freierZuckerHoechstG: number;
  ziele: Readonly<Record<string, NaehrstoffZiel>>;
}

const wertFuer = (wert: number | readonly [number, number, number, number], gruppe: Altersgruppe) => (typeof wert === 'number' ? wert : wert[gruppe]);

/** Die Kohlenhydrate füllen auf, was nach Eiweiß, Fett und Ballaststoffen noch frei ist. */
function kohlenhydrateAlsRest(kcal: number, eiweissG: number, fettG: number): number {
  const rest = kcal - eiweissG * KCAL_JE_G_EIWEISS - fettG * KCAL_JE_G_FETT - BALLASTSTOFFE_OPTIMUM_G.von * KCAL_JE_G_BALLASTSTOFFE;
  return Math.max(0, Math.round(rest / KCAL_JE_G_KOHLENHYDRATE));
}

export function bedarfBerechnen(e: BedarfEingabe): Bedarf {
  const gu = grundumsatz(e.geschlecht, e.gewichtKg, e.alter);
  const pal = palWert(e.aktivitaet, e.sport);
  const gesamt = gu * pal;
  const grenze = untergrenze(e.geschlecht, gu);

  const eigen = e.ziel === 'eigene';
  let wunsch = Math.round(gesamt);
  if (e.ziel === 'abnehmen') wunsch = Math.round(gesamt + ABNEHMEN_KCAL[e.tempo]);
  if (e.ziel === 'aufbauen') wunsch = Math.round(gesamt * (1 + AUFBAU_ANTEIL[e.tempo]));
  if (eigen && e.eigeneKcal != null) wunsch = Math.round(e.eigeneKcal);
  const kcal = Math.max(wunsch, grenze);

  const rechengewicht = rechengewichtFuerEiweiss(e.gewichtKg, e.groesseCm);
  const eiweiss = eiweissZiel(e.ziel, e.sport, e.alter, rechengewicht);
  const fettAnteil = pal > 1.7 ? FETT_ANTEIL_HOHE_AKTIVITAET : FETT_ANTEIL;
  const eiweissG = eigen && e.eigeneEiweissG != null ? e.eigeneEiweissG : eiweiss.gramm;
  const fettG = eigen && e.eigeneFettG != null ? e.eigeneFettG : Math.round((kcal * fettAnteil) / KCAL_JE_G_FETT);
  const kohlenhydrateG = eigen && e.eigeneKohlenhydrateG != null ? e.eigeneKohlenhydrateG : kohlenhydrateAlsRest(kcal, eiweissG, fettG);

  const gruppe = altersgruppe(e.alter);
  const ziele: Record<string, NaehrstoffZiel> = {};

  for (const r of REFERENZWERTE) {
    let von = r.jeMJ !== undefined ? Math.round((r.jeMJ * kcal) / KCAL_JE_MJ * 100) / 100 : wertFuer((e.geschlecht === 'maennlich' ? r.maennlich : r.weiblich) ?? 0, gruppe);
    if (r.abAlter && e.alter >= r.abAlter.alter) von = r.abAlter.wert;
    ziele[r.code] = {
      code: r.code,
      art: r.art,
      quelle: r.quelle,
      von,
      ...(r.hinweis ? { hinweis: r.hinweis } : {}),
      ...(r.keineLuecke ? { keineLuecke: true as const } : {}),
    };
  }
  for (const h of HOECHSTWERTE) {
    const vorhanden = ziele[h.code];
    ziele[h.code] = {
      ...(vorhanden ?? { code: h.code, art: 'hoechstwert' as const, quelle: h.quelle }),
      hoechst: h.wert,
      hoechstArt: h.art,
      hoechstQuelle: h.quelle,
      ...(h.hinweis && !vorhanden?.hinweis ? { hinweis: h.hinweis } : {}),
    };
  }

  const eigenerOderRicht: ZielArt = eigen ? 'eigener-wert' : 'richtwert';
  const kcalAlsG = (anteil: number, kcalJeG: number) => Math.round(((kcal * anteil) / kcalJeG) * 10) / 10;

  const eigenOder = (quelle: string) => (eigen ? 'dein eigener Wert' : quelle);
  ziele.ENERCC = { code: 'ENERCC', art: eigenerOderRicht, von: kcal, quelle: eigenOder('Grundumsatz nach DGE × Aktivität') };
  const eiweissQuelle = e.ziel === 'halten' ? (e.alter >= 65 ? 'NNR 2023' : 'EFSA 2012, NNR 2023') : 'DGE 2020, Morton 2018';
  ziele.PROT625 = {
    code: 'PROT625',
    art: eigen ? 'eigener-wert' : e.ziel === 'halten' && e.alter < 65 ? 'empfehlung' : 'richtwert',
    ...(eigen ? { von: eiweissG } : { von: eiweiss.minimum, optimum: { von: eiweiss.von, bis: eiweiss.bis } }),
    quelle: eigenOder(eiweissQuelle),
    ...(!eigen && brauchtVielEiweiss(e.ziel, e.sport) ? { hinweis: 'Ab 2 g je kg über lange Zeit ist laut DGE ein Schaden an den Nieren nicht auszuschließen.' } : {}),
  };
  ziele.FAT = {
    code: 'FAT',
    art: eigenerOderRicht,
    ...(eigen
      ? { von: fettG }
      : { von: kcalAlsG(FETT_MINIMUM_ANTEIL, KCAL_JE_G_FETT), optimum: { von: kcalAlsG(FETT_OPTIMUM_ANTEIL.von, KCAL_JE_G_FETT), bis: kcalAlsG(FETT_OPTIMUM_ANTEIL.bis, KCAL_JE_G_FETT) } }),
    quelle: eigenOder('NNR 2023'),
  };
  ziele.FIBT = {
    ...ziele.FIBT!,
    optimum: BALLASTSTOFFE_OPTIMUM_G,
    hinweis: 'Gut sind fermentierbare Quellen wie Hafer und Hülsenfrüchte. Langsam steigern und genug trinken (DGE).',
  };
  ziele.CHO = {
    code: 'CHO',
    art: eigenerOderRicht,
    von: kohlenhydrateG,
    quelle: eigenOder('Rest der Energie'),
    hinweis: 'Am besten aus Vollkorn, Gemüse, Obst und Hülsenfrüchten (WHO 2023).',
  };
  ziele.FASAT = { code: 'FASAT', art: 'hoechstwert', hoechst: kcalAlsG(GESAETTIGT_HOECHST_ANTEIL, KCAL_JE_G_FETT), hoechstArt: 'hoechstwert', quelle: 'WHO 2023, NNR 2023' };
  ziele.NACL = { code: 'NACL', art: 'hoechstwert', hoechst: SALZ_HOECHST_G, hoechstArt: 'hoechstwert', quelle: 'EFSA 2019, WHO' };
  ziele.FAMS = { code: 'FAMS', art: 'richtwert', von: kcalAlsG(EINFACH_UNGESAETTIGT_ANTEIL.von, KCAL_JE_G_FETT), bis: kcalAlsG(EINFACH_UNGESAETTIGT_ANTEIL.bis, KCAL_JE_G_FETT), quelle: 'NNR 2023' };
  ziele.FAPU = { code: 'FAPU', art: 'richtwert', von: kcalAlsG(MEHRFACH_UNGESAETTIGT_ANTEIL.von, KCAL_JE_G_FETT), bis: kcalAlsG(MEHRFACH_UNGESAETTIGT_ANTEIL.bis, KCAL_JE_G_FETT), quelle: 'NNR 2023' };
  ziele.FAPUN3 = { code: 'FAPUN3', art: 'richtwert', von: kcalAlsG(OMEGA3_ANTEIL, KCAL_JE_G_FETT), quelle: 'NNR 2023' };
  ziele['F18:2CN6'] = { code: 'F18:2CN6', art: 'richtwert', von: kcalAlsG(LINOLSAEURE_ANTEIL, KCAL_JE_G_FETT), quelle: 'NNR 2023' };
  ziele['F18:3CN3'] = { code: 'F18:3CN3', art: 'richtwert', von: kcalAlsG(ALPHA_LINOLENSAEURE_ANTEIL, KCAL_JE_G_FETT), quelle: 'NNR 2023' };

  return {
    grundumsatz: Math.round(gu),
    pal,
    gesamtumsatz: Math.round(gesamt),
    wunschKcal: wunsch,
    untergrenze: grenze,
    untergrenzeGegriffen: wunsch < grenze,
    kcal,
    eiweissG,
    fettG,
    kohlenhydrateG,
    rechengewichtKg: Math.round(rechengewicht * 10) / 10,
    fettAnteil,
    freierZuckerHoechstG: kcalAlsG(FREIER_ZUCKER_HOECHST_ANTEIL, KCAL_JE_G_KOHLENHYDRATE),
    ziele,
  };
}

/** Was im Profil noch fehlt, um den Bedarf zu rechnen. Leer heißt: alles da. */
export function fehlendeAngaben(profil: Profil, gewichte: readonly Gewicht[]): string[] {
  const fehlt: string[] = [];
  if (!profil.geschlecht) fehlt.push('Geschlecht');
  if (profil.geburtsjahr === null) fehlt.push('Geburtsjahr');
  if (profil.groesseCm === null) fehlt.push('Größe');
  if (!neuestesGewicht(gewichte)) fehlt.push('Gewicht');
  if (!profil.aktivitaet) fehlt.push('Aktivität');
  if (!profil.ziel) fehlt.push('Ziel');
  if (profil.ziel === 'eigene' && profil.eigeneKcal === null) fehlt.push('Kalorien');
  return fehlt;
}

/** Der Bedarf aus Profil und neuestem Gewicht. Das Alter ergibt sich aus dem Geburtsjahr und erhöht sich von selbst. */
export function bedarfAusProfil(profil: Profil, gewichte: readonly Gewicht[], diesesJahr: number): Bedarf | null {
  const gewicht = neuestesGewicht(gewichte);
  if (!profil.geschlecht || profil.geburtsjahr === null || profil.groesseCm === null || !gewicht || !profil.aktivitaet || !profil.ziel) return null;
  return bedarfBerechnen({
    geschlecht: profil.geschlecht,
    alter: diesesJahr - profil.geburtsjahr,
    groesseCm: profil.groesseCm,
    gewichtKg: gewicht.kg,
    aktivitaet: profil.aktivitaet,
    sport: profil.sport,
    ziel: profil.ziel,
    tempo: profil.tempo,
    eigeneKcal: profil.eigeneKcal,
    eigeneEiweissG: profil.eigeneEiweissG,
    eigeneFettG: profil.eigeneFettG,
    eigeneKohlenhydrateG: profil.eigeneKohlenhydrateG,
  });
}

export const zielStandVon = (b: Bedarf): ZielStand => ({ kcal: b.kcal, eiweissG: b.eiweissG });

export function zielGeaendert(alt: ZielStand | null, neu: ZielStand): boolean {
  return alt !== null && (alt.kcal !== neu.kcal || alt.eiweissG !== neu.eiweissG);
}
