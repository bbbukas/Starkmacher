/**
 * Fotos auf dem Mac (Mac-Eigenes hinter einer klaren Schnittstelle). Das Hilfsprogramm dreht sie richtig herum, verkleinert
 * sie, damit Sicherungen klein bleiben, und lässt alle Angaben aus der Datei weg, auch den Standort eines Handyfotos.
 * Die Oberfläche bekommt sie als data:-Adresse und braucht so keinen Dateizugriff.
 */
import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { StarkFehler } from '@shared/fehler';
import { fotoNameErlaubt } from '@shared/lebensmittel';
import type { Sehen } from './sehen';

const LAENGSTE_SEITE = 2000;

export async function fotoEinlesen(pfad: string, ordner: string, sehen: Sehen): Promise<string> {
  mkdirSync(ordner, { recursive: true });
  const name = `${randomUUID()}.jpg`;
  const ziel = join(ordner, name);
  try {
    await sehen.jpeg(pfad, ziel, LAENGSTE_SEITE);
  } catch {
    throw new StarkFehler('UNGUELTIG', 'Dieses Bild lässt sich nicht lesen. Bitte ein JPG, PNG oder HEIC wählen.');
  }
  chmodSync(ziel, 0o600);
  return name;
}

export function fotoLesen(name: unknown, ordner: string): string | null {
  if (!fotoNameErlaubt(name)) throw new StarkFehler('UNGUELTIG', 'Das Foto stimmt nicht.');
  try {
    return `data:image/jpeg;base64,${readFileSync(join(ordner, name)).toString('base64')}`;
  } catch {
    return null;
  }
}

export function fotoEntfernen(name: unknown, ordner: string): void {
  if (fotoNameErlaubt(name)) rmSync(join(ordner, name), { force: true });
}
