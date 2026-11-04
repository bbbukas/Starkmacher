import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { HASHTAG_FARBEN, type Hashtag, type HashtagFarbe } from '@shared/rezepte';
import { api } from '../../api';
import { Dialog, Rueckfrage } from '../../komponenten/Dialog';
import { useMeldungen } from '../../komponenten/Meldungen';

export function useHashtags() {
  const [hashtags, setHashtags] = useState<Hashtag[]>([]);
  const neuLaden = useCallback(() => {
    void api.rezepte.hashtags().then((a) => a.ok && setHashtags(a.wert));
  }, []);
  useEffect(neuLaden, [neuLaden]);
  return { hashtags, neuLaden };
}

export const HashtagMarke = ({ hashtag }: { hashtag: Hashtag }) => <span className={`hashtag farbe-${hashtag.farbe}`}>#{hashtag.name}</span>;

/** Hashtags zum An- und Abwählen, im Filter und im Formular. */
export function HashtagWahl({ hashtags, gewaehlt, onWechsel }: { hashtags: readonly Hashtag[]; gewaehlt: readonly string[]; onWechsel(id: string): void }) {
  return (
    <div className="hashtag-wahl">
      {hashtags.map((h) => (
        <label key={h.id} className={`hashtag farbe-${h.farbe} hashtag-knopf${gewaehlt.includes(h.id) ? ' gewaehlt' : ''}`}>
          <input type="checkbox" checked={gewaehlt.includes(h.id)} onChange={() => onWechsel(h.id)} />#{h.name}
        </label>
      ))}
    </div>
  );
}

function FarbWahl({ wert, onWert, name }: { wert: HashtagFarbe; onWert(f: HashtagFarbe): void; name: string }) {
  return (
    <div className="farb-wahl" role="radiogroup" aria-label={`Farbe von ${name}`}>
      {HASHTAG_FARBEN.map((f) => (
        <label key={f} className={`farb-punkt farbe-${f}${wert === f ? ' gewaehlt' : ''}`} title={f}>
          <input type="radio" name={`farbe-${name}`} checked={wert === f} onChange={() => onWert(f)} aria-label={f} />
        </label>
      ))}
    </div>
  );
}

function HashtagZeile({ hashtag, onGeaendert, onLoeschen }: { hashtag: Hashtag; onGeaendert(): void; onLoeschen(): void }) {
  const { zeigen } = useMeldungen();
  const [name, setName] = useState(hashtag.name);

  const speichern = (teil: { name?: string; farbe?: HashtagFarbe }) => {
    void api.rezepte.hashtagSpeichern({ id: hashtag.id, name: teil.name ?? hashtag.name, farbe: teil.farbe ?? hashtag.farbe }).then((a) => {
      if (!a.ok) {
        zeigen({ art: 'fehler', text: a.meldung });
        setName(hashtag.name);
        return;
      }
      setName(a.wert.name);
      onGeaendert();
    });
  };

  return (
    <div className="hashtag-zeile">
      <span className="hashtag-raute">#</span>
      <input
        type="text"
        aria-label={`Name von #${hashtag.name}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name !== hashtag.name) speichern({ name });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      <FarbWahl wert={hashtag.farbe} name={hashtag.name} onWert={(farbe) => speichern({ farbe })} />
      <button type="button" className="symbolknopf" aria-label={`#${hashtag.name} löschen`} onClick={onLoeschen}>
        <Trash2 className="i" aria-hidden />
      </button>
    </div>
  );
}

/** Hashtags anlegen, umbenennen, einfärben und löschen (Bauauftrag Abschnitt 6). */
export function HashtagDialog({ offen, hashtags, onSchliessen, onGeaendert }: { offen: boolean; hashtags: readonly Hashtag[]; onSchliessen(): void; onGeaendert(): void }) {
  const { zeigen } = useMeldungen();
  const [neu, setNeu] = useState('');
  const [loeschen, setLoeschen] = useState<Hashtag | null>(null);

  const anlegen = () => {
    if (neu.trim() === '') return;
    void api.rezepte.hashtagSpeichern({ name: neu, farbe: HASHTAG_FARBEN[hashtags.length % HASHTAG_FARBEN.length]! }).then((a) => {
      if (!a.ok) {
        zeigen({ art: 'fehler', text: a.meldung });
        return;
      }
      setNeu('');
      onGeaendert();
    });
  };

  return (
    <Dialog
      titel="Hashtags"
      offen={offen}
      breit
      onSchliessen={onSchliessen}
      onAbsenden={anlegen}
      knoepfe={
        <button type="button" className="knopf knopf-akzent" onClick={onSchliessen}>
          Fertig
        </button>
      }
    >
      <div className="stapel">
        {hashtags.length === 0 && <p className="leise dialog-text">Noch keine Hashtags. Leg welche an, zum Beispiel vegan, unter30Minuten oder OnePot.</p>}
        {hashtags.map((h) => (
          <HashtagZeile key={`${h.id}-${h.name}`} hashtag={h} onGeaendert={onGeaendert} onLoeschen={() => setLoeschen(h)} />
        ))}
        <div className="hashtag-neu">
          <span className="hashtag-raute">#</span>
          <input type="text" aria-label="Neuer Hashtag" placeholder="Neuer Hashtag" value={neu} onChange={(e) => setNeu(e.target.value)} />
          <button type="submit" className="knopf knopf-linie" disabled={neu.trim() === ''}>
            <Plus className="i" aria-hidden /> Anlegen
          </button>
        </div>
      </div>
      <Rueckfrage
        offen={loeschen !== null}
        titel="Hashtag löschen?"
        text={`#${loeschen?.name ?? ''} verschwindet aus allen Rezepten. Die Rezepte selbst bleiben.`}
        bestaetigen="Löschen"
        onAbbrechen={() => setLoeschen(null)}
        onBestaetigen={() => {
          if (!loeschen) return;
          void api.rezepte.hashtagLoeschen(loeschen.id).then((a) => {
            setLoeschen(null);
            if (a.ok) onGeaendert();
            else zeigen({ art: 'fehler', text: a.meldung });
          });
        }}
      />
    </Dialog>
  );
}
