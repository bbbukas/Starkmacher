/**
 * Das mitgelieferte Hilfsprogramm für Fotos (native/sehen.swift): Texterkennung und Barcode-Erkennung von macOS.
 * Mac-Eigenes hinter einer klaren Schnittstelle, das Hilfsprogramm geht nicht ins Internet.
 */
import { execFile } from 'node:child_process';
import type { FotoLesung } from '@shared/fotoText';

export interface Sehen {
  lesen(pfad: string): Promise<FotoLesung>;
  /** Schreibt das Bild richtig gedreht und verkleinert als JPEG, ohne Angaben aus der Datei. */
  jpeg(pfad: string, ziel: string, pixel: number): Promise<void>;
}

const HOECHSTENS_MS = 60_000;

function aufrufen(programm: string, argumente: readonly string[]): Promise<string> {
  return new Promise((fertig, fehler) => {
    execFile(programm, argumente, { timeout: HOECHSTENS_MS, maxBuffer: 20 * 1024 * 1024, encoding: 'utf8' }, (f, ausgabe) => {
      if (f) fehler(f);
      else fertig(ausgabe);
    });
  });
}

export function sehenOeffnen(programm: string): Sehen {
  return {
    lesen: async (pfad) => JSON.parse(await aufrufen(programm, ['lesen', pfad])) as FotoLesung,
    jpeg: async (pfad, ziel, pixel) => {
      await aufrufen(programm, ['jpeg', pfad, ziel, String(pixel)]);
    },
  };
}
