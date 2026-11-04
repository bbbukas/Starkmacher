/**
 * Das Tagebuch (Bauauftrag Abschnitt 8): Einträge, Tagessumme, Stufen und Lücken. Reine Rechnungen ohne Abhängigkeit vom Mac.
 *
 * Ein Eintrag speichert die Nährwerte so, wie sie beim Eintragen waren (Bauauftrag Abschnitt 2). Ändert sich später das
 * Lebensmittel, bleiben vergangene Tage, wie sie sind.
 */
import type { Bedarf } from './bedarf';
import { inGramm, istUngefaehr, umrechnungPruefen, type Groesse, type MengenEinheit, type Umrechnung } from './einheiten';
import { StarkFehler } from './fehler';
import { mengeText, zahlText } from './format';
import { werteJe100g, type Lebensmittel, type Werte } from './lebensmittel';
import { NAEHRSTOFFE, naehrstoff, type GruppenId, type Naehrstoff } from './naehrstoffe';
import { datumErlaubt } from './profil';
import { EPA_DHA_MINIMUM_MG, EPA_DHA_OPTIMUM_MG } from './referenzwerte';

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

export interface TagebuchEintrag extends MengenAngabe {
  id: string;
  datum: string;
  mahlzeit: Mahlzeit;
  art: 'lebensmittel';
  lebensmittelId: string;
  name: string;
  marke: string | null;
  gramm: number;
  /** Stand beim Eintragen, damit sich auch die Menge später noch umrechnen lässt. */
  umrechnung: Umrechnung;
  werteJe100g: Werte;
  spuren: readonly string[];
  freierZuckerJe100g: number | null;
  erstelltAm: string;
}

export interface EintragEingabe extends MengenAngabe {
  datum: string;
  mahlzeit: Mahlzeit;
  lebensmittelId: string;
}

export interface EintragAenderung extends MengenAngabe {
  mahlzeit: Mahlzeit;
  /** Nur nötig, wenn für diese Einheit gerade ein Gewicht nachgetragen wurde. */
  umrechnung?: Umrechnung;
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
  return { ...mengenAngabePruefen(e), datum: e.datum, mahlzeit: mahlzeitPruefen(e.mahlzeit), lebensmittelId: e.lebensmittelId };
}

function grammFuer(angabe: MengenAngabe, umrechnung: Umrechnung): number {
  const gramm = inGramm(angabe.menge, angabe.einheit, umrechnung, angabe.groesse ?? 'M');
  if (gramm === null) throw new StarkFehler('UNGUELTIG', `Für „${angabe.einheit}“ ist noch kein Gewicht hinterlegt.`);
  if (gramm > 100_000) throw new StarkFehler('UNGUELTIG', 'Diese Menge ist zu groß.');
  return gramm;
}

/** Hält den Stand des Lebensmittels fest. */
export function eintragAnlegen(lm: Lebensmittel, eingabe: EintragEingabe, id: string, erstelltAm: string): TagebuchEintrag {
  const faktor = lm.basis === 'ml' ? 1 / lm.umrechnung.dichte : 1;
  return {
    id,
    datum: eingabe.datum,
    mahlzeit: eingabe.mahlzeit,
    art: 'lebensmittel',
    lebensmittelId: lm.id,
    name: lm.name,
    marke: lm.marke,
    menge: eingabe.menge,
    einheit: eingabe.einheit,
    groesse: eingabe.groesse,
    gramm: grammFuer(eingabe, lm.umrechnung),
    umrechnung: umrechnungPruefen(lm.umrechnung),
    werteJe100g: werteJe100g(lm),
    spuren: lm.spuren,
    freierZuckerJe100g: lm.freierZuckerG === null ? null : lm.freierZuckerG * faktor,
    erstelltAm,
  };
}

/** Ändert Menge oder Mahlzeit. Die festgehaltenen Nährwerte bleiben. */
export function eintragAendern(eintrag: TagebuchEintrag, roh: unknown): TagebuchEintrag {
  if (typeof roh !== 'object' || roh === null) throw new StarkFehler('UNGUELTIG', 'Die Änderung stimmt nicht.');
  const r = roh as Record<string, unknown>;
  const angabe = mengenAngabePruefen(r);
  const umrechnung = r.umrechnung === undefined ? eintrag.umrechnung : umrechnungPruefen(r.umrechnung);
  return { ...eintrag, ...angabe, mahlzeit: mahlzeitPruefen(r.mahlzeit), umrechnung, gramm: grammFuer(angabe, umrechnung) };
}

/** „1 Stück (L) ≈ 60 g“, „2 EL ≈ 20 g“, „150 g“ */
export function mengenText(e: MengenAngabe & { gramm: number }): string {
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

export function tagessumme(eintraege: readonly TagebuchEintrag[]): Tagessumme {
  const werte: Record<string, { menge: number; fehltBei: string[] }> = {};
  for (const n of NAEHRSTOFFE) werte[n.code] = { menge: 0, fehltBei: [] };
  const zucker = { menge: 0, fehltBei: [] as string[] };
  const epaDha = { menge: 0, fehltBei: [] as string[] };
  for (const e of eintraege) {
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
const NICHT_ALS_LUECKE = new Set(['ENERCC', 'CHO']);
const KCAL_SPIELRAUM = 50;

/** Im Satz klingt der kurze Name besser als die Fachbezeichnung aus der Liste. */
const KURZNAMEN: Readonly<Record<string, string>> = { FIBT: 'Ballaststoffe', FAMS: 'einfach ungesättigte Fettsäuren', FAPU: 'mehrfach ungesättigte Fettsäuren', FAPUN3: 'Omega-3', 'F18:2CN6': 'Linolsäure', 'F18:3CN3': 'Alpha-Linolensäure' };

function lueckeAus(code: string, n: Pick<Naehrstoff, 'name' | 'gruppe' | 'einheit' | 'zeigeInMg'>, s: SummenWert, ziel: { von: number; optimum?: { von: number } | undefined }): Luecke | null {
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

const EPA_DHA_NAEHRSTOFF = { name: 'EPA und DHA', gruppe: 'fettsaeuren', einheit: 'mg' } as const;

/**
 * Die Lücken des Tages: zuerst, was zum Minimum fehlt, die größten vorn, danach, was zum Optimum fehlt.
 * Vitamin D, Fluorid, Chlorid und Wasser sind nie eine Lücke. Ausgeblendetes auch nicht.
 */
export function tagesLuecken(summe: Tagessumme, bedarf: Bedarf, ausgeblendet: readonly string[] = []): Luecke[] {
  const liste: Luecke[] = [];
  for (const n of NAEHRSTOFFE) {
    const ziel = bedarf.ziele[n.code];
    if (!ziel || ziel.von === undefined || ziel.keineLuecke || NICHT_ALS_LUECKE.has(n.code) || ausgeblendet.includes(n.code)) continue;
    const luecke = lueckeAus(n.code, n, summe.werte[n.code]!, { von: ziel.von, optimum: ziel.optimum });
    if (luecke) liste.push(luecke);
  }
  const fettOffen = !ausgeblendet.includes('F20:5CN3') && !ausgeblendet.includes('F22:6CN3');
  if (fettOffen) {
    const luecke = lueckeAus(EPA_DHA_CODE, EPA_DHA_NAEHRSTOFF, summe.epaDhaMg, EPA_DHA_ZIEL);
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

/** „Noch etwa 850 kcal und 38 g Eiweiß, dazu 13 g Ballaststoffe, 460 mg Calcium und 88 µg Jod.“ */
export function lueckenSatz(summe: Tagessumme, bedarf: Bedarf, luecken: readonly Luecke[], anzahl = 4): string {
  const frei = kcalFrei(summe, bedarf);
  const offen = frei >= KCAL_SPIELRAUM ? `${zahlText(Math.round(frei / 10) * 10)} kcal` : null;
  const minimum = luecken.filter((l) => l.stufe === 'minimum');
  // Eiweiß steht vorn, wenn es fehlt: Danach richtet sich das Essen am ehesten.
  const reihe = (minimum.length > 0 ? minimum : luecken).slice().sort((a, b) => Number(b.code === 'PROT625') - Number(a.code === 'PROT625'));
  const liste = reihe.slice(0, anzahl).map((l) => l.text);
  const aufzaehlung = (t: readonly string[]) => (t.length <= 1 ? (t[0] ?? '') : `${t.slice(0, -1).join(', ')} und ${t.at(-1)}`);

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
  const ziele = Object.values(bedarf.ziele).filter((z) => z.von !== undefined && !z.keineLuecke).length;
  const offen = luecken.filter((l) => l.stufe === 'minimum').length;
  const eiweiss = luecken.find((l) => l.code === 'PROT625' && l.stufe === 'minimum');
  if (offen === 0) return 'Stark! Alle Mindestwerte sind geschafft.';
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
