/**
 * Die Offline-Kopie von Open Food Facts (Bauauftrag 5.3): nur deutsche Produkte, nur zum Lesen, gebaut mit `npm run off`.
 * Die Werte sind von Freiwilligen erfasst, deshalb kommt danach immer die Prüfseite. Lizenz: ODbL.
 */
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { barcodeSchluessel, type KopieProdukt } from '@shared/barcode';

export interface ProduktKopie {
  /** Gibt es die Kopie auf diesem Mac? */
  da: boolean;
  holen(code: string): KopieProdukt | null;
  schliessen(): void;
}

export const LEERE_KOPIE: ProduktKopie = { da: false, holen: () => null, schliessen: () => {} };

/** Spalten der Tabelle `produkte` und die Codes des Programms dazu. Das Skript scripts/off-bauen.mjs schreibt sie. */
const WERTE: readonly (readonly [string, string])[] = [
  ['kcal', 'ENERCC'],
  ['fett', 'FAT'],
  ['gesaettigt', 'FASAT'],
  ['kohlenhydrate', 'CHO'],
  ['zucker', 'SUGAR'],
  ['ballaststoffe', 'FIBT'],
  ['eiweiss', 'PROT625'],
  ['salz', 'NACL'],
];

export function kopieOeffnen(datei: string): ProduktKopie {
  if (!existsSync(datei)) return LEERE_KOPIE;
  const db = new DatabaseSync(datei, { readOnly: true });
  const abfrage = db.prepare('SELECT * FROM produkte WHERE schluessel = ?');
  return {
    da: true,
    holen: (code) => {
      const z = abfrage.get(barcodeSchluessel(code)) as Record<string, string | number | null> | undefined;
      if (!z) return null;
      const werte: Record<string, number> = {};
      for (const [spalte, nährstoff] of WERTE) {
        const wert = z[spalte];
        if (typeof wert === 'number') werte[nährstoff] = wert;
      }
      return { code, name: (z.name as string | null) ?? null, marke: (z.marke as string | null) ?? null, menge: (z.menge as string | null) ?? null, werte };
    },
    schliessen: () => db.close(),
  };
}
