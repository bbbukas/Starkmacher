/** Die Einkaufsliste: Zusammenrechnen, Haken und Speichern, mit echter Datenbankdatei und einem kleinen erfundenen BLS. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { grundbestandOeffnen, type Grundbestand } from '../src/main/daten/bls';
import { EinkaufDienst } from '../src/main/daten/einkaufDienst';
import { LebensmittelDienst } from '../src/main/daten/lebensmittelDienst';
import { RezeptDienst } from '../src/main/daten/rezeptDienst';
import { SqliteQuelle } from '../src/main/daten/sqlite';
import { TellerDienst } from '../src/main/daten/tellerDienst';
import { BLS_FASSUNG, BLS_SCHEMA } from '@shared/blsAufbau';
import { anzahlErlaubt, anzahlText, einkaufText, einkaufZeilen, type EinkaufPosten, type EinkaufZeile } from '@shared/einkauf';
import { EI_GROESSEN, GRUNDWERTE, type Umrechnung } from '@shared/einheiten';
import { leeresProfil, PROFIL_ID } from '@shared/profil';

const OEL: Umrechnung = { ...GRUNDWERTE, dichte: 0.92, el: 10, tl: 4 };
const MILCH: Umrechnung = { ...GRUNDWERTE, dichte: 1, el: 15, tl: 5 };
const EI: Umrechnung = { ...GRUNDWERTE, groessen: EI_GROESSEN };
const APFEL: Umrechnung = { ...GRUNDWERTE, stueck: 140 };

const p = (menge: number, einheit: EinkaufPosten['einheit'], weiteres: Partial<EinkaufPosten> = {}): EinkaufPosten => ({ schluessel: 'a', name: 'Testzutat', menge, einheit, groesse: null, umrechnung: GRUNDWERTE, fuer: 'Rezept A', ...weiteres });
const eine = (...posten: EinkaufPosten[]): EinkaufZeile => {
  const zeilen = einkaufZeilen(posten, []);
  expect(zeilen).toHaveLength(1);
  return zeilen[0]!;
};

describe('Zusammenrechnen', () => {
  it('gleiche Einheiten werden addiert', () => {
    expect(eine(p(200, 'g'), p(300, 'g'))).toMatchObject({ menge: '500 g', genauer: null });
    expect(eine(p(2, 'EL'), p(1, 'EL'))).toMatchObject({ menge: '3 EL' });
    expect(eine(p(2, 'Stück', { umrechnung: APFEL }), p(3, 'Stück', { umrechnung: APFEL })).menge).toBe('5 Stück');
  });
  it('g und kg sowie ml und l gehören zusammen, ab 1.000 steht die größere Einheit da', () => {
    expect(eine(p(1, 'kg'), p(200, 'g')).menge).toBe('1,2 kg');
    expect(eine(p(0.5, 'l'), p(250, 'ml')).menge).toBe('750 ml');
    expect(eine(p(1, 'l'), p(500, 'ml')).menge).toBe('1,5 l');
    expect(eine(p(1000, 'g')).menge).toBe('1 kg');
  });
  it('rundet auf, damit es reicht, aber ohne Scheingenauigkeit', () => {
    expect(eine(p(250 / 3, 'g')).menge).toBe('84 g');
    expect(eine(p(1234, 'g')).menge).toBe('1,24 kg');
    expect(eine(p(2.51, 'g')).menge).toBe('2,6 g');
    expect(eine(p(2 / 3, 'EL')).menge).toBe('0,7 EL');
    expect(eine(p(1.5, 'Prise')).menge).toBe('2 Prisen');
    // Rundungsreste beim Rechnen machen aus 300 g keine 301 g.
    expect(eine(p(0.1 + 0.2, 'kg')).menge).toBe('300 g');
    expect(eine(p(100 * 3 * (1 / 3), 'g')).menge).toBe('100 g');
  });
  it('verschiedene Einheiten rechnet die Umrechnung zusammen, mit „≈“ und den Teilen dazu', () => {
    expect(eine(p(50, 'g', { umrechnung: OEL }), p(4, 'EL', { umrechnung: OEL }))).toMatchObject({ menge: '≈ 90 g', genauer: '50 g und 4 EL' });
    expect(eine(p(2, 'Stück', { umrechnung: APFEL }), p(100, 'g', { umrechnung: APFEL }))).toMatchObject({ menge: '≈ 380 g', genauer: '100 g und 2 Stück' });
  });
  it('Flüssiges bleibt in Millilitern, solange nur Löffel dazukommen', () => {
    expect(eine(p(500, 'ml', { umrechnung: MILCH }), p(2, 'EL', { umrechnung: MILCH }))).toMatchObject({ menge: '≈ 530 ml', genauer: '500 ml und 2 EL' });
    expect(eine(p(100, 'g', { umrechnung: MILCH }), p(100, 'ml', { umrechnung: MILCH })).menge).toBe('≈ 200 g');
  });
  it('fehlt ein Gewicht, gibt es keine erfundene Summe', () => {
    expect(eine(p(200, 'g'), p(1, 'Dose'))).toMatchObject({ menge: '200 g und 1 Dose', genauer: null });
    expect(eine(p(2, 'Dose'))).toMatchObject({ menge: '2 Dosen', genauer: null });
  });
  it('was man nur ganz kaufen kann, wird aufgerundet, und was gebraucht wird, steht dabei', () => {
    expect(eine(p(1.5, 'Stück', { umrechnung: APFEL }))).toMatchObject({ menge: '2 Stück', genauer: '1,5 gebraucht, ≈ 210 g' });
    expect(eine(p(0.5, 'Dose', { umrechnung: { ...GRUNDWERTE, dose: 240 } }))).toMatchObject({ menge: '1 Dose', genauer: '0,5 gebraucht, ≈ 120 g' });
    expect(eine(p(2, 'Stück', { umrechnung: APFEL }))).toMatchObject({ menge: '2 Stück', genauer: '≈ 280 g' });
  });
  it('Eier in verschiedenen Größen bleiben Eier', () => {
    const m = p(2, 'Stück', { umrechnung: EI, groesse: 'M' });
    expect(eine(m, p(3, 'Stück', { umrechnung: EI, groesse: 'M' }))).toMatchObject({ menge: '5 Stück (M)', genauer: '≈ 260 g' });
    expect(eine(m, p(3, 'Stück', { umrechnung: EI, groesse: 'L' }))).toMatchObject({ menge: '5 Stück', genauer: '3 L und 2 M' });
    // Ohne Größe rechnet das Programm bei Eiern mit M.
    expect(eine(m, p(1, 'Stück', { umrechnung: EI })).menge).toBe('3 Stück (M)');
  });
  it('die Teile stehen immer in derselben Reihenfolge, egal was zuerst gewählt wurde', () => {
    const a = eine(p(50, 'g', { umrechnung: OEL }), p(4, 'EL', { umrechnung: OEL }), p(1, 'TL', { umrechnung: OEL }));
    const b = eine(p(1, 'TL', { umrechnung: OEL }), p(4, 'EL', { umrechnung: OEL }), p(50, 'g', { umrechnung: OEL }));
    expect(a.genauer).toBe('50 g, 4 EL und 1 TL');
    expect(b.stand).toBe(a.stand);
  });
  it('ein Lebensmittel, das es nicht mehr gibt, bleibt auf der Liste, gerechnet wird nur noch, was sicher ist', () => {
    expect(eine(p(200, 'g', { umrechnung: null }), p(1, 'kg', { umrechnung: null })).menge).toBe('1,2 kg');
    expect(eine(p(200, 'g', { umrechnung: null }), p(2, 'EL', { umrechnung: null }))).toMatchObject({ menge: '200 g und 2 EL', genauer: null });
    expect(eine(p(2, 'Stück', { umrechnung: null, groesse: 'L' })).menge).toBe('2 Stück (L)');
  });
  it('sortiert nach Namen, je Lebensmittel eine Zeile, und nennt, wofür', () => {
    const zeilen = einkaufZeilen([p(100, 'g', { schluessel: 'z', name: 'Zwiebel' }), p(100, 'g', { schluessel: 'a', name: 'Äpfel', fuer: 'Kuchen' }), p(100, 'g', { schluessel: 'a', name: 'Äpfel', fuer: 'Mus' }), p(50, 'g', { schluessel: 'a', name: 'Äpfel', fuer: 'Mus' })], []);
    expect(zeilen.map((z) => z.name)).toEqual(['Äpfel', 'Zwiebel']);
    expect(zeilen[0]).toMatchObject({ menge: '250 g', fuer: ['Kuchen', 'Mus'] });
  });
  it('merkt, wenn eine Menge gegart gemeint ist', () => {
    expect(eine(p(100, 'g', { name: 'Teigwaren eifrei, gekocht' })).gegart).toBe(true);
    expect(eine(p(100, 'g', { name: 'Spinat gedünstet' })).gegart).toBe(true);
    expect(eine(p(100, 'g', { name: 'Weizenmehl' })).gegart).toBe(false);
  });
  it('zum Mitnehmen steht nur, was noch fehlt', () => {
    const [mehl, oel] = einkaufZeilen([p(100, 'g', { schluessel: 'm', name: 'Mehl' }), p(2, 'EL', { schluessel: 'o', name: 'Öl' })], []);
    expect(einkaufText([mehl!, oel!])).toBe('100 g Mehl\n2 EL Öl');
    expect(einkaufText([{ ...mehl!, abgehakt: true }, oel!])).toBe('2 EL Öl');
  });
  it('die Anzahl hat Grenzen', () => {
    expect(anzahlErlaubt(0.5)).toBe(true);
    expect(anzahlErlaubt(0)).toBe(false);
    expect(anzahlErlaubt(-1)).toBe(false);
    expect(anzahlErlaubt(201)).toBe(false);
    expect(anzahlErlaubt(Number.NaN)).toBe(false);
    expect(anzahlText({ art: 'rezept', anzahl: 1 })).toBe('1 Portion');
    expect(anzahlText({ art: 'rezept', anzahl: 2.5 })).toBe('2,5 Portionen');
    expect(anzahlText({ art: 'teller', anzahl: 2 })).toBe('2 Teller');
  });
});

let ordner: string;
let quelle: SqliteQuelle;
let grund: Grundbestand;
let lebensmittel: LebensmittelDienst;
let rezepte: RezeptDienst;
let teller: TellerDienst;
let einkauf: EinkaufDienst;

function blsBauen(datei: string): void {
  const db = new DatabaseSync(datei);
  db.exec(BLS_SCHEMA);
  db.prepare('INSERT INTO info VALUES (?, ?)').run('fassung', BLS_FASSUNG);
  const rein = db.prepare('INSERT INTO lebensmittel VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const zeile = (code: string, name: string) => rein.run(code, name, null, JSON.stringify({ ENERCC: 100 }), '[]', 0, null, '[]');
  zeile('C100000', 'Teigwaren eifrei, gekocht');
  zeile('Q120000', 'Olivenöl');
  zeile('E111000', 'Hühnerei roh');
  zeile('H100000', 'Veganes Steak');
  db.close();
}

const NUDELN = 'bls:C100000';
const OLIVENOEL = 'bls:Q120000';
const EIER = 'bls:E111000';
const STEAK = 'bls:H100000';

const zutat = (lebensmittelId: string, menge: number, einheit: 'g' | 'EL' | 'Stück' = 'g') => ({ id: `${lebensmittelId}-${menge}`, lebensmittelId, name: '', menge, einheit, groesse: null });
const rezeptAnlegen = (name = 'Nudeln mit Öl', portionen = 4, zutaten = [zutat(NUDELN, 400), zutat(OLIVENOEL, 4, 'EL')]) => rezepte.speichern({ name, portionen, zutaten, zubereitung: '', notiz: '', hashtags: [], fotos: [] }).rezept.id;
const postenLm = (bezugId: string, menge: number, einheit: 'g' | 'EL' = 'g') => ({ id: `${bezugId}-${menge}`, bezugId, name: '', menge, einheit, groesse: null, rolle: 'hauptsache' as const });
const postenRezept = (bezugId: string, portionen: number) => ({ id: bezugId, bezugId, name: '', menge: portionen, einheit: 'Portion' as const, groesse: null, rolle: 'beilage' as const });
const tellerAnlegen = (name: string, posten: unknown[]) => teller.speichern({ name, posten: posten as never }).teller.id;
const zeileVon = (name: string) => einkauf.ansicht().zeilen.find((z) => z.name === name)!;

beforeEach(() => {
  ordner = mkdtempSync(join(tmpdir(), 'starkmacher-ek-'));
  blsBauen(join(ordner, 'bls.sqlite'));
  grund = grundbestandOeffnen(join(ordner, 'bls.sqlite'));
  quelle = SqliteQuelle.oeffnen(join(ordner, 'starkmacher.sqlite'));
  quelle.migrieren();
  quelle.speichern({ profil: { ...leeresProfil(), id: PROFIL_ID, einrichtungFertig: true }, gewicht: { datum: '2026-11-01', kg: 70 } });
  lebensmittel = new LebensmittelDienst(() => quelle, grund, () => {});
  rezepte = new RezeptDienst(() => quelle, lebensmittel, () => {});
  teller = new TellerDienst(() => quelle, lebensmittel, rezepte);
  einkauf = new EinkaufDienst(() => quelle, lebensmittel);
});

afterEach(() => {
  quelle.schliessen();
  grund.schliessen();
  rmSync(ordner, { recursive: true, force: true });
});

describe('Rezepte und Teller wählen', () => {
  it('am Anfang ist die Liste leer', () => {
    expect(einkauf.ansicht()).toEqual({ quellen: [], zeilen: [] });
    expect(einkauf.text()).toBe('');
  });
  it('ein Rezept kommt mit seinen Portionen und allen Zutaten', () => {
    const a = einkauf.hinzufuegen(rezeptAnlegen());
    expect(a.quellen[0]).toMatchObject({ name: 'Nudeln mit Öl', art: 'rezept', anzahl: 4, fehlt: false });
    expect(a.zeilen.map((z) => [z.name, z.menge])).toEqual([
      ['Olivenöl', '4 EL'],
      ['Teigwaren eifrei, gekocht', '400 g'],
    ]);
  });
  it('weniger Portionen ergeben weniger', () => {
    const id = rezeptAnlegen();
    einkauf.hinzufuegen(id);
    einkauf.anzahlSetzen(id, 1);
    expect(zeileVon('Teigwaren eifrei, gekocht').menge).toBe('100 g');
    expect(zeileVon('Olivenöl').menge).toBe('1 EL');
  });
  it('ein Teller zählt so oft, wie gewählt, und ein Rezept darauf nur mit seinen Portionen', () => {
    const r = rezeptAnlegen();
    const t = tellerAnlegen('Steak-Teller', [postenLm(STEAK, 150), postenRezept(r, 1)]);
    expect(einkauf.hinzufuegen(t).quellen[0]).toMatchObject({ art: 'teller', anzahl: 1 });
    expect(zeileVon('Veganes Steak').menge).toBe('150 g');
    expect(zeileVon('Teigwaren eifrei, gekocht').menge).toBe('100 g');
    einkauf.anzahlSetzen(t, 3);
    expect(zeileVon('Veganes Steak').menge).toBe('450 g');
    expect(zeileVon('Teigwaren eifrei, gekocht').menge).toBe('300 g');
  });
  it('Zutaten aus Rezepten und Tellern werden zusammengerechnet', () => {
    einkauf.hinzufuegen(rezeptAnlegen());
    einkauf.hinzufuegen(tellerAnlegen('Steak-Teller', [postenLm(NUDELN, 200), postenLm(OLIVENOEL, 50)]));
    expect(zeileVon('Teigwaren eifrei, gekocht')).toMatchObject({ menge: '600 g', fuer: ['Nudeln mit Öl', 'Steak-Teller'], gegart: true });
    expect(zeileVon('Olivenöl')).toMatchObject({ menge: '≈ 90 g', genauer: '50 g und 4 EL' });
  });
  it('was schon darauf steht, kommt noch einmal dazu und steht nicht doppelt da', () => {
    const r = rezeptAnlegen();
    const t = tellerAnlegen('Steak-Teller', [postenLm(STEAK, 150)]);
    einkauf.hinzufuegen(r);
    einkauf.hinzufuegen(t);
    einkauf.hinzufuegen(t);
    const a = einkauf.hinzufuegen(r);
    expect(a.quellen.map((q) => q.anzahl)).toEqual([8, 2]);
  });
  it('nimmt nur, was es gibt', () => {
    expect(() => einkauf.hinzufuegen('bls:C100000')).toThrow('nicht auf die Liste');
    expect(() => einkauf.hinzufuegen(5)).toThrow('nicht auf die Liste');
    expect(() => einkauf.hinzufuegen('rezept:weg')).toThrow('gibt es nicht mehr');
    expect(() => einkauf.hinzufuegen('teller:weg')).toThrow('gibt es nicht mehr');
    const r = rezeptAnlegen();
    expect(() => einkauf.anzahlSetzen(r, 1)).toThrow('nicht mehr auf der Liste');
    einkauf.hinzufuegen(r);
    expect(() => einkauf.anzahlSetzen(r, 0)).toThrow('über 0');
    expect(() => einkauf.anzahlSetzen(r, 201)).toThrow('über 0');
    expect(() => einkauf.anzahlSetzen(r, '4')).toThrow('über 0');
  });
  it('rechnet mit dem heutigen Stand: Ein geändertes Rezept ändert die Liste', () => {
    const id = rezeptAnlegen();
    einkauf.hinzufuegen(id);
    rezepte.speichern({ id, name: 'Nudeln neu', portionen: 2, zutaten: [zutat(NUDELN, 400)], zubereitung: '', notiz: '', hashtags: [], fotos: [] });
    const a = einkauf.ansicht();
    expect(a.quellen[0]!.name).toBe('Nudeln neu');
    // Vier Portionen von einem Rezept, das jetzt für zwei reicht.
    expect(a.zeilen.map((z) => z.menge)).toEqual(['800 g']);
  });
  it('die Notiz eines Rezepts steht dabei: Dort können Zutaten ohne Lebensmittel stehen', () => {
    const id = rezepte.speichern({ name: 'Mit Notiz', portionen: 2, zutaten: [zutat(NUDELN, 100)], zubereitung: '', notiz: ' 1 Prise Muskat \n', hashtags: [], fotos: [] }).rezept.id;
    expect(einkauf.hinzufuegen(id).quellen[0]!.notiz).toBe('1 Prise Muskat');
  });
});

describe('Wenn etwas verschwindet', () => {
  it('ein gelöschtes Rezept sagt es und zählt nicht mehr', () => {
    const id = rezeptAnlegen();
    einkauf.hinzufuegen(id);
    rezepte.loeschen(id);
    const a = einkauf.ansicht();
    expect(a.quellen[0]).toMatchObject({ name: 'Nudeln mit Öl', fehlt: true });
    expect(a.zeilen).toEqual([]);
    expect(einkauf.entfernen(id).quellen).toEqual([]);
  });
  it('ein gelöschter Teller auch', () => {
    const id = tellerAnlegen('Steak-Teller', [postenLm(STEAK, 150)]);
    einkauf.hinzufuegen(id);
    teller.loeschen(id);
    expect(einkauf.ansicht().quellen[0]).toMatchObject({ name: 'Steak-Teller', art: 'teller', fehlt: true });
  });
  it('fehlt ein Rezept auf einem Teller, bleibt der Rest und der Name steht da', () => {
    const r = rezeptAnlegen('Beilage');
    const t = tellerAnlegen('Steak-Teller', [postenLm(STEAK, 150), postenRezept(r, 1)]);
    einkauf.hinzufuegen(t);
    rezepte.loeschen(r);
    const a = einkauf.ansicht();
    expect(a.quellen[0]).toMatchObject({ fehlt: false, ohne: ['Beilage'] });
    expect(a.zeilen.map((z) => z.name)).toEqual(['Veganes Steak']);
  });
  it('ein Lebensmittel, das es nicht mehr gibt, kann man trotzdem kaufen', () => {
    quelle.rezeptSpeichern({ id: 'rezept:alt', name: 'Altes Rezept', portionen: 2, zutaten: [{ id: 'z', lebensmittelId: 'eigen:weg', name: 'Mein altes Mehl', menge: 300, einheit: 'g', groesse: null }], zubereitung: '', notiz: '', hashtags: [], fotos: [], geaendertAm: '2026-11-01T00:00:00.000Z' });
    einkauf.hinzufuegen('rezept:alt');
    expect(zeileVon('Mein altes Mehl').menge).toBe('300 g');
  });
});

describe('Abhaken', () => {
  it('ein Haken bleibt, auch nach einem Neustart', () => {
    const id = rezeptAnlegen();
    einkauf.hinzufuegen(id);
    const a = einkauf.abhaken(NUDELN, true);
    expect(a.zeilen.find((z) => z.schluessel === NUDELN)!.abgehakt).toBe(true);
    expect(a.zeilen.find((z) => z.schluessel === OLIVENOEL)!.abgehakt).toBe(false);
    expect(einkauf.text()).toBe('4 EL Olivenöl');
    quelle.schliessen();
    quelle = SqliteQuelle.oeffnen(join(ordner, 'starkmacher.sqlite'));
    expect(zeileVon('Teigwaren eifrei, gekocht').abgehakt).toBe(true);
    expect(einkauf.ansicht().quellen.map((q) => q.anzahl)).toEqual([4]);
  });
  it('lässt sich wieder entfernen, einzeln oder alle', () => {
    einkauf.hinzufuegen(rezeptAnlegen());
    einkauf.abhaken(NUDELN, true);
    einkauf.abhaken(OLIVENOEL, true);
    expect(einkauf.abhaken(NUDELN, false).zeilen.filter((z) => z.abgehakt).map((z) => z.schluessel)).toEqual([OLIVENOEL]);
    expect(einkauf.hakenEntfernen().zeilen.some((z) => z.abgehakt)).toBe(false);
    expect(einkauf.ansicht().quellen).toHaveLength(1);
  });
  it('wird es mehr, gilt der Haken nicht mehr: Man muss noch einmal los', () => {
    const id = rezeptAnlegen();
    einkauf.hinzufuegen(id);
    einkauf.abhaken(NUDELN, true);
    einkauf.anzahlSetzen(id, 8);
    expect(zeileVon('Teigwaren eifrei, gekocht')).toMatchObject({ menge: '800 g', abgehakt: false });
    // Auch beim erneuten Abhaken steht nur ein Haken je Zeile.
    einkauf.abhaken(NUDELN, true);
    expect(quelle.einkaufLaden().haken).toHaveLength(1);
    expect(zeileVon('Teigwaren eifrei, gekocht').abgehakt).toBe(true);
  });
  it('was gerade nicht auf der Liste steht, lässt sich nicht abhaken', () => {
    einkauf.hinzufuegen(rezeptAnlegen());
    expect(einkauf.abhaken(EIER, true).zeilen.some((z) => z.schluessel === EIER)).toBe(false);
    expect(quelle.einkaufLaden().haken).toEqual([]);
    expect(() => einkauf.abhaken(3, true)).toThrow('stimmt nicht');
  });
  it('leeren nimmt alles von der Liste, die Rezepte selbst bleiben', () => {
    const id = rezeptAnlegen();
    einkauf.hinzufuegen(id);
    einkauf.abhaken(NUDELN, true);
    expect(einkauf.leeren()).toEqual({ quellen: [], zeilen: [] });
    expect(quelle.einkaufLaden()).toEqual({ quellen: [], haken: [] });
    expect(rezepte.holen(id)).not.toBeNull();
  });
});

describe('Speichern', () => {
  it('kommt in die Sicherung mit', () => {
    einkauf.hinzufuegen(rezeptAnlegen());
    const ziel = join(ordner, 'kopie.sqlite');
    quelle.kopieSchreiben(ziel);
    const kopie = SqliteQuelle.oeffnen(ziel);
    expect(kopie.einkaufLaden().quellen).toHaveLength(1);
    kopie.schliessen();
  });
  it('ältere Datendateien bekommen die Tabelle dazu, und alles andere bleibt', () => {
    const datei = join(ordner, 'alt.sqlite');
    const alt = SqliteQuelle.oeffnen(datei);
    alt.migrieren();
    alt.speichern({ gewicht: { datum: '2026-11-01', kg: 70 } });
    const db = new DatabaseSync(datei);
    db.exec('DROP TABLE einkaufsliste; PRAGMA user_version = 5;');
    db.close();
    alt.schliessen();
    const neu = SqliteQuelle.oeffnen(datei);
    neu.migrieren();
    expect(neu.einkaufLaden()).toEqual({ quellen: [], haken: [] });
    expect(neu.laden().gewichte).toHaveLength(1);
    neu.schliessen();
  });
});
