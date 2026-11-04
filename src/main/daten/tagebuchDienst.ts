/**
 * Das Tagebuch: Einträge halten den Stand des Lebensmittels fest. Die Vorschläge kommen aus dem Eigenen
 * und dem Grundbestand und bleiben unter allen Grenzen des Tages.
 */
import { randomUUID } from 'node:crypto';
import type { TagAntwort, VorschlagsAntwort } from '@shared/api';
import { bedarfAusProfil } from '@shared/bedarf';
import { StarkFehler } from '@shared/fehler';
import { blsId, werteJe100g, type LebensmittelKurz } from '@shared/lebensmittel';
import { datumErlaubt, datumVon } from '@shared/profil';
import { istRezeptId } from '@shared/rezepte';
import {
  bestandteilAnlegen,
  bestandteilMenge,
  eingabePruefenEintrag,
  eintragAendern,
  eintragAnlegen,
  kcalFrei,
  mahlzeitPruefen,
  mengenAngabePruefen,
  portionenPruefen,
  rezeptEintragAendern,
  rezeptEintragAnlegen,
  tagesLuecken,
  tagessumme,
  type Bestandteil,
  type EintragEingabe,
  type TagebuchEintrag,
} from '@shared/tagebuch';
import { istTellerId, postenPruefen, ROLLEN, TELLER_PREFIX, type Rolle } from '@shared/teller';
import { grenzenAus, taugtAlsVorschlag, vorschlagen, type VorschlagKandidat } from '@shared/vorschlaege';
import { wochenLueckenFuerTag, wochenstand, wochenTage } from '@shared/woche';
import type { Grundbestand } from './bls';
import type { Datenquelle } from './datenquelle';
import type { LebensmittelDienst } from './lebensmittelDienst';
import type { RezeptDienst } from './rezeptDienst';
import type { TellerDienst } from './tellerDienst';

const ZULETZT_ANZAHL = 8;

export class TagebuchDienst {
  private blsKandidaten: VorschlagKandidat[] | null = null;

  constructor(
    private readonly quelle: () => Datenquelle,
    private readonly lebensmittel: LebensmittelDienst,
    private readonly rezepte: RezeptDienst,
    private readonly teller: TellerDienst,
    private readonly grund: Grundbestand,
    private readonly jahr: () => number = () => new Date().getFullYear(),
    private readonly uhr: () => string = () => new Date().toISOString(),
  ) {}

  tag(datum: unknown): TagAntwort {
    if (!datumErlaubt(datum)) throw new StarkFehler('UNGUELTIG', 'Das Datum stimmt nicht.');
    return { datum, eintraege: this.quelle().tagebuchTag(datum), woche: this.eintraegeDerWoche(datum) };
  }

  private eintraegeDerWoche(datum: string): TagebuchEintrag[] {
    const quelle = this.quelle();
    return wochenTage(datum).flatMap((tag) => quelle.tagebuchTag(tag));
  }

  eintragen(roh: unknown): TagebuchEintrag {
    const eingabe = eingabePruefenEintrag(roh);
    if (istRezeptId(eingabe.lebensmittelId)) return this.rezeptEintragen(eingabe);
    if (istTellerId(eingabe.lebensmittelId)) return this.gespeichertenTellerEintragen(eingabe);
    const lm = this.lebensmittel.holen(eingabe.lebensmittelId);
    if (!lm) throw new StarkFehler('UNGUELTIG', 'Dieses Lebensmittel gibt es nicht mehr.');
    const eintrag = eintragAnlegen(lm, eingabe, randomUUID(), this.uhr());
    const quelle = this.quelle();
    quelle.tagebuchSpeichern(eintrag);
    quelle.verwendetMerken(lm.id, this.uhr());
    return eintrag;
  }

  private rezeptEintragen(eingabe: EintragEingabe): TagebuchEintrag {
    const rezept = this.rezepte.fuerEintrag(eingabe.lebensmittelId);
    if (!rezept) throw new StarkFehler('UNGUELTIG', 'Dieses Rezept gibt es nicht mehr.');
    const eintrag = rezeptEintragAnlegen(rezept, { ...eingabe, menge: portionenPruefen(eingabe.menge) }, randomUUID(), this.uhr(), randomUUID);
    this.quelle().tagebuchSpeichern(eintrag);
    return eintrag;
  }

  private gespeichertenTellerEintragen(eingabe: EintragEingabe): TagebuchEintrag {
    const teller = this.teller.fuerEintrag(eingabe.lebensmittelId);
    if (!teller) throw new StarkFehler('UNGUELTIG', 'Diesen Teller gibt es nicht mehr.');
    return this.tellerFesthalten(teller.bezugId, teller.name, teller.bestandteile, eingabe);
  }

  /** Was gerade auf dem Teller liegt, auch wenn der Teller gar nicht gespeichert ist. */
  tellerEintragen(roh: unknown): TagebuchEintrag {
    if (typeof roh !== 'object' || roh === null) throw new StarkFehler('UNGUELTIG', 'Der Teller stimmt nicht.');
    const r = roh as Record<string, unknown>;
    const name = typeof r.name === 'string' && r.name.trim() !== '' ? r.name.trim().slice(0, 160) : 'Teller';
    const bezugId = typeof r.tellerId === 'string' && istTellerId(r.tellerId) ? r.tellerId : `${TELLER_PREFIX}entwurf`;
    const eingabe = eingabePruefenEintrag({ datum: r.datum, mahlzeit: r.mahlzeit, lebensmittelId: bezugId, menge: r.menge, einheit: 'Teller', groesse: null });
    return this.tellerFesthalten(bezugId, name, this.teller.bestandteileFuer(postenPruefen(r.posten)), eingabe);
  }

  private tellerFesthalten(bezugId: string, name: string, bestandteile: Bestandteil[], eingabe: EintragEingabe): TagebuchEintrag {
    if (bestandteile.length === 0) throw new StarkFehler('UNGUELTIG', 'Auf diesem Teller liegt nichts, was sich rechnen lässt.');
    const eintrag = rezeptEintragAnlegen({ rezeptId: bezugId, name, portionen: 1, bestandteile, art: 'teller' }, { ...eingabe, menge: portionenPruefen(eingabe.menge) }, randomUUID(), this.uhr(), randomUUID);
    this.quelle().tagebuchSpeichern(eintrag);
    return eintrag;
  }

  /** Portionen und Zutaten eines Rezept-Eintrags oder Tellers, nur für dieses eine Mal. */
  private rezeptAendern(eintrag: TagebuchEintrag, roh: unknown): TagebuchEintrag {
    if (typeof roh !== 'object' || roh === null) throw new StarkFehler('UNGUELTIG', 'Die Änderung stimmt nicht.');
    const r = roh as Record<string, unknown>;
    const menge = portionenPruefen(r.menge);
    const mahlzeit = mahlzeitPruefen(r.mahlzeit);
    if (r.bestandteile === undefined) return rezeptEintragAendern(eintrag, { menge, mahlzeit });
    if (!Array.isArray(r.bestandteile)) throw new StarkFehler('UNGUELTIG', 'Die Zutaten stimmen nicht.');
    const alte = new Map((eintrag.rezept?.bestandteile ?? []).map((b) => [b.id, b]));
    const bestandteile: Bestandteil[] = r.bestandteile.map((roheZutat: unknown) => {
      if (typeof roheZutat !== 'object' || roheZutat === null) throw new StarkFehler('UNGUELTIG', 'Eine Zutat stimmt nicht.');
      const z = roheZutat as Record<string, unknown>;
      const alt = typeof z.id === 'string' ? alte.get(z.id) : undefined;
      if (alt) return bestandteilMenge(alt, z);
      if (typeof z.lebensmittelId !== 'string') throw new StarkFehler('UNGUELTIG', 'Eine Zutat stimmt nicht.');
      const lm = this.lebensmittel.holen(z.lebensmittelId);
      if (!lm) throw new StarkFehler('UNGUELTIG', 'Dieses Lebensmittel gibt es nicht mehr.');
      const neu = bestandteilAnlegen(lm, mengenAngabePruefen(z), randomUUID());
      return ROLLEN.some((rolle) => rolle.id === z.rolle) ? { ...neu, rolle: z.rolle as Rolle } : neu;
    });
    if (bestandteile.length === 0) throw new StarkFehler('UNGUELTIG', 'Bitte lass mindestens eine Zutat stehen, oder lösche den Eintrag.');
    return rezeptEintragAendern(eintrag, { menge, mahlzeit, bestandteile });
  }

  aendern(id: unknown, roh: unknown): TagebuchEintrag {
    if (typeof id !== 'string') throw new StarkFehler('UNGUELTIG', 'Der Eintrag stimmt nicht.');
    const quelle = this.quelle();
    const eintrag = quelle.tagebuchEintrag(id);
    if (!eintrag) throw new StarkFehler('UNGUELTIG', 'Diesen Eintrag gibt es nicht mehr.');
    const neu = eintrag.art === 'lebensmittel' ? eintragAendern(eintrag, roh) : this.rezeptAendern(eintrag, roh);
    quelle.tagebuchSpeichern(neu);
    return neu;
  }

  loeschen(id: unknown): void {
    if (typeof id !== 'string') throw new StarkFehler('UNGUELTIG', 'Der Eintrag stimmt nicht.');
    this.quelle().tagebuchLoeschen(id);
  }

  /** Zuletzt Gegessenes für die Suche im Eintragen-Fenster. Was es nicht mehr gibt, fällt weg. */
  zuletztGegessen(): LebensmittelKurz[] {
    const aus: LebensmittelKurz[] = [];
    for (const id of this.quelle().tagebuchZuletzt(ZULETZT_ANZAHL * 2)) {
      if (istRezeptId(id)) {
        const rezept = this.rezepte.kurzFuerSuche(id);
        if (rezept) aus.push(rezept);
        if (aus.length >= ZULETZT_ANZAHL) break;
        continue;
      }
      if (istTellerId(id)) {
        const teller = this.teller.kurzFuerSuche(id);
        if (teller) aus.push(teller);
        if (aus.length >= ZULETZT_ANZAHL) break;
        continue;
      }
      const lm = this.lebensmittel.holen(id);
      if (!lm) continue;
      const w = werteJe100g(lm);
      aus.push({
        id,
        herkunft: lm.herkunft,
        name: lm.name,
        marke: lm.marke,
        gruppe: lm.gruppe,
        kcal: w.ENERCC ?? null,
        eiweiss: w.PROT625 ?? null,
        fett: w.FAT ?? null,
        kohlenhydrate: w.CHO ?? null,
      });
      if (aus.length >= ZULETZT_ANZAHL) break;
    }
    return aus;
  }

  private ausGrundbestand(): VorschlagKandidat[] {
    this.blsKandidaten ??= this.grund
      .vorschlagsListe()
      .filter((e) => taugtAlsVorschlag(e.name))
      .map((e) => ({ id: blsId(e.code), name: e.name, marke: null, herkunft: 'bls' as const, code: e.code, werte: e.werte, freierZuckerG: e.freierZuckerG }));
    return this.blsKandidaten;
  }

  vorschlaege(datum: unknown): VorschlagsAntwort {
    if (!datumErlaubt(datum)) throw new StarkFehler('UNGUELTIG', 'Das Datum stimmt nicht.');
    const quelle = this.quelle();
    const { profil, gewichte } = quelle.laden();
    const bedarf = bedarfAusProfil(profil, gewichte, this.jahr());
    if (!bedarf) return { vorschlaege: [], kalorienErreicht: false };
    const summe = tagessumme(quelle.tagebuchTag(datum));
    const woche = wochenstand(this.eintraegeDerWoche(datum), datum, datumVon(new Date(this.uhr())));
    const luecken = [...tagesLuecken(summe, bedarf, profil.ausgeblendet), ...wochenLueckenFuerTag(woche, bedarf, profil.ausgeblendet)];
    const grenzen = grenzenAus(summe, bedarf);

    const gegessen = new Set(quelle.tagebuchZuletzt(40));
    const eigene: VorschlagKandidat[] = [];
    const versionen = new Set<string>();
    for (const e of quelle.eigeneListe()) {
      const lm = this.lebensmittel.holen(e.id);
      if (!lm) continue;
      if (lm.herkunft === 'version') versionen.add(lm.id);
      eigene.push({
        id: lm.id,
        name: lm.name,
        marke: lm.marke,
        herkunft: lm.herkunft,
        code: lm.id.startsWith('bls:') ? lm.id.slice(4) : null,
        werte: werteJe100g(lm),
        freierZuckerG: lm.freierZuckerG,
        umrechnung: lm.umrechnung,
      });
    }
    // Eine persönliche Version ersetzt das Original auch hier.
    const kandidaten = [...this.rezepte.kandidaten(), ...this.teller.kandidaten(), ...eigene, ...this.ausGrundbestand().filter((k) => !versionen.has(k.id))].map((k) => (gegessen.has(k.id) ? { ...k, vertraut: true } : k));
    const vorschlaege = vorschlagen(kandidaten, luecken, grenzen, { stueckware: profil.stueckware });
    return { vorschlaege, kalorienErreicht: kcalFrei(summe, bedarf) < 25 };
  }
}
