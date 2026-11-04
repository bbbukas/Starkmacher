/**
 * Die Einkaufsliste. Gespeichert sind nur die Wahl und die Haken, die Mengen rechnet der Dienst jedes Mal aus dem heutigen
 * Stand der Rezepte und Teller. Gibt es ein Lebensmittel nicht mehr, bleibt die Zutat trotzdem auf der Liste: Kaufen kann man sie noch.
 */
import type { MengenEinheit } from '@shared/einheiten';
import { anzahlErlaubt, einkaufText, einkaufZeilen, type EinkaufAnsicht, type EinkaufDaten, type EinkaufPosten, type EinkaufQuelle, type EinkaufQuellenStand } from '@shared/einkauf';
import { StarkFehler } from '@shared/fehler';
import type { Lebensmittel } from '@shared/lebensmittel';
import { istRezeptId, type Rezept } from '@shared/rezepte';
import { istTellerId } from '@shared/teller';
import type { Datenquelle } from './datenquelle';
import type { LebensmittelDienst } from './lebensmittelDienst';

/** Eine Zutat, bevor das Lebensmittel dazu nachgeschlagen ist. */
type RohPosten = { lebensmittelId: string; name: string; menge: number; einheit: MengenEinheit; groesse: EinkaufPosten['groesse'] };

const zutatenVon = (rezept: Rezept, faktor: number): RohPosten[] => rezept.zutaten.map((z) => ({ lebensmittelId: z.lebensmittelId, name: z.name, menge: z.menge * faktor, einheit: z.einheit, groesse: z.groesse }));

export class EinkaufDienst {
  constructor(
    private readonly quelle: () => Datenquelle,
    private readonly lebensmittel: LebensmittelDienst,
  ) {}

  private quelleLesen(q: EinkaufQuelle): { stand: EinkaufQuellenStand; posten: RohPosten[] } {
    const daten = this.quelle();
    if (istRezeptId(q.bezugId)) {
      const rezept = daten.rezeptHolen(q.bezugId);
      if (!rezept) return { stand: { ...q, art: 'rezept', fehlt: true, notiz: null, ohne: [] }, posten: [] };
      return { stand: { ...q, name: rezept.name, art: 'rezept', fehlt: false, notiz: rezept.notiz.trim() || null, ohne: [] }, posten: zutatenVon(rezept, q.anzahl / rezept.portionen) };
    }
    const teller = daten.tellerHolen(q.bezugId);
    if (!teller) return { stand: { ...q, art: 'teller', fehlt: true, notiz: null, ohne: [] }, posten: [] };
    const posten: RohPosten[] = [];
    const ohne: string[] = [];
    for (const p of teller.posten) {
      if (istRezeptId(p.bezugId)) {
        const rezept = daten.rezeptHolen(p.bezugId);
        if (rezept) posten.push(...zutatenVon(rezept, (p.menge * q.anzahl) / rezept.portionen));
        else ohne.push(p.name);
      } else if (p.einheit !== 'Portion' && p.einheit !== 'Teller') {
        posten.push({ lebensmittelId: p.bezugId, name: p.name, menge: p.menge * q.anzahl, einheit: p.einheit, groesse: p.groesse });
      }
    }
    return { stand: { ...q, name: teller.name, art: 'teller', fehlt: false, notiz: null, ohne }, posten };
  }

  private rechnen(daten: EinkaufDaten): EinkaufAnsicht {
    const gelesen = daten.quellen.map((q) => this.quelleLesen(q));
    // Dasselbe Lebensmittel steht oft in mehreren Rezepten: nur einmal nachschlagen.
    const gemerkt = new Map<string, Lebensmittel | null>();
    const lebensmittelVon = (id: string) => {
      if (!gemerkt.has(id)) gemerkt.set(id, this.lebensmittel.holen(id));
      return gemerkt.get(id)!;
    };
    const posten = gelesen.flatMap(({ stand, posten: roh }) =>
      roh.map((p): EinkaufPosten => {
        const lm = lebensmittelVon(p.lebensmittelId);
        return { schluessel: p.lebensmittelId, name: lm?.name ?? p.name, menge: p.menge, einheit: p.einheit, groesse: p.groesse, umrechnung: lm?.umrechnung ?? null, fuer: stand.name };
      }),
    );
    return { quellen: gelesen.map((g) => g.stand), zeilen: einkaufZeilen(posten, daten.haken) };
  }

  private schreiben(daten: EinkaufDaten): EinkaufAnsicht {
    this.quelle().einkaufSpeichern(daten);
    return this.rechnen(daten);
  }

  ansicht(): EinkaufAnsicht {
    return this.rechnen(this.quelle().einkaufLaden());
  }

  /** Steht es schon darauf, kommt noch einmal dieselbe Menge dazu. */
  hinzufuegen(id: unknown): EinkaufAnsicht {
    if (typeof id !== 'string' || (!istRezeptId(id) && !istTellerId(id))) throw new StarkFehler('UNGUELTIG', 'Das lässt sich nicht auf die Liste setzen.');
    const daten = this.quelle();
    const rezept = istRezeptId(id) ? daten.rezeptHolen(id) : null;
    const teller = istTellerId(id) ? daten.tellerHolen(id) : null;
    if (!rezept && !teller) throw new StarkFehler('UNGUELTIG', 'Das gibt es nicht mehr.');
    const dazu = rezept ? rezept.portionen : 1;
    const stand = daten.einkaufLaden();
    const da = stand.quellen.find((q) => q.bezugId === id);
    const quellen = da ? stand.quellen.map((q) => (q === da ? { ...q, anzahl: Math.min(200, q.anzahl + dazu) } : q)) : [...stand.quellen, { bezugId: id, name: rezept?.name ?? teller!.name, anzahl: dazu }];
    return this.schreiben({ ...stand, quellen });
  }

  anzahlSetzen(id: unknown, anzahl: unknown): EinkaufAnsicht {
    if (typeof anzahl !== 'number' || !anzahlErlaubt(anzahl)) throw new StarkFehler('UNGUELTIG', 'Bitte eine Anzahl über 0 eintragen.');
    const stand = this.quelle().einkaufLaden();
    if (!stand.quellen.some((q) => q.bezugId === id)) throw new StarkFehler('UNGUELTIG', 'Das steht nicht mehr auf der Liste.');
    return this.schreiben({ ...stand, quellen: stand.quellen.map((q) => (q.bezugId === id ? { ...q, anzahl } : q)) });
  }

  entfernen(id: unknown): EinkaufAnsicht {
    const stand = this.quelle().einkaufLaden();
    return this.schreiben({ ...stand, quellen: stand.quellen.filter((q) => q.bezugId !== id) });
  }

  abhaken(schluessel: unknown, ja: unknown): EinkaufAnsicht {
    if (typeof schluessel !== 'string') throw new StarkFehler('UNGUELTIG', 'Diese Zeile stimmt nicht.');
    const stand = this.quelle().einkaufLaden();
    const ohne = stand.haken.filter((h) => h.schluessel !== schluessel);
    const zeile = this.rechnen(stand).zeilen.find((z) => z.schluessel === schluessel);
    return this.schreiben({ ...stand, haken: ja === true && zeile ? [...ohne, { schluessel, stand: zeile.stand }] : ohne });
  }

  hakenEntfernen(): EinkaufAnsicht {
    return this.schreiben({ ...this.quelle().einkaufLaden(), haken: [] });
  }

  leeren(): EinkaufAnsicht {
    return this.schreiben({ quellen: [], haken: [] });
  }

  /** Was noch fehlt, zum Mitnehmen. */
  text(): string {
    return einkaufText(this.ansicht().zeilen);
  }
}
