/**
 * Die Rechenlogik für „Mein Bedarf“ (Bauauftrag Abschnitt 4). Reine Rechnungen
 * ohne Abhängigkeit vom Mac, damit eine spätere Website sie übernehmen kann.
 * Die Zahlen selbst stehen in referenzwerte.ts.
 */
import type { Aktivitaet, Geschlecht, Gewicht, Profil, Tempo, Ziel, ZielStand } from './profil';
import { neuestesGewicht } from './profil';
import {
  ALPHA_LINOLENSAEURE_ANTEIL,
  GESAETTIGT_HOECHST_ANTEIL,
  HOECHSTWERTE,
  LINOLSAEURE_ANTEIL,
  REFERENZWERTE,
  SALZ_HOECHST_G,
  ZUCKER_HOECHST_ANTEIL,
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

/** Abstand zum Gesamtumsatz in kcal am Tag: 0,25 oder 0,5 kg pro Woche, gerechnet mit 7.700 kcal je kg. */
export const TEMPO_KCAL: Readonly<Record<'abnehmen' | 'aufbauen', Readonly<Record<Tempo, number>>>> = {
  abnehmen: { sanft: -275, mittel: -550 },
  aufbauen: { sanft: 250, mittel: 400 },
};

export const UNTERGRENZE_KCAL: Readonly<Record<Geschlecht, number>> = { weiblich: 1200, maennlich: 1500 };

/** Eiweiß beim Abnehmen und Muskelaufbau, DGE-Positionspapier „Proteinzufuhr im Sport“ (2020). */
export const EIWEISS_FUER_ZIELE_G_JE_KG = 1.6;
const EIWEISS_G_JE_KG = 0.8;
const EIWEISS_AB_65_G_JE_KG = 1.0;
const FETT_ANTEIL = 0.3;
const FETT_ANTEIL_HOHE_AKTIVITAET = 0.35;
const BALLASTSTOFFE_G = 30;

const KCAL_JE_G_EIWEISS = 4;
const KCAL_JE_G_FETT = 9;
const KCAL_JE_G_KOHLENHYDRATE = 4;
const KCAL_JE_G_BALLASTSTOFFE = 2;

/** Formel der DGE für den Ruheenergieverbrauch (Müller-Formel), in kcal am Tag. Die Größe kommt darin nicht vor. */
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

export function eiweissJeKg(ziel: Ziel, alter: number): number {
  if (ziel === 'abnehmen' || ziel === 'aufbauen') return EIWEISS_FUER_ZIELE_G_JE_KG;
  return alter >= 65 ? EIWEISS_AB_65_G_JE_KG : EIWEISS_G_JE_KG;
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
  /** Darauf soll man kommen. Fehlt, wenn es nur eine Obergrenze gibt (Salz, Zucker, …). */
  von?: number;
  /** Obere Grenze einer Spanne (Kupfer, Mangan, Chrom, Molybdän). */
  bis?: number;
  /** Darüber sollte man auf Dauer nicht liegen. */
  hoechst?: number;
  hoechstArt?: HoechstArt;
  hinweis?: string;
  /** Wird angezeigt, aber nicht als Lücke gemeldet (Vitamin D, Fluorid). */
  keineLuecke?: true;
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
  eiweissFaktor: number;
  fettAnteil: number;
  ziele: Readonly<Record<string, NaehrstoffZiel>>;
}

const wertFuer = (wert: number | readonly [number, number, number, number], gruppe: Altersgruppe) => (typeof wert === 'number' ? wert : wert[gruppe]);

/** Die Kohlenhydrate füllen auf, was nach Eiweiß, Fett und Ballaststoffen noch frei ist. */
function kohlenhydrateAlsRest(kcal: number, eiweissG: number, fettG: number): number {
  const rest = kcal - eiweissG * KCAL_JE_G_EIWEISS - fettG * KCAL_JE_G_FETT - BALLASTSTOFFE_G * KCAL_JE_G_BALLASTSTOFFE;
  return Math.max(0, Math.round(rest / KCAL_JE_G_KOHLENHYDRATE));
}

export function bedarfBerechnen(e: BedarfEingabe): Bedarf {
  const gu = grundumsatz(e.geschlecht, e.gewichtKg, e.alter);
  const pal = palWert(e.aktivitaet, e.sport);
  const gesamt = gu * pal;
  const grenze = untergrenze(e.geschlecht, gu);

  const eigen = e.ziel === 'eigene';
  let wunsch = Math.round(gesamt);
  if (e.ziel === 'abnehmen' || e.ziel === 'aufbauen') wunsch = Math.round(gesamt + TEMPO_KCAL[e.ziel][e.tempo]);
  if (eigen && e.eigeneKcal != null) wunsch = Math.round(e.eigeneKcal);
  const kcal = Math.max(wunsch, grenze);

  const rechengewicht = rechengewichtFuerEiweiss(e.gewichtKg, e.groesseCm);
  const faktor = eiweissJeKg(e.ziel, e.alter);
  const fettAnteil = pal > 1.7 ? FETT_ANTEIL_HOHE_AKTIVITAET : FETT_ANTEIL;
  const eiweissG = eigen && e.eigeneEiweissG != null ? e.eigeneEiweissG : Math.round(rechengewicht * faktor);
  const fettG = eigen && e.eigeneFettG != null ? e.eigeneFettG : Math.round((kcal * fettAnteil) / KCAL_JE_G_FETT);
  const kohlenhydrateG = eigen && e.eigeneKohlenhydrateG != null ? e.eigeneKohlenhydrateG : kohlenhydrateAlsRest(kcal, eiweissG, fettG);

  const gruppe = altersgruppe(e.alter);
  const ziele: Record<string, NaehrstoffZiel> = {};

  for (const r of REFERENZWERTE) {
    ziele[r.code] = {
      code: r.code,
      art: r.art,
      von: wertFuer(e.geschlecht === 'maennlich' ? r.maennlich : r.weiblich, gruppe),
      ...(r.bis !== undefined ? { bis: r.bis } : {}),
      ...(r.hinweis ? { hinweis: r.hinweis } : {}),
      ...(r.keineLuecke ? { keineLuecke: true as const } : {}),
    };
  }
  for (const h of HOECHSTWERTE) {
    const vorhanden = ziele[h.code];
    ziele[h.code] = {
      ...(vorhanden ?? { code: h.code, art: 'hoechstwert' as const }),
      hoechst: h.wert,
      hoechstArt: h.art,
      ...(h.hinweis && !vorhanden?.hinweis ? { hinweis: h.hinweis } : {}),
    };
  }

  const eigenerOderRicht: ZielArt = eigen ? 'eigener-wert' : 'richtwert';
  const kcalAlsG = (anteil: number, kcalJeG: number) => Math.round(((kcal * anteil) / kcalJeG) * 10) / 10;

  ziele.ENERCC = { code: 'ENERCC', art: eigenerOderRicht, von: kcal };
  ziele.PROT625 = {
    code: 'PROT625',
    art: eigen ? 'eigener-wert' : faktor !== EIWEISS_FUER_ZIELE_G_JE_KG ? (e.alter >= 65 ? 'schaetzwert' : 'empfehlung') : 'richtwert',
    von: eiweissG,
  };
  ziele.FAT = { code: 'FAT', art: eigenerOderRicht, von: fettG };
  ziele.CHO = { code: 'CHO', art: eigenerOderRicht, von: kohlenhydrateG };
  ziele.FASAT = { code: 'FASAT', art: 'hoechstwert', hoechst: kcalAlsG(GESAETTIGT_HOECHST_ANTEIL, KCAL_JE_G_FETT), hoechstArt: 'hoechstwert' };
  ziele.SUGAR = {
    code: 'SUGAR',
    art: 'hoechstwert',
    hoechst: kcalAlsG(ZUCKER_HOECHST_ANTEIL, KCAL_JE_G_KOHLENHYDRATE),
    hoechstArt: 'hoechstwert',
    hinweis: 'Zählt allen Zucker, auch den aus Obst und Milch.',
  };
  ziele.NACL = { code: 'NACL', art: 'hoechstwert', hoechst: SALZ_HOECHST_G, hoechstArt: 'hoechstwert' };
  ziele['F18:2CN6'] = { code: 'F18:2CN6', art: 'richtwert', von: kcalAlsG(LINOLSAEURE_ANTEIL, KCAL_JE_G_FETT) };
  ziele['F18:3CN3'] = { code: 'F18:3CN3', art: 'schaetzwert', von: kcalAlsG(ALPHA_LINOLENSAEURE_ANTEIL, KCAL_JE_G_FETT) };

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
    eiweissFaktor: faktor,
    fettAnteil,
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
