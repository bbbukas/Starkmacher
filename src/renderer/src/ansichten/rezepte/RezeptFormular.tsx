import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ImagePlus, LoaderCircle, Pencil, Plus, Tags, X } from 'lucide-react';
import { zahlText } from '@shared/format';
import { jePortion, portionenErlaubt, rezeptSumme, type RezeptEingabe, type RezeptZutat, type ZutatStand } from '@shared/rezepte';
import { mengenText } from '@shared/tagebuch';
import { api } from '../../api';
import { ZahlFeld } from '../../komponenten/Felder';
import { FotoBild } from '../../komponenten/FotoBild';
import { useMeldungen } from '../../komponenten/Meldungen';
import { ZutatDialog, type GewaehlteZutat } from '../../komponenten/ZutatDialog';
import { gehe, pfade } from '../../router';
import { HashtagDialog, HashtagWahl, useHashtags } from './Hashtags';

const neueId = () => `z-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Neues Rezept, Bearbeiten oder eine Variante („Als neues Rezept speichern“). */
export function RezeptFormular({ id, alsKopie }: { id?: string; alsKopie?: boolean }) {
  const { zeigen } = useMeldungen();
  const { hashtags, neuLaden } = useHashtags();
  const [laedt, setLaedt] = useState(id !== undefined);
  const [name, setName] = useState('');
  const [portionen, setPortionen] = useState<number | null>(2);
  const [zutaten, setZutaten] = useState<RezeptZutat[]>([]);
  const [zubereitung, setZubereitung] = useState('');
  const [notiz, setNotiz] = useState('');
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [fotos, setFotos] = useState<string[]>([]);
  const [stand, setStand] = useState<ZutatStand[]>([]);
  const [zutatOffen, setZutatOffen] = useState<{ bearbeiten: RezeptZutat | null } | null>(null);
  const [hashtagsOffen, setHashtagsOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const urspruenglicheFotos = useRef<string[]>([]);

  const zurueck = id ? pfade.rezept(id) : pfade.reiter('rezepte');
  const bearbeitet = id !== undefined && !alsKopie;

  useEffect(() => {
    if (!id) return;
    let abgebrochen = false;
    void api.rezepte.holen(id).then((a) => {
      if (abgebrochen) return;
      setLaedt(false);
      if (!a.ok || !a.wert) {
        zeigen({ art: 'fehler', text: a.ok ? 'Dieses Rezept gibt es nicht mehr.' : a.meldung });
        gehe(pfade.reiter('rezepte'));
        return;
      }
      const r = a.wert.rezept;
      setName(alsKopie ? `${r.name} (Variante)` : r.name);
      setPortionen(r.portionen);
      setZutaten(r.zutaten);
      setZubereitung(r.zubereitung);
      setNotiz(r.notiz);
      setGewaehlt(r.hashtags);
      setFotos(r.fotos);
      urspruenglicheFotos.current = r.fotos;
    });
    return () => {
      abgebrochen = true;
    };
  }, [id, alsKopie, zeigen]);

  // Die Nährwerte rechnet der Hauptprozess mit dem heutigen Stand der Zutaten.
  useEffect(() => {
    if (zutaten.length === 0) {
      setStand([]);
      return;
    }
    let abgebrochen = false;
    void api.rezepte.vorschau(zutaten).then((a) => {
      if (!abgebrochen && a.ok) setStand(a.wert);
    });
    return () => {
      abgebrochen = true;
    };
  }, [zutaten]);

  const vorschau = useMemo(() => (portionen && stand.length > 0 ? jePortion(rezeptSumme(stand), portionen) : null), [stand, portionen]);

  const zutatUebernehmen = (z: GewaehlteZutat, alt: RezeptZutat | null) => {
    const neu: RezeptZutat = { id: alt?.id ?? neueId(), lebensmittelId: z.lebensmittelId, name: z.name, menge: z.menge, einheit: z.einheit, groesse: z.groesse };
    setZutaten((liste) => (alt ? liste.map((x) => (x.id === alt.id ? neu : x)) : [...liste, neu]));
    setZutatOffen(null);
    setFehler(null);
  };

  const fotoWaehlen = () => {
    void api.lebensmittel.fotoWaehlen().then((a) => {
      if (!a.ok) zeigen({ art: 'fehler', text: a.meldung });
      else if (a.wert) setFotos((liste) => [...liste, a.wert!]);
    });
  };
  const fotoWeg = (foto: string) => {
    if (!urspruenglicheFotos.current.includes(foto)) api.lebensmittel.fotoVerwerfen(foto);
    setFotos((liste) => liste.filter((f) => f !== foto));
  };
  const abbrechen = () => {
    for (const foto of fotos) if (!urspruenglicheFotos.current.includes(foto)) api.lebensmittel.fotoVerwerfen(foto);
  };

  const speichern = (alsNeu: boolean) => {
    if (name.trim() === '') {
      setFehler('Bitte gib dem Rezept einen Namen.');
      window.scrollTo(0, 0);
      return;
    }
    if (portionen === null || !portionenErlaubt(portionen)) {
      setFehler('Bitte trag ein, wie viele Portionen das Rezept ergibt.');
      window.scrollTo(0, 0);
      return;
    }
    if (zutaten.length === 0) {
      setFehler('Bitte trag mindestens eine Zutat ein.');
      window.scrollTo(0, 0);
      return;
    }
    setFehler(null);
    setSpeichert(true);
    const eingabe: RezeptEingabe = { ...(bearbeitet && !alsNeu && id ? { id } : {}), name, portionen, zutaten, zubereitung, notiz, hashtags: gewaehlt, fotos };
    void api.rezepte.speichern(eingabe).then((a) => {
      setSpeichert(false);
      if (!a.ok) {
        setFehler(a.meldung);
        window.scrollTo(0, 0);
        return;
      }
      zeigen({ art: 'info', text: 'Rezept gespeichert.' });
      gehe(pfade.rezept(a.wert.rezept.id));
    });
  };

  if (laedt) {
    return (
      <main className="seite seite-schmal mitte">
        <LoaderCircle className="i gross dreht" aria-hidden />
      </main>
    );
  }

  const titel = alsKopie ? 'Als neues Rezept speichern' : bearbeitet ? 'Rezept bearbeiten' : 'Neues Rezept';
  const zeileFuer = (z: RezeptZutat) => stand.find((s) => s.zutat.id === z.id);

  return (
    <main className="seite seite-mittel">
      <a className="zurueck" href={zurueck} onClick={abbrechen}>
        <ArrowLeft className="i" aria-hidden /> Zurück
      </a>
      <h1 className="seitentitel">{titel}</h1>
      {alsKopie && <p className="einleitung">Das ist eine Kopie. Das ursprüngliche Rezept bleibt, wie es ist.</p>}
      {fehler && (
        <div className="hinweis hinweis-fehler" role="alert">
          <p>{fehler}</p>
        </div>
      )}

      <form
        className="stapel"
        onSubmit={(e) => {
          e.preventDefault();
          speichern(false);
        }}
      >
        <section className="karte form-karte">
          <div className="feld">
            <label htmlFor="rezept-name">Name</label>
            <input
              id="rezept-name"
              type="text"
              value={name}
              autoFocus={!id}
              autoComplete="off"
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim() !== '') setFehler(null);
              }}
            />
          </div>
          <div className="feld-reihe">
            <ZahlFeld label="Portionen" wert={portionen} onWert={setPortionen} istErlaubt={portionenErlaubt} fehlerText="Bitte eine Zahl über 0 eintragen." leerErlaubt stellen={2} hilfe="So viele Portionen ergibt das Rezept." />
          </div>
        </section>

        <section className="karte form-karte" aria-label="Zutaten">
          <h2>Zutaten</h2>
          <p className="leise">Mengen roh, so wie sie im Rezept stehen.</p>
          {zutaten.length > 0 && (
            <div className="zutaten-formular">
              {zutaten.map((z) => {
                const s = zeileFuer(z);
                return (
                  <div key={z.id} className="zutat-zeile">
                    <span className="zutat-menge">{s?.bestandteil ? mengenText(s.bestandteil) : `${zahlText(z.menge, 2)} ${z.einheit}`}</span>
                    <span className="zutat-name">
                      {z.name}
                      {s?.problem === 'gibt-es-nicht-mehr' && <small className="zeile-fehlt"> Dieses Lebensmittel gibt es nicht mehr, bitte ersetzen.</small>}
                      {s?.problem === 'gewicht-fehlt' && <small className="zeile-fehlt"> Für diese Einheit fehlt ein Gewicht.</small>}
                    </span>
                    <button type="button" className="symbolknopf" aria-label={`${z.name} ändern`} onClick={() => setZutatOffen({ bearbeiten: z })}>
                      <Pencil className="i" aria-hidden />
                    </button>
                    <button type="button" className="symbolknopf" aria-label={`${z.name} entfernen`} onClick={() => setZutaten((liste) => liste.filter((x) => x.id !== z.id))}>
                      <X className="i" aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div>
            <button type="button" className="knopf knopf-linie" onClick={() => setZutatOffen({ bearbeiten: null })}>
              <Plus className="i" aria-hidden /> Zutat hinzufügen
            </button>
          </div>
          {vorschau && (
            <p className="eintrag-vorschau">
              <b>Je Portion: </b>
              {zahlText(vorschau.werte.ENERCC!.menge)} kcal · Eiweiß {zahlText(vorschau.werte.PROT625!.menge, 1)} g · Fett {zahlText(vorschau.werte.FAT!.menge, 1)} g · Kohlenhydrate {zahlText(vorschau.werte.CHO!.menge, 1)} g
            </p>
          )}
        </section>

        <section className="karte form-karte">
          <div className="feld">
            <label htmlFor="rezept-zubereitung">Zubereitung</label>
            <textarea id="rezept-zubereitung" rows={7} value={zubereitung} onChange={(e) => setZubereitung(e.target.value)} />
            <p className="feld-hilfe">Jede Zeile wird ein Schritt.</p>
          </div>
          <div className="feld">
            <label htmlFor="rezept-notiz">Notiz (freiwillig)</label>
            <textarea id="rezept-notiz" rows={3} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
          </div>
        </section>

        <section className="karte form-karte" aria-label="Hashtags">
          <h2>Hashtags</h2>
          {hashtags.length === 0 ? <p className="leise">Noch keine Hashtags. Leg welche an, zum Beispiel vegan oder unter30Minuten.</p> : <HashtagWahl hashtags={hashtags} gewaehlt={gewaehlt} onWechsel={(h) => setGewaehlt((alt) => (alt.includes(h) ? alt.filter((a) => a !== h) : [...alt, h]))} />}
          <div>
            <button type="button" className="knopf knopf-leise knopf-klein" onClick={() => setHashtagsOffen(true)}>
              <Tags className="i" aria-hidden /> Hashtags verwalten
            </button>
          </div>
        </section>

        <section className="karte form-karte" aria-label="Fotos">
          <h2>Fotos (freiwillig)</h2>
          {fotos.length > 0 && (
            <div className="foto-reihe">
              {fotos.map((f) => (
                <div key={f} className="foto-kachel">
                  <FotoBild name={f} text="Foto des Gerichts" klasse="rezept-foto" />
                  <button type="button" className="symbolknopf foto-weg" aria-label="Foto entfernen" onClick={() => fotoWeg(f)}>
                    <X className="i" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div>
            <button type="button" className="knopf knopf-linie" onClick={fotoWaehlen}>
              <ImagePlus className="i" aria-hidden /> Foto wählen
            </button>
          </div>
        </section>

        <div className="knopfreihe">
          <button type="submit" className="knopf knopf-akzent" disabled={speichert}>
            Speichern
          </button>
          {bearbeitet && (
            <button type="button" className="knopf knopf-linie" disabled={speichert} onClick={() => speichern(true)}>
              Als neues Rezept speichern
            </button>
          )}
          <a className="knopf knopf-linie" href={zurueck} onClick={abbrechen}>
            Abbrechen
          </a>
        </div>
      </form>

      <ZutatDialog
        offen={zutatOffen !== null}
        titel={zutatOffen?.bearbeiten ? 'Zutat ändern' : 'Zutat hinzufügen'}
        start={zutatOffen?.bearbeiten ? { lebensmittelId: zutatOffen.bearbeiten.lebensmittelId, menge: zutatOffen.bearbeiten.menge, einheit: zutatOffen.bearbeiten.einheit, groesse: zutatOffen.bearbeiten.groesse } : null}
        onSchliessen={() => setZutatOffen(null)}
        onFertig={(z) => zutatUebernehmen(z, zutatOffen?.bearbeiten ?? null)}
      />
      <HashtagDialog offen={hashtagsOffen} hashtags={hashtags} onSchliessen={() => setHashtagsOffen(false)} onGeaendert={neuLaden} />
    </main>
  );
}
