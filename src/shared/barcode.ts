/**
 * Barcodes (Bauauftrag 5.3). Der Code ist nur eine Nummer, die Werte kommen aus den eigenen Lebensmitteln oder aus der
 * Offline-Kopie von Open Food Facts. Reine Rechnung ohne Abhängigkeit vom Mac.
 */
import type { FotoBarcode } from './fotoText';

/** Stimmt die Prüfziffer? Gilt für EAN-8, UPC-A (12), EAN-13 und ITF-14. */
export function barcodeGueltig(code: unknown): code is string {
  if (typeof code !== 'string' || !/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const ziffern = [...code].map(Number);
  const pruef = ziffern.pop()!;
  let summe = 0;
  for (const [i, z] of ziffern.reverse().entries()) summe += i % 2 === 0 ? z * 3 : z;
  return (10 - (summe % 10)) % 10 === pruef;
}

/** Dieselbe Nummer steht in Datenbanken mit und ohne führende Nullen. Verglichen wird deshalb ohne. */
export const barcodeSchluessel = (code: string) => code.replace(/^0+/, '');

const ARTEN = new Set(['EAN13', 'EAN8', 'UPCE', 'UPCA', 'ITF14']);

/** Der erste Lebensmittel-Barcode auf dem Foto. QR-Codes und Ähnliches zählen nicht. */
export function barcodeAusFoto(barcodes: readonly FotoBarcode[]): string | null {
  return barcodes.find((b) => ARTEN.has(b.art) && barcodeGueltig(b.wert))?.wert ?? null;
}

/** Ein Produkt aus der Offline-Kopie. Die Werte haben Freiwillige eingetragen, deshalb kommt immer erst die Prüfseite. */
export interface KopieProdukt {
  code: string;
  name: string | null;
  marke: string | null;
  /** Packungsgröße, so wie sie in der Kopie steht: „500 g“, „1 l“. */
  menge: string | null;
  /** Werte je 100 g bzw. 100 ml, in den Codes des Programms. */
  werte: Readonly<Record<string, number>>;
}

/** „500 g“, „1,5 l“, „6 x 100 g“: Größe und Basis. Null: nicht zu erkennen. */
export function packungAus(menge: string | null): { groesse: number; basis: 'g' | 'ml' } | null {
  if (!menge) return null;
  const text = menge.toLowerCase().replace(',', '.');
  const mal = /(\d+)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/.exec(text);
  const eins = mal ? null : /(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/.exec(text);
  const anzahl = mal ? Number(mal[1]) : 1;
  const wert = mal ? Number(mal[2]) : eins ? Number(eins[1]) : null;
  const einheit = mal ? mal[3] : eins?.[2];
  if (wert === null || !einheit) return null;
  const faktor: Readonly<Record<string, number>> = { g: 1, kg: 1000, ml: 1, cl: 10, l: 1000 };
  const groesse = anzahl * wert * faktor[einheit]!;
  if (!(groesse > 0 && groesse <= 100_000)) return null;
  return { groesse, basis: einheit === 'g' || einheit === 'kg' ? 'g' : 'ml' };
}
