/** Tagebuch: Stand festhalten, Tagessumme, Stufen, Lücken. Alle Beispiele sind erfunden. */
import { describe, expect, it } from 'vitest';
import { bedarfBerechnen, type Bedarf } from '@shared/bedarf';
import { GRUNDWERTE, standardUmrechnung } from '@shared/einheiten';
import type { Lebensmittel } from '@shared/lebensmittel';
import {
  balkenAnteil,
  eingabePruefenEintrag,
  eintragAendern,
  eintragAnlegen,
  fehltText,
  istGeschafft,
  kcalFrei,
  lueckenSatz,
  mahlzeitNachUhrzeit,
  mengenText,
  stufeVon,
  tagesLuecken,
  tagesMotto,
  tagessumme,
  type EintragEingabe,
  type TagebuchEintrag,
} from '@shared/tagebuch';

const bedarf: Bedarf = bedarfBerechnen({ geschlecht: 'maennlich', alter: 40, groesseCm: 180, gewichtKg: 70, aktivitaet: 'sitzend', sport: false, ziel: 'halten', tempo: 'sanft' });

const lm = (teil: Partial<Lebensmittel> = {}): Lebensmittel => ({
  id: 'eigen:1',
  herkunft: 'eigen',
  name: 'Testskyr',
  marke: null,
  gruppe: null,
  basis: 'g',
  werte: { ENERCC: 60, PROT625: 11, FAT: 0.2, CHO: 4, SUGAR: 4, CA: 100 },
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
  ...teil,
});

const eingabe = (teil: Partial<EintragEingabe> = {}): EintragEingabe => ({ datum: '2026-11-04', mahlzeit: 'mittag', lebensmittelId: 'eigen:1', menge: 200, einheit: 'g', groesse: null, ...teil });
const eintrag = (lebensmittel: Lebensmittel = lm(), teil: Partial<EintragEingabe> = {}, id = 'a'): TagebuchEintrag => eintragAnlegen(lebensmittel, eingabe(teil), id, '2026-11-04T12:00:00.000Z');

describe('Ein Eintrag hält den Stand fest', () => {
  it('rechnet die Menge in Gramm und bewahrt die Werte je 100 g', () => {
    const e = eintrag();
    expect(e).toMatchObject({ gramm: 200, name: 'Testskyr', mahlzeit: 'mittag', datum: '2026-11-04' });
    expect(e.werteJe100g.PROT625).toBe(11);
  });
  it('übernimmt auch die geschätzten und abgeleiteten Werte', () => {
    const e = eintrag(lm({ werte: { ENERCC: 100, NACL: 2.5 }, schaetzung: { code: 'M1', name: 'Quelle', werte: { CA: 80 } } }));
    expect(e.werteJe100g).toMatchObject({ CA: 80, ENERCC: 100 });
    expect(e.werteJe100g.ENERCJ).toBeCloseTo(418.4, 5);
    expect(e.werteJe100g.NA).toBeCloseTo(1000, 5);
  });
  it('ändert sich nicht, wenn sich später das Lebensmittel ändert', () => {
    const werte = { ENERCC: 60 };
    const e = eintrag(lm({ werte }));
    (werte as Record<string, number>).ENERCC = 999;
    expect(e.werteJe100g.ENERCC).toBe(60);
  });
  it('rechnet Eier nach Größe', () => {
    const ei = lm({ umrechnung: standardUmrechnung('Hühnerei roh', 'E111100') });
    expect(eintrag(ei, { menge: 2, einheit: 'Stück', groesse: 'L' }).gramm).toBe(120);
    expect(eintrag(ei, { menge: 1, einheit: 'Stück', groesse: null }).gramm).toBe(52); // ohne Angabe M
  });
  it('freier Zucker je 100 ml wird zu je 100 g', () => {
    const saft = lm({ basis: 'ml', freierZuckerG: 10, umrechnung: { ...GRUNDWERTE, dichte: 1.05 } });
    expect(eintrag(saft).freierZuckerJe100g).toBeCloseTo(10 / 1.05, 5);
  });
  it('ohne bekanntes Gewicht geht es nicht', () => {
    expect(() => eintrag(lm(), { menge: 1, einheit: 'Dose' })).toThrow(/Dose/);
  });
  it('ändern: Menge und Mahlzeit neu, Nährwerte bleiben', () => {
    const e = eintrag();
    const neu = eintragAendern(e, { menge: 50, einheit: 'g', groesse: null, mahlzeit: 'abend' });
    expect(neu).toMatchObject({ gramm: 50, mahlzeit: 'abend', id: 'a', erstelltAm: e.erstelltAm });
    expect(neu.werteJe100g).toEqual(e.werteJe100g);
  });
  it('ändern: rechnet mit der Umrechnung vom Eintragen, ein nachgetragenes Gewicht zählt', () => {
    const e = eintrag(lm({ umrechnung: { ...GRUNDWERTE, el: 20 } }));
    expect(eintragAendern(e, { menge: 2, einheit: 'EL', groesse: null, mahlzeit: 'mittag' }).gramm).toBe(40);
    expect(() => eintragAendern(e, { menge: 1, einheit: 'Dose', groesse: null, mahlzeit: 'mittag' })).toThrow();
    expect(eintragAendern(e, { menge: 1, einheit: 'Dose', groesse: null, mahlzeit: 'mittag', umrechnung: { ...GRUNDWERTE, dose: 240 } }).gramm).toBe(240);
  });
  it('prüft Eingaben', () => {
    expect(eingabePruefenEintrag(eingabe())).toMatchObject({ menge: 200 });
    expect(() => eingabePruefenEintrag(eingabe({ menge: 0 }))).toThrow(/Menge/);
    expect(() => eingabePruefenEintrag({ ...eingabe(), menge: 'viel' })).toThrow(/Menge/);
    expect(() => eingabePruefenEintrag({ ...eingabe(), einheit: 'Eimer' })).toThrow(/Einheit/);
    expect(() => eingabePruefenEintrag({ ...eingabe(), mahlzeit: 'Brunch' })).toThrow(/Mahlzeit/);
    expect(() => eingabePruefenEintrag({ ...eingabe(), datum: 'gestern' })).toThrow(/Datum/);
    expect(() => eingabePruefenEintrag(null)).toThrow();
  });
  it('Text zur Menge: genau in Gramm, sonst mit ≈', () => {
    expect(mengenText({ menge: 150, einheit: 'g', groesse: null, gramm: 150 })).toBe('150 g');
    expect(mengenText({ menge: 2, einheit: 'EL', groesse: null, gramm: 20 })).toBe('2 EL ≈ 20 g');
    expect(mengenText({ menge: 1, einheit: 'Stück', groesse: 'L', gramm: 60 })).toBe('1 Stück (L) ≈ 60 g');
  });
  it('Mahlzeit nach der Uhrzeit', () => {
    const um = (h: number, m = 0) => mahlzeitNachUhrzeit(new Date(2026, 10, 4, h, m));
    expect([um(7), um(10, 29), um(10, 30), um(14), um(15), um(21), um(22), um(2)]).toEqual(['fruehstueck', 'fruehstueck', 'mittag', 'mittag', 'abend', 'abend', 'nacht', 'nacht']);
  });
});

describe('Tagessumme', () => {
  it('zählt zusammen, was bekannt ist, und nennt, wo Angaben fehlen', () => {
    const a = eintrag(lm({ name: 'Mit Calcium', werte: { ENERCC: 100, CA: 100 } }), { menge: 100 }, 'a');
    const b = eintrag(lm({ name: 'Ohne Calcium', werte: { ENERCC: 200 } }), { menge: 50 }, 'b');
    const s = tagessumme([a, b]);
    expect(s.anzahl).toBe(2);
    expect(s.werte.ENERCC).toEqual({ menge: 200, fehltBei: [] });
    expect(s.werte.CA).toEqual({ menge: 100, fehltBei: ['Ohne Calcium'] });
    expect(s.werte.VITC).toEqual({ menge: 0, fehltBei: ['Mit Calcium', 'Ohne Calcium'] });
  });
  it('ein leerer Tag hat überall 0 und keine fehlenden Angaben', () => {
    const s = tagessumme([]);
    expect(s.anzahl).toBe(0);
    expect(s.werte.ENERCC).toEqual({ menge: 0, fehltBei: [] });
    expect(s.freierZuckerG.menge).toBe(0);
  });
  it('Spuren zählen als 0 und sind keine fehlende Angabe', () => {
    expect(tagessumme([eintrag(lm({ werte: { ZN: 0 }, spuren: ['ZN'] }))]).werte.ZN).toEqual({ menge: 0, fehltBei: [] });
  });
  it('freier Zucker zählt, unbekannter wird genannt', () => {
    const a = eintrag(lm({ name: 'Saft', freierZuckerG: 10 }), { menge: 200 }, 'a');
    const b = eintrag(lm({ name: 'Unbekannt', freierZuckerG: null }), { menge: 100 }, 'b');
    expect(tagessumme([a, b]).freierZuckerG).toEqual({ menge: 20, fehltBei: ['Unbekannt'] });
  });
  it('EPA und DHA in Milligramm, auch wenn nur eins von beiden bekannt ist', () => {
    const lachs = eintrag(lm({ name: 'Lachs', werte: { 'F20:5CN3': 0.5, 'F22:6CN3': 1 } }), { menge: 100 }, 'a');
    const halb = eintrag(lm({ name: 'Halb', werte: { 'F22:6CN3': 0.1 } }), { menge: 100 }, 'b');
    const nichts = eintrag(lm({ name: 'Nichts', werte: {} }), { menge: 100 }, 'c');
    expect(tagessumme([lachs, halb, nichts]).epaDhaMg).toEqual({ menge: 1600, fehltBei: ['Nichts'] });
  });
});

describe('Stufen', () => {
  const ziel = { von: 100, optimum: { von: 150, bis: 200 }, hoechst: 300 };
  it('unter dem Minimum, Minimum, Optimum, darüber, über dem Höchstwert', () => {
    expect(stufeVon(99, ziel)).toBe('unter');
    expect(stufeVon(100, ziel)).toBe('minimum');
    expect(stufeVon(150, ziel)).toBe('optimum');
    expect(stufeVon(200, ziel)).toBe('optimum');
    expect(stufeVon(250, ziel)).toBe('darueber');
    expect(stufeVon(301, ziel)).toBe('ueber');
  });
  it('ohne Optimum reicht das Minimum', () => {
    expect(stufeVon(100, { von: 100 })).toBe('minimum');
    expect(stufeVon(9999, { von: 100 })).toBe('minimum');
  });
  it('nur eine Obergrenze: noch Luft oder etwas mehr', () => {
    expect(stufeVon(4, { hoechst: 5 })).toBe('luft');
    expect(stufeVon(5, { hoechst: 5 })).toBe('luft');
    expect(stufeVon(5.1, { hoechst: 5 })).toBe('ueber');
  });
  it('keine Lücke: nur ein Hinweis, aber erreicht bleibt erreicht', () => {
    expect(stufeVon(1, { von: 10, keineLuecke: true })).toBe('hinweis');
    expect(stufeVon(10, { von: 10, keineLuecke: true })).toBe('minimum');
    expect(stufeVon(5, null)).toBe('ohne');
  });
  it('wer das Minimum geschafft hat, sieht das', () => {
    expect(['unter', 'minimum', 'optimum', 'darueber', 'ueber', 'luft', 'hinweis', 'ohne'].filter((s) => istGeschafft(s as never))).toEqual(['minimum', 'optimum', 'darueber']);
  });
  it('der Balken endet bei voll', () => {
    expect(balkenAnteil(50, { von: 100 })).toBe(0.5);
    expect(balkenAnteil(500, { von: 100 })).toBe(1);
    expect(balkenAnteil(2, { hoechst: 4 })).toBe(0.5);
    expect(balkenAnteil(2, null)).toBe(0);
  });
});

describe('Lücken', () => {
  const allesVoll = () => {
    const werte: Record<string, number> = {};
    for (const z of Object.values(bedarf.ziele)) if (z.von !== undefined) werte[z.code] = z.optimum ? z.optimum.von : z.von;
    werte['F20:5CN3'] = 1;
    return lm({ werte, umrechnung: GRUNDWERTE });
  };

  it('ein leerer Tag: Eiweiß und Ballaststoffe zuerst', () => {
    const l = tagesLuecken(tagessumme([]), bedarf);
    expect(l[0]?.code).toBe('PROT625');
    expect(l[1]?.code).toBe('FIBT');
    expect(l[0]).toMatchObject({ stufe: 'minimum', erreicht: 0 });
    expect(l[0]?.text).toContain('Eiweiß');
  });
  it('Kalorien und Kohlenhydrate sind keine eigene Lücke', () => {
    const codes = tagesLuecken(tagessumme([]), bedarf).map((x) => x.code);
    expect(codes).not.toContain('ENERCC');
    expect(codes).not.toContain('CHO');
  });
  it('Vitamin D, Fluorid, Chlorid und Wasser sind nie eine Lücke', () => {
    const codes = tagesLuecken(tagessumme([]), bedarf).map((x) => x.code);
    for (const c of ['VITD', 'FD', 'CLD', 'WATER']) expect(codes, c).not.toContain(c);
  });
  it('ausgeblendete Nährstoffe auch nicht', () => {
    const codes = tagesLuecken(tagessumme([]), bedarf, ['FIBT']).map((x) => x.code);
    expect(codes).not.toContain('FIBT');
    expect(tagesLuecken(tagessumme([]), bedarf).map((x) => x.code)).toContain('FIBT');
  });
  it('zuerst, was zum Minimum fehlt, danach, was zum Optimum fehlt', () => {
    const ziel = bedarf.ziele.PROT625!;
    const halbesEiweiss = eintrag(lm({ werte: { ENERCC: 0, PROT625: ziel.von! } }), { menge: 100 });
    const l = tagesLuecken(tagessumme([halbesEiweiss]), bedarf);
    const eiweiss = l.find((x) => x.code === 'PROT625')!;
    expect(eiweiss.stufe).toBe('optimum');
    expect(eiweiss.fehlt).toBeCloseTo(ziel.optimum!.von - ziel.von!, 5);
    expect(l.findIndex((x) => x.stufe === 'optimum')).toBeGreaterThan(l.findLastIndex((x) => x.stufe === 'minimum'));
  });
  it('im Optimum oder darüber fehlt nichts mehr', () => {
    expect(tagesLuecken(tagessumme([eintrag(allesVoll(), { menge: 100 })]), bedarf)).toEqual([]);
  });
  it('merkt sich, wo Angaben fehlen', () => {
    const l = tagesLuecken(tagessumme([eintrag(lm({ name: 'Ohne Ballaststoffe', werte: { ENERCC: 100 } }))]), bedarf);
    expect(l.find((x) => x.code === 'FIBT')?.fehltBei).toEqual(['Ohne Ballaststoffe']);
  });
  it('Satz: Kalorien, Eiweiß und die größten Lücken', () => {
    const s = tagessumme([]);
    const satz = lueckenSatz(s, bedarf, tagesLuecken(s, bedarf));
    expect(satz).toMatch(/^Noch etwa [\d.]+ kcal und .* Eiweiß, dazu .* und .*\.$/);
  });
  it('Satz: ohne freie Kalorien, und wenn alles geschafft ist', () => {
    const voll = eintrag(lm({ werte: { ENERCC: bedarf.kcal + 10 } }), { menge: 100 });
    expect(lueckenSatz(tagessumme([voll]), bedarf, tagesLuecken(tagessumme([voll]), bedarf))).toMatch(/^Es fehlen noch /);
    const s = tagessumme([eintrag(allesVoll(), { menge: 100 })]);
    expect(lueckenSatz(s, bedarf, [])).toMatch(/^Alles geschafft/);
  });
  it('Satz: Minimum geschafft, Optimum offen', () => {
    const s = tagessumme([]);
    const optimum = tagesLuecken(s, bedarf).slice(0, 1).map((l) => ({ ...l, stufe: 'optimum' as const }));
    expect(lueckenSatz(s, bedarf, optimum)).toMatch(/Mindestwerte sind geschafft.*Zum Optimum fehlen noch/);
  });
  it('freie Kalorien und ein freundlicher Satz', () => {
    expect(kcalFrei(tagessumme([]), bedarf)).toBe(bedarf.kcal);
    expect(tagesMotto(tagessumme([]), bedarf, [])).toMatch(/neuer Tag/);
    const s = tagessumme([eintrag()]);
    expect(tagesMotto(s, bedarf, tagesLuecken(s, bedarf)).length).toBeGreaterThan(5);
    expect(tagesMotto(s, bedarf, [])).toMatch(/Stark/);
  });
  it('sagt, wenn Angaben fehlen', () => {
    expect(fehltText([])).toBeNull();
    expect(fehltText(['A'])).toBe('bei 1 Eintrag keine Angabe');
    expect(fehltText(['A', 'B'])).toBe('bei 2 Einträgen keine Angabe');
  });
});
