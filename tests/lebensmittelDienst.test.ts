/** Grundbestand, eigene Lebensmittel und persönliche Versionen zusammen, mit einem kleinen erfundenen BLS. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { grundbestandOeffnen, LEERER_GRUNDBESTAND, type Grundbestand } from '../src/main/daten/bls';
import { LebensmittelDienst } from '../src/main/daten/lebensmittelDienst';
import { SqliteQuelle } from '../src/main/daten/sqlite';
import { BLS_FASSUNG, BLS_SCHEMA } from '@shared/blsAufbau';
import type { LebensmittelEingabe } from '@shared/lebensmittel';

let ordner: string;
let quelle: SqliteQuelle;
let grund: Grundbestand;
let dienst: LebensmittelDienst;
let geloeschteFotos: string[];
let zeit: number;

function blsBauen(datei: string): void {
  const db = new DatabaseSync(datei);
  db.exec(BLS_SCHEMA);
  db.prepare('INSERT INTO info VALUES (?, ?)').run('fassung', BLS_FASSUNG);
  const rein = db.prepare('INSERT INTO lebensmittel VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const zeile = (code: string, name: string, werte: Record<string, number>, spuren: string[] = [], frei: number | null = 0, hinweise: string[] = []) =>
    rein.run(code, name, null, JSON.stringify(werte), JSON.stringify(spuren), frei, null, JSON.stringify(hinweise));
  zeile('M100000', 'Testkäse mild, 30 % Fett', { ENERCC: 300, PROT625: 25, FAT: 22, CHO: 0, CA: 700, VITB12: 1.5, ID: 3 }, ['ID']);
  zeile('M200000', 'Frischkäse Testart', { ENERCC: 250, PROT625: 7, FAT: 24, CHO: 3, SUGAR: 3, LACS: 3, CA: 80, VITA: 200 });
  zeile('F100000', 'Apfel roh', { ENERCC: 54, CHO: 12, SUGAR: 10, VITC: 12 });
  zeile('E100000', 'Hühnerei roh', { ENERCC: 137, PROT625: 12, FAT: 9.3 });
  zeile('S100000', 'Honig', { ENERCC: 310, SUGAR: 80 }, [], 80, ['Korrigiert laut Erratum: Testhinweis.']);
  db.close();
}

const neu = (teil: Partial<LebensmittelEingabe> = {}): LebensmittelEingabe => ({
  name: 'Mein Skyr',
  marke: 'Testhof',
  basis: 'g',
  werte: { ENERCC: 60, PROT625: 11, FAT: 0.2, CHO: 4, SUGAR: 4 },
  schaetzung: null,
  nurNatuerlicherZucker: false,
  packung: 450,
  foto: null,
  ...teil,
});

beforeEach(() => {
  ordner = mkdtempSync(join(tmpdir(), 'starkmacher-lm-'));
  blsBauen(join(ordner, 'bls.sqlite'));
  grund = grundbestandOeffnen(join(ordner, 'bls.sqlite'));
  quelle = SqliteQuelle.oeffnen(join(ordner, 'starkmacher.sqlite'));
  quelle.migrieren();
  geloeschteFotos = [];
  zeit = 0;
  dienst = new LebensmittelDienst(
    () => quelle,
    grund,
    (name) => geloeschteFotos.push(name),
    () => new Date(Date.UTC(2026, 10, 4, 12, 0, zeit++)).toISOString(),
  );
});

afterEach(() => {
  quelle.schliessen();
  grund.schliessen();
  rmSync(ordner, { recursive: true, force: true });
});

const namen = (liste: readonly { name: string }[]) => liste.map((l) => l.name);

describe('Suche über alles', () => {
  it('findet BLS und Eigenes, auch mit Teilwort und Umlaut', () => {
    dienst.speichern(neu({ name: 'Bergkäse vom Hof' }));
    const e = dienst.suchen({ text: 'kaese', filter: 'alle' });
    expect(namen(e.treffer)).toEqual(expect.arrayContaining(['Testkäse mild, 30 % Fett', 'Frischkäse Testart', 'Bergkäse vom Hof']));
    expect(e.gesamt).toBe(3);
    expect(e.grundbestandDa).toBe(true);
  });
  it('filtert nach BLS und eigenen', () => {
    dienst.speichern(neu({ name: 'Apfelmus vom Hof' }));
    expect(namen(dienst.suchen({ text: 'apfel', filter: 'bls' }).treffer)).toEqual(['Apfel roh']);
    expect(namen(dienst.suchen({ text: 'apfel', filter: 'eigene' }).treffer)).toEqual(['Apfelmus vom Hof']);
    expect(namen(dienst.suchen({ text: 'apfel', filter: 'alle' }).treffer)).toHaveLength(2);
  });
  it('ohne Suchwort zeigt „nur eigene“ alle eigenen und sonst nichts außer „zuletzt“', () => {
    dienst.speichern(neu());
    expect(namen(dienst.suchen({ text: '', filter: 'eigene' }).treffer)).toEqual(['Mein Skyr']);
    expect(dienst.suchen({ text: '', filter: 'alle' }).treffer).toEqual([]);
  });
  it('zuletzt Verwendetes steht zuerst, das neueste oben, und richtet sich nach dem Filter', () => {
    dienst.verwendet('bls:F100000');
    dienst.verwendet('bls:E100000');
    const eigen = dienst.speichern(neu());
    dienst.verwendet('bls:F100000');
    expect(namen(dienst.suchen({ text: '', filter: 'alle' }).zuletzt)).toEqual(['Apfel roh', 'Mein Skyr', 'Hühnerei roh']);
    expect(namen(dienst.suchen({ text: '', filter: 'bls' }).zuletzt)).toEqual(['Apfel roh', 'Hühnerei roh']);
    expect(namen(dienst.suchen({ text: '', filter: 'eigene' }).zuletzt)).toEqual(['Mein Skyr']);
    dienst.loeschen(eigen.id);
    expect(namen(dienst.suchen({ text: '', filter: 'alle' }).zuletzt)).toEqual(['Apfel roh', 'Hühnerei roh']);
  });
  it('merkt sich nur, was es gibt', () => {
    dienst.verwendet('bls:GIBTSNICHT');
    expect(quelle.zuletztVerwendet(5)).toEqual([]);
  });
});

describe('BLS-Lebensmittel', () => {
  it('kommt mit Werten, Spuren, Hinweisen und Standardumrechnung', () => {
    const k = dienst.holen('bls:M100000')!;
    expect(k).toMatchObject({ herkunft: 'bls', gruppe: 'M', name: 'Testkäse mild, 30 % Fett', spuren: ['ID'], umrechnungAngepasst: false });
    expect(dienst.holen('bls:S100000')!.hinweise).toHaveLength(1);
    expect(dienst.holen('bls:E100000')!.umrechnung.groessen).not.toBeNull();
    expect(dienst.holen('bls:GIBTSNICHT')).toBeNull();
    expect(dienst.holen('eigen:gibtsnicht')).toBeNull();
  });
});

describe('Eigene Lebensmittel', () => {
  it('speichert, liest und aktualisiert, ohne neue Einträge', () => {
    const lm = dienst.speichern(neu());
    expect(lm.id).toMatch(/^eigen:/);
    expect(lm).toMatchObject({ herkunft: 'eigen', name: 'Mein Skyr', marke: 'Testhof', freierZuckerG: 4 });
    const geaendert = dienst.speichern(neu({ id: lm.id, name: 'Mein Skyr Natur', nurNatuerlicherZucker: true }));
    expect(geaendert.id).toBe(lm.id);
    expect(geaendert).toMatchObject({ name: 'Mein Skyr Natur', freierZuckerG: 0 });
    expect(dienst.suchen({ text: 'skyr', filter: 'eigene' }).gesamt).toBe(1);
  });
  it('die Packungsgröße macht „1 Packung“ rechenbar', () => {
    expect(dienst.speichern(neu()).umrechnung.packung).toBe(450);
    expect(dienst.speichern(neu({ name: 'Saft', basis: 'ml', packung: 1000 })).umrechnung.packung).toBeCloseTo(1030, 5); // 1 l in Gramm
  });
  it('ändern lässt sich nur, was es gibt', () => {
    expect(() => dienst.speichern(neu({ id: 'eigen:gibtsnicht' }))).toThrow(/nicht mehr/);
    expect(() => dienst.speichern(neu({ id: 'bls:GIBTSNICHT' }))).toThrow(/Original/);
  });
  it('Löschen entfernt auch das Foto, und ein ersetztes Foto verschwindet', () => {
    const f1 = '11111111-1111-1111-1111-111111111111.jpg';
    const f2 = '22222222-2222-2222-2222-222222222222.jpg';
    const lm = dienst.speichern(neu({ foto: f1 }));
    dienst.speichern(neu({ id: lm.id, foto: f2 }));
    expect(geloeschteFotos).toEqual([f1]);
    dienst.loeschen(lm.id);
    expect(geloeschteFotos).toEqual([f1, f2]);
    expect(dienst.holen(lm.id)).toBeNull();
  });
});

describe('Persönliche Version', () => {
  const aendern = (teil: Partial<LebensmittelEingabe> = {}) => dienst.speichern(neu({ id: 'bls:M200000', name: 'Frischkäse Testart', marke: null, werte: { ENERCC: 200, PROT625: 8, FAT: 18, CHO: 3, SUGAR: 3, LACS: 3 }, packung: null, ...teil }));

  it('liegt über dem Original, das unverändert bleibt', () => {
    const v = aendern();
    expect(v).toMatchObject({ id: 'bls:M200000', herkunft: 'version', gruppe: 'M' });
    expect(v.werte.ENERCC).toBe(200);
    expect(grund.holen('M200000')!.werte.ENERCC).toBe(250);
  });
  it('erscheint in der Suche statt des Originals, auch im Filter „nur BLS“', () => {
    aendern({ name: 'Frischkäse Testart, meine Sorte' });
    for (const filter of ['alle', 'bls'] as const) {
      const treffer = dienst.suchen({ text: 'frischkase', filter }).treffer;
      expect(treffer).toHaveLength(1);
      expect(treffer[0]).toMatchObject({ herkunft: 'version', name: 'Frischkäse Testart, meine Sorte', kcal: 200 });
    }
    expect(dienst.suchen({ text: 'frischkase', filter: 'eigene' }).treffer).toHaveLength(1);
  });
  it('lässt sich auf das Original zurücksetzen', () => {
    aendern();
    dienst.loeschen('bls:M200000');
    expect(dienst.holen('bls:M200000')).toMatchObject({ herkunft: 'bls' });
    expect(dienst.holen('bls:M200000')!.werte.ENERCC).toBe(250);
    expect(dienst.suchen({ text: 'frischkase', filter: 'alle' }).treffer[0]).toMatchObject({ herkunft: 'bls', kcal: 250 });
  });
  it('freier Zucker rechnet die Laktose heraus, außer der Haken ist gesetzt', () => {
    expect(aendern({ werte: { SUGAR: 10, LACS: 3 } }).freierZuckerG).toBe(7);
    expect(aendern({ werte: { SUGAR: 10, LACS: 3 }, nurNatuerlicherZucker: true }).freierZuckerG).toBe(0);
    expect(aendern({ werte: {}, nurNatuerlicherZucker: true }).freierZuckerG).toBeNull();
  });
  it('Spuren gelten nur, solange der Wert noch 0 ist', () => {
    const name = 'Testkäse mild, 30 % Fett';
    expect(dienst.speichern(neu({ id: 'bls:M100000', name, werte: { ID: 0 } })).spuren).toEqual(['ID']);
    expect(dienst.speichern(neu({ id: 'bls:M100000', name, werte: { ID: 5 } })).spuren).toEqual([]);
  });
});

describe('Umrechnungen', () => {
  it('gelten je Lebensmittel und lassen sich zurücksetzen', () => {
    const apfel = dienst.holen('bls:F100000')!;
    expect(apfel.umrechnung.stueck).toBe(140);
    const angepasst = dienst.umrechnungSpeichern('bls:F100000', { ...apfel.umrechnung, stueck: 200 });
    expect(angepasst).toMatchObject({ umrechnungAngepasst: true, herkunft: 'bls' });
    expect(angepasst.umrechnung.stueck).toBe(200);
    expect(dienst.holen('bls:E100000')!.umrechnung.stueck).toBeNull();
    expect(dienst.umrechnungSpeichern('bls:F100000', null).umrechnung.stueck).toBe(140);
  });
  it('lehnt Falsches ab', () => {
    const apfel = dienst.holen('bls:F100000')!;
    expect(() => dienst.umrechnungSpeichern('bls:F100000', { ...apfel.umrechnung, el: -2 })).toThrow();
    expect(() => dienst.umrechnungSpeichern('bls:GIBTSNICHT', apfel.umrechnung)).toThrow();
  });
  it('überleben eine persönliche Version und das Zurücksetzen', () => {
    const apfel = dienst.holen('bls:F100000')!;
    dienst.umrechnungSpeichern('bls:F100000', { ...apfel.umrechnung, stueck: 200 });
    dienst.speichern(neu({ id: 'bls:F100000', name: 'Apfel roh', werte: { ENERCC: 60 }, packung: null }));
    expect(dienst.holen('bls:F100000')!.umrechnung.stueck).toBe(200);
    dienst.loeschen('bls:F100000');
    expect(dienst.holen('bls:F100000')!.umrechnung.stueck).toBe(200);
  });
});

describe('Schätzung', () => {
  it('schlägt ähnliche Lebensmittel vor und trägt selbst nichts ein', () => {
    const lm = dienst.speichern(neu({ name: 'Frischkäse Kräuter', werte: { ENERCC: 240, FAT: 22, CHO: 3, PROT625: 7 } }));
    const vorschlaege = dienst.aehnliche({ name: lm.name, werte: lm.werte });
    expect(vorschlaege[0]).toMatchObject({ code: 'M200000', name: 'Frischkäse Testart' });
    expect(vorschlaege[0]!.schaetzung.werte).toEqual({ LACS: 3, CA: 80, VITA: 200 });
    expect(vorschlaege[0]!.vergleich).toMatchObject({ FAT: 24 });
    expect(dienst.holen(lm.id)!.schaetzung).toBeNull();
  });
  it('die übernommene Schätzung bleibt beim Lebensmittel, getrennt von den eigenen Werten', () => {
    const lm = dienst.speichern(neu({ schaetzung: { code: 'M200000', name: 'Frischkäse Testart', werte: { CA: 80 } } }));
    expect(dienst.holen(lm.id)).toMatchObject({ schaetzung: { name: 'Frischkäse Testart', werte: { CA: 80 } } });
    expect(dienst.holen(lm.id)!.werte.CA).toBeUndefined();
  });
});

describe('Ohne Grundbestand', () => {
  it('fehlt die Datei, bleiben die eigenen Lebensmittel benutzbar', () => {
    const ohne = new LebensmittelDienst(() => quelle, grundbestandOeffnen(join(ordner, 'gibtsnicht.sqlite')));
    ohne.speichern(neu());
    const e = ohne.suchen({ text: 'skyr', filter: 'alle' });
    expect(e).toMatchObject({ gesamt: 1, grundbestandDa: false });
    expect(ohne.aehnliche({ name: 'Skyr', werte: {} })).toEqual([]);
    expect(LEERER_GRUNDBESTAND.holen('M1')).toBeNull();
  });
  it('eine fremde Fassung wird nicht gelesen', () => {
    const datei = join(ordner, 'alt.sqlite');
    const db = new DatabaseSync(datei);
    db.exec(BLS_SCHEMA);
    db.prepare('INSERT INTO info VALUES (?, ?)').run('fassung', 'alt');
    db.close();
    expect(grundbestandOeffnen(datei)).toBe(LEERER_GRUNDBESTAND);
  });
});

describe('Datenbank', () => {
  it('eine ältere Datei bekommt die neuen Tabellen und behält ihre Daten', () => {
    const datei = join(ordner, 'alt-profil.sqlite');
    const db = new DatabaseSync(datei);
    db.exec(`CREATE TABLE profile (id TEXT PRIMARY KEY, geschlecht TEXT, geburtsjahr INTEGER, groesse_cm REAL, aktivitaet TEXT, sport INTEGER NOT NULL DEFAULT 0, ziel TEXT,
      tempo TEXT NOT NULL DEFAULT 'sanft', eigene_kcal REAL, eigene_eiweiss_g REAL, eigene_fett_g REAL, eigene_kohlenhydrate_g REAL, einrichtung_fertig INTEGER NOT NULL DEFAULT 0,
      stueckware TEXT NOT NULL DEFAULT 'groesse', ausgeblendet TEXT NOT NULL DEFAULT '[]', letzte_ziele TEXT, geaendert_am TEXT NOT NULL);
      CREATE TABLE gewichte (profil_id TEXT NOT NULL REFERENCES profile(id), datum TEXT NOT NULL, kg REAL NOT NULL, PRIMARY KEY (profil_id, datum));
      INSERT INTO profile (id, geschlecht, geaendert_am) VALUES ('ich', 'weiblich', 'x');
      PRAGMA user_version = 1;`);
    db.close();
    const alt = SqliteQuelle.oeffnen(datei);
    alt.migrieren();
    expect(alt.laden().profil.geschlecht).toBe('weiblich');
    expect(alt.eigeneListe()).toEqual([]);
    alt.schliessen();
  });
});
