/**
 * Der Wochenstand (Lukas, 04.11.2026): Vitamine und Mineralstoffe müssen nicht jeden Tag erreicht werden.
 * DGE 2018, Frage 4: „Es reicht aus, die Vorgaben im Durchschnitt einer Woche zu erreichen.“ Eine Ausnahme nennt die DGE nicht.
 * EPA und DHA zählen genauso: Der Wert entspricht ein bis zwei Portionen fettem Fisch pro Woche, nicht einer Portion je Tag.
 *
 * Eine Woche läuft von Montag bis Sonntag. Das Wochenziel ist der Tageswert mal die Tage, die zählen: Tage mit Einträgen
 * und Tage, die noch kommen. Ein vergangener Tag ohne Einträge zählt nicht, er ist vermutlich nur nicht eingetragen.
 * Das Programm rechnet so auch in der ersten Woche richtig, wenn sie erst am Donnerstag beginnt.
 */
import type { Bedarf } from './bedarf';
import { mengeText } from './format';
import { NAEHRSTOFFE, type Naehrstoff } from './naehrstoffe';
import { datumVon } from './profil';
import {
  aufzaehlung,
  EPA_DHA_CODE,
  EPA_DHA_NAEHRSTOFF,
  EPA_DHA_ZIEL,
  lueckeAus,
  tagessumme,
  zaehltWoechentlich,
  type Luecke,
  type Stufe,
  type StufenZiel,
  type SummenWert,
  type Tagessumme,
  type TagebuchEintrag,
} from './tagebuch';

/** Montag bis Sonntag der Woche, in der dieser Tag liegt. */
export function wochenTage(datum: string): string[] {
  const d = new Date(`${datum}T12:00:00`);
  const seitMontag = (d.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => {
    const tag = new Date(d);
    tag.setDate(d.getDate() - seitMontag + i);
    return datumVon(tag);
  });
}

export interface WochenStand {
  /** Der Tag, der gerade gezeigt wird. */
  datum: string;
  heute: string;
  /** Tage dieser Woche mit Einträgen. */
  eingetragen: number;
  /** Tage ab heute, an denen noch nichts steht. */
  offen: number;
  /** Tage ohne Eintrag, die vorbei sind. Sie zählen nicht. */
  ausgelassen: number;
  /** So viele Tage rechnet das Wochenziel, mindestens einer. */
  tage: number;
  /** Heute und die Tage bis Sonntag. 0: Die Woche ist vorbei. */
  restTage: number;
  /** Die ganze Woche. */
  summe: Tagessumme;
  /** Der gezeigte Tag. */
  tag: Tagessumme;
  /** Die Woche ohne den gezeigten Tag. */
  ohneTag: Tagessumme;
  /** Auf so viele Tage verteilt sich, was dem gezeigten Tag noch bleibt: er selbst und die offenen Tage danach. */
  verteilung: number;
}

export function wochenstand(eintraege: readonly TagebuchEintrag[], datum: string, heute: string): WochenStand {
  const tage = wochenTage(datum);
  const inWoche = eintraege.filter((e) => tage.includes(e.datum));
  const mitEintrag = new Set(inWoche.map((e) => e.datum));
  const istOffen = (t: string) => !mitEintrag.has(t) && t >= heute;
  const eingetragen = mitEintrag.size;
  const offen = tage.filter(istOffen).length;
  return {
    datum,
    heute,
    eingetragen,
    offen,
    ausgelassen: 7 - eingetragen - offen,
    tage: Math.max(1, eingetragen + offen),
    restTage: tage.filter((t) => t >= heute).length,
    summe: tagessumme(inWoche),
    tag: tagessumme(inWoche.filter((e) => e.datum === datum)),
    ohneTag: tagessumme(inWoche.filter((e) => e.datum !== datum)),
    verteilung: 1 + tage.filter((t) => t !== datum && istOffen(t)).length,
  };
}

const wertAus = (s: Tagessumme, code: string): SummenWert => (code === EPA_DHA_CODE ? s.epaDhaMg : s.werte[code]!);

/** Die Woche in der Einheit des Tagesziels: Eine Obergrenze gilt für den Schnitt der eingetragenen Tage. */
export function wochenZiel(ziel: StufenZiel, woche: WochenStand): StufenZiel {
  const mal = (wert: number) => wert * woche.tage;
  return {
    von: ziel.von === undefined ? undefined : mal(ziel.von),
    optimum: ziel.optimum ? { von: mal(ziel.optimum.von), bis: mal(ziel.optimum.bis) } : undefined,
    hoechst: ziel.hoechst === undefined ? undefined : ziel.hoechst * Math.max(1, woche.eingetragen),
    keineLuecke: ziel.keineLuecke,
  };
}

export interface WochenZeile {
  /** Die ganze Woche. */
  summe: SummenWert;
  /** Der gezeigte Tag. */
  tag: SummenWert;
  ziel: StufenZiel;
  /** So viel fehlt noch zum Wochenziel. */
  rest: number;
}

export function wochenZeile(code: string, ziel: StufenZiel, woche: WochenStand): WochenZeile {
  const summe = wertAus(woche.summe, code);
  const hochgerechnet = wochenZiel(ziel, woche);
  return { summe, tag: wertAus(woche.tag, code), ziel: hochgerechnet, rest: Math.max(0, (hochgerechnet.von ?? 0) - summe.menge) };
}

const bisWann = (woche: Pick<WochenStand, 'restTage'>) => (woche.restTage === 1 ? 'bis heute Abend' : 'bis Sonntag');

/** Der kleine Satz unter einer Zeile, zum Beispiel „noch 5.400 mg bis Sonntag, etwa 900 mg am Tag · heute 180 mg“. */
export function wochenLage(stufe: Stufe, z: WochenZeile, einheit: Pick<Naehrstoff, 'einheit' | 'zeigeInMg'>, woche: WochenStand, hinweis?: string): string {
  const text = (wert: number) => mengeText(wert, einheit);
  const tag = `${woche.datum === woche.heute ? 'heute' : 'an diesem Tag'} ${text(z.tag.menge)}`;
  const lage = ((): string => {
    switch (stufe) {
      case 'unter':
        if (woche.restTage === 0) return `in dieser Woche fehlten ${text(z.rest)}`;
        return woche.restTage === 1 ? `noch ${text(z.rest)} bis heute Abend` : `noch ${text(z.rest)} bis Sonntag, etwa ${text(z.rest / woche.restTage)} am Tag`;
      case 'minimum':
        return z.ziel.optimum ? `✓ Wochenziel erreicht, noch ${text(z.ziel.optimum.von - z.summe.menge)} zum Optimum` : '✓ Wochenziel erreicht';
      case 'optimum':
        return '✓ im Optimum';
      case 'darueber':
        return '✓ über dem Optimum';
      case 'ueber':
        return 'diese Woche etwas mehr';
      case 'hinweis':
        return hinweis ?? '';
      default:
        return '';
    }
  })();
  return lage === '' ? tag : `${lage} · ${tag}`;
}

/** „Es reicht der Schnitt der Woche (DGE). 3 Tage eingetragen, noch 4 offen.“ */
export function wochenHinweis(woche: WochenStand): string {
  const tage = (n: number) => (n === 1 ? '1 Tag' : `${n} Tage`);
  const teile = [`${tage(woche.eingetragen)} eingetragen`];
  if (woche.offen > 0) teile.push(`noch ${woche.offen} offen`);
  if (woche.ausgelassen > 0) teile.push(`${woche.ausgelassen} ohne Eintrag ${woche.ausgelassen === 1 ? 'zählt' : 'zählen'} nicht`);
  return `Es reicht der Schnitt der Woche, Montag bis Sonntag (DGE). ${aufzaehlung(teile)}.`;
}

interface WochenWert {
  code: string;
  n: Pick<Naehrstoff, 'name' | 'gruppe' | 'einheit' | 'zeigeInMg'>;
  von: number;
}

/** Alles, was im Wochenschnitt erreicht werden soll. Vitamin D, Fluorid und Chlorid sind wie am Tag nie eine Lücke. */
function wochenWerte(bedarf: Bedarf, ausgeblendet: readonly string[]): WochenWert[] {
  const liste: WochenWert[] = [];
  for (const n of NAEHRSTOFFE) {
    const ziel = bedarf.ziele[n.code];
    if (!ziel || ziel.von === undefined || ziel.keineLuecke || !zaehltWoechentlich(n.code, ziel) || ausgeblendet.includes(n.code)) continue;
    liste.push({ code: n.code, n, von: ziel.von });
  }
  if (!ausgeblendet.includes('F20:5CN3') && !ausgeblendet.includes('F22:6CN3')) liste.push({ code: EPA_DHA_CODE, n: EPA_DHA_NAEHRSTOFF, von: EPA_DHA_ZIEL.von });
  return liste;
}

/** Die DGE warnt vor „überscharfem“ Rechnen. Erst wer mehr als 10 % über dem Üblichen bräuchte, gilt als knapp. */
const SPIELRAUM = 0.1;

export interface KnapperWert {
  code: string;
  /** So viel fehlt noch zum Wochenziel. */
  rest: number;
  /** „5.400 mg Calcium“ */
  text: string;
  /** Das Wievielfache des Tageswerts jetzt je Tag nötig wäre. */
  noetig: number;
  fehltBei: readonly string[];
}

/** Was im Wochenschnitt zu kurz kommt, das Knappste zuerst. Am Montag ist deshalb nie etwas knapp. */
export function knappeWochenwerte(woche: WochenStand, bedarf: Bedarf, ausgeblendet: readonly string[] = []): KnapperWert[] {
  const liste: KnapperWert[] = [];
  for (const { code, n, von } of wochenWerte(bedarf, ausgeblendet)) {
    const summe = wertAus(woche.summe, code);
    const rest = Math.max(0, von * woche.tage - summe.menge);
    const noetig = woche.restTage > 0 ? rest / woche.restTage / von : rest / (von * woche.tage);
    const grenze = woche.restTage > 0 ? 1 + SPIELRAUM : SPIELRAUM;
    if (noetig > grenze) liste.push({ code, rest, text: `${mengeText(rest, n)} ${n.name}`, noetig, fehltBei: summe.fehltBei });
  }
  return liste.sort((a, b) => b.noetig - a.noetig);
}

/** Ein kurzer Satz zur Woche. Er nennt nur, was wirklich knapp ist, und nie mehr als vier Werte. */
export function wochenSatz(woche: Pick<WochenStand, 'restTage'>, knappe: readonly Pick<KnapperWert, 'text'>[], anzahl = 4): string {
  const weitere = knappe.length - anzahl;
  const liste = aufzaehlung([...knappe.slice(0, anzahl).map((k) => k.text), ...(weitere > 0 ? [`${weitere} ${weitere === 1 ? 'weiterer Wert' : 'weitere Werte'}`] : [])]);
  if (woche.restTage === 0) return knappe.length === 0 ? 'Vitamine und Mineralstoffe haben in dieser Woche gereicht.' : `In dieser Woche fehlten ${liste}.`;
  return knappe.length === 0 ? 'Vitamine und Mineralstoffe liegen diese Woche im Plan.' : `Diese Woche etwas knapp: noch ${liste} ${bisWann(woche)}.`;
}

/** Wochenwerte zählen bei den Vorschlägen weniger als das, was heute wirklich gebraucht wird. */
const WOCHEN_GEWICHT = 0.6;
const KLEINSTE_LUECKE = 0.1;

/**
 * Was vom Wochenziel auf den gezeigten Tag entfällt, für die Vorschläge. Was bisher zu viel oder zu wenig war, verteilt
 * sich gleichmäßig auf die offenen Tage: An einem Tag ohne Vorlauf ist das der Tageswert. Wer vorn liegt, dem fehlt heute nichts.
 * Die DGE rät ausdrücklich zu einer möglichst gleichmäßigen Zufuhr statt zu wenigen hohen Dosen.
 */
export function wochenLueckenFuerTag(woche: WochenStand, bedarf: Bedarf, ausgeblendet: readonly string[] = []): Luecke[] {
  const liste: Luecke[] = [];
  for (const { code, n, von } of wochenWerte(bedarf, ausgeblendet)) {
    const anteil = Math.max(0, (von * woche.tage - wertAus(woche.ohneTag, code).menge) / woche.verteilung);
    const luecke = lueckeAus(code, n, wertAus(woche.tag, code), { von: anteil });
    if (luecke && luecke.fehlt >= von * KLEINSTE_LUECKE) liste.push({ ...luecke, gewicht: luecke.gewicht * WOCHEN_GEWICHT });
  }
  return liste;
}
