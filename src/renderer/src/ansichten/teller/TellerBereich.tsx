import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, LoaderCircle, Pencil, Plus, Search, Trash2, TriangleAlert, Utensils, X, BookPlus } from 'lucide-react';
import { inGramm, istUngefaehr, type Groesse, type MengenEinheit, type Umrechnung } from '@shared/einheiten';
import { zahlText } from '@shared/format';
import { werteJe100g, type Lebensmittel } from '@shared/lebensmittel';
import { istRezeptId, jePortion, rezeptSumme, type RezeptAnsicht } from '@shared/rezepte';
import { mengenText } from '@shared/tagebuch';
import { nachRollen, ROLLEN, tellerInhalt, tellerSumme, type PostenStand, type Rolle, type TellerKurz, type TellerPosten } from '@shared/teller';
import { api } from '../../api';
import { useDaten } from '../../daten/DatenKontext';
import { Dialog, Rueckfrage } from '../../komponenten/Dialog';
import { InsTagebuchDialog } from '../../komponenten/InsTagebuchDialog';
import { LebensmittelWahl } from '../../komponenten/LebensmittelWahl';
import { Mengenwahl, startMenge, type Mengenstand } from '../../komponenten/Mengenwahl';
import { useMeldungen } from '../../komponenten/Meldungen';
import { SummenKopf, SummenTabelle } from '../../komponenten/SummenTabelle';
import { gehe, pfade } from '../../router';
import { PortionenWahl } from '../tagebuch/EintragDialoge';

const neueId = () => `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function TellerBereich({ unter }: { unter: readonly string[] }) {
  const [erstes] = unter;
  if (erstes === 'neu') return <TellerSeite key="neu" />;
  if (erstes) return <TellerSeite key={erstes} id={erstes} />;
  return <TellerListe />;
}

/** Bleibt erhalten, wenn man einen Teller öffnet und zurückkommt. */
let letzteSuche = '';

function TellerListe() {
  const { zeigen } = useMeldungen();
  const [text, setText] = useState(letzteSuche);
  const [liste, setListe] = useState<TellerKurz[] | null>(null);

  useEffect(() => {
    letzteSuche = text;
    let abgebrochen = false;
    const uhr = setTimeout(() => {
      void api.teller.liste(text).then((a) => {
        if (abgebrochen) return;
        if (a.ok) setListe(a.wert);
        else zeigen({ art: 'fehler', text: a.meldung });
      });
    }, 100);
    return () => {
      abgebrochen = true;
      clearTimeout(uhr);
    };
  }, [text, zeigen]);

  return (
    <main className="seite seite-mittel">
      <div className="kopf-reihe">
        <h1 className="seitentitel">Teller</h1>
        <a className="knopf knopf-akzent" href={pfade.tellerNeu()}>
          <Plus className="i" aria-hidden /> Neuer Teller
        </a>
      </div>
      <section className="karte suche-karte">
        <div className="suchfeld">
          <Search className="i" aria-hidden />
          <input type="text" value={text} placeholder="Teller suchen" aria-label="Teller suchen" autoComplete="off" onChange={(e) => setText(e.target.value)} />
          {text && (
            <button type="button" className="symbolknopf" aria-label="Suche leeren" onClick={() => setText('')}>
              <X className="i" aria-hidden />
            </button>
          )}
        </div>
      </section>
      {liste && liste.length > 0 && (
        <section className="rezept-karten" aria-label="Deine Teller">
          {liste.map((t) => (
            <a key={t.id} className="rezept-karte" href={pfade.teller(t.id)}>
              <div className="rezept-karte-text">
                <b>{t.name}</b>
                <small className="leise">{t.inhalt}</small>
                <small className="leise">
                  {t.kcal !== null && `${zahlText(t.kcal)} kcal`}
                  {t.eiweiss !== null && ` · ${zahlText(t.eiweiss)} g Eiweiß`}
                </small>
              </div>
            </a>
          ))}
        </section>
      )}
      {liste && liste.length === 0 && (
        <section className="karte kommt-bald">
          {text.trim() !== '' ? (
            <p>Dazu passt gerade kein Teller.</p>
          ) : (
            <>
              <p>Hier stellst du einfache Mahlzeiten zusammen, zum Beispiel Nudeln mit veganem Steak und Soße.</p>
              <p className="leise">Du kannst sie mit Namen aufheben oder gleich ins Tagebuch übernehmen.</p>
            </>
          )}
        </section>
      )}
    </main>
  );
}

function PostenDialog(props: { offen: boolean; rolle: Rolle; start: TellerPosten | null; onSchliessen(): void; onFertig(p: TellerPosten): void }) {
  const { offen, start } = props;
  const { stand } = useDaten();
  const { zeigen } = useMeldungen();
  const [lm, setLm] = useState<Lebensmittel | null>(null);
  const [rezept, setRezept] = useState<RezeptAnsicht | null>(null);
  const [mengen, setMengen] = useState<Mengenstand>({ menge: 100, einheit: 'g', groesse: 'M' });
  const [portionen, setPortionen] = useState<number | null>(1);
  const [rolle, setRolle] = useState<Rolle>(props.rolle);
  const mitGroessen = stand?.profil.stueckware !== 'gramm';

  const waehlen = (id: string, vorgabe?: { menge: number; einheit: MengenEinheit; groesse: Groesse }) => {
    if (istRezeptId(id)) {
      void api.rezepte.holen(id).then((a) => {
        if (a.ok && a.wert) setRezept(a.wert);
        else zeigen({ art: 'fehler', text: a.ok ? 'Dieses Rezept gibt es nicht mehr.' : a.meldung });
      });
      return;
    }
    void api.lebensmittel.holen(id).then((a) => {
      if (!a.ok || !a.wert) {
        zeigen({ art: 'fehler', text: a.ok ? 'Dieses Lebensmittel gibt es nicht mehr.' : a.meldung });
        return;
      }
      setLm(a.wert);
      setMengen(vorgabe ?? startMenge(a.wert.umrechnung, a.wert.basis, mitGroessen));
    });
  };

  useEffect(() => {
    if (!offen) return;
    setLm(null);
    setRezept(null);
    setRolle(start?.rolle ?? props.rolle);
    setPortionen(start && istRezeptId(start.bezugId) ? start.menge : 1);
    if (start) waehlen(start.bezugId, start.einheit === 'Portion' || start.einheit === 'Teller' ? undefined : { menge: start.menge, einheit: start.einheit, groesse: start.groesse ?? 'M' });
    // Nur beim Öffnen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offen]);

  const umrechnungSetzen = (u: Umrechnung) => {
    if (!lm) return;
    void api.lebensmittel.umrechnungSpeichern(lm.id, u).then((a) => {
      if (a.ok) setLm(a.wert);
      else zeigen({ art: 'fehler', text: a.meldung });
    });
  };

  const gramm = lm && mengen.menge !== null ? inGramm(mengen.menge, mengen.einheit, lm.umrechnung, mengen.groesse) : null;
  const id = start?.id ?? neueId();

  const fertig = () => {
    if (rezept) {
      if (portionen !== null) props.onFertig({ id, bezugId: rezept.rezept.id, name: rezept.rezept.name, menge: portionen, einheit: 'Portion', groesse: null, rolle });
      return;
    }
    if (!lm || mengen.menge === null || gramm === null) return;
    props.onFertig({ id, bezugId: lm.id, name: lm.name, menge: mengen.menge, einheit: mengen.einheit, groesse: mengen.einheit === 'Stück' && lm.umrechnung.groessen ? mengen.groesse : null, rolle });
  };

  const gewaehlt = lm !== null || rezept !== null;
  const portion = rezept ? jePortion(rezeptSumme(rezept.zutaten), rezept.rezept.portionen).werte.ENERCC!.menge : null;
  const kcal = lm && gramm !== null ? werteJe100g(lm).ENERCC : undefined;
  return (
    <Dialog
      titel={start ? 'Bestandteil ändern' : 'Auf den Teller legen'}
      offen={offen}
      breit
      onSchliessen={props.onSchliessen}
      onAbsenden={fertig}
      knoepfe={
        gewaehlt ? (
          <>
            {!start && (
              <button
                type="button"
                className="knopf knopf-linie"
                onClick={() => {
                  setLm(null);
                  setRezept(null);
                }}
              >
                <ArrowLeft className="i" aria-hidden /> Andere Auswahl
              </button>
            )}
            <button type="submit" className="knopf knopf-akzent" disabled={rezept ? portionen === null : mengen.menge === null || gramm === null}>
              Übernehmen
            </button>
          </>
        ) : undefined
      }
    >
      {gewaehlt ? (
        <div className="stapel">
          <b className="eintrag-name">{lm?.name ?? rezept?.rezept.name}</b>
          {lm && <Mengenwahl umrechnung={lm.umrechnung} stand={mengen} mitGroessen={mitGroessen} onStand={setMengen} onUmrechnung={umrechnungSetzen} />}
          {rezept && <PortionenWahl wert={portionen} onWert={setPortionen} />}
          <div className="feld">
            <label htmlFor="posten-rolle">Rolle auf dem Teller</label>
            <select id="posten-rolle" value={rolle} onChange={(e) => setRolle(e.target.value as Rolle)}>
              {ROLLEN.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.titel}
                </option>
              ))}
            </select>
          </div>
          {lm && gramm !== null && (
            <p className="eintrag-vorschau">
              {istUngefaehr(mengen.einheit) && <b>≈ {zahlText(gramm, gramm < 10 ? 1 : 0)} g: </b>}
              {kcal === undefined ? '–' : zahlText((kcal * gramm) / 100)} kcal
            </p>
          )}
          {rezept && portion !== null && portionen !== null && <p className="eintrag-vorschau">{zahlText(portion * portionen)} kcal</p>}
        </div>
      ) : (
        offen && <LebensmittelWahl key={String(offen)} mitRezepten onWahl={(i) => waehlen(i)} />
      )}
    </Dialog>
  );
}

function postenText(s: PostenStand): string {
  if (s.bestandteile.length === 1 && s.posten.einheit !== 'Portion') return mengenText(s.bestandteile[0]!);
  const gramm = s.bestandteile.reduce((summe, b) => summe + b.gramm, 0);
  return mengenText({ menge: s.posten.menge, einheit: s.posten.einheit, groesse: s.posten.groesse, gramm });
}

/** Ein Teller, nach Rollen geordnet. Er lässt sich mit Namen aufheben oder gleich ins Tagebuch übernehmen (Bauauftrag Abschnitt 7). */
function TellerSeite({ id }: { id?: string }) {
  const { zeigen } = useMeldungen();
  const [laedt, setLaedt] = useState(id !== undefined);
  const [name, setName] = useState('');
  const [posten, setPosten] = useState<TellerPosten[]>([]);
  const [stand, setStand] = useState<PostenStand[]>([]);
  const [dialog, setDialog] = useState<{ rolle: Rolle; start: TellerPosten | null } | null>(null);
  const [tagebuch, setTagebuch] = useState(false);
  const [rueckfrage, setRueckfrage] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let abgebrochen = false;
    void api.teller.holen(id).then((a) => {
      if (abgebrochen) return;
      setLaedt(false);
      if (!a.ok || !a.wert) {
        zeigen({ art: 'fehler', text: a.ok ? 'Diesen Teller gibt es nicht mehr.' : a.meldung });
        gehe(pfade.reiter('teller'));
        return;
      }
      setName(a.wert.teller.name);
      setPosten(a.wert.teller.posten);
    });
    return () => {
      abgebrochen = true;
    };
  }, [id, zeigen]);

  useEffect(() => {
    let abgebrochen = false;
    void api.teller.vorschau(posten).then((a) => {
      if (!abgebrochen && a.ok) setStand(a.wert);
    });
    return () => {
      abgebrochen = true;
    };
  }, [posten]);

  const summe = useMemo(() => tellerSumme(stand), [stand]);
  const staende = new Map(stand.map((s) => [s.posten.id, s]));
  const probleme = stand.filter((s) => s.problem);

  const uebernehmen = (p: TellerPosten) => {
    setPosten((liste) => (liste.some((x) => x.id === p.id) ? liste.map((x) => (x.id === p.id ? p : x)) : [...liste, p]));
    setDialog(null);
    setFehler(null);
  };

  const speichern = () => {
    if (name.trim() === '') {
      setFehler('Bitte gib dem Teller einen Namen, damit du ihn wiederfindest.');
      window.scrollTo(0, 0);
      return;
    }
    if (posten.length === 0) {
      setFehler('Bitte leg mindestens etwas auf den Teller.');
      window.scrollTo(0, 0);
      return;
    }
    void api.teller.speichern({ ...(id ? { id } : {}), name, posten }).then((a) => {
      if (!a.ok) {
        setFehler(a.meldung);
        window.scrollTo(0, 0);
        return;
      }
      setFehler(null);
      zeigen({ art: 'info', text: 'Teller gespeichert.' });
      if (!id) gehe(pfade.teller(a.wert.teller.id));
    });
  };

  if (laedt) {
    return (
      <main className="seite seite-schmal mitte">
        <LoaderCircle className="i gross dreht" aria-hidden />
      </main>
    );
  }

  const gruppen = nachRollen(posten);
  const leereRollen = ROLLEN.filter((r) => !gruppen.some((g) => g.rolle === r.id));
  return (
    <main className="seite">
      <a className="zurueck" href={pfade.reiter('teller')}>
        <ArrowLeft className="i" aria-hidden /> Zu den Tellern
      </a>
      <div className="kopf-reihe">
        <h1 className="seitentitel">{id ? name || 'Teller' : 'Neuer Teller'}</h1>
        <button
          type="button"
          className="knopf knopf-akzent"
          disabled={posten.length === 0}
          onClick={() => setTagebuch(true)}
        >
          <BookPlus className="i" aria-hidden /> Ins Tagebuch
        </button>
      </div>
      {fehler && (
        <div className="hinweis hinweis-fehler" role="alert">
          <p>{fehler}</p>
        </div>
      )}

      <div className="spalten spalten-detail">
        <div className="stapel">
          <section className="karte form-karte">
            <div className="feld">
              <label htmlFor="teller-name">Name</label>
              <input
                id="teller-name"
                type="text"
                value={name}
                autoFocus={!id}
                autoComplete="off"
                placeholder={posten.length > 0 ? tellerInhalt(posten) : 'Zum Beispiel Nudeln mit Steak'}
                onChange={(e) => {
                  setName(e.target.value);
                  if (e.target.value.trim() !== '') setFehler(null);
                }}
              />
              <p className="feld-hilfe">Nur nötig, wenn du den Teller aufheben möchtest.</p>
            </div>
          </section>

          {probleme.length > 0 && (
            <div className="hinweis hinweis-fehler" role="alert">
              <TriangleAlert className="i" aria-hidden />
              <p>Ohne {probleme.map((p) => `„${p.posten.name}“`).join(', ')} gerechnet: Das gibt es nicht mehr, oder für die Einheit fehlt ein Gewicht.</p>
            </div>
          )}

          {gruppen.map((g) => (
            <section key={g.rolle} className="karte teller-rolle" aria-label={g.titel}>
              <div className="teller-rolle-kopf">
                <h2>{g.titel}</h2>
                <button type="button" className="dazu" aria-label={`${g.titel}: noch etwas dazu`} onClick={() => setDialog({ rolle: g.rolle, start: null })}>
                  <Plus className="i" aria-hidden /> Dazu
                </button>
              </div>
              {g.eintraege.map((p) => {
                const s = staende.get(p.id);
                return (
                  <div key={p.id} className="zutat-zeile">
                    <span className="zutat-menge">{s ? postenText(s) : ''}</span>
                    <span className="zutat-name">
                      {p.name}
                      {istRezeptId(p.bezugId) && <span className="art-chip art-chip-nach">Rezept</span>}
                    </span>
                    <button type="button" className="symbolknopf" aria-label={`${p.name} ändern`} onClick={() => setDialog({ rolle: p.rolle, start: p })}>
                      <Pencil className="i" aria-hidden />
                    </button>
                    <button type="button" className="symbolknopf" aria-label={`${p.name} entfernen`} onClick={() => setPosten((liste) => liste.filter((x) => x.id !== p.id))}>
                      <X className="i" aria-hidden />
                    </button>
                  </div>
                );
              })}
            </section>
          ))}

          <section className="karte" aria-label="Auf den Teller legen">
            <h2>{posten.length === 0 ? 'Was kommt auf den Teller?' : 'Noch etwas dazu?'}</h2>
            <div className="rollen-knoepfe">
              {leereRollen.map((r) => (
                <button key={r.id} type="button" className="knopf knopf-linie" onClick={() => setDialog({ rolle: r.id, start: null })}>
                  <Plus className="i" aria-hidden /> {r.titel}
                </button>
              ))}
            </div>
          </section>

          <div className="knopfreihe">
            <button type="button" className="knopf knopf-akzent" onClick={speichern}>
              Speichern
            </button>
            {id && (
              <button type="button" className="knopf knopf-leise" onClick={() => setRueckfrage(true)}>
                <Trash2 className="i" aria-hidden /> Löschen
              </button>
            )}
          </div>
        </div>

        <div className="stapel">
          {posten.length === 0 ? (
            <section className="karte kommt-bald">
              <Utensils className="i gross" aria-hidden />
              <p>Sobald etwas auf dem Teller liegt, siehst du hier alle Nährwerte.</p>
            </section>
          ) : (
            <>
              <section className="karte" aria-label="Der ganze Teller">
                <h2>Der ganze Teller</h2>
                <SummenKopf summe={summe} />
              </section>
              <SummenTabelle menge={summe} spalteMenge="Teller" />
            </>
          )}
        </div>
      </div>

      <PostenDialog offen={dialog !== null} rolle={dialog?.rolle ?? 'hauptsache'} start={dialog?.start ?? null} onSchliessen={() => setDialog(null)} onFertig={uebernehmen} />
      <InsTagebuchDialog
        offen={tagebuch}
        einheit="Teller"
        onSchliessen={() => setTagebuch(false)}
        onEintragen={({ datum, mahlzeit, menge }) => {
          void api.tagebuch.tellerEintragen({ datum, mahlzeit, menge, name: name.trim() || tellerInhalt(posten), posten, ...(id ? { tellerId: id } : {}) }).then((a) => {
            if (!a.ok) {
              zeigen({ art: 'fehler', text: a.meldung });
              return;
            }
            setTagebuch(false);
            gehe(pfade.tagebuchTag(datum));
          });
        }}
      />
      <Rueckfrage
        offen={rueckfrage}
        titel="Teller löschen?"
        text={`„${name}“ wird gelöscht. Das lässt sich nur über eine Sicherung rückgängig machen. Vergangene Tage im Tagebuch bleiben, wie sie sind.`}
        bestaetigen="Löschen"
        onAbbrechen={() => setRueckfrage(false)}
        onBestaetigen={() => {
          if (!id) return;
          void api.teller.loeschen(id).then((a) => {
            setRueckfrage(false);
            if (!a.ok) {
              zeigen({ art: 'fehler', text: a.meldung });
              return;
            }
            zeigen({ art: 'info', text: 'Teller gelöscht.' });
            gehe(pfade.reiter('teller'));
          });
        }}
      />
    </main>
  );
}
