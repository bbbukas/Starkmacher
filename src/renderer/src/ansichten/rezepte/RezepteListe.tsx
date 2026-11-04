import { useEffect, useState } from 'react';
import { Plus, Search, Tags, X } from 'lucide-react';
import { zahlText } from '@shared/format';
import type { Hashtag, RezeptKurz } from '@shared/rezepte';
import { api } from '../../api';
import { FotoBild } from '../../komponenten/FotoBild';
import { useMeldungen } from '../../komponenten/Meldungen';
import { pfade } from '../../router';
import { HashtagDialog, HashtagMarke, HashtagWahl, useHashtags } from './Hashtags';

/** Bleibt erhalten, wenn man ein Rezept öffnet und zurückkommt. */
let letzteSuche: { text: string; hashtags: string[] } = { text: '', hashtags: [] };

function RezeptKarte({ r, hashtags }: { r: RezeptKurz; hashtags: readonly Hashtag[] }) {
  const eigene = r.hashtags.map((id) => hashtags.find((h) => h.id === id)).filter((h): h is Hashtag => h !== undefined);
  return (
    <a className="rezept-karte" href={pfade.rezept(r.id)}>
      {r.foto && <FotoBild name={r.foto} text="" klasse="rezept-karte-foto" />}
      <div className="rezept-karte-text">
        <b>{r.name}</b>
        <small className="leise">
          {zahlText(r.portionen, 2)} {r.portionen === 1 ? 'Portion' : 'Portionen'}
          {r.kcalJePortion !== null && ` · ${zahlText(r.kcalJePortion)} kcal je Portion`}
          {r.eiweissJePortion !== null && ` · ${zahlText(r.eiweissJePortion)} g Eiweiß`}
        </small>
        {eigene.length > 0 && (
          <span className="hashtag-reihe">
            {eigene.map((h) => (
              <HashtagMarke key={h.id} hashtag={h} />
            ))}
          </span>
        )}
      </div>
    </a>
  );
}

export function RezepteListe() {
  const { zeigen } = useMeldungen();
  const { hashtags, neuLaden } = useHashtags();
  const [text, setText] = useState(letzteSuche.text);
  const [gewaehlt, setGewaehlt] = useState<string[]>(letzteSuche.hashtags);
  const [rezepte, setRezepte] = useState<RezeptKurz[] | null>(null);
  const [verwalten, setVerwalten] = useState(false);
  const [stand, setStand] = useState(0);

  useEffect(() => {
    letzteSuche = { text, hashtags: gewaehlt };
    let abgebrochen = false;
    const uhr = setTimeout(() => {
      void api.rezepte.liste({ text, hashtags: gewaehlt }).then((a) => {
        if (abgebrochen) return;
        if (a.ok) setRezepte(a.wert);
        else zeigen({ art: 'fehler', text: a.meldung });
      });
    }, 100);
    return () => {
      abgebrochen = true;
      clearTimeout(uhr);
    };
  }, [text, gewaehlt, stand, zeigen]);

  // Ein gelöschter Hashtag darf nicht im Filter hängen bleiben.
  useEffect(() => {
    setGewaehlt((alt) => (hashtags.length === 0 && alt.length === 0 ? alt : alt.filter((id) => hashtags.some((h) => h.id === id))));
  }, [hashtags]);

  const filtert = text.trim() !== '' || gewaehlt.length > 0;
  return (
    <main className="seite seite-mittel">
      <div className="kopf-reihe">
        <h1 className="seitentitel">Rezepte</h1>
        <a className="knopf knopf-akzent" href={pfade.rezeptNeu()}>
          <Plus className="i" aria-hidden /> Neues Rezept
        </a>
      </div>

      <section className="karte suche-karte">
        <div className="suchfeld">
          <Search className="i" aria-hidden />
          <input type="text" value={text} placeholder="Rezept suchen" aria-label="Rezept suchen" autoComplete="off" onChange={(e) => setText(e.target.value)} />
          {text && (
            <button type="button" className="symbolknopf" aria-label="Suche leeren" onClick={() => setText('')}>
              <X className="i" aria-hidden />
            </button>
          )}
        </div>
        <div className="hashtag-filter">
          <HashtagWahl hashtags={hashtags} gewaehlt={gewaehlt} onWechsel={(id) => setGewaehlt((alt) => (alt.includes(id) ? alt.filter((a) => a !== id) : [...alt, id]))} />
          <button type="button" className="knopf knopf-leise knopf-klein" onClick={() => setVerwalten(true)}>
            <Tags className="i" aria-hidden /> Hashtags verwalten
          </button>
        </div>
      </section>

      {rezepte && rezepte.length > 0 && (
        <section className="rezept-karten" aria-label="Deine Rezepte">
          {rezepte.map((r) => (
            <RezeptKarte key={r.id} r={r} hashtags={hashtags} />
          ))}
        </section>
      )}
      {rezepte && rezepte.length === 0 && (
        <section className="karte kommt-bald">
          {filtert ? (
            <p>Dazu passt gerade kein Rezept.</p>
          ) : (
            <>
              <p>Hier sammelst du deine eigenen Rezepte.</p>
              <p className="leise">Trag dein erstes ein, Starkmacher rechnet alle Nährwerte aus den Zutaten aus.</p>
            </>
          )}
        </section>
      )}

      <HashtagDialog
        offen={verwalten}
        hashtags={hashtags}
        onSchliessen={() => setVerwalten(false)}
        onGeaendert={() => {
          neuLaden();
          setStand((s) => s + 1);
        }}
      />
    </main>
  );
}
