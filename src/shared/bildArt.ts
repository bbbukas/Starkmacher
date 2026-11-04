/**
 * Ist das wirklich ein Bild? Geprüft werden die ersten Bytes der Datei, nicht ihr Name und nicht, was der Absender behauptet.
 * Die Handy-Seite und das Hineinziehen nehmen nur das an.
 */
export type BildArt = 'jpeg' | 'png' | 'heic' | 'webp';

export const BILD_HOECHSTENS_BYTES = 30 * 1024 * 1024;

export function bildArt(daten: Uint8Array): BildArt | null {
  if (daten.length < 12) return null;
  if (daten[0] === 0xff && daten[1] === 0xd8 && daten[2] === 0xff) return 'jpeg';
  if (daten[0] === 0x89 && daten[1] === 0x50 && daten[2] === 0x4e && daten[3] === 0x47) return 'png';
  const text = (von: number, bis: number) => String.fromCharCode(...daten.subarray(von, bis));
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'webp';
  if (text(4, 8) === 'ftyp' && ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(text(8, 12))) return 'heic';
  return null;
}
