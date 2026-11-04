import { useEffect, useState } from 'react';
import { ChevronRight, Plus, Search, X } from 'lucide-react';
import type { SuchErgebnis } from '@shared/api';
import { zahlText } from '@shared/format';
import { GRUPPEN_BLS, type LebensmittelKurz, type SuchFilter } from '@shared/lebensmittel';
import { api } from '../../api';
import { useMeldungen } from '../../komponenten/Meldungen';
import { pfade } from '../../router';

const FILTER: readonly { id: SuchFilter; titel: string }[] = [
  { id: 'alle', titel: 'Alle' },
  { id: 'bls', titel: 'Nur BLS' },
  { id: 'eigene', titel: 'Nur eigene' },
];

const WARTEN_MS = 120;

/** Bleibt erhalten, wenn man ein Lebensmittel öffnet und zurückkommt. */
let letzteSuche: { text: string; filter: SuchFilter } = { text: '', filter: 'alle' };

export function Herkunftsmarke({ lm }: { lm: Pick<LebensmittelKurz, 'herkunft' | 'gruppe'> }) {
  if (lm.herkunft === 'eigen') return <span className="marke-klein marke-eigen">Eigenes</span>;
  if (lm.herkunft === 'version') return <span className="marke-klein marke-eigen">Eigene Version</span>;
  return <span className="marke-klein">{(lm.gruppe && GRUPPEN_BLS[lm.gruppe]) || 'BLS'}</span>;
}

function TrefferZeile({ lm }: { lm: LebensmittelKurz }) {
  const zahl = (wert: number | null) => (wert === null ? '–' : zahlText(wert, wert < 10 ? 1 : 0));
  return (
    <a className="treffer" href={pfade.lebensmittel(lm.id)}>
      <span className="treffer-name">
        {lm.name}
        {lm.marke && <span className="leise"> · {lm.marke}</span>}
      </span>
      <Herkunftsmarke lm={lm} />
      <span className="treffer-werte" title="Je 100 g: Kalorien, Eiweiß, Fett, Kohlenhydrate">
        <b>{lm.kcal === null ? '–' : zahlText(lm.kcal)} kcal</b>
        <span className="treffer-makros">
          E {zahl(lm.eiweiss)} · F {zahl(lm.fett)} · K {zahl(lm.kohlenhydrate)}
        </span>
      </span>
      <ChevronRight className="i pfeil-rechts" aria-hidden />
    </a>
  );
}

export function LebensmittelSuche() {
  const [text, setText] = useState(letzteSuche.text);
  const [filter, setFilter] = useState<SuchFilter>(letzteSuche.filter);
  const [ergebnis, setErgebnis] = useState<SuchErgebnis | null>(null);
  const { zeigen } = useMeldungen();

  useEffect(() => {
    letzteSuche = { text, filter };
    let abgebrochen = false;
    const uhr = setTimeout(() => {
      void api.lebensmittel.suchen({ text, filter }).then((antwort) => {
        if (abgebrochen) return;
        if (antwort.ok) setErgebnis(antwort.wert);
        else zeigen({ art: 'fehler', text: antwort.meldung });
      });
    }, WARTEN_MS);
    return () => {
      abgebrochen = true;
      clearTimeout(uhr);
    };
  }, [text, filter, zeigen]);

  const sucht = text.trim() !== '';
  return (
    <main className="seite seite-mittel">
      <div className="kopf-reihe">
        <h1 className="seitentitel">Lebensmittel</h1>
        <a className="knopf knopf-akzent" href={pfade.lebensmittelNeu()}>
          <Plus className="i" aria-hidden /> Neues Lebensmittel
        </a>
      </div>

      <section className="karte suche-karte">
        <div className="suchfeld">
          <Search className="i" aria-hidden />
          <input type="text" autoFocus value={text} placeholder="Suchen, zum Beispiel Käse, Apfel oder Haferflocken" aria-label="Lebensmittel suchen" autoComplete="off" onChange={(e) => setText(e.target.value)} />
          {text && (
            <button type="button" className="symbolknopf" aria-label="Suche leeren" onClick={() => setText('')}>
              <X className="i" aria-hidden />
            </button>
          )}
        </div>
        <div className="filter" role="radiogroup" aria-label="Welche Lebensmittel">
          {FILTER.map((f) => (
            <label key={f.id} className={`filter-knopf${filter === f.id ? ' gewaehlt' : ''}`}>
              <input type="radio" name="filter" checked={filter === f.id} onChange={() => setFilter(f.id)} />
              {f.titel}
            </label>
          ))}
        </div>
      </section>

      {ergebnis && !ergebnis.grundbestandDa && (
        <div className="hinweis hinweis-fehler" role="alert">
          <p>Der Grundbestand aus dem BLS lässt sich gerade nicht lesen. Deine eigenen Lebensmittel funktionieren trotzdem.</p>
        </div>
      )}

      {ergebnis && ergebnis.zuletzt.length > 0 && (
        <section className="karte treffer-karte" aria-label="Zuletzt verwendet">
          <h2>Zuletzt verwendet</h2>
          <div className="treffer-liste">
            {ergebnis.zuletzt.map((lm) => (
              <TrefferZeile key={lm.id} lm={lm} />
            ))}
          </div>
        </section>
      )}

      {ergebnis && (sucht || filter === 'eigene') && (
        <section className="karte treffer-karte" aria-label="Treffer">
          {ergebnis.treffer.length > 0 ? (
            <div className="treffer-liste">
              {ergebnis.treffer.map((lm) => (
                <TrefferZeile key={lm.id} lm={lm} />
              ))}
            </div>
          ) : sucht ? (
            <p className="leise">
              Dazu habe ich nichts gefunden. Du kannst es als <a className="verweis" href={pfade.lebensmittelNeu()}>neues Lebensmittel</a> anlegen.
            </p>
          ) : (
            <p className="leise">Noch keine eigenen Lebensmittel.</p>
          )}
          {ergebnis.gesamt > ergebnis.treffer.length && (
            <p className="leise treffer-mehr">
              Und {zahlText(ergebnis.gesamt - ergebnis.treffer.length)} weitere. Ein genauerer Suchbegriff hilft, zum Beispiel „{text.trim()} roh“.
            </p>
          )}
        </section>
      )}

      {ergebnis && !sucht && filter !== 'eigene' && ergebnis.zuletzt.length === 0 && (
        <section className="karte kommt-bald">
          <p>Über 7.000 Lebensmittel aus dem Bundeslebensmittelschlüssel warten auf deine Suche.</p>
          <p className="leise">Was du nicht findest, legst du einfach selbst an.</p>
        </section>
      )}
    </main>
  );
}
