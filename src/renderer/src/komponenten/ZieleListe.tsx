import { ChevronDown } from 'lucide-react';
import type { Bedarf, ZielArt } from '@shared/bedarf';
import { mengeText, spanneText, zahlText, zielText } from '@shared/format';
import { GRUPPEN, naehrstoffeDerGruppe, type GruppenId } from '@shared/naehrstoffe';
import { EPA_DHA_MINIMUM_MG, EPA_DHA_OPTIMUM_MG, HINWEISE_OHNE_ZIEL, LEUCIN_JE_MAHLZEIT_G, OMEGA6_ZU_OMEGA3 } from '@shared/referenzwerte';

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

interface ZusatzZiel {
  name: string;
  art?: ZielArt;
  quelle?: string;
  wert?: string;
  optimum?: string;
  hinweis: string;
}

/** Ziele, die der BLS nicht als einen Nährstoff führt. Das Tagebuch wertet sie ab Phase 3 aus. */
function zusatzZiele(bedarf: Bedarf): Partial<Record<GruppenId, readonly ZusatzZiel[]>> {
  return {
    kohlenhydrate: [
      {
        name: 'Freier Zucker',
        art: 'hoechstwert',
        quelle: 'WHO 2015, NNR 2023',
        wert: `höchstens ${zahlText(bedarf.freierZuckerHoechstG)} g`,
        hinweis: 'Zucker aus ganzem Obst, Gemüse und Milch zählt nicht mit. Laut WHO wären unter 5 % der Energie noch besser.',
      },
    ],
    fettsaeuren: [
      {
        name: 'EPA und DHA zusammen',
        art: 'schaetzwert',
        quelle: 'EFSA 2010',
        wert: `${zahlText(EPA_DHA_MINIMUM_MG)} mg`,
        optimum: `${zahlText(EPA_DHA_OPTIMUM_MG.von)}–${zahlText(EPA_DHA_OPTIMUM_MG.bis)} mg`,
        hinweis: 'Aus Fisch oder Algenöl. Bei Kapseln über 1 g am Tag gab es in Studien mehr Vorhofflimmern.',
      },
      {
        name: 'Omega-6 zu Omega-3',
        optimum: `höchstens ${OMEGA6_ZU_OMEGA3.hoechst} : 1, besser ${OMEGA6_ZU_OMEGA3.ideal} : 1`,
        hinweis: 'Die Fachstellen nennen hierfür keinen Wert, weil die Beleglage nicht ausreicht.',
      },
    ],
    aminosaeuren: [
      {
        name: 'Leucin je Mahlzeit',
        optimum: `etwa ${zahlText(LEUCIN_JE_MAHLZEIT_G, 1)} g`,
        hinweis: 'Ob es diese Schwelle wirklich gibt, ist in der Forschung umstritten.',
      },
    ],
  };
}

function Stufen({ minimum, optimum }: { minimum: string | null; optimum?: string }) {
  if (!optimum) return <>{minimum ?? <span className="leise">ohne Ziel</span>}</>;
  return (
    <>
      {minimum && <>Minimum {minimum}</>}
      <span className="optimum" title="Optimum. Quelle: deine Vorgabe">
        Optimum {optimum}
      </span>
    </>
  );
}

/** Alle sichtbaren Nährstoffe nach Gruppen, aufklappbar. Ohne Referenzwert steht nur der Name da. */
export function ZieleListe({ bedarf, ausgeblendet }: { bedarf: Bedarf; ausgeblendet: readonly string[] }) {
  const zusatz = zusatzZiele(bedarf);
  return (
    <div className="stapel">
      {GRUPPEN.map((gruppe) => {
        const naehrstoffe = naehrstoffeDerGruppe(gruppe.id).filter((n) => !ausgeblendet.includes(n.code));
        if (naehrstoffe.length === 0) return null;
        const dazu = zusatz[gruppe.id] ?? [];
        const mitZiel = naehrstoffe.filter((n) => bedarf.ziele[n.code]).length + dazu.length;
        const alle = naehrstoffe.length + dazu.length;
        return (
          <details key={gruppe.id} className={`gruppe g-${gruppe.id}`} open={OFFEN.includes(gruppe.id)}>
            <summary>
              <span className="punkt" />
              <span className="gruppe-titel">{gruppe.titel}</span>
              <span className="stand">{mitZiel > 0 ? `${mitZiel} von ${alle} mit Ziel` : `${alle}, nur die Menge`}</span>
              <ChevronDown className="i pfeil" aria-hidden />
            </summary>
            <div className="zeilen">
              {dazu.map((z) => (
                <div key={z.name} className="ziel-zeile">
                  <span className="name">
                    {z.name}
                    {z.art && <ArtMarke art={z.art} quelle={z.quelle} />}
                  </span>
                  <span className="wert">
                    <Stufen minimum={z.wert ?? null} optimum={z.optimum} />
                  </span>
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
                      <Stufen minimum={text} optimum={ziel?.optimum && spanneText(ziel.optimum.von, ziel.optimum.bis, n)} />
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
