import { useEffect, useState } from 'react';
import { Check, LoaderCircle, Settings, Target, TriangleAlert } from 'lucide-react';
import type { ProgrammInfo } from '@shared/api';
import { api } from '../api';
import logo from '../bilder/logo.svg';
import { useDaten } from '../daten/DatenKontext';
import { REITER } from '../reiter';
import { pfade, type Route } from '../router';

/** Oben auf jeder Ansicht: links Logo und Name, daneben die Reiter, rechts „Mein Bedarf“ und Einstellungen. */
export function Kopfzeile({ route, nurMarke = false }: { route: Route; nurMarke?: boolean }) {
  const { speicherZustand } = useDaten();
  const [info, setInfo] = useState<ProgrammInfo | null>(null);
  useEffect(() => void api.programm.info().then(setInfo), []);

  return (
    <>
      <header className="kopfzeile">
        <a className="marke" href={pfade.reiter('tagebuch')} aria-label="Starkmacher – zum Tagebuch">
          <img src={logo} alt="" />
          <span>Starkmacher</span>
        </a>
        {info?.entwicklung && (
          <span className="entwicklung" title="Entwicklungsfassung mit eigenem Datenordner – nicht deine echten Daten">
            Entwicklung
          </span>
        )}

        {!nurMarke && (
          <nav className="reiter" aria-label="Bereiche">
            {REITER.map((r) => (
              <a key={r.id} href={pfade.reiter(r.id)} aria-current={route.name === 'reiter' && route.reiter === r.id ? 'page' : undefined}>
                {r.titel}
              </a>
            ))}
          </nav>
        )}

        <div className="kopf-rechts">
          <span className="zustand" aria-live="polite">
            {speicherZustand === 'speichert' && (
              <>
                <LoaderCircle className="i dreht" aria-hidden />
                <span className="zustand-text">Speichert …</span>
              </>
            )}
            {speicherZustand === 'gespeichert' && (
              <>
                <Check className="i" aria-hidden />
                <span className="zustand-text">Gespeichert</span>
              </>
            )}
            {speicherZustand === 'fehler' && (
              <>
                <TriangleAlert className="i" aria-hidden />
                <span className="zustand-text">Nicht gespeichert</span>
              </>
            )}
          </span>
          {!nurMarke && (
            <>
              <a className="kopf-knopf kopf-bedarf" href={pfade.bedarf()} aria-current={route.name === 'bedarf' ? 'page' : undefined}>
                <Target className="i" aria-hidden />
                <span>Mein Bedarf</span>
              </a>
              <a className="kopf-knopf" href={pfade.einstellungen()} aria-current={route.name === 'einstellungen' ? 'page' : undefined} aria-label="Einstellungen">
                <Settings className="i" aria-hidden />
                <span className="kopf-text">Einstellungen</span>
              </a>
            </>
          )}
        </div>
      </header>
      <div className="decke" aria-hidden="true" />
    </>
  );
}
