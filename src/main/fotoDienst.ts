/**
 * Wertet Fotos aus, egal woher sie kommen: gewählt, hineingezogen oder vom Handy. Das Ergebnis geht immer auf eine
 * Prüfseite, gespeichert wird hier nichts außer dem Foto selbst.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BarcodeTreffer, FotoErgebnis, FotoZweck, ZutatVorschlag } from '@shared/api';
import { barcodeAusFoto, barcodeGueltig } from '@shared/barcode';
import { bildArt, BILD_HOECHSTENS_BYTES } from '@shared/bildArt';
import { StarkFehler } from '@shared/fehler';
import { tabelleLesen } from '@shared/naehrwertFoto';
import { rezeptLesen, zutatSuchen, type GeleseneZutat } from '@shared/rezeptFoto';
import type { ProduktKopie } from './daten/kopie';
import type { LebensmittelDienst } from './daten/lebensmittelDienst';
import { fotoEinlesen } from './fotos';
import type { Sehen } from './sehen';

export const zweckPruefen = (roh: unknown): FotoZweck => {
  if (roh !== 'lebensmittel' && roh !== 'rezept') throw new StarkFehler('UNGUELTIG', 'Das Foto stimmt nicht.');
  return roh;
};

export class FotoDienst {
  constructor(
    private readonly sehen: Sehen,
    private readonly fotoOrdner: () => string,
    private readonly lebensmittel: LebensmittelDienst,
    private readonly kopie: ProduktKopie,
  ) {}

  barcodeNachschlagen(roh: unknown): BarcodeTreffer {
    if (!barcodeGueltig(roh)) throw new StarkFehler('UNGUELTIG', 'Dieser Barcode stimmt nicht. Bitte prüf die Ziffern.');
    const eigen = this.lebensmittel.nachBarcode(roh);
    if (eigen) return { art: 'eigen', code: roh, id: eigen.id, name: eigen.name };
    const produkt = this.kopie.holen(roh);
    if (produkt) return { art: 'kopie', code: roh, produkt };
    return { art: 'keiner', code: roh, kopieDa: this.kopie.da };
  }

  private zutatVorschlagen(z: GeleseneZutat, bestand: ReturnType<LebensmittelDienst['bestandKurz']>): ZutatVorschlag {
    const { treffer, sicher } = zutatSuchen(z, bestand);
    const beste = treffer[0];
    const unklar = z.unklar ?? (beste && !sicher ? `Nur ungefähr gefunden, bitte prüfen: „${z.name}“.` : null);
    return { ...z, unklar, lebensmittelId: beste?.id ?? null, lebensmittelName: beste?.name ?? null, alternativen: treffer.map((t) => ({ id: t.id, name: t.name })) };
  }

  /** Liest ein Foto auf der Platte. Das Foto selbst wird kleiner gerechnet und aufgehoben, bis die Prüfseite entscheidet. */
  async auswerten(pfad: string, zweck: FotoZweck): Promise<FotoErgebnis> {
    let lesung;
    try {
      lesung = await this.sehen.lesen(pfad);
    } catch {
      throw new StarkFehler('UNGUELTIG', 'Dieses Bild lässt sich nicht lesen. Bitte ein JPG, PNG oder HEIC wählen.');
    }
    const foto = await fotoEinlesen(pfad, this.fotoOrdner(), this.sehen);
    if (zweck === 'rezept') {
      const rezept = rezeptLesen(lesung.zeilen);
      const bestand = this.lebensmittel.bestandKurz();
      return { zweck, foto, rezept: { ...rezept, zutaten: rezept.zutaten.map((z) => this.zutatVorschlagen(z, bestand)) } };
    }
    const barcode = barcodeAusFoto(lesung.barcodes);
    return { zweck, foto, tabelle: tabelleLesen(lesung.zeilen), barcode: barcode ? this.barcodeNachschlagen(barcode) : null };
  }

  /** Dasselbe für Bytes, die hineingezogen wurden oder vom Handy kommen. Nur echte Bilder. */
  async ausDaten(daten: Uint8Array, zweck: FotoZweck): Promise<FotoErgebnis> {
    if (daten.length > BILD_HOECHSTENS_BYTES) throw new StarkFehler('UNGUELTIG', 'Dieses Bild ist zu groß.');
    if (bildArt(daten) === null) throw new StarkFehler('UNGUELTIG', 'Das ist kein Bild. Bitte ein JPG, PNG oder HEIC nehmen.');
    const ordner = mkdtempSync(join(tmpdir(), 'starkmacher-foto-'));
    try {
      const pfad = join(ordner, 'bild');
      writeFileSync(pfad, daten, { mode: 0o600 });
      return await this.auswerten(pfad, zweck);
    } finally {
      rmSync(ordner, { recursive: true, force: true });
    }
  }
}
