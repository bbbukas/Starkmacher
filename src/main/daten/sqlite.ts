/**
 * Die Daten als SQLite-Datei auf diesem Mac (eingebaut in Electron, node:sqlite).
 *
 * - Jede Änderung ist eine Transaktion: Geht der Mac mitten im Speichern aus,
 *   bleibt der letzte vollständige Stand erhalten.
 * - Lässt sich die Datei nicht lesen, wird nichts überschrieben (BESCHAEDIGT).
 * - Alle persönlichen Daten hängen an einem Profil, vorerst genau einem.
 */
import { chmodSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { StarkFehler } from '@shared/fehler';
import type { Umrechnung } from '@shared/einheiten';
import { leeresProfil, PROFIL_ID, type Aktivitaet, type Geschlecht, type Gewicht, type Profil, type Stand, type Stueckware, type Tempo, type Ziel } from '@shared/profil';
import type { Datenquelle, GespeichertesLebensmittel } from './datenquelle';

/** Jeder Eintrag bringt die Datenbank eine Fassung weiter. Vorhandene Einträge nie ändern, nur neue anhängen. */
const MIGRATIONEN: readonly string[] = [
  `CREATE TABLE profile (
     id TEXT PRIMARY KEY,
     geschlecht TEXT,
     geburtsjahr INTEGER,
     groesse_cm REAL,
     aktivitaet TEXT,
     sport INTEGER NOT NULL DEFAULT 0,
     ziel TEXT,
     tempo TEXT NOT NULL DEFAULT 'sanft',
     eigene_kcal REAL,
     eigene_eiweiss_g REAL,
     eigene_fett_g REAL,
     eigene_kohlenhydrate_g REAL,
     einrichtung_fertig INTEGER NOT NULL DEFAULT 0,
     stueckware TEXT NOT NULL DEFAULT 'groesse',
     ausgeblendet TEXT NOT NULL DEFAULT '[]',
     letzte_ziele TEXT,
     geaendert_am TEXT NOT NULL
   );
   CREATE TABLE gewichte (
     profil_id TEXT NOT NULL REFERENCES profile(id),
     datum TEXT NOT NULL,
     kg REAL NOT NULL,
     PRIMARY KEY (profil_id, datum)
   );`,
  `CREATE TABLE eigene_lebensmittel (
     id TEXT PRIMARY KEY,
     profil_id TEXT NOT NULL REFERENCES profile(id),
     daten TEXT NOT NULL,
     geaendert_am TEXT NOT NULL
   );
   CREATE TABLE umrechnungen (
     profil_id TEXT NOT NULL REFERENCES profile(id),
     lebensmittel_id TEXT NOT NULL,
     daten TEXT NOT NULL,
     PRIMARY KEY (profil_id, lebensmittel_id)
   );
   CREATE TABLE zuletzt_verwendet (
     profil_id TEXT NOT NULL REFERENCES profile(id),
     lebensmittel_id TEXT NOT NULL,
     zeit TEXT NOT NULL,
     PRIMARY KEY (profil_id, lebensmittel_id)
   );`,
];

const BESCHAEDIGT_TEXT = 'Die Datendatei lässt sich nicht lesen.';
const ZU_NEU_TEXT = 'Die Datendatei stammt von einer neueren Starkmacher-Fassung. Bitte das Programm aktualisieren.';

function pragmaWert(db: DatabaseSync, name: string): unknown {
  const zeile = db.prepare(`PRAGMA ${name}`).get() as Record<string, unknown> | undefined;
  return zeile ? Object.values(zeile)[0] : undefined;
}

function dateiPruefen(db: DatabaseSync): void {
  try {
    if (pragmaWert(db, 'quick_check') !== 'ok') throw new Error('quick_check');
    if (Number(pragmaWert(db, 'user_version')) > MIGRATIONEN.length) throw new StarkFehler('ZU_NEU', ZU_NEU_TEXT);
  } catch (fehler) {
    if (fehler instanceof StarkFehler) throw fehler;
    throw new StarkFehler('BESCHAEDIGT', BESCHAEDIGT_TEXT);
  }
}

function tabelleDa(db: DatabaseSync, name: string): boolean {
  return db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) !== undefined;
}

/** Ist das eine heile Starkmacher-Datenbank? Ändert nichts daran. */
export function datenbankLesbar(datei: string): boolean {
  if (!existsSync(datei)) return false;
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(datei, { readOnly: true });
    dateiPruefen(db);
    return tabelleDa(db, 'profile');
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

interface ProfilZeile {
  geschlecht: Geschlecht | null;
  geburtsjahr: number | null;
  groesse_cm: number | null;
  aktivitaet: Aktivitaet | null;
  sport: number;
  ziel: Ziel | null;
  tempo: Tempo;
  eigene_kcal: number | null;
  eigene_eiweiss_g: number | null;
  eigene_fett_g: number | null;
  eigene_kohlenhydrate_g: number | null;
  einrichtung_fertig: number;
  stueckware: Stueckware;
  ausgeblendet: string;
  letzte_ziele: string | null;
}

export class SqliteQuelle implements Datenquelle {
  private constructor(
    private readonly db: DatabaseSync,
    private readonly uhr: () => string,
  ) {}

  /** Öffnet die Datei (legt sie an, wenn es sie nicht gibt), richtet aber noch nichts ein. */
  static oeffnen(datei: string, uhr: () => string = () => new Date().toISOString()): SqliteQuelle {
    let db: DatabaseSync;
    try {
      db = new DatabaseSync(datei);
    } catch {
      throw new StarkFehler('BESCHAEDIGT', BESCHAEDIGT_TEXT);
    }
    try {
      dateiPruefen(db);
      db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');
    } catch (fehler) {
      db.close();
      throw fehler instanceof StarkFehler ? fehler : new StarkFehler('BESCHAEDIGT', BESCHAEDIGT_TEXT);
    }
    chmodSync(datei, 0o600); // Gesundheitsdaten: nur für den eigenen Nutzer lesbar
    return new SqliteQuelle(db, uhr);
  }

  hatDaten(): boolean {
    return tabelleDa(this.db, 'profile') && this.db.prepare('SELECT 1 FROM profile LIMIT 1').get() !== undefined;
  }

  migrieren(): void {
    const fassung = Number(pragmaWert(this.db, 'user_version'));
    for (let i = fassung; i < MIGRATIONEN.length; i++) {
      this.inTransaktion(() => {
        this.db.exec(MIGRATIONEN[i]!);
        this.db.exec(`PRAGMA user_version = ${i + 1}`);
      });
    }
  }

  laden(): Stand {
    const zeile = this.db.prepare('SELECT * FROM profile WHERE id = ?').get(PROFIL_ID) as ProfilZeile | undefined;
    const gewichte = this.db.prepare('SELECT datum, kg FROM gewichte WHERE profil_id = ? ORDER BY datum').all(PROFIL_ID) as unknown as Gewicht[];
    return { profil: zeile ? profilAus(zeile) : leeresProfil(), gewichte: gewichte.map((g) => ({ datum: g.datum, kg: g.kg })) };
  }

  speichern({ profil, gewicht }: { profil?: Profil; gewicht?: Gewicht }): void {
    this.inTransaktion(() => {
      // Ein Gewicht hängt an einem Profil, also gibt es das Profil spätestens jetzt.
      if (profil) this.profilSchreiben(profil);
      else if (gewicht) this.db.prepare(`INSERT OR IGNORE INTO profile (id, geaendert_am) VALUES (?, ?)`).run(PROFIL_ID, this.uhr());
      if (gewicht) {
        this.db
          .prepare('INSERT INTO gewichte (profil_id, datum, kg) VALUES (?, ?, ?) ON CONFLICT (profil_id, datum) DO UPDATE SET kg = excluded.kg')
          .run(PROFIL_ID, gewicht.datum, gewicht.kg);
      }
    });
  }

  eigeneListe(): GespeichertesLebensmittel[] {
    const zeilen = this.db.prepare('SELECT daten FROM eigene_lebensmittel WHERE profil_id = ?').all(PROFIL_ID) as unknown as { daten: string }[];
    return zeilen.map((z) => JSON.parse(z.daten) as GespeichertesLebensmittel);
  }

  eigenesHolen(id: string): GespeichertesLebensmittel | null {
    const z = this.db.prepare('SELECT daten FROM eigene_lebensmittel WHERE profil_id = ? AND id = ?').get(PROFIL_ID, id) as { daten: string } | undefined;
    return z ? (JSON.parse(z.daten) as GespeichertesLebensmittel) : null;
  }

  eigenesSpeichern(lebensmittel: GespeichertesLebensmittel): void {
    this.inTransaktion(() => {
      this.profilSicherstellen();
      this.db
        .prepare(
          `INSERT INTO eigene_lebensmittel (id, profil_id, daten, geaendert_am) VALUES (?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET daten = excluded.daten, geaendert_am = excluded.geaendert_am`,
        )
        .run(lebensmittel.id, PROFIL_ID, JSON.stringify(lebensmittel), lebensmittel.geaendertAm);
    });
  }

  eigenesLoeschen(id: string): void {
    this.inTransaktion(() => {
      this.db.prepare('DELETE FROM eigene_lebensmittel WHERE profil_id = ? AND id = ?').run(PROFIL_ID, id);
      // Rein eigene Lebensmittel sind dann ganz weg. Das Original einer Version bleibt: Es behält Umrechnung und „zuletzt verwendet“.
      if (id.startsWith('eigen:')) {
        this.db.prepare('DELETE FROM umrechnungen WHERE profil_id = ? AND lebensmittel_id = ?').run(PROFIL_ID, id);
        this.db.prepare('DELETE FROM zuletzt_verwendet WHERE profil_id = ? AND lebensmittel_id = ?').run(PROFIL_ID, id);
      }
    });
  }

  umrechnungHolen(id: string): Umrechnung | null {
    const z = this.db.prepare('SELECT daten FROM umrechnungen WHERE profil_id = ? AND lebensmittel_id = ?').get(PROFIL_ID, id) as { daten: string } | undefined;
    return z ? (JSON.parse(z.daten) as Umrechnung) : null;
  }

  umrechnungSpeichern(id: string, umrechnung: Umrechnung | null): void {
    this.inTransaktion(() => {
      this.profilSicherstellen();
      if (umrechnung === null) {
        this.db.prepare('DELETE FROM umrechnungen WHERE profil_id = ? AND lebensmittel_id = ?').run(PROFIL_ID, id);
        return;
      }
      this.db
        .prepare(
          `INSERT INTO umrechnungen (profil_id, lebensmittel_id, daten) VALUES (?, ?, ?)
           ON CONFLICT (profil_id, lebensmittel_id) DO UPDATE SET daten = excluded.daten`,
        )
        .run(PROFIL_ID, id, JSON.stringify(umrechnung));
    });
  }

  verwendetMerken(id: string, zeit: string): void {
    this.inTransaktion(() => {
      this.profilSicherstellen();
      this.db
        .prepare(
          `INSERT INTO zuletzt_verwendet (profil_id, lebensmittel_id, zeit) VALUES (?, ?, ?)
           ON CONFLICT (profil_id, lebensmittel_id) DO UPDATE SET zeit = excluded.zeit`,
        )
        .run(PROFIL_ID, id, zeit);
    });
  }

  zuletztVerwendet(anzahl: number): string[] {
    const zeilen = this.db.prepare('SELECT lebensmittel_id FROM zuletzt_verwendet WHERE profil_id = ? ORDER BY zeit DESC LIMIT ?').all(PROFIL_ID, anzahl) as unknown as { lebensmittel_id: string }[];
    return zeilen.map((z) => z.lebensmittel_id);
  }

  kopieSchreiben(zielDatei: string): void {
    this.db.prepare('VACUUM INTO ?').run(zielDatei);
    chmodSync(zielDatei, 0o600);
  }

  schliessen(): void {
    this.db.close();
  }

  /** Alles Persönliche hängt an einem Profil, also gibt es das Profil spätestens jetzt. */
  private profilSicherstellen(): void {
    this.db.prepare(`INSERT OR IGNORE INTO profile (id, geaendert_am) VALUES (?, ?)`).run(PROFIL_ID, this.uhr());
  }

  private profilSchreiben(p: Profil): void {
    this.db
      .prepare(
        `INSERT INTO profile (id, geschlecht, geburtsjahr, groesse_cm, aktivitaet, sport, ziel, tempo, eigene_kcal, eigene_eiweiss_g, eigene_fett_g,
           eigene_kohlenhydrate_g, einrichtung_fertig, stueckware, ausgeblendet, letzte_ziele, geaendert_am)
         VALUES (@id, @geschlecht, @geburtsjahr, @groesse, @aktivitaet, @sport, @ziel, @tempo, @kcal, @eiweiss, @fett, @kohlenhydrate, @fertig, @stueckware,
           @ausgeblendet, @ziele, @jetzt)
         ON CONFLICT (id) DO UPDATE SET geschlecht = excluded.geschlecht, geburtsjahr = excluded.geburtsjahr, groesse_cm = excluded.groesse_cm,
           aktivitaet = excluded.aktivitaet, sport = excluded.sport, ziel = excluded.ziel, tempo = excluded.tempo, eigene_kcal = excluded.eigene_kcal,
           eigene_eiweiss_g = excluded.eigene_eiweiss_g, eigene_fett_g = excluded.eigene_fett_g, eigene_kohlenhydrate_g = excluded.eigene_kohlenhydrate_g,
           einrichtung_fertig = excluded.einrichtung_fertig, stueckware = excluded.stueckware, ausgeblendet = excluded.ausgeblendet,
           letzte_ziele = excluded.letzte_ziele, geaendert_am = excluded.geaendert_am`,
      )
      .run({
        id: PROFIL_ID,
        geschlecht: p.geschlecht,
        geburtsjahr: p.geburtsjahr,
        groesse: p.groesseCm,
        aktivitaet: p.aktivitaet,
        sport: p.sport ? 1 : 0,
        ziel: p.ziel,
        tempo: p.tempo,
        kcal: p.eigeneKcal,
        eiweiss: p.eigeneEiweissG,
        fett: p.eigeneFettG,
        kohlenhydrate: p.eigeneKohlenhydrateG,
        fertig: p.einrichtungFertig ? 1 : 0,
        stueckware: p.stueckware,
        ausgeblendet: JSON.stringify(p.ausgeblendet),
        ziele: p.letzteZiele ? JSON.stringify(p.letzteZiele) : null,
        jetzt: this.uhr(),
      });
  }

  private inTransaktion(arbeit: () => void): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      arbeit();
      this.db.exec('COMMIT');
    } catch (fehler) {
      this.db.exec('ROLLBACK');
      throw fehler;
    }
  }
}

function profilAus(z: ProfilZeile): Profil {
  return {
    id: PROFIL_ID,
    geschlecht: z.geschlecht,
    geburtsjahr: z.geburtsjahr,
    groesseCm: z.groesse_cm,
    aktivitaet: z.aktivitaet,
    sport: z.sport === 1,
    ziel: z.ziel,
    tempo: z.tempo,
    eigeneKcal: z.eigene_kcal,
    eigeneEiweissG: z.eigene_eiweiss_g,
    eigeneFettG: z.eigene_fett_g,
    eigeneKohlenhydrateG: z.eigene_kohlenhydrate_g,
    einrichtungFertig: z.einrichtung_fertig === 1,
    stueckware: z.stueckware,
    // Cystein hieß bis Phase 1 irrtümlich CYS, im BLS heißt es CYSTE.
    ausgeblendet: (JSON.parse(z.ausgeblendet) as string[]).map((code) => (code === 'CYS' ? 'CYSTE' : code)),
    letzteZiele: z.letzte_ziele ? (JSON.parse(z.letzte_ziele) as Profil['letzteZiele']) : null,
  };
}
