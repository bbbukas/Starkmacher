import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ImagePlus, LoaderCircle, Sparkles, Trash2 } from 'lucide-react';
import type { AehnlichesLebensmittel, FotoErgebnis } from '@shared/api';
import { barcodeGueltig, packungAus } from '@shared/barcode';
import { mengeText, zahlText } from '@shared/format';
import { BLS_PREFIX, GRUPPEN_BLS, PACKUNGS_CODES, packungErlaubt, schaetzungAus, wertErlaubt, type Basis, type LebensmittelEingabe, type Schaetzung } from '@shared/lebensmittel';
import { GRUPPEN, naehrstoff, naehrstoffeDerGruppe, type Naehrstoff } from '@shared/naehrstoffe';
import { aufHundert, ZWEIFEL_TEXT, type Zweifel } from '@shared/naehrwertFoto';
import { api } from '../../api';
import { Haken, Wahl, ZahlFeld } from '../../komponenten/Felder';
import { FotoBild } from '../../komponenten/FotoBild';
import { FotoEingang, HandyDialog } from '../../komponenten/FotoEingang';
import { useMeldungen } from '../../komponenten/Meldungen';
import { gehe, pfade } from '../../router';

const PACKUNG = new Set<string>(PACKUNGS_CODES);

const titelFuer: Record<string, string> = { FASAT: 'davon gesättigte Fettsäuren', SUGAR: 'davon Zucker' };

function WertFeld({ n, wert, zweifel, onWert }: { n: Naehrstoff; wert: number | null; zweifel?: Zweifel | undefined; onWert(wert: number | null): void }) {
  return (
    <div className={zweifel ? 'wert-zweifel' : undefined} data-code={n.code}>
      <ZahlFeld
        label={titelFuer[n.code] ?? n.name}
        einheit={n.einheit}
        wert={wert}
        onWert={onWert}
        istErlaubt={(z) => wertErlaubt(n.code, z)}
        fehlerText="Dieser Wert passt nicht."
        leerErlaubt
        stellen={3}
        {...(zweifel ? { hilfe: ZWEIFEL_TEXT[zweifel] } : {})}
      />
    </div>
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

/** Auf der Packung stehen die Werte nur je Portion: Sie werden auf 100 g umgerechnet und bleiben hier zum Nachrechnen. */
interface PortionsWerte {
  gelesen: Readonly<Record<string, number>>;
  menge: number | null;
  name: string | null;
}

/**
 * Neues Lebensmittel, Bearbeiten eines eigenen oder persönliche Version eines BLS-Lebensmittels.
 * `perFoto`: erst das Foto, dann die Prüfseite mit dem Foto neben den erkannten Werten (Bauauftrag 5.3).
 */
export function LebensmittelFormular({ id, perFoto }: { id?: string; perFoto?: boolean }) {
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
  const [barcode, setBarcode] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  // Nur auf der Prüfseite
  const [gelesen, setGelesen] = useState(false);
  const [zweifel, setZweifel] = useState<Record<string, Zweifel>>({});
  const [portion, setPortion] = useState<PortionsWerte | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [barcodeFoto, setBarcodeFoto] = useState<string | null>(null);
  const [fotoBehalten, setFotoBehalten] = useState(true);
  const [getippt, setGetippt] = useState('');
  const [handyOffen, setHandyOffen] = useState(false);
  const [fotoFehler, setFotoFehler] = useState<string | null>(null);
  const fotosOffen = useRef<{ foto: string | null; barcodeFoto: string | null }>({ foto: null, barcodeFoto: null });
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
      setBarcode(lm.barcode ?? '');
      urspruenglichesFoto.current = lm.foto;
    });
    return () => {
      abgebrochen = true;
    };
  }, [id, zeigen]);

  // Geht man auf der Prüfseite woandershin, sollen die Fotos nicht liegen bleiben.
  useEffect(() => {
    if (!perFoto) return;
    return () => {
      const { foto: f, barcodeFoto: b } = fotosOffen.current;
      if (f) api.lebensmittel.fotoVerwerfen(f);
      if (b) api.lebensmittel.fotoVerwerfen(b);
    };
  }, [perFoto]);
  fotosOffen.current = { foto, barcodeFoto };

  const wertSetzen = (code: string, wert: number | null) => {
    setZweifel((alt) => {
      if (alt[code] === undefined) return alt;
      const { [code]: _weg, ...rest } = alt;
      return rest;
    });
    setWerte((alt) => {
      const neu = { ...alt };
      if (wert === null) delete neu[code];
      else neu[code] = wert;
      return neu;
    });
  };

  const portionAendern = (menge: number | null) => {
    if (!portion) return;
    setPortion({ ...portion, menge });
    const umgerechnet = aufHundert(portion.gelesen, 'portion', menge);
    if (umgerechnet) setWerte((alt) => ({ ...alt, ...umgerechnet }));
  };

  /** Was ein Foto ergeben hat, kommt auf die Prüfseite. Die Tabelle von der Packung geht vor dem, was Freiwillige erfasst haben. */
  const fotoUebernehmen = (e: FotoErgebnis) => {
    if (e.zweck !== 'lebensmittel') return;
    const treffer = e.barcode;
    if (treffer?.art === 'eigen') {
      api.lebensmittel.fotoVerwerfen(e.foto);
      zeigen({ art: 'info', text: `Das hast du schon gespeichert: ${treffer.name}.` });
      gehe(pfade.lebensmittel(treffer.id));
      return;
    }
    if (!e.tabelle && !treffer) {
      api.lebensmittel.fotoVerwerfen(e.foto);
      setFotoFehler('Auf diesem Foto habe ich weder eine Nährwerttabelle noch einen Barcode erkannt. Versuch es bitte noch einmal, möglichst gerade und scharf.');
      return;
    }
    setFotoFehler(null);
    if (treffer) produktUebernehmen(treffer);
    if (e.tabelle) {
      const t = e.tabelle;
      const je100 = aufHundert(t.gelesen, t.bezug, t.portionMenge);
      setBasis(t.basis);
      if (je100) setWerte((alt) => ({ ...alt, ...je100 }));
      setZweifel(t.zweifel);
      setPortion(t.bezug === 'portion' ? { gelesen: t.gelesen, menge: t.portionMenge, name: t.portionName } : null);
      if (foto) api.lebensmittel.fotoVerwerfen(foto);
      setFoto(e.foto);
    } else {
      if (barcodeFoto) api.lebensmittel.fotoVerwerfen(barcodeFoto);
      setBarcodeFoto(e.foto);
    }
    setGelesen(true);
  };

  const produktUebernehmen = (treffer: Exclude<NonNullable<Extract<FotoErgebnis, { zweck: 'lebensmittel' }>['barcode']>, { art: 'eigen' }>) => {
    setBarcode(treffer.code);
    if (treffer.art === 'keiner') {
      setHinweis(treffer.kopieDa ? 'Diesen Barcode kenne ich nicht. Mach bitte ein Foto der Nährwerttabelle, dann merkt sich das Lebensmittel seinen Barcode.' : 'Die Offline-Kopie von Open Food Facts fehlt auf diesem Mac. Mach bitte ein Foto der Nährwerttabelle.');
      return;
    }
    const p = treffer.produkt;
    if (p.name) setName((alt) => (alt.trim() === '' ? p.name! : alt));
    if (p.marke) setMarke((alt) => (alt.trim() === '' ? p.marke! : alt));
    const packungsGroesse = packungAus(p.menge);
    if (packungsGroesse) {
      setPackung(packungsGroesse.groesse);
      setBasis(packungsGroesse.basis);
    }
    setWerte((alt) => ({ ...p.werte, ...alt }));
    setHinweis(
      Object.keys(p.werte).length > 0
        ? 'Gefunden in der Offline-Kopie von Open Food Facts. Die Werte haben Freiwillige eingetragen, bitte prüf sie kurz.'
        : 'Gefunden in der Offline-Kopie von Open Food Facts, aber ohne Nährwerte. Mach bitte ein Foto der Nährwerttabelle.',
    );
  };

  const barcodeNachschlagen = () => {
    const code = getippt.trim();
    void api.fotos.barcode(code).then((a) => {
      if (!a.ok) {
        zeigen({ art: 'fehler', text: a.meldung });
        return;
      }
      if (a.wert.art === 'eigen') {
        zeigen({ art: 'info', text: `Das hast du schon gespeichert: ${a.wert.name}.` });
        gehe(pfade.lebensmittel(a.wert.id));
        return;
      }
      produktUebernehmen(a.wert);
      setGelesen(true);
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
    if (barcode.trim() !== '' && !barcodeGueltig(barcode.trim())) {
      setFehler('Der Barcode stimmt nicht. Bitte prüf die Ziffern, oder lass das Feld leer.');
      window.scrollTo(0, 0);
      return;
    }
    if (portion && !portion.menge) {
      setFehler('Bitte trag ein, wie groß eine Portion ist. Sonst lassen sich die Werte nicht auf 100 g umrechnen.');
      window.scrollTo(0, 0);
      return;
    }
    setFehler(null);
    setSpeichert(true);
    const behalten = perFoto && !fotoBehalten ? null : foto;
    const eingabe: LebensmittelEingabe = {
      ...(id ? { id } : {}),
      name,
      marke: marke.trim() === '' ? null : marke,
      basis,
      werte,
      schaetzung,
      nurNatuerlicherZucker: natuerlich,
      packung,
      foto: behalten,
      barcode: barcode.trim() === '' ? null : barcode.trim(),
    };
    void api.lebensmittel.speichern(eingabe).then((antwort) => {
      setSpeichert(false);
      if (!antwort.ok) {
        setFehler(antwort.meldung);
        window.scrollTo(0, 0);
        return;
      }
      // Was jetzt noch nicht zum Lebensmittel gehört, wird weggeräumt. Das Gespeicherte bleibt.
      if (foto && !behalten) api.lebensmittel.fotoVerwerfen(foto);
      if (barcodeFoto) api.lebensmittel.fotoVerwerfen(barcodeFoto);
      fotosOffen.current = { foto: null, barcodeFoto: null };
      setFoto(null);
      setBarcodeFoto(null);
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

  const titel = perFoto ? 'Lebensmittel per Foto' : !id ? 'Neues Lebensmittel' : istVersion ? 'Eigene Version' : 'Lebensmittel bearbeiten';
  const packungsWerte = PACKUNGS_CODES.map((c) => naehrstoff(c)!);
  const anzeigeFoto = foto ?? barcodeFoto;

  const fotoHinweis = fotoFehler && (
    <div className="hinweis hinweis-fehler" role="alert">
      <p>{fotoFehler}</p>
    </div>
  );
  const handyFenster = <HandyDialog offen={handyOffen} zweck="lebensmittel" onSchliessen={() => setHandyOffen(false)} onErgebnis={fotoUebernehmen} />;

  // Erster Schritt: erst das Foto, das Formular kommt danach.
  if (perFoto && !gelesen) {
    return (
      <>
      <main className="seite seite-mittel">
        <a className="zurueck" href={zurueck}>
          <ArrowLeft className="i" aria-hidden /> Zurück
        </a>
        <h1 className="seitentitel">{titel}</h1>
        <p className="einleitung">Fotografiere die Nährwerttabelle oder den Barcode. Starkmacher liest das Foto hier auf dem Mac, und du prüfst danach alles, bevor es gespeichert wird.</p>
        {fotoHinweis}
        <FotoEingang zweck="lebensmittel" onErgebnis={fotoUebernehmen} onHandy={() => setHandyOffen(true)} />
        <form
          className="barcode-tippen"
          onSubmit={(e) => {
            e.preventDefault();
            barcodeNachschlagen();
          }}
        >
          <div className="feld">
            <label htmlFor="barcode-tippen">Oder die Nummer unter dem Barcode eintippen</label>
            <div className="feld-zeile">
              <input id="barcode-tippen" type="text" inputMode="numeric" autoComplete="off" value={getippt} onChange={(e) => setGetippt(e.target.value)} />
              <button type="submit" className="knopf knopf-linie" disabled={getippt.trim() === ''}>
                Nachschlagen
              </button>
            </div>
          </div>
        </form>
        <p className="leise">
          Du hast kein Foto? <a className="verweis" href={pfade.lebensmittelNeu()}>Von Hand anlegen</a>
        </p>
      </main>
      {handyFenster}
      </>
    );
  }

  const formular = (
    <>
      {perFoto && <p className="einleitung">Prüf bitte die erkannten Werte und korrigiere, was nicht stimmt. Gespeichert wird erst, wenn du auf „Speichern“ klickst.</p>}
      {hinweis && <p className="sanft-hinweis pruef-hinweis">{hinweis}</p>}
      {Object.keys(zweifel).length > 0 && <p className="sanft-hinweis pruef-hinweis zweifelnd">Die markierten Werte solltest du dir genauer ansehen.</p>}
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
          <div className="feld">
            <label htmlFor="lm-barcode">Barcode (freiwillig)</label>
            <input id="lm-barcode" type="text" inputMode="numeric" value={barcode} autoComplete="off" onChange={(e) => setBarcode(e.target.value)} />
          </div>
          {!perFoto && <FotoBereich foto={foto} onFoto={fotoWechseln} />}
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
          {portion && (
            <div className="sanft-hinweis portion-hinweis">
              <p>Auf der Packung stehen die Werte {portion.name ? `je ${portion.name}` : 'je Portion'}. Starkmacher rechnet sie auf 100 {basis} um.</p>
              <ZahlFeld label={portion.name ? `So schwer ist ein ${portion.name}` : 'So groß ist eine Portion'} einheit={basis} wert={portion.menge} onWert={portionAendern} istErlaubt={packungErlaubt} fehlerText="Das passt nicht." leerErlaubt stellen={1} />
            </div>
          )}
          <div className="feld-reihe feld-reihe-2">
            {packungsWerte.map((n) => (
              <WertFeld key={n.code} n={n} wert={werte[n.code] ?? null} zweifel={zweifel[n.code]} onWert={(z) => wertSetzen(n.code, z)} />
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
                    <WertFeld key={n.code} n={n} wert={werte[n.code] ?? null} zweifel={zweifel[n.code]} onWert={(z) => wertSetzen(n.code, z)} />
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
    </>
  );

  if (!perFoto) {
    return (
      <main className="seite seite-mittel">
        <a className="zurueck" href={zurueck} onClick={() => fotoWechseln(urspruenglichesFoto.current)}>
          <ArrowLeft className="i" aria-hidden /> Zurück
        </a>
        <h1 className="seitentitel">{titel}</h1>
        {formular}
      </main>
    );
  }

  return (
    <>
    <main className="seite seite-breit">
      <a className="zurueck" href={zurueck}>
        <ArrowLeft className="i" aria-hidden /> Zurück
      </a>
      <h1 className="seitentitel">{titel}</h1>
      <div className="pruefseite">
        <aside className="pruef-spalte" aria-label="Foto">
          {anzeigeFoto && <FotoBild name={anzeigeFoto} text="Dein Foto" klasse="pruef-foto" />}
          {foto && <Haken label="Foto beim Lebensmittel aufheben" wert={fotoBehalten} onWert={setFotoBehalten} />}
          {fotoHinweis}
          <FotoEingang zweck="lebensmittel" klein onErgebnis={fotoUebernehmen} onHandy={() => setHandyOffen(true)} />
        </aside>
        <div className="stapel">{formular}</div>
      </div>
    </main>
    {handyFenster}
    </>
  );
}
