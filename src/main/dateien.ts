import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Liest eine JSON-Datei. Fehlt sie, kommt `null` zurück. */
export async function jsonLesen<T>(datei: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(datei, 'utf8')) as T;
  } catch (fehler) {
    if ((fehler as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw fehler;
  }
}

/**
 * Schreibt erst in eine Nebendatei und benennt sie dann um. So bleibt die alte
 * Datei heil, falls der Mac mitten im Schreiben ausgeht.
 */
export async function jsonSchreiben(datei: string, inhalt: unknown): Promise<void> {
  await mkdir(dirname(datei), { recursive: true });
  const neben = `${datei}.${process.pid}.neu`;
  await writeFile(neben, JSON.stringify(inhalt, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(neben, datei);
}
