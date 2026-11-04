import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ImagePlus, LoaderCircle, Pencil, Plus, Search, StickyNote, Tags, X } from 'lucide-react';
import type { FotoErgebnis, ZutatVorschlag } from '@shared/api';
import { zahlText } from '@shared/format';
import { jePortion, portionenErlaubt, rezeptSumme, type RezeptEingabe, type RezeptZutat, type ZutatStand } from '@shared/rezepte';
import { mengenText } from '@shared/tagebuch';
import { api } from '../../api';
import { ZahlFeld } from '../../komponenten/Felder';
import { FotoBild } from '../../komponenten/FotoBild';
import { FotoEingang, HandyDialog } from '../../komponenten/FotoEingang';
import { useMeldungen } from '../../komponenten/Meldungen';
import { ZutatDialog, type GewaehlteZutat } from '../../komponenten/ZutatDialog';
import { gehe, pfade } from '../../router';
import { HashtagDialog, HashtagWahl, useHashtags } from './Hashtags';

const neueId = () => `z-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Was von einem Foto zu einer Zutat bekannt ist: die Zeile, warum sie unklar ist, und die Alternativen. */
interface Pruefung {
  zeile: string;
  unklar: string | null;
  alternativen: ZutatVorschlag['alternativen'];
}

/**
 * Neues Rezept, Bearbeiten oder eine Variante („Als neues Rezept speichern“).
 * `perFoto`: erst das Foto, dann die Prüfseite mit dem Foto neben den erkannten Zutaten (Bauauftrag Abschnitt 6).
 */
export function RezeptFormular({ id, alsKopie, perFoto }: { id?: string; alsKopie?: boolean; perFoto?: boolean }) {
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
  // Nur auf der Prüfseite
  const [gelesen, setGelesen] = useState(false);
  const [pruefungen, setPruefungen] = useState<Record<string, Pruefung>>({});
  const [ungeklaert, setUngeklaert] = useState<(ZutatVorschlag & { id: string })[]>([]);
  const [klaeren, setKlaeren] = useState<(ZutatVorschlag & { id: string }) | null>(null);
  const [handyOffen, setHandyOffen] = useState(false);
  const [fotoFehler, setFotoFehler] = useState<string | null>(null);
  const fotosOffen = useRef<string[]>([]);
  fotosOffen.current = fotos;
  const gespeichert = useRef(false);

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

  // Geht man auf der Prüfseite woandershin, sollen die Fotos nicht liegen bleiben.
  useEffect(() => {
    if (!perFoto) return;
    return () => {
      if (!gespeichert.current) for (const f of fotosOffen.current) api.lebensmittel.fotoVerwerfen(f);
    };
  }, [perFoto]);

  const zutatUebernehmen = (z: GewaehlteZutat, alt: RezeptZutat | null) => {
    const neu: RezeptZutat = { id: alt?.id ?? neueId(), lebensmittelId: z.lebensmittelId, name: z.name, menge: z.menge, einheit: z.einheit, groesse: z.groesse };
    setZutaten((liste) => (alt ? liste.map((x) => (x.id === alt.id ? neu : x)) : [...liste, neu]));
    // Geändert heißt geprüft: Die Markierung fällt weg, die Zeile vom Foto bleibt.
    if (alt) setPruefungen((p) => (p[alt.id] ? { ...p, [alt.id]: { ...p[alt.id]!, unklar: null } } : p));
    setZutatOffen(null);
    setFehler(null);
  };

  /** Was ein Foto ergeben hat, kommt dazu. Mehrere Fotos ergeben zusammen ein Rezept, Eingetipptes bleibt stehen. */
  const fotoUebernehmen = (e: FotoErgebnis) => {
    if (e.zweck !== 'rezept') return;
    const r = e.rezept;
    if (r.zutaten.length === 0 && r.zubereitung === '' && r.name === '') {
      api.lebensmittel.fotoVerwerfen(e.foto);
      setFotoFehler('Auf diesem Foto habe ich kein Rezept erkannt. Versuch es bitte noch einmal, möglichst gerade und scharf.');
      return;
    }
    setFotoFehler(null);
    setFotos((liste) => [...liste, e.foto]);
    setName((alt) => (alt.trim() === '' ? r.name : alt));
    if (r.portionen) setPortionen(r.portionen);
    const neue: RezeptZutat[] = [];
    const offen: (ZutatVorschlag & { id: string })[] = [];
    const pruefung: Record<string, Pruefung> = {};
    for (const z of r.zutaten) {
      const zid = neueId();
      if (z.lebensmittelId && z.lebensmittelName && z.menge !== null && z.einheit) {
        neue.push({ id: zid, lebensmittelId: z.lebensmittelId, name: z.lebensmittelName, menge: z.menge, einheit: z.einheit, groesse: z.groesse });
        pruefung[zid] = { zeile: z.zeile, unklar: z.unklar, alternativen: z.alternativen };
      } else {
        offen.push({ ...z, id: zid });
      }
    }
    setZutaten((liste) => [...liste, ...neue]);
    setUngeklaert((liste) => [...liste, ...offen]);
    setPruefungen((p) => ({ ...p, ...pruefung }));
    if (r.zubereitung !== '') setZubereitung((alt) => (alt.trim() === '' ? r.zubereitung : `${alt.trimEnd()}\n${r.zubereitung}`));
    setGelesen(true);
  };

  const alternativeWaehlen = (z: RezeptZutat, wahl: string) => {
    const neu = pruefungen[z.id]?.alternativen.find((a) => a.id === wahl);
    if (!neu) return;
    setZutaten((liste) => liste.map((x) => (x.id === z.id ? { ...x, lebensmittelId: neu.id, name: neu.name } : x)));
    setPruefungen((p) => ({ ...p, [z.id]: { ...p[z.id]!, unklar: null } }));
  };

  const ungeklaertWeg = (zid: string) => setUngeklaert((liste) => liste.filter((u) => u.id !== zid));

  const alsNotizBehalten = (u: ZutatVorschlag & { id: string }) => {
    setNotiz((alt) => (alt.trim() === '' ? u.zeile : `${alt.trimEnd()}\n${u.zeile}`));
    ungeklaertWeg(u.id);
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
    if (ungeklaert.length > 0) {
      setFehler(`Bitte kläre noch ${ungeklaert.length === 1 ? 'eine Zutat' : `${ungeklaert.length} Zutaten`}: wählen, als Notiz behalten oder entfernen.`);
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
      gespeichert.current = true;
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

  const titel = perFoto ? 'Rezept per Foto' : alsKopie ? 'Als neues Rezept speichern' : bearbeitet ? 'Rezept bearbeiten' : 'Neues Rezept';
  const zeileFuer = (z: RezeptZutat) => stand.find((s) => s.zutat.id === z.id);

  const fotoHinweis = fotoFehler && (
    <div className="hinweis hinweis-fehler" role="alert">
      <p>{fotoFehler}</p>
    </div>
  );
  const handyFenster = <HandyDialog offen={handyOffen} zweck="rezept" onSchliessen={() => setHandyOffen(false)} onErgebnis={fotoUebernehmen} />;

  // Erster Schritt: erst das Foto, das Formular kommt danach.
  if (perFoto && !gelesen) {
    return (
      <>
      <main className="seite seite-mittel">
        <a className="zurueck" href={zurueck}>
          <ArrowLeft className="i" aria-hidden /> Zurück
        </a>
        <h1 className="seitentitel">{titel}</h1>
        <p className="einleitung">Fotografiere das Rezept oder die Zutatenliste eines Gerichts. Starkmacher liest das Foto hier auf dem Mac, und du prüfst danach alles, bevor es gespeichert wird. Bei mehreren Seiten schickst du einfach mehrere Fotos.</p>
        {fotoHinweis}
        <FotoEingang zweck="rezept" text="Zieh ein oder mehrere Fotos hierher, oder wähle eins aus." onErgebnis={fotoUebernehmen} onHandy={() => setHandyOffen(true)} />
        <p className="leise">
          Du hast kein Foto? <a className="verweis" href={pfade.rezeptNeu()}>Von Hand anlegen</a>
        </p>
      </main>
      {handyFenster}
      </>
    );
  }

  const formular = (
    <>
      {perFoto && <p className="einleitung">Prüf bitte Name, Zutaten und Zubereitung. Gespeichert wird erst, wenn du auf „Speichern“ klickst.</p>}
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
          {ungeklaert.length > 0 && (
            <div className="zutaten-offen" aria-label="Noch zu klären">
              {ungeklaert.map((u) => (
                <div key={u.id} className="zutat-offen">
                  <div className="zutat-offen-text">
                    <b>{u.zeile}</b>
                    <small>{u.unklar ?? `Dazu habe ich nichts Passendes gefunden: „${u.name}“.`}</small>
                  </div>
                  <div className="knopfreihe">
                    <button type="button" className="knopf knopf-linie knopf-klein" onClick={() => setKlaeren(u)}>
                      <Search className="i" aria-hidden /> Zutat wählen
                    </button>
                    <button type="button" className="knopf knopf-leise knopf-klein" onClick={() => alsNotizBehalten(u)}>
                      <StickyNote className="i" aria-hidden /> Als Notiz behalten
                    </button>
                    <button type="button" className="symbolknopf" aria-label={`${u.zeile} entfernen`} onClick={() => ungeklaertWeg(u.id)}>
                      <X className="i" aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {zutaten.length > 0 && (
            <div className="zutaten-formular">
              {zutaten.map((z) => {
                const s = zeileFuer(z);
                const p = pruefungen[z.id];
                return (
                  <div key={z.id} className={`zutat-zeile${p?.unklar || s?.problem ? ' zutat-unklar' : ''}`}>
                    <span className="zutat-menge">{s?.bestandteil ? mengenText(s.bestandteil) : `${zahlText(z.menge, 2)} ${z.einheit}`}</span>
                    <span className="zutat-name">
                      {p && p.alternativen.length > 1 ? (
                        <select className="zutat-wahl" aria-label={`Eintrag für ${p.zeile}`} value={z.lebensmittelId} onChange={(e) => alternativeWaehlen(z, e.target.value)}>
                          {p.alternativen.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        z.name
                      )}
                      {s?.problem === 'gibt-es-nicht-mehr' && <small className="zeile-fehlt"> Dieses Lebensmittel gibt es nicht mehr, bitte ersetzen.</small>}
                      {s?.problem === 'gewicht-fehlt' && <small className="zeile-fehlt"> Für diese Einheit fehlt ein Gewicht.</small>}
                      {p && <small className="zutat-foto">Auf dem Foto: {p.zeile}</small>}
                      {p?.unklar && <small className="zutat-grund">{p.unklar}</small>}
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

        {!perFoto && (
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
        )}

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
        offen={klaeren !== null}
        titel={klaeren ? `Zutat wählen: ${klaeren.zeile}` : 'Zutat wählen'}
        {...(klaeren ? { suchText: klaeren.name } : {})}
        onSchliessen={() => setKlaeren(null)}
        onFertig={(z) => {
          if (klaeren) {
            const zid = neueId();
            setZutaten((liste) => [...liste, { id: zid, lebensmittelId: z.lebensmittelId, name: z.name, menge: z.menge, einheit: z.einheit, groesse: z.groesse }]);
            setPruefungen((p) => ({ ...p, [zid]: { zeile: klaeren.zeile, unklar: null, alternativen: [] } }));
            ungeklaertWeg(klaeren.id);
            setKlaeren(null);
            setFehler(null);
          }
        }}
      />
      <ZutatDialog
        offen={zutatOffen !== null}
        titel={zutatOffen?.bearbeiten ? 'Zutat ändern' : 'Zutat hinzufügen'}
        start={zutatOffen?.bearbeiten ? { lebensmittelId: zutatOffen.bearbeiten.lebensmittelId, menge: zutatOffen.bearbeiten.menge, einheit: zutatOffen.bearbeiten.einheit, groesse: zutatOffen.bearbeiten.groesse } : null}
        onSchliessen={() => setZutatOffen(null)}
        onFertig={(z) => zutatUebernehmen(z, zutatOffen?.bearbeiten ?? null)}
      />
      <HashtagDialog offen={hashtagsOffen} hashtags={hashtags} onSchliessen={() => setHashtagsOffen(false)} onGeaendert={neuLaden} />
    </>
  );

  if (!perFoto) {
    return (
      <main className="seite seite-mittel">
        <a className="zurueck" href={zurueck} onClick={abbrechen}>
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
        <aside className="pruef-spalte" aria-label="Fotos">
          {fotos.map((f) => (
            <div key={f} className="foto-kachel">
              <FotoBild name={f} text="Dein Foto" klasse="pruef-foto" />
              <button type="button" className="symbolknopf foto-weg" aria-label="Foto entfernen" onClick={() => fotoWeg(f)}>
                <X className="i" aria-hidden />
              </button>
            </div>
          ))}
          <p className="leise">Die Fotos bleiben beim Rezept. Mit dem Kreuz nimmst du eins heraus.</p>
          {fotoHinweis}
          <FotoEingang zweck="rezept" klein onErgebnis={fotoUebernehmen} onHandy={() => setHandyOffen(true)} />
        </aside>
        <div className="stapel">{formular}</div>
      </div>
    </main>
    {handyFenster}
    </>
  );
}
