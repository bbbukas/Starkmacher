import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Bedarf, NaehrstoffZiel } from '@shared/bedarf';
import { mengeText } from '@shared/format';
import { GRUPPEN, naehrstoffeDerGruppe, type Einheit, type GruppenId, type Naehrstoff } from '@shared/naehrstoffe';
import { balkenAnteil, EPA_DHA_ZIEL, fehltText, istGeschafft, KEINE_LUECKE_TEXT, stufeVon, zaehltWoechentlich, type Stufe, type StufenZiel, type SummenWert, type Tagessumme } from '@shared/tagebuch';
import { wochenHinweis, wochenLage, wochenZeile, type WochenStand } from '@shared/woche';
import { ArtMarke } from '../../komponenten/ZieleListe';

/** Gruppen, die am Anfang aufgeklappt sind. */
const OFFEN: readonly GruppenId[] = ['vitamine', 'mineralstoffe'];

type Masseinheit = Pick<Naehrstoff, 'einheit' | 'zeigeInMg'>;

interface ZeilenDaten {
  code: string;
  name: string;
  einheit: Masseinheit;
  summe: SummenWert;
  ziel: StufenZiel | null;
  art?: NaehrstoffZiel['art'];
  quelle?: string;
  hinweis?: string;
  /** Zählt im Schnitt der Woche: `summe` und `ziel` gelten dann für die ganze Woche, das hier ist der gezeigte Tag. */
  woche?: { stand: WochenStand; tag: SummenWert };
}

function lageText(z: ZeilenDaten, stufe: Stufe): string {
  const { summe, ziel, einheit } = z;
  switch (stufe) {
    case 'unter':
      return `noch ${mengeText(ziel!.von! - summe.menge, einheit)}`;
    case 'minimum':
      return ziel?.optimum ? `✓ Minimum, noch ${mengeText(ziel.optimum.von - summe.menge, einheit)} zum Optimum` : '✓ Minimum erreicht';
    case 'optimum':
      return '✓ im Optimum';
    case 'darueber':
      return '✓ über dem Optimum';
    case 'ueber':
      return 'heute etwas mehr';
    case 'luft':
      return 'noch Luft';
    case 'hinweis':
      return z.hinweis ?? '';
    case 'ohne':
      return '';
  }
}

function zielText(z: ZeilenDaten): string {
  const menge = mengeText(z.summe.menge, z.einheit);
  if (z.ziel?.von !== undefined) return `${menge} von ${mengeText(z.ziel.von, z.einheit)}`;
  if (z.ziel?.hoechst !== undefined) return `${menge} bis ${mengeText(z.ziel.hoechst, z.einheit)}`;
  return menge;
}

function lageVon(z: ZeilenDaten, stufe: Stufe): string {
  if (!z.woche || !z.ziel) return lageText(z, stufe);
  const rest = Math.max(0, (z.ziel.von ?? 0) - z.summe.menge);
  return wochenLage(stufe, { summe: z.summe, tag: z.woche.tag, ziel: z.ziel, rest }, z.einheit, z.woche.stand, z.hinweis);
}

function Zeile({ z }: { z: ZeilenDaten }) {
  const stufe = stufeVon(z.summe.menge, z.ziel);
  const fehlt = fehltText(z.summe.fehltBei);
  return (
    <div className={`zeile stufe-${stufe}`}>
      <span className="name">
        {z.name}
        {z.art && <ArtMarke art={z.art} {...(z.quelle ? { quelle: z.quelle } : {})} />}
      </span>
      <span className="menge">{zielText(z)}</span>
      {z.ziel && (
        <div className={`balken balken-klein${stufe === 'ueber' ? ' balken-mehr' : ''}`} aria-hidden>
          <i style={{ width: `${balkenAnteil(z.summe.menge, z.ziel) * 100}%` }} />
        </div>
      )}
      {stufe !== 'ohne' && <span className={`lage${istGeschafft(stufe) ? ' gut' : ''}`}>{lageVon(z, stufe)}</span>}
      {fehlt && (
        <small className="zeile-fehlt" title={z.summe.fehltBei.join(', ')}>
          {fehlt}
        </small>
      )}
    </div>
  );
}

const MG: { einheit: Einheit } = { einheit: 'mg' };
const G: { einheit: Einheit } = { einheit: 'g' };

function extraZeilen(gruppe: GruppenId, summe: Tagessumme, woche: WochenStand, bedarf: Bedarf, ausgeblendet: readonly string[]): ZeilenDaten[] {
  if (gruppe === 'kohlenhydrate' && !ausgeblendet.includes('SUGAR')) {
    return [{ code: 'FREIER_ZUCKER', name: 'Freier Zucker, geschätzt', einheit: G, summe: summe.freierZuckerG, ziel: { hoechst: bedarf.freierZuckerHoechstG }, art: 'hoechstwert', quelle: 'WHO 2015, NNR 2023' }];
  }
  if (gruppe === 'fettsaeuren' && !ausgeblendet.includes('F20:5CN3') && !ausgeblendet.includes('F22:6CN3')) {
    const z = wochenZeile('EPA_DHA', { von: EPA_DHA_ZIEL.von, optimum: EPA_DHA_ZIEL.optimum }, woche);
    return [{ code: 'EPA_DHA', name: 'EPA und DHA zusammen', einheit: MG, summe: z.summe, ziel: z.ziel, art: 'schaetzwert', quelle: 'EFSA 2010', woche: { stand: woche, tag: z.tag } }];
  }
  return [];
}

function Gruppe({ id, titel, zeilen, woche }: { id: GruppenId; titel: string; zeilen: readonly ZeilenDaten[]; woche: WochenStand }) {
  const [alle, setAlle] = useState(false);
  const mitZiel = zeilen.filter((z) => z.ziel);
  const ohneZiel = zeilen.length - mitZiel.length;
  const zaehlen = mitZiel.filter((z) => z.ziel?.von !== undefined && !z.ziel.keineLuecke);
  const geschafft = zaehlen.filter((z) => istGeschafft(stufeVon(z.summe.menge, z.ziel))).length;
  const sichtbar = alle ? zeilen : mitZiel.length > 0 ? mitZiel : zeilen;
  const nurWoche = zaehlen.length > 0 && zaehlen.every((z) => z.woche);
  return (
    <details className={`gruppe g-${id}`} open={OFFEN.includes(id)}>
      <summary>
        <span className="punkt" />
        <span className="gruppe-titel">{titel}</span>
        <span className="stand">{zaehlen.length === 0 ? `${zeilen.length}, nur die Menge` : nurWoche ? `Woche: ${geschafft} von ${zaehlen.length}` : `${geschafft} von ${zaehlen.length} geschafft`}</span>
        <ChevronDown className="i pfeil" aria-hidden />
      </summary>
      <div className="zeilen">
        {nurWoche && <p className="gruppe-hinweis">{wochenHinweis(woche)}</p>}
        {sichtbar.map((z) => (
          <Zeile key={z.code} z={z} />
        ))}
        {mitZiel.length > 0 && ohneZiel > 0 && (
          <button type="button" className="weitere" onClick={() => setAlle(!alle)}>
            {alle ? 'Weniger anzeigen' : `${ohneZiel} weitere anzeigen`}
          </button>
        )}
      </div>
    </details>
  );
}

/** Alle sichtbaren Nährstoffe nach Gruppen, mit ihrer Stufe. Vitamine und Mineralstoffe zählen in der Woche, der Rest am Tag. */
export function TagesGruppen({ summe, woche, bedarf, ausgeblendet }: { summe: Tagessumme; woche: WochenStand; bedarf: Bedarf; ausgeblendet: readonly string[] }) {
  return (
    <>
      {GRUPPEN.map((gruppe) => {
        const naehrstoffe = naehrstoffeDerGruppe(gruppe.id).filter((n) => !ausgeblendet.includes(n.code));
        if (naehrstoffe.length === 0) return null;
        const zeilen: ZeilenDaten[] = [
          ...extraZeilen(gruppe.id, summe, woche, bedarf, ausgeblendet),
          ...naehrstoffe.map((n) => {
            const ziel = bedarf.ziele[n.code];
            const hinweis = KEINE_LUECKE_TEXT[n.code];
            const z = ziel && zaehltWoechentlich(n.code, ziel) ? wochenZeile(n.code, ziel, woche) : null;
            return {
              code: n.code,
              name: n.name,
              einheit: n,
              summe: z ? z.summe : summe.werte[n.code]!,
              ziel: z ? z.ziel : (ziel ?? null),
              ...(z ? { woche: { stand: woche, tag: z.tag } } : {}),
              ...(ziel ? { art: ziel.art, quelle: ziel.quelle } : {}),
              ...(hinweis ? { hinweis } : {}),
            };
          }),
        ];
        return <Gruppe key={gruppe.id} id={gruppe.id} titel={gruppe.titel} zeilen={zeilen} woche={woche} />;
      })}
    </>
  );
}
