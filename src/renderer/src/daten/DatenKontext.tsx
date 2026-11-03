/**
 * Die Daten für die Oberfläche: Änderungen sind sofort sichtbar und werden nach
 * einer kurzen Pause gespeichert. Hier wird auch der Bedarf gerechnet und gesagt,
 * wenn er sich ändert (neues Gewicht, neues Lebensjahr).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Aenderung } from '@shared/api';
import { bedarfAusProfil, zielGeaendert, zielStandVon, type Bedarf } from '@shared/bedarf';
import { zahlText } from '@shared/format';
import { datumVon, type Profil, type Stand } from '@shared/profil';
import { api } from '../api';
import { useMeldungen } from '../komponenten/Meldungen';

export type SpeicherZustand = 'ruhig' | 'speichert' | 'gespeichert' | 'fehler';

interface DatenWert {
  stand: Stand | null;
  laedt: boolean;
  ladeFehler: string | null;
  speicherZustand: SpeicherZustand;
  bedarf: Bedarf | null;
  profilAendern(teil: Partial<Profil>): void;
  /** Trägt das Gewicht für heute ein. Der neueste Wert gilt für „Mein Bedarf“. */
  gewichtEintragen(kg: number): void;
  speichernJetzt(): Promise<void>;
  /** Nach dem Wiederherstellen einer Sicherung. */
  ersetzen(stand: Stand): void;
}

const Kontext = createContext<DatenWert | null>(null);

export function useDaten(): DatenWert {
  const wert = useContext(Kontext);
  if (!wert) throw new Error('useDaten nur innerhalb von DatenProvider');
  return wert;
}

const PAUSE_MS = 800;

export function DatenProvider({ children }: { children: ReactNode }) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [speicherZustand, setSpeicherZustand] = useState<SpeicherZustand>('ruhig');
  const { zeigen } = useMeldungen();

  const aktuell = useRef<Stand | null>(null);
  const offen = useRef<Aenderung>({});
  const uhr = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reihe = useRef<Promise<void>>(Promise.resolve());

  const setzen = useCallback((neu: Stand) => {
    aktuell.current = neu;
    setStand(neu);
  }, []);

  const schreiben = useCallback(async () => {
    if (uhr.current) clearTimeout(uhr.current);
    uhr.current = null;
    const aenderung = offen.current;
    if (!aenderung.profil && !aenderung.gewicht) return reihe.current;
    offen.current = {};
    setSpeicherZustand('speichert');
    // Eine Änderung nach der anderen.
    reihe.current = reihe.current.then(async () => {
      const antwort = await api.daten.speichern(aenderung);
      if (antwort.ok) {
        const nochOffen = Boolean(offen.current.profil || offen.current.gewicht);
        if (!nochOffen) setSpeicherZustand('gespeichert');
      } else {
        setSpeicherZustand('fehler');
        zeigen({ art: 'fehler', text: antwort.meldung });
      }
    });
    return reihe.current;
  }, [zeigen]);

  const merken = useCallback(
    (aenderung: Aenderung) => {
      offen.current = { ...offen.current, ...aenderung };
      setSpeicherZustand('speichert');
      if (uhr.current) clearTimeout(uhr.current);
      uhr.current = setTimeout(() => void schreiben(), PAUSE_MS);
    },
    [schreiben],
  );

  const profilAendern = useCallback(
    (teil: Partial<Profil>) => {
      const alt = aktuell.current;
      if (!alt) return;
      const profil = { ...alt.profil, ...teil };
      setzen({ ...alt, profil });
      merken({ profil });
    },
    [merken, setzen],
  );

  const gewichtEintragen = useCallback(
    (kg: number) => {
      const alt = aktuell.current;
      if (!alt) return;
      const gewicht = { datum: datumVon(new Date()), kg };
      setzen({ ...alt, gewichte: [...alt.gewichte.filter((g) => g.datum !== gewicht.datum), gewicht].sort((a, b) => a.datum.localeCompare(b.datum)) });
      merken({ gewicht });
    },
    [merken, setzen],
  );

  const ersetzen = useCallback(
    (neu: Stand) => {
      if (uhr.current) clearTimeout(uhr.current);
      offen.current = {};
      setLadeFehler(null);
      setzen(neu);
      setSpeicherZustand('ruhig');
    },
    [setzen],
  );

  useEffect(() => {
    let abgebrochen = false;
    void api.daten.laden().then((ergebnis) => {
      if (abgebrochen) return;
      if (ergebnis.ok) setzen(ergebnis.stand);
      else setLadeFehler(ergebnis.meldung);
      setLaedt(false);
    });
    // Beim Schließen des Fensters nichts verlieren.
    const schliessen = () => {
      const aenderung = offen.current;
      if (aenderung.profil || aenderung.gewicht) api.daten.speichernSofort(aenderung);
    };
    window.addEventListener('beforeunload', schliessen);
    return () => {
      abgebrochen = true;
      window.removeEventListener('beforeunload', schliessen);
    };
  }, [setzen]);

  const bedarf = useMemo(() => (stand ? bedarfAusProfil(stand.profil, stand.gewichte, new Date().getFullYear()) : null), [stand]);

  // Sagen, wenn sich der Bedarf geändert hat. Wartet die Speicherpause ab, damit es beim Tippen nicht ständig meldet.
  useEffect(() => {
    if (!stand?.profil.einrichtungFertig || !bedarf) return;
    const merke = setTimeout(() => {
      const neu = zielStandVon(bedarf);
      const alt = stand.profil.letzteZiele;
      if (alt && alt.kcal === neu.kcal && alt.eiweissG === neu.eiweissG) return;
      if (zielGeaendert(alt, neu)) {
        zeigen({
          art: 'info',
          text: `Dein Bedarf hat sich geändert: jetzt etwa ${zahlText(neu.kcal)} kcal und ${zahlText(neu.eiweissG)} g Eiweiß am Tag (vorher ${zahlText(alt!.kcal)} kcal und ${zahlText(alt!.eiweissG)} g).`,
        });
      }
      profilAendern({ letzteZiele: neu });
    }, PAUSE_MS);
    return () => clearTimeout(merke);
  }, [bedarf, stand?.profil.einrichtungFertig, stand?.profil.letzteZiele, profilAendern, zeigen]);

  const wert = useMemo<DatenWert>(
    () => ({ stand, laedt, ladeFehler, speicherZustand, bedarf, profilAendern, gewichtEintragen, speichernJetzt: schreiben, ersetzen }),
    [stand, laedt, ladeFehler, speicherZustand, bedarf, profilAendern, gewichtEintragen, schreiben, ersetzen],
  );

  return <Kontext.Provider value={wert}>{children}</Kontext.Provider>;
}
