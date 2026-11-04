import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Bedarf, NaehrstoffZiel } from '@shared/bedarf';
import { mengeText } from '@shared/format';
import { GRUPPEN, naehrstoffeDerGruppe, type Einheit, type GruppenId, type Naehrstoff } from '@shared/naehrstoffe';
import { balkenAnteil, EPA_DHA_ZIEL, fehltText, istGeschafft, KEINE_LUECKE_TEXT, stufeVon, type Stufe, type StufenZiel, type SummenWert, type Tagessumme } from '@shared/tagebuch';
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
      {stufe !== 'ohne' && <span className={`lage${istGeschafft(stufe) ? ' gut' : ''}`}>{lageText(z, stufe)}</span>}
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

function extraZeilen(gruppe: GruppenId, summe: Tagessumme, bedarf: Bedarf, ausgeblendet: readonly string[]): ZeilenDaten[] {
  if (gruppe === 'kohlenhydrate' && !ausgeblendet.includes('SUGAR')) {
    return [{ code: 'FREIER_ZUCKER', name: 'Freier Zucker, geschätzt', einheit: G, summe: summe.freierZuckerG, ziel: { hoechst: bedarf.freierZuckerHoechstG }, art: 'hoechstwert', quelle: 'WHO 2015, NNR 2023' }];
  }
  if (gruppe === 'fettsaeuren' && !ausgeblendet.includes('F20:5CN3') && !ausgeblendet.includes('F22:6CN3')) {
    return [{ code: 'EPA_DHA', name: 'EPA und DHA zusammen', einheit: MG, summe: summe.epaDhaMg, ziel: { von: EPA_DHA_ZIEL.von, optimum: EPA_DHA_ZIEL.optimum }, art: 'schaetzwert', quelle: 'EFSA 2010' }];
  }
  return [];
}

function Gruppe({ id, titel, zeilen }: { id: GruppenId; titel: string; zeilen: readonly ZeilenDaten[] }) {
  const [alle, setAlle] = useState(false);
  const mitZiel = zeilen.filter((z) => z.ziel);
  const ohneZiel = zeilen.length - mitZiel.length;
  const zaehlen = mitZiel.filter((z) => z.ziel?.von !== undefined && !z.ziel.keineLuecke);
  const geschafft = zaehlen.filter((z) => istGeschafft(stufeVon(z.summe.menge, z.ziel))).length;
  const sichtbar = alle ? zeilen : mitZiel.length > 0 ? mitZiel : zeilen;
  return (
    <details className={`gruppe g-${id}`} open={OFFEN.includes(id)}>
      <summary>
        <span className="punkt" />
        <span className="gruppe-titel">{titel}</span>
        <span className="stand">{zaehlen.length > 0 ? `${geschafft} von ${zaehlen.length} geschafft` : `${zeilen.length}, nur die Menge`}</span>
        <ChevronDown className="i pfeil" aria-hidden />
      </summary>
      <div className="zeilen">
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

/** Alle sichtbaren Nährstoffe des Tages nach Gruppen, mit ihrer Stufe. */
export function TagesGruppen({ summe, bedarf, ausgeblendet }: { summe: Tagessumme; bedarf: Bedarf; ausgeblendet: readonly string[] }) {
  return (
    <>
      {GRUPPEN.map((gruppe) => {
        const naehrstoffe = naehrstoffeDerGruppe(gruppe.id).filter((n) => !ausgeblendet.includes(n.code));
        if (naehrstoffe.length === 0) return null;
        const zeilen: ZeilenDaten[] = [
          ...extraZeilen(gruppe.id, summe, bedarf, ausgeblendet),
          ...naehrstoffe.map((n) => {
            const ziel = bedarf.ziele[n.code];
            const hinweis = KEINE_LUECKE_TEXT[n.code];
            return {
              code: n.code,
              name: n.name,
              einheit: n,
              summe: summe.werte[n.code]!,
              ziel: ziel ?? null,
              ...(ziel ? { art: ziel.art, quelle: ziel.quelle } : {}),
              ...(hinweis ? { hinweis } : {}),
            };
          }),
        ];
        return <Gruppe key={gruppe.id} id={gruppe.id} titel={gruppe.titel} zeilen={zeilen} />;
      })}
    </>
  );
}
