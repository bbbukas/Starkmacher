/** Teller: Rollen, Nährwerte, Tagebuch und Vorschläge, mit echter Datenbankdatei und einem kleinen erfundenen BLS. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { grundbestandOeffnen, type Grundbestand } from '../src/main/daten/bls';
import { LebensmittelDienst } from '../src/main/daten/lebensmittelDienst';
import { RezeptDienst } from '../src/main/daten/rezeptDienst';
import { SqliteQuelle } from '../src/main/daten/sqlite';
import { TagebuchDienst } from '../src/main/daten/tagebuchDienst';
import { TellerDienst } from '../src/main/daten/tellerDienst';
import { BLS_FASSUNG, BLS_SCHEMA } from '@shared/blsAufbau';
import { leeresProfil, PROFIL_ID } from '@shared/profil';
import { mengenText, tagessumme } from '@shared/tagebuch';
import { nachRollen, postenPruefen, ROLLEN, rolleTitel, tellerInhalt, tellerPruefen, tellerSumme, type Rolle, type TellerPosten } from '@shared/teller';

let ordner: string;
let quelle: SqliteQuelle;
let grund: Grundbestand;
let lebensmittel: LebensmittelDienst;
let rezepte: RezeptDienst;
let teller: TellerDienst;
let tagebuch: TagebuchDienst;
let zeit: number;

function blsBauen(datei: string): void {
  const db = new DatabaseSync(datei);
  db.exec(BLS_SCHEMA);
  db.prepare('INSERT INTO info VALUES (?, ?)').run('fassung', BLS_FASSUNG);
  const rein = db.prepare('INSERT INTO lebensmittel VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const zeile = (code: string, name: string, werte: Record<string, number>) => rein.run(code, name, null, JSON.stringify(werte), '[]', 0, null, '[]');
  zeile('C100000', 'Teigwaren eifrei, gekocht', { ENERCC: 150, PROT625: 5, FAT: 1, CHO: 30, FIBT: 2, NACL: 0.1, CA: 10 });
  zeile('Q120000', 'Olivenöl', { ENERCC: 900, FAT: 100, FASAT: 14 });
  zeile('G100000', 'Spinat gedünstet', { ENERCC: 22, PROT625: 3, FIBT: 2, FE: 3, NACL: 0.1 });
  zeile('H100000', 'Veganes Steak', { ENERCC: 200, PROT625: 20, FAT: 10, NACL: 1 });
  db.close();
}

const posten = (bezugId: string, menge: number, rolle: Rolle = 'hauptsache', einheit: TellerPosten['einheit'] = 'g', id = `${bezugId}-${rolle}`): TellerPosten => ({ id, bezugId, name: '', menge, einheit, groesse: null, rolle });

const TELLER = [posten('bls:C100000', 200, 'beilage'), posten('bls:H100000', 150), posten('bls:Q120000', 1, 'sosse', 'EL')];

beforeEach(() => {
  ordner = mkdtempSync(join(tmpdir(), 'starkmacher-tl-'));
  blsBauen(join(ordner, 'bls.sqlite'));
  grund = grundbestandOeffnen(join(ordner, 'bls.sqlite'));
  quelle = SqliteQuelle.oeffnen(join(ordner, 'starkmacher.sqlite'));
  quelle.migrieren();
  quelle.speichern({ profil: { ...leeresProfil(), id: PROFIL_ID, geschlecht: 'maennlich', geburtsjahr: 1986, groesseCm: 180, aktivitaet: 'sitzend', ziel: 'halten', einrichtungFertig: true }, gewicht: { datum: '2026-11-01', kg: 70 } });
  zeit = 0;
  const uhr = () => new Date(Date.UTC(2026, 10, 4, 12, 0, zeit++)).toISOString();
  lebensmittel = new LebensmittelDienst(() => quelle, grund, () => {}, uhr);
  rezepte = new RezeptDienst(() => quelle, lebensmittel, () => {}, uhr);
  teller = new TellerDienst(() => quelle, lebensmittel, rezepte, uhr);
  tagebuch = new TagebuchDienst(() => quelle, lebensmittel, rezepte, teller, grund, () => 2026, uhr);
});

afterEach(() => {
  quelle.schliessen();
  grund.schliessen();
  rmSync(ordner, { recursive: true, force: true });
});

const speichern = (name = 'Steak-Teller', liste = TELLER) => teller.speichern({ name, posten: liste });

describe('Prüfen und ordnen', () => {
  it('die sechs Rollen in der vorgegebenen Reihenfolge', () => {
    expect(ROLLEN.map((r) => r.id)).toEqual(['hauptsache', 'beilage', 'gemuese', 'sosse', 'topping', 'extra']);
    expect(rolleTitel('sosse')).toBe('Soße und Dip');
  });
  it('die Ansicht ist nach Rollen geordnet, leere Rollen fehlen', () => {
    const g = nachRollen(TELLER);
    expect(g.map((x) => x.rolle)).toEqual(['hauptsache', 'beilage', 'sosse']);
    expect(g[0]!.eintraege[0]!.bezugId).toBe('bls:H100000');
  });
  it('ein Name muss sein zum Aufheben, und etwas muss draufliegen', () => {
    expect(() => tellerPruefen({ name: ' ', posten: TELLER })).toThrow(/Namen/);
    expect(() => tellerPruefen({ name: 'A', posten: [] })).toThrow(/Teller/);
    expect(tellerPruefen({ name: ' A ', posten: TELLER }).name).toBe('A');
    expect(tellerPruefen({ id: 'anders:1', name: 'A', posten: TELLER }).id).toBeUndefined();
  });
  it('lehnt falsche Rollen und Mengen ab, ein Rezept zählt in Portionen', () => {
    expect(() => postenPruefen([{ ...TELLER[0], rolle: 'Nachtisch' }])).toThrow(/Rolle/);
    expect(() => postenPruefen([{ ...TELLER[0], menge: 0 }])).toThrow(/Menge/);
    expect(postenPruefen([posten('rezept:1', 1.5, 'beilage', 'Portion')])[0]).toMatchObject({ einheit: 'Portion', menge: 1.5 });
    expect(postenPruefen([{ ...posten('rezept:1', 2), einheit: 'g' }])[0]).toMatchObject({ einheit: 'Portion', menge: 2 });
  });
  it('sagt den Inhalt in Worten, die Hauptsache zuerst', () => {
    const benannt = [
      { name: 'Teigwaren eifrei, gekocht', rolle: 'beilage' as const },
      { name: 'Veganes Steak', rolle: 'hauptsache' as const },
      { name: 'Olivenöl', rolle: 'sosse' as const },
    ];
    expect(tellerInhalt(benannt)).toBe('Veganes Steak, Teigwaren eifrei und Olivenöl');
    expect(tellerInhalt(benannt.slice(1, 2))).toBe('Veganes Steak');
    expect(tellerInhalt([...benannt, { name: 'Spinat', rolle: 'gemuese' }])).toBe('Veganes Steak, Teigwaren eifrei, Spinat und 1 mehr');
    expect(tellerInhalt([])).toBe('');
  });
  it('Text zur Menge', () => {
    expect(mengenText({ menge: 1, einheit: 'Teller', groesse: null, gramm: 360 })).toBe('1 Teller');
    expect(mengenText({ menge: 0.5, einheit: 'Teller', groesse: null, gramm: 180 })).toBe('0,5 Teller');
  });
});

describe('Teller speichern und rechnen', () => {
  it('rechnet alle Nährwerte des ganzen Tellers', () => {
    const a = speichern();
    expect(a.teller.id).toMatch(/^teller:/);
    expect(a.posten.map((p) => p.posten.name)).toEqual(['Teigwaren eifrei, gekocht', 'Veganes Steak', 'Olivenöl']);
    expect(tellerSumme(a.posten).werte.ENERCC!.menge).toBe(300 + 300 + 90);
    expect(tellerSumme(a.posten).werte.CA).toEqual({ menge: 20, fehltBei: ['Veganes Steak', 'Olivenöl'] });
    expect(teller.holen(a.teller.id)?.teller.name).toBe('Steak-Teller');
    expect(teller.holen('teller:gibtsnicht')).toBeNull();
  });
  it('ändert denselben Teller, und löschen geht', () => {
    const a = speichern();
    expect(teller.speichern({ id: a.teller.id, name: 'Neu', posten: TELLER }).teller.id).toBe(a.teller.id);
    expect(teller.liste('').map((t) => t.name)).toEqual(['Neu']);
    expect(() => teller.speichern({ id: 'teller:gibtsnicht', name: 'X', posten: TELLER })).toThrow(/nicht mehr/);
    teller.loeschen(a.teller.id);
    expect(teller.liste('')).toEqual([]);
  });
  it('Liste mit Suche, Kalorien und Inhalt', () => {
    speichern('Käse-Teller');
    speichern('Steak-Teller');
    expect(teller.liste('kase').map((t) => t.name)).toEqual(['Käse-Teller']);
    expect(teller.liste('')[1]).toMatchObject({ name: 'Steak-Teller', kcal: 690, eiweiss: 40, inhalt: 'Veganes Steak, Teigwaren eifrei und Olivenöl' });
  });
  it('neue Bestandteile müssen existieren', () => {
    expect(() => speichern('X', [posten('bls:GIBTSNICHT', 100)])).toThrow(/gibt es nicht mehr/);
    expect(() => speichern('X', [posten('rezept:gibtsnicht', 1, 'hauptsache', 'Portion')])).toThrow(/gibt es nicht mehr/);
  });
  it('ein Rezept auf dem Teller zählt als Portion und zerfällt in seine Zutaten', () => {
    const r = rezepte.speichern({ name: 'Spinatsoße', portionen: 4, zutaten: [{ id: 'a', lebensmittelId: 'bls:G100000', name: '', menge: 400, einheit: 'g', groesse: null }, { id: 'b', lebensmittelId: 'bls:Q120000', name: '', menge: 40, einheit: 'g', groesse: null }], zubereitung: '', notiz: '', hashtags: [], fotos: [] });
    const a = speichern('Mit Soße', [posten('bls:H100000', 150), posten(r.rezept.id, 1, 'sosse', 'Portion')]);
    const soße = a.posten[1]!;
    expect(soße.posten).toMatchObject({ name: 'Spinatsoße', einheit: 'Portion', menge: 1 });
    expect(soße.bestandteile.map((b) => [b.name, b.gramm, b.rolle, b.gehoertZu])).toEqual([
      ['Spinat gedünstet', 100, 'sosse', 'Spinatsoße'],
      ['Olivenöl', 10, 'sosse', 'Spinatsoße'],
    ]);
    expect(tellerSumme(a.posten).werte.ENERCC!.menge).toBe(300 + 22 + 90);
  });
  it('ändert sich eine Zutat, ändert sich der Teller mit', () => {
    const a = speichern();
    lebensmittel.speichern({ id: 'bls:Q120000', name: 'Olivenöl', marke: null, basis: 'g', werte: { ENERCC: 500 }, schaetzung: null, nurNatuerlicherZucker: false, packung: null, foto: null });
    expect(tellerSumme(teller.holen(a.teller.id)!.posten).werte.ENERCC!.menge).toBe(300 + 300 + 50);
  });
  it('fehlt ein Bestandteil oder sein Gewicht, fällt das auf und zählt nicht mit', () => {
    const eigen = lebensmittel.speichern({ name: 'Mein Pesto', marke: null, basis: 'g', werte: { ENERCC: 500 }, schaetzung: null, nurNatuerlicherZucker: false, packung: null, foto: null });
    const a = speichern('Mit Pesto', [posten('bls:C100000', 200), posten(eigen.id, 50, 'sosse')]);
    lebensmittel.loeschen(eigen.id);
    expect(teller.holen(a.teller.id)!.posten[1]).toMatchObject({ problem: 'gibt-es-nicht-mehr', bestandteile: [] });
    expect(teller.vorschau([posten('bls:C100000', 1, 'beilage', 'Dose')])[0]).toMatchObject({ problem: 'gewicht-fehlt' });
    expect(teller.vorschau([])).toEqual([]);
  });
});

describe('Teller im Tagebuch', () => {
  const eintragen = (id: string, menge = 1) => tagebuch.eintragen({ datum: '2026-11-04', mahlzeit: 'abend', lebensmittelId: id, menge, einheit: 'Teller', groesse: null });

  it('ein gespeicherter Teller, auch halb', () => {
    const a = speichern();
    const e = eintragen(a.teller.id, 0.5);
    expect(e).toMatchObject({ art: 'teller', einheit: 'Teller', menge: 0.5, name: 'Steak-Teller' });
    expect(tagessumme([e]).werte.ENERCC!.menge).toBeCloseTo(345, 5);
    expect(e.rezept!.bestandteile.map((b) => b.rolle)).toEqual(['beilage', 'hauptsache', 'sosse']);
  });
  it('direkt ins Tagebuch, ohne den Teller aufzuheben', () => {
    const e = tagebuch.tellerEintragen({ datum: '2026-11-04', mahlzeit: 'mittag', menge: 1, name: 'Schnell gemacht', posten: TELLER });
    expect(e).toMatchObject({ art: 'teller', name: 'Schnell gemacht' });
    expect(teller.liste('')).toEqual([]);
    expect(tagessumme(tagebuch.tag('2026-11-04').eintraege).werte.ENERCC!.menge).toBe(690);
    // Ein ungespeicherter Teller taucht nicht bei „zuletzt gegessen“ auf, denn man könnte ihn nicht wieder wählen.
    expect(tagebuch.zuletztGegessen()).toEqual([]);
  });
  it('lehnt Unsinn ab', () => {
    expect(() => eintragen('teller:gibtsnicht')).toThrow(/gibt es nicht mehr/);
    expect(() => tagebuch.tellerEintragen({ datum: '2026-11-04', mahlzeit: 'mittag', menge: 1, name: 'X', posten: [] })).toThrow();
    expect(() => tagebuch.tellerEintragen({ datum: 'gestern', mahlzeit: 'mittag', menge: 1, name: 'X', posten: TELLER })).toThrow(/Datum/);
    expect(() => tagebuch.tellerEintragen({ datum: '2026-11-04', mahlzeit: 'mittag', menge: 0, name: 'X', posten: TELLER })).toThrow(/Portion/);
    expect(() => tagebuch.tellerEintragen(null)).toThrow();
  });
  it('das Tagebuch behält seinen Stand, wenn sich der Teller ändert oder verschwindet', () => {
    const a = speichern();
    const e = eintragen(a.teller.id);
    teller.speichern({ id: a.teller.id, name: 'Anders', posten: [posten('bls:C100000', 1)] });
    expect(tagessumme(tagebuch.tag(e.datum).eintraege).werte.ENERCC!.menge).toBe(690);
    teller.loeschen(a.teller.id);
    expect(tagebuch.tag(e.datum).eintraege[0]).toMatchObject({ name: 'Steak-Teller' });
  });
  it('für dieses eine Mal weniger Öl, und der Teller bleibt', () => {
    const a = speichern();
    const e = eintragen(a.teller.id);
    const b = e.rezept!.bestandteile;
    const neu = tagebuch.aendern(e.id, {
      menge: 1,
      einheit: 'Teller',
      groesse: null,
      mahlzeit: 'abend',
      bestandteile: [
        { id: b[0]!.id, menge: b[0]!.menge, einheit: b[0]!.einheit, groesse: null },
        { id: b[1]!.id, menge: b[1]!.menge, einheit: b[1]!.einheit, groesse: null },
        { id: b[2]!.id, menge: 0.5, einheit: 'EL', groesse: null },
        { lebensmittelId: 'bls:G100000', menge: 100, einheit: 'g', groesse: null, rolle: 'gemuese' },
      ],
    });
    expect(neu.rezept).toMatchObject({ angepasst: true });
    expect(tagessumme([neu]).werte.ENERCC!.menge).toBeCloseTo(300 + 300 + 45 + 22, 5);
    expect(neu.rezept!.bestandteile[3]).toMatchObject({ name: 'Spinat gedünstet', rolle: 'gemuese' });
    expect(tellerSumme(teller.holen(a.teller.id)!.posten).werte.ENERCC!.menge).toBe(690);
  });
  it('einen halben Teller daraus machen rechnet alles um', () => {
    const e = eintragen(speichern().teller.id);
    const neu = tagebuch.aendern(e.id, { menge: 0.5, einheit: 'Teller', groesse: null, mahlzeit: 'mittag' });
    expect(neu).toMatchObject({ menge: 0.5, mahlzeit: 'mittag' });
    expect(neu.rezept!.bestandteile[0]!.menge).toBe(100);
  });
  it('zuletzt gegessen kennt gespeicherte Teller', () => {
    const a = speichern();
    eintragen(a.teller.id);
    expect(tagebuch.zuletztGegessen()[0]).toMatchObject({ id: a.teller.id, herkunft: 'teller', name: 'Steak-Teller', kcal: 690 });
    teller.loeschen(a.teller.id);
    expect(tagebuch.zuletztGegessen()).toEqual([]);
  });
  it('Teller kommen als Vorschlag, ganz, und lassen sich so eintragen', () => {
    const a = speichern();
    const v = tagebuch.vorschlaege('2026-11-04').vorschlaege.find((x) => x.lebensmittelId === a.teller.id);
    expect(v).toMatchObject({ herkunft: 'teller', menge: 1, einheit: 'Teller', groesse: null, kcal: 690 });
    const e = tagebuch.eintragen({ datum: '2026-11-04', mahlzeit: 'abend', lebensmittelId: v!.lebensmittelId, menge: v!.menge, einheit: v!.einheit, groesse: v!.groesse });
    expect(tagessumme([e]).werte.ENERCC!.menge).toBeCloseTo(690, 5);
  });
});

describe('Datenbank', () => {
  it('eine Datei der vorigen Fassung bekommt die neue Tabelle und behält ihre Daten', () => {
    const datei = join(ordner, 'alt.sqlite');
    const alt = SqliteQuelle.oeffnen(datei);
    alt.migrieren();
    alt.speichern({ gewicht: { datum: '2026-11-01', kg: 70 } });
    const db = new DatabaseSync(datei);
    db.exec('DROP TABLE einkaufsliste; DROP TABLE teller; PRAGMA user_version = 4;');
    db.close();
    alt.schliessen();
    const neu = SqliteQuelle.oeffnen(datei);
    neu.migrieren();
    expect(neu.tellerListe()).toEqual([]);
    expect(neu.laden().gewichte).toHaveLength(1);
    neu.schliessen();
  });
});
