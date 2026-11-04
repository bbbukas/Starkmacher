import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, LoaderCircle, Pencil, RotateCcw, Scale, Trash2 } from 'lucide-react';
import type { Bedarf } from '@shared/bedarf';
import { inGramm, istUngefaehr, type MengenEinheit, type Umrechnung } from '@shared/einheiten';
import { mengeText, zahlText } from '@shared/format';
import {
  anteilAmBedarf,
  BLS_AENDERUNGEN,
  BLS_QUELLE,
  naehrwertZeilen,
  werteJe100g,
  zeilenDerGruppe,
  type Lebensmittel,
  type NaehrwertZeile,
} from '@shared/lebensmittel';
import { GRUPPEN, type GruppenId } from '@shared/naehrstoffe';
import { EPA_DHA_MINIMUM_MG } from '@shared/referenzwerte';
import { api } from '../../api';
import { useDaten } from '../../daten/DatenKontext';
import { Rueckfrage } from '../../komponenten/Dialog';
import { Mengenwahl, startMenge, type Mengenstand } from '../../komponenten/Mengenwahl';
import { useMeldungen } from '../../komponenten/Meldungen';
import { Teller } from '../../komponenten/Teller';
import { gehe, pfade } from '../../router';
import { Herkunftsmarke } from './LebensmittelSuche';
import { UmrechnungDialog } from './UmrechnungDialog';

const OFFEN: readonly GruppenId[] = ['makros', 'vitamine', 'mineralstoffe'];

/** Ein Anteil wird nie über den Balken hinaus gezeichnet. Der Text nennt den echten Wert. */
function AnteilBalken({ anteil }: { anteil: number }) {
  return (
    <div className="balken balken-klein" aria-hidden>
      <i style={{ width: `${Math.min(anteil, 100)}%` }} />
    </div>
  );
}

const anteilText = (anteil: number) => (anteil > 0 && anteil < 1 ? 'unter 1 %' : `${zahlText(anteil)} %`);
/** Für die schmale Spalte. */
const anteilKurz = (anteil: number) => (anteil > 0 && anteil < 1 ? '< 1 %' : `${zahlText(anteil)} %`);

function ZielTitel({ zeile }: { zeile: NaehrwertZeile }) {
  const z = zeile.ziel;
  if (!z) return null;
  if (z.von !== undefined) return <>vom Minimum ({mengeText(z.von, zeile.naehrstoff)})</>;
  if (z.hoechst !== undefined) return <>von höchstens {mengeText(z.hoechst, zeile.naehrstoff)}</>;
  return null;
}

function Zeile({ zeile, faktor }: { zeile: NaehrwertZeile; faktor: number }) {
  const { naehrstoff: n, je100g, jeMenge, anteil, spur, geschaetzt } = zeile;
  const wert = (menge: number | null) => (menge === null ? <span className="leise">keine Angabe</span> : spur ? <span className="leise">Spuren</span> : mengeText(menge, n));
  return (
    <div className="nw-zeile">
      <span className="name">
        {n.name}
        {geschaetzt && (
          <abbr className="art" title="Geschätzt aus einem ähnlichen BLS-Lebensmittel">
            ~
          </abbr>
        )}
      </span>
      <span className="nw-100">{wert(je100g === null ? null : je100g * faktor)}</span>
      <span className="nw-menge">{wert(jeMenge)}</span>
      <span className="nw-anteil" title={zeile.ziel ? undefined : 'Ohne Ziel'}>
        {anteil === null ? '' : anteilKurz(anteil)}
      </span>
      {anteil !== null && (
        <div className="nw-balken" title={anteilText(anteil)}>
          <AnteilBalken anteil={anteil} />
          <small className="leise">
            <ZielTitel zeile={zeile} />
          </small>
        </div>
      )}
    </div>
  );
}

function ExtraZeile(props: { name: string; hinweis: string; je100: string; jeMenge: string; anteil: number | null; zielText: string }) {
  return (
    <div className="nw-zeile nw-extra">
      <span className="name" title={props.hinweis}>
        {props.name}
      </span>
      <span className="nw-100">{props.je100}</span>
      <span className="nw-menge">{props.jeMenge}</span>
      <span className="nw-anteil">{props.anteil === null ? '' : anteilKurz(props.anteil)}</span>
      {props.anteil !== null && (
        <div className="nw-balken">
          <AnteilBalken anteil={props.anteil} />
          <small className="leise">{props.zielText}</small>
        </div>
      )}
      <p className="ziel-hinweis">{props.hinweis}</p>
    </div>
  );
}

function Mengenangabe({ gramm, einheit, menge }: { gramm: number | null; einheit: MengenEinheit; menge: number | null }) {
  if (menge === null || gramm === null) return null;
  if (!istUngefaehr(einheit)) return null;
  return <p className="umgerechnet">≈ {zahlText(gramm, gramm < 10 ? 1 : 0)} g</p>;
}

function Oberseite({ lm, gramm, bedarf }: { lm: Lebensmittel; gramm: number; bedarf: Bedarf | null }) {
  const werte = werteJe100g(lm);
  const menge = (code: string) => (werte[code] === undefined ? null : (werte[code]! * gramm) / 100);
  const kcal = menge('ENERCC');
  const makro = (titel: string, klasse: string, code: string, ziel: number | undefined) => {
    const g = menge(code);
    return (
      <div className={`makro ${klasse}`}>
        <span className="wort">{titel}</span>
        <span className="zahl">{g === null ? '–' : `${zahlText(g, g < 10 ? 1 : 0)} g`}</span>
        {g !== null && ziel !== undefined && <span className="makro-text">{anteilText((g / ziel) * 100)} deines Tagesziels</span>}
      </div>
    );
  };
  return (
    <div className="ergebnis-oben">
      <Teller anteil={bedarf && kcal !== null ? kcal / bedarf.kcal : 0}>
        <span className="teller-zahl">{kcal === null ? '–' : zahlText(kcal)}</span>
        <small>{bedarf && kcal !== null ? `kcal, ${anteilText((kcal / bedarf.kcal) * 100)}` : 'kcal'}</small>
      </Teller>
      <div className="makros">
        {makro('Eiweiß', 'g-aminosaeuren', 'PROT625', bedarf?.eiweissG)}
        {makro('Fett', 'g-fettsaeuren', 'FAT', bedarf?.fettG)}
        {makro('Kohlenhydrate', 'g-kohlenhydrate', 'CHO', bedarf?.kohlenhydrateG)}
      </div>
    </div>
  );
}

export function LebensmittelDetail({ id }: { id: string }) {
  const { stand, bedarf } = useDaten();
  const { zeigen } = useMeldungen();
  const [lm, setLm] = useState<Lebensmittel | null>(null);
  const [fehlt, setFehlt] = useState(false);
  const [mengen, setMengen] = useState<Mengenstand>({ menge: 100, einheit: 'g', groesse: 'M' });
  const { menge, einheit, groesse } = mengen;
  const [rueckfrage, setRueckfrage] = useState(false);
  const [umrechnungOffen, setUmrechnungOffen] = useState(false);
  const [foto, setFoto] = useState<string | null>(null);

  const mitGroessen = stand?.profil.stueckware !== 'gramm';

  useEffect(() => {
    let abgebrochen = false;
    void api.lebensmittel.holen(id).then((antwort) => {
      if (abgebrochen) return;
      if (!antwort.ok) {
        zeigen({ art: 'fehler', text: antwort.meldung });
        setFehlt(true);
        return;
      }
      if (!antwort.wert) {
        setFehlt(true);
        return;
      }
      setLm(antwort.wert);
      api.lebensmittel.verwendet(id);
      setMengen(startMenge(antwort.wert.umrechnung, antwort.wert.basis, mitGroessen));
      if (antwort.wert.foto) void api.lebensmittel.fotoLesen(antwort.wert.foto).then((f) => !abgebrochen && f.ok && setFoto(f.wert));
    });
    return () => {
      abgebrochen = true;
    };
    // Nur beim Öffnen: Danach gilt, was Lukas wählt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, zeigen]);

  const gramm = useMemo(() => (lm && menge !== null ? inGramm(menge, einheit, lm.umrechnung, groesse) : null), [lm, menge, einheit, groesse]);
  const zeilen = useMemo(() => (lm ? naehrwertZeilen(lm, gramm ?? 0, bedarf) : []), [lm, gramm, bedarf]);

  if (fehlt) {
    return (
      <main className="seite seite-schmal">
        <p>Dieses Lebensmittel gibt es nicht mehr.</p>
        <a className="knopf knopf-linie" href={pfade.reiter('lebensmittel')}>
          Zurück zur Suche
        </a>
      </main>
    );
  }
  if (!lm) {
    return (
      <main className="seite seite-schmal mitte">
        <LoaderCircle className="i gross dreht" aria-hidden />
      </main>
    );
  }

  const umrechnungSetzen = (u: Umrechnung | null) => {
    void api.lebensmittel.umrechnungSpeichern(id, u).then((antwort) => {
      if (antwort.ok) setLm(antwort.wert);
      else zeigen({ art: 'fehler', text: antwort.meldung });
    });
  };

  const entfernen = () => {
    void api.lebensmittel.loeschen(id).then((antwort) => {
      setRueckfrage(false);
      if (!antwort.ok) {
        zeigen({ art: 'fehler', text: antwort.meldung });
        return;
      }
      if (lm.herkunft === 'version') {
        zeigen({ art: 'info', text: 'Das Original ist wieder da.' });
        void api.lebensmittel.holen(id).then((neu) => neu.ok && neu.wert && setLm(neu.wert));
      } else {
        zeigen({ art: 'info', text: 'Lebensmittel gelöscht.' });
        gehe(pfade.reiter('lebensmittel'));
      }
    });
  };

  const ausgeblendet = stand?.profil.ausgeblendet ?? [];
  const g = gramm ?? 0;
  const je100 = werteJe100g(lm);
  const faktor = lm.basis === 'ml' ? lm.umrechnung.dichte : 1;
  const epa = je100['F20:5CN3'];
  const dha = je100['F22:6CN3'];
  const epaDha = epa === undefined && dha === undefined ? null : ((epa ?? 0) + (dha ?? 0)) * 1000;
  const zuckerZiel = bedarf?.freierZuckerHoechstG;
  const mengenTitel = gramm === null ? 'in dieser Menge' : `in ${zahlText(g, g < 10 ? 1 : 0)} g`;

  return (
    <main className="seite">
      <a className="zurueck" href={pfade.reiter('lebensmittel')}>
        <ArrowLeft className="i" aria-hidden /> Zur Suche
      </a>
      <div className="kopf-reihe">
        <div>
          <h1 className="seitentitel">{lm.name}</h1>
          <p className="unter-titel">
            <Herkunftsmarke lm={lm} />
            {lm.marke && <span>{lm.marke}</span>}
            {lm.packung !== null && (
              <span className="leise">
                Packung {zahlText(lm.packung)} {lm.basis}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="spalten spalten-detail">
        <div className="stapel">
          <section className="karte">
            <h2>Wie viel?</h2>
            <Mengenwahl umrechnung={lm.umrechnung} stand={mengen} mitGroessen={mitGroessen} onStand={setMengen} onUmrechnung={umrechnungSetzen} />
            <Mengenangabe gramm={gramm} einheit={einheit} menge={menge} />
            {gramm !== null && <Oberseite lm={lm} gramm={g} bedarf={bedarf} />}
          </section>

          <section className="karte">
            <div className="knopf-stapel">
              <a className="knopf knopf-linie" href={pfade.lebensmittelBearbeiten(id)}>
                <Pencil className="i" aria-hidden /> {lm.herkunft === 'bls' ? 'Eigene Version anlegen' : 'Bearbeiten'}
              </a>
              <button type="button" className="knopf knopf-linie" onClick={() => setUmrechnungOffen(true)}>
                <Scale className="i" aria-hidden /> Umrechnungen
              </button>
              {lm.herkunft === 'version' && (
                <button type="button" className="knopf knopf-linie" onClick={() => setRueckfrage(true)}>
                  <RotateCcw className="i" aria-hidden /> Auf das Original zurücksetzen
                </button>
              )}
              {lm.herkunft === 'eigen' && (
                <button type="button" className="knopf knopf-leise" onClick={() => setRueckfrage(true)}>
                  <Trash2 className="i" aria-hidden /> Löschen
                </button>
              )}
            </div>
            {lm.herkunft === 'bls' && <p className="leise knopf-text">Änderst du die Werte, bleibt das Original unverändert. Deine Version erscheint dann in der Suche statt des Originals.</p>}
            {lm.herkunft === 'version' && <p className="leise knopf-text">Das ist deine eigene Version. Das Original des BLS bleibt erhalten.</p>}
          </section>

          {foto && (
            <section className="karte">
              <img className="packungsfoto" src={foto} alt={`Packung von ${lm.name}`} />
            </section>
          )}

          {lm.schaetzung && (
            <div className="sanft-hinweis">
              Die mit ~ markierten Werte sind <b>geschätzt aus BLS: {lm.schaetzung.name}</b>.
            </div>
          )}
          {lm.hinweise.length > 0 && (
            <div className="sanft-hinweis">
              {lm.hinweise.map((h) => (
                <p key={h} className="hinweis-zeile">
                  {h}
                </p>
              ))}
            </div>
          )}
          {lm.anmerkung && <p className="quelle">Anmerkung im BLS: {lm.anmerkung}</p>}
          {(lm.herkunft === 'bls' || lm.herkunft === 'version') && (
            <p className="quelle">
              {lm.herkunft === 'version' ? 'Original: ' : 'Quelle: '}
              {BLS_QUELLE} {BLS_AENDERUNGEN} Werte je 100 g essbarem Anteil.
            </p>
          )}
        </div>

        <div className="stapel">
          {GRUPPEN.map((gruppe) => {
            const alle = zeilenDerGruppe(zeilen, gruppe.id).filter((z) => !ausgeblendet.includes(z.naehrstoff.code));
            if (alle.length === 0) return null;
            const bekannt = alle.filter((z) => z.je100g !== null).length;
            return (
              <details key={gruppe.id} className={`gruppe g-${gruppe.id}`} open={OFFEN.includes(gruppe.id)}>
                <summary>
                  <span className="punkt" />
                  <span className="gruppe-titel">{gruppe.titel}</span>
                  <span className="stand">
                    {bekannt} von {alle.length} bekannt
                  </span>
                  <ChevronDown className="i pfeil" aria-hidden />
                </summary>
                <div className="zeilen">
                  <div className="nw-kopf">
                    <span />
                    <span>je 100 {lm.basis}</span>
                    <span>{mengenTitel}</span>
                    <span>Bedarf</span>
                  </div>
                  {gruppe.id === 'kohlenhydrate' && lm.freierZuckerG !== null && (
                    <ExtraZeile
                      name="Freier Zucker, geschätzt"
                      hinweis={lm.herkunft === 'eigen' ? (lm.nurNatuerlicherZucker ? 'Du hast angegeben, dass hier nur natürlicher Zucker drin ist.' : 'Bei eigenen Lebensmitteln zählt der ganze Zucker als frei, außer du hakst „nur natürlicher Zucker“ an.') : 'Zucker aus ganzem Obst, Gemüse und Milch zählt nicht mit. Der BLS nennt den freien Zucker nicht, das ist eine Schätzung von Starkmacher.'}
                      je100={`${zahlText(lm.freierZuckerG * faktor, 1)} g`}
                      jeMenge={`${zahlText((lm.freierZuckerG * g) / 100, 1)} g`}
                      anteil={zuckerZiel ? (((lm.freierZuckerG * g) / 100) / zuckerZiel) * 100 : null}
                      zielText={zuckerZiel ? `von höchstens ${zahlText(zuckerZiel)} g` : ''}
                    />
                  )}
                  {gruppe.id === 'fettsaeuren' && epaDha !== null && (
                    <ExtraZeile
                      name="EPA und DHA zusammen"
                      hinweis="Die beiden Omega-3-Fettsäuren aus Fisch und Algen."
                      je100={`${zahlText(epaDha * faktor)} mg`}
                      jeMenge={`${zahlText((epaDha * g) / 100)} mg`}
                      anteil={anteilAmBedarf((epaDha * g) / 100, { code: 'EPA', art: 'schaetzwert', von: EPA_DHA_MINIMUM_MG, quelle: 'EFSA 2010' })}
                      zielText={`vom Minimum (${zahlText(EPA_DHA_MINIMUM_MG)} mg)`}
                    />
                  )}
                  {alle.map((z) => (
                    <Zeile key={z.naehrstoff.code} zeile={z} faktor={faktor} />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </div>

      <Rueckfrage
        offen={rueckfrage}
        titel={lm.herkunft === 'version' ? 'Auf das Original zurücksetzen?' : 'Lebensmittel löschen?'}
        text={lm.herkunft === 'version' ? 'Deine Änderungen an den Werten gehen dabei verloren, das Original des BLS gilt wieder.' : `„${lm.name}“ wird gelöscht. Das lässt sich nur über eine Sicherung rückgängig machen. Rezepte mit dieser Zutat zeigen danach einen Hinweis, und vergangene Tage im Tagebuch bleiben, wie sie sind.`}
        bestaetigen={lm.herkunft === 'version' ? 'Zurücksetzen' : 'Löschen'}
        onBestaetigen={entfernen}
        onAbbrechen={() => setRueckfrage(false)}
      />
      <UmrechnungDialog
        offen={umrechnungOffen}
        lm={lm}
        onSchliessen={() => setUmrechnungOffen(false)}
        onSpeichern={(u) => {
          umrechnungSetzen(u);
          setUmrechnungOffen(false);
        }}
      />
    </main>
  );
}
