import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, LoaderCircle, Trash2 } from 'lucide-react';
import { datumText, zahlLesen, zahlText } from '@shared/format';
import { GRUPPEN, type GruppenId } from '@shared/naehrstoffe';
import { datumVon, gewichtErlaubt, neuestesGewicht } from '@shared/profil';
import { ganzImZiel, rueckblickLage, rueckblickRechnen, rueckblickSaetze, schnittPasst, schnittText, startZeitraum, zeitraumAbruf, zeitraumDaneben, zeitraumTitel, zeitraumUm, type RueckblickZeile, type Zeitraum, type ZeitraumArt } from '@shared/rueckblick';
import { balkenAnteil, fehltText, type TagebuchEintrag } from '@shared/tagebuch';
import { api } from '../../api';
import { useDaten } from '../../daten/DatenKontext';
import { Rueckfrage } from '../../komponenten/Dialog';
import { useMeldungen } from '../../komponenten/Meldungen';
import { ArtMarke } from '../../komponenten/ZieleListe';
import { GewichtKurve } from './GewichtKurve';

function GewichtBereich() {
  const { stand, gewichtMitDatum, gewichtLoeschen } = useDaten();
  const { zeigen } = useMeldungen();
  const heute = datumVon(new Date());
  const [text, setText] = useState('');
  const [datum, setDatum] = useState(heute);
  const [fehler, setFehler] = useState<string | null>(null);
  const [loeschen, setLoeschen] = useState<string | null>(null);
  if (!stand) return null;
  const gewichte = stand.gewichte;
  const neuestes = neuestesGewicht(gewichte);
  const erstes = gewichte[0];
  const veraendert = neuestes && erstes && neuestes.datum !== erstes.datum ? neuestes.kg - erstes.kg : null;

  const eintragen = () => {
    const kg = zahlLesen(text);
    if (kg === null || !gewichtErlaubt(kg)) {
      setFehler('Bitte das Gewicht in Kilogramm eintragen, zum Beispiel 70,5.');
      return;
    }
    if (datum === '' || datum > heute) {
      setFehler('Das Datum darf nicht in der Zukunft liegen.');
      return;
    }
    setFehler(null);
    const istAelter = neuestes !== null && datum < neuestes.datum;
    gewichtMitDatum(kg, datum);
    setText('');
    setDatum(heute);
    zeigen({ art: 'info', text: istAelter ? 'Eingetragen. Für „Mein Bedarf“ gilt weiter der neueste Wert.' : 'Gewicht eingetragen.' });
  };

  return (
    <section className="karte form-karte" aria-label="Gewicht">
      <h2>Gewicht</h2>
      {neuestes && (
        <p className="gewicht-stand">
          <b>{zahlText(neuestes.kg, 1)} kg</b>
          <span className="leise">
            am {datumText(neuestes.datum)}
            {veraendert !== null && erstes && `, ${veraendert === 0 ? 'gleich wie' : `${zahlText(Math.abs(veraendert), 1)} kg ${veraendert < 0 ? 'weniger' : 'mehr'} als`} am ${datumText(erstes.datum)}`}
          </span>
        </p>
      )}
      <form
        className="gewicht-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          eintragen();
        }}
      >
        <div className="feld">
          <label htmlFor="gewicht-kg">Gewicht in kg</label>
          <input
            id="gewicht-kg"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFehler(null);
            }}
          />
        </div>
        <div className="feld">
          <label htmlFor="gewicht-datum">Datum</label>
          <input id="gewicht-datum" type="date" max={heute} value={datum} onChange={(e) => setDatum(e.target.value)} />
        </div>
        <button type="submit" className="knopf knopf-akzent" disabled={text.trim() === ''}>
          Eintragen
        </button>
      </form>
      {fehler && (
        <div className="hinweis hinweis-fehler" role="alert">
          <p>{fehler}</p>
        </div>
      )}
      {gewichte.length > 0 && <GewichtKurve gewichte={gewichte} />}
      {gewichte.length === 1 && <p className="leise">Ab dem zweiten Wert entsteht eine Kurve.</p>}
      <p className="leise">Der neueste Wert gilt für „Mein Bedarf“. Trägst du für einen Tag noch einmal ein, ersetzt das den alten Wert.</p>
      <details className="gewicht-tabelle">
        <summary>Alle Werte ansehen ({gewichte.length})</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Datum</th>
              <th scope="col">Gewicht</th>
              <th scope="col">
                <span className="unsichtbar">Löschen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {[...gewichte].reverse().map((g) => (
              <tr key={g.datum}>
                <td>{datumText(g.datum)}</td>
                <td>{zahlText(g.kg, 1)} kg</td>
                <td>
                  {gewichte.length > 1 && (
                    <button type="button" className="symbolknopf" aria-label={`Gewicht vom ${datumText(g.datum)} löschen`} onClick={() => setLoeschen(g.datum)}>
                      <Trash2 className="i" aria-hidden />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <Rueckfrage
        offen={loeschen !== null}
        titel="Gewicht löschen?"
        text={loeschen ? `Der Wert vom ${datumText(loeschen)} verschwindet aus der Kurve. Das lässt sich nicht rückgängig machen, außer über eine Sicherung.` : ''}
        bestaetigen="Löschen"
        onAbbrechen={() => setLoeschen(null)}
        onBestaetigen={() => {
          if (loeschen) gewichtLoeschen(loeschen);
          setLoeschen(null);
        }}
      />
    </section>
  );
}

const OFFEN: readonly GruppenId[] = ['makros', 'vitamine', 'mineralstoffe'];

function RueckblickReihe({ z }: { z: RueckblickZeile }) {
  const ganz = ganzImZiel(z);
  const lage = rueckblickLage(z);
  const fehlt = fehltText(z.fehltBei);
  return (
    <div className={`zeile stufe-${z.stufe}`}>
      <span className="name">
        {z.name}
        {z.art && <ArtMarke art={z.art} {...(z.quelle ? { quelle: z.quelle } : {})} />}
      </span>
      <span className="menge">{schnittText(z)}</span>
      {z.ziel && (
        <div className={`balken balken-klein${z.stufe === 'ueber' ? ' balken-mehr' : ''}`} aria-hidden>
          <i style={{ width: `${balkenAnteil(z.schnitt, z.ziel) * 100}%` }} />
        </div>
      )}
      {lage !== '' && <span className={`lage${ganz ? ' gut' : ''}`}>{ganz ? `✓ ${lage}` : lage}</span>}
      {fehlt && (
        <small className="zeile-fehlt" title={z.fehltBei.join(', ')}>
          {fehlt}
        </small>
      )}
    </div>
  );
}

function RueckblickGruppe({ id, titel, zeilen }: { id: GruppenId; titel: string; zeilen: readonly RueckblickZeile[] }) {
  const [alle, setAlle] = useState(false);
  const mitZiel = zeilen.filter((z) => z.ziel);
  const ohneZiel = zeilen.length - mitZiel.length;
  const bewertet = zeilen.filter((z) => z.bewertung !== 'keine');
  const erreicht = bewertet.filter(schnittPasst).length;
  const sichtbar = alle || mitZiel.length === 0 ? zeilen : mitZiel;
  return (
    <details className={`gruppe g-${id}`} open={OFFEN.includes(id)}>
      <summary>
        <span className="punkt" />
        <span className="gruppe-titel">{titel}</span>
        <span className="stand">{bewertet.length > 0 ? `im Schnitt ${erreicht} von ${bewertet.length}` : `${zeilen.length}, nur die Menge`}</span>
        <ChevronDown className="i pfeil" aria-hidden />
      </summary>
      <div className="zeilen">
        {sichtbar.map((z) => (
          <RueckblickReihe key={z.code} z={z} />
        ))}
        {mitZiel.length > 0 && ohneZiel > 0 && (
          <button type="button" className="weitere" onClick={() => setAlle(!alle)}>
            {alle ? 'Weniger anzeigen' : `${ohneZiel} weitere anzeigen`}
          </button>
        )}
      </div>
    </details>
  );
}

function RueckblickBereich() {
  const { stand, bedarf } = useDaten();
  const { zeigen } = useMeldungen();
  const heute = datumVon(new Date());
  const [zeitraum, setZeitraum] = useState<Zeitraum>(() => startZeitraum('woche', heute));
  const [eintraege, setEintraege] = useState<TagebuchEintrag[] | null>(null);
  const ausgeblendet = stand?.profil.ausgeblendet ?? [];

  useEffect(() => {
    let abgebrochen = false;
    setEintraege(null);
    const abruf = zeitraumAbruf(zeitraum);
    void api.tagebuch.zeitraum(abruf.von, abruf.bis).then((a) => {
      if (abgebrochen) return;
      if (a.ok) setEintraege(a.wert);
      else zeigen({ art: 'fehler', text: a.meldung });
    });
    return () => {
      abgebrochen = true;
    };
  }, [zeitraum, zeigen]);

  const rueckblick = useMemo(() => (bedarf && eintraege ? rueckblickRechnen(eintraege, zeitraum, bedarf, ausgeblendet, heute) : null), [bedarf, eintraege, zeitraum, ausgeblendet, heute]);
  const moeglich = zeitraum.tage.filter((t) => t < heute).length;
  const art = zeitraum.art;
  const wort = art === 'woche' ? 'Woche' : 'Monat';

  return (
    <section className="stapel" aria-label="Rückblick">
      <div className="karte form-karte">
        <div className="kopf-reihe">
          <h2>Rückblick</h2>
          <div className="zeitraum-wahl" role="group" aria-label="Zeitraum">
            {(['woche', 'monat'] as const).map((a: ZeitraumArt) => (
              <button key={a} type="button" className="zeitraum-knopf" aria-pressed={art === a} onClick={() => setZeitraum(zeitraumUm(a, startZeitraum(a, heute).von))}>
                {a === 'woche' ? 'Woche' : 'Monat'}
              </button>
            ))}
          </div>
        </div>
        <div className="zeitraum-reihe">
          <button type="button" className="knopf-rund" aria-label={art === 'woche' ? 'Woche davor' : 'Monat davor'} onClick={() => setZeitraum(zeitraumDaneben(zeitraum, -1))}>
            <ChevronLeft className="i" aria-hidden />
          </button>
          <b className="zeitraum-titel">{zeitraumTitel(zeitraum, heute)}</b>
          <button type="button" className="knopf-rund" aria-label={art === 'woche' ? 'Woche danach' : 'Monat danach'} disabled={zeitraum.bis >= heute} onClick={() => setZeitraum(zeitraumDaneben(zeitraum, 1))}>
            <ChevronRight className="i" aria-hidden />
          </button>
        </div>
        {!rueckblick && <LoaderCircle className="i dreht" aria-hidden />}
        {rueckblick && (
          <p className="leise rueckblick-stand">
            {rueckblick.tage > 0 ? `${rueckblick.tage} von ${moeglich} ${moeglich === 1 ? 'Tag' : 'Tagen'} eingetragen, nur diese Tage zählen. ` : `In diesem ${wort === 'Woche' ? 'Zeitraum' : 'Monat'} steht noch nichts, das zählt. `}
            {rueckblick.heuteLaeuft && 'Heute zählt noch nicht mit, der Tag läuft noch. '}
            {rueckblick.tage > 0 && 'Verglichen wird mit deinem heutigen Bedarf.'}
          </p>
        )}
      </div>
      {rueckblick && rueckblick.tage > 0 && (
        <>
          <div className="fehlt" aria-label="Was meistens gefehlt hat" role="group">
            <h2>Was meistens gefehlt hat</h2>
            {rueckblickSaetze(rueckblick, art).map((s) => (
              <p key={s} className="kurz">
                {s}
              </p>
            ))}
          </div>
          {GRUPPEN.map((g) => {
            const zeilen = rueckblick.zeilen.filter((z) => z.gruppe === g.id);
            return zeilen.length === 0 ? null : <RueckblickGruppe key={g.id} id={g.id} titel={g.titel} zeilen={zeilen} />;
          })}
        </>
      )}
    </section>
  );
}

/** Der Reiter „Verlauf“: Gewicht und Rückblick (Bauauftrag Abschnitt 9). */
export function VerlaufSeite() {
  return (
    <main className="seite seite-mittel">
      <h1 className="seitentitel">Verlauf</h1>
      <div className="stapel">
        <GewichtBereich />
        <RueckblickBereich />
      </div>
    </main>
  );
}
