import { useEffect, useId, useState, type ReactNode } from 'react';
import { zahlLesen, zahlText } from '@shared/format';

interface ZahlFeldProps {
  label: string;
  einheit?: string;
  wert: number | null;
  /** Nur gültige Werte kommen an. Leeres Feld: null, wenn `leerErlaubt`. */
  onWert(wert: number | null): void;
  istErlaubt(wert: number): boolean;
  fehlerText: string;
  hilfe?: ReactNode;
  leerErlaubt?: boolean;
  stellen?: number;
  platzhalter?: string;
}

/** Zahlenfeld mit deutschem Komma. Beschwert sich erst beim Verlassen des Felds, nicht schon beim Tippen. */
export function ZahlFeld({ label, einheit, wert, onWert, istErlaubt, fehlerText, hilfe, leerErlaubt, stellen = 1, platzhalter }: ZahlFeldProps) {
  const id = useId();
  const alsText = (z: number | null) => (z === null ? '' : zahlText(z, stellen).replace(/\./g, ''));
  const [text, setText] = useState(() => alsText(wert));
  const [aktiv, setAktiv] = useState(false);
  const [fehler, setFehler] = useState(false);

  // Von außen geänderte Werte übernehmen, solange man nicht gerade darin tippt.
  useEffect(() => {
    if (!aktiv) setText(alsText(wert));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wert, aktiv]);

  const passt = (roh: string) => {
    if (roh.trim() === '') return leerErlaubt === true;
    const z = zahlLesen(roh);
    return z !== null && istErlaubt(z);
  };

  return (
    <div className="feld">
      <label htmlFor={id}>{label}</label>
      <div className="feld-zeile">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder={platzhalter}
          aria-invalid={fehler}
          onFocus={() => setAktiv(true)}
          onChange={(e) => {
            const roh = e.target.value;
            setText(roh);
            if (fehler && passt(roh)) setFehler(false);
            if (roh.trim() === '') {
              if (leerErlaubt) onWert(null);
              return;
            }
            const z = zahlLesen(roh);
            if (z !== null && istErlaubt(z)) onWert(z);
          }}
          onBlur={() => {
            setAktiv(false);
            setFehler(!passt(text) && text.trim() !== '');
          }}
        />
        {einheit && <span className="feld-einheit">{einheit}</span>}
      </div>
      {fehler ? <p className="feld-fehler">{fehlerText}</p> : hilfe && <p className="feld-hilfe">{hilfe}</p>}
    </div>
  );
}

interface WahlProps<T extends string> {
  name: string;
  beschriftung: string;
  optionen: readonly { id: T; titel: string; text?: string }[];
  wert: T | null;
  onWert(wert: T): void;
  spalten?: 2 | 4;
}

/** Eine Auswahl als große Kärtchen. Sind Radioknöpfe, also auch mit der Tastatur bedienbar. */
export function Wahl<T extends string>({ name, beschriftung, optionen, wert, onWert, spalten = 2 }: WahlProps<T>) {
  return (
    <div className={`wahl wahl-${spalten}`} role="radiogroup" aria-label={beschriftung}>
      {optionen.map((o) => (
        <label key={o.id} className={`wahl-karte${wert === o.id ? ' gewaehlt' : ''}`}>
          <input type="radio" name={name} checked={wert === o.id} onChange={() => onWert(o.id)} />
          <span className="wahl-titel">{o.titel}</span>
          {o.text && <span className="wahl-text">{o.text}</span>}
        </label>
      ))}
    </div>
  );
}

export function Haken({ label, wert, onWert, hilfe }: { label: string; wert: boolean; onWert(wert: boolean): void; hilfe?: string }) {
  return (
    <label className="haken">
      <input type="checkbox" checked={wert} onChange={(e) => onWert(e.target.checked)} />
      <span>
        {label}
        {hilfe && <small>{hilfe}</small>}
      </span>
    </label>
  );
}
