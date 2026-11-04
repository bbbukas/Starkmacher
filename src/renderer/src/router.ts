import { useEffect, useState } from 'react';
import { istReiter, type ReiterId } from './reiter';

/** `unter`: was nach dem Reiter im Pfad steht, z. B. die Kennung eines Lebensmittels. */
export type Route = { name: 'reiter'; reiter: ReiterId; unter: readonly string[] } | { name: 'bedarf' } | { name: 'einstellungen' };

/** "#/rezepte" → Route. Unbekanntes führt zum Tagebuch: Das Programm öffnet mit dem heutigen Tag. */
export function routeAus(hash: string): Route {
  const [teil, ...rest] = hash.replace(/^#\/?/, '').split('/');
  if (teil === 'bedarf') return { name: 'bedarf' };
  if (teil === 'einstellungen') return { name: 'einstellungen' };
  if (!istReiter(teil)) return { name: 'reiter', reiter: 'tagebuch', unter: [] };
  return { name: 'reiter', reiter: teil, unter: rest.map(decodeURIComponent) };
}

export const pfade = {
  reiter: (id: ReiterId) => `#/${id}`,
  tagebuchTag: (datum: string) => `#/tagebuch/${datum}`,
  teller: (id: string) => `#/teller/${encodeURIComponent(id)}`,
  tellerNeu: () => '#/teller/neu',
  rezept: (id: string) => `#/rezepte/${encodeURIComponent(id)}`,
  rezeptNeu: () => '#/rezepte/neu',
  rezeptFoto: () => '#/rezepte/foto',
  rezeptBearbeiten: (id: string) => `#/rezepte/${encodeURIComponent(id)}/bearbeiten`,
  rezeptKopie: (id: string) => `#/rezepte/${encodeURIComponent(id)}/kopie`,
  lebensmittel: (id: string) => `#/lebensmittel/${encodeURIComponent(id)}`,
  lebensmittelNeu: () => '#/lebensmittel/neu',
  lebensmittelFoto: () => '#/lebensmittel/foto',
  lebensmittelBearbeiten: (id: string) => `#/lebensmittel/${encodeURIComponent(id)}/bearbeiten`,
  bedarf: () => '#/bedarf',
  einstellungen: () => '#/einstellungen',
};

export function gehe(pfad: string): void {
  window.location.hash = pfad;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => routeAus(window.location.hash));
  useEffect(() => {
    const neu = () => {
      setRoute(routeAus(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', neu);
    return () => window.removeEventListener('hashchange', neu);
  }, []);
  return route;
}
