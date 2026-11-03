import { fehlendeAngaben } from '@shared/bedarf';
import { QUELLE_DGE } from '@shared/referenzwerte';
import { useDaten } from '../daten/DatenKontext';
import { ArtLegende, ZieleListe } from '../komponenten/ZieleListe';
import { AktivitaetWahl, BedarfErgebnis, HINWEIS_GESUND, UeberDich, ZielWahl } from './BedarfFormular';

export function MeinBedarf() {
  const { stand, bedarf } = useDaten();
  if (!stand) return null;
  const fehlt = fehlendeAngaben(stand.profil, stand.gewichte);
  return (
    <main className="seite">
      <h1 className="seitentitel">Mein Bedarf</h1>
      <p className="einleitung">Ändert sich etwas, passt Starkmacher deine Ziele von selbst an.</p>

      <div className="spalten">
        <div className="stapel">
          <section className="karte form-karte">
            <h2>Über dich</h2>
            <UeberDich />
          </section>
          <section className="karte form-karte">
            <h2>Wie aktiv bist du?</h2>
            <AktivitaetWahl />
          </section>
          <section className="karte form-karte">
            <h2>Dein Ziel</h2>
            <ZielWahl />
          </section>
          <p className="hinweis-gesund">{HINWEIS_GESUND}</p>
        </div>

        <div className="stapel">
          <section className="karte">
            <h2>Dein Tagesbedarf</h2>
            {bedarf ? <BedarfErgebnis bedarf={bedarf} /> : <p className="leise">Es fehlt noch: {fehlt.join(', ')}.</p>}
          </section>
          {bedarf && (
            <>
              <ZieleListe bedarf={bedarf} ausgeblendet={stand.profil.ausgeblendet} />
              <ArtLegende />
              <p className="quelle">
                Grundlage: {QUELLE_DGE.name}, {QUELLE_DGE.fassung}. Die Quellen stehen in den Einstellungen unter „Über Starkmacher“.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
