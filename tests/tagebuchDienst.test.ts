/** Das Tagebuch mit echter Datenbankdatei und einem kleinen erfundenen BLS. */
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
import { leeresProfil, PROFIL_ID, type Profil } from '@shared/profil';
import type { EintragEingabe } from '@shared/tagebuch';

let ordner: string;
let quelle: SqliteQuelle;
let grund: Grundbestand;
let lebensmittel: LebensmittelDienst;
let tagebuch: TagebuchDienst;
let zeit: number;

function blsBauen(datei: string): void {
  const db = new DatabaseSync(datei);
  db.exec(BLS_SCHEMA);
  db.prepare('INSERT INTO info VALUES (?, ?)').run('fassung', BLS_FASSUNG);
  const rein = db.prepare('INSERT INTO lebensmittel VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const zeile = (code: string, name: string, werte: Record<string, number>, frei: number | null = 0) => rein.run(code, name, null, JSON.stringify(werte), '[]', frei, null, '[]');
  zeile('M710100', 'Skyr, Frischkäse < 10 % Fett i. Tr.', { ENERCC: 60, PROT625: 11, FAT: 0.2, CHO: 4, SUGAR: 4, CA: 120, ID: 10, NACL: 0.1 });
  zeile('F110100', 'Apfel roh', { ENERCC: 54, CHO: 12, SUGAR: 10, VITC: 12, FIBT: 2 });
  zeile('E111100', 'Hühnerei roh', { ENERCC: 137, PROT625: 12, FAT: 9.3, VITB12: 2, NACL: 0.4 });
  zeile('T100172', 'Lachs gegrillt', { ENERCC: 220, PROT625: 25, FAT: 13, 'F20:5CN3': 0.7, 'F22:6CN3': 1.2, NACL: 0.3 });
  zeile('T100100', 'Lachs roh', { ENERCC: 200, PROT625: 20, FAT: 13 });
  zeile('S120000', 'Honig', { ENERCC: 310, SUGAR: 70 }, 70);
  zeile('Q110000', 'Rapsöl/Rüböl', { ENERCC: 900, FAT: 100, 'F18:3CN3': 9, VITE: 25, FASAT: 8 });
  db.close();
}

const profil = (teil: Partial<Profil> = {}): Profil => ({
  ...leeresProfil(),
  id: PROFIL_ID,
  geschlecht: 'maennlich',
  geburtsjahr: 1986,
  groesseCm: 180,
  aktivitaet: 'sitzend',
  ziel: 'halten',
  einrichtungFertig: true,
  ...teil,
});

const eingabe = (teil: Partial<EintragEingabe> = {}): EintragEingabe => ({ datum: '2026-11-04', mahlzeit: 'mittag', lebensmittelId: 'bls:M710100', menge: 150, einheit: 'g', groesse: null, ...teil });
const eigenes = (teil: Partial<LebensmittelEingabe> = {}): LebensmittelEingabe => ({ name: 'Mein Riegel', marke: null, basis: 'g', werte: { ENERCC: 400, PROT625: 30, NACL: 0.5 }, schaetzung: null, nurNatuerlicherZucker: false, packung: null, foto: null, ...teil });

beforeEach(() => {
  ordner = mkdtempSync(join(tmpdir(), 'starkmacher-tb-'));
  blsBauen(join(ordner, 'bls.sqlite'));
  grund = grundbestandOeffnen(join(ordner, 'bls.sqlite'));
  quelle = SqliteQuelle.oeffnen(join(ordner, 'starkmacher.sqlite'));
  quelle.migrieren();
  quelle.speichern({ profil: profil(), gewicht: { datum: '2026-11-01', kg: 70 } });
  zeit = 0;
  const uhr = () => new Date(Date.UTC(2026, 10, 4, 12, 0, zeit++)).toISOString();
  lebensmittel = new LebensmittelDienst(() => quelle, grund, () => {}, uhr);
  const rezepte = new RezeptDienst(() => quelle, lebensmittel);
  tagebuch = new TagebuchDienst(() => quelle, lebensmittel, rezepte, new TellerDienst(() => quelle, lebensmittel, rezepte), grund, () => 2026, uhr);
});

afterEach(() => {
  quelle.schliessen();
  grund.schliessen();
  rmSync(ordner, { recursive: true, force: true });
});

describe('Einträge', () => {
  it('stehen beim richtigen Tag, in der eingetragenen Reihenfolge', () => {
    tagebuch.eintragen(eingabe({ lebensmittelId: 'bls:F110100' }));
    tagebuch.eintragen(eingabe());
    tagebuch.eintragen(eingabe({ datum: '2026-11-05' }));
    expect(tagebuch.tag('2026-11-04').eintraege.map((e) => e.name)).toEqual(['Apfel roh', 'Skyr, Frischkäse < 10 % Fett i. Tr.']);
    expect(tagebuch.tag('2026-11-05').eintraege).toHaveLength(1);
    expect(tagebuch.tag('2026-11-06').eintraege).toEqual([]);
  });
  it('lehnt falsche Eingaben ab', () => {
    expect(() => tagebuch.tag('kein Datum')).toThrow(/Datum/);
    expect(() => tagebuch.eintragen(eingabe({ lebensmittelId: 'bls:GIBTSNICHT' }))).toThrow(/gibt es nicht/);
    expect(() => tagebuch.eintragen(eingabe({ menge: -1 }))).toThrow(/Menge/);
    expect(() => tagebuch.aendern('gibtsnicht', { menge: 1, einheit: 'g', mahlzeit: 'mittag' })).toThrow(/nicht mehr/);
    expect(() => tagebuch.vorschlaege('kein Datum')).toThrow(/Datum/);
  });
  it('lassen sich ändern und löschen', () => {
    const e = tagebuch.eintragen(eingabe());
    expect(tagebuch.aendern(e.id, { menge: 2, einheit: 'EL', groesse: null, mahlzeit: 'abend' })).toMatchObject({ menge: 2, einheit: 'EL', mahlzeit: 'abend', datum: e.datum });
    expect(tagebuch.tag(e.datum).eintraege[0]).toMatchObject({ mahlzeit: 'abend', menge: 2 });
    tagebuch.loeschen(e.id);
    expect(tagebuch.tag(e.datum).eintraege).toEqual([]);
  });
});

describe('Das Tagebuch behält seinen Stand', () => {
  it('auch wenn das Lebensmittel später eine eigene Version bekommt', () => {
    const e = tagebuch.eintragen(eingabe());
    lebensmittel.speichern(eigenes({ id: 'bls:M710100', name: 'Skyr, Frischkäse', werte: { ENERCC: 999 } }));
    const alt = tagebuch.tag(e.datum).eintraege[0]!;
    expect(alt.werteJe100g.ENERCC).toBe(60);
    // Eine neue Eintragung nimmt den neuen Stand.
    expect(tagebuch.eintragen(eingabe()).werteJe100g.ENERCC).toBe(999);
  });
  it('auch wenn das eigene Lebensmittel gelöscht wird, und die Menge bleibt änderbar', () => {
    const lm = lebensmittel.speichern(eigenes());
    const e = tagebuch.eintragen(eingabe({ lebensmittelId: lm.id, menge: 50 }));
    lebensmittel.loeschen(lm.id);
    expect(tagebuch.tag(e.datum).eintraege[0]).toMatchObject({ name: 'Mein Riegel', gramm: 50 });
    expect(tagebuch.aendern(e.id, { menge: 100, einheit: 'g', groesse: null, mahlzeit: 'snacks' }).werteJe100g.ENERCC).toBe(400);
  });
  it('auch wenn sich die Umrechnung des Lebensmittels ändert', () => {
    const apfel = lebensmittel.holen('bls:F100000');
    expect(apfel).toBeNull();
    const e = tagebuch.eintragen(eingabe({ lebensmittelId: 'bls:F110100', menge: 1, einheit: 'Stück' }));
    expect(e.gramm).toBe(140);
    lebensmittel.umrechnungSpeichern('bls:F110100', { ...lebensmittel.holen('bls:F110100')!.umrechnung, stueck: 300 });
    expect(tagebuch.aendern(e.id, { menge: 2, einheit: 'Stück', groesse: null, mahlzeit: 'mittag' }).gramm).toBe(280);
  });
  it('und übersteht das Schließen der Datei', () => {
    const e = tagebuch.eintragen(eingabe());
    quelle.schliessen();
    quelle = SqliteQuelle.oeffnen(join(ordner, 'starkmacher.sqlite'));
    quelle.migrieren();
    expect(tagebuch.tag(e.datum).eintraege[0]).toEqual(e);
  });
});

describe('Zuletzt gegessen', () => {
  it('das neueste zuerst, jedes einmal', () => {
    tagebuch.eintragen(eingabe({ lebensmittelId: 'bls:F110100' }));
    tagebuch.eintragen(eingabe({ lebensmittelId: 'bls:M710100' }));
    tagebuch.eintragen(eingabe({ lebensmittelId: 'bls:E111100', menge: 1, einheit: 'Stück', groesse: 'L' }));
    tagebuch.eintragen(eingabe({ lebensmittelId: 'bls:F110100', datum: '2026-11-05' }));
    expect(tagebuch.zuletztGegessen().map((k) => k.name)).toEqual(['Apfel roh', 'Hühnerei roh', 'Skyr, Frischkäse < 10 % Fett i. Tr.']);
  });
  it('was es nicht mehr gibt, fällt weg, und eine eigene Version gilt', () => {
    const lm = lebensmittel.speichern(eigenes());
    tagebuch.eintragen(eingabe({ lebensmittelId: lm.id }));
    tagebuch.eintragen(eingabe({ lebensmittelId: 'bls:F110100' }));
    lebensmittel.speichern(eigenes({ id: 'bls:F110100', name: 'Mein Apfel' }));
    lebensmittel.loeschen(lm.id);
    expect(tagebuch.zuletztGegessen().map((k) => k.name)).toEqual(['Mein Apfel']);
  });
});

describe('Vorschläge', () => {
  it('kommen aus BLS und Eigenem, nie roher Lachs oder Honig', () => {
    const lm = lebensmittel.speichern(eigenes());
    const { vorschlaege, kalorienErreicht } = tagebuch.vorschlaege('2026-11-04');
    const ids = vorschlaege.map((v) => v.lebensmittelId);
    expect(kalorienErreicht).toBe(false);
    expect(ids).toContain(lm.id);
    expect(ids).toContain('bls:T100172');
    expect(ids).not.toContain('bls:T100100');
    expect(ids).not.toContain('bls:S120000');
  });
  it('lassen sich direkt eintragen, und die Lücke wird kleiner', () => {
    const v = tagebuch.vorschlaege('2026-11-04').vorschlaege[0]!;
    const e = tagebuch.eintragen({ datum: '2026-11-04', mahlzeit: 'abend', lebensmittelId: v.lebensmittelId, menge: v.menge, einheit: v.einheit, groesse: v.groesse });
    expect(e.gramm).toBeCloseTo(v.gramm, 5);
    expect(tagebuch.tag('2026-11-04').eintraege).toHaveLength(1);
  });
  it('sind die Kalorien erreicht, sagt die Antwort das', () => {
    const lm = lebensmittel.speichern(eigenes({ name: 'Viel', werte: { ENERCC: 900 } }));
    tagebuch.eintragen(eingabe({ lebensmittelId: lm.id, menge: 5000 }));
    const a = tagebuch.vorschlaege('2026-11-04');
    expect(a).toMatchObject({ vorschlaege: [], kalorienErreicht: true });
  });
  it('die persönliche Version ersetzt das Original auch hier', () => {
    lebensmittel.speichern(eigenes({ id: 'bls:T100172', name: 'Lachs gegrillt', werte: { ENERCC: 220, PROT625: 1, NACL: 0 } }));
    const lachs = tagebuch.vorschlaege('2026-11-04').vorschlaege.filter((v) => v.name === 'Lachs gegrillt');
    for (const v of lachs) expect(v.herkunft).toBe('version');
  });
  it('die eigene Stückware-Einstellung gilt', () => {
    quelle.speichern({ profil: profil({ stueckware: 'gramm' }) });
    const ei = tagebuch.vorschlaege('2026-11-04').vorschlaege.find((v) => v.name === 'Hühnerei roh');
    if (ei) expect(ei.einheit).toBe('g');
  });
  it('ohne vollständiges Profil gibt es keine', () => {
    quelle.speichern({ profil: profil({ geburtsjahr: null }) });
    expect(tagebuch.vorschlaege('2026-11-04').vorschlaege).toEqual([]);
  });
});
