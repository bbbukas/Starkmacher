/**
 * Der Grundbestand: bls-4.0.sqlite, nur zum Lesen. Eine eigene Schnittstelle, damit er sich
 * später austauschen lässt (neue BLS-Fassung, Server). Fehlt die Datei, gibt es nur die eigenen Lebensmittel.
 */
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { BLS_FASSUNG } from '@shared/blsAufbau';

export interface GrundEintrag {
  code: string;
  name: string;
  /** Nur die Werte für Trefferliste und Vergleich. */
  werte: Readonly<Record<string, number>>;
}

export interface GrundLebensmittel {
  code: string;
  name: string;
  nameEn: string | null;
  werte: Readonly<Record<string, number>>;
  spuren: readonly string[];
  freierZuckerG: number | null;
  anmerkung: string | null;
  hinweise: readonly string[];
}

export interface Grundbestand {
  /** Alle Einträge in Kurzform. Ändert sich nie, einmal gelesen bleibt die Liste im Speicher. */
  liste(): readonly GrundEintrag[];
  holen(code: string): GrundLebensmittel | null;
  schliessen(): void;
}

const LISTEN_CODES = ['ENERCC', 'FAT', 'FASAT', 'CHO', 'SUGAR', 'PROT625', 'NACL'] as const;

interface BlsZeile {
  code: string;
  name: string;
  name_en: string | null;
  werte: string;
  spuren: string;
  freier_zucker_g: number | null;
  anmerkung: string | null;
  hinweise: string;
}

class BlsDatei implements Grundbestand {
  private kurz: GrundEintrag[] | null = null;

  constructor(private readonly db: DatabaseSync) {}

  liste(): readonly GrundEintrag[] {
    if (!this.kurz) {
      const zeilen = this.db.prepare('SELECT code, name, werte FROM lebensmittel').all() as unknown as Pick<BlsZeile, 'code' | 'name' | 'werte'>[];
      this.kurz = zeilen.map((z) => {
        const alle = JSON.parse(z.werte) as Record<string, number>;
        const werte: Record<string, number> = {};
        for (const code of LISTEN_CODES) {
          const wert = alle[code];
          if (wert !== undefined) werte[code] = wert;
        }
        return { code: z.code, name: z.name, werte };
      });
    }
    return this.kurz;
  }

  holen(code: string): GrundLebensmittel | null {
    const z = this.db.prepare('SELECT * FROM lebensmittel WHERE code = ?').get(code) as BlsZeile | undefined;
    if (!z) return null;
    return {
      code: z.code,
      name: z.name,
      nameEn: z.name_en,
      werte: JSON.parse(z.werte) as Record<string, number>,
      spuren: JSON.parse(z.spuren) as string[],
      freierZuckerG: z.freier_zucker_g,
      anmerkung: z.anmerkung,
      hinweise: JSON.parse(z.hinweise) as string[],
    };
  }

  schliessen(): void {
    this.db.close();
  }
}

export const LEERER_GRUNDBESTAND: Grundbestand = { liste: () => [], holen: () => null, schliessen: () => {} };

/** Öffnet die Datei. Fehlt sie oder passt sie nicht, bleibt das Programm benutzbar, nur ohne BLS. */
export function grundbestandOeffnen(datei: string): Grundbestand {
  if (!existsSync(datei)) {
    console.error('[starkmacher] BLS-Datei fehlt:', datei);
    return LEERER_GRUNDBESTAND;
  }
  try {
    const db = new DatabaseSync(datei, { readOnly: true });
    const fassung = (db.prepare(`SELECT wert FROM info WHERE schluessel = 'fassung'`).get() as { wert: string } | undefined)?.wert;
    if (fassung !== BLS_FASSUNG) {
      db.close();
      console.error('[starkmacher] BLS-Datei hat eine andere Fassung:', fassung);
      return LEERER_GRUNDBESTAND;
    }
    return new BlsDatei(db);
  } catch (fehler) {
    console.error('[starkmacher] BLS-Datei lässt sich nicht öffnen', fehler);
    return LEERER_GRUNDBESTAND;
  }
}
