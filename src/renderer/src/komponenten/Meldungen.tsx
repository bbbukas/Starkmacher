import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CircleCheck, TriangleAlert, X } from 'lucide-react';

export type MeldungsArt = 'info' | 'warnung' | 'fehler';
interface Aktion {
  text: string;
  onKlick(): void;
}

interface Meldung {
  id: number;
  art: MeldungsArt;
  text: string;
  aktion?: Aktion;
}

interface MeldungenWert {
  zeigen(m: { art: MeldungsArt; text: string; aktion?: Aktion }): void;
}

const Kontext = createContext<MeldungenWert>({ zeigen: () => undefined });
export const useMeldungen = () => useContext(Kontext);

let zaehler = 0;

/** Kurze Hinweise unten im Fenster. Fehler und Warnungen bleiben, bis man sie wegklickt. */
export function MeldungenProvider({ children }: { children: ReactNode }) {
  const [meldungen, setMeldungen] = useState<Meldung[]>([]);
  const weg = useCallback((id: number) => setMeldungen((alt) => alt.filter((m) => m.id !== id)), []);
  const zeigen = useCallback(
    ({ art, text, aktion }: { art: MeldungsArt; text: string; aktion?: Aktion }) => {
      const id = ++zaehler;
      setMeldungen((alt) => [...alt.filter((m) => m.text !== text), { id, art, text, aktion }].slice(-3));
      if (art === 'info') setTimeout(() => weg(id), aktion || text.length > 70 ? 9000 : 4000);
    },
    [weg],
  );
  const wert = useMemo(() => ({ zeigen }), [zeigen]);

  return (
    <Kontext.Provider value={wert}>
      {children}
      <div className="meldungen" role="status" aria-live="polite">
        {meldungen.map((m) => (
          <div key={m.id} className={`meldung meldung-${m.art}`}>
            {m.art === 'info' ? <CircleCheck className="i" aria-hidden /> : <TriangleAlert className="i" aria-hidden />}
            <span>{m.text}</span>
            {m.aktion && (
              <button
                className="knopf knopf-linie meldung-aktion"
                onClick={() => {
                  m.aktion?.onKlick();
                  weg(m.id);
                }}
              >
                {m.aktion.text}
              </button>
            )}
            <button className="symbolknopf" onClick={() => weg(m.id)} aria-label="Hinweis schließen">
              <X className="i" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </Kontext.Provider>
  );
}
