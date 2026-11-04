/** Rezepte: prüfen, Nährwerte je Rezept und Portion, Anpassen im Tagebuch. Alle Beispiele sind erfunden. */
import { describe, expect, it } from 'vitest';
import { GRUNDWERTE } from '@shared/einheiten';
import { farbeOderErste, hashtagName, jePortion, rezeptPruefen, rezeptSumme, zubereitungsSchritte, type RezeptEingabe, type ZutatStand } from '@shared/rezepte';
import { aggregat, bestandteilMenge, eingabePruefenEintrag, mengenText, rezeptEintragAendern, rezeptEintragAnlegen, tagessumme, type Bestandteil } from '@shared/tagebuch';

const bestandteil = (id: string, name: string, gramm: number, werte: Record<string, number>, freierZucker: number | null = 0): Bestandteil => ({
  id,
  lebensmittelId: `bls:${id}`,
  name,
  marke: null,
  menge: gramm,
  einheit: 'g',
  groesse: null,
  gramm,
  umrechnung: GRUNDWERTE,
  werteJe100g: werte,
  spuren: [],
  freierZuckerJe100g: freierZucker,
});

const NUDELN = bestandteil('n', 'Nudeln', 400, { ENERCC: 150, PROT625: 5, CA: 10 });
const OEL = bestandteil('o', 'Öl', 40, { ENERCC: 900, FAT: 100 });
const HONIG = bestandteil('h', 'Honig', 20, { ENERCC: 300 }, 80);

const zutat = (b: Bestandteil): ZutatStand => ({ zutat: { id: b.id, lebensmittelId: b.lebensmittelId, name: b.name, menge: b.menge, einheit: 'g', groesse: null }, bestandteil: b, problem: null });

const eingabe = (teil: Partial<RezeptEingabe> = {}): RezeptEingabe => ({
  name: ' Nudeln mit Öl ',
  portionen: 4,
  zutaten: [{ id: 'a', lebensmittelId: 'bls:n', name: 'Nudeln', menge: 400, einheit: 'g', groesse: null }],
  zubereitung: 'Kochen\nMischen',
  notiz: '',
  hashtags: ['x', 'x'],
  fotos: [],
  ...teil,
});

describe('Rezept prüfen', () => {
  it('nimmt Gültiges an und räumt auf', () => {
    const r = rezeptPruefen(eingabe());
    expect(r.name).toBe('Nudeln mit Öl');
    expect(r.hashtags).toEqual(['x']);
    expect(r.id).toBeUndefined();
    expect(rezeptPruefen({ ...eingabe(), id: 'rezept:1' }).id).toBe('rezept:1');
    expect(rezeptPruefen({ ...eingabe(), id: 'anders:1' }).id).toBeUndefined();
  });
  it('braucht Name, Portionen und mindestens eine Zutat', () => {
    expect(() => rezeptPruefen(eingabe({ name: '  ' }))).toThrow(/Namen/);
    expect(() => rezeptPruefen(eingabe({ portionen: 0 }))).toThrow(/Portionen/);
    expect(() => rezeptPruefen(eingabe({ zutaten: [] }))).toThrow(/Zutat/);
    expect(() => rezeptPruefen(null)).toThrow();
  });
  it('lehnt falsche Mengen und Fotonamen ab', () => {
    expect(() => rezeptPruefen(eingabe({ zutaten: [{ id: 'a', lebensmittelId: 'bls:n', name: 'N', menge: -1, einheit: 'g', groesse: null }] }))).toThrow(/Menge/);
    expect(() => rezeptPruefen({ ...eingabe(), zutaten: [{ id: 'a', lebensmittelId: 'bls:n', menge: 1, einheit: 'Eimer' }] })).toThrow(/Einheit/);
    expect(() => rezeptPruefen(eingabe({ fotos: ['../../geheim.jpg'] }))).toThrow(/Foto/);
  });
  it('Hashtags: aus Buchstaben und Zahlen, das # zeigt die Oberfläche', () => {
    expect(hashtagName('#unter 30 Minuten')).toBe('unter30Minuten');
    expect(hashtagName('OnePot')).toBe('OnePot');
    expect(hashtagName('süß-sauer')).toBe('süß-sauer');
    expect(() => hashtagName('###')).toThrow(/Hashtag/);
    expect(() => hashtagName(null)).toThrow();
    expect(farbeOderErste('himmel')).toBe('himmel');
    expect(farbeOderErste('neonpink')).toBe('tomate');
  });
  it('Zubereitung: jede Zeile ein Schritt', () => {
    expect(zubereitungsSchritte('Kochen\n\n  Mischen  \n')).toEqual(['Kochen', 'Mischen']);
    expect(zubereitungsSchritte('')).toEqual([]);
  });
});

describe('Nährwerte', () => {
  it('ganzes Rezept und je Portion', () => {
    const ganz = rezeptSumme([zutat(NUDELN), zutat(OEL)]);
    expect(ganz.werte.ENERCC!.menge).toBe(600 + 360);
    const portion = jePortion(ganz, 4);
    expect(portion.werte.ENERCC!.menge).toBe(240);
    expect(portion.werte.FAT!.menge).toBe(10);
  });
  it('ein fehlender Wert ist nicht null, und man sieht, bei welcher Zutat', () => {
    const ganz = rezeptSumme([zutat(NUDELN), zutat(OEL)]);
    expect(ganz.werte.CA).toEqual({ menge: 40, fehltBei: ['Öl'] });
    expect(jePortion(ganz, 2).werte.CA).toEqual({ menge: 20, fehltBei: ['Öl'] });
  });
  it('freier Zucker zählt mit', () => {
    expect(rezeptSumme([zutat(NUDELN), zutat(HONIG)]).freierZuckerG.menge).toBe(16);
  });
  it('Zutaten mit Problem bleiben draußen', () => {
    const fehlend: ZutatStand = { ...zutat(OEL), bestandteil: null, problem: 'gibt-es-nicht-mehr' };
    expect(rezeptSumme([zutat(NUDELN), fehlend]).werte.ENERCC!.menge).toBe(600);
  });
  it('aggregat: je 100 g über alle Zutaten', () => {
    const a = aggregat([NUDELN, OEL]);
    expect(a.gramm).toBe(440);
    expect(a.werteJe100g.ENERCC).toBeCloseTo((960 / 440) * 100, 5);
    expect(a.werteJe100g.FAT).toBeCloseTo((40 / 440) * 100, 5);
    expect(aggregat([]).gramm).toBe(0);
    expect(aggregat([{ ...NUDELN, freierZuckerJe100g: null }]).freierZuckerJe100g).toBeNull();
  });
});

describe('Ein Rezept im Tagebuch', () => {
  const rezept = { rezeptId: 'rezept:1', name: 'Nudeln mit Öl', portionen: 4, bestandteile: [NUDELN, OEL] };
  let n = 0;
  const neueId = () => `b${n++}`;
  const eintrag = (menge = 1) => rezeptEintragAnlegen(rezept, eingabePruefenEintrag({ datum: '2026-11-04', mahlzeit: 'abend', lebensmittelId: 'rezept:1', menge, einheit: 'Portion', groesse: null }), 'e1', '2026-11-04T12:00:00.000Z', neueId);

  it('rechnet die Zutaten auf die gegessene Menge um', () => {
    const e = eintrag(1);
    expect(e).toMatchObject({ art: 'rezept', menge: 1, einheit: 'Portion', gramm: 110, name: 'Nudeln mit Öl' });
    expect(e.rezept).toMatchObject({ portionen: 4, angepasst: false });
    expect(e.rezept!.bestandteile.map((b) => b.menge)).toEqual([100, 10]);
    expect(tagessumme([e]).werte.ENERCC!.menge).toBeCloseTo(240, 5);
  });
  it('halbe und anderthalb Portionen', () => {
    expect(tagessumme([eintrag(0.5)]).werte.ENERCC!.menge).toBeCloseTo(120, 5);
    expect(tagessumme([eintrag(1.5)]).werte.ENERCC!.menge).toBeCloseTo(360, 5);
  });
  it('die Tagessumme nennt die einzelne Zutat, bei der eine Angabe fehlt', () => {
    expect(tagessumme([eintrag(1)]).werte.CA).toEqual({ menge: 10, fehltBei: ['Öl'] });
  });
  it('andere Portionen: alle Zutaten wachsen mit, und das ist noch keine Anpassung', () => {
    const neu = rezeptEintragAendern(eintrag(1), { menge: 2, mahlzeit: 'mittag' });
    expect(neu).toMatchObject({ menge: 2, mahlzeit: 'mittag', gramm: 220 });
    expect(neu.rezept).toMatchObject({ angepasst: false });
    expect(neu.rezept!.bestandteile.map((b) => b.menge)).toEqual([200, 20]);
    expect(tagessumme([neu]).werte.ENERCC!.menge).toBeCloseTo(480, 5);
  });
  it('für dieses eine Mal weniger Öl: nur dieser Eintrag ändert sich', () => {
    const e = eintrag(1);
    const [nudeln, oel] = e.rezept!.bestandteile;
    const weniger = bestandteilMenge(oel!, { menge: 5, einheit: 'g', groesse: null });
    const neu = rezeptEintragAendern(e, { menge: 1, mahlzeit: 'abend', bestandteile: [nudeln!, weniger] });
    expect(neu.rezept).toMatchObject({ angepasst: true });
    expect(tagessumme([neu]).werte.ENERCC!.menge).toBeCloseTo(150 + 45, 5);
    expect(tagessumme([e]).werte.ENERCC!.menge).toBeCloseTo(240, 5);
    expect(rezept.bestandteile[1]!.gramm).toBe(40);
  });
  it('eine Anpassung bleibt erkennbar, auch wenn danach die Portionen wechseln', () => {
    const e = eintrag(1);
    const angepasst = rezeptEintragAendern(e, { menge: 1, mahlzeit: 'abend', bestandteile: [e.rezept!.bestandteile[0]!] });
    expect(rezeptEintragAendern(angepasst, { menge: 2, mahlzeit: 'abend' }).rezept).toMatchObject({ angepasst: true });
  });
  it('eine Portion ist keine beliebige Menge', () => {
    expect(() => eingabePruefenEintrag({ datum: '2026-11-04', mahlzeit: 'abend', lebensmittelId: 'rezept:1', menge: 0, einheit: 'Portion', groesse: null })).toThrow(/Portion/);
    expect(mengenText({ menge: 1, einheit: 'Portion', groesse: null, gramm: 110 })).toBe('1 Portion');
    expect(mengenText({ menge: 1.5, einheit: 'Portion', groesse: null, gramm: 165 })).toBe('1,5 Portionen');
    expect(mengenText({ menge: 0.5, einheit: 'Portion', groesse: null, gramm: 55 })).toBe('0,5 Portionen');
  });
});
