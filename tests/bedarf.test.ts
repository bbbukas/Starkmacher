/** Rechnungen für „Mein Bedarf“ (Bauauftrag Abschnitt 4 und 12). Alle Personen sind erfunden. */
import { describe, expect, it } from 'vitest';
import {
  altersgruppe,
  bedarfAusProfil,
  bedarfBerechnen,
  eiweissZiel,
  fehlendeAngaben,
  grundumsatz,
  palWert,
  rechengewichtFuerEiweiss,
  untergrenze,
  zielGeaendert,
  type BedarfEingabe,
} from '@shared/bedarf';
import { leeresProfil, type Profil } from '@shared/profil';
import { HINWEISE_OHNE_ZIEL } from '@shared/referenzwerte';

const person = (teil: Partial<BedarfEingabe> = {}): BedarfEingabe => ({
  geschlecht: 'maennlich',
  alter: 40,
  groesseCm: 180,
  gewichtKg: 71,
  aktivitaet: 'sitzend',
  sport: false,
  ziel: 'halten',
  tempo: 'sanft',
  ...teil,
});

describe('Grundumsatz', () => {
  it('stimmt mit den Beispielen der DGE überein', () => {
    // DGE-FAQ Energie: Frau mit 60 kg und 40 Jahren 1.302 kcal, Mann mit 71 kg und 40 Jahren 1.667 kcal
    expect(Math.round(grundumsatz('weiblich', 60, 40))).toBe(1302);
    expect(Math.round(grundumsatz('maennlich', 71, 40))).toBe(1667);
  });
  it('wächst mit dem Gewicht und sinkt mit dem Alter', () => {
    expect(grundumsatz('weiblich', 70, 40)).toBeGreaterThan(grundumsatz('weiblich', 60, 40));
    expect(grundumsatz('weiblich', 60, 60)).toBeLessThan(grundumsatz('weiblich', 60, 40));
  });
});

describe('Energiebedarf', () => {
  it('PAL-Stufen und Zuschlag für Sport wie bei der DGE', () => {
    expect(palWert('sitzend', false)).toBe(1.4);
    expect(palWert('wechselnd', false)).toBe(1.6);
    expect(palWert('gehend', false)).toBe(1.8);
    expect(palWert('anstrengend', false)).toBe(2.0);
    expect(palWert('sitzend', true)).toBe(1.7);
    expect(palWert('anstrengend', true)).toBe(2.3);
  });
  it('Grundumsatz mal PAL trifft die Tabelle der DGE', () => {
    // Referenzperson 25 bis unter 51 Jahre, PAL 1,4: DGE-Tabelle rund 2.300 bzw. 1.800 kcal
    expect(bedarfBerechnen(person()).gesamtumsatz).toBeCloseTo(2334, -1);
    expect(bedarfBerechnen(person({ geschlecht: 'weiblich', gewichtKg: 60 })).gesamtumsatz).toBeCloseTo(1823, -1);
  });
});

describe('Tempo', () => {
  const eingabe = { gewichtKg: 90, aktivitaet: 'wechselnd' as const };
  const basis = bedarfBerechnen(person(eingabe)).kcal;
  it('Abnehmen: sanft 275, mittel 550 kcal weniger', () => {
    expect(bedarfBerechnen(person({ ...eingabe, ziel: 'abnehmen', tempo: 'sanft' })).kcal).toBe(basis - 275);
    expect(bedarfBerechnen(person({ ...eingabe, ziel: 'abnehmen', tempo: 'mittel' })).kcal).toBe(basis - 550);
  });
  it('Muskeln aufbauen: sanft 5 %, mittel 15 % über dem Verbrauch', () => {
    expect(bedarfBerechnen(person({ ...eingabe, ziel: 'aufbauen', tempo: 'sanft' })).kcal).toBeCloseTo(basis * 1.05, -1);
    expect(bedarfBerechnen(person({ ...eingabe, ziel: 'aufbauen', tempo: 'mittel' })).kcal).toBeCloseTo(basis * 1.15, -1);
  });
});

describe('Untergrenze', () => {
  it('nie unter dem Grundumsatz und nie unter 1.200 bzw. 1.500 kcal', () => {
    expect(untergrenze('weiblich', 1100)).toBe(1200);
    expect(untergrenze('weiblich', 1302)).toBe(1302);
    expect(untergrenze('maennlich', 1400)).toBe(1500);
    expect(untergrenze('maennlich', 1667)).toBe(1667);
  });
  it('hebt ein zu niedriges Abnehm-Ziel an und sagt es', () => {
    // Frau mit 60 kg, 40 Jahre, PAL 1,4, mittel: 1.823 − 550 = 1.273, Grundumsatz 1.302
    const b = bedarfBerechnen(person({ geschlecht: 'weiblich', gewichtKg: 60, ziel: 'abnehmen', tempo: 'mittel' }));
    expect(b.wunschKcal).toBe(1273);
    expect(b.kcal).toBe(1302);
    expect(b.untergrenzeGegriffen).toBe(true);
  });
  it('gilt auch für eigene Werte', () => {
    const b = bedarfBerechnen(person({ ziel: 'eigene', eigeneKcal: 900 }));
    expect(b.kcal).toBe(1667);
    expect(b.wunschKcal).toBe(900);
    expect(b.untergrenzeGegriffen).toBe(true);
  });
  it('greift nicht, solange genug übrig bleibt', () => {
    expect(bedarfBerechnen(person({ gewichtKg: 90, aktivitaet: 'gehend', ziel: 'abnehmen', tempo: 'mittel' })).untergrenzeGegriffen).toBe(false);
  });
});

describe('Makros', () => {
  it('Eiweiß beim Halten: Minimum 0,83 g je kg, Optimum 1,2–1,6 g je kg, geplant mit der Mitte', () => {
    expect(eiweissZiel('halten', false, 40, 70)).toEqual({ minimum: 58, von: 84, bis: 112, gramm: 98 });
    expect(bedarfBerechnen(person({ gewichtKg: 70 })).eiweissG).toBe(98);
    expect(bedarfBerechnen(person({ gewichtKg: 70 })).ziele.PROT625).toMatchObject({ von: 58, optimum: { von: 84, bis: 112 }, art: 'empfehlung', quelle: 'EFSA 2012, NNR 2023' });
  });
  it('Eiweiß ab 65 Jahren: Minimum 1,2 g je kg', () => {
    expect(eiweissZiel('halten', false, 70, 70).minimum).toBe(84);
    expect(eiweissZiel('halten', false, 64, 70).minimum).toBe(58);
  });
  it('Eiweiß bei Sport: Minimum bleibt, Optimum 1,6–2,0 g je kg', () => {
    expect(eiweissZiel('halten', true, 40, 70)).toEqual({ minimum: 58, von: 112, bis: 140, gramm: 126 });
  });
  it('Eiweiß beim Abnehmen und Muskelaufbau: Minimum 1,6 g je kg, Optimum 1,6–2,0 g je kg', () => {
    const hoch = { minimum: 112, von: 112, bis: 140, gramm: 126 };
    expect(eiweissZiel('abnehmen', false, 40, 70)).toEqual(hoch);
    expect(eiweissZiel('aufbauen', false, 40, 70)).toEqual(hoch);
    expect(bedarfBerechnen(person({ gewichtKg: 70, ziel: 'abnehmen' })).ziele.PROT625?.hinweis).toContain('Nieren');
    expect(bedarfBerechnen(person({ gewichtKg: 70 })).ziele.PROT625?.hinweis).toBeUndefined();
    expect(bedarfBerechnen(person({ gewichtKg: 70.4 })).ziele.PROT625?.hinweis).toBeUndefined(); // Rundung ändert daran nichts
  });
  it('das Minimum liegt nie über dem Beginn des Optimums', () => {
    for (const ziel of ['halten', 'abnehmen', 'aufbauen'] as const) {
      for (const sport of [false, true]) {
        for (const alter of [20, 40, 70]) {
          for (const gewichtKg of [50, 70.4, 90, 130]) {
            const z = bedarfBerechnen(person({ ziel, sport, alter, gewichtKg })).ziele;
            for (const code of ['PROT625', 'FAT', 'FIBT']) expect(z[code]!.von!, code).toBeLessThanOrEqual(z[code]!.optimum!.von);
          }
        }
      }
    }
  });
  it('Eiweiß: höchstens mit dem Gewicht bei BMI 25, ohne Sprung', () => {
    expect(rechengewichtFuerEiweiss(70, 180)).toBe(70); // BMI 21,6
    expect(rechengewichtFuerEiweiss(100, 180)).toBeCloseTo(81, 5); // BMI 30,9: gedeckelt
    expect(bedarfBerechnen(person({ gewichtKg: 100, ziel: 'abnehmen' })).eiweissG).toBe(146);
    // Knapp darüber und darunter gibt es keinen Sprung
    const darueber = bedarfBerechnen(person({ gewichtKg: 81.5, ziel: 'abnehmen' })).eiweissG;
    const darunter = bedarfBerechnen(person({ gewichtKg: 80.5, ziel: 'abnehmen' })).eiweissG;
    expect(darueber - darunter).toBeLessThanOrEqual(1);
  });
  it('Fett: 30 %, ab PAL über 1,7 bis 35 %', () => {
    const b = bedarfBerechnen(person());
    expect(b.fettAnteil).toBe(0.3);
    expect(b.fettG).toBe(Math.round((b.kcal * 0.3) / 9));
    expect(bedarfBerechnen(person({ aktivitaet: 'sitzend', sport: true })).fettAnteil).toBe(0.3); // PAL 1,7 genau
    expect(bedarfBerechnen(person({ aktivitaet: 'gehend' })).fettAnteil).toBe(0.35);
  });
  it('Kohlenhydrate sind der Rest und nie negativ', () => {
    const b = bedarfBerechnen(person());
    const summe = b.eiweissG * 4 + b.fettG * 9 + b.kohlenhydrateG * 4 + 40 * 2;
    expect(Math.abs(summe - b.kcal)).toBeLessThanOrEqual(6);
    const wenig = bedarfBerechnen(person({ ziel: 'eigene', eigeneKcal: 1700, gewichtKg: 300, groesseCm: 250 }));
    expect(wenig.kohlenhydrateG).toBeGreaterThanOrEqual(0);
  });
  it('Grenzen und Stufen: gesättigte Fettsäuren und freier Zucker höchstens 10 %, Salz 5 g, Ballaststoffe, Fett', () => {
    const b = bedarfBerechnen(person({ gewichtKg: 90, aktivitaet: 'wechselnd' }));
    expect(b.ziele.FASAT?.hoechst).toBeCloseTo((b.kcal * 0.1) / 9, 0);
    expect(b.freierZuckerHoechstG).toBeCloseTo((b.kcal * 0.1) / 4, 0);
    expect(b.ziele.SUGAR).toBeUndefined(); // Zucker gesamt hat kein Ziel mehr, nur der freie Zucker zählt
    expect(b.ziele.NACL?.hoechst).toBe(5);
    expect(b.ziele.FIBT).toMatchObject({ von: 30, optimum: { von: 40, bis: 50 }, art: 'richtwert', quelle: 'DGE/ÖGE 2021' });
    expect(b.ziele.FAT?.von).toBeCloseTo((b.kcal * 0.25) / 9, 0);
    expect(b.ziele.FAT?.optimum?.von).toBeCloseTo((b.kcal * 0.25) / 9, 0);
    expect(b.ziele.FAT?.optimum?.bis).toBeCloseTo((b.kcal * 0.35) / 9, 0);
    expect(b.ziele.VITC?.optimum).toBeUndefined(); // Vitamine und Mineralstoffe: nur das Minimum
  });
  it('Eigene Werte gelten, wenn sie eingetragen sind', () => {
    const b = bedarfBerechnen(person({ ziel: 'eigene', eigeneKcal: 2000, eigeneEiweissG: 150, eigeneFettG: 60, eigeneKohlenhydrateG: 200 }));
    expect(b).toMatchObject({ kcal: 2000, eiweissG: 150, fettG: 60, kohlenhydrateG: 200, untergrenzeGegriffen: false });
    expect(b.ziele.ENERCC?.art).toBe('eigener-wert');
    expect(b.ziele.PROT625).toMatchObject({ von: 150, art: 'eigener-wert' });
    expect(b.ziele.PROT625?.optimum).toBeUndefined();
    expect(b.ziele.FAT?.optimum).toBeUndefined();
  });
});

describe('Mikronährstoffe nach Alter und Geschlecht', () => {
  it('Altersgruppen der DGE', () => {
    expect([18, 24, 25, 50, 51, 64, 65, 90].map(altersgruppe)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
  it('Werte je Geschlecht', () => {
    const mann = bedarfBerechnen(person()).ziele;
    const frau = bedarfBerechnen(person({ geschlecht: 'weiblich', gewichtKg: 60 })).ziele;
    expect(mann.VITC?.von).toBe(110);
    expect(frau.VITC?.von).toBe(95);
    expect(mann.FE?.von).toBe(11);
    expect(frau.FE?.von).toBe(16);
    expect(mann.ZN?.von).toBe(14);
    expect(frau.ZN?.von).toBe(8);
    expect(mann.CU?.von).toBe(1600);
    expect(frau.CU?.von).toBe(1300);
    expect(mann.ID?.von).toBe(150);
    expect(frau.ID?.von).toBe(150);
    expect(mann.WATER?.von).toBe(2500);
    expect(frau.WATER?.von).toBe(2000);
  });
  it('Werte je Alter', () => {
    const mit = (alter: number) => bedarfBerechnen(person({ alter })).ziele;
    expect(mit(60).VITAA?.von).toBe(850);
    expect(mit(66).VITAA?.von).toBe(800);
    expect(mit(20).CA?.von).toBe(1000);
    expect(mit(40).CA?.von).toBe(950);
    expect(mit(40).VITD?.von).toBe(10);
    expect(mit(70).VITD?.von).toBe(10);
    expect(mit(71).VITD?.von).toBe(20);
    const frau55 = bedarfBerechnen(person({ geschlecht: 'weiblich', gewichtKg: 60, alter: 55 })).ziele;
    expect(frau55.FE?.von).toBe(14);
  });
  it('Vitamin B1 richtet sich nach der Energie: 0,1 mg je Megajoule', () => {
    const b = bedarfBerechnen(person());
    expect(b.ziele.THIA?.von).toBeCloseTo((0.1 * b.kcal) / 239, 2);
    expect(bedarfBerechnen(person({ aktivitaet: 'anstrengend' })).ziele.THIA?.von).toBeGreaterThan(b.ziele.THIA!.von!);
  });
  it('aktualisierte Werte nach dem jüngsten Stand', () => {
    const z = bedarfBerechnen(person()).ziele;
    expect(z.K?.von).toBe(3500);
    expect(z.FOL?.von).toBe(330);
    expect(z.RIBF?.von).toBe(1.6);
    expect(z.VITK?.von).toBe(70);
    expect(z.MN?.von).toBe(3000);
    expect(z.MO?.von).toBe(65);
    expect(z.CLD?.von).toBe(3100);
    expect(z.VITE?.von).toBe(8);
    expect(z.P?.von).toBe(550);
  });
  it('Chrom hat kein Ziel, weil nicht belegt ist, dass der Körper es braucht', () => {
    expect(bedarfBerechnen(person()).ziele.CR).toBeUndefined();
    expect(HINWEISE_OHNE_ZIEL.CR).toContain('EFSA');
  });
  it('Salz höchstens 5 g, Natrium höchstens 2 g', () => {
    const z = bedarfBerechnen(person()).ziele;
    expect(z.NACL?.hoechst).toBe(5);
    expect(z.NA).toMatchObject({ art: 'hoechstwert', hoechst: 2000 });
    expect(z.NA?.von).toBeUndefined();
  });
  it('jedes Ziel nennt seine Quelle', () => {
    for (const z of Object.values(bedarfBerechnen(person()).ziele)) expect(z.quelle, z.code).toBeTruthy();
  });
  it('unterscheidet Empfehlung, Schätzwert, Richtwert und Höchstwert', () => {
    const z = bedarfBerechnen(person()).ziele;
    expect(z.VITC?.art).toBe('empfehlung');
    expect(z.VITE?.art).toBe('schaetzwert');
    expect(z.FAMS?.art).toBe('richtwert');
    expect(z.FIBT?.art).toBe('richtwert');
    expect(z.NACL?.art).toBe('hoechstwert');
    expect(z.CA).toMatchObject({ von: 950, hoechst: 2500, hoechstArt: 'hoechstwert' });
    expect(z.FE).toMatchObject({ von: 11, hoechst: 40, hoechstArt: 'sichere-menge' });
    expect(z.CU).toMatchObject({ von: 1600, hoechst: 5000 });
  });
  it('was man nicht gezielt essen muss, gilt nicht als Lücke', () => {
    const z = bedarfBerechnen(person()).ziele;
    expect(z.VITD?.keineLuecke).toBe(true);
    expect(z.FD?.keineLuecke).toBe(true);
    expect(z.CLD?.keineLuecke).toBe(true);
    expect(z.WATER?.keineLuecke).toBe(true);
    expect(z.VITC?.keineLuecke).toBeUndefined();
  });
  it('Magnesium hat keinen Höchstwert, Retinol nur einen', () => {
    const z = bedarfBerechnen(person()).ziele;
    expect(z.MG?.hoechst).toBeUndefined();
    expect(z.RETOL).toMatchObject({ art: 'hoechstwert', hoechst: 3000 });
    expect(z.RETOL?.von).toBeUndefined();
  });
  it('Fettsäuren als Anteil der Energie', () => {
    const b = bedarfBerechnen(person({ ziel: 'eigene', eigeneKcal: 2250 }));
    expect(b.ziele['F18:2CN6']?.von).toBeCloseTo(6.3, 1);
    expect(b.ziele['F18:3CN3']?.von).toBeCloseTo(1.3, 1);
    expect(b.ziele.FAPUN3?.von).toBeCloseTo(2.5, 1);
    expect(b.ziele.FAMS).toMatchObject({ von: 25, bis: 50 });
    expect(b.ziele.FAPU).toMatchObject({ von: 12.5, bis: 25 });
  });
});

describe('Aus dem Profil', () => {
  const profil: Profil = { ...leeresProfil(), geschlecht: 'maennlich', geburtsjahr: 1986, groesseCm: 180, aktivitaet: 'sitzend', ziel: 'halten' };
  const gewichte = [
    { datum: '2026-01-10', kg: 80 },
    { datum: '2026-10-10', kg: 71 },
    { datum: '2026-05-10', kg: 75 },
  ];
  it('nimmt das neueste Gewicht, egal in welcher Reihenfolge', () => {
    expect(bedarfAusProfil(profil, gewichte, 2026)?.grundumsatz).toBe(1667);
  });
  it('das Alter erhöht sich von selbst', () => {
    const jetzt = bedarfAusProfil(profil, gewichte, 2026)!;
    const spaeter = bedarfAusProfil(profil, gewichte, 2030)!;
    expect(spaeter.grundumsatz).toBeLessThan(jetzt.grundumsatz);
  });
  it('rechnet nicht, solange etwas fehlt, und sagt was', () => {
    expect(bedarfAusProfil(leeresProfil(), [], 2026)).toBeNull();
    expect(fehlendeAngaben(leeresProfil(), [])).toEqual(['Geschlecht', 'Geburtsjahr', 'Größe', 'Gewicht', 'Aktivität', 'Ziel']);
    expect(fehlendeAngaben(profil, gewichte)).toEqual([]);
    expect(fehlendeAngaben({ ...profil, ziel: 'eigene' }, gewichte)).toEqual(['Kalorien']);
  });
  it('merkt, wenn sich der Bedarf ändert', () => {
    expect(zielGeaendert(null, { kcal: 2000, eiweissG: 60 })).toBe(false);
    expect(zielGeaendert({ kcal: 2000, eiweissG: 60 }, { kcal: 2000, eiweissG: 60 })).toBe(false);
    expect(zielGeaendert({ kcal: 2000, eiweissG: 60 }, { kcal: 1980, eiweissG: 60 })).toBe(true);
    expect(zielGeaendert({ kcal: 2000, eiweissG: 60 }, { kcal: 2000, eiweissG: 58 })).toBe(true);
  });
});
