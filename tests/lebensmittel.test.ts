/** Suche, freier Zucker, Einheiten und Nährwerte je Menge. Alle Beispiele sind erfunden oder allgemein bekannte Lebensmittel. */
import { describe, expect, it } from 'vitest';
import { bedarfBerechnen } from '@shared/bedarf';
import { EI_GROESSEN, grammJeEinheit, GRUNDWERTE, inGramm, istUngefaehr, standardUmrechnung, umrechnungPruefen } from '@shared/einheiten';
import { freierZuckerG, zuckerRegel } from '@shared/freierZucker';
import { eingabePruefen, freierZuckerEigen, naehrwertZeilen, schaetzungAus, werteJe100g, zeilenDerGruppe, type Lebensmittel } from '@shared/lebensmittel';
import { aehnlichste, sortierteTreffer, suchText, trefferWert, vergleichsAbstand } from '@shared/suche';

const lm = (teil: Partial<Lebensmittel> = {}): Lebensmittel => ({
  id: 'eigen:1',
  herkunft: 'eigen',
  name: 'Testkäse',
  marke: null,
  gruppe: null,
  basis: 'g',
  werte: {},
  spuren: [],
  schaetzung: null,
  freierZuckerG: null,
  nurNatuerlicherZucker: false,
  packung: null,
  foto: null,
  hinweise: [],
  anmerkung: null,
  umrechnung: GRUNDWERTE,
  umrechnungAngepasst: false,
  ...teil,
});

describe('Suche', () => {
  it('verträgt Umlaute in jeder Schreibweise', () => {
    for (const eingabe of ['kase', 'käse', 'kaese', 'KÄSE']) expect(suchText(eingabe)).toBe('kase');
    expect(trefferWert('Frischkäse Natur', ['frischkase'])).not.toBeNull();
    expect(suchText('Müsli')).toBe(suchText('Muesli'));
    expect(suchText('Straße')).toBe('strasse');
  });
  it('findet Teilwörter, und jedes Suchwort muss vorkommen', () => {
    expect(trefferWert('Frischkäse Natur', ['kase'])).not.toBeNull();
    expect(trefferWert('Frischkäse Natur', ['kase', 'natur'])).not.toBeNull();
    expect(trefferWert('Frischkäse Natur', ['kase', 'wurst'])).toBeNull();
  });
  it('zeigt das Naheliegende zuerst', () => {
    const namen = ['Apfelkuchen mit Streuseln', 'Bratapfel gefüllt', 'Apfel gebacken mit Vanillesauce und Mandeln', 'Apfel roh', 'Apfel'];
    const sortiert = sortierteTreffer(namen.map((name) => ({ name })), 'apfel').map((t) => t.name);
    expect(sortiert[0]).toBe('Apfel');
    expect(sortiert[1]).toBe('Apfel roh');
    expect(sortiert.indexOf('Bratapfel gefüllt')).toBeGreaterThan(sortiert.indexOf('Apfel gebacken mit Vanillesauce und Mandeln'));
  });
  it('Alltagswörter finden, was der BLS anders nennt', () => {
    const bestand = [{ name: 'Einkorn ganzes Korn' }, { name: 'Hühnerei roh' }, { name: 'Eisbergsalat roh' }];
    expect(sortierteTreffer(bestand, 'ei')[0]?.name).toBe('Hühnerei roh');
    expect(sortierteTreffer(bestand, 'eier').map((t) => t.name)).toEqual(['Hühnerei roh']);
    expect(sortierteTreffer([{ name: 'Hafer Flocken' }, { name: 'Haferflockenplätzchen' }], 'haferflocken')[0]?.name).toBe('Hafer Flocken');
    expect(sortierteTreffer([{ name: 'Teigwaren eifrei, roh' }], 'nudeln')).toHaveLength(1);
  });
  it('die Mehrzahl findet die Einzahl', () => {
    expect(sortierteTreffer([{ name: 'Linse reif' }], 'linsen')).toHaveLength(1);
    expect(sortierteTreffer([{ name: 'Tomate roh' }], 'tomaten')).toHaveLength(1);
    expect(sortierteTreffer([{ name: 'Tomate roh' }], 'tomatenx')).toHaveLength(0);
  });
  it('Soße und Sauce sind dasselbe', () => {
    expect(suchText('Tomatensoße')).toBe(suchText('Tomatensauce'));
    expect(suchText('Tomatensosse')).toBe(suchText('Tomatensauce'));
  });
  it('Gerichte und Gebäck stehen hinter dem Grundnahrungsmittel, Eigenes weit oben', () => {
    const bestand = [
      { name: 'Joghurt-Dip', gruppe: 'X' },
      { name: 'Joghurt mild, mind. 3,5 % Fett', gruppe: 'M' },
      { name: 'Joghurt vom Hof', gruppe: null },
    ];
    expect(sortierteTreffer(bestand, 'joghurt').map((t) => t.name)).toEqual(['Joghurt vom Hof', 'Joghurt mild, mind. 3,5 % Fett', 'Joghurt-Dip']);
  });
  it('leere Suche findet nichts', () => {
    expect(sortierteTreffer([{ name: 'Apfel' }], '   ')).toEqual([]);
  });
});

describe('Ähnliche Lebensmittel für die Schätzung', () => {
  const werte = { ENERCC: 250, FAT: 22, CHO: 3, PROT625: 8 };
  const bestand = [
    { code: 'M710700', name: 'Frischkäsezubereitung Natur, mind. 50 % Fett i. Tr.', werte: { ENERCC: 260, FAT: 24, CHO: 3, PROT625: 7 } },
    { code: 'M710100', name: 'Frischkäse Magerstufe', werte: { ENERCC: 90, FAT: 1, CHO: 4, PROT625: 12 } },
    { code: 'W100000', name: 'Leberwurst', werte: { ENERCC: 260, FAT: 23, CHO: 2, PROT625: 9 } },
    { code: 'X100000', name: 'Kartoffelsalat', werte: { ENERCC: 250, FAT: 22, CHO: 3, PROT625: 8 } },
    { code: 'X200000', name: 'Frischkäse-Auflauf', werte: { ENERCC: 260, FAT: 23, CHO: 3, PROT625: 8 } },
  ];
  it('der Name wiegt schwerer als gleiche Werte', () => {
    const treffer = aehnlichste({ name: 'Frischkäse Natur', werte }, bestand).map((t) => t.code);
    expect(treffer[0]).toBe('M710700');
    expect(treffer.indexOf('W100000')).toBeGreaterThan(treffer.indexOf('M710100'));
  });
  it('Gerichte kommen nur dran, wenn der Name passt', () => {
    const treffer = aehnlichste({ name: 'Frischkäse', werte }, bestand).map((t) => t.code);
    expect(treffer).not.toContain('X100000');
    expect(treffer).toContain('X200000');
  });
  it('ohne Namen zählen die Werte', () => {
    expect(aehnlichste({ name: '', werte: { ENERCC: 260, FAT: 23, CHO: 2, PROT625: 9 } }, bestand)[0]?.code).toBe('W100000');
    expect(vergleichsAbstand({}, { FAT: 1 })).toBeNull();
  });
  it('die Schätzung ersetzt keine eigenen und keine Packungswerte', () => {
    const quelle = { code: 'M1', name: 'Quelle', werte: { ENERCC: 100, FAT: 5, VITC: 7, CA: 80, ID: 3 } };
    const s = schaetzungAus(quelle, { CA: 200, ENERCC: 250 });
    expect(s.werte).toEqual({ VITC: 7, ID: 3 });
    expect(s).toMatchObject({ code: 'M1', name: 'Quelle' });
  });
});

describe('Freier Zucker', () => {
  const regel = (code: string, name: string) => zuckerRegel(code, name);
  it('ganzes Obst, Gemüse und Milch zählen nicht', () => {
    expect(regel('F110100', 'Apfel roh')).toBe('kein');
    expect(regel('F801000', 'Rosinen getrocknet')).toBe('kein');
    expect(regel('G100000', 'Karotte/Möhre, gekocht')).toBe('kein');
    expect(regel('G200000', 'Zuckermais gekocht')).toBe('kein');
    expect(regel('M111200', 'Milch fettarm, frisch, 1,5 % Fett, pasteurisiert')).toBe('kein');
    expect(regel('M300000', 'Joghurt mind. 3,5 % Fett')).toBe('kein');
    expect(regel('H210100', 'Mandel süß')).toBe('kein');
  });
  it('Säfte, Honig, Süßes und Gesüßtes zählen', () => {
    expect(regel('F110600', 'Apfelsaft')).toBe('frei');
    expect(regel('F110601', 'Apfelnektar mit Süßungsmitteln')).toBe('frei');
    expect(regel('F201902', 'Aprikose gezuckert, Konserve, abgetropft')).toBe('frei');
    expect(regel('S100000', 'Honig')).toBe('frei');
    expect(regel('D100000', 'Apfelkuchen')).toBe('frei');
    expect(regel('M400000', 'Joghurt mind. 3,5 % Fett, mit Fruchtzubereitung, gesüßt')).toBe('frei');
    expect(regel('N100000', 'Limonade')).toBe('frei');
    expect(regel('C100000', 'Cornflakes gesüßt')).toBe('frei');
  });
  it('„ungesüßt“ schlägt das Wort „gesüßt“, außer bei Saft', () => {
    expect(regel('F300000', 'Süßkirsche ungesüßt, Konserve, abgetropft')).toBe('kein');
    expect(regel('Y864112', 'Apfelmus ungesüßt')).toBe('kein');
    expect(regel('F110602', 'Apfelsaft ungesüßt')).toBe('frei');
  });
  it('In Saft Eingelegtes und Abgetropftes zählt nicht', () => {
    expect(regel('F400000', 'Mandarine in Fruchtsaft, Konserve, abgetropft')).toBe('kein');
  });
  it('Gerichte: Süßes ja, Herzhaftes nein', () => {
    expect(regel('Y100000', 'Vanillepudding, Flammeri')).toBe('frei');
    expect(regel('Y200000', 'Erdbeerkompott')).toBe('frei');
    expect(regel('Y300000', 'Vanillecremeeis')).toBe('frei');
    expect(regel('X100000', 'Zwiebelkuchen schwäbisch, mit Speck')).toBe('kein');
    expect(regel('X200000', 'Broccolicremesuppe')).toBe('kein');
    expect(regel('X300000', 'Reis gekocht')).toBe('kein');
    expect(regel('X400000', 'Fleischbrühe (Rind)')).toBe('kein');
    expect(regel('Y863112', 'Apfelmus mit Süßstoff')).toBe('kein');
  });
  it('Zucker aus Milch zählt auch in Gesüßtem nicht', () => {
    expect(freierZuckerG('frei', 13, 4)).toBe(9);
    expect(freierZuckerG('frei', 3, 4)).toBe(0);
    expect(freierZuckerG('frei', 13, null)).toBe(13);
    expect(freierZuckerG('kein', 13, 4)).toBe(0);
    expect(freierZuckerG('frei', null, 4)).toBeNull();
  });
  it('eigene Lebensmittel: der ganze Zucker, außer der Haken ist gesetzt', () => {
    expect(freierZuckerEigen({ SUGAR: 12 }, false)).toBe(12);
    expect(freierZuckerEigen({ SUGAR: 12 }, true)).toBe(0);
    expect(freierZuckerEigen({}, false)).toBeNull();
  });
});

describe('Mengen und Einheiten', () => {
  it('1 EL Öl wiegt anders als 1 EL Mehl oder Honig', () => {
    const oel = standardUmrechnung('Olivenöl', 'Q120000');
    const mehl = standardUmrechnung('Weizen Mehl, Type 405', 'C100000');
    const honig = standardUmrechnung('Honig', 'S100000');
    expect(oel.el).toBe(10);
    expect(mehl.el).toBe(10);
    expect(honig.el).toBe(20);
    expect(inGramm(2, 'EL', oel)).toBe(20);
    expect(inGramm(3, 'TL', mehl)).toBe(9);
  });
  it('eigene Lebensmittel haben keine Gruppe: Es zählt der Name', () => {
    expect(standardUmrechnung('Rapsöl kaltgepresst', null)).toMatchObject({ el: 10, dichte: 0.92 });
    expect(standardUmrechnung('Mein Saft', null)).toMatchObject({ el: 15, dichte: 1.03 });
    expect(standardUmrechnung('Skyr Natur', null)).toMatchObject({ el: 20, becher: 150 });
    expect(standardUmrechnung('Irgendwas', null)).toMatchObject({ el: 15, tl: 5, dichte: 1, stueck: null });
  });
  it('ml über die Dichte, Standard 1', () => {
    expect(inGramm(100, 'ml', GRUNDWERTE)).toBe(100);
    expect(inGramm(100, 'ml', standardUmrechnung('Olivenöl', 'Q120000'))).toBeCloseTo(92, 5);
    expect(inGramm(100, 'ml', standardUmrechnung('Honig', 'S100000'))).toBeCloseTo(140, 5);
    expect(inGramm(0.5, 'l', standardUmrechnung('Milch fettarm', 'M111200'))).toBeCloseTo(515, 5);
    expect(inGramm(2, 'kg', GRUNDWERTE)).toBe(2000);
  });
  it('Eier nach Größe S, M, L', () => {
    const ei = standardUmrechnung('Hühnerei roh', 'E111100');
    expect(ei.groessen).toEqual(EI_GROESSEN);
    expect(inGramm(3, 'Stück', ei, 'M')).toBe(EI_GROESSEN.M * 3);
    expect(inGramm(1, 'Stück', ei, 'S')).toBeLessThan(inGramm(1, 'Stück', ei, 'L')!);
    expect(standardUmrechnung('Hühnerei Pulver', 'E111500').groessen).toBeNull();
    expect(standardUmrechnung('Hühnerei Eigelb, roh', 'E112100').stueck).toBe(17);
  });
  it('Stück und Scheibe nur, wo es Sinn hat', () => {
    expect(standardUmrechnung('Apfel roh', 'F110100').stueck).toBe(140);
    expect(standardUmrechnung('Apfelsaft', 'F110600').stueck).toBeNull();
    expect(standardUmrechnung('Apfel getrocknet', 'F110400').stueck).toBeNull();
    expect(standardUmrechnung('Roggenbrot', 'B100000').scheibe).toBe(45);
    expect(standardUmrechnung('Weizentoastbrot', 'B200000').scheibe).toBe(28);
    expect(standardUmrechnung('Gouda mind. 48 % Fett i. Tr.', 'M500000').scheibe).toBe(25);
    expect(standardUmrechnung('Olivenöl', 'Q120000').scheibe).toBeNull();
    expect(standardUmrechnung('Joghurt mind. 3,5 % Fett', 'M300000').becher).toBe(150);
  });
  it('was das Lebensmittel nicht weiß, bleibt offen, statt zu raten', () => {
    const u = standardUmrechnung('Kichererbse reif, gekocht', 'G770432');
    expect(grammJeEinheit('Dose', u)).toBeNull();
    expect(inGramm(1, 'Dose', u)).toBeNull();
    expect(inGramm(1, 'Dose', { ...u, dose: 240 })).toBe(240);
    expect(grammJeEinheit('Packung', u)).toBeNull();
  });
  it('nur g und kg sind genau, alles andere bekommt ein ≈', () => {
    expect(istUngefaehr('g')).toBe(false);
    expect(istUngefaehr('kg')).toBe(false);
    for (const e of ['ml', 'l', 'EL', 'TL', 'Prise', 'Stück', 'Scheibe', 'Dose', 'Becher', 'Packung'] as const) expect(istUngefaehr(e), e).toBe(true);
  });
  it('prüft Umrechnungen', () => {
    expect(umrechnungPruefen({ ...GRUNDWERTE, dose: 240 }).dose).toBe(240);
    expect(() => umrechnungPruefen({ ...GRUNDWERTE, el: 0 })).toThrow();
    expect(() => umrechnungPruefen({ ...GRUNDWERTE, dichte: 50 })).toThrow();
    expect(() => umrechnungPruefen({ ...GRUNDWERTE, stueck: -1 })).toThrow();
    expect(() => umrechnungPruefen(null)).toThrow();
    expect(umrechnungPruefen({ ...GRUNDWERTE, groessen: { S: 1, M: 2, L: 3 } }).groessen).toEqual({ S: 1, M: 2, L: 3 });
  });
});

describe('Nährwerte je Menge', () => {
  const bedarf = bedarfBerechnen({ geschlecht: 'maennlich', alter: 40, groesseCm: 180, gewichtKg: 70, aktivitaet: 'sitzend', sport: false, ziel: 'halten', tempo: 'sanft' });

  it('ein fehlender Wert ist nicht null', () => {
    const zeilen = naehrwertZeilen(lm({ werte: { ENERCC: 200, CA: 100 } }), 50, bedarf);
    const zeile = (code: string) => zeilen.find((z) => z.naehrstoff.code === code)!;
    expect(zeile('CA').jeMenge).toBe(50);
    expect(zeile('VITC').je100g).toBeNull();
    expect(zeile('VITC').jeMenge).toBeNull();
    expect(zeile('VITC').anteil).toBeNull();
  });
  it('rechnet Menge und Anteil am Tagesbedarf', () => {
    const zeilen = naehrwertZeilen(lm({ werte: { VITC: 50 } }), 200, bedarf);
    const c = zeilen.find((z) => z.naehrstoff.code === 'VITC')!;
    expect(c.jeMenge).toBe(100);
    expect(c.anteil).toBeCloseTo((100 / 110) * 100, 5);
  });
  it('ohne Minimum misst sich der Anteil an der Obergrenze, ohne Ziel gibt es keinen', () => {
    const zeilen = naehrwertZeilen(lm({ werte: { NACL: 1, STARCH: 5 } }), 100, bedarf);
    expect(zeilen.find((z) => z.naehrstoff.code === 'NACL')!.anteil).toBeCloseTo(20, 5);
    expect(zeilen.find((z) => z.naehrstoff.code === 'STARCH')!.anteil).toBeNull();
  });
  it('Spuren zählen als 0 und bleiben als Spuren erkennbar', () => {
    const zeilen = naehrwertZeilen(lm({ werte: { ZN: 0 }, spuren: ['ZN'] }), 100, bedarf);
    const zink = zeilen.find((z) => z.naehrstoff.code === 'ZN')!;
    expect(zink.spur).toBe(true);
    expect(zink.jeMenge).toBe(0);
  });
  it('die Schätzung füllt Lücken und bleibt gekennzeichnet', () => {
    const zeilen = naehrwertZeilen(lm({ werte: { CA: 100 }, schaetzung: { code: 'M1', name: 'Quelle', werte: { CA: 999, ID: 5 } } }), 100, bedarf);
    const zeile = (code: string) => zeilen.find((z) => z.naehrstoff.code === code)!;
    expect(zeile('CA')).toMatchObject({ je100g: 100, geschaetzt: false });
    expect(zeile('ID')).toMatchObject({ je100g: 5, geschaetzt: true });
  });
  it('rechnet Kilojoule und Natrium aus, wenn nur Kalorien und Salz bekannt sind', () => {
    const w = werteJe100g(lm({ werte: { ENERCC: 100, NACL: 2.5 } }));
    expect(w.ENERCJ).toBeCloseTo(418.4, 5);
    expect(w.NA).toBeCloseTo(1000, 5);
    expect(werteJe100g(lm({ werte: { NA: 400 } })).NACL).toBeCloseTo(1, 5);
  });
  it('Angaben je 100 ml werden über die Dichte zu je 100 g', () => {
    const fluessig = lm({ basis: 'ml', werte: { ENERCC: 90, FAT: 10 }, umrechnung: { ...GRUNDWERTE, dichte: 0.9 } });
    expect(werteJe100g(fluessig).ENERCC).toBeCloseTo(100, 5);
    expect(naehrwertZeilen(fluessig, 90, bedarf).find((z) => z.naehrstoff.code === 'ENERCC')!.jeMenge).toBeCloseTo(90, 5);
  });
  it('alle 138 Nährstoffe kommen als Zeile, nach Gruppen', () => {
    const zeilen = naehrwertZeilen(lm(), 100, null);
    expect(zeilen).toHaveLength(138);
    expect(zeilenDerGruppe(zeilen, 'energie')).toHaveLength(2);
    expect(zeilen.every((z) => z.anteil === null)).toBe(true);
  });
});

describe('Eingaben prüfen', () => {
  const gut = { name: ' Skyr Natur ', marke: '', basis: 'g', werte: { ENERCC: 60, PROT625: 11 }, schaetzung: null, nurNatuerlicherZucker: true, packung: 450, foto: null };
  it('nimmt Gültiges an und räumt auf', () => {
    expect(eingabePruefen(gut)).toMatchObject({ name: 'Skyr Natur', marke: null, basis: 'g', packung: 450, nurNatuerlicherZucker: true });
  });
  it('ein Name muss sein', () => {
    expect(() => eingabePruefen({ ...gut, name: '   ' })).toThrow(/Namen/);
  });
  it('lehnt falsche Werte ab und nennt den Nährstoff', () => {
    expect(() => eingabePruefen({ ...gut, werte: { FAT: 140 } })).toThrow(/Fett/);
    expect(() => eingabePruefen({ ...gut, werte: { FAT: -1 } })).toThrow(/Fett/);
    expect(() => eingabePruefen({ ...gut, werte: { GIBTSNICHT: 1 } })).toThrow();
    expect(() => eingabePruefen({ ...gut, werte: { FAT: '3' } })).toThrow();
  });
  it('lehnt krumme Packungen, Fotonamen und Kennungen ab', () => {
    expect(() => eingabePruefen({ ...gut, packung: -5 })).toThrow(/Packung/);
    expect(() => eingabePruefen({ ...gut, foto: '../../geheim.jpg' })).toThrow(/Foto/);
    expect(eingabePruefen({ ...gut, id: 'anders:1' }).id).toBeUndefined();
    expect(eingabePruefen({ ...gut, id: 'bls:C131000' }).id).toBe('bls:C131000');
  });
});
