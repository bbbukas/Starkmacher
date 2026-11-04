/**
 * Baut das Hilfsprogramm für Text und Barcode: ressourcen/starkmacher-sehen.
 *
 *   npm run sehen               baut neu
 *   npm run sehen -- --wenn-fehlt   baut nur, wenn es noch fehlt oder der Quelltext neuer ist
 *
 * Braucht die Befehlszeilenwerkzeuge von Xcode (swiftc), die auf diesem Mac schon installiert sind.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WURZEL = join(import.meta.dirname, '..');
const QUELLE = join(WURZEL, 'native/sehen.swift');
const ZIEL = join(WURZEL, 'ressourcen/starkmacher-sehen');

if (process.argv.includes('--wenn-fehlt') && existsSync(ZIEL) && statSync(ZIEL).mtimeMs >= statSync(QUELLE).mtimeMs) process.exit(0);
mkdirSync(join(WURZEL, 'ressourcen'), { recursive: true });
execFileSync('swiftc', ['-O', '-o', ZIEL, QUELLE], { stdio: 'inherit' });
console.log(`Fertig: ${ZIEL}`);
