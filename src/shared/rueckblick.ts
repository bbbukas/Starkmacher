/**
 * Der Rückblick über eine Woche oder einen Monat (Bauauftrag Abschnitt 9): Durchschnitt je Nährstoff im Vergleich zum Ziel,
 * an wie vielen Tagen das Ziel erreicht war und was meistens fehlte. Reine Rechnung, damit sie sich prüfen lässt.
 *
 * - Gezählt werden nur Tage mit Einträgen. Der heutige Tag zählt noch nicht: Er läuft noch, und ein halber Tag sähe aus wie eine Lücke.
 * - Was im Schnitt der Woche zählt (woche.ts), wird nach Wochen bewertet, nicht nach einzelnen Tagen.
 * - Verglichen wird mit dem heutigen Bedarf, frühere Ziele hält das Programm nicht fest.
 */
import type { Bedarf, ZielArt } from './bedarf';
import { mengeText, zahlText } from './format';
import { NAEHRSTOFFE, type GruppenId, type Naehrstoff } from './naehrstoffe';
import { datumVon } from './profil';
import {
  aufzaehlung,
  EPA_DHA_CODE,
  EPA_DHA_ZIEL,
  FREIER_ZUCKER_CODE,
  istGeschafft,
  KEINE_LUECKE_TEXT,
  KURZNAMEN,
  NICHT_ALS_LUECKE,
  stufeVon,
  tagessumme,
  zaehltWoechentlich,
  type Stufe,
  type StufenZiel,
  type SummenWert,
  type Tagessumme,
  type TagebuchEintrag,
} from './tagebuch';
import { SPIELRAUM, wochenTage } from './woche';

export type ZeitraumArt = 'woche' | 'monat';

export interface Zeitraum {
  art: ZeitraumArt;
  von: string;
  bis: string;
  tage: readonly string[];
}

const alsDatum = (tag: string) => new Date(`${tag}T12:00:00`);

/** Die Woche (Montag bis Sonntag) oder der Kalendermonat, in dem dieser Tag liegt. */
export function zeitraumUm(art: ZeitraumArt, tag: string): Zeitraum {
  if (art === 'woche') {
    const tage = wochenTage(tag);
    return { art, von: tage[0]!, bis: tage[6]!, tage };
  }
  const d = alsDatum(tag);
  const tage: string[] = [];
  for (const t = new Date(d.getFullYear(), d.getMonth(), 1, 12); t.getMonth() === d.getMonth(); t.setDate(t.getDate() + 1)) tage.push(datumVon(t));
  return { art, von: tage[0]!, bis: tage.at(-1)!, tage };
}

export function zeitraumDaneben(z: Zeitraum, schritt: -1 | 1): Zeitraum {
  const t = alsDatum(schritt < 0 ? z.von : z.bis);
  t.setDate(t.getDate() + schritt);
  return zeitraumUm(z.art, datumVon(t));
}

/** Am Anfang steht der Zeitraum von gestern: Am Montag gibt es in der neuen Woche noch nichts zurückzublicken. */
export function startZeitraum(art: ZeitraumArt, heute: string): Zeitraum {
  const t = alsDatum(heute);
  t.setDate(t.getDate() - 1);
  return zeitraumUm(art, datumVon(t));
}

/** Was der Rückblick aus dem Tagebuch braucht: den Zeitraum und die ganzen Wochen an seinen Rändern. */
export function zeitraumAbruf(z: Zeitraum): { von: string; bis: string } {
  return { von: wochenTage(z.von)[0]!, bis: wochenTage(z.bis)[6]! };
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** „2. bis 8. November“, „28. September bis 4. Oktober“, „November 2026“. Ein anderes Jahr steht dabei. */
export function zeitraumTitel(z: Zeitraum, heute: string): string {
  const von = alsDatum(z.von);
  const bis = alsDatum(z.bis);
  if (z.art === 'monat') return `${MONATE[von.getMonth()]} ${von.getFullYear()}`;
  const jahr = bis.getFullYear() === alsDatum(heute).getFullYear() ? '' : ` ${bis.getFullYear()}`;
  if (von.getMonth() === bis.getMonth()) return `${von.getDate()}. bis ${bis.getDate()}. ${MONATE[bis.getMonth()]}${jahr}`;
  return `${von.getDate()}. ${MONATE[von.getMonth()]} bis ${bis.getDate()}. ${MONATE[bis.getMonth()]}${jahr}`;
}

/** So wird eine Zeile bewertet. keine: Sie steht nur zum Ansehen da, wie Vitamin D oder alles ohne Ziel. */
export type Bewertung = 'tage' | 'wochen' | 'grenze' | 'plan' | 'keine';

export interface RueckblickZeile {
  code: string;
  name: string;
  gruppe: GruppenId;
  einheit: Pick<Naehrstoff, 'einheit' | 'zeigeInMg'>;
  /** Durchschnitt je gezähltem Tag. */
  schnitt: number;
  ziel: StufenZiel | null;
  art?: ZielArt;
  quelle?: string;
  hinweis?: string;
  /** Stufe des Durchschnitts. */
  stufe: Stufe;
  bewertung: Bewertung;
  /** An so vielen Tagen oder in so vielen Wochen war das Ziel erreicht … */
  imZiel: number;
  /** … von so vielen. */
  anzahl: number;
  /** Tage im Optimum, wo es eins gibt. */
  imOptimum: number;
  /** Meistens zu wenig. */
  zuWenig: boolean;
  /** Meistens über der Grenze. */
  zuViel: boolean;
  /** Einträge ohne Angabe zu diesem Nährstoff. */
  fehltBei: readonly string[];
}

export interface Rueckblick {
  /** Tage mit Einträgen, die zählen. */
  tage: number;
  wochen: number;
  /** Heute steht etwas im Tagebuch, zählt aber noch nicht mit. */
  heuteLaeuft: boolean;
  zeilen: RueckblickZeile[];
}

/** Kalorien gelten als im Plan, wenn sie nicht mehr als 10 % daneben liegen: Genauer lässt sich Essen ohnehin nicht schätzen. */
export const KCAL_SPIELRAUM = 0.1;

const SICH_ZEIGT_ERST_BEI = 0.5;

interface Zeilenwerk {
  tage: readonly Tagessumme[];
  wochen: readonly { schnitt(wert: (s: Tagessumme) => SummenWert): number }[];
  gesamt: Tagessumme;
}

function zeileBewerten(
  basis: Pick<RueckblickZeile, 'code' | 'name' | 'gruppe' | 'einheit'> & { art?: ZielArt; quelle?: string; hinweis?: string },
  ziel: StufenZiel | null,
  wert: (s: Tagessumme) => SummenWert,
  werk: Zeilenwerk,
): RueckblickZeile {
  const summe = wert(werk.gesamt);
  const schnitt = summe.menge / Math.max(1, werk.tage.length);
  const fertig = (b: Bewertung, imZiel: number, anzahl: number, extra: Partial<RueckblickZeile> = {}): RueckblickZeile => ({
    ...basis,
    schnitt,
    ziel,
    stufe: stufeVon(schnitt, ziel),
    bewertung: b,
    imZiel,
    anzahl,
    imOptimum: 0,
    zuWenig: false,
    zuViel: false,
    fehltBei: summe.fehltBei,
    ...extra,
  });

  const mengen = werk.tage.map((s) => wert(s).menge);
  const tage = mengen.length;
  if (!ziel) return fertig('keine', 0, 0);

  // Die Kalorien stehen für sich: im Plan ist, wer ungefähr trifft. Kohlenhydrate sind nur der Rest (Bauauftrag 4.2).
  if (basis.code === 'ENERCC') {
    const plan = ziel.von!;
    return fertig('plan', mengen.filter((m) => Math.abs(m - plan) <= plan * KCAL_SPIELRAUM).length, tage);
  }
  if (NICHT_ALS_LUECKE.has(basis.code)) return fertig('keine', 0, 0);
  if (ziel.keineLuecke) return fertig('keine', 0, 0);

  // Nur eine Obergrenze: Im Ziel ist jeder Tag darunter.
  if (ziel.von === undefined) {
    const hoechst = ziel.hoechst!;
    const drueber = mengen.filter((m) => m > hoechst).length;
    return fertig('grenze', tage - drueber, tage, { zuViel: drueber > tage * SICH_ZEIGT_ERST_BEI });
  }

  if (zaehltWoechentlich(basis.code, ziel)) {
    const schnitte = werk.wochen.map((w) => w.schnitt(wert));
    const erreicht = schnitte.filter((s) => istGeschafft(stufeVon(s, ziel))).length;
    const knapp = schnitte.filter((s) => s < ziel.von! * (1 - SPIELRAUM)).length;
    return fertig('wochen', erreicht, schnitte.length, { zuWenig: knapp > schnitte.length * SICH_ZEIGT_ERST_BEI, zuViel: schnitte.filter((s) => stufeVon(s, ziel) === 'ueber').length > schnitte.length * SICH_ZEIGT_ERST_BEI });
  }

  const stufen = mengen.map((m) => stufeVon(m, ziel));
  const unter = stufen.filter((s) => s === 'unter').length;
  const drueber = stufen.filter((s) => s === 'ueber').length;
  return fertig('tage', stufen.filter(istGeschafft).length, tage, {
    imOptimum: ziel.optimum ? stufen.filter((s) => s === 'optimum').length : 0,
    zuWenig: unter > tage * SICH_ZEIGT_ERST_BEI,
    zuViel: drueber > tage * SICH_ZEIGT_ERST_BEI,
  });
}

const MG: Pick<Naehrstoff, 'einheit'> = { einheit: 'mg' };
const G: Pick<Naehrstoff, 'einheit'> = { einheit: 'g' };

export function rueckblickRechnen(eintraege: readonly TagebuchEintrag[], z: Zeitraum, bedarf: Bedarf, ausgeblendet: readonly string[], heute: string): Rueckblick {
  const imZeitraum = eintraege.filter((e) => z.tage.includes(e.datum));
  const fertigeTage = z.tage.filter((t) => t !== heute && t <= heute);
  const nachTag = new Map<string, TagebuchEintrag[]>();
  for (const e of imZeitraum) {
    if (!fertigeTage.includes(e.datum)) continue;
    nachTag.set(e.datum, [...(nachTag.get(e.datum) ?? []), e]);
  }
  const tage = [...nachTag.keys()].sort();

  // Jede Woche zählt mit den Tagen, die eingetragen sind, auch denen jenseits des Monatsrands: Sonst entschiede dort ein einziger Tag über die Woche.
  const wochenImZeitraum = new Set(tage.map((t) => wochenTage(t)[0]!));
  const nachWoche = new Map<string, TagebuchEintrag[]>();
  for (const e of eintraege) {
    const montag = wochenTage(e.datum)[0]!;
    if (e.datum < heute && wochenImZeitraum.has(montag)) nachWoche.set(montag, [...(nachWoche.get(montag) ?? []), e]);
  }
  const wochen = [...nachWoche.values()].map((liste) => {
    const summe = tagessumme(liste);
    const anzahl = new Set(liste.map((e) => e.datum)).size;
    return { schnitt: (wert: (s: Tagessumme) => SummenWert) => wert(summe).menge / anzahl };
  });

  const werk: Zeilenwerk = { tage: tage.map((t) => tagessumme(nachTag.get(t)!)), wochen, gesamt: tagessumme(tage.flatMap((t) => nachTag.get(t)!)) };

  const zeilen: RueckblickZeile[] = [];
  if (!ausgeblendet.includes('SUGAR')) {
    zeilen.push(zeileBewerten({ code: FREIER_ZUCKER_CODE, name: 'Freier Zucker, geschätzt', gruppe: 'kohlenhydrate', einheit: G, art: 'hoechstwert', quelle: 'WHO 2015, NNR 2023' }, { hoechst: bedarf.freierZuckerHoechstG }, (s) => s.freierZuckerG, werk));
  }
  if (!ausgeblendet.includes('F20:5CN3') && !ausgeblendet.includes('F22:6CN3')) {
    zeilen.push(zeileBewerten({ code: EPA_DHA_CODE, name: 'EPA und DHA', gruppe: 'fettsaeuren', einheit: MG, art: 'schaetzwert', quelle: 'EFSA 2010' }, { von: EPA_DHA_ZIEL.von, optimum: EPA_DHA_ZIEL.optimum }, (s) => s.epaDhaMg, werk));
  }
  for (const n of NAEHRSTOFFE) {
    if (ausgeblendet.includes(n.code)) continue;
    const ziel = bedarf.ziele[n.code];
    const hinweis = KEINE_LUECKE_TEXT[n.code];
    const name = KURZNAMEN[n.code] ?? n.name;
    zeilen.push(zeileBewerten({ code: n.code, name, gruppe: n.gruppe, einheit: n, ...(ziel ? { art: ziel.art, quelle: ziel.quelle } : {}), ...(hinweis ? { hinweis } : {}) }, ziel ?? null, (s) => s.werte[n.code]!, werk));
  }

  return { tage: tage.length, wochen: wochen.length, heuteLaeuft: imZeitraum.some((e) => e.datum === heute), zeilen };
}

const VORN = ['PROT625', 'FIBT'];

/** Wie weit ein Wert unter dem Ziel lag. Eiweiß und Ballaststoffe stehen vorn, danach richtet sich das Essen am ehesten. */
function nachDringlichkeit(a: RueckblickZeile, b: RueckblickZeile): number {
  const vorn = (z: RueckblickZeile) => (VORN.includes(z.code) ? 0 : 1);
  const anteil = (z: RueckblickZeile) => z.schnitt / (z.ziel?.von ?? 1);
  return vorn(a) - vorn(b) || anteil(a) - anteil(b);
}

function liste(zeilen: readonly RueckblickZeile[], anzahl = 5): string {
  const weitere = zeilen.length - anzahl;
  return aufzaehlung([...zeilen.slice(0, anzahl).map((z) => z.name), ...(weitere > 0 ? [`${weitere} ${weitere === 1 ? 'weiterer Wert' : 'weitere Werte'}`] : [])]);
}

/** Was meistens fehlte, in ein bis drei kurzen Sätzen. */
export function rueckblickSaetze(r: Rueckblick, art: ZeitraumArt): string[] {
  const zuWenig = r.zeilen.filter((z) => z.zuWenig);
  const tagesweise = zuWenig.filter((z) => z.bewertung === 'tage').sort(nachDringlichkeit);
  const wochenweise = zuWenig.filter((z) => z.bewertung === 'wochen').sort(nachDringlichkeit);
  const zuViel = r.zeilen.filter((z) => z.zuViel);
  const saetze: string[] = [];
  if (tagesweise.length > 0) saetze.push(`An den meisten Tagen zu wenig: ${liste(tagesweise)}.`);
  if (wochenweise.length > 0) saetze.push(`${art === 'woche' || r.wochen === 1 ? 'In dieser Woche' : 'In den meisten Wochen'} zu niedrig: ${liste(wochenweise)}.`);
  if (zuViel.length > 0) saetze.push(`An den meisten Tagen über der Grenze: ${liste(zuViel)}.`);
  return saetze.length > 0 ? saetze : ['Nichts hat meistens gefehlt. Stark!'];
}

/** „Ø 85 g von 58 g“, „Ø 3 g bis 5 g“, „Ø 12 g“ */
export function schnittText(z: Pick<RueckblickZeile, 'schnitt' | 'ziel' | 'einheit'>): string {
  const menge = `Ø ${mengeText(z.schnitt, z.einheit)}`;
  if (z.ziel?.von !== undefined) return `${menge} von ${mengeText(z.ziel.von, z.einheit)}`;
  if (z.ziel?.hoechst !== undefined) return `${menge} bis ${mengeText(z.ziel.hoechst, z.einheit)}`;
  return menge;
}

const tageWort = (n: number) => (n === 1 ? 'Tag' : 'Tagen');

/** Der kleine Satz unter einer Zeile. */
export function rueckblickLage(z: RueckblickZeile): string {
  const von = `${zahlText(z.imZiel)} von ${z.anzahl}`;
  switch (z.bewertung) {
    case 'plan':
      return `an ${von} ${tageWort(z.anzahl)} im Plan, auf 10 % genau`;
    case 'grenze':
      return `an ${von} ${tageWort(z.anzahl)} unter der Grenze`;
    case 'tage':
      return z.ziel?.optimum ? `an ${von} ${tageWort(z.anzahl)} Minimum erreicht, an ${z.imOptimum} im Optimum` : `an ${von} ${tageWort(z.anzahl)} erreicht`;
    case 'wochen':
      if (z.anzahl === 1) return z.imZiel === 1 ? 'im Schnitt der Woche erreicht' : 'im Schnitt der Woche unter dem Ziel';
      return `in ${von} Wochen erreicht`;
    case 'keine':
      return z.hinweis ?? '';
  }
}

/** Für die Kopfzeile einer Gruppe: Passt der Durchschnitt? Bei den Kalorien heißt das ungefähr getroffen, nicht „mindestens“. */
export function schnittPasst(z: Pick<RueckblickZeile, 'bewertung' | 'schnitt' | 'stufe' | 'ziel'>): boolean {
  if (z.bewertung === 'plan') return Math.abs(z.schnitt - z.ziel!.von!) <= z.ziel!.von! * KCAL_SPIELRAUM;
  return istGeschafft(z.stufe) || z.stufe === 'luft';
}

/** Alles erreicht: Das darf man sehen. */
export const ganzImZiel = (z: RueckblickZeile) => z.bewertung !== 'keine' && z.anzahl > 0 && z.imZiel === z.anzahl;

export interface GewichtsAchse {
  von: number;
  bis: number;
  striche: number[];
}

/**
 * Die Achse der Gewichtskurve mit runden Werten. Mindestens 2 kg hoch, damit kleine Schwankungen nicht wie ein Absturz aussehen.
 * Sie muss nicht bei null beginnen: Es geht um die Veränderung, nicht um die Menge.
 */
export function gewichtsAchse(werte: readonly number[]): GewichtsAchse {
  if (werte.length === 0) return { von: 0, bis: 1, striche: [] };
  const klein = Math.min(...werte);
  const gross = Math.max(...werte);
  const mitte = (klein + gross) / 2;
  const spanne = Math.max(gross - klein, 2);
  const roh = spanne / 3;
  const schritt = [0.5, 1, 2, 5, 10, 20, 50].find((s) => s >= roh) ?? 100;
  const von = Math.floor((mitte - (spanne / 2) * 1.1) / schritt) * schritt;
  const bis = Math.ceil((mitte + (spanne / 2) * 1.1) / schritt) * schritt;
  const striche: number[] = [];
  for (let s = von; s <= bis + schritt / 2; s += schritt) striche.push(Math.round(s * 10) / 10);
  return { von, bis, striche };
}
