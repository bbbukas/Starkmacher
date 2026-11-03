import { useEffect } from 'react';
import { LoaderCircle, TriangleAlert } from 'lucide-react';
import { api } from './api';
import { EinstellungenSeite } from './ansichten/EinstellungenSeite';
import { ErsterStart } from './ansichten/ErsterStart';
import { MeinBedarf } from './ansichten/MeinBedarf';
import { ReiterSeite } from './ansichten/ReiterSeite';
import { useDaten } from './daten/DatenKontext';
import { Kopfzeile } from './komponenten/Kopfzeile';
import { useMeldungen } from './komponenten/Meldungen';
import { gehe, pfade, useRoute } from './router';

export function App() {
  const route = useRoute();
  const { stand, laedt, ladeFehler, speichernJetzt } = useDaten();
  const { zeigen } = useMeldungen();

  useEffect(
    () =>
      api.beiMenue((befehl) => {
        if (befehl === 'einstellungen') gehe(pfade.einstellungen());
        if (befehl === 'bedarf') gehe(pfade.bedarf());
        if (befehl === 'sicherung-erstellen') {
          void speichernJetzt()
            .then(() => api.sicherung.erstellen())
            .then((antwort) => zeigen(antwort.ok ? { art: 'info', text: antwort.wert ? 'Sicherung erstellt.' : 'Noch gibt es nichts zu sichern.' } : { art: 'fehler', text: antwort.meldung }));
        }
      }),
    [speichernJetzt, zeigen],
  );

  if (laedt) {
    return (
      <>
        <Kopfzeile route={route} nurMarke />
        <main className="seite seite-schmal mitte">
          <LoaderCircle className="i gross dreht" aria-hidden />
          <p className="leise">Daten werden geladen …</p>
        </main>
      </>
    );
  }

  // Die Einstellungen gehen immer – auch wenn die Daten sich nicht öffnen lassen (zum Wiederherstellen).
  if (!stand) {
    if (route.name === 'einstellungen') {
      return (
        <>
          <Kopfzeile route={route} nurMarke />
          <EinstellungenSeite />
        </>
      );
    }
    return (
      <>
        <Kopfzeile route={route} nurMarke />
        <main className="seite seite-schmal">
          <div className="hinweis hinweis-fehler" role="alert">
            <TriangleAlert className="i" aria-hidden />
            <div>
              <h1 className="hinweis-titel">Deine Daten lassen sich nicht öffnen</h1>
              <p>{ladeFehler}</p>
              <p>Es wurde nichts überschrieben. In den Einstellungen kannst du eine Sicherung wiederherstellen.</p>
            </div>
          </div>
          <a className="knopf knopf-akzent" href={pfade.einstellungen()}>
            Zu den Einstellungen
          </a>
        </main>
      </>
    );
  }

  // Beim allerersten Start erst „Mein Bedarf“, dann die Reiter.
  if (!stand.profil.einrichtungFertig) {
    return (
      <>
        <Kopfzeile route={route} nurMarke />
        <ErsterStart />
      </>
    );
  }

  return (
    <>
      <Kopfzeile route={route} />
      {route.name === 'reiter' && <ReiterSeite key={route.reiter} id={route.reiter} />}
      {route.name === 'bedarf' && <MeinBedarf />}
      {route.name === 'einstellungen' && <EinstellungenSeite />}
    </>
  );
}
