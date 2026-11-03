/** Speichern in SQLite und Datenbaustein. Alles mit erfundenen Daten in einem eigenen Ordner. */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatenDienst } from '../src/main/daten/dienst';
import { datenbankLesbar, SqliteQuelle } from '../src/main/daten/sqlite';
import { leeresProfil, type Profil } from '@shared/profil';

let ordner: string;
const datei = () => join(ordner, 'starkmacher.sqlite');

const beispiel = (): Profil => ({
  ...leeresProfil(),
  geschlecht: 'weiblich',
  geburtsjahr: 1990,
  groesseCm: 168,
  aktivitaet: 'gehend',
  sport: true,
  ziel: 'abnehmen',
  tempo: 'mittel',
  einrichtungFertig: true,
  stueckware: 'gramm',
  ausgeblendet: ['VITK', 'CR'],
  letzteZiele: { kcal: 1900, eiweissG: 100 },
});

beforeEach(() => {
  ordner = mkdtempSync(join(tmpdir(), 'starkmacher-test-'));
});
afterEach(() => {
  rmSync(ordner, { recursive: true, force: true });
});

function neueQuelle(): SqliteQuelle {
  const q = SqliteQuelle.oeffnen(datei());
  q.migrieren();
  return q;
}

describe('SQLite', () => {
  it('ein neues Programm hat ein leeres Profil und nichts zu sichern', () => {
    const q = neueQuelle();
    expect(q.hatDaten()).toBe(false);
    expect(q.laden()).toEqual({ profil: leeresProfil(), gewichte: [] });
    q.schliessen();
  });

  it('Profil und Gewicht bleiben über einen Neustart erhalten', () => {
    let q = neueQuelle();
    q.speichern({ profil: beispiel(), gewicht: { datum: '2026-11-03', kg: 68.5 } });
    expect(q.hatDaten()).toBe(true);
    q.schliessen();
    q = SqliteQuelle.oeffnen(datei());
    q.migrieren();
    expect(q.laden()).toEqual({ profil: beispiel(), gewichte: [{ datum: '2026-11-03', kg: 68.5 }] });
    q.schliessen();
  });

  it('ein Gewicht je Tag: derselbe Tag wird überschrieben, Reihenfolge nach Datum', () => {
    const q = neueQuelle();
    q.speichern({ gewicht: { datum: '2026-11-03', kg: 70 } });
    q.speichern({ gewicht: { datum: '2026-11-03', kg: 69 } });
    q.speichern({ gewicht: { datum: '2026-10-01', kg: 72 } });
    expect(q.laden().gewichte).toEqual([
      { datum: '2026-10-01', kg: 72 },
      { datum: '2026-11-03', kg: 69 },
    ]);
    q.schliessen();
  });

  it('geht beim Speichern etwas schief, bleibt alles beim Alten', () => {
    const q = neueQuelle();
    q.speichern({ profil: beispiel() });
    const kaputt = { ...beispiel(), ausgeblendet: undefined as unknown as string[], groesseCm: 170 };
    expect(() => q.speichern({ profil: kaputt })).toThrow();
    expect(q.laden().profil.groesseCm).toBe(168);
    q.schliessen();
  });

  it('die Datei ist nur für den eigenen Nutzer lesbar', () => {
    const q = neueQuelle();
    expect(statSync(datei()).mode & 0o777).toBe(0o600);
    q.schliessen();
  });

  it('schreibt eine stimmige Kopie im laufenden Betrieb', () => {
    const q = neueQuelle();
    q.speichern({ profil: beispiel() });
    const kopie = join(ordner, 'kopie.sqlite');
    q.kopieSchreiben(kopie);
    q.speichern({ profil: { ...beispiel(), groesseCm: 170 } });
    q.schliessen();
    expect(datenbankLesbar(kopie)).toBe(true);
    const alt = SqliteQuelle.oeffnen(kopie);
    expect(alt.laden().profil.groesseCm).toBe(168);
    alt.schliessen();
  });

  it('erkennt eine kaputte Datei und überschreibt sie nicht', () => {
    writeFileSync(datei(), 'das ist keine Datenbank, sondern nur Text, und zwar genug davon');
    const vorher = readFileSync(datei());
    expect(() => SqliteQuelle.oeffnen(datei())).toThrow(expect.objectContaining({ code: 'BESCHAEDIGT' }));
    expect(readFileSync(datei()).equals(vorher)).toBe(true);
    expect(datenbankLesbar(datei())).toBe(false);
  });
});

describe('Datenbaustein', () => {
  function dienstAuf(): DatenDienst {
    const d = new DatenDienst(ordner, () => 2026);
    d.oeffnen();
    d.migrieren();
    return d;
  }

  it('prüft, was von der Oberfläche kommt', () => {
    const d = dienstAuf();
    expect(() => d.speichern({ profil: { ...beispiel(), groesseCm: 20 } })).toThrow(expect.objectContaining({ code: 'UNGUELTIG' }));
    expect(() => d.speichern({ profil: { ...beispiel(), geschlecht: 'x' as never } })).toThrow(expect.objectContaining({ code: 'UNGUELTIG' }));
    expect(() => d.speichern({ profil: { ...beispiel(), ausgeblendet: ['GIBTSNICHT'] } })).toThrow(expect.objectContaining({ code: 'UNGUELTIG' }));
    expect(() => d.speichern({ gewicht: { datum: '3.11.2026', kg: 70 } })).toThrow(expect.objectContaining({ code: 'UNGUELTIG' }));
    expect(() => d.speichern({ gewicht: { datum: '2026-11-03', kg: 5 } })).toThrow(expect.objectContaining({ code: 'UNGUELTIG' }));
    expect(d.hatDaten()).toBe(false);
    d.schliessen();
  });

  it('nimmt ein halb ausgefülltes Profil beim ersten Start an', () => {
    const d = dienstAuf();
    const stand = d.speichern({ profil: { ...leeresProfil(), geschlecht: 'weiblich' } });
    expect(stand.profil.geschlecht).toBe('weiblich');
    expect(stand.profil.geburtsjahr).toBeNull();
    d.schliessen();
  });

  it('kaputte Datei: Laden meldet es, Speichern ist gesperrt, die Datei bleibt', () => {
    writeFileSync(datei(), 'kaputt kaputt kaputt kaputt kaputt kaputt');
    const vorher = readFileSync(datei());
    const d = new DatenDienst(ordner);
    d.oeffnen();
    d.migrieren();
    expect(d.istHeil()).toBe(false);
    expect(d.hatDaten()).toBe(false);
    expect(d.laden()).toMatchObject({ ok: false, code: 'BESCHAEDIGT' });
    expect(() => d.speichern({ profil: beispiel() })).toThrow(expect.objectContaining({ code: 'BESCHAEDIGT' }));
    expect(readFileSync(datei()).equals(vorher)).toBe(true);
  });

  it('holt einen früheren Stand zurück, samt Fotos', async () => {
    const d = dienstAuf();
    d.speichern({ profil: beispiel() });
    const sicherung = join(ordner, 'sicherung');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(sicherung, 'fotos'), { recursive: true });
    d.kopieSchreiben(join(sicherung, 'starkmacher.sqlite'));
    writeFileSync(join(sicherung, 'fotos', 'a.jpg'), 'foto a');
    mkdirSync(d.fotoOrdner);
    writeFileSync(join(d.fotoOrdner, 'neu.jpg'), 'foto neu');
    d.speichern({ profil: { ...beispiel(), groesseCm: 180 } });

    const stand = await d.ersetzen(sicherung);
    expect(stand.profil.groesseCm).toBe(168);
    expect(d.laden()).toMatchObject({ ok: true });
    expect(readdirSync(d.fotoOrdner)).toEqual(['a.jpg']);
    expect(readdirSync(ordner).filter((n) => n.includes('.neu') || n.includes('.alt'))).toEqual([]);
    d.schliessen();
  });

  it('hebt eine kaputte Datei beim Wiederherstellen auf, statt sie zu löschen', async () => {
    const heil = dienstAuf();
    heil.speichern({ profil: beispiel() });
    const sicherung = join(ordner, 'sicherung');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(sicherung);
    heil.kopieSchreiben(join(sicherung, 'starkmacher.sqlite'));
    heil.schliessen();
    for (const rest of ['-wal', '-shm']) rmSync(`${datei()}${rest}`, { force: true });
    writeFileSync(datei(), 'kaputt kaputt kaputt kaputt kaputt kaputt');

    const d = new DatenDienst(ordner);
    d.oeffnen();
    expect(d.istHeil()).toBe(false);
    const stand = await d.ersetzen(sicherung);
    expect(stand.profil.groesseCm).toBe(168);
    const aufgehoben = readdirSync(ordner).filter((n) => n.includes('.beschaedigt-'));
    expect(aufgehoben).toHaveLength(1);
    expect(readFileSync(join(ordner, aufgehoben[0]!), 'utf8')).toContain('kaputt');
    expect(existsSync(datei())).toBe(true);
    d.schliessen();
  });
});
