/**
 * Sicherungen (wie bei Systemfinanz): bei jedem Programmstart und auf Knopfdruck
 * eine Kopie von Daten und Fotos in den gewählten Ordner. Die 30 neuesten bleiben,
 * ältere werden gelöscht – aber nur Ordner, die Starkmacher selbst angelegt hat.
 * In iCloud wird nie gesichert.
 *
 * Jede Sicherung ist ein eigener Ordner. Ein Foto ändert sich nie, deshalb wird es
 * aus der vorigen Sicherung nur verknüpft und belegt keinen zusätzlichen Platz.
 * Kann das Laufwerk das nicht (z. B. mancher USB-Stick), wird es kopiert.
 */
import { constants, realpathSync } from 'node:fs';
import { access, copyFile, link, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, sep } from 'node:path';
import { SICHERUNG_MUSTER, SICHERUNGEN_BEHALTEN, type SicherungsEintrag, type SicherungsZustand } from '@shared/api';
import { StarkFehler } from '@shared/fehler';
import { DATENBANK_DATEI, FOTO_ORDNER } from './daten/dienst';
import { datenbankLesbar } from './daten/sqlite';

export interface SicherungsOptionen {
  /** Der Ordner mit den Fotos des Programms. */
  fotoOrdner: string;
  /** Solange Lukas keinen Ordner gewählt hat: hier, nur auf diesem Mac. */
  standardOrdner: string;
  /** Ordner, die mit iCloud abgeglichen werden – dorthin wird nie gesichert. */
  icloudOrdner: string[];
  gewaehlterOrdner(): string | undefined;
  ordnerMerken(ordner: string): Promise<void>;
  /** Gibt es etwas zu sichern? */
  hatDaten(): boolean;
  /** Schreibt eine stimmige Kopie der Datenbank. */
  datenbankKopieren(zielDatei: string): void;
  jetzt?: () => Date;
}

const zwei = (z: number) => String(z).padStart(2, '0');

/** „2026-11-03_21-40-05“ in Ortszeit. */
export function zeitstempel(d: Date): string {
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}_${zwei(d.getHours())}-${zwei(d.getMinutes())}-${zwei(d.getSeconds())}`;
}

/** Sortierschlüssel: Zeit, dann laufende Nummer (zwei Sicherungen in derselben Sekunde). */
function schluessel(name: string): string {
  const t = SICHERUNG_MUSTER.exec(name);
  if (!t) return '';
  return `${t[1]}${t[2]}${t[3]}${t[4]}${t[5]}${t[6]}-${(t[7] ?? '1').padStart(4, '0')}`;
}

export function neuesteZuerst(namen: string[]): string[] {
  return namen.filter((n) => SICHERUNG_MUSTER.test(n)).sort((a, b) => (schluessel(a) < schluessel(b) ? 1 : -1));
}

function zeitAusName(name: string): string {
  const t = SICHERUNG_MUSTER.exec(name);
  return t ? `${t[1]}-${t[2]}-${t[3]}T${t[4]}:${t[5]}:${t[6]}` : '';
}

const fehlt = (fehler: unknown) => (fehler as NodeJS.ErrnoException)?.code === 'ENOENT';
const ICLOUD_TEXT = 'Dieser Ordner liegt in iCloud. Starkmacher speichert bewusst nichts in iCloud – bitte einen anderen Ordner wählen, z. B. auf einem USB-Stick oder einer externen Festplatte.';

export class Sicherungen {
  private letzterFehler: string | null = null;

  constructor(private readonly opt: SicherungsOptionen) {}

  ordner(): string {
    return this.opt.gewaehlterOrdner() ?? this.opt.standardOrdner;
  }

  /** Liegt der Ordner in iCloud? (Verknüpfungen werden aufgelöst.) */
  liegtInIcloud(ordner: string): boolean {
    const echt = echterPfad(ordner);
    return this.opt.icloudOrdner.some((wurzel) => {
      const w = echterPfad(wurzel);
      return echt === w || echt.startsWith(w + sep);
    });
  }

  /** Legt eine Sicherung an. Gibt es noch keine Daten, gibt es nichts zu sichern (null). */
  async erstellen(): Promise<SicherungsEintrag | null> {
    if (!this.opt.hatDaten()) return null;
    const ordner = this.ordner();
    if (this.liegtInIcloud(ordner)) {
      this.letzterFehler = 'Der Sicherungsordner liegt in iCloud – dort sichert Starkmacher nicht. Bitte einen anderen Ordner wählen.';
      throw new StarkFehler('ORDNER', this.letzterFehler);
    }
    let neben: string | null = null;
    try {
      await mkdir(ordner, { recursive: true });
      const vorhanden = await readdir(ordner);
      const stempel = zeitstempel((this.opt.jetzt ?? (() => new Date()))());
      let name = `Starkmacher-Sicherung-${stempel}`;
      for (let n = 2; vorhanden.includes(name); n++) name = `Starkmacher-Sicherung-${stempel}-${n}`;

      // Versteckter Ordner, dann umbenennen: Eine halb geschriebene Sicherung taucht nie in der Liste auf.
      neben = join(ordner, `.${name}.neu`);
      await mkdir(neben, { mode: 0o700 });
      this.opt.datenbankKopieren(join(neben, DATENBANK_DATEI));
      const vorige = neuesteZuerst(vorhanden)[0];
      await this.fotosSichern(join(neben, FOTO_ORDNER), vorige ? join(ordner, vorige, FOTO_ORDNER) : null);
      await rename(neben, join(ordner, name));
      neben = null;

      await this.aufraeumen(ordner, vorhanden);
      this.letzterFehler = null;
      return await this.eintrag(ordner, name);
    } catch (fehler) {
      if (neben) await rm(neben, { recursive: true, force: true }).catch(() => undefined);
      this.letzterFehler = `Die Sicherung konnte nicht im Ordner „${ordner}“ angelegt werden. Ist der Ordner noch da?`;
      console.error('[starkmacher] Sicherung fehlgeschlagen', fehler);
      throw new StarkFehler('ORDNER', this.letzterFehler);
    }
  }

  private async fotosSichern(ziel: string, vorige: string | null): Promise<void> {
    await mkdir(ziel, { recursive: true });
    let fotos: string[];
    try {
      fotos = await readdir(this.opt.fotoOrdner);
    } catch (fehler) {
      if (fehlt(fehler)) return;
      throw fehler;
    }
    for (const foto of fotos) {
      const quelle = join(this.opt.fotoOrdner, foto);
      if (!(await stat(quelle)).isFile()) continue;
      const verknuepft = vorige !== null && (await link(join(vorige, foto), join(ziel, foto)).then(() => true, () => false));
      if (!verknuepft) await copyFile(quelle, join(ziel, foto));
    }
  }

  /** Nur die 30 neuesten eigenen Sicherungen behalten. Fremde Dateien im Ordner bleiben unberührt. */
  async aufraeumen(ordner = this.ordner(), bekannt?: string[]): Promise<string[]> {
    const namen = await readdir(ordner);
    // Reste abgebrochener Sicherungen wegräumen – aber nicht die, die gerade entstehen könnten.
    for (const rest of bekannt ?? []) {
      if (rest.startsWith('.Starkmacher-Sicherung-') && rest.endsWith('.neu')) await rm(join(ordner, rest), { recursive: true, force: true });
    }
    const zuAlt = neuesteZuerst(namen).slice(SICHERUNGEN_BEHALTEN);
    for (const name of zuAlt) await rm(join(ordner, name), { recursive: true, force: true });
    return zuAlt;
  }

  private async eintrag(ordner: string, name: string): Promise<SicherungsEintrag> {
    const pfad = join(ordner, name);
    let groesse = 0;
    let fotos = 0;
    try {
      groesse = (await stat(join(pfad, DATENBANK_DATEI))).size;
      for (const foto of await readdir(join(pfad, FOTO_ORDNER))) {
        groesse += (await stat(join(pfad, FOTO_ORDNER, foto))).size;
        fotos++;
      }
    } catch {
      // Fehlt etwas, zeigt „lesbar“ das an.
    }
    return { name, zeit: zeitAusName(name), groesse, fotos, lesbar: datenbankLesbar(join(pfad, DATENBANK_DATEI)) };
  }

  async liste(): Promise<SicherungsEintrag[]> {
    const ordner = this.ordner();
    let namen: string[];
    try {
      namen = await readdir(ordner);
    } catch (fehler) {
      if (fehlt(fehler)) return [];
      throw new StarkFehler('ORDNER', `Der Sicherungsordner „${ordner}“ lässt sich nicht öffnen.`);
    }
    return Promise.all(neuesteZuerst(namen).map((name) => this.eintrag(ordner, name)));
  }

  /** Prüft eine Sicherung und gibt ihren Ordner zurück – ersetzt selbst noch nichts. */
  async pruefen(name: unknown): Promise<string> {
    if (typeof name !== 'string' || basename(name) !== name || !SICHERUNG_MUSTER.test(name)) {
      throw new StarkFehler('UNGUELTIG', 'Diese Sicherung gibt es nicht.');
    }
    const pfad = join(this.ordner(), name);
    if (!datenbankLesbar(join(pfad, DATENBANK_DATEI))) {
      throw new StarkFehler('BESCHAEDIGT', 'Diese Sicherung lässt sich nicht lesen. Bitte eine andere wählen.');
    }
    return pfad;
  }

  /** Neuen Ordner verwenden – vorher prüfen, dass man hineinschreiben kann; danach gleich eine Sicherung dort anlegen. */
  async ordnerSetzen(ordner: string): Promise<void> {
    if (this.liegtInIcloud(ordner)) throw new StarkFehler('ORDNER', ICLOUD_TEXT);
    try {
      await mkdir(ordner, { recursive: true });
      await access(ordner, constants.W_OK);
    } catch {
      throw new StarkFehler('ORDNER', `In den Ordner „${ordner}“ kann Starkmacher nicht schreiben. Bitte einen anderen wählen.`);
    }
    await this.opt.ordnerMerken(ordner);
    await this.erstellen();
  }

  async zustand(): Promise<SicherungsZustand> {
    const ordner = this.ordner();
    let eintraege: SicherungsEintrag[] = [];
    let fehler = this.letzterFehler;
    try {
      eintraege = await this.liste();
    } catch (f) {
      fehler ??= f instanceof Error ? f.message : String(f);
    }
    return {
      ordner,
      standardOrdner: this.opt.gewaehlterOrdner() === undefined,
      imIcloud: this.liegtInIcloud(ordner),
      letzteSicherung: eintraege[0] ?? null,
      anzahl: eintraege.length,
      fehler,
    };
  }
}

/** Pfad mit aufgelösten Verknüpfungen; gibt es ihn (noch) nicht, den nächsten vorhandenen Elternordner auflösen. */
function echterPfad(pfad: string): string {
  try {
    return realpathSync(pfad);
  } catch {
    const eltern = dirname(pfad);
    return eltern === pfad ? pfad : join(echterPfad(eltern), basename(pfad));
  }
}
