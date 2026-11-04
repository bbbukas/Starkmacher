import { useEffect, useState } from 'react';
import type { VorschlagsAntwort } from '@shared/api';
import type { Bedarf } from '@shared/bedarf';
import { zahlText } from '@shared/format';
import { lueckenSatz, MAHLZEITEN, mahlzeitNachUhrzeit, mengenText, type Luecke, type Mahlzeit, type Tagessumme } from '@shared/tagebuch';
import type { Vorschlag } from '@shared/vorschlaege';
import { api } from '../../api';
import { useMeldungen } from '../../komponenten/Meldungen';

function woher(v: Vorschlag): string {
  if (v.herkunft === 'rezept') return 'dein Rezept';
  if (v.herkunft === 'teller') return 'dein Teller';
  if (v.klein) return 'kleine Ergänzung';
  if (v.herkunft === 'eigen') return 'dein Lebensmittel';
  if (v.herkunft === 'version') return 'deine Version, aus dem Bundeslebensmittelschlüssel';
  return 'aus dem Bundeslebensmittelschlüssel';
}

/** Was heute noch fehlt und womit es sich füllen lässt. Ein Klick trägt den Vorschlag ein (Bauauftrag Abschnitt 8). */
export function WasFehlt(props: { datum: string; istHeute: boolean; summe: Tagessumme; bedarf: Bedarf; luecken: readonly Luecke[]; antwort: VorschlagsAntwort | null; onGeaendert(): void }) {
  const { datum, istHeute, summe, bedarf, luecken, antwort } = props;
  const { zeigen } = useMeldungen();
  const [mahlzeit, setMahlzeit] = useState<Mahlzeit>(istHeute ? mahlzeitNachUhrzeit(new Date()) : 'snacks');
  const [traegtEin, setTraegtEin] = useState<string | null>(null);

  useEffect(() => {
    setMahlzeit(istHeute ? mahlzeitNachUhrzeit(new Date()) : 'snacks');
  }, [datum, istHeute]);

  const eintragen = (v: Vorschlag) => {
    setTraegtEin(v.lebensmittelId);
    void api.tagebuch.eintragen({ datum, mahlzeit, lebensmittelId: v.lebensmittelId, menge: v.menge, einheit: v.einheit, groesse: v.groesse }).then((a) => {
      setTraegtEin(null);
      if (!a.ok) {
        zeigen({ art: 'fehler', text: a.meldung });
        return;
      }
      zeigen({ art: 'info', text: `${v.name} ist eingetragen, bei ${MAHLZEITEN.find((m) => m.id === mahlzeit)?.titel}.` });
      props.onGeaendert();
    });
  };

  const unsicher = luecken.slice(0, 6).some((l) => l.fehltBei.length > 0);
  const vorschlaege = antwort?.vorschlaege ?? [];
  return (
    <section className="fehlt" aria-label="Was heute noch fehlt">
      <h2>{istHeute ? 'Was heute noch fehlt' : 'Was an diesem Tag noch fehlt'}</h2>
      <p className="kurz">{lueckenSatz(summe, bedarf, luecken)}</p>
      {unsicher && <p className="fehlt-hinweis">Bei manchen Einträgen fehlen Angaben zu einzelnen Nährstoffen. Die echte Lücke kann also kleiner sein.</p>}
      {vorschlaege.length > 0 && (
        <div className="fehlt-wahl">
          <label htmlFor="vorschlag-mahlzeit">Vorschläge eintragen bei</label>
          <select id="vorschlag-mahlzeit" value={mahlzeit} onChange={(e) => setMahlzeit(e.target.value as Mahlzeit)}>
            {MAHLZEITEN.map((m) => (
              <option key={m.id} value={m.id}>
                {m.titel}
              </option>
            ))}
          </select>
        </div>
      )}
      {vorschlaege.map((v) => (
        <div key={v.lebensmittelId} className="vorschlag-tag">
          <div className="vorschlag-oben">
            <b>
              Etwa {mengenText(v)} {v.name}
            </b>
            <span className="woher">{woher(v)}</span>
          </div>
          <div className="wirkung">
            <span className="g-energie">+{zahlText(v.kcal)} kcal</span>
            {v.wirkung.map((w) => (
              <span key={w.text} className={`g-${w.gruppe}`}>
                {w.text}
              </span>
            ))}
          </div>
          <button type="button" className="knopf knopf-akzent eintragen" disabled={traegtEin !== null} onClick={() => eintragen(v)}>
            Eintragen
          </button>
        </div>
      ))}
      {antwort && vorschlaege.length === 0 && luecken.length > 0 && (
        <p className="fehlt-hinweis">
          {antwort.kalorienErreicht ? 'Deine Kalorien für heute sind ausgeschöpft, das ist völlig in Ordnung. Deshalb schlägt Starkmacher heute nichts mehr vor.' : 'Gerade passt nichts, ohne dass eine Grenze überschritten würde.'}
        </p>
      )}
    </section>
  );
}
