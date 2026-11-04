/**
 * Fotos auf dem Mac (Mac-Eigenes hinter einer klaren Schnittstelle). Beim Einlesen werden sie verkleinert,
 * damit Sicherungen klein bleiben. Die Oberfläche bekommt sie als data:-Adresse und braucht so keinen Dateizugriff.
 */
import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nativeImage } from 'electron';
import { StarkFehler } from '@shared/fehler';
import { fotoNameErlaubt } from '@shared/lebensmittel';

const LAENGSTE_SEITE = 2000;
const QUALITAET = 85;

export function fotoEinlesen(pfad: string, ordner: string): string {
  const bild = nativeImage.createFromPath(pfad);
  if (bild.isEmpty()) throw new StarkFehler('UNGUELTIG', 'Dieses Bild lässt sich nicht lesen. Bitte ein JPG, PNG oder HEIC wählen.');
  const { width, height } = bild.getSize();
  const groesser = Math.max(width, height);
  const passend = groesser > LAENGSTE_SEITE ? bild.resize({ width: Math.round((width * LAENGSTE_SEITE) / groesser), height: Math.round((height * LAENGSTE_SEITE) / groesser), quality: 'good' }) : bild;
  mkdirSync(ordner, { recursive: true });
  const name = `${randomUUID()}.jpg`;
  const ziel = join(ordner, name);
  writeFileSync(ziel, passend.toJPEG(QUALITAET));
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
