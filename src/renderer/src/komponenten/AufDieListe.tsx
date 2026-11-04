import { ShoppingBasket } from 'lucide-react';
import { anzahlText } from '@shared/einkauf';
import { api } from '../api';
import { useMeldungen } from './Meldungen';

/** Setzt ein gespeichertes Rezept oder einen gespeicherten Teller auf die Einkaufsliste. */
export function AufDieListe({ id }: { id: string }) {
  const { zeigen } = useMeldungen();
  return (
    <button
      type="button"
      className="knopf knopf-linie"
      onClick={() => {
        void api.einkauf.hinzufuegen(id).then((a) => {
          if (!a.ok) {
            zeigen({ art: 'fehler', text: a.meldung });
            return;
          }
          const q = a.wert.quellen.find((x) => x.bezugId === id);
          zeigen({ art: 'info', text: q ? `Auf der Einkaufsliste: ${anzahlText(q)}.` : 'Auf der Einkaufsliste.' });
        });
      }}
    >
      <ShoppingBasket className="i" aria-hidden /> Auf die Einkaufsliste
    </button>
  );
}
