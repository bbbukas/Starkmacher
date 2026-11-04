/**
 * Hält die Datenquelle und prüft alles, was von der Oberfläche kommt. Ist die
 * Datei kaputt, bleibt sie unangetastet: Lesen und Speichern melden den Fehler,
 * nur das Wiederherstellen einer Sicherung geht noch.
 */
import { randomUUID } from 'node:crypto';
import { cp, mkdir, rename, rm } from 'node:fs/promises';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Aenderung, LadeErgebnis } from '@shared/api';
import { StarkFehler } from '@shared/fehler';
import { gewichtPruefen, profilPruefen, type Stand } from '@shared/profil';
import type { Datenquelle } from './datenquelle';
import { SqliteQuelle } from './sqlite';

export const DATENBANK_DATEI = 'starkmacher.sqlite';
export const FOTO_ORDNER = 'fotos';

const zuFehler = (fehler: unknown) => (fehler instanceof StarkFehler ? fehler : new StarkFehler('FEHLER', 'Die Daten lassen sich gerade nicht öffnen.'));

export class DatenDienst {
  private quelle: Datenquelle | null = null;
  private fehler: StarkFehler | null = null;

  constructor(
    private readonly ordner: string,
    private readonly jahr: () => number = () => new Date().getFullYear(),
  ) {}

  get datei(): string {
    return join(this.ordner, DATENBANK_DATEI);
  }

  get fotoOrdner(): string {
    return join(this.ordner, FOTO_ORDNER);
  }

  /** Öffnet die Datei, ohne etwas daran zu ändern. Fehler merkt sich der Dienst. */
  oeffnen(): void {
    try {
      this.quelle = SqliteQuelle.oeffnen(this.datei);
      this.fehler = null;
    } catch (fehler) {
      this.quelle = null;
      this.fehler = zuFehler(fehler);
    }
  }

  migrieren(): void {
    try {
      this.quelle?.migrieren();
    } catch (fehler) {
      this.quelle?.schliessen();
      this.quelle = null;
      this.fehler = zuFehler(fehler);
    }
  }

  istHeil(): boolean {
    return this.quelle !== null;
  }

  hatDaten(): boolean {
    return this.quelle?.hatDaten() ?? false;
  }

  kopieSchreiben(zielDatei: string): void {
    this.bereit().kopieSchreiben(zielDatei);
  }

  laden(): LadeErgebnis {
    if (!this.quelle) {
      const f = this.fehler ?? new StarkFehler('FEHLER', 'Die Daten lassen sich gerade nicht öffnen.');
      return { ok: false, code: f.code, meldung: f.message };
    }
    return { ok: true, stand: this.quelle.laden() };
  }

  speichern(aenderung: Aenderung): Stand {
    const quelle = this.bereit();
    quelle.speichern({
      ...(aenderung.profil ? { profil: profilPruefen(aenderung.profil, this.jahr()) } : {}),
      ...(aenderung.gewicht ? { gewicht: gewichtPruefen(aenderung.gewicht.datum, aenderung.gewicht.kg) } : {}),
    });
    return quelle.laden();
  }

  /**
   * Holt den Stand aus einem Sicherungsordner zurück. Eine kaputte Datei wird nicht
   * gelöscht, sondern daneben aufgehoben. Der Wechsel selbst geschieht durch Umbenennen.
   */
  async ersetzen(sicherungsOrdner: string): Promise<Stand> {
    this.quelle?.schliessen();
    const warHeil = this.quelle !== null;
    this.quelle = null;
    const zeichen = randomUUID().slice(0, 8);

    const neu = `${this.datei}.${zeichen}.neu`;
    await cp(join(sicherungsOrdner, DATENBANK_DATEI), neu);
    if (!warHeil && existsSync(this.datei)) renameSync(this.datei, `${this.datei}.beschaedigt-${zeichen}`);
    for (const rest of ['-wal', '-shm']) rmSync(`${this.datei}${rest}`, { force: true });
    await rename(neu, this.datei);

    const fotosNeu = `${this.fotoOrdner}.${zeichen}.neu`;
    const fotosAlt = `${this.fotoOrdner}.${zeichen}.alt`;
    const fotosQuelle = join(sicherungsOrdner, FOTO_ORDNER);
    if (existsSync(fotosQuelle)) await cp(fotosQuelle, fotosNeu, { recursive: true });
    else await mkdir(fotosNeu);
    if (existsSync(this.fotoOrdner)) await rename(this.fotoOrdner, fotosAlt);
    await rename(fotosNeu, this.fotoOrdner);
    await rm(fotosAlt, { recursive: true, force: true });

    this.oeffnen();
    this.migrieren();
    return this.bereit().laden();
  }

  schliessen(): void {
    this.quelle?.schliessen();
    this.quelle = null;
  }

  /** Die offene Datenquelle. Nach dem Wiederherstellen ist es eine neue, deshalb immer hier fragen. */
  bereit(): Datenquelle {
    if (!this.quelle) throw this.fehler ?? new StarkFehler('FEHLER', 'Die Daten lassen sich gerade nicht öffnen.');
    return this.quelle;
  }
}
