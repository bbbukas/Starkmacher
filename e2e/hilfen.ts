import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';

export interface Testordner {
  daten: string;
  sicherungen: string;
  icloud: string;
}

/** Eigener, leerer Datenordner mit Sicherungsordner – nie Lukas' echte Daten. */
export function testordnerAnlegen(): Testordner {
  const wurzel = mkdtempSync(join(tmpdir(), 'starkmacher-e2e-'));
  const ordner = { daten: join(wurzel, 'daten'), sicherungen: join(wurzel, 'sicherungen'), icloud: join(wurzel, 'Mobile Documents') };
  mkdirSync(ordner.daten);
  mkdirSync(ordner.icloud);
  writeFileSync(join(ordner.daten, 'einstellungen.json'), JSON.stringify({ sicherungsOrdner: ordner.sicherungen }));
  return ordner;
}

/** Startet das gebaute Programm (out/). */
export async function programmStarten(ordner: Testordner): Promise<{ app: ElectronApplication; seite: Page }> {
  // STARKMACHER_PAKET: die fertige App aus release/ prüfen statt des Entwicklungsstands.
  const app = await electron.launch({
    ...(process.env.STARKMACHER_PAKET
      ? { executablePath: join(import.meta.dirname, '../release/mac-arm64/Starkmacher.app/Contents/MacOS/Starkmacher'), args: [] }
      : { args: [join(import.meta.dirname, '..')] }),
    env: { ...process.env, STARKMACHER_DATEN_ORDNER: ordner.daten, STARKMACHER_ICLOUD_ORDNER: ordner.icloud, ELECTRON_RENDERER_URL: '' },
  });
  const seite = await app.firstWindow();
  await seite.waitForLoadState('domcontentloaded');
  return { app, seite };
}

export function sicherungenIn(ordner: string): string[] {
  try {
    return readdirSync(ordner).filter((n) => n.startsWith('Starkmacher-Sicherung-'));
  } catch {
    return [];
  }
}

export function testordnerLoeschen(ordner: Testordner): void {
  rmSync(join(ordner.daten, '..'), { recursive: true, force: true });
}

const BILDER = process.env.STARKMACHER_BILDER; // optional: Ordner für Bildschirmfotos

export async function foto(seite: Page, name: string, ganz = false): Promise<void> {
  if (BILDER) await seite.screenshot({ path: join(BILDER, `${name}.png`), fullPage: ganz });
}

export const gespeichert = (seite: Page) => expect(seite.getByText('Gespeichert', { exact: true })).toBeVisible();

/** Läuft einmal durch den ersten Start, mit einer erfundenen Person. */
export async function ersterStart(seite: Page, gewicht = '70'): Promise<void> {
  await seite.getByRole('radio', { name: 'Männlich' }).check({ force: true });
  await seite.getByLabel('Geburtsjahr').fill('1986');
  await seite.getByLabel('Größe').fill('180');
  await seite.getByLabel('Gewicht').fill(gewicht);
  await seite.getByRole('button', { name: 'Weiter' }).click();
  await seite.getByRole('radio', { name: /Fast nur sitzend/ }).check({ force: true });
  await seite.getByRole('button', { name: 'Weiter' }).click();
  await seite.getByRole('radio', { name: /Gewicht halten/ }).check({ force: true });
  await seite.getByRole('button', { name: 'Weiter' }).click();
  await seite.getByRole('button', { name: "Los geht's" }).click();
  await expect(seite.getByRole('navigation', { name: 'Bereiche' })).toBeVisible();
}
