import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookPlus, Copy, LoaderCircle, Pencil, Trash2, TriangleAlert } from 'lucide-react';
import { zahlText } from '@shared/format';
import { jePortion, rezeptSumme, zubereitungsSchritte, type RezeptAnsicht } from '@shared/rezepte';
import { mengenText } from '@shared/tagebuch';
import { api } from '../../api';
import { Rueckfrage } from '../../komponenten/Dialog';
import { FotoBild } from '../../komponenten/FotoBild';
import { InsTagebuchDialog } from '../../komponenten/InsTagebuchDialog';
import { useMeldungen } from '../../komponenten/Meldungen';
import { SummenKopf, SummenTabelle } from '../../komponenten/SummenTabelle';
import { gehe, pfade } from '../../router';
import { HashtagMarke, useHashtags } from './Hashtags';

export function RezeptDetail({ id }: { id: string }) {
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
            <SummenKopf summe={summen.portion} />
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
          <SummenTabelle ganz={summen.ganz} menge={summen.portion} spalteGanz="ganzes Rezept" spalteMenge="je Portion" />
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
      <InsTagebuchDialog
        offen={tagebuch}
        einheit="Portionen"
        onSchliessen={() => setTagebuch(false)}
        onEintragen={({ datum, mahlzeit, menge }) => {
          void api.tagebuch.eintragen({ datum, mahlzeit, lebensmittelId: id, menge, einheit: 'Portion', groesse: null }).then((a) => {
            if (!a.ok) {
              zeigen({ art: 'fehler', text: a.meldung });
              return;
            }
            setTagebuch(false);
            gehe(pfade.tagebuchTag(datum));
          });
        }}
      />
    </main>
  );
}
