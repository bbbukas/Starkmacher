import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ImagePlus, LoaderCircle, Sparkles, Trash2 } from 'lucide-react';
import type { AehnlichesLebensmittel } from '@shared/api';
import { mengeText, zahlText } from '@shared/format';
import { BLS_PREFIX, GRUPPEN_BLS, PACKUNGS_CODES, packungErlaubt, schaetzungAus, wertErlaubt, type Basis, type LebensmittelEingabe, type Schaetzung } from '@shared/lebensmittel';
import { GRUPPEN, naehrstoff, naehrstoffeDerGruppe, type Naehrstoff } from '@shared/naehrstoffe';
import { api } from '../../api';
import { Haken, Wahl, ZahlFeld } from '../../komponenten/Felder';
import { useMeldungen } from '../../komponenten/Meldungen';
import { gehe, pfade } from '../../router';

const PACKUNG = new Set<string>(PACKUNGS_CODES);

const titelFuer: Record<string, string> = { FASAT: 'davon gesättigte Fettsäuren', SUGAR: 'davon Zucker' };

function WertFeld({ n, wert, onWert }: { n: Naehrstoff; wert: number | null; onWert(wert: number | null): void }) {
  return (
    <ZahlFeld
      label={titelFuer[n.code] ?? n.name}
      einheit={n.einheit}
      wert={wert}
      onWert={onWert}
      istErlaubt={(z) => wertErlaubt(n.code, z)}
      fehlerText="Dieser Wert passt nicht."
      leerErlaubt
      stellen={3}
    />
  );
}

/** Die wichtigsten Werte einer Schätzung, damit man sieht, was man übernimmt. */
const VORSCHAU = ['VITD', 'VITB12', 'FOL', 'CA', 'FE', 'ID', 'ZN', 'MG', 'FIBT'] as const;

function SchaetzungsVorschlag({ v, onUebernehmen }: { v: AehnlichesLebensmittel; onUebernehmen(): void }) {
  const vergleich = (code: string, titel: string, einheit: string) => (v.vergleich[code] === undefined ? null : `${titel} ${zahlText(v.vergleich[code]!, 1)}${einheit}`);
  const zeile = [vergleich('ENERCC', '', ' kcal'), vergleich('FAT', 'Fett', ' g'), vergleich('CHO', 'KH', ' g'), vergleich('PROT625', 'Eiweiß', ' g')].filter(Boolean).join(' · ');
  const anzahl = Object.keys(v.schaetzung.werte).length;
  return (
    <div className="vorschlag">
      <div className="vorschlag-text">
        <b>{v.name}</b>
        <small className="leise">
          {v.gruppe && GRUPPEN_BLS[v.gruppe]} · je 100 g: {zeile}
        </small>
        <details className="vorschlag-werte">
          <summary>{anzahl} Werte ansehen</summary>
          <ul>
            {VORSCHAU.filter((c) => v.schaetzung.werte[c] !== undefined).map((c) => {
              const n = naehrstoff(c)!;
              return (
                <li key={c}>
                  {n.name}: {mengeText(v.schaetzung.werte[c]!, n)}
                </li>
              );
            })}
          </ul>
        </details>
      </div>
      <button type="button" className="knopf knopf-linie" onClick={onUebernehmen}>
        Übernehmen
      </button>
    </div>
  );
}

function SchaetzungBereich({ name, werte, schaetzung, onSchaetzung }: { name: string; werte: Record<string, number>; schaetzung: Schaetzung | null; onSchaetzung(s: Schaetzung | null): void }) {
  const { zeigen } = useMeldungen();
  const [vorschlaege, setVorschlaege] = useState<AehnlichesLebensmittel[] | null>(null);
  const [laedt, setLaedt] = useState(false);

  const suchen = () => {
    setLaedt(true);
    void api.lebensmittel.aehnliche({ name, werte }).then((antwort) => {
      setLaedt(false);
      if (antwort.ok) setVorschlaege(antwort.wert);
      else zeigen({ art: 'fehler', text: antwort.meldung });
    });
  };

  return (
    <section className="karte form-karte" aria-label="Fehlende Werte schätzen">
      <h2>Fehlende Werte schätzen</h2>
      <p className="leise">Auf Packungen stehen meist keine Vitamine und Mineralstoffe. Ein ähnliches Lebensmittel aus dem BLS kann sie als Schätzung ergänzen. Du entscheidest, ob du das möchtest.</p>
      {schaetzung ? (
        <div className="sanft-hinweis geschaetzt">
          <span>
            <b>Geschätzt aus BLS: {schaetzung.name}</b> ({Object.keys(schaetzung.werte).length} Werte)
          </span>
          <button type="button" className="knopf knopf-leise" onClick={() => onSchaetzung(null)}>
            <Trash2 className="i" aria-hidden /> Entfernen
          </button>
        </div>
      ) : (
        <>
          <div>
            <button type="button" className="knopf knopf-linie" disabled={laedt || (name.trim() === '' && Object.keys(werte).length === 0)} onClick={suchen}>
              {laedt ? <LoaderCircle className="i dreht" aria-hidden /> : <Sparkles className="i" aria-hidden />} Ähnliche Lebensmittel suchen
            </button>
          </div>
          {vorschlaege?.length === 0 && <p className="leise">Dazu habe ich nichts Ähnliches gefunden.</p>}
          {vorschlaege && vorschlaege.length > 0 && (
            <div className="vorschlaege">
              {vorschlaege.map((v) => (
                <SchaetzungsVorschlag
                  key={v.code}
                  v={v}
                  onUebernehmen={() => {
                    // Neu berechnen: Inzwischen eingetragene eigene Werte gehen immer vor.
                    onSchaetzung(schaetzungAus({ code: v.code, name: v.name, werte: v.schaetzung.werte }, werte));
                    setVorschlaege(null);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function FotoBereich({ foto, onFoto }: { foto: string | null; onFoto(name: string | null): void }) {
  const { zeigen } = useMeldungen();
  const [bild, setBild] = useState<string | null>(null);

  useEffect(() => {
    if (!foto) {
      setBild(null);
      return;
    }
    let abgebrochen = false;
    void api.lebensmittel.fotoLesen(foto).then((antwort) => {
      if (!abgebrochen && antwort.ok) setBild(antwort.wert);
    });
    return () => {
      abgebrochen = true;
    };
  }, [foto]);

  return (
    <div className="foto-bereich">
      {bild && <img className="packungsfoto" src={bild} alt="Foto der Packung" />}
      <div className="knopf-stapel">
        <button
          type="button"
          className="knopf knopf-linie"
          onClick={() => {
            void api.lebensmittel.fotoWaehlen().then((antwort) => {
              if (!antwort.ok) zeigen({ art: 'fehler', text: antwort.meldung });
              else if (antwort.wert) onFoto(antwort.wert);
            });
          }}
        >
          <ImagePlus className="i" aria-hidden /> {foto ? 'Anderes Foto' : 'Foto der Packung wählen'}
        </button>
        {foto && (
          <button type="button" className="knopf knopf-leise" onClick={() => onFoto(null)}>
            Foto entfernen
          </button>
        )}
      </div>
    </div>
  );
}

/** Neues Lebensmittel, Bearbeiten eines eigenen oder persönliche Version eines BLS-Lebensmittels. */
export function LebensmittelFormular({ id }: { id?: string }) {
  const { zeigen } = useMeldungen();
  const [laedt, setLaedt] = useState(id !== undefined);
  const [name, setName] = useState('');
  const [marke, setMarke] = useState('');
  const [basis, setBasis] = useState<Basis>('g');
  const [packung, setPackung] = useState<number | null>(null);
  const [werte, setWerte] = useState<Record<string, number>>({});
  const [natuerlich, setNatuerlich] = useState(false);
  const [schaetzung, setSchaetzung] = useState<Schaetzung | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const urspruenglichesFoto = useRef<string | null>(null);

  const istVersion = id?.startsWith(BLS_PREFIX) ?? false;
  const zurueck = id ? pfade.lebensmittel(id) : pfade.reiter('lebensmittel');

  useEffect(() => {
    if (!id) return;
    let abgebrochen = false;
    void api.lebensmittel.holen(id).then((antwort) => {
      if (abgebrochen) return;
      setLaedt(false);
      if (!antwort.ok || !antwort.wert) {
        zeigen({ art: 'fehler', text: antwort.ok ? 'Dieses Lebensmittel gibt es nicht mehr.' : antwort.meldung });
        gehe(pfade.reiter('lebensmittel'));
        return;
      }
      const lm = antwort.wert;
      setName(lm.name);
      setMarke(lm.marke ?? '');
      setBasis(lm.basis);
      setPackung(lm.packung);
      setWerte({ ...lm.werte });
      setNatuerlich(lm.nurNatuerlicherZucker);
      setSchaetzung(lm.schaetzung);
      setFoto(lm.foto);
      urspruenglichesFoto.current = lm.foto;
    });
    return () => {
      abgebrochen = true;
    };
  }, [id, zeigen]);

  const wertSetzen = (code: string, wert: number | null) => {
    setWerte((alt) => {
      const neu = { ...alt };
      if (wert === null) delete neu[code];
      else neu[code] = wert;
      return neu;
    });
  };

  /** Ein neu gewähltes, nicht gespeichertes Foto soll nicht liegen bleiben. */
  const fotoWechseln = (neu: string | null) => {
    if (foto && foto !== urspruenglichesFoto.current) api.lebensmittel.fotoVerwerfen(foto);
    setFoto(neu);
  };

  const speichern = () => {
    if (name.trim() === '') {
      setFehler('Bitte gib dem Lebensmittel einen Namen.');
      window.scrollTo(0, 0);
      return;
    }
    setFehler(null);
    setSpeichert(true);
    const eingabe: LebensmittelEingabe = {
      ...(id ? { id } : {}),
      name,
      marke: marke.trim() === '' ? null : marke,
      basis,
      werte,
      schaetzung,
      nurNatuerlicherZucker: natuerlich,
      packung,
      foto,
    };
    void api.lebensmittel.speichern(eingabe).then((antwort) => {
      setSpeichert(false);
      if (!antwort.ok) {
        setFehler(antwort.meldung);
        window.scrollTo(0, 0);
        return;
      }
      zeigen({ art: 'info', text: istVersion ? 'Deine Version ist gespeichert.' : 'Lebensmittel gespeichert.' });
      gehe(pfade.lebensmittel(antwort.wert.id));
    });
  };

  if (laedt) {
    return (
      <main className="seite seite-schmal mitte">
        <LoaderCircle className="i gross dreht" aria-hidden />
      </main>
    );
  }

  const titel = !id ? 'Neues Lebensmittel' : istVersion ? 'Eigene Version' : 'Lebensmittel bearbeiten';
  const packungsWerte = PACKUNGS_CODES.map((c) => naehrstoff(c)!);

  return (
    <main className="seite seite-mittel">
      <a className="zurueck" href={zurueck} onClick={() => fotoWechseln(urspruenglichesFoto.current)}>
        <ArrowLeft className="i" aria-hidden /> Zurück
      </a>
      <h1 className="seitentitel">{titel}</h1>
      {istVersion && <p className="einleitung">Das Original aus dem BLS bleibt unverändert. Deine Version erscheint in der Suche statt des Originals und lässt sich jederzeit zurücksetzen.</p>}
      {fehler && (
        <div className="hinweis hinweis-fehler" role="alert">
          <p>{fehler}</p>
        </div>
      )}

      <form
        className="stapel"
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <section className="karte form-karte">
          <h2>Angaben</h2>
          <div className="feld">
            <label htmlFor="lm-name">Name</label>
            <input
              id="lm-name"
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
          <div className="feld-reihe feld-reihe-2">
            <div className="feld">
              <label htmlFor="lm-marke">Marke (freiwillig)</label>
              <input id="lm-marke" type="text" value={marke} autoComplete="off" onChange={(e) => setMarke(e.target.value)} />
            </div>
            <ZahlFeld label="Packungsgröße (freiwillig)" einheit={basis} wert={packung} onWert={setPackung} istErlaubt={packungErlaubt} fehlerText="Diese Größe passt nicht." leerErlaubt stellen={1} />
          </div>
          <FotoBereich foto={foto} onFoto={fotoWechseln} />
        </section>

        <section className="karte form-karte">
          <h2>Nährwerte</h2>
          <Wahl<Basis>
            name="basis"
            beschriftung="Die Werte gelten"
            optionen={[
              { id: 'g', titel: 'Je 100 g' },
              { id: 'ml', titel: 'Je 100 ml', text: 'Für Getränke. Starkmacher rechnet über die Dichte in Gramm um.' },
            ]}
            wert={basis}
            onWert={setBasis}
          />
          <div className="feld-reihe feld-reihe-2">
            {packungsWerte.map((n) => (
              <WertFeld key={n.code} n={n} wert={werte[n.code] ?? null} onWert={(z) => wertSetzen(n.code, z)} />
            ))}
          </div>
          <Haken label="Nur natürlicher Zucker" wert={natuerlich} onWert={setNatuerlich} hilfe="Zum Beispiel bei ungesüßtem Joghurt. Sonst zählt der ganze Zucker als freier Zucker." />
        </section>

        <SchaetzungBereich name={name} werte={werte} schaetzung={schaetzung} onSchaetzung={setSchaetzung} />

        <section className="stapel" aria-label="Weitere Nährstoffe">
          <h2 className="zwischentitel">Weitere Nährstoffe (freiwillig)</h2>
          {GRUPPEN.map((gruppe) => {
            const liste = naehrstoffeDerGruppe(gruppe.id).filter((n) => !PACKUNG.has(n.code));
            if (liste.length === 0) return null;
            const anzahl = liste.filter((n) => werte[n.code] !== undefined).length;
            return (
              <details key={gruppe.id} className={`gruppe g-${gruppe.id}`}>
                <summary>
                  <span className="punkt" />
                  <span className="gruppe-titel">{gruppe.titel}</span>
                  <span className="stand">{anzahl > 0 ? `${anzahl} eingetragen` : `${liste.length} Felder`}</span>
                  <ChevronDown className="i pfeil" aria-hidden />
                </summary>
                <div className="zeilen feld-reihe feld-reihe-2 nw-felder">
                  {liste.map((n) => (
                    <WertFeld key={n.code} n={n} wert={werte[n.code] ?? null} onWert={(z) => wertSetzen(n.code, z)} />
                  ))}
                </div>
              </details>
            );
          })}
        </section>

        <div className="knopfreihe">
          <button type="submit" className="knopf knopf-akzent" disabled={speichert}>
            Speichern
          </button>
          <a className="knopf knopf-linie" href={zurueck} onClick={() => fotoWechseln(urspruenglichesFoto.current)}>
            Abbrechen
          </a>
        </div>
      </form>
    </main>
  );
}
