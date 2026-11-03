import { ChevronDown } from 'lucide-react';
import type { Bedarf, ZielArt } from '@shared/bedarf';
import { mengeText, zielText } from '@shared/format';
import { GRUPPEN, naehrstoffeDerGruppe, type GruppenId } from '@shared/naehrstoffe';
import { HINWEISE_OHNE_ZIEL } from '@shared/referenzwerte';

const ART: Readonly<Record<ZielArt, { kurz: string; titel: string }>> = {
  empfehlung: { kurz: 'E', titel: 'Empfehlung' },
  schaetzwert: { kurz: 'S', titel: 'Schätzwert' },
  richtwert: { kurz: 'R', titel: 'Richtwert' },
  hoechstwert: { kurz: 'H', titel: 'Höchstwert' },
  'eigener-wert': { kurz: 'D', titel: 'Dein eigener Wert' },
};

export const ArtMarke = ({ art, quelle }: { art: ZielArt; quelle?: string }) => (
  <abbr className="art" title={quelle ? `${ART[art].titel}. Quelle: ${quelle}` : ART[art].titel}>
    {ART[art].kurz}
  </abbr>
);

/** Gruppen, die am Anfang aufgeklappt sind: Dort liegt fast alles, wofür es ein Ziel gibt. */
const OFFEN: readonly GruppenId[] = ['vitamine', 'mineralstoffe'];

/** Alle sichtbaren Nährstoffe nach Gruppen, aufklappbar. Ohne Referenzwert steht nur der Name da. */
export function ZieleListe({ bedarf, ausgeblendet }: { bedarf: Bedarf; ausgeblendet: readonly string[] }) {
  return (
    <div className="stapel">
      {GRUPPEN.map((gruppe) => {
        const naehrstoffe = naehrstoffeDerGruppe(gruppe.id).filter((n) => !ausgeblendet.includes(n.code));
        if (naehrstoffe.length === 0) return null;
        const mitZiel = naehrstoffe.filter((n) => bedarf.ziele[n.code]).length;
        return (
          <details key={gruppe.id} className={`gruppe g-${gruppe.id}`} open={OFFEN.includes(gruppe.id)}>
            <summary>
              <span className="punkt" />
              <span className="gruppe-titel">{gruppe.titel}</span>
              <span className="stand">{mitZiel > 0 ? `${mitZiel} von ${naehrstoffe.length} mit Ziel` : `${naehrstoffe.length}, nur die Menge`}</span>
              <ChevronDown className="i pfeil" aria-hidden />
            </summary>
            <div className="zeilen">
              {naehrstoffe.map((n) => {
                const ziel = bedarf.ziele[n.code];
                const text = zielText(ziel, n);
                return (
                  <div key={n.code} className="ziel-zeile">
                    <span className="name">
                      {n.name}
                      {ziel && <ArtMarke art={ziel.art} quelle={ziel.quelle} />}
                    </span>
                    <span className="wert">
                      {text ?? <span className="leise">ohne Ziel</span>}
                      {ziel?.von !== undefined && ziel.hoechst !== undefined && (
                        <small>
                          {ziel.hoechstArt === 'sichere-menge' ? 'sichere Menge bis ' : 'höchstens '}
                          {mengeText(ziel.hoechst, n)}
                        </small>
                      )}
                    </span>
                    {(ziel?.hinweis ?? HINWEISE_OHNE_ZIEL[n.code]) && <p className="ziel-hinweis">{ziel?.hinweis ?? HINWEISE_OHNE_ZIEL[n.code]}</p>}
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function ArtLegende() {
  return (
    <p className="legende">
      <span>
        <ArtMarke art="empfehlung" /> Empfehlung
      </span>
      <span>
        <ArtMarke art="schaetzwert" /> Schätzwert
      </span>
      <span>
        <ArtMarke art="richtwert" /> Richtwert
      </span>
      <span>
        <ArtMarke art="hoechstwert" /> Höchstwert
      </span>
    </p>
  );
}
