import { CalendarDays } from 'lucide-react';
import { zahlText, tagText } from '@shared/format';
import { useDaten } from '../daten/DatenKontext';
import { Teller } from '../komponenten/Teller';
import { REITER, type ReiterId } from '../reiter';

function MakroFeld({ klasse, titel, ziel }: { klasse: string; titel: string; ziel: number }) {
  return (
    <div className={`feld-karte ${klasse}`}>
      <span className="wort">{titel}</span>
      <span className="zahl">
        0 <small>von {zahlText(ziel)} g</small>
      </span>
      <div className="balken">
        <i style={{ width: 0 }} />
      </div>
      <span className="rest">noch {zahlText(ziel)} g</span>
    </div>
  );
}

/** Noch nicht gefüllte Reiter sagen, was hier kommt. Das Tagebuch zeigt schon den heutigen Tag mit deinen Zielen. */
export function ReiterSeite({ id }: { id: ReiterId }) {
  const { bedarf } = useDaten();
  const reiter = REITER.find((r) => r.id === id)!;
  const heute = new Date();
  return (
    <main className="seite">
      {id === 'tagebuch' ? (
        <>
          <div className="tag">
            <CalendarDays className="i" aria-hidden />
            <h1>{tagText(heute)}</h1>
            <span className="heute">heute</span>
          </div>
          {bedarf && (
            <section className="summe" aria-label="Tagessumme">
              <div className="feld-karte kcal">
                <Teller anteil={0}>
                  <span className="teller-zahl">0</span>
                  <small>von {zahlText(bedarf.kcal)} kcal</small>
                </Teller>
              </div>
              <MakroFeld klasse="g-aminosaeuren" titel="Eiweiß" ziel={bedarf.eiweissG} />
              <MakroFeld klasse="g-fettsaeuren" titel="Fett" ziel={bedarf.fettG} />
              <MakroFeld klasse="g-kohlenhydrate" titel="Kohlenhydrate" ziel={bedarf.kohlenhydrateG} />
            </section>
          )}
        </>
      ) : (
        <h1 className="seitentitel">{reiter.titel}</h1>
      )}
      <section className="karte kommt-bald">
        <p>{reiter.text}</p>
        <p className="leise">Dieser Bereich kommt in Phase {reiter.phase}.</p>
      </section>
    </main>
  );
}
