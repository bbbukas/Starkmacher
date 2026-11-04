/** Rezepte und Hashtags mit echter Datenbankdatei und einem kleinen erfundenen BLS. */
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
import type { LebensmittelEingabe } from '@shared/lebensmittel';
import { leeresProfil, PROFIL_ID } from '@shared/profil';
import { rezeptSumme, type RezeptEingabe, type RezeptZutat } from '@shared/rezepte';
import { tagessumme } from '@shared/tagebuch';

let ordner: string;
let quelle: SqliteQuelle;
let grund: Grundbestand;
let lebensmittel: LebensmittelDienst;
let rezepte: RezeptDienst;
let tagebuch: TagebuchDienst;
let geloescht: string[];
let zeit: number;

function blsBauen(datei: string): void {
  const db = new DatabaseSync(datei);
  db.exec(BLS_SCHEMA);
  db.prepare('INSERT INTO info VALUES (?, ?)').run('fassung', BLS_FASSUNG);
  const rein = db.prepare('INSERT INTO lebensmittel VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const zeile = (code: string, name: string, werte: Record<string, number>, frei: number | null = 0) => rein.run(code, name, null, JSON.stringify(werte), '[]', frei, null, '[]');
  zeile('C100000', 'Teigwaren eifrei, gekocht', { ENERCC: 150, PROT625: 5, FAT: 1, CHO: 30, FIBT: 2, NACL: 0.1 });
  zeile('Q120000', 'Olivenöl', { ENERCC: 900, FAT: 100, FASAT: 14, VITE: 12 });
  zeile('E111100', 'Hühnerei roh', { ENERCC: 137, PROT625: 12, FAT: 9.3, NACL: 0.4 });
  zeile('G770400', 'Kichererbse reif, gekocht', { ENERCC: 120, PROT625: 8, FIBT: 6, FE: 2, NACL: 0 });
  db.close();
}

const zutat = (lebensmittelId: string, menge: number, einheit: RezeptZutat['einheit'] = 'g', id = lebensmittelId, groesse: RezeptZutat['groesse'] = null): RezeptZutat => ({ id, lebensmittelId, name: '', menge, einheit, groesse });
const rezept = (teil: Partial<RezeptEingabe> = {}): RezeptEingabe => ({
  name: 'Nudeln mit Öl',
  portionen: 4,
  zutaten: [zutat('bls:C100000', 400), zutat('bls:Q120000', 2, 'EL')],
  zubereitung: 'Kochen\nMischen',
  notiz: 'Lecker',
  hashtags: [],
  fotos: [],
  ...teil,
});
const FOTO = (n: number) => `${String(n).repeat(8)}-1111-1111-1111-111111111111.jpg`;

beforeEach(() => {
  ordner = mkdtempSync(join(tmpdir(), 'starkmacher-rz-'));
  blsBauen(join(ordner, 'bls.sqlite'));
  grund = grundbestandOeffnen(join(ordner, 'bls.sqlite'));
  quelle = SqliteQuelle.oeffnen(join(ordner, 'starkmacher.sqlite'));
  quelle.migrieren();
  quelle.speichern({ profil: { ...leeresProfil(), id: PROFIL_ID, geschlecht: 'maennlich', geburtsjahr: 1986, groesseCm: 180, aktivitaet: 'sitzend', ziel: 'halten', einrichtungFertig: true }, gewicht: { datum: '2026-11-01', kg: 70 } });
  geloescht = [];
  zeit = 0;
  const uhr = () => new Date(Date.UTC(2026, 10, 4, 12, 0, zeit++)).toISOString();
  lebensmittel = new LebensmittelDienst(() => quelle, grund, () => {}, uhr);
  rezepte = new RezeptDienst(() => quelle, lebensmittel, (f) => geloescht.push(f), uhr);
  tagebuch = new TagebuchDienst(() => quelle, lebensmittel, rezepte, new TellerDienst(() => quelle, lebensmittel, rezepte), grund, () => 2026, uhr);
});

afterEach(() => {
  quelle.schliessen();
  grund.schliessen();
  rmSync(ordner, { recursive: true, force: true });
});

describe('Rezepte', () => {
  it('speichert und rechnet die Nährwerte aus den Zutaten', () => {
    const a = rezepte.speichern(rezept());
    expect(a.rezept.id).toMatch(/^rezept:/);
    expect(a.zutaten.map((z) => z.zutat.name)).toEqual(['Teigwaren eifrei, gekocht', 'Olivenöl']);
    expect(a.zutaten[1]!.bestandteil!.gramm).toBe(20); // 2 EL Öl
    expect(rezeptSumme(a.zutaten).werte.ENERCC!.menge).toBe(600 + 180);
    expect(rezepte.holen(a.rezept.id)?.rezept.notiz).toBe('Lecker');
    expect(rezepte.holen('rezept:gibtsnicht')).toBeNull();
  });
  it('ändert dasselbe Rezept, statt ein neues anzulegen', () => {
    const a = rezepte.speichern(rezept());
    const b = rezepte.speichern(rezept({ id: a.rezept.id, name: 'Nudeln' }));
    expect(b.rezept.id).toBe(a.rezept.id);
    expect(rezepte.liste({ text: '', hashtags: [] }).map((r) => r.name)).toEqual(['Nudeln']);
    expect(() => rezepte.speichern(rezept({ id: 'rezept:gibtsnicht' }))).toThrow(/nicht mehr/);
  });
  it('„Als neues Rezept speichern“ legt eine eigene Fassung an', () => {
    const a = rezepte.speichern(rezept());
    const b = rezepte.speichern(rezept({ name: 'Nudeln mit Öl (Variante)' }));
    expect(b.rezept.id).not.toBe(a.rezept.id);
    expect(rezepte.liste({ text: '', hashtags: [] })).toHaveLength(2);
  });
  it('die Liste nennt kcal und Eiweiß je Portion', () => {
    rezepte.speichern(rezept());
    expect(rezepte.liste({ text: '', hashtags: [] })[0]).toMatchObject({ portionen: 4, kcalJePortion: 195, eiweissJePortion: 5 });
  });
  it('Suche nach Namen verträgt Umlaute und Teilwörter', () => {
    rezepte.speichern(rezept({ name: 'Käsespätzle' }));
    rezepte.speichern(rezept({ name: 'Linsensuppe' }));
    expect(rezepte.liste({ text: 'kase', hashtags: [] }).map((r) => r.name)).toEqual(['Käsespätzle']);
    expect(rezepte.liste({ text: 'suppe', hashtags: [] }).map((r) => r.name)).toEqual(['Linsensuppe']);
    expect(rezepte.liste({ text: '', hashtags: [] }).map((r) => r.name)).toEqual(['Käsespätzle', 'Linsensuppe']);
  });
  it('neue Zutaten müssen existieren', () => {
    expect(() => rezepte.speichern(rezept({ zutaten: [zutat('bls:GIBTSNICHT', 100)] }))).toThrow(/gibt es nicht mehr/);
  });
  it('ändert sich ein Lebensmittel, ändert sich das Rezept mit', () => {
    const a = rezepte.speichern(rezept());
    lebensmittel.speichern({ id: 'bls:Q120000', name: 'Olivenöl', marke: null, basis: 'g', werte: { ENERCC: 500 }, schaetzung: null, nurNatuerlicherZucker: false, packung: null, foto: null });
    expect(rezeptSumme(rezepte.holen(a.rezept.id)!.zutaten).werte.ENERCC!.menge).toBe(600 + 100);
  });
  it('eine gelöschte Zutat fällt auf und zählt nicht mit, das Rezept bleibt', () => {
    const eigen: LebensmittelEingabe = { name: 'Mein Pesto', marke: null, basis: 'g', werte: { ENERCC: 500 }, schaetzung: null, nurNatuerlicherZucker: false, packung: null, foto: null };
    const lm = lebensmittel.speichern(eigen);
    const a = rezepte.speichern(rezept({ zutaten: [zutat('bls:C100000', 400), zutat(lm.id, 50)] }));
    lebensmittel.loeschen(lm.id);
    const nachher = rezepte.holen(a.rezept.id)!;
    expect(nachher.zutaten[1]).toMatchObject({ problem: 'gibt-es-nicht-mehr', bestandteil: null, zutat: { name: 'Mein Pesto' } });
    expect(rezeptSumme(nachher.zutaten).werte.ENERCC!.menge).toBe(600);
    // Das Rezept lässt sich trotzdem weiter speichern.
    expect(rezepte.speichern({ ...nachher.rezept, name: 'Neu' }).rezept.name).toBe('Neu');
  });
  it('fehlt ein Gewicht für die Einheit, sagt das Rezept es', () => {
    const a = rezepte.speichern(rezept({ zutaten: [zutat('bls:G770400', 1, 'Dose')] }));
    expect(a.zutaten[0]).toMatchObject({ problem: 'gewicht-fehlt', bestandteil: null });
    lebensmittel.umrechnungSpeichern('bls:G770400', { ...lebensmittel.holen('bls:G770400')!.umrechnung, dose: 240 });
    expect(rezepte.holen(a.rezept.id)!.zutaten[0]!.bestandteil!.gramm).toBe(240);
  });
  it('Vorschau für das Formular, ohne etwas zu speichern', () => {
    expect(rezepte.vorschau([zutat('bls:C100000', 100)])[0]!.bestandteil!.gramm).toBe(100);
    expect(rezepte.liste({ text: '', hashtags: [] })).toEqual([]);
    expect(() => rezepte.vorschau('Quatsch')).toThrow();
  });
  it('Fotos: Ersetzte und gelöschte verschwinden, geteilte bleiben', () => {
    const a = rezepte.speichern(rezept({ fotos: [FOTO(1), FOTO(2)] }));
    const kopie = rezepte.speichern(rezept({ name: 'Variante', fotos: [FOTO(1)] }));
    rezepte.speichern({ ...a.rezept, fotos: [FOTO(1)] });
    expect(geloescht).toEqual([FOTO(2)]);
    rezepte.loeschen(a.rezept.id);
    expect(geloescht).toEqual([FOTO(2)]); // Die Variante nutzt das Foto noch.
    rezepte.loeschen(kopie.rezept.id);
    expect(geloescht).toEqual([FOTO(2), FOTO(1)]);
    expect(rezepte.holen(kopie.rezept.id)).toBeNull();
  });
});

describe('Hashtags', () => {
  it('anlegen, umbenennen, einfärben', () => {
    const h = rezepte.hashtagSpeichern({ name: '#vegan', farbe: 'minze' });
    expect(h).toMatchObject({ name: 'vegan', farbe: 'minze' });
    rezepte.hashtagSpeichern({ id: h.id, name: 'pflanzlich', farbe: 'himmel' });
    expect(rezepte.hashtags()).toEqual([{ id: h.id, name: 'pflanzlich', farbe: 'himmel' }]);
    // Ohne Farbe bleibt die alte.
    expect(rezepte.hashtagSpeichern({ id: h.id, name: 'pflanzlich2' }).farbe).toBe('himmel');
  });
  it('keine doppelten Namen, auch nicht in anderer Schreibweise', () => {
    rezepte.hashtagSpeichern({ name: 'OnePot' });
    expect(() => rezepte.hashtagSpeichern({ name: 'onepot' })).toThrow(/gibt es schon/);
    expect(() => rezepte.hashtagSpeichern({ name: '!!!' })).toThrow();
  });
  it('ein Umbenennen ändert nichts an den Rezepten, die ihn tragen', () => {
    const h = rezepte.hashtagSpeichern({ name: 'vegan' });
    const a = rezepte.speichern(rezept({ hashtags: [h.id] }));
    rezepte.hashtagSpeichern({ id: h.id, name: 'pflanzlich' });
    expect(rezepte.holen(a.rezept.id)?.rezept.hashtags).toEqual([h.id]);
  });
  it('filtert nach mehreren Hashtags: alle müssen passen', () => {
    const vegan = rezepte.hashtagSpeichern({ name: 'vegan' });
    const schnell = rezepte.hashtagSpeichern({ name: 'schnell' });
    rezepte.speichern(rezept({ name: 'Beides', hashtags: [vegan.id, schnell.id] }));
    rezepte.speichern(rezept({ name: 'Nur vegan', hashtags: [vegan.id] }));
    rezepte.speichern(rezept({ name: 'Keiner' }));
    expect(rezepte.liste({ text: '', hashtags: [vegan.id] }).map((r) => r.name)).toEqual(['Beides', 'Nur vegan']);
    expect(rezepte.liste({ text: '', hashtags: [vegan.id, schnell.id] }).map((r) => r.name)).toEqual(['Beides']);
    expect(rezepte.liste({ text: 'nur', hashtags: [vegan.id] }).map((r) => r.name)).toEqual(['Nur vegan']);
  });
  it('löschen nimmt ihn aus allen Rezepten, die Rezepte bleiben', () => {
    const h = rezepte.hashtagSpeichern({ name: 'vegan' });
    const a = rezepte.speichern(rezept({ hashtags: [h.id] }));
    rezepte.hashtagLoeschen(h.id);
    expect(rezepte.hashtags()).toEqual([]);
    expect(rezepte.holen(a.rezept.id)?.rezept.hashtags).toEqual([]);
  });
  it('unbekannte Hashtags werden beim Speichern nicht übernommen', () => {
    expect(rezepte.speichern(rezept({ hashtags: ['gibtsnicht'] })).rezept.hashtags).toEqual([]);
  });
});

describe('Rezepte im Tagebuch', () => {
  const eintragen = (id: string, menge = 1) => tagebuch.eintragen({ datum: '2026-11-04', mahlzeit: 'abend', lebensmittelId: id, menge, einheit: 'Portion', groesse: null });

  it('trägt Portionen ein', () => {
    const a = rezepte.speichern(rezept());
    const e = eintragen(a.rezept.id, 1.5);
    expect(e).toMatchObject({ art: 'rezept', name: 'Nudeln mit Öl', menge: 1.5, einheit: 'Portion' });
    expect(tagessumme(tagebuch.tag('2026-11-04').eintraege).werte.ENERCC!.menge).toBeCloseTo((780 / 4) * 1.5, 5);
  });
  it('ein Rezept, das es nicht gibt, lässt sich nicht eintragen', () => {
    expect(() => eintragen('rezept:gibtsnicht')).toThrow(/gibt es nicht mehr/);
    expect(() => tagebuch.eintragen({ datum: '2026-11-04', mahlzeit: 'abend', lebensmittelId: 'bls:C100000', menge: 1, einheit: 'Portion', groesse: null })).toThrow();
  });
  it('das Tagebuch behält seinen Stand, wenn sich Rezept oder Zutat ändern', () => {
    const a = rezepte.speichern(rezept());
    const e = eintragen(a.rezept.id);
    const vorher = tagessumme(tagebuch.tag(e.datum).eintraege).werte.ENERCC!.menge;
    rezepte.speichern({ ...a.rezept, zutaten: [zutat('bls:C100000', 4000)] });
    lebensmittel.speichern({ id: 'bls:Q120000', name: 'Olivenöl', marke: null, basis: 'g', werte: { ENERCC: 1 }, schaetzung: null, nurNatuerlicherZucker: false, packung: null, foto: null });
    expect(tagessumme(tagebuch.tag(e.datum).eintraege).werte.ENERCC!.menge).toBeCloseTo(vorher, 5);
    rezepte.loeschen(a.rezept.id);
    expect(tagebuch.tag(e.datum).eintraege[0]).toMatchObject({ name: 'Nudeln mit Öl' });
  });
  it('Portionen ändern rechnet alle Zutaten um', () => {
    const e = eintragen(rezepte.speichern(rezept()).rezept.id);
    const neu = tagebuch.aendern(e.id, { menge: 2, einheit: 'Portion', groesse: null, mahlzeit: 'mittag' });
    expect(neu).toMatchObject({ menge: 2, mahlzeit: 'mittag' });
    expect(neu.rezept).toMatchObject({ angepasst: false });
    expect(neu.rezept!.bestandteile.map((b) => b.menge)).toEqual([200, 1]);
  });
  it('die Zutaten für dieses eine Mal ändern: weniger Öl, das Rezept bleibt', () => {
    const a = rezepte.speichern(rezept());
    const e = eintragen(a.rezept.id);
    const [nudeln, oel] = e.rezept!.bestandteile;
    const neu = tagebuch.aendern(e.id, {
      menge: 1,
      einheit: 'Portion',
      groesse: null,
      mahlzeit: 'abend',
      bestandteile: [
        { id: nudeln!.id, menge: nudeln!.menge, einheit: nudeln!.einheit, groesse: null },
        { id: oel!.id, menge: 0.25, einheit: 'EL', groesse: null },
      ],
    });
    expect(neu.rezept).toMatchObject({ angepasst: true });
    expect(tagessumme([neu]).werte.ENERCC!.menge).toBeCloseTo(150 + (2.5 * 900) / 100, 5);
    expect(rezepte.holen(a.rezept.id)!.rezept.zutaten[1]!.menge).toBe(2);
  });
  it('eine Zutat weglassen und eine dazunehmen', () => {
    const e = eintragen(rezepte.speichern(rezept()).rezept.id);
    const nudeln = e.rezept!.bestandteile[0]!;
    const neu = tagebuch.aendern(e.id, {
      menge: 1,
      einheit: 'Portion',
      groesse: null,
      mahlzeit: 'abend',
      bestandteile: [
        { id: nudeln.id, menge: nudeln.menge, einheit: nudeln.einheit, groesse: null },
        { lebensmittelId: 'bls:E111100', menge: 1, einheit: 'Stück', groesse: 'L' },
      ],
    });
    expect(neu.rezept!.bestandteile.map((b) => b.name)).toEqual(['Teigwaren eifrei, gekocht', 'Hühnerei roh']);
    expect(neu.rezept!.bestandteile[1]!.gramm).toBe(60);
  });
  it('alle Zutaten weglassen geht nicht, dann lieber den Eintrag löschen', () => {
    const e = eintragen(rezepte.speichern(rezept()).rezept.id);
    expect(() => tagebuch.aendern(e.id, { menge: 1, einheit: 'Portion', groesse: null, mahlzeit: 'abend', bestandteile: [] })).toThrow(/mindestens eine Zutat/);
  });
  it('zuletzt gegessen kennt auch Rezepte', () => {
    const a = rezepte.speichern(rezept());
    eintragen(a.rezept.id);
    expect(tagebuch.zuletztGegessen()[0]).toMatchObject({ id: a.rezept.id, herkunft: 'rezept', name: 'Nudeln mit Öl', kcal: 195 });
    rezepte.loeschen(a.rezept.id);
    expect(tagebuch.zuletztGegessen()).toEqual([]);
  });
  it('Rezepte kommen als Vorschlag, immer als Portion', () => {
    const a = rezepte.speichern(rezept({ name: 'Kichererbsen-Curry', portionen: 2, zutaten: [zutat('bls:G770400', 400)] }));
    const v = tagebuch.vorschlaege('2026-11-04').vorschlaege.find((x) => x.lebensmittelId === a.rezept.id);
    expect(v).toMatchObject({ herkunft: 'rezept', menge: 1, einheit: 'Portion', groesse: null, gramm: 200, kcal: 240 });
    const e = tagebuch.eintragen({ datum: '2026-11-04', mahlzeit: 'abend', lebensmittelId: v!.lebensmittelId, menge: v!.menge, einheit: v!.einheit, groesse: v!.groesse });
    expect(e.gramm).toBeCloseTo(200, 5);
  });
  it('passt keine ganze Portion mehr, kommt eine halbe, und sonst keine', () => {
    const a = rezepte.speichern(rezept({ name: 'Curry', portionen: 1, zutaten: [zutat('bls:G770400', 1000)] })); // 1.200 kcal je Portion
    const eigen = lebensmittel.speichern({ name: 'Volle Kelle', marke: null, basis: 'g', werte: { ENERCC: 100, PROT625: 1 }, schaetzung: null, nurNatuerlicherZucker: false, packung: null, foto: null });
    const { profil, gewichte } = quelle.laden();
    expect(profil && gewichte).toBeTruthy();
    const kcalZiel = 2318; // Bedarf dieser erfundenen Person
    tagebuch.eintragen({ datum: '2026-11-04', mahlzeit: 'mittag', lebensmittelId: eigen.id, menge: kcalZiel - 800, einheit: 'g', groesse: null });
    const halb = tagebuch.vorschlaege('2026-11-04').vorschlaege.find((x) => x.lebensmittelId === a.rezept.id);
    expect(halb).toMatchObject({ menge: 0.5, einheit: 'Portion' });
    tagebuch.eintragen({ datum: '2026-11-04', mahlzeit: 'mittag', lebensmittelId: eigen.id, menge: 400, einheit: 'g', groesse: null });
    expect(tagebuch.vorschlaege('2026-11-04').vorschlaege.find((x) => x.lebensmittelId === a.rezept.id)).toBeUndefined();
  });
});

describe('Datenbank', () => {
  it('eine Datei der vorigen Fassung bekommt die neuen Tabellen und behält ihre Daten', () => {
    const datei = join(ordner, 'alt.sqlite');
    const alt = SqliteQuelle.oeffnen(datei);
    alt.migrieren();
    const db = new DatabaseSync(datei);
    db.exec('DROP TABLE einkaufsliste; DROP TABLE teller; DROP TABLE rezepte; DROP TABLE hashtags; PRAGMA user_version = 3;');
    db.close();
    alt.schliessen();
    const neu = SqliteQuelle.oeffnen(datei);
    neu.migrieren();
    expect(neu.rezepteListe()).toEqual([]);
    expect(neu.hashtagsListe()).toEqual([]);
    neu.schliessen();
  });
});
