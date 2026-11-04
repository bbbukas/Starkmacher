/** Vorschläge: Sie füllen Lücken und bleiben immer unter den Grenzen. Alle Beispiele sind erfunden. */
import { describe, expect, it } from 'vitest';
import { bedarfBerechnen, type Bedarf } from '@shared/bedarf';
import { GRUNDWERTE, standardUmrechnung } from '@shared/einheiten';
import { tagesLuecken, tagessumme, type TagebuchEintrag } from '@shared/tagebuch';
import { FREIER_ZUCKER_GRENZE, grenzenAus, hoechstenGramm, mengeFuerVorschlag, taugtAlsVorschlag, typischePortionG, vorschlagen, type Grenze, type VorschlagKandidat } from '@shared/vorschlaege';

const bedarf: Bedarf = bedarfBerechnen({ geschlecht: 'maennlich', alter: 40, groesseCm: 180, gewichtKg: 70, aktivitaet: 'sitzend', sport: false, ziel: 'halten', tempo: 'sanft' });

const kandidat = (id: string, name: string, code: string | null, werte: Record<string, number>, teil: Partial<VorschlagKandidat> = {}): VorschlagKandidat => ({
  id,
  name,
  marke: null,
  herkunft: code ? 'bls' : 'eigen',
  code,
  werte,
  freierZuckerG: 0,
  ...teil,
});

const eintrag = (werte: Record<string, number>, gramm = 100, freierZucker = 0, id = 'e'): TagebuchEintrag => ({
  id,
  datum: '2026-11-04',
  mahlzeit: 'mittag',
  art: 'lebensmittel',
  lebensmittelId: 'x',
  name: 'Testessen',
  marke: null,
  menge: gramm,
  einheit: 'g',
  groesse: null,
  gramm,
  umrechnung: GRUNDWERTE,
  werteJe100g: werte,
  spuren: [],
  freierZuckerJe100g: freierZucker,
  erstelltAm: '2026-11-04T12:00:00.000Z',
});

const SKYR = kandidat('bls:M1', 'Skyr', 'M710100', { ENERCC: 60, PROT625: 11, CA: 120, FAT: 0.2, NACL: 0.1, ID: 10 });
const LACHS = kandidat('bls:T1', 'Lachs gegrillt', 'T100172', { ENERCC: 220, PROT625: 25, FAT: 13, 'F20:5CN3': 0.7, 'F22:6CN3': 1.2, NACL: 0.3, VITD: 16 });
const LINSE = kandidat('bls:G1', 'Linse reif, gekocht', 'G770432', { ENERCC: 110, PROT625: 9, FIBT: 8, FE: 2.5, FOL: 90, NACL: 0 });
const RAPSOEL = kandidat('bls:Q1', 'Rapsöl', 'Q110000', { ENERCC: 900, FAT: 100, 'F18:3CN3': 9, VITE: 25, FASAT: 8 });
const CHIPS = kandidat('bls:K1', 'Kartoffelchips', 'K500000', { ENERCC: 530, FAT: 35, PROT625: 6, NACL: 8, FIBT: 4 }, { freierZuckerG: 0 });
const BESTAND = [SKYR, LACHS, LINSE, RAPSOEL, CHIPS];

const tag = (eintraege: readonly TagebuchEintrag[]) => {
  const summe = tagessumme(eintraege);
  return { summe, luecken: tagesLuecken(summe, bedarf), grenzen: grenzenAus(summe, bedarf) };
};

describe('Grenzen', () => {
  it('Kalorien, freier Zucker und alle Obergrenzen', () => {
    const { grenzen } = tag([eintrag({ ENERCC: 500, NACL: 2 }, 100, 15)]);
    const bleibt = (code: string) => grenzen.find((g) => g.code === code)?.bleibt;
    expect(bleibt('ENERCC')).toBe(bedarf.kcal - 500);
    expect(bleibt(FREIER_ZUCKER_GRENZE)).toBeCloseTo(bedarf.freierZuckerHoechstG - 15, 5);
    expect(bleibt('NACL')).toBe(3);
    expect(bleibt('FASAT')).toBe(bedarf.ziele.FASAT!.hoechst);
    expect(bleibt('RETOL')).toBe(3000);
  });
  it('so viele Gramm passen höchstens', () => {
    const grenzen: Grenze[] = [
      { code: 'ENERCC', bleibt: 100 },
      { code: 'NACL', bleibt: 0.5 },
    ];
    expect(hoechstenGramm(kandidat('a', 'A', null, { ENERCC: 200, NACL: 1 }), grenzen)).toBe(50);
    expect(hoechstenGramm(kandidat('a', 'A', null, { ENERCC: 100, NACL: 0.1 }), grenzen)).toBe(100);
    expect(hoechstenGramm(kandidat('a', 'A', null, { ENERCC: 100 }), [{ code: 'ENERCC', bleibt: -50 }])).toBe(0);
    expect(hoechstenGramm(kandidat('a', 'A', null, { ENERCC: 0 }), [{ code: 'ENERCC', bleibt: -50 }])).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('Nie über einer Grenze', () => {
  // Erfundene Tage und Lebensmittel, mit festem Startwert, damit der Test immer gleich läuft.
  const zufall = (start: number) => {
    let x = start;
    return () => {
      x = (x * 1664525 + 1013904223) % 4294967296;
      return x / 4294967296;
    };
  };
  const CODES = ['ENERCC', 'PROT625', 'FAT', 'FASAT', 'NACL', 'NA', 'FIBT', 'CA', 'FE', 'ZN', 'ID', 'VITC', 'VITB6', 'RETOL', 'VITA', 'VITE', 'F20:5CN3'];

  it('auf 300 erfundenen Tagen hält jeder Vorschlag alle Grenzen ein', () => {
    const r = zufall(42);
    const hoch = { NACL: 5, FASAT: 40, ENERCC: 900, RETOL: 3000, NA: 2000, ZN: 30, ID: 500, VITE: 80, VITB6: 8000 } as Record<string, number>;
    const wert = (code: string) => (r() < 0.2 ? undefined : r() * (hoch[code] ?? 60));
    let geprueft = 0;
    for (let t = 0; t < 300; t++) {
      const kandidaten: VorschlagKandidat[] = [];
      for (let i = 0; i < 40; i++) {
        const werte: Record<string, number> = { ENERCC: r() * 900 };
        for (const c of CODES.slice(1)) {
          const w = wert(c);
          if (w !== undefined) werte[c] = w;
        }
        kandidaten.push(kandidat(`bls:K${i}`, `Stamm${i} roh`, `G${100000 + i}`, werte, { freierZuckerG: r() < 0.3 ? r() * 60 : 0 }));
      }
      const anteil = r() * 1.05; // bis über das Kalorienziel hinaus
      const heute = eintrag({ ENERCC: bedarf.kcal * anteil, NACL: r() * 6, FASAT: r() * 30, RETOL: r() * 2800, ZN: r() * 25, ID: r() * 500, VITE: r() * 200 }, 100, r() * 60);
      const { summe, luecken, grenzen } = tag([heute]);
      for (const v of vorschlagen(kandidaten, luecken, grenzen, { anzahl: 6 })) {
        const k = kandidaten.find((x) => x.id === v.lebensmittelId)!;
        const neu = (code: string) => (summe.werte[code]?.menge ?? 0) + ((k.werte[code] ?? 0) * v.gramm) / 100;
        for (const ziel of Object.values(bedarf.ziele)) {
          if (ziel.hoechst === undefined) continue;
          const vorher = summe.werte[ziel.code]?.menge ?? 0;
          // War die Grenze schon überschritten, darf nichts mehr dazukommen. Sonst bleibt es darunter.
          if (vorher > ziel.hoechst) expect(k.werte[ziel.code] ?? 0, ziel.code).toBe(0);
          else expect(neu(ziel.code), ziel.code).toBeLessThanOrEqual(ziel.hoechst + 1e-9);
        }
        expect(neu('ENERCC')).toBeLessThanOrEqual(bedarf.kcal + 1e-9);
        expect(summe.freierZuckerG.menge + ((k.freierZuckerG ?? 0) * v.gramm) / 100).toBeLessThanOrEqual(Math.max(bedarf.freierZuckerHoechstG, summe.freierZuckerG.menge) + 1e-9);
        geprueft++;
      }
    }
    expect(geprueft).toBeGreaterThan(100); // Der Test prüft wirklich etwas.
  });
  it('sind die Kalorien erreicht, kommt nichts mehr mit Kalorien', () => {
    const { luecken, grenzen } = tag([eintrag({ ENERCC: bedarf.kcal })]);
    expect(vorschlagen(BESTAND, luecken, grenzen)).toEqual([]);
  });
  it('ist das Salz ausgeschöpft, fallen salzige Lebensmittel weg', () => {
    const { luecken, grenzen } = tag([eintrag({ ENERCC: 100, NACL: 5 })]);
    const ids = vorschlagen(BESTAND, luecken, grenzen, { anzahl: 5 }).map((v) => v.lebensmittelId);
    expect(ids).not.toContain('bls:T1');
    expect(ids).not.toContain('bls:K1');
    expect(ids).toContain('bls:G1');
  });
  it('wenig Luft macht die Menge kleiner, statt die Grenze zu reißen', () => {
    const rest = 100;
    const { luecken, grenzen } = tag([eintrag({ ENERCC: bedarf.kcal - rest })]);
    const v = vorschlagen([SKYR], luecken, grenzen)[0]!;
    expect(v.gramm).toBeLessThanOrEqual(150);
    expect(v.kcal).toBeLessThanOrEqual(rest);
  });
  it('lohnt sich die Menge nicht mehr, kein Vorschlag statt „3 g Skyr“', () => {
    const { luecken, grenzen } = tag([eintrag({ ENERCC: bedarf.kcal - 10 })]);
    expect(vorschlagen([SKYR], luecken, grenzen)).toEqual([]);
  });
  it('ohne Kalorienangabe kein Vorschlag, denn die Grenze ließe sich nicht prüfen', () => {
    const { luecken, grenzen } = tag([]);
    expect(vorschlagen([kandidat('a', 'Unbekannt', null, { PROT625: 30 })], luecken, grenzen)).toEqual([]);
  });
});

describe('Was vorgeschlagen wird', () => {
  it('füllt die Lücken und sagt, was es bringt', () => {
    const { luecken, grenzen } = tag([]);
    const liste = vorschlagen(BESTAND, luecken, grenzen);
    expect(liste.length).toBeGreaterThan(0);
    const lachs = liste.find((v) => v.lebensmittelId === 'bls:T1');
    expect(lachs?.wirkung.map((w) => w.text).join(' ')).toMatch(/EPA und DHA|Eiweiß/);
    for (const v of liste) expect(v.wirkung.length).toBeGreaterThan(0);
  });
  it('keine Lücken, keine Vorschläge', () => {
    expect(vorschlagen(BESTAND, [], [])).toEqual([]);
  });
  it('alltagstaugliche Mengen statt 500 g', () => {
    const { luecken, grenzen } = tag([]);
    for (const v of vorschlagen(BESTAND, luecken, grenzen, { anzahl: 5 })) expect(v.gramm).toBeLessThanOrEqual(150);
    expect(typischePortionG('Rapsöl', 'Q110000')).toBe(10);
    expect(typischePortionG('Mein Olivenöl', null)).toBe(10);
    expect(typischePortionG('Walnuss', 'H300000')).toBe(30);
    expect(typischePortionG('Skyr', 'M710100')).toBe(150);
    expect(typischePortionG('Gouda', 'M500000')).toBe(40);
    expect(typischePortionG('Milch fettarm', 'M111200')).toBe(200);
    expect(typischePortionG('Lachs gegrillt', 'T100172')).toBe(125);
    expect(typischePortionG('Irgendwas', null)).toBe(100);
  });
  it('Eigenes und schon Gegessenes kommen eher dran', () => {
    const { luecken, grenzen } = tag([]);
    const fremd = kandidat('bls:M2', 'Quark', 'M720000', SKYR.werte);
    const eigen = kandidat('eigen:1', 'Mein Skyr', null, SKYR.werte);
    expect(vorschlagen([fremd, eigen], luecken, grenzen)[0]?.lebensmittelId).toBe('eigen:1');
    const vertraut = kandidat('bls:M3', 'Magerquark', 'M730000', SKYR.werte, { vertraut: true });
    expect(vorschlagen([fremd, vertraut], luecken, grenzen)[0]?.lebensmittelId).toBe('bls:M3');
  });
  it('Abwechslung: nicht fünfmal Lachs, je Gruppe ein Vorschlag', () => {
    const { luecken, grenzen } = tag([]);
    const lachse = ['gegrillt', 'gedünstet', 'pochiert'].map((art, i) => kandidat(`bls:T${i}`, `Lachs ${art}`, `T10${i}000`, LACHS.werte));
    const fische = ['Hering', 'Makrele', 'Sardine'].map((n, i) => kandidat(`bls:F${i}`, `${n} gegrillt`, `T20${i}000`, LACHS.werte));
    const gemischt = vorschlagen([...lachse, ...fische, LINSE], luecken, grenzen, { anzahl: 5 });
    expect(gemischt).toHaveLength(2);
    expect(gemischt.map((v) => v.name)).toContain('Linse reif, gekocht');
    expect(vorschlagen([...lachse, ...fische], luecken, grenzen, { anzahl: 5 })).toHaveLength(1);
    const eigene = ['Riegel A', 'Shake B', 'Müsli C'].map((n, i) => kandidat(`eigen:${i}`, n, null, SKYR.werte));
    expect(vorschlagen(eigene, luecken, grenzen, { anzahl: 5 })).toHaveLength(2);
  });
  it('sagt zuerst, was man sucht: Eiweiß vor Vitamin B12', () => {
    const { luecken, grenzen } = tag([]);
    const fisch = kandidat('bls:T1', 'Fisch', 'T100000', { ENERCC: 150, PROT625: 25, VITB12: 8 });
    expect(vorschlagen([fisch], luecken, grenzen)[0]?.wirkung[0]?.text).toMatch(/Eiweiß/);
  });
  it('eine kleine Ergänzung darf dabei sein', () => {
    const { luecken, grenzen } = tag([]);
    const liste = vorschlagen(BESTAND, luecken, grenzen, { anzahl: 3 });
    expect(liste).toHaveLength(3);
    const oel = liste.find((v) => v.lebensmittelId === 'bls:Q1');
    expect(oel).toMatchObject({ klein: true, einheit: 'EL', menge: 1 });
  });
});

describe('Menge in Alltagsworten', () => {
  const ei = standardUmrechnung('Hühnerei roh', 'E111100');
  const apfel = standardUmrechnung('Apfel roh', 'F110100');
  const oel = standardUmrechnung('Rapsöl', 'Q110000');
  it('Eier in Stück, höchstens zwei, wenn nach Größe gezählt wird', () => {
    expect(mengeFuerVorschlag(60, ei, 'groesse')).toMatchObject({ menge: 1, einheit: 'Stück', groesse: 'M', gramm: 52 });
    expect(mengeFuerVorschlag(200, ei, 'groesse')).toMatchObject({ menge: 2, gramm: 104 });
    expect(mengeFuerVorschlag(60, ei, 'gramm')).toMatchObject({ einheit: 'g', gramm: 60 });
  });
  it('Obst in Stück, Öl in Löffeln, sonst Gramm', () => {
    expect(mengeFuerVorschlag(150, apfel, 'groesse')).toMatchObject({ menge: 1, einheit: 'Stück', gramm: 140 });
    expect(mengeFuerVorschlag(10, oel, 'groesse')).toMatchObject({ menge: 1, einheit: 'EL', gramm: 10 });
    expect(mengeFuerVorschlag(4.5, oel, 'groesse')).toMatchObject({ menge: 1, einheit: 'TL', gramm: 4 });
    expect(mengeFuerVorschlag(137, GRUNDWERTE, 'groesse')).toMatchObject({ menge: 130, einheit: 'g' });
    expect(mengeFuerVorschlag(47, GRUNDWERTE, 'groesse')).toMatchObject({ menge: 45, einheit: 'g' });
  });
  it('rundet nur ab, damit die schöne Zahl keine Grenze reißt', () => {
    for (const g of [1, 7, 19, 21, 99, 101, 149, 200]) expect(mengeFuerVorschlag(g, GRUNDWERTE, 'groesse')!.gramm).toBeLessThanOrEqual(g);
    expect(mengeFuerVorschlag(0.4, GRUNDWERTE, 'groesse')).toBeNull();
  });
});

describe('Was als Vorschlag taugt', () => {
  it('die Alltagsliste, nichts Exotisches', () => {
    for (const name of ['Skyr, Frischkäse < 10 % Fett i. Tr.', 'Apfel roh', 'Spinat gedünstet', 'Linse reif, gekocht', 'Lachs gegrillt', 'Hühnerei roh', 'Rapsöl/Rüböl', 'Kartoffel geschält, gekocht']) {
      expect(taugtAlsVorschlag(name), name).toBe(true);
    }
    for (const name of ['Lachs roh', 'Hefe Flocken/Nährhefe', 'Kaviar echt (Stör)', 'Hummer gekocht, gegrillt', 'Hähnchen Leber, gekocht', 'Magermilchpulver', 'Linse reif', 'Honig', 'Rotwein', 'Schweinegulasch', 'Apfelsaft', 'Weizen Kleie']) {
      expect(taugtAlsVorschlag(name), name).toBe(false);
    }
  });
});
