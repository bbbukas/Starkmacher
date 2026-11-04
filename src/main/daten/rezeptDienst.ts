/**
 * Rezepte und Hashtags. Die Nährwerte rechnet der Dienst jedes Mal aus den Zutaten, damit eine korrigierte Zutat
 * in allen Rezepten gilt. Was im Tagebuch steht, hat seinen eigenen Stand und bleibt davon unberührt.
 */
import { randomUUID } from 'node:crypto';
import { StarkFehler } from '@shared/fehler';
import type { LebensmittelKurz } from '@shared/lebensmittel';
import {
  farbeOderErste,
  hashtagName,
  istRezeptId,
  jePortion,
  REZEPT_PREFIX,
  rezeptPruefen,
  rezeptSumme,
  type Hashtag,
  type Rezept,
  type RezeptAnfrage,
  type RezeptAnsicht,
  type RezeptKurz,
  type RezeptZutat,
  type ZutatStand,
} from '@shared/rezepte';
import { sortierteTreffer } from '@shared/suche';
import { aggregat, bestandteilAnlegen, type Bestandteil } from '@shared/tagebuch';
import type { VorschlagKandidat } from '@shared/vorschlaege';
import type { Datenquelle } from './datenquelle';
import type { LebensmittelDienst } from './lebensmittelDienst';

export class RezeptDienst {
  constructor(
    private readonly quelle: () => Datenquelle,
    private readonly lebensmittel: LebensmittelDienst,
    private readonly fotoEntfernen: (name: string) => void = () => {},
    private readonly uhr: () => string = () => new Date().toISOString(),
  ) {}

  private zutatenStand(zutaten: readonly RezeptZutat[]): ZutatStand[] {
    return zutaten.map((zutat) => {
      const lm = this.lebensmittel.holen(zutat.lebensmittelId);
      if (!lm) return { zutat, bestandteil: null, problem: 'gibt-es-nicht-mehr' as const };
      try {
        return { zutat: { ...zutat, name: lm.name }, bestandteil: bestandteilAnlegen(lm, zutat, zutat.id), problem: null };
      } catch {
        return { zutat: { ...zutat, name: lm.name }, bestandteil: null, problem: 'gewicht-fehlt' as const };
      }
    });
  }

  private ansicht(rezept: Rezept): RezeptAnsicht {
    return { rezept, zutaten: this.zutatenStand(rezept.zutaten) };
  }

  private kurz(rezept: Rezept): RezeptKurz {
    const portion = jePortion(rezeptSumme(this.zutatenStand(rezept.zutaten)), rezept.portionen);
    const bekannt = (code: string) => (portion.anzahl > 0 && portion.werte[code]!.fehltBei.length < portion.anzahl ? portion.werte[code]!.menge : null);
    return { id: rezept.id, name: rezept.name, portionen: rezept.portionen, kcalJePortion: bekannt('ENERCC'), eiweissJePortion: bekannt('PROT625'), hashtags: rezept.hashtags, foto: rezept.fotos[0] ?? null };
  }

  liste(roh: Partial<RezeptAnfrage> | undefined): RezeptKurz[] {
    const text = typeof roh?.text === 'string' ? roh.text.slice(0, 120) : '';
    const hashtags = Array.isArray(roh?.hashtags) ? roh.hashtags.filter((h): h is string => typeof h === 'string') : [];
    const passend = this.quelle()
      .rezepteListe()
      .filter((r) => hashtags.every((h) => r.hashtags.includes(h)));
    const sortiert = text.trim() === '' ? passend.sort((a, b) => a.name.localeCompare(b.name, 'de')) : sortierteTreffer(passend, text);
    return sortiert.map((r) => this.kurz(r));
  }

  holen(id: unknown): RezeptAnsicht | null {
    if (typeof id !== 'string') throw new StarkFehler('UNGUELTIG', 'Das Rezept stimmt nicht.');
    const rezept = this.quelle().rezeptHolen(id);
    return rezept ? this.ansicht(rezept) : null;
  }

  speichern(roh: unknown): RezeptAnsicht {
    const eingabe = rezeptPruefen(roh);
    const quelle = this.quelle();
    const vorher = eingabe.id ? quelle.rezeptHolen(eingabe.id) : null;
    if (eingabe.id && !vorher) throw new StarkFehler('UNGUELTIG', 'Dieses Rezept gibt es nicht mehr.');
    const bekannteHashtags = new Set(quelle.hashtagsListe().map((h) => h.id));
    for (const zutat of eingabe.zutaten) {
      // Eine Zutat, die es nicht mehr gibt, darf stehen bleiben. Neue müssen existieren.
      const schonDa = vorher?.zutaten.some((z) => z.lebensmittelId === zutat.lebensmittelId);
      if (!schonDa && !this.lebensmittel.holen(zutat.lebensmittelId)) throw new StarkFehler('UNGUELTIG', `„${zutat.name || 'Eine Zutat'}“ gibt es nicht mehr.`);
    }
    const rezept: Rezept = { ...eingabe, id: eingabe.id ?? `${REZEPT_PREFIX}${randomUUID()}`, hashtags: eingabe.hashtags.filter((h) => bekannteHashtags.has(h)), geaendertAm: this.uhr() };
    rezept.zutaten = this.zutatenStand(rezept.zutaten).map((z) => z.zutat);
    quelle.rezeptSpeichern(rezept);
    for (const foto of vorher?.fotos ?? []) if (!rezept.fotos.includes(foto)) this.fotoAufraeumen(foto);
    return this.ansicht(rezept);
  }

  loeschen(id: unknown): void {
    if (typeof id !== 'string') throw new StarkFehler('UNGUELTIG', 'Das Rezept stimmt nicht.');
    const quelle = this.quelle();
    const rezept = quelle.rezeptHolen(id);
    if (!rezept) return;
    quelle.rezeptLoeschen(id);
    for (const foto of rezept.fotos) this.fotoAufraeumen(foto);
  }

  /** Ein Foto kann nach „Als neues Rezept speichern“ zu mehreren Rezepten gehören. */
  private fotoAufraeumen(foto: string): void {
    if (!this.quelle().rezepteListe().some((r) => r.fotos.includes(foto))) this.fotoEntfernen(foto);
  }

  /** Nährwerte für das Formular, bevor das Rezept gespeichert ist. */
  vorschau(roh: unknown): ZutatStand[] {
    if (!Array.isArray(roh)) throw new StarkFehler('UNGUELTIG', 'Die Zutaten stimmen nicht.');
    return this.zutatenStand(rezeptPruefen({ name: 'Vorschau', portionen: 1, zutaten: roh }).zutaten);
  }

  hashtags(): Hashtag[] {
    return this.quelle()
      .hashtagsListe()
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  hashtagSpeichern(roh: unknown): Hashtag {
    if (typeof roh !== 'object' || roh === null) throw new StarkFehler('UNGUELTIG', 'Der Hashtag stimmt nicht.');
    const h = roh as Record<string, unknown>;
    const name = hashtagName(h.name);
    const quelle = this.quelle();
    const alle = quelle.hashtagsListe();
    const id = typeof h.id === 'string' ? h.id : randomUUID();
    if (alle.some((a) => a.id !== id && a.name.toLowerCase() === name.toLowerCase())) throw new StarkFehler('UNGUELTIG', `Den Hashtag #${name} gibt es schon.`);
    const hashtag: Hashtag = { id, name, farbe: farbeOderErste(h.farbe ?? alle.find((a) => a.id === id)?.farbe) };
    quelle.hashtagSpeichern(hashtag);
    return hashtag;
  }

  /** Nimmt den Hashtag auch aus allen Rezepten. Die Rezepte selbst bleiben. */
  hashtagLoeschen(id: unknown): void {
    if (typeof id !== 'string') throw new StarkFehler('UNGUELTIG', 'Der Hashtag stimmt nicht.');
    this.quelle().hashtagLoeschen(id);
  }

  /** Für das Tagebuch: das Rezept mit dem heutigen Stand seiner Zutaten. */
  fuerEintrag(id: string): { rezeptId: string; name: string; portionen: number; bestandteile: Bestandteil[] } | null {
    const ansicht = this.holen(id);
    if (!ansicht) return null;
    return { rezeptId: id, name: ansicht.rezept.name, portionen: ansicht.rezept.portionen, bestandteile: ansicht.zutaten.flatMap((z) => (z.bestandteil ? [z.bestandteil] : [])) };
  }

  kurzFuerSuche(id: string): LebensmittelKurz | null {
    if (!istRezeptId(id)) return null;
    const rezept = this.quelle().rezeptHolen(id);
    if (!rezept) return null;
    const k = this.kurz(rezept);
    return { id, herkunft: 'rezept', name: rezept.name, marke: null, gruppe: null, kcal: k.kcalJePortion, eiweiss: k.eiweissJePortion, fett: null, kohlenhydrate: null };
  }

  /** Rezepte als Vorschläge im Tagebuch: immer als Portion. */
  kandidaten(): VorschlagKandidat[] {
    const aus: VorschlagKandidat[] = [];
    for (const rezept of this.quelle().rezepteListe()) {
      const bestandteile = this.zutatenStand(rezept.zutaten).flatMap((z) => (z.bestandteil ? [z.bestandteil] : []));
      if (bestandteile.length === 0) continue;
      const { gramm, werteJe100g, freierZuckerJe100g } = aggregat(bestandteile);
      if (gramm <= 0) continue;
      aus.push({ id: rezept.id, name: rezept.name, marke: null, herkunft: 'rezept', code: null, werte: werteJe100g, freierZuckerG: freierZuckerJe100g, portionG: gramm / rezept.portionen });
    }
    return aus;
  }
}
