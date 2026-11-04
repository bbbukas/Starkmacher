/** Fotos auslesen (Bauauftrag Abschnitt 12): Nährwerttabelle, Rezept, Barcode. Alle Beispiele und Testbilder sind erfunden. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { barcodeAusFoto, barcodeGueltig, barcodeSchluessel, packungAus } from '@shared/barcode';
import { bildArt } from '@shared/bildArt';
import { abstand, enthaeltWort, schieflage, zeilenOrdnen, type FotoLesung, type TextStueck } from '@shared/fotoText';
import { aufHundert, tabelleLesen } from '@shared/naehrwertFoto';
import { rezeptLesen, schritteBauen, textSaeubern, zutatLesen, zutatSuchen } from '@shared/rezeptFoto';
import { fotoEinlesen } from '../src/main/fotos';
import { sehenOeffnen } from '../src/main/sehen';

/** Baut Textstücke wie aus dem Hilfsprogramm: Jede Zeile eine Liste von [x, Text]. */
function stuecke(zeilen: readonly (readonly (readonly [number, string])[])[], schief = 0): TextStueck[] {
  const aus: TextStueck[] = [];
  zeilen.forEach((zeile, i) => {
    for (const [x, text] of zeile) {
      const b = Math.min(0.4, text.length * 0.012);
      aus.push({ text, x, y: 0.05 + i * 0.05 + schief * (x + b / 2), b, h: 0.03, steigung: b > 0.05 ? schief : 0, sicher: 1 });
    }
  });
  return aus;
}

describe('Zeilen ordnen', () => {
  it('gerade: von oben nach unten, in der Zeile von links nach rechts', () => {
    const z = zeilenOrdnen(stuecke([[[0.5, 'rechts'], [0.1, 'links']], [[0.1, 'unten']]]));
    expect(z.map((s) => s.map((x) => x.text))).toEqual([['links', 'rechts'], ['unten']]);
  });
  it('schief: Die Schieflage verrutscht keine Zeile', () => {
    const roh = stuecke(
      [
        [[0.05, 'Fett'], [0.6, '11,6 g']],
        [[0.05, 'Salz'], [0.6, '0,5 g']],
      ],
      0.1,
    );
    expect(schieflage(roh)).toBeCloseTo(0.1);
    expect(zeilenOrdnen(roh).map((s) => s.map((x) => x.text))).toEqual([['Fett', '11,6 g'], ['Salz', '0,5 g']]);
  });
  it('vergleicht Wörter mit einem Lesefehler je fünf Buchstaben', () => {
    expect(abstand('eiweiss', 'eiweifs')).toBe(1);
    expect(enthaeltWort('Kohlenhvdrate', 'kohlenhydrat')).toBe(true);
    expect(enthaeltWort('Ballaststofe', 'ballaststoff')).toBe(true);
    expect(enthaeltWort('Eiweiß', 'eiweiss')).toBe(true);
    expect(enthaeltWort('Zutaten', 'kohlenhydrat')).toBe(false);
  });
});

const JE_100_UND_PORTION = stuecke([
  [[0.05, 'Nährwerte'], [0.45, 'pro 100 g'], [0.7, 'pro Portion (40 g)'], [0.9, '% RM*']],
  [[0.05, 'Brennwert'], [0.45, '1523 kJ / 364 kcal'], [0.7, '609 kJ / 146 kcal'], [0.9, '7 %']],
  [[0.05, 'Fett'], [0.45, '11,6 g'], [0.7, '4,6 g'], [0.9, '7 %']],
  [[0.08, 'davon gesättigte Fettsäuren'], [0.45, '3,5 g'], [0.7, '1,4 g'], [0.9, '7 %']],
  [[0.05, 'Kohlenhydrate'], [0.45, '55 g'], [0.7, '22 g'], [0.9, '8 %']],
  [[0.08, 'davon Zucker'], [0.45, '12 g'], [0.7, '4,8 g'], [0.9, '5 %']],
  [[0.05, 'Ballaststoffe'], [0.45, '6,2 g'], [0.7, '2,5 g']],
  [[0.05, 'Eiweiß'], [0.45, '8,4 g'], [0.7, '3,4 g'], [0.9, '7 %']],
  [[0.05, 'Salz'], [0.45, '0,95 g'], [0.7, '0,38 g'], [0.9, '6 %']],
]);
const ERWARTET = { ENERCC: 364, FAT: 11.6, FASAT: 3.5, CHO: 55, SUGAR: 12, FIBT: 6.2, PROT625: 8.4, NACL: 0.95 };

describe('Nährwerttabelle', () => {
  it('pro 100 g und pro Portion: Es gilt die Spalte je 100 g, Prozent fallen weg', () => {
    const t = tabelleLesen(JE_100_UND_PORTION)!;
    expect(t.bezug).toBe('je100');
    expect(t.basis).toBe('g');
    expect(t.gelesen).toEqual(ERWARTET);
    expect(t.zweifel).toEqual({});
  });
  it('nur pro Portion: Das Programm erkennt es und rechnet auf 100 g um', () => {
    const t = tabelleLesen(
      stuecke([
        [[0.05, 'Nährwerte'], [0.5, 'pro Riegel (25 g)']],
        [[0.05, 'Energie'], [0.5, '420 kJ / 100 kcal']],
        [[0.05, 'Fett'], [0.5, '4,0 g']],
        [[0.05, 'Salz'], [0.5, '0,1 g']],
      ]),
    )!;
    expect(t).toMatchObject({ bezug: 'portion', portionMenge: 25, portionName: 'Riegel' });
    expect(t.gelesen).toEqual({ ENERCC: 100, FAT: 4, NACL: 0.1 });
    expect(aufHundert(t.gelesen, t.bezug, t.portionMenge)).toEqual({ ENERCC: 400, FAT: 16, NACL: 0.4 });
  });
  it('Portion ohne bekannte Größe: Die Prüfseite muss nachfragen', () => {
    const t = tabelleLesen(stuecke([[[0.05, 'Nährwerte'], [0.5, 'pro Portion']], [[0.05, 'Fett'], [0.5, '4 g']]]))!;
    expect(t).toMatchObject({ bezug: 'portion', portionMenge: null });
    expect(aufHundert(t.gelesen, t.bezug, null)).toBeNull();
  });
  it('Getränke: je 100 ml, und „weniger als“ ist markiert', () => {
    const t = tabelleLesen(stuecke([[[0.05, 'Nährwertangaben je 100 ml']], [[0.05, 'Brennwert'], [0.5, '188 kJ / 45 kcal']], [[0.05, 'Fett'], [0.5, '< 0,5 g']]]))!;
    expect(t).toMatchObject({ bezug: 'je100', basis: 'ml' });
    expect(t.gelesen.FAT).toBe(0.5);
    expect(t.zweifel.FAT).toBe('kleiner-als');
  });
  it('Lesefehler: „11,6 9“ ist „11,6 g“, und das fällt auf', () => {
    const t = tabelleLesen(stuecke([[[0.05, 'Nährwerte']], [[0.05, 'Fett'], [0.5, '11,6 9']], [[0.05, 'Eiweiß'], [0.5, '559']]]))!;
    expect(t.gelesen).toEqual({ FAT: 11.6, PROT625: 55 });
    expect(t.zweifel).toMatchObject({ FAT: 'einheit', PROT625: 'einheit' });
  });
  it('Lesefehler: O statt 0 und l statt 1', () => {
    const t = tabelleLesen(stuecke([[[0.05, 'Nährwerte']], [[0.05, 'Salz'], [0.5, 'O,5 g']], [[0.05, 'Fett'], [0.5, 'l,5 g']]]))!;
    expect(t.gelesen).toEqual({ NACL: 0.5, FAT: 1.5 });
    expect(t.zweifel.NACL).toBe('gelesen');
  });
  it('Kalorien in einer eigenen Zeile und nur in Kilojoule', () => {
    const zwei = tabelleLesen(stuecke([[[0.05, 'Brennwert'], [0.5, '1523 kJ']], [[0.5, '364 kcal']], [[0.05, 'Fett'], [0.5, '10 g']]]))!;
    expect(zwei.gelesen.ENERCC).toBe(364);
    const kj = tabelleLesen(stuecke([[[0.05, 'Brennwert'], [0.5, '1000 kJ']]]))!;
    expect(kj.gelesen.ENERCC).toBe(239);
  });
  it('ungesättigte Fettsäuren sind keine gesättigten', () => {
    const t = tabelleLesen(stuecke([[[0.05, 'Nährwerte']], [[0.05, 'Fett'], [0.5, '10 g']], [[0.05, 'davon einfach ungesättigte Fettsäuren'], [0.5, '6 g']], [[0.05, 'gesättigte Fettsäuren'], [0.5, '2 g']]]))!;
    expect(t.gelesen).toEqual({ FAT: 10, FASAT: 2 });
  });
  it('was nicht zusammenpasst, ist markiert', () => {
    const t = tabelleLesen(stuecke([[[0.05, 'Brennwert'], [0.5, '900 kcal']], [[0.05, 'Fett'], [0.5, '5 g']], [[0.05, 'gesättigte Fettsäuren'], [0.5, '8 g']], [[0.05, 'Kohlenhydrate'], [0.5, '20 g']], [[0.05, 'Eiweiß'], [0.5, '3 g']]]))!;
    expect(t.zweifel).toMatchObject({ FASAT: 'passt-nicht', FAT: 'passt-nicht', ENERCC: 'passt-nicht' });
  });
  it('eine Überschrift mit Stichwort ist keine Zeile, „Salz 100 g“ schon', () => {
    const t = tabelleLesen(stuecke([[[0.05, 'Energie und Nährwerte pro 100 g']], [[0.05, 'Brennwert'], [0.5, '100 kcal']], [[0.05, 'Salz'], [0.5, '100 g']]]))!;
    expect(t.gelesen).toEqual({ ENERCC: 100, NACL: 100 });
    expect(t.bezug).toBe('je100');
  });
  it('Mineralstoffe auf der Packung: in der Einheit des Programms, und nur mit Einheit', () => {
    const t = tabelleLesen(stuecke([[[0.05, 'Nährwerte'], [0.5, 'pro 100 g']], [[0.05, 'Calcium'], [0.5, '120 mg'], [0.8, '15 %']], [[0.05, 'Vitamin B6'], [0.5, '0,2 mg']], [[0.05, 'Vitamin B12'], [0.5, '1']]]))!;
    expect(t.gelesen.CA).toBe(120);
    expect(t.gelesen.VITB6).toBe(200);
    expect(t.gelesen.VITB12).toBeUndefined();
  });
  it('ein Rezept mit Salz und Zucker ist keine Tabelle', () => {
    expect(tabelleLesen(stuecke([[[0.05, 'Zutaten']], [[0.05, '200 g Zucker']], [[0.05, '1 TL Salz']]]))).toBeNull();
  });
  it('ohne Tabelle kein Ergebnis', () => {
    expect(tabelleLesen(stuecke([[[0.05, 'Haltbar bis 12.2027']], [[0.05, 'Dunkel lagern']]]))).toBeNull();
    expect(tabelleLesen([])).toBeNull();
  });
});

describe('Zutatenzeilen', () => {
  const eine = (zeile: string) => {
    const [z] = zutatLesen(zeile);
    return { name: z?.name, menge: z?.menge, einheit: z?.einheit, unklar: z?.unklar ?? null };
  };
  it.each([
    ['2 EL Olivenöl', 'Olivenöl', 2, 'EL'],
    ['3 Eier', 'Eier', 3, 'Stück'],
    ['200 g Mehl', 'Mehl', 200, 'g'],
    ['1 kg Kartoffeln', 'Kartoffeln', 1, 'kg'],
    ['150 ml Milch', 'Milch', 150, 'ml'],
    ['1/2 TL Salz', 'Salz', 0.5, 'TL'],
    ['½ TL Kreuzkümmel', 'Kreuzkümmel', 0.5, 'TL'],
    ['1 ½ EL Honig', 'Honig', 1.5, 'EL'],
    ['1,5 l Wasser', 'Wasser', 1.5, 'l'],
    ['1 Prise Muskat', 'Muskat', 1, 'Prise'],
    ['2 Scheiben Toast', 'Toast', 2, 'Scheibe'],
    ['1 Becher Joghurt', 'Joghurt', 1, 'Becher'],
    ['5 cl Sahne', 'Sahne', 50, 'ml'],
    ['2 dl Brühe', 'Brühe', 200, 'ml'],
    ['1EL Rapsöl', 'Rapsöl', 1, 'EL'],
    ['l EL Rapsöl', 'Rapsöl', 1, 'EL'],
    ['ca. 100 g Käse', 'Käse', 100, 'g'],
    ['Eine Zwiebel', 'Zwiebel', 1, 'Stück'],
    ['2 Zehen Knoblauch', 'Knoblauch', 2, 'Stück'],
    ['• 100 g Butter, weich', 'Butter', 100, 'g'],
    ['1 Zwiebel, fein gewürfelt', 'Zwiebel', 1, 'Stück'],
    ['200 g frische Tomaten (reif)', 'Tomaten', 200, 'g'],
  ])('%s', (zeile, name, menge, einheit) => {
    expect(eine(zeile)).toEqual({ name, menge, einheit, unklar: null });
  });
  it('„1 Dose Kichererbsen (240 g)“: Das Gewicht zählt', () => {
    expect(eine('1 Dose Kichererbsen (240 g)')).toEqual({ name: 'Kichererbsen', menge: 240, einheit: 'g', unklar: null });
    expect(eine('2 Dosen Tomaten à 400 g')).toMatchObject({ menge: 800, einheit: 'g' });
  });
  it('eine Dose ohne Gewicht ist unklar', () => {
    expect(eine('1 Dose Mais')).toMatchObject({ menge: 1, einheit: 'Dose', unklar: expect.stringContaining('Wie viel') });
  });
  it('Spannen nehmen die Mitte und sind unklar', () => {
    expect(eine('2-3 EL Öl')).toMatchObject({ menge: 2.5, einheit: 'EL', unklar: expect.stringContaining('Spanne') });
  });
  it('Küchenmaße, die das Programm nicht führt, sind grob umgerechnet und unklar', () => {
    expect(eine('1 Bund Petersilie')).toMatchObject({ name: 'Petersilie', menge: 40, einheit: 'g', unklar: expect.stringContaining('Bund') });
    expect(eine('2 Tassen Reis')).toMatchObject({ menge: 300, einheit: 'ml', unklar: expect.stringContaining('Tasse') });
  });
  it('ohne Menge: Gewürze als Prise, alles andere offen', () => {
    expect(zutatLesen('Salz und Pfeffer').map((z) => [z.name, z.menge, z.einheit])).toEqual([
      ['Salz', 1, 'Prise'],
      ['Pfeffer', 1, 'Prise'],
    ]);
    expect(eine('Öl zum Braten')).toMatchObject({ name: 'Öl', menge: null, einheit: null, unklar: expect.stringContaining('keine Menge') });
  });
  it('Zwischenüberschriften sind keine Zutaten', () => {
    expect(zutatLesen('Für die Soße:')).toEqual([]);
    expect(zutatLesen('12')).toEqual([]);
  });
  it('räumt typische Lesefehler auf', () => {
    expect(textSaeubern('2 EL Olivenol')).toBe('2 EL Olivenöl');
    expect(textSaeubern('im ÖI anbraten')).toBe('im Öl anbraten');
    expect(textSaeubern('Etwas Ol')).toBe('Etwas Öl');
    expect(textSaeubern('Oliven kaufen')).toBe('Oliven kaufen');
  });
});

describe('Rezept vom Foto', () => {
  const UNTEREINANDER = stuecke([[[0.05, 'Goldene Testpfanne']], [[0.05, 'Zutaten für 4 Portionen']], [[0.05, '200 g Mehl']], [[0.05, '3 Eier']], [[0.05, 'Zubereitung']], [[0.05, '1. Alles verrühren und']], [[0.05, 'braten.']], [[0.05, '2. Servieren.']]]);
  it('liest Name, Portionen, Zutaten und Schritte', () => {
    const r = rezeptLesen(UNTEREINANDER);
    expect(r.name).toBe('Goldene Testpfanne');
    expect(r.portionen).toBe(4);
    expect(r.zutaten.map((z) => z.name)).toEqual(['Mehl', 'Eier']);
    expect(r.zubereitung).toBe('Alles verrühren und braten.\nServieren.');
  });
  it('zwei Spalten: Die Zubereitung vermischt sich nicht mit den Zutaten', () => {
    const r = rezeptLesen(
      stuecke([
        [[0.05, 'Testtopf']],
        [[0.05, 'Für 2 Personen']],
        [[0.05, 'Zutaten'], [0.5, 'Zubereitung']],
        [[0.05, '150 g'], [0.2, 'Linsen'], [0.5, 'Alles kochen.']],
        [[0.05, '1'], [0.2, 'Möhre'], [0.5, 'Danach servieren.']],
      ]),
    );
    expect(r).toMatchObject({ name: 'Testtopf', portionen: 2, zubereitung: 'Alles kochen.\nDanach servieren.' });
    expect(r.zutaten.map((z) => [z.menge, z.einheit, z.name])).toEqual([
      [150, 'g', 'Linsen'],
      [1, 'Stück', 'Möhre'],
    ]);
  });
  it('nur eine Zutatenliste', () => {
    const r = rezeptLesen(stuecke([[[0.05, 'Zutaten']], [[0.05, '200 g Reis']]]));
    expect(r.zutaten).toHaveLength(1);
    expect(r.zubereitung).toBe('');
  });
  it('ganz ohne Überschriften entscheidet jede Zeile selbst', () => {
    const r = rezeptLesen(stuecke([[[0.05, 'Schneller Testsalat']], [[0.05, '200 g Tomaten']], [[0.05, '1 EL Öl']], [[0.05, 'Alles in einer großen Schüssel mischen.']]]));
    expect(r.name).toBe('Schneller Testsalat');
    expect(r.zutaten.map((z) => z.name)).toEqual(['Tomaten', 'Öl']);
    expect(r.zubereitung).toBe('Alles in einer großen Schüssel mischen.');
  });
  it('eine zweite Seite mit Fließtext wird Zubereitung', () => {
    const r = rezeptLesen(stuecke([[[0.05, 'Den Ofen vorheizen und den Teig in die Form geben.']], [[0.05, 'Dreißig Minuten backen.']]]));
    expect(r.zutaten).toEqual([]);
    expect(r.zubereitung).toContain('Dreißig Minuten backen.');
  });
  it('fügt Trennungen zusammen', () => {
    expect(schritteBauen(['Die Zwie-', 'beln braten.'])).toBe('Die Zwiebeln braten.');
  });
  it('leere Fotos ergeben nichts', () => {
    expect(rezeptLesen([])).toEqual({ name: '', portionen: null, zutaten: [], zubereitung: '' });
  });
});

describe('Passende Lebensmittel zur Zutat', () => {
  const BESTAND = [
    { name: 'Hühnerei roh', gruppe: 'E' },
    { name: 'Kichererbse reif', gruppe: 'G' },
    { name: 'Kichererbse reif, gekocht', gruppe: 'G' },
    { name: 'Kichererbse reif, Konserve, abgetropft', gruppe: 'G' },
    { name: 'Tomate gekocht', gruppe: 'G' },
    { name: 'Tomate roh', gruppe: 'G' },
    { name: 'Milchschokolade', gruppe: null },
    { name: 'Meine Hafermilch', gruppe: null },
    { name: 'Vollmilch frisch, 3,5 % Fett, pasteurisiert', gruppe: 'M' },
  ];
  const namen = (name: string, zeile = name) => zutatSuchen({ name, zeile }, BESTAND).treffer.map((t) => t.name);
  it('Rohes vor Gegartem', () => {
    expect(namen('Tomaten')[0]).toBe('Tomate roh');
  });
  it('„Eier“ finden das Hühnerei', () => {
    expect(namen('Eier')[0]).toBe('Hühnerei roh');
  });
  it('aus der Dose: der Eintrag „Konserve“', () => {
    expect(namen('Kichererbsen', '1 Dose Kichererbsen (240 g)')[0]).toBe('Kichererbse reif, Konserve, abgetropft');
    expect(namen('Kichererbsen')[0]).toBe('Kichererbse reif');
  });
  it('der übliche Eintrag vor der Schokolade', () => {
    expect(namen('Milch')[0]).toBe('Vollmilch frisch, 3,5 % Fett, pasteurisiert');
  });
  it('Eigenes mit genau dem Wort geht vor', () => {
    expect(zutatSuchen({ name: 'Hafermilch', zeile: '' }, BESTAND).treffer[0]?.name).toBe('Meine Hafermilch');
  });
  it('findet der ganze Name nichts, zählt das letzte Wort, aber nur als Vorschlag', () => {
    const s = zutatSuchen({ name: 'sonnengereifte Tomaten', zeile: '' }, BESTAND);
    expect(s.treffer[0]?.name).toBe('Tomate roh');
    expect(s.sicher).toBe(false);
  });
  it('nichts Passendes: leer', () => {
    expect(zutatSuchen({ name: 'Einhornstaub', zeile: '' }, BESTAND)).toEqual({ treffer: [], sicher: false });
  });
});

describe('Barcode', () => {
  it('prüft die Prüfziffer', () => {
    expect(barcodeGueltig('4000000123453')).toBe(true);
    expect(barcodeGueltig('4000000123454')).toBe(false);
    expect(barcodeGueltig('96385074')).toBe(true);
    expect(barcodeGueltig('123')).toBe(false);
    expect(barcodeGueltig(4000000123453)).toBe(false);
  });
  it('führende Nullen zählen beim Vergleich nicht', () => {
    expect(barcodeSchluessel('0012345678905')).toBe(barcodeSchluessel('12345678905'));
  });
  it('nimmt nur Lebensmittel-Codes vom Foto', () => {
    expect(barcodeAusFoto([{ art: 'QR', wert: 'https://beispiel.invalid' }, { art: 'EAN13', wert: '4000000123453' }])).toBe('4000000123453');
    expect(barcodeAusFoto([{ art: 'QR', wert: 'x' }])).toBeNull();
    expect(barcodeAusFoto([{ art: 'EAN13', wert: '4000000123454' }])).toBeNull();
  });
  it('liest die Packungsgröße', () => {
    expect(packungAus('500 g')).toEqual({ groesse: 500, basis: 'g' });
    expect(packungAus('1,5 l')).toEqual({ groesse: 1500, basis: 'ml' });
    expect(packungAus('6 x 100 g')).toEqual({ groesse: 600, basis: 'g' });
    expect(packungAus('33 cl')).toEqual({ groesse: 330, basis: 'ml' });
    expect(packungAus('groß')).toBeNull();
    expect(packungAus(null)).toBeNull();
  });
});

describe('Nur echte Bilder', () => {
  const mit = (...b: number[]) => new Uint8Array([...b, ...new Array(20).fill(0)]);
  const text = (t: string) => new Uint8Array([...t].map((z) => z.charCodeAt(0)));
  it('erkennt die Bildarten an den ersten Bytes', () => {
    expect(bildArt(mit(0xff, 0xd8, 0xff))).toBe('jpeg');
    expect(bildArt(mit(0x89, 0x50, 0x4e, 0x47))).toBe('png');
    expect(bildArt(text('RIFF0000WEBPxxxx'))).toBe('webp');
    expect(bildArt(text('0000ftypheicxxxx'))).toBe('heic');
  });
  it('alles andere nicht, auch wenn es sich als Bild ausgibt', () => {
    expect(bildArt(text('<html><body>hallo</body></html>'))).toBeNull();
    expect(bildArt(text('%PDF-1.7 aaaaaaaaaaaa'))).toBeNull();
    expect(bildArt(new Uint8Array(3))).toBeNull();
  });
});

// Mit dem echten Hilfsprogramm und den erfundenen Testbildern. Fehlt es (npm run sehen), entfällt dieser Teil.
const PROGRAMM = join(import.meta.dirname, '../ressourcen/starkmacher-sehen');
const BILDER = join(import.meta.dirname, 'bilder');

describe.runIf(existsSync(PROGRAMM))('Das echte Hilfsprogramm mit erfundenen Bildern', () => {
  const lesen = (name: string): FotoLesung => JSON.parse(execFileSync(PROGRAMM, ['lesen', join(BILDER, name)], { encoding: 'utf8' })) as FotoLesung;
  let ordner: string;
  beforeAll(() => {
    ordner = mkdtempSync(join(tmpdir(), 'starkmacher-fotos-'));
  });
  afterAll(() => rmSync(ordner, { recursive: true, force: true }));

  it.each(['naehrwerte-100g.png', 'naehrwerte-handy.jpg', 'naehrwerte-schlecht.jpg', 'naehrwerte-gedreht.jpg'])('Nährwerttabelle: %s', (name) => {
    const t = tabelleLesen(lesen(name).zeilen)!;
    expect(t.gelesen).toEqual(ERWARTET);
    expect(t.bezug).toBe('je100');
  });
  it('nur pro Portion', () => {
    const t = tabelleLesen(lesen('naehrwerte-portion.png').zeilen)!;
    expect(t).toMatchObject({ bezug: 'portion', portionMenge: 25, portionName: 'Riegel' });
    expect(aufHundert(t.gelesen, t.bezug, t.portionMenge)).toEqual({ ENERCC: 400, FAT: 16, FASAT: 6, CHO: 50, SUGAR: 20, FIBT: 4, PROT625: 12, NACL: 0.4 });
  });
  it('Getränk je 100 ml', () => {
    const t = tabelleLesen(lesen('naehrwerte-getraenk.png').zeilen)!;
    expect(t).toMatchObject({ bezug: 'je100', basis: 'ml' });
    expect(t.gelesen.ENERCC).toBe(45);
    expect(t.zweifel.FAT).toBe('kleiner-als');
  });
  it.each(['rezept.png', 'rezept-handy.jpg'])('Rezept untereinander: %s', (name) => {
    const r = rezeptLesen(lesen(name).zeilen);
    expect(r).toMatchObject({ name: 'Goldene Testpfanne', portionen: 4 });
    expect(r.zutaten.map((z) => [z.menge, z.einheit, z.name])).toEqual([
      [200, 'g', 'Mehl'],
      [2, 'EL', 'Olivenöl'],
      [240, 'g', 'Kichererbsen'],
      [3, 'Stück', 'Eier'],
      [0.5, 'TL', 'Salz'],
      [1, 'Stück', 'Zwiebel'],
      [2, 'Stück', 'Knoblauch'],
      [150, 'ml', 'Milch'],
      [1, 'Prise', 'Muskat'],
      [1, 'Prise', 'Pfeffer'],
    ]);
    expect(r.zubereitung.split('\n')).toHaveLength(4);
    expect(r.zubereitung).toContain('im Öl glasig anbraten.');
  });
  it('Rezept in zwei Spalten, die Mengen getrennt vom Namen', () => {
    const r = rezeptLesen(lesen('rezept-spalten.png').zeilen);
    expect(r).toMatchObject({ name: 'Linsentopf vom Testtag', portionen: 2 });
    expect(r.zutaten.map((z) => [z.menge, z.einheit, z.name])).toEqual([
      [150, 'g', 'rote Linsen'],
      [1, 'Stück', 'Möhre'],
      [1, 'EL', 'Rapsöl'],
      [400, 'ml', 'Gemüsebrühe'],
      [1, 'Becher', 'Joghurt'],
      [0.5, 'TL', 'Kreuzkümmel'],
    ]);
    expect(r.zubereitung.split('\n')).toEqual(['Die Möhre würfeln und im Öl anbraten.', 'Linsen und Brühe dazugeben und zehn Minuten leise kochen lassen.', 'Mit Kreuzkümmel würzen und mit Joghurt servieren.']);
  });
  it.each(['barcode.png', 'barcode-handy.jpg'])('Barcode: %s', (name) => {
    expect(barcodeAusFoto(lesen(name).barcodes)).toBe('4000000123453');
  });
  it('ein Bild ohne Text ergibt nichts, eine Nicht-Bilddatei einen Fehler', () => {
    expect(() => execFileSync(PROGRAMM, ['lesen', join(import.meta.dirname, 'fotos.test.ts')], { stdio: 'pipe' })).toThrow();
  });

  it('ein Foto wird richtig gedreht, verkleinert und ohne Angaben gespeichert', async () => {
    const sehen = sehenOeffnen(PROGRAMM);
    const name = await fotoEinlesen(join(BILDER, 'naehrwerte-gedreht.jpg'), ordner, sehen);
    const pfad = join(ordner, name);
    expect(name).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(statSync(pfad).mode & 0o777).toBe(0o600);
    const inhalt = readFileSync(pfad);
    expect(bildArt(inhalt)).toBe('jpeg');
    // Keine Drehung mehr in der Datei: Vision liest das Bild jetzt ohne Hilfe.
    const t = tabelleLesen((await sehen.lesen(pfad)).zeilen)!;
    expect(t.gelesen).toEqual(ERWARTET);
    const eigenschaften = execFileSync('sips', ['-g', 'orientation', '-g', 'pixelWidth', pfad], { encoding: 'utf8' });
    expect(eigenschaften).not.toMatch(/orientation: [2-8]/);
    expect(eigenschaften).toMatch(/pixelWidth: 1500/);
  });
  it('der Standort eines Handyfotos bleibt draußen', async () => {
    // Das Feld „Standort“ hat in den Angaben einer Bilddatei immer dieselbe Nummer, 0x8825.
    const hatStandort = (d: Buffer) => d.includes(Buffer.from([0x88, 0x25])) || d.includes(Buffer.from([0x25, 0x88]));
    const quelle = join(BILDER, 'foto-mit-standort.jpg');
    expect(hatStandort(readFileSync(quelle))).toBe(true);
    const name = await fotoEinlesen(quelle, ordner, sehenOeffnen(PROGRAMM));
    const kopf = readFileSync(join(ordner, name)).subarray(0, 4096);
    expect(hatStandort(kopf)).toBe(false);
  });
  it('was kein Bild ist, wird nicht gespeichert', async () => {
    await expect(fotoEinlesen(join(import.meta.dirname, 'fotos.test.ts'), ordner, sehenOeffnen(PROGRAMM))).rejects.toThrow(/nicht lesen/);
  });
});
