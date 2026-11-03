/** Die Liste der Nährstoffe und die Referenzwerte passen zueinander. */
import { describe, expect, it } from 'vitest';
import { bedarfBerechnen } from '@shared/bedarf';
import { mengeText, tagText, zahlLesen, zahlText, zielText } from '@shared/format';
import { GRUPPEN, NAEHRSTOFFE, naehrstoff, naehrstoffeDerGruppe } from '@shared/naehrstoffe';
import { HOECHSTWERTE, REFERENZWERTE } from '@shared/referenzwerte';

describe('Nährstoffe', () => {
  it('sind die 138 des BLS, jeder genau einmal', () => {
    expect(NAEHRSTOFFE).toHaveLength(138);
    expect(new Set(NAEHRSTOFFE.map((n) => n.code)).size).toBe(138);
  });
  it('alle gehören zu einer der neun Gruppen', () => {
    expect(GRUPPEN).toHaveLength(9);
    const anzahl = GRUPPEN.map((g) => naehrstoffeDerGruppe(g.id).length);
    expect(anzahl).toEqual([2, 6, 11, 7, 36, 19, 29, 16, 12]);
  });
});

describe('Referenzwerte', () => {
  it('alle gehören zu einem Nährstoff aus der Liste', () => {
    for (const r of REFERENZWERTE) expect(naehrstoff(r.code), r.code).toBeDefined();
    for (const h of HOECHSTWERTE) expect(naehrstoff(h.code), h.code).toBeDefined();
  });
  it('jedes Ziel gehört zu einem Nährstoff aus der Liste', () => {
    const b = bedarfBerechnen({ geschlecht: 'weiblich', alter: 30, groesseCm: 165, gewichtKg: 60, aktivitaet: 'sitzend', sport: false, ziel: 'halten', tempo: 'sanft' });
    for (const code of Object.keys(b.ziele)) expect(naehrstoff(code), code).toBeDefined();
  });
  it('alle wichtigen Vitamine und Mineralstoffe haben ein Ziel', () => {
    const b = bedarfBerechnen({ geschlecht: 'maennlich', alter: 30, groesseCm: 180, gewichtKg: 75, aktivitaet: 'sitzend', sport: false, ziel: 'halten', tempo: 'sanft' });
    for (const code of ['VITAA', 'VITD', 'VITE', 'VITK', 'VITC', 'THIA', 'RIBF', 'NIAEQ', 'PANTAC', 'VITB6', 'BIOT', 'FOL', 'VITB12', 'CA', 'MG', 'K', 'NA', 'CLD', 'P', 'FE', 'ZN', 'ID', 'CU', 'MN', 'FD', 'CR', 'MO']) {
      expect(b.ziele[code], code).toBeDefined();
    }
  });
  it('Spannen sind von klein nach groß, Höchstwerte liegen über dem Ziel', () => {
    for (const r of REFERENZWERTE) if (r.bis !== undefined) expect(r.bis, r.code).toBeGreaterThan(r.maennlich as number);
    const b = bedarfBerechnen({ geschlecht: 'maennlich', alter: 30, groesseCm: 180, gewichtKg: 75, aktivitaet: 'sitzend', sport: false, ziel: 'halten', tempo: 'sanft' });
    for (const z of Object.values(b.ziele)) if (z.von !== undefined && z.hoechst !== undefined) expect(z.hoechst, z.code).toBeGreaterThan(z.von);
  });
});

describe('Anzeige', () => {
  const vitC = naehrstoff('VITC')!;
  const b6 = naehrstoff('VITB6')!;
  const kupfer = naehrstoff('CU')!;
  const salz = naehrstoff('NACL')!;
  const kalorien = naehrstoff('ENERCC')!;

  it('deutsches Zahlenformat', () => {
    expect(zahlText(2250)).toBe('2.250');
    expect(zahlText(1.25, 2)).toBe('1,25');
  });
  it('sinnvoll gerundet, ohne Scheingenauigkeit', () => {
    expect(mengeText(2249.7, kalorien)).toBe('2.250 kcal');
    expect(mengeText(6.33, salz)).toBe('6,3 g');
    expect(mengeText(92.4, vitC)).toBe('92 mg');
    expect(mengeText(9.24, vitC)).toBe('9,2 mg');
  });
  it('zeigt in mg, wo der BLS µg führt', () => {
    expect(mengeText(1600, b6)).toBe('1,6 mg');
    expect(mengeText(12000, b6)).toBe('12 mg');
  });
  it('Ziele in Worten', () => {
    expect(zielText({ code: 'VITC', art: 'empfehlung', von: 110 }, vitC)).toBe('110 mg');
    expect(zielText({ code: 'CU', art: 'schaetzwert', von: 1000, bis: 1500 }, kupfer)).toBe('1–1,5 mg');
    expect(zielText({ code: 'NACL', art: 'hoechstwert', hoechst: 6 }, salz)).toBe('höchstens 6 g');
    expect(zielText(undefined, salz)).toBeNull();
  });
  it('liest Zahlen mit Komma oder Punkt, Unsinn wird nichts', () => {
    expect(zahlLesen('72,5')).toBe(72.5);
    expect(zahlLesen(' 72.5 ')).toBe(72.5);
    expect(zahlLesen('180')).toBe(180);
    expect(zahlLesen('')).toBeNull();
    expect(zahlLesen('abc')).toBeNull();
    expect(zahlLesen('-5')).toBeNull();
    expect(zahlLesen('1,2,3')).toBeNull();
  });
  it('Tag in Worten', () => {
    expect(tagText(new Date(2026, 10, 3))).toBe('Dienstag, 3. November');
  });
});
