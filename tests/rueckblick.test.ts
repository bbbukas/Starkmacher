/** Der Rückblick und die Achse der Gewichtskurve. Alle Beispiele sind erfunden. */
import { describe, expect, it } from 'vitest';
import { bedarfBerechnen, type Bedarf } from '@shared/bedarf';
import { GRUNDWERTE } from '@shared/einheiten';
import type { Lebensmittel, Werte } from '@shared/lebensmittel';
import { ganzImZiel, gewichtsAchse, rueckblickLage, rueckblickRechnen, rueckblickSaetze, schnittPasst, schnittText, startZeitraum, zeitraumAbruf, zeitraumDaneben, zeitraumTitel, zeitraumUm, type Rueckblick } from '@shared/rueckblick';
import { eintragAnlegen, type TagebuchEintrag } from '@shared/tagebuch';

const bedarf: Bedarf = bedarfBerechnen({ geschlecht: 'maennlich', alter: 40, groesseCm: 180, gewichtKg: 70, aktivitaet: 'sitzend', sport: false, ziel: 'halten', tempo: 'sanft', kcalManuell: null, makrosManuell: null } as never);
const HEUTE = '2026-12-01';

const lm = (werte: Werte, name = 'Testessen'): Lebensmittel => ({
  id: 'eigen:1',
  herkunft: 'eigen',
  name,
  marke: null,
  gruppe: null,
  basis: 'g',
  werte,
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
});

/** Ein Eintrag von 100 g: Die Werte sind genau die gegessene Menge. */
const am = (datum: string, werte: Werte, name?: string): TagebuchEintrag => eintragAnlegen(lm(werte, name), { datum, mahlzeit: 'mittag', lebensmittelId: 'eigen:1', menge: 100, einheit: 'g', groesse: null }, `${datum}-${Math.random()}`, `${datum}T12:00:00.000Z`);

const WOCHE = zeitraumUm('woche', '2026-11-04');
const zeile = (r: Rueckblick, code: string) => r.zeilen.find((z) => z.code === code)!;
const rechnen = (e: readonly TagebuchEintrag[], z = WOCHE, heute = HEUTE, aus: readonly string[] = []) => rueckblickRechnen(e, z, bedarf, aus, heute);

describe('Der Zeitraum', () => {
  it('die Woche läuft von Montag bis Sonntag', () => {
    expect(WOCHE).toMatchObject({ von: '2026-11-02', bis: '2026-11-08' });
    expect(WOCHE.tage).toHaveLength(7);
  });
  it('der Monat ist der Kalendermonat, auch im Schaltjahr', () => {
    expect(zeitraumUm('monat', '2026-11-15')).toMatchObject({ von: '2026-11-01', bis: '2026-11-30' });
    expect(zeitraumUm('monat', '2028-02-10').tage).toHaveLength(29);
  });
  it('blättert vor und zurück', () => {
    expect(zeitraumDaneben(WOCHE, -1).von).toBe('2026-10-26');
    expect(zeitraumDaneben(WOCHE, 1).von).toBe('2026-11-09');
    expect(zeitraumDaneben(zeitraumUm('monat', '2026-01-15'), -1).von).toBe('2025-12-01');
  });
  it('am Montag steht die letzte Woche am Anfang, am 1. der letzte Monat', () => {
    expect(startZeitraum('woche', '2026-11-02').von).toBe('2026-10-26');
    expect(startZeitraum('woche', '2026-11-03').von).toBe('2026-11-02');
    expect(startZeitraum('monat', '2026-11-01').von).toBe('2026-10-01');
    expect(startZeitraum('monat', '2026-11-02').von).toBe('2026-11-01');
  });
  it('hat einen lesbaren Titel', () => {
    expect(zeitraumTitel(WOCHE, HEUTE)).toBe('2. bis 8. November');
    expect(zeitraumTitel(zeitraumUm('woche', '2026-10-01'), HEUTE)).toBe('28. September bis 4. Oktober');
    expect(zeitraumTitel(zeitraumUm('woche', '2025-11-05'), HEUTE)).toBe('3. bis 9. November 2025');
    expect(zeitraumTitel(zeitraumUm('monat', '2026-11-15'), HEUTE)).toBe('November 2026');
  });
});

describe('Welche Tage zählen', () => {
  it('nur Tage mit Einträgen, und die Anzahl steht dabei', () => {
    const r = rechnen([am('2026-11-02', { PROT625: 100 }), am('2026-11-03', { PROT625: 50 })]);
    expect(r.tage).toBe(2);
    expect(zeile(r, 'PROT625').schnitt).toBe(75);
  });
  it('zwei Einträge am selben Tag sind ein Tag', () => {
    const r = rechnen([am('2026-11-02', { PROT625: 60 }), am('2026-11-02', { PROT625: 40 })]);
    expect(r.tage).toBe(1);
    expect(zeile(r, 'PROT625').schnitt).toBe(100);
  });
  it('der heutige Tag zählt noch nicht, das Programm sagt es aber', () => {
    const r = rechnen([am('2026-11-02', { PROT625: 100 }), am('2026-11-04', { PROT625: 1 })], WOCHE, '2026-11-04');
    expect(r.tage).toBe(1);
    expect(r.heuteLaeuft).toBe(true);
    expect(zeile(r, 'PROT625').schnitt).toBe(100);
  });
  it('auch keine Tage in der Zukunft und nichts außerhalb des Zeitraums', () => {
    const r = rechnen([am('2026-11-05', { PROT625: 100 }), am('2026-11-01', { PROT625: 100 })], WOCHE, '2026-11-04');
    expect(r).toMatchObject({ tage: 0, heuteLaeuft: false });
  });
  it('ein leerer Zeitraum geht ohne Fehler', () => {
    const r = rechnen([]);
    expect(r.tage).toBe(0);
    expect(zeile(r, 'PROT625').schnitt).toBe(0);
  });
});

const eiweissMinimum = bedarf.ziele.PROT625!.von!;
const eiweissOptimum = bedarf.ziele.PROT625!.optimum!.von;

describe('Was jeden Tag zählt', () => {
  it('zählt Tage im Ziel und im Optimum', () => {
    const r = rechnen([am('2026-11-02', { PROT625: eiweissOptimum }), am('2026-11-03', { PROT625: eiweissMinimum }), am('2026-11-04', { PROT625: 1 })]);
    const z = zeile(r, 'PROT625');
    expect(z).toMatchObject({ bewertung: 'tage', imZiel: 2, anzahl: 3, imOptimum: 1, zuWenig: false });
    expect(rueckblickLage(z)).toBe('an 2 von 3 Tagen Minimum erreicht, an 1 im Optimum');
  });
  it('meistens zu wenig heißt: an mehr als der Hälfte der Tage', () => {
    expect(zeile(rechnen([am('2026-11-02', { FIBT: 1 }), am('2026-11-03', { FIBT: 1 }), am('2026-11-04', { FIBT: 40 })]), 'FIBT').zuWenig).toBe(true);
    expect(zeile(rechnen([am('2026-11-02', { FIBT: 1 }), am('2026-11-03', { FIBT: 40 })]), 'FIBT').zuWenig).toBe(false);
  });
  it('Kalorien: im Plan, wenn sie auf 10 % stimmen. Sie gelten nie als Lücke.', () => {
    const kcal = bedarf.kcal;
    const z = zeile(rechnen([am('2026-11-02', { ENERCC: kcal * 1.05 }), am('2026-11-03', { ENERCC: kcal * 0.5 }), am('2026-11-04', { ENERCC: kcal * 1.5 })]), 'ENERCC');
    expect(z).toMatchObject({ bewertung: 'plan', imZiel: 1, anzahl: 3, zuWenig: false, zuViel: false });
    expect(rueckblickLage(z)).toContain('im Plan');
  });
  it('Kohlenhydrate sind der Rest und werden nicht bewertet', () => {
    expect(zeile(rechnen([am('2026-11-02', { CHO: 1 })]), 'CHO')).toMatchObject({ bewertung: 'keine', zuWenig: false });
  });
});

describe('Grenzen', () => {
  it('Salz: Tage unter der Grenze, und meistens drüber fällt auf', () => {
    const z = zeile(rechnen([am('2026-11-02', { NACL: 9 }), am('2026-11-03', { NACL: 8 }), am('2026-11-04', { NACL: 1 })]), 'NACL');
    expect(z).toMatchObject({ bewertung: 'grenze', imZiel: 1, anzahl: 3, zuViel: true });
    expect(rueckblickLage(z)).toBe('an 1 von 3 Tagen unter der Grenze');
    expect(schnittText(z)).toBe('Ø 6 g bis 5 g');
  });
  it('freier Zucker zählt auch', () => {
    const e = { ...am('2026-11-02', {}), freierZuckerJe100g: bedarf.freierZuckerHoechstG + 10 };
    const z = zeile(rechnen([e]), 'FREIER_ZUCKER');
    expect(z).toMatchObject({ bewertung: 'grenze', imZiel: 0, zuViel: true });
  });
});

const CA = bedarf.ziele.CA!.von!;

describe('Was im Schnitt der Woche zählt', () => {
  it('wird nach Wochen bewertet, nicht nach Tagen: Ein starker Tag reicht für den Schnitt', () => {
    const r = rechnen([am('2026-11-02', { CA: CA * 2 }), am('2026-11-03', { CA: 0 })]);
    const z = zeile(r, 'CA');
    expect(z).toMatchObject({ bewertung: 'wochen', imZiel: 1, anzahl: 1, zuWenig: false });
    expect(rueckblickLage(z)).toBe('im Schnitt der Woche erreicht');
    expect(ganzImZiel(z)).toBe(true);
  });
  it('zu niedrig fällt auf, und kleine Abweichungen zählen nicht', () => {
    expect(zeile(rechnen([am('2026-11-02', { CA: CA * 0.5 })]), 'CA')).toMatchObject({ imZiel: 0, zuWenig: true });
    const knapp = zeile(rechnen([am('2026-11-02', { CA: CA * 0.95 })]), 'CA');
    expect(knapp).toMatchObject({ imZiel: 0, zuWenig: false });
    expect(rueckblickLage(knapp)).toBe('im Schnitt der Woche unter dem Ziel');
  });
  it('EPA und DHA genauso', () => {
    const fisch = am('2026-11-02', { 'F20:5CN3': 0.5, 'F22:6CN3': 0.5 });
    expect(zeile(rechnen([fisch, am('2026-11-03', {}), am('2026-11-04', {})]), 'EPA_DHA')).toMatchObject({ bewertung: 'wochen', imZiel: 1 });
  });
  it('im Monat zählt jede Woche einzeln', () => {
    const monat = zeitraumUm('monat', '2026-11-15');
    // 2. bis 8. November reicht, die Woche danach nicht, in der Woche danach wieder.
    const r = rechnen([am('2026-11-02', { CA: CA * 2 }), am('2026-11-09', { CA: CA * 0.2 }), am('2026-11-16', { CA: CA * 0.2 }), am('2026-11-23', { CA })], monat);
    const z = zeile(r, 'CA');
    expect(r.wochen).toBe(4);
    expect(z).toMatchObject({ bewertung: 'wochen', imZiel: 2, anzahl: 4, zuWenig: false });
    expect(rueckblickLage(z)).toBe('in 2 von 4 Wochen erreicht');
    const meist = rechnen([am('2026-11-02', { CA }), am('2026-11-09', { CA: 0 }), am('2026-11-16', { CA: 0 })], monat);
    expect(zeile(meist, 'CA').zuWenig).toBe(true);
  });
  it('eine Woche am Monatsrand zählt ganz, sonst entschiede ein einziger Tag über sie', () => {
    const monat = zeitraumUm('monat', '2026-11-15');
    // Der 1. November ist ein Sonntag: Am Montag davor gab es reichlich, am Sonntag nichts.
    const r = rechnen([am('2026-10-26', { CA: CA * 2 }), am('2026-11-01', { CA: 0 })], monat);
    expect(r.tage).toBe(1);
    expect(r.wochen).toBe(1);
    // Der Durchschnitt bleibt beim Monat, die Bewertung kennt die ganze Woche.
    expect(zeile(r, 'CA')).toMatchObject({ schnitt: 0, imZiel: 1, anzahl: 1, zuWenig: false });
  });
  it('eine Woche ganz außerhalb des Monats zählt nicht', () => {
    const monat = zeitraumUm('monat', '2026-11-15');
    const r = rechnen([am('2026-10-19', { CA: CA * 2 }), am('2026-11-02', { CA: CA * 0.2 })], monat);
    expect(r.wochen).toBe(1);
    expect(zeile(r, 'CA')).toMatchObject({ imZiel: 0, anzahl: 1, zuWenig: true });
  });
  it('nebenan zählt der heutige Tag auch nicht', () => {
    const monat = zeitraumUm('monat', '2026-10-15');
    // Heute ist der 1. November, der Sonntag der letzten Oktoberwoche.
    const r = rechnen([am('2026-10-31', { CA: CA * 0.2 }), am('2026-11-01', { CA: CA * 9 })], monat, '2026-11-01');
    expect(zeile(r, 'CA')).toMatchObject({ imZiel: 0, anzahl: 1 });
  });
  it('holt die ganzen Wochen an den Rändern, und das bleibt unter der Grenze des Dienstes', () => {
    expect(zeitraumAbruf(zeitraumUm('monat', '2026-11-15'))).toEqual({ von: '2026-10-26', bis: '2026-12-06' });
    expect(zeitraumAbruf(WOCHE)).toEqual({ von: WOCHE.von, bis: WOCHE.bis });
    for (let monat = 1; monat <= 12; monat++) {
      const { von, bis } = zeitraumAbruf(zeitraumUm('monat', `2027-${String(monat).padStart(2, '0')}-15`));
      expect((new Date(`${bis}T12:00:00`).getTime() - new Date(`${von}T12:00:00`).getTime()) / 86_400_000).toBeLessThanOrEqual(62);
    }
  });
});

describe('Die Kopfzeile einer Gruppe', () => {
  const kcal = bedarf.ziele.ENERCC!.von!;
  const passt = (menge: number) => schnittPasst(zeile(rechnen([am('2026-11-02', { ENERCC: menge })]), 'ENERCC'));
  it('Kalorien passen nur ungefähr getroffen, viel zu viel ist kein Erfolg', () => {
    expect(passt(kcal)).toBe(true);
    expect(passt(kcal * 0.95)).toBe(true);
    expect(passt(kcal * 1.05)).toBe(true);
    expect(passt(kcal * 0.8)).toBe(false);
    expect(passt(kcal * 1.5)).toBe(false);
  });
  it('alles andere nach seiner Stufe', () => {
    expect(schnittPasst(zeile(rechnen([am('2026-11-02', { PROT625: eiweissMinimum })]), 'PROT625'))).toBe(true);
    expect(schnittPasst(zeile(rechnen([am('2026-11-02', { PROT625: eiweissMinimum / 2 })]), 'PROT625'))).toBe(false);
    expect(schnittPasst(zeile(rechnen([am('2026-11-02', { NACL: 1 })]), 'NACL'))).toBe(true);
    expect(schnittPasst(zeile(rechnen([am('2026-11-02', { NACL: 20 })]), 'NACL'))).toBe(false);
  });
});

describe('Vitamin D und Co.', () => {
  it('sind nie eine Lücke, auch hier nicht', () => {
    const r = rechnen([am('2026-11-02', {})]);
    for (const code of ['VITD', 'FD', 'CLD', 'WATER']) {
      expect(zeile(r, code), code).toMatchObject({ bewertung: 'keine', zuWenig: false });
      expect(rueckblickLage(zeile(r, code)), code).not.toBe('');
    }
  });
  it('Nährstoffe ohne Ziel: nur der Durchschnitt', () => {
    const z = zeile(rechnen([am('2026-11-02', { LACS: 5 })]), 'LACS');
    expect(z).toMatchObject({ bewertung: 'keine', ziel: null, schnitt: 5 });
    expect(schnittText(z)).toBe('Ø 5 g');
  });
  it('Ausgeblendetes fehlt ganz', () => {
    const r = rechnen([am('2026-11-02', {})], WOCHE, HEUTE, ['ID', 'SUGAR', 'F20:5CN3']);
    for (const code of ['ID', 'SUGAR', 'FREIER_ZUCKER', 'EPA_DHA']) expect(zeile(r, code), code).toBeUndefined();
  });
  it('merkt sich, wo Angaben fehlen', () => {
    expect(zeile(rechnen([am('2026-11-02', {}, 'Ohne Calcium')]), 'CA').fehltBei).toEqual(['Ohne Calcium']);
  });
});

describe('Was meistens fehlte', () => {
  it('nennt Wochenwerte und Tageswerte getrennt, Eiweiß vorn', () => {
    const r = rechnen([am('2026-11-02', {})]);
    const [tage, wochen] = rueckblickSaetze(r, 'woche');
    expect(tage).toMatch(/^An den meisten Tagen zu wenig: Eiweiß, Ballaststoffe/);
    expect(wochen).toMatch(/^In dieser Woche zu niedrig: /);
    expect(wochen).toMatch(/und \d+ weitere Werte\.$/);
  });
  it('im Monat: die meisten Wochen', () => {
    const monat = zeitraumUm('monat', '2026-11-15');
    const r = rechnen([am('2026-11-02', {}), am('2026-11-09', {})], monat);
    expect(rueckblickSaetze(r, 'monat').join(' ')).toContain('In den meisten Wochen zu niedrig: ');
  });
  it('sagt, was über der Grenze lag', () => {
    expect(rueckblickSaetze(rechnen([am('2026-11-02', { NACL: 20 })]), 'woche').join(' ')).toContain('über der Grenze: Salz');
  });
  it('und wenn alles passt, darf man das sehen', () => {
    const satt: Record<string, number> = { 'F20:5CN3': 0.3, 'F22:6CN3': 0.3, SUGAR: 1 };
    for (const z of Object.values(bedarf.ziele)) {
      if (z.von !== undefined) satt[z.code] = z.optimum ? z.optimum.von : z.von;
    }
    expect(rueckblickSaetze(rechnen([am('2026-11-02', satt)]), 'woche')).toEqual(['Nichts hat meistens gefehlt. Stark!']);
  });
});

describe('Die Achse der Gewichtskurve', () => {
  it('runde Werte, die alles zeigen', () => {
    const a = gewichtsAchse([70.2, 74.8]);
    expect(a.von).toBeLessThanOrEqual(70.2);
    expect(a.bis).toBeGreaterThanOrEqual(74.8);
    for (const s of a.striche) expect(s % 0.5).toBe(0);
    expect(a.striche.length).toBeGreaterThanOrEqual(3);
    expect(a.striche.length).toBeLessThanOrEqual(7);
  });
  it('kleine Schwankungen sehen nicht wie ein Absturz aus: mindestens 2 kg hoch', () => {
    const a = gewichtsAchse([70, 70.2]);
    expect(a.bis - a.von).toBeGreaterThanOrEqual(2);
  });
  it('ein einziger Wert und gar keiner gehen auch', () => {
    const a = gewichtsAchse([70]);
    expect(a.von).toBeLessThan(70);
    expect(a.bis).toBeGreaterThan(70);
    expect(gewichtsAchse([]).striche).toEqual([]);
  });
  it('große Spannen bekommen größere Schritte', () => {
    const a = gewichtsAchse([60, 120]);
    expect(a.striche.length).toBeLessThanOrEqual(7);
    expect(a.striche[1]! - a.striche[0]!).toBeGreaterThanOrEqual(10);
  });
});
