import { ChevronDown } from 'lucide-react';
import type { Bedarf, ZielArt } from '@shared/bedarf';
import { mengeText, zahlText, zielText } from '@shared/format';
import { GRUPPEN, naehrstoffeDerGruppe, type GruppenId } from '@shared/naehrstoffe';
import { EPA_DHA_MG, HINWEISE_OHNE_ZIEL, LEUCIN_JE_MAHLZEIT_G, OMEGA6_ZU_OMEGA3 } from '@shared/referenzwerte';

const ART: Readonly<Record<ZielArt, { kurz: string; titel: string }>> = {
  empfehlung: { kurz: 'E', titel: 'Empfehlung' },
  schaetzwert: { kurz: 'S', titel: 'Schätzwert' },
  richtwert: { kurz: 'R', titel: 'Richtwert' },
  hoechstwert: { kurz: 'H', titel: 'Höchstwert' },
  'eigener-wert': { kurz: 'D', titel: 'Deine Vorgabe' },
};

export const ArtMarke = ({ art, quelle }: { art: ZielArt; quelle?: string }) => (
  <abbr className="art" title={quelle ? `${ART[art].titel}. Quelle: ${quelle}` : ART[art].titel}>
    {ART[art].kurz}
  </abbr>
);

/** Gruppen, die am Anfang aufgeklappt sind: Dort liegt fast alles, wofür es ein Ziel gibt. */
const OFFEN: readonly GruppenId[] = ['vitamine', 'mineralstoffe'];

/** Ziele, die mehrere Nährstoffe zusammen betreffen. Das Tagebuch wertet sie ab Phase 3 aus. */
const ZUSAMMEN: Partial<Record<GruppenId, readonly { name: string; wert: string; hinweis: string }[]>> = {
  fettsaeuren: [
    {
      name: 'EPA und DHA zusammen',
      wert: `${zahlText(EPA_DHA_MG.von)}–${zahlText(EPA_DHA_MG.bis)} mg`,
      hinweis: 'Aus Fisch oder Algenöl. Die EFSA hält 250 mg für ausreichend; bei Kapseln über 1 g am Tag gab es in Studien mehr Vorhofflimmern.',
    },
    {
      name: 'Omega-6 zu Omega-3',
      wert: `höchstens ${OMEGA6_ZU_OMEGA3.hoechst} : 1, besser ${OMEGA6_ZU_OMEGA3.ideal} : 1`,
      hinweis: 'Die Fachstellen nennen hierfür keinen Wert, weil die Beleglage nicht ausreicht.',
    },
  ],
  aminosaeuren: [
    {
      name: 'Leucin je Mahlzeit',
      wert: `etwa ${zahlText(LEUCIN_JE_MAHLZEIT_G, 1)} g`,
      hinweis: 'Ob es diese Schwelle wirklich gibt, ist in der Forschung umstritten.',
    },
  ],
};

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
              {ZUSAMMEN[gruppe.id]?.map((z) => (
                <div key={z.name} className="ziel-zeile">
                  <span className="name">
                    {z.name}
                    <ArtMarke art="eigener-wert" quelle="deine Vorgabe" />
                  </span>
                  <span className="wert">{z.wert}</span>
                  <p className="ziel-hinweis">{z.hinweis}</p>
                </div>
              ))}
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
      <span>
        <ArtMarke art="eigener-wert" /> Deine Vorgabe
      </span>
    </p>
  );
}
