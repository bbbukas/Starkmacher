/** Beim allerersten Start: Schritt für Schritt durch „Mein Bedarf“, bevor es die Reiter gibt. */
import { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { fehlendeAngaben, zielStandVon } from '@shared/bedarf';
import { useDaten } from '../daten/DatenKontext';
import { AktivitaetWahl, BedarfErgebnis, HINWEIS_GESUND, UeberDich, ZielWahl } from './BedarfFormular';

const SCHRITTE = [
  { titel: 'Schön, dass du da bist!', text: 'Ein paar Angaben, dann weiß Starkmacher, was dein Körper am Tag braucht. Alles bleibt nur auf diesem Mac.', felder: ['Geschlecht', 'Geburtsjahr', 'Größe', 'Gewicht'] },
  { titel: 'Wie aktiv bist du?', text: 'Nimm, was am ehesten passt. Das lässt sich jederzeit ändern.', felder: ['Aktivität'] },
  { titel: 'Was hast du vor?', text: 'Dein Ziel bestimmt, wie viel Energie und Eiweiß du am Tag anpeilst.', felder: ['Ziel', 'Kalorien'] },
  { titel: 'Das ist dein Tagesbedarf', text: 'Daran orientiert sich ab jetzt dein Tagebuch.', felder: [] },
] as const;

export function ErsterStart() {
  const { stand, bedarf, profilAendern, speichernJetzt } = useDaten();
  const [schritt, setSchritt] = useState(0);
  const [hinweis, setHinweis] = useState<string | null>(null);
  if (!stand) return null;
  const aktuell = SCHRITTE[schritt]!;
  const fehlt = fehlendeAngaben(stand.profil, stand.gewichte).filter((f) => (aktuell.felder as readonly string[]).includes(f));
  const letzter = schritt === SCHRITTE.length - 1;

  const weiter = () => {
    if (fehlt.length > 0) {
      setHinweis(`Bitte noch eintragen: ${fehlt.join(', ')}.`);
      return;
    }
    setHinweis(null);
    setSchritt(schritt + 1);
  };

  const fertig = async () => {
    if (!bedarf) return;
    profilAendern({ einrichtungFertig: true, letzteZiele: zielStandVon(bedarf) });
    await speichernJetzt();
  };

  return (
    <main className="seite seite-schmal erster-start">
      <ol className="schritte" aria-label={`Schritt ${schritt + 1} von ${SCHRITTE.length}`}>
        {SCHRITTE.map((s, i) => (
          <li key={s.titel} className={i <= schritt ? 'erreicht' : ''} />
        ))}
      </ol>
      <h1 className="seitentitel">{aktuell.titel}</h1>
      <p className="einleitung">{aktuell.text}</p>

      <section className="karte form-karte">
        {schritt === 0 && <UeberDich />}
        {schritt === 1 && <AktivitaetWahl />}
        {schritt === 2 && <ZielWahl />}
        {letzter && bedarf && <BedarfErgebnis bedarf={bedarf} />}
      </section>

      {letzter && <p className="hinweis-gesund">{HINWEIS_GESUND}</p>}
      {hinweis && (
        <p className="sanft-hinweis" role="status">
          {hinweis}
        </p>
      )}

      <div className="knopfreihe">
        {schritt > 0 && (
          <button type="button" className="knopf knopf-linie" onClick={() => setSchritt(schritt - 1)}>
            <ArrowLeft className="i" aria-hidden />
            Zurück
          </button>
        )}
        {letzter ? (
          <button type="button" className="knopf knopf-akzent" disabled={!bedarf} onClick={() => void fertig()}>
            Los geht's
            <ArrowRight className="i" aria-hidden />
          </button>
        ) : (
          <button type="button" className="knopf knopf-akzent" onClick={weiter}>
            Weiter
            <ArrowRight className="i" aria-hidden />
          </button>
        )}
      </div>
    </main>
  );
}
