import { useEffect, useState } from 'react';
import type { Groesse, Umrechnung } from '@shared/einheiten';
import type { Lebensmittel } from '@shared/lebensmittel';
import { Dialog } from '../../komponenten/Dialog';
import { ZahlFeld } from '../../komponenten/Felder';

const passt = (z: number) => z > 0 && z <= 100000;

/** Eigene Gewichte für EL, Stück usw. Sie gelten nur für dieses Lebensmittel und ändern seine Nährwerte nicht. */
export function UmrechnungDialog(props: { offen: boolean; lm: Lebensmittel; onSchliessen(): void; onSpeichern(u: Umrechnung | null): void }) {
  const { offen, lm } = props;
  const [u, setU] = useState<Umrechnung>(lm.umrechnung);

  useEffect(() => {
    if (offen) setU(lm.umrechnung);
  }, [offen, lm.umrechnung]);

  const gramm = (titel: string, feld: 'el' | 'tl' | 'prise', hilfe?: string) => (
    <ZahlFeld label={titel} einheit="g" wert={u[feld]} onWert={(z) => z !== null && setU({ ...u, [feld]: z })} istErlaubt={passt} fehlerText="Bitte ein Gewicht eintragen." stellen={1} {...(hilfe ? { hilfe } : {})} />
  );
  const offenesFeld = (titel: string, feld: 'stueck' | 'scheibe' | 'dose' | 'becher' | 'packung', hilfe?: string) => (
    <ZahlFeld label={titel} einheit="g" wert={u[feld]} onWert={(z) => setU({ ...u, [feld]: z })} istErlaubt={passt} fehlerText="Bitte ein Gewicht eintragen." leerErlaubt stellen={1} {...(hilfe ? { hilfe } : {})} />
  );
  const groesse = (g: Groesse) => (
    <ZahlFeld
      key={g}
      label={`Größe ${g}`}
      einheit="g"
      wert={u.groessen?.[g] ?? null}
      onWert={(z) => z !== null && u.groessen && setU({ ...u, groessen: { ...u.groessen, [g]: z } })}
      istErlaubt={passt}
      fehlerText="Bitte ein Gewicht eintragen."
      stellen={1}
    />
  );

  return (
    <Dialog
      titel="Umrechnungen"
      offen={offen}
      breit
      onSchliessen={props.onSchliessen}
      onAbsenden={() => props.onSpeichern(u)}
      knoepfe={
        <>
          {lm.umrechnungAngepasst && (
            <button type="button" className="knopf knopf-leise" onClick={() => props.onSpeichern(null)}>
              Standardwerte
            </button>
          )}
          <button type="button" className="knopf knopf-linie" onClick={props.onSchliessen}>
            Abbrechen
          </button>
          <button type="submit" className="knopf knopf-akzent">
            Speichern
          </button>
        </>
      }
    >
      <p className="dialog-text leise">So viele Gramm rechnet Starkmacher bei „{lm.name}“ je Einheit, jeweils ohne Schale und Kerne. Ein leeres Feld heißt: Das fragt das Programm bei Bedarf nach.</p>
      <div className="feld-reihe umrechnung-felder">
        {gramm('1 EL', 'el')}
        {gramm('1 TL', 'tl')}
        {gramm('1 Prise', 'prise')}
        <ZahlFeld
          label="Dichte"
          einheit="g/ml"
          wert={u.dichte}
          onWert={(z) => z !== null && setU({ ...u, dichte: z })}
          istErlaubt={(z) => z >= 0.1 && z <= 3}
          fehlerText="Bitte eine Zahl zwischen 0,1 und 3."
          hilfe="Rechnet ml in g um. Wasser hat 1."
          stellen={2}
        />
        {u.groessen ? (['S', 'M', 'L'] as const).map(groesse) : offenesFeld('1 Stück', 'stueck')}
        {offenesFeld('1 Scheibe', 'scheibe')}
        {offenesFeld('1 Dose', 'dose', 'Füllmenge oder Abtropfgewicht laut Packung.')}
        {offenesFeld('1 Becher', 'becher')}
        {offenesFeld('1 Packung', 'packung')}
      </div>
    </Dialog>
  );
}
