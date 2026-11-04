import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookPlus, ChevronDown, Copy, LoaderCircle, Pencil, Trash2, TriangleAlert } from 'lucide-react';
import { mengeText, zahlText } from '@shared/format';
import { anteilAmBedarf } from '@shared/lebensmittel';
import { GRUPPEN, naehrstoffeDerGruppe, type GruppenId, type Naehrstoff } from '@shared/naehrstoffe';
import { datumVon } from '@shared/profil';
import { EPA_DHA_MINIMUM_MG } from '@shared/referenzwerte';
import { jePortion, rezeptSumme, zubereitungsSchritte, type RezeptAnsicht } from '@shared/rezepte';
import { fehltText, MAHLZEITEN, mahlzeitNachUhrzeit, mengenText, type Mahlzeit, type SummenWert, type Tagessumme } from '@shared/tagebuch';
import type { NaehrstoffZiel } from '@shared/bedarf';
import { api } from '../../api';
import { useDaten } from '../../daten/DatenKontext';
import { Dialog, Rueckfrage } from '../../komponenten/Dialog';
import { FotoBild } from '../../komponenten/FotoBild';
import { useMeldungen } from '../../komponenten/Meldungen';
import { Teller } from '../../komponenten/Teller';
import { gehe, pfade } from '../../router';
import { PortionenWahl } from '../tagebuch/EintragDialoge';
import { HashtagMarke, useHashtags } from './Hashtags';

const OFFEN: readonly GruppenId[] = ['makros', 'vitamine', 'mineralstoffe'];

const anteilKurz = (a: number) => (a > 0 && a < 1 ? '< 1 %' : `${zahlText(a)} %`);

function Zeile({ name, ganz, portion, ziel, einheit, zielText }: { name: string; ganz: SummenWert; portion: SummenWert; ziel: Pick<NaehrstoffZiel, 'von' | 'hoechst'> | undefined; einheit: Pick<Naehrstoff, 'einheit' | 'zeigeInMg'>; zielText?: string }) {
  // Weiß man bei keiner Zutat etwas, steht „keine Angabe“ statt 0.
  const nichts = portion.menge === 0 && portion.fehltBei.length > 0;
  const anteil = nichts ? null : anteilAmBedarf(portion.menge, ziel as NaehrstoffZiel | undefined);
  const fehlt = fehltText(portion.fehltBei);
  const text = (s: SummenWert) => (nichts ? <span className="leise">keine Angabe</span> : mengeText(s.menge, einheit));
  return (
    <div className="nw-zeile">
      <span className="name">{name}</span>
      <span className="nw-100">{text(ganz)}</span>
      <span className="nw-menge">{text(portion)}</span>
      <span className="nw-anteil">{anteil === null ? '' : anteilKurz(anteil)}</span>
      {anteil !== null && (
        <div className="nw-balken">
          <div className="balken balken-klein" aria-hidden>
            <i style={{ width: `${Math.min(anteil, 100)}%` }} />
          </div>
          <small className="leise">{zielText ?? (ziel?.von !== undefined ? `vom Minimum (${mengeText(ziel.von, einheit)})` : ziel?.hoechst !== undefined ? `von höchstens ${mengeText(ziel.hoechst, einheit)}` : '')}</small>
        </div>
      )}
      {fehlt && !nichts && (
        <small className="zeile-fehlt" title={portion.fehltBei.join(', ')}>
          {fehlt.replace('Eintrag', 'Zutat').replace('Einträgen', 'Zutaten')}
        </small>
      )}
    </div>
  );
}

function Naehrwerte({ ganz, portion }: { ganz: Tagessumme; portion: Tagessumme }) {
  const { stand, bedarf } = useDaten();
  const ausgeblendet = stand?.profil.ausgeblendet ?? [];
  return (
    <>
      {GRUPPEN.map((gruppe) => {
        const liste = naehrstoffeDerGruppe(gruppe.id).filter((n) => !ausgeblendet.includes(n.code));
        if (liste.length === 0) return null;
        const bekannt = liste.filter((n) => portion.werte[n.code]!.fehltBei.length < portion.anzahl).length;
        return (
          <details key={gruppe.id} className={`gruppe g-${gruppe.id}`} open={OFFEN.includes(gruppe.id)}>
            <summary>
              <span className="punkt" />
              <span className="gruppe-titel">{gruppe.titel}</span>
              <span className="stand">
                {bekannt} von {liste.length} bekannt
              </span>
              <ChevronDown className="i pfeil" aria-hidden />
            </summary>
            <div className="zeilen">
              <div className="nw-kopf">
                <span />
                <span>ganzes Rezept</span>
                <span>je Portion</span>
                <span>Bedarf</span>
              </div>
              {gruppe.id === 'kohlenhydrate' && bedarf && (
                <Zeile name="Freier Zucker, geschätzt" ganz={ganz.freierZuckerG} portion={portion.freierZuckerG} ziel={{ hoechst: bedarf.freierZuckerHoechstG }} einheit={{ einheit: 'g' }} />
              )}
              {gruppe.id === 'fettsaeuren' && <Zeile name="EPA und DHA zusammen" ganz={ganz.epaDhaMg} portion={portion.epaDhaMg} ziel={{ von: EPA_DHA_MINIMUM_MG }} einheit={{ einheit: 'mg' }} />}
              {liste.map((n) => (
                <Zeile key={n.code} name={n.name} ganz={ganz.werte[n.code]!} portion={portion.werte[n.code]!} ziel={bedarf?.ziele[n.code]} einheit={n} />
              ))}
            </div>
          </details>
        );
      })}
    </>
  );
}

function InsTagebuch({ offen, rezeptId, onSchliessen }: { offen: boolean; rezeptId: string; onSchliessen(): void }) {
  const { zeigen } = useMeldungen();
  const [datum, setDatum] = useState(datumVon(new Date()));
  const [mahlzeit, setMahlzeit] = useState<Mahlzeit>(mahlzeitNachUhrzeit(new Date()));
  const [portionen, setPortionen] = useState<number | null>(1);

  const eintragen = () => {
    if (portionen === null) return;
    void api.tagebuch.eintragen({ datum, mahlzeit, lebensmittelId: rezeptId, menge: portionen, einheit: 'Portion', groesse: null }).then((a) => {
      if (!a.ok) {
        zeigen({ art: 'fehler', text: a.meldung });
        return;
      }
      onSchliessen();
      gehe(pfade.tagebuchTag(datum));
    });
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
          <button type="submit" className="knopf knopf-akzent" disabled={portionen === null}>
            Eintragen
          </button>
        </>
      }
    >
      <div className="stapel">
        <PortionenWahl wert={portionen} onWert={setPortionen} />
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

export function RezeptDetail({ id }: { id: string }) {
  const { bedarf } = useDaten();
  const { zeigen } = useMeldungen();
  const { hashtags } = useHashtags();
  const [ansicht, setAnsicht] = useState<RezeptAnsicht | null>(null);
  const [fehlt, setFehlt] = useState(false);
  const [rueckfrage, setRueckfrage] = useState(false);
  const [tagebuch, setTagebuch] = useState(false);

  useEffect(() => {
    let abgebrochen = false;
    void api.rezepte.holen(id).then((a) => {
      if (abgebrochen) return;
      if (a.ok && a.wert) setAnsicht(a.wert);
      else {
        if (!a.ok) zeigen({ art: 'fehler', text: a.meldung });
        setFehlt(true);
      }
    });
    return () => {
      abgebrochen = true;
    };
  }, [id, zeigen]);

  const summen = useMemo(() => {
    if (!ansicht) return null;
    const ganz = rezeptSumme(ansicht.zutaten);
    return { ganz, portion: jePortion(ganz, ansicht.rezept.portionen) };
  }, [ansicht]);

  if (fehlt) {
    return (
      <main className="seite seite-schmal">
        <p>Dieses Rezept gibt es nicht mehr.</p>
        <a className="knopf knopf-linie" href={pfade.reiter('rezepte')}>
          Zu den Rezepten
        </a>
      </main>
    );
  }
  if (!ansicht || !summen) {
    return (
      <main className="seite seite-schmal mitte">
        <LoaderCircle className="i gross dreht" aria-hidden />
      </main>
    );
  }

  const { rezept, zutaten } = ansicht;
  const schritte = zubereitungsSchritte(rezept.zubereitung);
  const eigeneHashtags = rezept.hashtags.map((h) => hashtags.find((x) => x.id === h)).filter((h) => h !== undefined);
  const probleme = zutaten.filter((z) => z.problem);
  const kcal = summen.portion.werte.ENERCC!.menge;
  const makro = (titel: string, klasse: string, code: string, ziel: number | undefined) => {
    const g = summen.portion.werte[code]!.menge;
    return (
      <div className={`makro ${klasse}`}>
        <span className="wort">{titel}</span>
        <span className="zahl">{`${zahlText(g, g < 10 ? 1 : 0)} g`}</span>
        {ziel !== undefined && <span className="makro-text">{anteilKurz((g / ziel) * 100)} deines Tagesziels</span>}
      </div>
    );
  };

  return (
    <main className="seite">
      <a className="zurueck" href={pfade.reiter('rezepte')}>
        <ArrowLeft className="i" aria-hidden /> Zu den Rezepten
      </a>
      <div className="kopf-reihe">
        <div>
          <h1 className="seitentitel">{rezept.name}</h1>
          <p className="unter-titel">
            <span className="leise">
              ergibt {zahlText(rezept.portionen, 2)} {rezept.portionen === 1 ? 'Portion' : 'Portionen'}
            </span>
            {eigeneHashtags.map((h) => (
              <HashtagMarke key={h.id} hashtag={h} />
            ))}
          </p>
        </div>
        <button type="button" className="knopf knopf-akzent" onClick={() => setTagebuch(true)}>
          <BookPlus className="i" aria-hidden /> Ins Tagebuch
        </button>
      </div>

      <div className="spalten spalten-detail">
        <div className="stapel">
          {rezept.fotos.length > 0 && (
            <section className="foto-reihe" aria-label="Fotos">
              {rezept.fotos.map((f) => (
                <FotoBild key={f} name={f} text={`Foto von ${rezept.name}`} klasse="rezept-foto" />
              ))}
            </section>
          )}
          <section className="karte" aria-label="Je Portion">
            <h2>Je Portion</h2>
            <div className="ergebnis-oben">
              <Teller anteil={bedarf ? kcal / bedarf.kcal : 0}>
                <span className="teller-zahl">{zahlText(kcal)}</span>
                <small>{bedarf ? `kcal, ${anteilKurz((kcal / bedarf.kcal) * 100)}` : 'kcal'}</small>
              </Teller>
              <div className="makros">
                {makro('Eiweiß', 'g-aminosaeuren', 'PROT625', bedarf?.eiweissG)}
                {makro('Fett', 'g-fettsaeuren', 'FAT', bedarf?.fettG)}
                {makro('Kohlenhydrate', 'g-kohlenhydrate', 'CHO', bedarf?.kohlenhydrateG)}
              </div>
            </div>
          </section>
          <section className="karte" aria-label="Zutaten">
            <h2>Zutaten</h2>
            {probleme.length > 0 && (
              <div className="hinweis hinweis-fehler" role="alert">
                <TriangleAlert className="i" aria-hidden />
                <p>
                  Ohne {probleme.map((p) => `„${p.zutat.name}“`).join(', ')} gerechnet: {probleme[0]?.problem === 'gewicht-fehlt' ? 'Für diese Einheit fehlt ein Gewicht.' : 'Dieses Lebensmittel gibt es nicht mehr.'} Unter „Bearbeiten“ kannst du es ersetzen.
                </p>
              </div>
            )}
            <ul className="zutaten-liste">
              {zutaten.map(({ zutat, bestandteil }) => (
                <li key={zutat.id}>
                  <span className="zutat-menge">{bestandteil ? mengenText(bestandteil) : `${zahlText(zutat.menge, 2)} ${zutat.einheit}`}</span>
                  {bestandteil ? <a href={pfade.lebensmittel(zutat.lebensmittelId)}>{zutat.name}</a> : <span>{zutat.name}</span>}
                </li>
              ))}
            </ul>
          </section>
          {schritte.length > 0 && (
            <section className="karte" aria-label="Zubereitung">
              <h2>Zubereitung</h2>
              <ol className="zubereitung">
                {schritte.map((s, i) => (
                  <li key={`${i}-${s.slice(0, 12)}`}>{s}</li>
                ))}
              </ol>
            </section>
          )}
          {rezept.notiz.trim() !== '' && (
            <section className="karte" aria-label="Notiz">
              <h2>Notiz</h2>
              <p className="notiz">{rezept.notiz}</p>
            </section>
          )}
          <section className="karte">
            <div className="knopf-stapel">
              <a className="knopf knopf-linie" href={pfade.rezeptBearbeiten(id)}>
                <Pencil className="i" aria-hidden /> Bearbeiten
              </a>
              <a className="knopf knopf-linie" href={pfade.rezeptKopie(id)}>
                <Copy className="i" aria-hidden /> Als neues Rezept speichern
              </a>
              <button type="button" className="knopf knopf-leise" onClick={() => setRueckfrage(true)}>
                <Trash2 className="i" aria-hidden /> Löschen
              </button>
            </div>
          </section>
        </div>
        <div className="stapel">
          <Naehrwerte ganz={summen.ganz} portion={summen.portion} />
        </div>
      </div>

      <Rueckfrage
        offen={rueckfrage}
        titel="Rezept löschen?"
        text={`„${rezept.name}“ wird gelöscht. Das lässt sich nur über eine Sicherung rückgängig machen. Vergangene Tage im Tagebuch bleiben, wie sie sind.`}
        bestaetigen="Löschen"
        onAbbrechen={() => setRueckfrage(false)}
        onBestaetigen={() => {
          void api.rezepte.loeschen(id).then((a) => {
            setRueckfrage(false);
            if (!a.ok) {
              zeigen({ art: 'fehler', text: a.meldung });
              return;
            }
            zeigen({ art: 'info', text: 'Rezept gelöscht.' });
            gehe(pfade.reiter('rezepte'));
          });
        }}
      />
      <InsTagebuch offen={tagebuch} rezeptId={id} onSchliessen={() => setTagebuch(false)} />
    </main>
  );
}
