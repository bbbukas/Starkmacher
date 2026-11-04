import { useEffect, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { zahlText } from '@shared/format';
import type { LebensmittelKurz } from '@shared/lebensmittel';
import { api } from '../api';
import { Herkunftsmarke } from '../ansichten/lebensmittel/LebensmittelSuche';

function Treffer({ lm, onWahl }: { lm: LebensmittelKurz; onWahl(id: string): void }) {
  return (
    <button type="button" className="treffer treffer-knopf" onClick={() => onWahl(lm.id)}>
      <span className="treffer-name">
        {lm.name}
        {lm.marke && <span className="leise"> · {lm.marke}</span>}
      </span>
      <Herkunftsmarke lm={lm} />
      <span className="treffer-werte">
        <b>{lm.kcal === null ? '–' : zahlText(lm.kcal)} kcal</b>
      </span>
    </button>
  );
}

/**
 * Suchen und auswählen, in einem Fenster. Mit `mitRezepten` kommen die eigenen Rezepte dazu, ihre Kalorien gelten je Portion.
 * `zuletzt`: was ohne Suchwort oben steht.
 */
export function LebensmittelWahl({ onWahl, mitRezepten, mitTellern, zuletzt = [], zuletztTitel = 'Zuletzt gegessen', startText = '' }: { onWahl(id: string): void; mitRezepten?: boolean; mitTellern?: boolean; zuletzt?: readonly LebensmittelKurz[]; zuletztTitel?: string; startText?: string }) {
  const [text, setText] = useState(startText);
  const [treffer, setTreffer] = useState<LebensmittelKurz[]>([]);
  const [rezepte, setRezepte] = useState<LebensmittelKurz[]>([]);
  const [teller, setTeller] = useState<LebensmittelKurz[]>([]);

  useEffect(() => {
    if (!mitRezepten) return;
    let abgebrochen = false;
    const uhr = setTimeout(() => {
      void api.rezepte.liste({ text, hashtags: [] }).then((a) => {
        if (abgebrochen || !a.ok) return;
        setRezepte(a.wert.slice(0, 12).map((r) => ({ id: r.id, herkunft: 'rezept', name: r.name, marke: null, gruppe: null, kcal: r.kcalJePortion, eiweiss: r.eiweissJePortion, fett: null, kohlenhydrate: null })));
      });
    }, 120);
    return () => {
      abgebrochen = true;
      clearTimeout(uhr);
    };
  }, [text, mitRezepten]);

  useEffect(() => {
    if (!mitTellern) return;
    let abgebrochen = false;
    const uhr = setTimeout(() => {
      void api.teller.liste(text).then((a) => {
        if (abgebrochen || !a.ok) return;
        setTeller(a.wert.slice(0, 12).map((t) => ({ id: t.id, herkunft: 'teller', name: t.name, marke: t.inhalt, gruppe: null, kcal: t.kcal, eiweiss: t.eiweiss, fett: null, kohlenhydrate: null })));
      });
    }, 120);
    return () => {
      abgebrochen = true;
      clearTimeout(uhr);
    };
  }, [text, mitTellern]);

  useEffect(() => {
    if (text.trim() === '') {
      setTreffer([]);
      return;
    }
    let abgebrochen = false;
    const uhr = setTimeout(() => {
      void api.lebensmittel.suchen({ text, filter: 'alle' }).then((a) => {
        if (!abgebrochen && a.ok) setTreffer(a.wert.treffer.slice(0, 40));
      });
    }, 120);
    return () => {
      abgebrochen = true;
      clearTimeout(uhr);
    };
  }, [text]);

  const sucht = text.trim() !== '';
  const zuletztIds = new Set(zuletzt.map((k) => k.id));
  const rezepteSichtbar = sucht ? rezepte : rezepte.filter((r) => !zuletztIds.has(r.id));
  const tellerSichtbar = sucht ? teller : teller.filter((r) => !zuletztIds.has(r.id));

  const taste = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    const erster = sucht ? (rezepteSichtbar[0] ?? tellerSichtbar[0] ?? treffer[0]) : undefined;
    if (erster) onWahl(erster.id);
  };

  return (
    <div className="stapel">
      <div className="suchfeld">
        <Search className="i" aria-hidden />
        <input type="text" data-autofokus value={text} placeholder="Suchen, zum Beispiel Apfel oder Skyr" aria-label="Lebensmittel suchen" autoComplete="off" onChange={(e) => setText(e.target.value)} onKeyDown={taste} />
      </div>
      {!sucht && zuletzt.length > 0 && (
        <section aria-label={zuletztTitel}>
          <h3 className="dialog-zwischen">{zuletztTitel}</h3>
          <div className="treffer-liste dialog-liste">
            {zuletzt.map((k) => (
              <Treffer key={k.id} lm={k} onWahl={onWahl} />
            ))}
          </div>
        </section>
      )}
      {mitRezepten && rezepteSichtbar.length > 0 && (
        <section aria-label="Deine Rezepte">
          <h3 className="dialog-zwischen">Deine Rezepte</h3>
          <div className="treffer-liste dialog-liste">
            {rezepteSichtbar.map((k) => (
              <Treffer key={k.id} lm={k} onWahl={onWahl} />
            ))}
          </div>
        </section>
      )}
      {mitTellern && tellerSichtbar.length > 0 && (
        <section aria-label="Deine Teller">
          <h3 className="dialog-zwischen">Deine Teller</h3>
          <div className="treffer-liste dialog-liste">
            {tellerSichtbar.map((k) => (
              <Treffer key={k.id} lm={k} onWahl={onWahl} />
            ))}
          </div>
        </section>
      )}
      {sucht && treffer.length > 0 && (
        <section aria-label="Lebensmittel">
          {(rezepteSichtbar.length > 0 || tellerSichtbar.length > 0) && <h3 className="dialog-zwischen">Lebensmittel</h3>}
          <div className="treffer-liste dialog-liste">
            {treffer.map((k) => (
              <Treffer key={k.id} lm={k} onWahl={onWahl} />
            ))}
          </div>
        </section>
      )}
      {sucht && treffer.length === 0 && rezepteSichtbar.length === 0 && tellerSichtbar.length === 0 && <p className="leise">Dazu habe ich gerade nichts gefunden.</p>}
      {!sucht && zuletzt.length === 0 && rezepteSichtbar.length === 0 && tellerSichtbar.length === 0 && <p className="leise">Tippe los, über 7.000 Lebensmittel warten auf dich.</p>}
    </div>
  );
}
