/**
 * Das Tagebuch (Bauauftrag Abschnitt 8): Einträge, Tagessumme, Stufen und Lücken. Reine Rechnungen ohne Abhängigkeit vom Mac.
 *
 * Ein Eintrag speichert die Nährwerte so, wie sie beim Eintragen waren (Bauauftrag Abschnitt 2). Ändert sich später das
 * Lebensmittel, bleiben vergangene Tage, wie sie sind.
 */
import type { Bedarf } from './bedarf';
import { inGramm, istUngefaehr, umrechnungPruefen, type EintragEinheit, type Groesse, type MengenEinheit, type Umrechnung } from './einheiten';
import { StarkFehler } from './fehler';
import { mengeText, zahlText } from './format';
import { werteJe100g, type Lebensmittel, type Werte } from './lebensmittel';
import { NAEHRSTOFFE, naehrstoff, type GruppenId, type Naehrstoff } from './naehrstoffe';
import { datumErlaubt } from './profil';
import { EPA_DHA_MINIMUM_MG, EPA_DHA_OPTIMUM_MG } from './referenzwerte';
import type { Rolle } from './teller';

const GRUNDWERTE: Umrechnung = { dichte: 1, el: 15, tl: 5, prise: 0.5, stueck: null, groessen: null, scheibe: null, dose: null, becher: null, packung: null };

export type Mahlzeit = 'fruehstueck' | 'mittag' | 'abend' | 'nacht' | 'snacks';

export const MAHLZEITEN: readonly { id: Mahlzeit; titel: string }[] = [
  { id: 'fruehstueck', titel: 'Frühstück' },
  { id: 'mittag', titel: 'Mittag' },
  { id: 'abend', titel: 'Abend' },
  { id: 'nacht', titel: 'Nacht' },
  { id: 'snacks', titel: 'Snacks' },
];

const MAHLZEIT_IDS = MAHLZEITEN.map((m) => m.id);

/** Wohin ein Vorschlag fürs Erste kommt. */
export function mahlzeitNachUhrzeit(d: Date): Mahlzeit {
  const stunde = d.getHours() + d.getMinutes() / 60;
  if (stunde < 4) return 'nacht';
  if (stunde < 10.5) return 'fruehstueck';
  if (stunde < 15) return 'mittag';
  if (stunde < 22) return 'abend';
  return 'nacht';
}

export interface MengenAngabe {
  menge: number;
  einheit: MengenEinheit;
  groesse: Groesse | null;
}

/** Ein Lebensmittel mit Menge und dem festgehaltenen Stand seiner Nährwerte. */
export interface Bestandteil extends MengenAngabe {
  id: string;
  lebensmittelId: string;
  name: string;
  marke: string | null;
  gramm: number;
  /** Stand beim Eintragen, damit sich auch die Menge später noch umrechnen lässt. */
  umrechnung: Umrechnung;
  werteJe100g: Werte;
  spuren: readonly string[];
  freierZuckerJe100g: number | null;
  /** Nur auf einem Teller: wofür dieser Bestandteil steht. */
  rolle?: Rolle;
  /** Nur auf einem Teller: das Rezept, aus dem diese Zutat stammt. */
  gehoertZu?: string;
}

/** Bei einem Rezept oder Teller im Tagebuch: die Zutaten für genau die eingetragene Menge. */
export interface RezeptStand {
  /** So viele Portionen ergibt das Rezept. Ein Teller zählt als eine. */
  portionen: number;
  bestandteile: Bestandteil[];
  /** Für dieses eine Mal geändert, zum Beispiel weniger Öl. */
  angepasst: boolean;
}

export interface TagebuchEintrag extends Omit<Bestandteil, 'einheit'> {
  einheit: EintragEinheit;
  datum: string;
  mahlzeit: Mahlzeit;
  art: 'lebensmittel' | 'rezept' | 'teller';
  rezept?: RezeptStand;
  erstelltAm: string;
}

export interface EintragEingabe {
  menge: number;
  einheit: EintragEinheit;
  groesse: Groesse | null;
  datum: string;
  mahlzeit: Mahlzeit;
  /** Kennung eines Lebensmittels oder eines Rezepts. */
  lebensmittelId: string;
}

/** Eine Zutat eines Rezept-Eintrags: mit `id` eine vorhandene, mit `lebensmittelId` eine neue. */
export interface BestandteilAenderung extends MengenAngabe {
  id?: string;
  lebensmittelId?: string;
  rolle?: Rolle;
}

export interface EintragAenderung {
  menge: number;
  einheit: EintragEinheit;
  groesse: Groesse | null;
  mahlzeit: Mahlzeit;
  /** Nur nötig, wenn für diese Einheit gerade ein Gewicht nachgetragen wurde. */
  umrechnung?: Umrechnung;
  /** Nur bei Rezepten: die Zutaten für dieses eine Mal. Fehlt es, werden die Zutaten mit den Portionen umgerechnet. */
  bestandteile?: BestandteilAenderung[];
}

/** Der kurze Satz bei Nährstoffen, die nie als Lücke zählen (Bauauftrag 4.2). */
export const KEINE_LUECKE_TEXT: Readonly<Record<string, string>> = {
  VITD: 'kommt vor allem von der Sonne',
  FD: 'auch aus Trinkwasser und Zahnpasta',
  CLD: 'kommt fast nur aus Salz',
  WATER: 'zählt, was eingetragen ist',
};

const EINHEITEN_IDS: readonly MengenEinheit[] = ['g', 'kg', 'ml', 'l', 'EL', 'TL', 'Prise', 'Stück', 'Scheibe', 'Dose', 'Becher', 'Packung'];

export function mengenAngabePruefen(roh: Record<string, unknown>): MengenAngabe {
  const menge = roh.menge;
  if (typeof menge !== 'number' || !Number.isFinite(menge) || menge <= 0 || menge > 100_000) throw new StarkFehler('UNGUELTIG', 'Bitte eine Menge über 0 eintragen.');
  if (!EINHEITEN_IDS.includes(roh.einheit as MengenEinheit)) throw new StarkFehler('UNGUELTIG', 'Die Einheit stimmt nicht.');
  const groesse = roh.groesse === 'S' || roh.groesse === 'M' || roh.groesse === 'L' ? roh.groesse : null;
  return { menge, einheit: roh.einheit as MengenEinheit, groesse };
}

export function mahlzeitPruefen(roh: unknown): Mahlzeit {
  if (!MAHLZEIT_IDS.includes(roh as Mahlzeit)) throw new StarkFehler('UNGUELTIG', 'Die Mahlzeit stimmt nicht.');
  return roh as Mahlzeit;
}

export function eingabePruefenEintrag(roh: unknown): EintragEingabe {
  if (typeof roh !== 'object' || roh === null) throw new StarkFehler('UNGUELTIG', 'Der Eintrag stimmt nicht.');
  const e = roh as Record<string, unknown>;
  if (!datumErlaubt(e.datum)) throw new StarkFehler('UNGUELTIG', 'Das Datum stimmt nicht.');
  if (typeof e.lebensmittelId !== 'string') throw new StarkFehler('UNGUELTIG', 'Das Lebensmittel stimmt nicht.');
  const grund = { datum: e.datum, mahlzeit: mahlzeitPruefen(e.mahlzeit), lebensmittelId: e.lebensmittelId };
  if (e.einheit === 'Portion' || e.einheit === 'Teller') return { ...grund, menge: portionenPruefen(e.menge), einheit: e.einheit, groesse: null };
  return { ...grund, ...mengenAngabePruefen(e) };
}

export function portionenPruefen(roh: unknown): number {
  if (typeof roh !== 'number' || !Number.isFinite(roh) || roh <= 0 || roh > 200) throw new StarkFehler('UNGUELTIG', 'Bitte eine Portion über 0 eintragen.');
  return roh;
}

function grammFuer(angabe: MengenAngabe, umrechnung: Umrechnung): number {
  const gramm = inGramm(angabe.menge, angabe.einheit, umrechnung, angabe.groesse ?? 'M');
  if (gramm === null) throw new StarkFehler('UNGUELTIG', `Für „${angabe.einheit}“ ist noch kein Gewicht hinterlegt.`);
  if (gramm > 100_000) throw new StarkFehler('UNGUELTIG', 'Diese Menge ist zu groß.');
  return gramm;
}

/** Hält den Stand eines Lebensmittels in einer Menge fest. */
export function bestandteilAnlegen(lm: Lebensmittel, angabe: MengenAngabe, id: string): Bestandteil {
  const faktor = lm.basis === 'ml' ? 1 / lm.umrechnung.dichte : 1;
  return {
    id,
    lebensmittelId: lm.id,
    name: lm.name,
    marke: lm.marke,
    menge: angabe.menge,
    einheit: angabe.einheit,
    groesse: angabe.groesse,
    gramm: grammFuer(angabe, lm.umrechnung),
    umrechnung: umrechnungPruefen(lm.umrechnung),
    werteJe100g: werteJe100g(lm),
    spuren: lm.spuren,
    freierZuckerJe100g: lm.freierZuckerG === null ? null : lm.freierZuckerG * faktor,
  };
}

export function eintragAnlegen(lm: Lebensmittel, eingabe: EintragEingabe, id: string, erstelltAm: string): TagebuchEintrag {
  if (eingabe.einheit === 'Portion' || eingabe.einheit === 'Teller') throw new StarkFehler('UNGUELTIG', 'Die Einheit stimmt nicht.');
  const angabe: MengenAngabe = { menge: eingabe.menge, einheit: eingabe.einheit, groesse: eingabe.groesse };
  return { ...bestandteilAnlegen(lm, angabe, id), datum: eingabe.datum, mahlzeit: eingabe.mahlzeit, art: 'lebensmittel', erstelltAm };
}

/** Die Summe aller Zutaten, auf 100 g umgerechnet. Was bei einer Zutat fehlt, fehlt in der Summe nur bei ihr. */
export function aggregat(bestandteile: readonly Bestandteil[]): { gramm: number; werteJe100g: Record<string, number>; freierZuckerJe100g: number | null } {
  const gramm = bestandteile.reduce((summe, b) => summe + b.gramm, 0);
  const mengen: Record<string, number> = {};
  let zucker: number | null = null;
  for (const b of bestandteile) {
    for (const [code, je100] of Object.entries(b.werteJe100g)) mengen[code] = (mengen[code] ?? 0) + (je100 * b.gramm) / 100;
    if (b.freierZuckerJe100g !== null) zucker = (zucker ?? 0) + (b.freierZuckerJe100g * b.gramm) / 100;
  }
  const aufHundert = (menge: number) => (gramm > 0 ? (menge / gramm) * 100 : 0);
  const werteJe100g: Record<string, number> = {};
  for (const [code, menge] of Object.entries(mengen)) werteJe100g[code] = aufHundert(menge);
  return { gramm, werteJe100g, freierZuckerJe100g: zucker === null ? null : aufHundert(zucker) };
}

export const skaliert = (b: Bestandteil, faktor: number): Bestandteil => ({ ...b, menge: b.menge * faktor, gramm: b.gramm * faktor });

/** Ein Rezept oder Teller im Tagebuch: Die Zutaten werden auf die gegessene Menge umgerechnet und festgehalten. */
export function rezeptEintragAnlegen(
  r: { rezeptId: string; name: string; portionen: number; bestandteile: readonly Bestandteil[]; art?: 'rezept' | 'teller' },
  eingabe: EintragEingabe,
  id: string,
  erstelltAm: string,
  neueId: () => string,
): TagebuchEintrag {
  const faktor = eingabe.menge / r.portionen;
  const bestandteile = r.bestandteile.map((b) => ({ ...skaliert(b, faktor), id: neueId() }));
  const summe = aggregat(bestandteile);
  return {
    id,
    datum: eingabe.datum,
    mahlzeit: eingabe.mahlzeit,
    art: r.art ?? 'rezept',
    lebensmittelId: r.rezeptId,
    name: r.name,
    marke: null,
    menge: eingabe.menge,
    einheit: r.art === 'teller' ? 'Teller' : 'Portion',
    groesse: null,
    gramm: summe.gramm,
    umrechnung: umrechnungPruefen(GRUNDWERTE),
    werteJe100g: summe.werteJe100g,
    spuren: [],
    freierZuckerJe100g: summe.freierZuckerJe100g,
    rezept: { portionen: r.portionen, bestandteile, angepasst: false },
    erstelltAm,
  };
}

/** Portionen oder Zutaten eines Rezept-Eintrags ändern. Das Rezept selbst bleibt, wie es ist. */
export function rezeptEintragAendern(eintrag: TagebuchEintrag, aenderung: { menge: number; mahlzeit: Mahlzeit; bestandteile?: readonly Bestandteil[] | undefined }): TagebuchEintrag {
  const stand = eintrag.rezept;
  if (!stand) throw new StarkFehler('UNGUELTIG', 'Der Eintrag stimmt nicht.');
  const faktor = aenderung.menge / eintrag.menge;
  const bestandteile = aenderung.bestandteile ? [...aenderung.bestandteile] : stand.bestandteile.map((b) => skaliert(b, faktor));
  const summe = aggregat(bestandteile);
  return {
    ...eintrag,
    menge: aenderung.menge,
    mahlzeit: aenderung.mahlzeit,
    gramm: summe.gramm,
    werteJe100g: summe.werteJe100g,
    freierZuckerJe100g: summe.freierZuckerJe100g,
    rezept: { ...stand, bestandteile, angepasst: stand.angepasst || aenderung.bestandteile !== undefined },
  };
}

/** Rechnet eine geänderte Menge bei einer festgehaltenen Zutat neu. */
export function bestandteilMenge(b: Bestandteil, roh: Record<string, unknown>): Bestandteil {
  const angabe = mengenAngabePruefen(roh);
  return { ...b, ...angabe, gramm: grammFuer(angabe, b.umrechnung) };
}

/** Ändert Menge oder Mahlzeit. Die festgehaltenen Nährwerte bleiben. */
export function eintragAendern(eintrag: TagebuchEintrag, roh: unknown): TagebuchEintrag {
  if (typeof roh !== 'object' || roh === null) throw new StarkFehler('UNGUELTIG', 'Die Änderung stimmt nicht.');
  const r = roh as Record<string, unknown>;
  const angabe = mengenAngabePruefen(r);
  const umrechnung = r.umrechnung === undefined ? eintrag.umrechnung : umrechnungPruefen(r.umrechnung);
  return { ...eintrag, ...angabe, mahlzeit: mahlzeitPruefen(r.mahlzeit), umrechnung, gramm: grammFuer(angabe, umrechnung) };
}

/** „1 Stück (L) ≈ 60 g“, „2 EL ≈ 20 g“, „150 g“, „1,5 Portionen“ */
export function mengenText(e: { menge: number; einheit: EintragEinheit; groesse: Groesse | null; gramm: number }): string {
  if (e.einheit === 'Portion') return `${zahlText(e.menge, 2)} ${e.menge === 1 ? 'Portion' : 'Portionen'}`;
  if (e.einheit === 'Teller') return `${zahlText(e.menge, 2)} Teller`;
  const einheit = e.einheit === 'Stück' && e.groesse ? `Stück (${e.groesse})` : e.einheit;
  const grund = `${zahlText(e.menge, 2)} ${einheit}`;
  return istUngefaehr(e.einheit) ? `${grund} ≈ ${zahlText(e.gramm, e.gramm < 10 ? 1 : 0)} g` : grund;
}

export const eintragWert = (e: Pick<TagebuchEintrag, 'gramm' | 'werteJe100g'>, code: string): number | null => {
  const je100 = e.werteJe100g[code];
  return je100 === undefined ? null : (je100 * e.gramm) / 100;
};

export interface SummenWert {
  menge: number;
  /** Namen der Einträge, bei denen dieser Wert unbekannt ist. Ein fehlender Wert ist nicht null. */
  fehltBei: readonly string[];
}

export interface Tagessumme {
  anzahl: number;
  werte: Readonly<Record<string, SummenWert>>;
  freierZuckerG: SummenWert;
  /** In Milligramm. */
  epaDhaMg: SummenWert;
}

export const EPA_DHA_CODE = 'EPA_DHA';
export const FREIER_ZUCKER_CODE = 'FREIER_ZUCKER';

/** Was sich zusammenzählen lässt: ein Eintrag oder die Zutat eines Rezepts. */
export type SummenPosten = Pick<Bestandteil, 'name' | 'gramm' | 'werteJe100g' | 'freierZuckerJe100g'> & { rezept?: Pick<RezeptStand, 'bestandteile'> };

export function tagessumme(eintraege: readonly SummenPosten[]): Tagessumme {
  const werte: Record<string, { menge: number; fehltBei: string[] }> = {};
  for (const n of NAEHRSTOFFE) werte[n.code] = { menge: 0, fehltBei: [] };
  const zucker = { menge: 0, fehltBei: [] as string[] };
  const epaDha = { menge: 0, fehltBei: [] as string[] };
  // Bei Rezepten zählen die einzelnen Zutaten: So bleibt sichtbar, bei welcher Zutat eine Angabe fehlt.
  const posten = eintraege.flatMap((e): readonly SummenPosten[] => e.rezept?.bestandteile ?? [e]);
  for (const e of posten) {
    for (const n of NAEHRSTOFFE) {
      const wert = eintragWert(e, n.code);
      if (wert === null) werte[n.code]!.fehltBei.push(e.name);
      else werte[n.code]!.menge += wert;
    }
    if (e.freierZuckerJe100g === null) zucker.fehltBei.push(e.name);
    else zucker.menge += (e.freierZuckerJe100g * e.gramm) / 100;
    // EPA und DHA: Fehlt nur eins von beiden, zählt das andere. Fehlen beide, ist es unbekannt.
    const epa = eintragWert(e, 'F20:5CN3');
    const dha = eintragWert(e, 'F22:6CN3');
    if (epa === null && dha === null) epaDha.fehltBei.push(e.name);
    else epaDha.menge += ((epa ?? 0) + (dha ?? 0)) * 1000;
  }
  return { anzahl: eintraege.length, werte, freierZuckerG: zucker, epaDhaMg: epaDha };
}

/**
 * Wie weit ein Nährstoff heute ist.
 * unter: noch unter dem Minimum. minimum: Minimum geschafft. optimum: im Optimum. darueber: über dem Optimum, aber nicht über einer Grenze.
 * ueber: über dem Höchstwert. luft: nur eine Obergrenze, die noch nicht erreicht ist. hinweis: wird gezeigt, ist aber nie eine Lücke. ohne: kein Ziel.
 */
export type Stufe = 'ohne' | 'unter' | 'minimum' | 'optimum' | 'darueber' | 'ueber' | 'luft' | 'hinweis';

/** Das, was eine Stufe braucht. Passt zu einem NaehrstoffZiel und zu den Zielen, die der BLS nicht als Nährstoff führt. */
export interface StufenZiel {
  von?: number | undefined;
  optimum?: { von: number; bis: number } | undefined;
  hoechst?: number | undefined;
  keineLuecke?: true | undefined;
}

export function stufeVon(menge: number, ziel: StufenZiel | null | undefined): Stufe {
  if (!ziel) return 'ohne';
  if (ziel.hoechst !== undefined && menge > ziel.hoechst) return 'ueber';
  if (ziel.von === undefined) return ziel.hoechst !== undefined ? 'luft' : 'ohne';
  if (menge < ziel.von) return ziel.keineLuecke ? 'hinweis' : 'unter';
  if (ziel.optimum) {
    if (menge < ziel.optimum.von) return 'minimum';
    return menge <= ziel.optimum.bis ? 'optimum' : 'darueber';
  }
  return 'minimum';
}

export const EPA_DHA_ZIEL = { von: EPA_DHA_MINIMUM_MG, optimum: EPA_DHA_OPTIMUM_MG } as const;

const WOCHEN_GRUPPEN: readonly GruppenId[] = ['vitamine', 'mineralstoffe'];

/**
 * Zählt dieser Nährstoff im Schnitt der Woche statt am Tag (Lukas, 04.11.2026, siehe woche.ts)? Das gilt für Vitamine und
 * Mineralstoffe mit Mindestwert sowie für EPA und DHA. Reine Obergrenzen wie Salz und Natrium bleiben beim Tag.
 */
export function zaehltWoechentlich(code: string, ziel: { von?: number | undefined } | undefined): boolean {
  if (code === EPA_DHA_CODE) return true;
  const n = naehrstoff(code);
  return n !== undefined && WOCHEN_GRUPPEN.includes(n.gruppe) && ziel?.von !== undefined;
}

export const istGeschafft = (stufe: Stufe) => stufe === 'minimum' || stufe === 'optimum' || stufe === 'darueber';

/** Für den Balken: Wie viel vom Bezugswert ist erreicht, höchstens 1? */
export function balkenAnteil(menge: number, ziel: StufenZiel | null | undefined): number {
  const bezug = ziel?.von ?? ziel?.hoechst;
  if (!bezug || bezug <= 0) return 0;
  return Math.min(1, menge / bezug);
}

export interface Luecke {
  code: string;
  name: string;
  /** Wie viel noch fehlt, in der Einheit des Nährstoffs. */
  fehlt: number;
  /** „38 g Eiweiß“ */
  text: string;
  /** Zum Minimum oder zum Optimum? */
  stufe: 'minimum' | 'optimum';
  /** Wie viel davon schon erreicht ist, 0 bis 1. */
  erreicht: number;
  /** Einträge ohne Angabe zu diesem Nährstoff: Die Lücke ist dann vielleicht gar keine. */
  fehltBei: readonly string[];
  gruppe: GruppenId;
  /** Gewicht in der Reihenfolge. */
  gewicht: number;
}

/** Was vorn stehen soll, wenn gleich viel fehlt. Die Fettsäure-Einzelheiten sollen die Liste nicht füllen. */
const GEWICHT: Readonly<Record<string, number>> = {
  PROT625: 1.25,
  FIBT: 1.2,
  FAT: 0.9,
  FAMS: 0.6,
  FAPU: 0.6,
  FAPUN3: 0.75,
  'F18:2CN6': 0.6,
  'F18:3CN3': 0.6,
};

/** Keine eigene Lücke: Die Kalorien stehen vorn für sich, Kohlenhydrate sind nur der Rest (Bauauftrag 4.2). */
export const NICHT_ALS_LUECKE: ReadonlySet<string> = new Set(['ENERCC', 'CHO']);
const KCAL_SPIELRAUM = 50;

/** Im Satz klingt der kurze Name besser als die Fachbezeichnung aus der Liste. */
export const KURZNAMEN: Readonly<Record<string, string>> = { FIBT: 'Ballaststoffe', FAMS: 'einfach ungesättigte Fettsäuren', FAPU: 'mehrfach ungesättigte Fettsäuren', FAPUN3: 'Omega-3', 'F18:2CN6': 'Linolsäure', 'F18:3CN3': 'Alpha-Linolensäure' };

export function lueckeAus(code: string, n: Pick<Naehrstoff, 'name' | 'gruppe' | 'einheit' | 'zeigeInMg'>, s: SummenWert, ziel: { von: number; optimum?: { von: number } | undefined }): Luecke | null {
  const bezug = s.menge < ziel.von ? ziel.von : ziel.optimum?.von;
  if (bezug === undefined || s.menge >= bezug) return null;
  const fehlt = bezug - s.menge;
  const name = KURZNAMEN[code] ?? n.name;
  return {
    code,
    name,
    fehlt,
    text: `${mengeText(fehlt, n)} ${name}`,
    stufe: s.menge < ziel.von ? 'minimum' : 'optimum',
    erreicht: bezug > 0 ? s.menge / bezug : 1,
    fehltBei: s.fehltBei,
    gruppe: n.gruppe,
    gewicht: GEWICHT[code] ?? 1,
  };
}

export const EPA_DHA_NAEHRSTOFF = { name: 'EPA und DHA', gruppe: 'fettsaeuren', einheit: 'mg' } as const;

/**
 * Die Lücken des Tages: zuerst, was zum Minimum fehlt, die größten vorn, danach, was zum Optimum fehlt.
 * Vitamine, Mineralstoffe sowie EPA und DHA zählen im Schnitt der Woche und stehen deshalb nicht hier (woche.ts).
 * Wasser ist nie eine Lücke, Ausgeblendetes auch nicht.
 */
export function tagesLuecken(summe: Tagessumme, bedarf: Bedarf, ausgeblendet: readonly string[] = []): Luecke[] {
  const liste: Luecke[] = [];
  for (const n of NAEHRSTOFFE) {
    const ziel = bedarf.ziele[n.code];
    if (!ziel || ziel.von === undefined || ziel.keineLuecke || NICHT_ALS_LUECKE.has(n.code) || ausgeblendet.includes(n.code) || zaehltWoechentlich(n.code, ziel)) continue;
    const luecke = lueckeAus(n.code, n, summe.werte[n.code]!, { von: ziel.von, optimum: ziel.optimum });
    if (luecke) liste.push(luecke);
  }
  const rang = (l: Luecke) => (1 - l.erreicht) * l.gewicht;
  return liste.sort((a, b) => {
    if (a.stufe !== b.stufe) return a.stufe === 'minimum' ? -1 : 1;
    return rang(b) - rang(a);
  });
}

/** Wie viel Energie heute noch frei ist. */
export const kcalFrei = (summe: Tagessumme, bedarf: Bedarf) => bedarf.kcal - summe.werte.ENERCC!.menge;

/** „Noch etwa 850 kcal und 38 g Eiweiß, dazu 13 g Ballaststoffe und 20 g Fett.“ */
export const aufzaehlung = (t: readonly string[]) => (t.length <= 1 ? (t[0] ?? '') : `${t.slice(0, -1).join(', ')} und ${t.at(-1)}`);

export function lueckenSatz(summe: Tagessumme, bedarf: Bedarf, luecken: readonly Luecke[], anzahl = 4): string {
  const frei = kcalFrei(summe, bedarf);
  const offen = frei >= KCAL_SPIELRAUM ? `${zahlText(Math.round(frei / 10) * 10)} kcal` : null;
  const minimum = luecken.filter((l) => l.stufe === 'minimum');
  // Eiweiß steht vorn, wenn es fehlt: Danach richtet sich das Essen am ehesten.
  const reihe = (minimum.length > 0 ? minimum : luecken).slice().sort((a, b) => Number(b.code === 'PROT625') - Number(a.code === 'PROT625'));
  const liste = reihe.slice(0, anzahl).map((l) => l.text);

  if (minimum.length === 0) {
    if (liste.length === 0) return offen ? `Alles geschafft. Es sind noch etwa ${offen} frei.` : 'Alles geschafft, heute fehlt dir nichts.';
    const anfang = offen ? `Alle Mindestwerte sind geschafft, und es sind noch etwa ${offen} frei.` : 'Alle Mindestwerte sind geschafft.';
    return `${anfang} Zum Optimum fehlen noch ${aufzaehlung(liste)}.`;
  }
  if (offen && liste.length > 1 && liste[0]) return `Noch etwa ${offen} und ${liste[0]}, dazu ${aufzaehlung(liste.slice(1))}.`;
  if (offen) return `Noch etwa ${offen} und ${liste[0] ?? ''}.`;
  return `Es fehlen noch ${aufzaehlung(liste)}.`;
}

/** Ein freundlicher Satz neben dem Datum. Nie belehrend. */
export function tagesMotto(summe: Tagessumme, bedarf: Bedarf, luecken: readonly Luecke[]): string {
  if (summe.anzahl === 0) return 'Ein neuer Tag, alles ist offen.';
  const ziele = Object.values(bedarf.ziele).filter((z) => z.von !== undefined && !z.keineLuecke && !zaehltWoechentlich(z.code, z)).length;
  const offen = luecken.filter((l) => l.stufe === 'minimum').length;
  const eiweiss = luecken.find((l) => l.code === 'PROT625' && l.stufe === 'minimum');
  if (offen === 0) return 'Stark! Alle Tagesziele sind geschafft.';
  if (eiweiss === undefined) return 'Läuft gut. Dein Eiweiß-Minimum ist schon geschafft.';
  if (offen < ziele / 2) return 'Läuft gut heute. Mehr als die Hälfte ist geschafft.';
  return 'Guter Anfang. Der Rest kommt über den Tag.';
}

/** „bei 2 Lebensmitteln keine Angabe“ */
export function fehltText(fehltBei: readonly string[]): string | null {
  if (fehltBei.length === 0) return null;
  return fehltBei.length === 1 ? 'bei 1 Eintrag keine Angabe' : `bei ${fehltBei.length} Einträgen keine Angabe`;
}

export const naehrstoffOderExtra = (code: string) => (code === EPA_DHA_CODE ? EPA_DHA_NAEHRSTOFF : naehrstoff(code));
