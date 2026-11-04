/** Fotos auswerten mit erfundenen Daten: Barcode über eigene Lebensmittel und Offline-Kopie, Rezept mit Vorschlägen. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { grundbestandOeffnen, type Grundbestand } from '../src/main/daten/bls';
import { kopieOeffnen, LEERE_KOPIE, type ProduktKopie } from '../src/main/daten/kopie';
import { LebensmittelDienst } from '../src/main/daten/lebensmittelDienst';
import { SqliteQuelle } from '../src/main/daten/sqlite';
import { FotoDienst, zweckPruefen } from '../src/main/fotoDienst';
import type { Sehen } from '../src/main/sehen';
import { BLS_FASSUNG, BLS_SCHEMA } from '@shared/blsAufbau';
import type { FotoLesung, TextStueck } from '@shared/fotoText';

const CODE = '4000000123453';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(40).fill(0)]);
const stueck = (text: string, x: number, zeile: number): TextStueck => ({ text, x, y: 0.05 + zeile * 0.05, b: 0.2, h: 0.03, steigung: 0, sicher: 1 });

let ordner: string;
let quelle: SqliteQuelle;
let grund: Grundbestand;
let lebensmittel: LebensmittelDienst;
let lesung: FotoLesung;
let kopie: ProduktKopie;

const sehen: Sehen = {
  lesen: async () => lesung,
  jpeg: async (_pfad, ziel) => writeFileSync(ziel, 'bild'),
};

function dienst(k: ProduktKopie = kopie, s: Sehen = sehen): FotoDienst {
  return new FotoDienst(s, () => join(ordner, 'fotos'), lebensmittel, k);
}

function kopieBauen(): ProduktKopie {
  const datei = join(ordner, 'kopie.sqlite');
  const db = new DatabaseSync(datei);
  db.exec('CREATE TABLE produkte (schluessel TEXT PRIMARY KEY, name TEXT, marke TEXT, menge TEXT, kcal REAL, fett REAL, gesaettigt REAL, kohlenhydrate REAL, zucker REAL, ballaststoffe REAL, eiweiss REAL, salz REAL) WITHOUT ROWID');
  const rein = db.prepare('INSERT INTO produkte VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  rein.run(CODE, 'Erfundenes Müsli', 'Testmarke', '500 g', 400, 8, null, 65, 12, null, 11, 0.1);
  rein.run('12345670', 'Nur ein Name', null, null, null, null, null, null, null, null, null, null);
  db.close();
  return kopieOeffnen(datei);
}

beforeEach(() => {
  ordner = mkdtempSync(join(tmpdir(), 'starkmacher-fotodienst-'));
  mkdirSync(join(ordner, 'fotos'));
  const blsDatei = join(ordner, 'bls.sqlite');
  const db = new DatabaseSync(blsDatei);
  db.exec(BLS_SCHEMA);
  db.prepare('INSERT INTO info VALUES (?, ?)').run('fassung', BLS_FASSUNG);
  const rein = db.prepare('INSERT INTO lebensmittel VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const [code, name] of [
    ['C100000', 'Weizen Mehl, Type 405'],
    ['E100000', 'Hühnerei roh'],
    ['G100000', 'Tomate roh'],
    ['G100132', 'Tomate gekocht'],
  ] as const) {
    rein.run(code, name, null, JSON.stringify({ ENERCC: 100 }), '[]', 0, null, '[]');
  }
  db.close();
  grund = grundbestandOeffnen(blsDatei);
  quelle = SqliteQuelle.oeffnen(join(ordner, 'daten.sqlite'));
  quelle.migrieren();
  lebensmittel = new LebensmittelDienst(() => quelle, grund);
  kopie = kopieBauen();
  lesung = { zeilen: [], barcodes: [] };
});

afterEach(() => {
  kopie.schliessen();
  quelle.schliessen();
  grund.schliessen();
  rmSync(ordner, { recursive: true, force: true });
});

const speichern = (barcode: string | null, name = 'Mein Müsli') => lebensmittel.speichern({ name, marke: null, basis: 'g', werte: { ENERCC: 300 }, schaetzung: null, nurNatuerlicherZucker: false, packung: null, foto: null, barcode });

describe('Barcode nachschlagen', () => {
  it('nimmt, was in der Kopie steht, ohne fehlende Werte zu erfinden', () => {
    const t = dienst().barcodeNachschlagen(CODE);
    expect(t).toMatchObject({ art: 'kopie', code: CODE, produkt: { name: 'Erfundenes Müsli', marke: 'Testmarke', menge: '500 g' } });
    if (t.art === 'kopie') expect(t.produkt.werte).toEqual({ ENERCC: 400, FAT: 8, CHO: 65, SUGAR: 12, PROT625: 11, NACL: 0.1 });
  });
  it('auch ein Produkt nur mit Namen', () => {
    const t = dienst().barcodeNachschlagen('12345670');
    expect(t.art === 'kopie' && t.produkt.werte).toEqual({});
  });
  it('das eigene Lebensmittel geht vor', () => {
    const eigen = speichern(CODE);
    expect(dienst().barcodeNachschlagen(CODE)).toEqual({ art: 'eigen', code: CODE, id: eigen.id, name: 'Mein Müsli' });
  });
  it('findet mit und ohne führende Null', () => {
    const eigen = speichern('0012345678905');
    expect(lebensmittel.nachBarcode('012345678905')?.id).toBe(eigen.id);
  });
  it('nicht gefunden: sagt auch, ob es die Kopie überhaupt gibt', () => {
    expect(dienst().barcodeNachschlagen('96385074')).toEqual({ art: 'keiner', code: '96385074', kopieDa: true });
    expect(dienst(LEERE_KOPIE).barcodeNachschlagen('96385074')).toEqual({ art: 'keiner', code: '96385074', kopieDa: false });
  });
  it('lehnt falsche Nummern ab', () => {
    expect(() => dienst().barcodeNachschlagen('4000000123454')).toThrow(/stimmt nicht/);
    expect(() => dienst().barcodeNachschlagen(12)).toThrow(/stimmt nicht/);
  });
});

describe('Ein Lebensmittel merkt sich seinen Barcode', () => {
  it('speichert ihn und gibt ihn zurück', () => {
    const lm = speichern(CODE);
    expect(lebensmittel.holen(lm.id)?.barcode).toBe(CODE);
  });
  it('ein falscher wird nicht gespeichert', () => {
    expect(() => speichern('123')).toThrow(/Barcode stimmt nicht/);
  });
  it('alte Lebensmittel ohne Barcode bleiben, wie sie sind', () => {
    const lm = lebensmittel.speichern({ name: 'Alt', marke: null, basis: 'g', werte: {}, schaetzung: null, nurNatuerlicherZucker: false, packung: null, foto: null });
    expect(lebensmittel.holen(lm.id)?.barcode).toBeNull();
    expect(lebensmittel.nachBarcode(CODE)).toBeNull();
  });
});

describe('Ein Foto auswerten', () => {
  it('Nährwerttabelle: gelesen und das Foto aufgehoben, gespeichert ist noch nichts', async () => {
    lesung.zeilen = [stueck('Nährwerte', 0.05, 0), stueck('pro 100 g', 0.5, 0), stueck('Fett', 0.05, 1), stueck('10 g', 0.5, 1)];
    const e = await dienst().ausDaten(JPEG, 'lebensmittel');
    expect(e.zweck === 'lebensmittel' && e.tabelle?.gelesen).toEqual({ FAT: 10 });
    expect(e.foto).toMatch(/\.jpg$/);
    expect(quelle.eigeneListe()).toEqual([]);
  });
  it('Barcode auf dem Foto: schlägt ihn nach', async () => {
    lesung.barcodes = [{ art: 'EAN13', wert: CODE }];
    const e = await dienst().ausDaten(JPEG, 'lebensmittel');
    expect(e.zweck === 'lebensmittel' && e.barcode?.art).toBe('kopie');
  });
  it('Rezept: jede Zutat mit Vorschlag, was nicht zu finden ist, bleibt ohne', async () => {
    lesung.zeilen = [stueck('Testgericht', 0.05, 0), stueck('Zutaten', 0.05, 1), stueck('200 g Mehl', 0.05, 2), stueck('3 Eier', 0.05, 3), stueck('2 frische Tomaten', 0.05, 4), stueck('1 Prise Einhornstaub', 0.05, 5), stueck('Olivenöl', 0.05, 6)];
    const e = await dienst().ausDaten(JPEG, 'rezept');
    if (e.zweck !== 'rezept') throw new Error('falscher Zweck');
    const [mehl, eier, tomaten, staub, oel] = e.rezept.zutaten;
    expect(mehl).toMatchObject({ lebensmittelName: 'Weizen Mehl, Type 405', menge: 200, unklar: null });
    expect(eier).toMatchObject({ lebensmittelName: 'Hühnerei roh', menge: 3, einheit: 'Stück' });
    expect(tomaten?.lebensmittelName).toBe('Tomate roh');
    expect(tomaten?.alternativen.map((a) => a.name)).toEqual(['Tomate roh', 'Tomate gekocht']);
    expect(staub).toMatchObject({ lebensmittelId: null, alternativen: [] });
    expect(oel).toMatchObject({ lebensmittelId: null, menge: null, unklar: expect.stringContaining('keine Menge') });
  });
  it('nur ungefähr gefunden: markiert', async () => {
    lesung.zeilen = [stueck('Zutaten', 0.05, 0), stueck('200 g sonnengereifte Tomaten', 0.05, 1)];
    const e = await dienst().ausDaten(JPEG, 'rezept');
    if (e.zweck !== 'rezept') throw new Error('falscher Zweck');
    expect(e.rezept.zutaten[0]).toMatchObject({ lebensmittelName: 'Tomate roh', unklar: expect.stringContaining('ungefähr') });
  });
  it('nur echte Bilder, und nichts bleibt liegen', async () => {
    await expect(dienst().ausDaten(new TextEncoder().encode('<html>kein Bild, aber lang genug</html>'), 'lebensmittel')).rejects.toThrow(/kein Bild/);
    await expect(dienst().ausDaten(new Uint8Array(31 * 1024 * 1024), 'lebensmittel')).rejects.toThrow(/zu groß/);
  });
  it('kann das Hilfsprogramm nicht lesen: eine verständliche Meldung', async () => {
    const kaputt: Sehen = { lesen: async () => Promise.reject(new Error('kaputt')), jpeg: async () => {} };
    await expect(dienst(kopie, kaputt).ausDaten(JPEG, 'lebensmittel')).rejects.toThrow(/lässt sich nicht lesen/);
  });
  it('kennt nur seine beiden Zwecke', () => {
    expect(zweckPruefen('rezept')).toBe('rezept');
    expect(() => zweckPruefen('alles')).toThrow();
  });
});

describe('Die Offline-Kopie', () => {
  it('fehlt die Datei, geht trotzdem alles', () => {
    const leer = kopieOeffnen(join(ordner, 'gibt-es-nicht.sqlite'));
    expect(leer.da).toBe(false);
    expect(leer.holen(CODE)).toBeNull();
  });
  it('findet einen Code auch mit führenden Nullen', () => {
    expect(kopie.da).toBe(true);
    expect(kopie.holen('0000012345670')?.name).toBe('Nur ein Name');
  });
});
