import { useState } from 'react';
import { datumVon } from '@shared/profil';
import { MAHLZEITEN, mahlzeitNachUhrzeit, type Mahlzeit } from '@shared/tagebuch';
import { PortionenWahl } from '../ansichten/tagebuch/EintragDialoge';
import { Dialog } from './Dialog';

/** Tag, Mahlzeit und Menge wählen. Rezepte zählen in Portionen, Teller in Tellern. */
export function InsTagebuchDialog({ offen, einheit, onSchliessen, onEintragen }: { offen: boolean; einheit: 'Portionen' | 'Teller'; onSchliessen(): void; onEintragen(wahl: { datum: string; mahlzeit: Mahlzeit; menge: number }): void }) {
  const [datum, setDatum] = useState(datumVon(new Date()));
  const [mahlzeit, setMahlzeit] = useState<Mahlzeit>(mahlzeitNachUhrzeit(new Date()));
  const [menge, setMenge] = useState<number | null>(1);

  const eintragen = () => {
    if (menge !== null) onEintragen({ datum, mahlzeit, menge });
  };

  return (
    <Dialog
      titel="Ins Tagebuch eintragen"
      offen={offen}
      onSchliessen={onSchliessen}
      onAbsenden={eintragen}
      knoepfe={
        <>
          <button type="button" className="knopf knopf-linie" onClick={onSchliessen}>
            Abbrechen
          </button>
          <button type="submit" className="knopf knopf-akzent" disabled={menge === null}>
            Eintragen
          </button>
        </>
      }
    >
      <div className="stapel">
        <PortionenWahl wert={menge} onWert={setMenge} titel={einheit} />
        <div className="feld-reihe feld-reihe-2">
          <div className="feld">
            <label htmlFor="tagebuch-mahlzeit">Mahlzeit</label>
            <select id="tagebuch-mahlzeit" value={mahlzeit} onChange={(e) => setMahlzeit(e.target.value as Mahlzeit)}>
              {MAHLZEITEN.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.titel}
                </option>
              ))}
            </select>
          </div>
          <div className="feld">
            <label htmlFor="tagebuch-tag">Tag</label>
            <input id="tagebuch-tag" type="date" value={datum} onChange={(e) => e.target.value && setDatum(e.target.value)} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
