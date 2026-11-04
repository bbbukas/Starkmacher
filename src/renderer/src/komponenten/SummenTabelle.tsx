import { ChevronDown } from 'lucide-react';
import type { NaehrstoffZiel } from '@shared/bedarf';
import { mengeText, zahlText } from '@shared/format';
import { anteilAmBedarf } from '@shared/lebensmittel';
import { GRUPPEN, naehrstoffeDerGruppe, type GruppenId, type Naehrstoff } from '@shared/naehrstoffe';
import { EPA_DHA_MINIMUM_MG } from '@shared/referenzwerte';
import { fehltText, type SummenWert, type Tagessumme } from '@shared/tagebuch';
import { useDaten } from '../daten/DatenKontext';
import { Teller } from './Teller';

const OFFEN: readonly GruppenId[] = ['makros', 'vitamine', 'mineralstoffe'];

export const anteilKurz = (a: number) => (a > 0 && a < 1 ? '< 1 %' : `${zahlText(a)} %`);

function Zeile({ name, ganz, menge, ziel, einheit, zielText }: { name: string; ganz?: SummenWert | undefined; menge: SummenWert; ziel: Pick<NaehrstoffZiel, 'von' | 'hoechst'> | undefined; einheit: Pick<Naehrstoff, 'einheit' | 'zeigeInMg'>; zielText?: string }) {
  // Weiß man bei keiner Zutat etwas, steht „keine Angabe“ statt 0.
  const nichts = menge.menge === 0 && menge.fehltBei.length > 0;
  const anteil = nichts ? null : anteilAmBedarf(menge.menge, ziel as NaehrstoffZiel | undefined);
  const fehlt = fehltText(menge.fehltBei);
  const text = (s: SummenWert) => (nichts ? <span className="leise">keine Angabe</span> : mengeText(s.menge, einheit));
  return (
    <div className="nw-zeile">
      <span className="name">{name}</span>
      <span className="nw-100">{ganz ? text(ganz) : ''}</span>
      <span className="nw-menge">{text(menge)}</span>
      <span className="nw-anteil">{anteil === null ? '' : anteilKurz(anteil)}</span>
      {anteil !== null && (
        <div className="nw-balken">
          <div className="balken balken-klein" aria-hidden>
            <i style={{ width: `${Math.min(anteil, 100)}%` }} />
          </div>
          <small className="leise">{zielText ?? (ziel?.von !== undefined ? `vom Minimum (${mengeText(ziel.von, einheit)})` : ziel?.hoechst !== undefined ? `von höchstens ${mengeText(ziel.hoechst, einheit)}` : '')}</small>
        </div>
      )}
      {fehlt && !nichts && (
        <small className="zeile-fehlt" title={menge.fehltBei.join(', ')}>
          {fehlt.replace('Eintrag', 'Zutat').replace('Einträgen', 'Zutaten')}
        </small>
      )}
    </div>
  );
}

/**
 * Alle Nährstoffe einer Summe nach Gruppen, mit Anteil am Tagesbedarf. `ganz` ist die Spalte für das ganze Rezept und
 * fehlt, wo es nur eine Menge gibt, zum Beispiel beim Teller.
 */
export function SummenTabelle({ menge, ganz, spalteMenge, spalteGanz }: { menge: Tagessumme; ganz?: Tagessumme; spalteMenge: string; spalteGanz?: string }) {
  const { stand, bedarf } = useDaten();
  const ausgeblendet = stand?.profil.ausgeblendet ?? [];
  return (
    <>
      {GRUPPEN.map((gruppe) => {
        const liste = naehrstoffeDerGruppe(gruppe.id).filter((n) => !ausgeblendet.includes(n.code));
        if (liste.length === 0) return null;
        const bekannt = liste.filter((n) => menge.werte[n.code]!.fehltBei.length < menge.anzahl).length;
        return (
          <details key={gruppe.id} className={`gruppe g-${gruppe.id}`} open={OFFEN.includes(gruppe.id)}>
            <summary>
              <span className="punkt" />
              <span className="gruppe-titel">{gruppe.titel}</span>
              <span className="stand">
                {bekannt} von {liste.length} bekannt
              </span>
              <ChevronDown className="i pfeil" aria-hidden />
            </summary>
            <div className="zeilen">
              <div className="nw-kopf">
                <span />
                <span>{spalteGanz ?? ''}</span>
                <span>{spalteMenge}</span>
                <span>Bedarf</span>
              </div>
              {gruppe.id === 'kohlenhydrate' && bedarf && <Zeile name="Freier Zucker, geschätzt" ganz={ganz?.freierZuckerG} menge={menge.freierZuckerG} ziel={{ hoechst: bedarf.freierZuckerHoechstG }} einheit={{ einheit: 'g' }} />}
              {gruppe.id === 'fettsaeuren' && <Zeile name="EPA und DHA zusammen" ganz={ganz?.epaDhaMg} menge={menge.epaDhaMg} ziel={{ von: EPA_DHA_MINIMUM_MG }} einheit={{ einheit: 'mg' }} />}
              {liste.map((n) => (
                <Zeile key={n.code} name={n.name} ganz={ganz?.werte[n.code]} menge={menge.werte[n.code]!} ziel={bedarf?.ziele[n.code]} einheit={n} />
              ))}
            </div>
          </details>
        );
      })}
    </>
  );
}

/** Der Teller mit den Kalorien und daneben die Makros. */
export function SummenKopf({ summe }: { summe: Tagessumme }) {
  const { bedarf } = useDaten();
  const kcal = summe.werte.ENERCC!.menge;
  const makro = (titel: string, klasse: string, code: string, ziel: number | undefined) => {
    const g = summe.werte[code]!.menge;
    return (
      <div className={`makro ${klasse}`}>
        <span className="wort">{titel}</span>
        <span className="zahl">{`${zahlText(g, g < 10 ? 1 : 0)} g`}</span>
        {ziel !== undefined && <span className="makro-text">{anteilKurz((g / ziel) * 100)} deines Tagesziels</span>}
      </div>
    );
  };
  return (
    <div className="ergebnis-oben">
      <Teller anteil={bedarf ? kcal / bedarf.kcal : 0}>
        <span className="teller-zahl">{zahlText(kcal)}</span>
        <small>{bedarf ? `kcal, ${anteilKurz((kcal / bedarf.kcal) * 100)}` : 'kcal'}</small>
      </Teller>
      <div className="makros">
        {makro('Eiweiß', 'g-aminosaeuren', 'PROT625', bedarf?.eiweissG)}
        {makro('Fett', 'g-fettsaeuren', 'FAT', bedarf?.fettG)}
        {makro('Kohlenhydrate', 'g-kohlenhydrate', 'CHO', bedarf?.kohlenhydrateG)}
      </div>
    </div>
  );
}
