import { useId, useState } from 'react';
import { EINHEITEN, feldFuerEinheit, grammJeEinheit, type Groesse, type MengenEinheit, type Umrechnung } from '@shared/einheiten';
import { ZahlFeld } from './Felder';

export interface Mengenstand {
  menge: number | null;
  einheit: MengenEinheit;
  groesse: Groesse;
}

/** Womit ein Lebensmittel startet: Eier denkt man in Stück, Flüssiges mit Angabe je 100 ml in Millilitern, sonst 100 g. */
export function startMenge(u: Umrechnung, basis: 'g' | 'ml', mitGroessen: boolean): Mengenstand {
  if (u.groessen && mitGroessen) return { menge: 1, einheit: 'Stück', groesse: 'M' };
  return { menge: 100, einheit: basis === 'ml' ? 'ml' : 'g', groesse: 'M' };
}

/**
 * Menge und Einheit. Kennt das Lebensmittel eine Einheit noch nicht, fragt das Feld nach dem Gewicht.
 * `mitGroessen`: Stückware nach S, M, L. Hat Lukas in den Einstellungen „in Gramm“ gewählt, entfällt „Stück“ bei Eiern.
 */
export function Mengenwahl(props: {
  umrechnung: Umrechnung;
  stand: Mengenstand;
  mitGroessen: boolean;
  onStand(stand: Mengenstand): void;
  onUmrechnung(u: Umrechnung): void;
}) {
  const { umrechnung: u, stand, mitGroessen } = props;
  const { menge, einheit, groesse } = stand;
  const [neu, setNeu] = useState<number | null>(null);
  const idEinheit = useId();
  const feld = feldFuerEinheit(einheit);
  const unbekannt = grammJeEinheit(einheit, u, groesse) === null;
  const einheiten = EINHEITEN.filter((e) => e.id !== 'Stück' || mitGroessen || !u.groessen);
  return (
    <div className="mengenwahl">
      <div className="mengenwahl-reihe">
        <ZahlFeld
          label="Menge"
          wert={menge}
          onWert={(m) => props.onStand({ ...stand, menge: m })}
          istErlaubt={(z) => z > 0 && z <= 100000}
          fehlerText="Bitte eine Menge über 0 eintragen."
          leerErlaubt
          stellen={2}
        />
        <div className="feld">
          <label htmlFor={idEinheit}>Einheit</label>
          <select id={idEinheit} value={einheit} onChange={(e) => props.onStand({ ...stand, einheit: e.target.value as MengenEinheit })}>
            {einheiten.map((e) => (
              <option key={e.id} value={e.id}>
                {e.titel}
              </option>
            ))}
          </select>
        </div>
        {einheit === 'Stück' && u.groessen && (
          <div className="feld">
            <span className="feld-titel">Größe</span>
            <div className="filter" role="radiogroup" aria-label="Größe">
              {(['S', 'M', 'L'] as const).map((g) => (
                <label key={g} className={`filter-knopf${groesse === g ? ' gewaehlt' : ''}`} title={`${g}: etwa ${u.groessen![g]} g ohne Schale`}>
                  <input type="radio" name="groesse" checked={groesse === g} onChange={() => props.onStand({ ...stand, groesse: g })} />
                  {g}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
      {unbekannt && feld && (
        <div className="nachfrage">
          <ZahlFeld
            label={`Wie viel wiegt 1 ${einheit}?`}
            einheit="g"
            wert={neu}
            onWert={setNeu}
            istErlaubt={(z) => z > 0 && z <= 100000}
            fehlerText="Bitte ein Gewicht eintragen."
            leerErlaubt
            hilfe={einheit === 'Dose' ? 'Füllmenge oder Abtropfgewicht steht auf der Packung.' : 'Gilt ab jetzt für dieses Lebensmittel.'}
            stellen={1}
          />
          <button type="button" className="knopf knopf-linie" disabled={neu === null} onClick={() => neu !== null && props.onUmrechnung({ ...u, [feld]: neu })}>
            Merken
          </button>
        </div>
      )}
    </div>
  );
}
