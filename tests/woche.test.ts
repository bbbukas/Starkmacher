/** Wochenstand: Vitamine, Mineralstoffe sowie EPA und DHA zählen im Schnitt der Woche. Alle Beispiele sind erfunden. */
import { describe, expect, it } from 'vitest';
import { bedarfBerechnen, type Bedarf } from '@shared/bedarf';
import { GRUNDWERTE } from '@shared/einheiten';
import type { Lebensmittel, Werte } from '@shared/lebensmittel';
import { eintragAnlegen, stufeVon, tagesLuecken, tagesMotto, tagessumme, zaehltWoechentlich, type TagebuchEintrag } from '@shared/tagebuch';
import { knappeWochenwerte, wochenHinweis, wochenLage, wochenLueckenFuerTag, wochenSatz, wochenstand, wochenTage, wochenZeile, wochenZiel } from '@shared/woche';
import { grenzenAus, vorschlagen, type VorschlagKandidat } from '@shared/vorschlaege';

const bedarf: Bedarf = bedarfBerechnen({ geschlecht: 'maennlich', alter: 40, groesseCm: 180, gewichtKg: 70, aktivitaet: 'sitzend', sport: false, ziel: 'halten', tempo: 'sanft', kcalManuell: null, makrosManuell: null } as never);
const CA = bedarf.ziele.CA!.von!;

// Die Woche vom 2. bis 8. November 2026: Montag bis Sonntag.
const MO = '2026-11-02';
const DI = '2026-11-03';
const MI = '2026-11-04';
const DO = '2026-11-05';
const SO = '2026-11-08';

const lebensmittel = (werte: Werte, name = 'Testessen'): Lebensmittel => ({
  id: 'eigen:1',
  herkunft: 'eigen',
  name,
  marke: null,
  gruppe: null,
  basis: 'g',
  werte,
  spuren: [],
  schaetzung: null,
  freierZuckerG: 0,
  nurNatuerlicherZucker: true,
  packung: null,
  foto: null,
  hinweise: [],
  anmerkung: null,
  umrechnung: GRUNDWERTE,
  umrechnungAngepasst: false,
});

/** Ein Eintrag von 100 g, die Werte sind also genau die gegessene Menge. */
const am = (datum: string, werte: Werte, name?: string): TagebuchEintrag => eintragAnlegen(lebensmittel({ ENERCC: 100, ...werte }, name), { datum, mahlzeit: 'mittag', lebensmittelId: 'eigen:1', menge: 100, einheit: 'g', groesse: null }, `${datum}-${Math.random()}`, `${datum}T12:00:00.000Z`);

describe('Die Woche läuft von Montag bis Sonntag', () => {
  it('aus jedem Wochentag', () => {
    const woche = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
    for (const tag of woche) expect(wochenTage(tag), tag).toEqual(woche);
  });
  it('über den Monatswechsel und die Zeitumstellung', () => {
    expect(wochenTage('2026-10-01')[0]).toBe('2026-09-28');
    const umstellung = wochenTage('2026-10-25');
    expect(umstellung).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  });
});

describe('Welche Tage zählen', () => {
  it('die laufende Woche: eingetragene und kommende Tage, nicht die ausgelassenen', () => {
    // Heute ist Donnerstag. Montag und Mittwoch stehen im Tagebuch, Dienstag fehlt.
    const w = wochenstand([am(MO, {}), am(MI, {})], DO, DO);
    expect(w).toMatchObject({ eingetragen: 2, offen: 4, ausgelassen: 1, tage: 6, restTage: 4 });
  });
  it('die erste Woche, die erst am Donnerstag beginnt', () => {
    expect(wochenstand([], DO, DO)).toMatchObject({ eingetragen: 0, offen: 4, ausgelassen: 3, tage: 4 });
  });
  it('eine vergangene Woche zählt nur ihre eingetragenen Tage', () => {
    expect(wochenstand([am(MO, {}), am(DI, {})], MO, '2026-12-01')).toMatchObject({ eingetragen: 2, offen: 0, ausgelassen: 5, tage: 2, restTage: 0 });
  });
  it('eine ganz leere vergangene Woche rechnet mit einem Tag, damit nichts als geschafft gilt', () => {
    const w = wochenstand([], MO, '2026-12-01');
    expect(w.tage).toBe(1);
    expect(stufeVon(0, wochenZiel({ von: CA }, w))).toBe('unter');
  });
  it('Einträge anderer Wochen zählen nicht', () => {
    const w = wochenstand([am('2026-11-01', { CA: 500 }), am(MO, { CA: 100 }), am('2026-11-09', { CA: 500 })], MO, MO);
    expect(w.summe.werte.CA!.menge).toBe(100);
    expect(w.eingetragen).toBe(1);
  });
});

describe('Was im Schnitt der Woche zählt', () => {
  it('Vitamine und Mineralstoffe mit Mindestwert sowie EPA und DHA', () => {
    for (const code of ['VITC', 'VITB12', 'FOL', 'CA', 'MG', 'FE', 'ZN', 'ID', 'K', 'EPA_DHA']) expect(zaehltWoechentlich(code, bedarf.ziele[code]), code).toBe(true);
  });
  it('nicht: Makros, Ballaststoffe, Fettsäuren und reine Obergrenzen', () => {
    for (const code of ['ENERCC', 'PROT625', 'FAT', 'CHO', 'FIBT', 'FAPUN3', 'F18:3CN3', 'WATER', 'NACL', 'NA', 'RETOL', 'FOLAC']) expect(zaehltWoechentlich(code, bedarf.ziele[code]), code).toBe(false);
  });
  it('die Lücken des Tages nennen nur noch, was jeden Tag zählt', () => {
    const codes = tagesLuecken(tagessumme([]), bedarf).map((l) => l.code);
    expect(codes).toContain('PROT625');
    expect(codes).toContain('FIBT');
    for (const code of ['VITC', 'CA', 'ID', 'FE', 'EPA_DHA']) expect(codes, code).not.toContain(code);
  });
  it('der Satz neben dem Datum zählt die Wochenwerte nicht mit', () => {
    expect(tagesMotto(tagessumme([am(MO, {})]), bedarf, [])).toMatch(/Stark/);
  });
});

describe('Das Wochenziel', () => {
  it('ist der Tageswert mal die Tage, die zählen', () => {
    const w = wochenstand([], MO, MO);
    expect(wochenZiel({ von: 100, optimum: { von: 200, bis: 300 } }, w)).toMatchObject({ von: 700, optimum: { von: 1400, bis: 2100 } });
  });
  it('die Obergrenze gilt für den Schnitt der eingetragenen Tage, ein einzelner hoher Tag gleicht sich aus', () => {
    const hoch = am(MO, { ZN: 40 });
    const zink = bedarf.ziele.ZN!;
    expect(stufeVon(40, wochenZiel(zink, wochenstand([hoch], MO, MO)))).toBe('ueber');
    const dreiTage = [hoch, am(DI, { ZN: 10 }), am(MI, { ZN: 10 })];
    expect(stufeVon(60, wochenZiel(zink, wochenstand(dreiTage, MI, MI)))).not.toBe('ueber');
  });
  it('eine Woche mit genug Calcium ist geschafft, auch wenn es nur an wenigen Tagen kam', () => {
    const viel = { CA: (CA * 7) / 3 };
    const w = wochenstand([am(MO, viel), am(DI, viel), am(MI, viel)], MI, MI);
    const z = wochenZeile('CA', bedarf.ziele.CA!, w);
    expect(z.rest).toBe(0);
    expect(stufeVon(z.summe.menge, z.ziel)).toBe('minimum');
  });
  it('EPA und DHA: eine Portion fetter Fisch reicht für die Woche', () => {
    // 150 g Lachs mit rund 2 g EPA und DHA je 100 g, das sind 3.000 mg gegen ein Wochenziel von 1.750 mg.
    const w = wochenstand([am(MO, { 'F20:5CN3': 1.1, 'F22:6CN3': 1.9 })], MO, MO);
    const z = wochenZeile('EPA_DHA', { von: 250, optimum: { von: 250, bis: 1000 } }, w);
    expect(z.ziel.von).toBe(1750);
    expect(z.rest).toBe(0);
    expect(stufeVon(z.summe.menge, z.ziel)).toBe('optimum');
  });
});

describe('Die Sätze', () => {
  const calcium = { einheit: 'mg' as const };
  const lage = (eintraege: readonly TagebuchEintrag[], datum: string, heute: string) => {
    const w = wochenstand(eintraege, datum, heute);
    const z = wochenZeile('CA', { von: 1000 }, w);
    return wochenLage(stufeVon(z.summe.menge, z.ziel), z, calcium, w);
  };
  it('in der laufenden Woche: wie viel noch fehlt und wie viel das je Tag ist', () => {
    // Montag eingetragen, heute Dienstag: 7.000 mg in der Woche, 1.000 mg sind schon da, 6 Tage bleiben.
    expect(lage([am(MO, { CA: 1000 })], DI, DI)).toBe('noch 6.000 mg bis Sonntag, etwa 1.000 mg am Tag · heute 0 mg');
    // Dienstag ausgelassen, heute Mittwoch: Der Dienstag zählt nicht mit, das Wochenziel sinkt.
    expect(lage([am(MO, { CA: 1000 })], MI, MI)).toBe('noch 5.000 mg bis Sonntag, etwa 1.000 mg am Tag · heute 0 mg');
  });
  it('heute und an einem anderen Tag', () => {
    expect(lage([am(MO, { CA: 1000 })], MO, MI)).toContain('· an diesem Tag 1.000 mg');
  });
  it('am Sonntag', () => {
    expect(lage([], SO, SO)).toBe('noch 1.000 mg bis heute Abend · heute 0 mg');
  });
  it('wenn es geschafft ist und wenn die Woche vorbei ist', () => {
    expect(lage([am(MO, { CA: 7000 })], MO, MO)).toBe('✓ Wochenziel erreicht · heute 7.000 mg');
    expect(lage([am(MO, { CA: 400 })], MO, '2026-12-01')).toBe('in dieser Woche fehlten 600 mg · an diesem Tag 400 mg');
  });
  it('nennt Tage und was nicht zählt', () => {
    expect(wochenHinweis(wochenstand([am(MO, {}), am(MI, {})], DO, DO))).toBe('Es reicht der Schnitt der Woche, Montag bis Sonntag (DGE). 2 Tage eingetragen, noch 4 offen und 1 ohne Eintrag zählt nicht.');
    expect(wochenHinweis(wochenstand([am(MO, {})], MO, MO))).toContain('1 Tag eingetragen und noch 6 offen.');
  });
  it('die Woche in einem Satz', () => {
    expect(wochenSatz({ restTage: 5 }, [])).toBe('Vitamine und Mineralstoffe liegen diese Woche im Plan.');
    expect(wochenSatz({ restTage: 5 }, [{ text: '500 mg Calcium' }, { text: '60 µg Jod' }])).toBe('Diese Woche etwas knapp: noch 500 mg Calcium und 60 µg Jod bis Sonntag.');
    expect(wochenSatz({ restTage: 1 }, [{ text: '500 mg Calcium' }])).toBe('Diese Woche etwas knapp: noch 500 mg Calcium bis heute Abend.');
    expect(wochenSatz({ restTage: 0 }, [])).toBe('Vitamine und Mineralstoffe haben in dieser Woche gereicht.');
    expect(wochenSatz({ restTage: 0 }, [{ text: '500 mg Calcium' }])).toBe('In dieser Woche fehlten 500 mg Calcium.');
  });
  it('nennt höchstens vier Werte', () => {
    const viele = ['a', 'b', 'c', 'd', 'e', 'f'].map((text) => ({ text }));
    expect(wochenSatz({ restTage: 3 }, viele)).toBe('Diese Woche etwas knapp: noch a, b, c, d und 2 weitere Werte bis Sonntag.');
    expect(wochenSatz({ restTage: 3 }, viele.slice(0, 5))).toContain('und 1 weiterer Wert');
  });
});

/** Alle Wochenwerte in der Tagesmenge, damit ein Tag „normal“ gegessen ist. */
const normalerTag = (faktor = 1): Werte => {
  const werte: Record<string, number> = {};
  for (const z of Object.values(bedarf.ziele)) if (zaehltWoechentlich(z.code, z)) werte[z.code] = z.von! * faktor;
  return { ...werte, 'F20:5CN3': 0.125 * faktor, 'F22:6CN3': 0.125 * faktor };
};

describe('Was knapp ist', () => {
  it('am Montag ist nichts knapp, auch wenn noch nichts gegessen ist', () => {
    expect(knappeWochenwerte(wochenstand([], MO, MO), bedarf)).toEqual([]);
  });
  it('wer jeden Tag normal isst, liegt im Plan', () => {
    expect(knappeWochenwerte(wochenstand([am(MO, normalerTag()), am(DI, normalerTag())], MI, MI), bedarf)).toEqual([]);
  });
  it('kleine Abweichungen zählen nicht, die DGE warnt vor überscharfem Rechnen', () => {
    expect(knappeWochenwerte(wochenstand([am(MO, normalerTag(0.9)), am(DI, normalerTag(0.9))], MI, MI), bedarf)).toEqual([]);
  });
  it('was wirklich fehlt, steht vorn', () => {
    const werte = { ...normalerTag(), CA: 0, ID: bedarf.ziele.ID!.von! * 0.5 };
    const knapp = knappeWochenwerte(wochenstand([am(MO, werte), am(DI, werte), am(MI, werte)], DO, DO), bedarf);
    expect(knapp.map((k) => k.code)).toEqual(['CA', 'ID']);
    expect(knapp[0]?.rest).toBe(CA * 7);
    expect(knapp[0]?.text).toContain('Calcium');
  });
  it('Vitamin D, Fluorid, Chlorid und Ausgeblendetes sind nie knapp', () => {
    const codes = knappeWochenwerte(wochenstand([am(MO, {}), am(DI, {}), am(MI, {})], DO, DO), bedarf, ['ID', 'F20:5CN3']).map((k) => k.code);
    expect(codes).toContain('CA');
    for (const code of ['VITD', 'FD', 'CLD', 'ID', 'EPA_DHA']) expect(codes, code).not.toContain(code);
  });
  it('merkt sich, wo Angaben fehlen', () => {
    const knapp = knappeWochenwerte(wochenstand([am(MO, {}, 'Ohne Calcium'), am(DI, {}, 'Auch ohne')], MI, MI), bedarf);
    expect(knapp.find((k) => k.code === 'CA')?.fehltBei).toEqual(['Ohne Calcium', 'Auch ohne']);
  });
  it('in einer vergangenen Woche zählt, was am Ende fehlte', () => {
    const w = wochenstand([am(MO, { ...normalerTag(), CA: CA * 0.5 })], MO, '2026-12-01');
    expect(knappeWochenwerte(w, bedarf).map((k) => k.code)).toEqual(['CA']);
  });
});

describe('Was davon heute dran wäre', () => {
  const calcium = (eintraege: readonly TagebuchEintrag[], datum: string, heute: string) => wochenLueckenFuerTag(wochenstand(eintraege, datum, heute), bedarf).find((l) => l.code === 'CA');
  it('am Montag ist es der Tageswert', () => {
    expect(calcium([], MO, MO)?.fehlt).toBe(CA);
  });
  it('was heute schon gegessen ist, zählt ab', () => {
    expect(calcium([am(MO, { CA: CA * 0.25 })], MO, MO)?.fehlt).toBeCloseTo(CA * 0.75, 5);
  });
  it('ein Rückstand verteilt sich auf die restlichen Tage', () => {
    // Montag nichts: Am Dienstag sind es 7 Tageswerte auf 6 Tage.
    expect(calcium([am(MO, { CA: 0 })], DI, DI)?.fehlt).toBeCloseTo((CA * 7) / 6, 5);
  });
  it('wer vorn liegt, dem fehlt heute nichts', () => {
    expect(calcium([am(MO, { CA: CA * 7 })], DI, DI)).toBeUndefined();
  });
  it('sehr kleine Reste sind keine Lücke, sonst bringt jedes Krümelchen volle Punkte', () => {
    expect(calcium([am(MO, { CA: CA * 0.95 })], MO, MO)).toBeUndefined();
  });
  it('wiegt weniger als das, was heute wirklich gebraucht wird', () => {
    expect(calcium([], MO, MO)?.gewicht).toBeLessThan(1);
  });
  it('Vitamin D ist auch hier keine Lücke', () => {
    const codes = wochenLueckenFuerTag(wochenstand([], MO, MO), bedarf).map((l) => l.code);
    expect(codes).not.toContain('VITD');
    expect(codes).toContain('EPA_DHA');
  });
});

describe('Vorschläge mit der Woche', () => {
  const LACHS: VorschlagKandidat = { id: 'bls:T1', name: 'Lachs gegrillt', marke: null, herkunft: 'bls', code: 'T100172', werte: { ENERCC: 220, PROT625: 25, FAT: 13, 'F20:5CN3': 0.7, 'F22:6CN3': 1.2 }, freierZuckerG: 0 };
  const SKYR: VorschlagKandidat = { id: 'bls:M1', name: 'Skyr', marke: null, herkunft: 'bls', code: 'M710100', werte: { ENERCC: 60, CA: 120 }, freierZuckerG: 0 };
  const fuer = (eintraege: readonly TagebuchEintrag[], datum: string) => {
    const w = wochenstand(eintraege, datum, datum);
    return [...tagesLuecken(w.tag, bedarf), ...wochenLueckenFuerTag(w, bedarf)];
  };
  it('schlagen weiter vor, was für die Woche fehlt', () => {
    const v = vorschlagen([SKYR], fuer([], MO), grenzenAus(tagessumme([]), bedarf));
    expect(v[0]?.wirkung.map((x) => x.text).join()).toContain('Calcium');
  });
  it('nach einer Portion Fisch ist EPA und DHA für den Rest der Woche kein Grund mehr für Fisch', () => {
    const fisch = am(MO, { 'F20:5CN3': 1.1, 'F22:6CN3': 1.9 });
    expect(fuer([fisch], DI).map((l) => l.code)).not.toContain('EPA_DHA');
    expect(fuer([], DI).map((l) => l.code)).toContain('EPA_DHA');
    const nurFisch = vorschlagen([{ ...LACHS, werte: { ENERCC: 220, 'F20:5CN3': 0.7, 'F22:6CN3': 1.2 } }], fuer([fisch], DI), grenzenAus(tagessumme([]), bedarf));
    expect(nurFisch).toEqual([]);
  });
});
