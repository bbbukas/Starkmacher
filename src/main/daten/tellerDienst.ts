/**
 * Teller. Wie bei Rezepten kommen die Nährwerte jedes Mal aus dem heutigen Stand der Bestandteile. Ein Rezept auf dem
 * Teller zerfällt in seine Zutaten, umgerechnet auf die Portionen, die draufliegen.
 */
import { randomUUID } from 'node:crypto';
import { StarkFehler } from '@shared/fehler';
import type { LebensmittelKurz } from '@shared/lebensmittel';
import { istRezeptId } from '@shared/rezepte';
import { sortierteTreffer } from '@shared/suche';
import { aggregat, bestandteilAnlegen, skaliert, type Bestandteil } from '@shared/tagebuch';
import {
  istTellerId,
  postenPruefen,
  TELLER_PREFIX,
  tellerInhalt,
  tellerPruefen,
  tellerSumme,
  type PostenStand,
  type Teller,
  type TellerAnsicht,
  type TellerKurz,
  type TellerPosten,
} from '@shared/teller';
import type { VorschlagKandidat } from '@shared/vorschlaege';
import type { Datenquelle } from './datenquelle';
import type { LebensmittelDienst } from './lebensmittelDienst';
import type { RezeptDienst } from './rezeptDienst';

export class TellerDienst {
  constructor(
    private readonly quelle: () => Datenquelle,
    private readonly lebensmittel: LebensmittelDienst,
    private readonly rezepte: RezeptDienst,
    private readonly uhr: () => string = () => new Date().toISOString(),
  ) {}

  private postenStand(posten: readonly TellerPosten[]): PostenStand[] {
    return posten.map((p) => {
      if (istRezeptId(p.bezugId)) {
        const rezept = this.rezepte.fuerEintrag(p.bezugId);
        if (!rezept) return { posten: p, bestandteile: [], problem: 'gibt-es-nicht-mehr' as const };
        const faktor = p.menge / rezept.portionen;
        const bestandteile = rezept.bestandteile.map((b): Bestandteil => ({ ...skaliert(b, faktor), id: `${p.id}/${b.id}`, rolle: p.rolle, gehoertZu: rezept.name }));
        return { posten: { ...p, name: rezept.name }, bestandteile, problem: null };
      }
      const lm = this.lebensmittel.holen(p.bezugId);
      if (!lm) return { posten: p, bestandteile: [], problem: 'gibt-es-nicht-mehr' as const };
      if (p.einheit === 'Portion' || p.einheit === 'Teller') return { posten: p, bestandteile: [], problem: 'gewicht-fehlt' as const };
      try {
        const b = bestandteilAnlegen(lm, { menge: p.menge, einheit: p.einheit, groesse: p.groesse }, p.id);
        return { posten: { ...p, name: lm.name }, bestandteile: [{ ...b, rolle: p.rolle }], problem: null };
      } catch {
        return { posten: { ...p, name: lm.name }, bestandteile: [], problem: 'gewicht-fehlt' as const };
      }
    });
  }

  private kurz(teller: Teller): TellerKurz {
    const summe = tellerSumme(this.postenStand(teller.posten));
    const bekannt = (code: string) => (summe.anzahl > 0 && summe.werte[code]!.fehltBei.length < summe.anzahl ? summe.werte[code]!.menge : null);
    return { id: teller.id, name: teller.name, kcal: bekannt('ENERCC'), eiweiss: bekannt('PROT625'), inhalt: tellerInhalt(teller.posten) };
  }

  liste(roh: unknown): TellerKurz[] {
    const text = typeof roh === 'string' ? roh.slice(0, 120) : '';
    const alle = this.quelle().tellerListe();
    const sortiert = text.trim() === '' ? alle.sort((a, b) => a.name.localeCompare(b.name, 'de')) : sortierteTreffer(alle, text);
    return sortiert.map((t) => this.kurz(t));
  }

  holen(id: unknown): TellerAnsicht | null {
    if (typeof id !== 'string') throw new StarkFehler('UNGUELTIG', 'Der Teller stimmt nicht.');
    const teller = this.quelle().tellerHolen(id);
    return teller ? { teller, posten: this.postenStand(teller.posten) } : null;
  }

  speichern(roh: unknown): TellerAnsicht {
    const eingabe = tellerPruefen(roh);
    const quelle = this.quelle();
    const vorher = eingabe.id ? quelle.tellerHolen(eingabe.id) : null;
    if (eingabe.id && !vorher) throw new StarkFehler('UNGUELTIG', 'Diesen Teller gibt es nicht mehr.');
    for (const p of eingabe.posten) {
      if (vorher?.posten.some((alt) => alt.bezugId === p.bezugId)) continue;
      const da = istRezeptId(p.bezugId) ? this.rezepte.holen(p.bezugId) : this.lebensmittel.holen(p.bezugId);
      if (!da) throw new StarkFehler('UNGUELTIG', `„${p.name || 'Ein Bestandteil'}“ gibt es nicht mehr.`);
    }
    const teller: Teller = { id: eingabe.id ?? `${TELLER_PREFIX}${randomUUID()}`, name: eingabe.name, posten: this.postenStand(eingabe.posten).map((s) => s.posten), geaendertAm: this.uhr() };
    quelle.tellerSpeichern(teller);
    return { teller, posten: this.postenStand(teller.posten) };
  }

  loeschen(id: unknown): void {
    if (typeof id !== 'string') throw new StarkFehler('UNGUELTIG', 'Der Teller stimmt nicht.');
    this.quelle().tellerLoeschen(id);
  }

  /** Nährwerte, während der Teller noch entsteht. */
  vorschau(roh: unknown): PostenStand[] {
    return Array.isArray(roh) && roh.length === 0 ? [] : this.postenStand(postenPruefen(roh));
  }

  /** Für das Tagebuch: auch ein Teller, der gar nicht gespeichert ist. */
  bestandteileFuer(posten: unknown): Bestandteil[] {
    return this.postenStand(postenPruefen(posten)).flatMap((s) => s.bestandteile);
  }

  fuerEintrag(id: string): { bezugId: string; name: string; bestandteile: Bestandteil[] } | null {
    const ansicht = this.holen(id);
    return ansicht ? { bezugId: id, name: ansicht.teller.name, bestandteile: ansicht.posten.flatMap((s) => s.bestandteile) } : null;
  }

  kurzFuerSuche(id: string): LebensmittelKurz | null {
    if (!istTellerId(id)) return null;
    const teller = this.quelle().tellerHolen(id);
    if (!teller) return null;
    const k = this.kurz(teller);
    return { id, herkunft: 'teller', name: teller.name, marke: null, gruppe: null, kcal: k.kcal, eiweiss: k.eiweiss, fett: null, kohlenhydrate: null };
  }

  /** Teller als Vorschläge im Tagebuch: ganz oder halb. */
  kandidaten(): VorschlagKandidat[] {
    const aus: VorschlagKandidat[] = [];
    for (const teller of this.quelle().tellerListe()) {
      const bestandteile = this.postenStand(teller.posten).flatMap((s) => s.bestandteile);
      if (bestandteile.length === 0) continue;
      const { gramm, werteJe100g, freierZuckerJe100g } = aggregat(bestandteile);
      if (gramm <= 0) continue;
      aus.push({ id: teller.id, name: teller.name, marke: null, herkunft: 'teller', code: null, werte: werteJe100g, freierZuckerG: freierZuckerJe100g, portionG: gramm, portionEinheit: 'Teller' });
    }
    return aus;
  }
}
