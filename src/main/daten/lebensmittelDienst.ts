/**
 * Führt Grundbestand und eigene Lebensmittel zusammen. Eine persönliche Version trägt die Kennung des
 * BLS-Lebensmittels und liegt darüber: Sie erscheint in der Suche statt des Originals, das Original bleibt
 * unberührt und kommt beim Zurücksetzen wieder zum Vorschein.
 */
import { randomUUID } from 'node:crypto';
import type { AehnlichesLebensmittel, SuchAnfrage, SuchErgebnis } from '@shared/api';
import { standardUmrechnung, umrechnungPruefen, type Umrechnung } from '@shared/einheiten';
import { barcodeSchluessel } from '@shared/barcode';
import { StarkFehler } from '@shared/fehler';
import { freierZuckerG } from '@shared/freierZucker';
import {
  blsCodeAus,
  blsId,
  EIGEN_PREFIX,
  eingabePruefen,
  freierZuckerEigen,
  istBlsId,
  schaetzungAus,
  type Lebensmittel,
  type LebensmittelEingabe,
  type LebensmittelKurz,
  type Schaetzung,
  type Werte,
} from '@shared/lebensmittel';
import { aehnlichste, sortierteTreffer } from '@shared/suche';
import type { GrundEintrag, Grundbestand } from './bls';
import type { Datenquelle, GespeichertesLebensmittel } from './datenquelle';

const TREFFER_GRENZE = 100;
const ZULETZT_ANZAHL = 8;

function kurzAusWerten(id: string, herkunft: LebensmittelKurz['herkunft'], name: string, marke: string | null, gruppe: string | null, w: Werte): LebensmittelKurz {
  return {
    id,
    herkunft,
    name,
    marke,
    gruppe,
    kcal: w.ENERCC ?? null,
    eiweiss: w.PROT625 ?? null,
    fett: w.FAT ?? null,
    kohlenhydrate: w.CHO ?? null,
  };
}

export class LebensmittelDienst {
  private kurzeBls: LebensmittelKurz[] | null = null;

  constructor(
    private readonly quelle: () => Datenquelle,
    private readonly grund: Grundbestand,
    private readonly fotoEntfernen: (name: string) => void = () => {},
    private readonly uhr: () => string = () => new Date().toISOString(),
  ) {}

  private blsListe(): LebensmittelKurz[] {
    this.kurzeBls ??= this.grund.liste().map((e: GrundEintrag) => kurzAusWerten(blsId(e.code), 'bls', e.name, null, e.code[0] ?? null, e.werte));
    return this.kurzeBls;
  }

  private eigeneKurz(eintrag: GespeichertesLebensmittel): LebensmittelKurz {
    const version = istBlsId(eintrag.id);
    const gruppe = version ? (blsCodeAus(eintrag.id)[0] ?? null) : null;
    return kurzAusWerten(eintrag.id, version ? 'version' : 'eigen', eintrag.name, eintrag.marke, gruppe, eintrag.werte);
  }

  suchen(roh: SuchAnfrage): SuchErgebnis {
    const text = typeof roh?.text === 'string' ? roh.text.slice(0, 120) : '';
    const filter = roh?.filter === 'bls' || roh?.filter === 'eigene' ? roh.filter : 'alle';
    const quelle = this.quelle();
    const gespeichert = quelle.eigeneListe();
    const eigene = gespeichert.map((e) => this.eigeneKurz(e));
    const versionen = new Set(gespeichert.filter((e) => istBlsId(e.id)).map((e) => e.id));

    const bestand: LebensmittelKurz[] = [];
    // Bei „nur BLS“ gilt die eigene Version weiter statt des Originals, nur rein eigene Einträge fallen weg.
    if (filter !== 'eigene') bestand.push(...this.blsListe().filter((k) => !versionen.has(k.id)));
    bestand.push(...(filter === 'bls' ? eigene.filter((k) => k.herkunft === 'version') : eigene));

    const nachId = new Map(bestand.map((k) => [k.id, k]));
    const zuletzt = quelle
      .zuletztVerwendet(ZULETZT_ANZAHL * 3)
      .map((id) => nachId.get(id))
      .filter((k): k is LebensmittelKurz => k !== undefined)
      .slice(0, ZULETZT_ANZAHL);

    if (text.trim() === '') {
      const nurEigene = filter === 'eigene' ? eigene.sort((a, b) => a.name.localeCompare(b.name, 'de')) : [];
      return { zuletzt, treffer: nurEigene, gesamt: nurEigene.length, grundbestandDa: this.grund.liste().length > 0 };
    }
    const alle = sortierteTreffer(bestand, text);
    return { zuletzt: [], treffer: alle.slice(0, TREFFER_GRENZE), gesamt: alle.length, grundbestandDa: this.grund.liste().length > 0 };
  }

  /** Alles, was sich als Zutat wählen lässt: Eine persönliche Version ersetzt ihr Original. */
  bestandKurz(): LebensmittelKurz[] {
    const gespeichert = this.quelle().eigeneListe();
    const versionen = new Set(gespeichert.filter((e) => istBlsId(e.id)).map((e) => e.id));
    return [...gespeichert.map((e) => this.eigeneKurz(e)), ...this.blsListe().filter((k) => !versionen.has(k.id))];
  }

  /** Das eigene Lebensmittel mit diesem Barcode, null: keins. */
  nachBarcode(code: string): Lebensmittel | null {
    const schluessel = barcodeSchluessel(code);
    const eintrag = this.quelle()
      .eigeneListe()
      .find((e) => e.barcode && barcodeSchluessel(e.barcode) === schluessel);
    return eintrag ? this.holen(eintrag.id) : null;
  }

  holen(id: unknown): Lebensmittel | null {
    if (typeof id !== 'string') throw new StarkFehler('UNGUELTIG', 'Das Lebensmittel stimmt nicht.');
    const quelle = this.quelle();
    const eigen = quelle.eigenesHolen(id);
    const gespeicherteUmrechnung = quelle.umrechnungHolen(id);
    if (eigen) return this.ausEigenem(eigen, gespeicherteUmrechnung);
    if (!istBlsId(id)) return null;
    const code = blsCodeAus(id);
    const g = this.grund.holen(code);
    if (!g) return null;
    return {
      id,
      herkunft: 'bls',
      name: g.name,
      marke: null,
      gruppe: code[0] ?? null,
      basis: 'g',
      werte: g.werte,
      spuren: g.spuren,
      schaetzung: null,
      freierZuckerG: g.freierZuckerG,
      nurNatuerlicherZucker: g.freierZuckerG === 0,
      packung: null,
      foto: null,
      hinweise: g.hinweise,
      anmerkung: g.anmerkung,
      umrechnung: gespeicherteUmrechnung ?? standardUmrechnung(g.name, code),
      umrechnungAngepasst: gespeicherteUmrechnung !== null,
    };
  }

  private ausEigenem(e: GespeichertesLebensmittel, gespeichert: Umrechnung | null): Lebensmittel {
    const version = istBlsId(e.id);
    const code = version ? blsCodeAus(e.id) : null;
    const original = code ? this.grund.holen(code) : null;
    const standard = standardUmrechnung(original?.name ?? e.name, code);
    const umrechnung = gespeichert ?? standard;
    // Die Packungsgröße steht im Formular, und mit ihr wird „1 Packung“ rechenbar.
    const packung = e.packung === null ? umrechnung.packung : e.basis === 'ml' ? e.packung * umrechnung.dichte : e.packung;
    return {
      id: e.id,
      herkunft: version ? 'version' : 'eigen',
      name: e.name,
      marke: e.marke,
      gruppe: code?.[0] ?? null,
      basis: e.basis,
      werte: e.werte,
      // Spuren gelten nur, solange der Wert noch der des Originals ist.
      spuren: original ? original.spuren.filter((c) => e.werte[c] === 0) : [],
      schaetzung: e.schaetzung,
      freierZuckerG: version
        ? e.nurNatuerlicherZucker
          ? e.werte.SUGAR === undefined
            ? null
            : 0
          : freierZuckerG('frei', e.werte.SUGAR ?? null, e.werte.LACS ?? null)
        : freierZuckerEigen(e.werte, e.nurNatuerlicherZucker),
      nurNatuerlicherZucker: e.nurNatuerlicherZucker,
      packung: e.packung,
      foto: e.foto,
      barcode: e.barcode ?? null,
      hinweise: [],
      anmerkung: original?.anmerkung ?? null,
      umrechnung: { ...umrechnung, packung },
      umrechnungAngepasst: gespeichert !== null,
    };
  }

  speichern(roh: unknown): Lebensmittel {
    const eingabe: LebensmittelEingabe = eingabePruefen(roh);
    const quelle = this.quelle();
    const id = eingabe.id ?? `${EIGEN_PREFIX}${randomUUID()}`;
    if (istBlsId(id) && !this.grund.holen(blsCodeAus(id))) throw new StarkFehler('UNGUELTIG', 'Das Original gibt es nicht.');
    const vorher = quelle.eigenesHolen(id);
    if (eingabe.id?.startsWith(EIGEN_PREFIX) && !vorher) throw new StarkFehler('UNGUELTIG', 'Das Lebensmittel gibt es nicht mehr.');
    const { id: _ohne, ...daten } = eingabe;
    quelle.eigenesSpeichern({ id, ...daten, geaendertAm: this.uhr() });
    quelle.verwendetMerken(id, this.uhr());
    if (vorher?.foto && vorher.foto !== eingabe.foto) this.fotoEntfernen(vorher.foto);
    const fertig = this.holen(id);
    if (!fertig) throw new StarkFehler('FEHLER', 'Das Speichern hat nicht geklappt.');
    return fertig;
  }

  /** Löscht ein eigenes Lebensmittel. Bei einer persönlichen Version kommt das Original zurück. */
  loeschen(id: unknown): void {
    if (typeof id !== 'string') throw new StarkFehler('UNGUELTIG', 'Das Lebensmittel stimmt nicht.');
    const quelle = this.quelle();
    const eintrag = quelle.eigenesHolen(id);
    if (!eintrag) return;
    quelle.eigenesLoeschen(id);
    if (eintrag.foto) this.fotoEntfernen(eintrag.foto);
  }

  umrechnungSpeichern(id: unknown, roh: unknown): Lebensmittel {
    if (typeof id !== 'string') throw new StarkFehler('UNGUELTIG', 'Das Lebensmittel stimmt nicht.');
    const quelle = this.quelle();
    if (!this.holen(id)) throw new StarkFehler('UNGUELTIG', 'Das Lebensmittel gibt es nicht mehr.');
    quelle.umrechnungSpeichern(id, roh === null ? null : umrechnungPruefen(roh));
    return this.holen(id)!;
  }

  verwendet(id: unknown): void {
    if (typeof id === 'string' && this.holen(id)) this.quelle().verwendetMerken(id, this.uhr());
  }

  /** Ähnliche BLS-Lebensmittel als Vorschlag für die fehlenden Werte. Trägt nichts ein. */
  aehnliche(roh: { name?: unknown; werte?: unknown }): AehnlichesLebensmittel[] {
    const name = typeof roh?.name === 'string' ? roh.name.slice(0, 160) : '';
    const werte = (typeof roh?.werte === 'object' && roh.werte !== null ? roh.werte : {}) as Record<string, number>;
    const eintraege = this.grund.liste();
    return aehnlichste({ name, werte }, eintraege).map((e) => {
      const voll = this.grund.holen(e.code)!;
      const schaetzung: Schaetzung = schaetzungAus(voll, werte);
      return { code: e.code, name: e.name, gruppe: e.code[0] ?? null, vergleich: e.werte, schaetzung };
    });
  }
}
