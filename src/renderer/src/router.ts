import { useEffect, useState } from 'react';
import { istReiter, type ReiterId } from './reiter';

export type Route = { name: 'reiter'; reiter: ReiterId } | { name: 'bedarf' } | { name: 'einstellungen' };

/** "#/rezepte" → Route. Unbekanntes führt zum Tagebuch: Das Programm öffnet mit dem heutigen Tag. */
export function routeAus(hash: string): Route {
  const teil = hash.replace(/^#\/?/, '').split('/')[0];
  if (teil === 'bedarf') return { name: 'bedarf' };
  if (teil === 'einstellungen') return { name: 'einstellungen' };
  return { name: 'reiter', reiter: istReiter(teil) ? teil : 'tagebuch' };
}

export const pfade = {
  reiter: (id: ReiterId) => `#/${id}`,
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
