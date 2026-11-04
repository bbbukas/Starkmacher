import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, LoaderCircle, Plus, Trash2, X } from 'lucide-react';
import { inGramm, istUngefaehr, type Groesse, type MengenEinheit, type Umrechnung } from '@shared/einheiten';
import { zahlText } from '@shared/format';
import { werteJe100g, type Lebensmittel, type LebensmittelKurz } from '@shared/lebensmittel';
import { istRezeptId, jePortion, rezeptSumme, type RezeptAnsicht } from '@shared/rezepte';
import { MAHLZEITEN, type BestandteilAenderung, type Mahlzeit, type TagebuchEintrag } from '@shared/tagebuch';
import { istTellerId, nachRollen, tellerSumme, type Rolle, type TellerAnsicht } from '@shared/teller';
import { api } from '../../api';
import { useDaten } from '../../daten/DatenKontext';
import { Dialog } from '../../komponenten/Dialog';
import { ZahlFeld } from '../../komponenten/Felder';
import { LebensmittelWahl } from '../../komponenten/LebensmittelWahl';
import { Mengenwahl, startMenge, type Mengenstand } from '../../komponenten/Mengenwahl';
import { useMeldungen } from '../../komponenten/Meldungen';
import { ZutatDialog } from '../../komponenten/ZutatDialog';

const eineStelle = (z: number) => zahlText(z, z < 10 ? 1 : 0);

function NaehrwertSatz({ kcal, eiweiss, fett, kohlenhydrate, vorn }: { kcal: number | null; eiweiss: number | null; fett: number | null; kohlenhydrate: number | null; vorn?: string }) {
  const g = (z: number | null) => (z === null ? '–' : `${eineStelle(z)} g`);
  return (
    <p className="eintrag-vorschau">
      {vorn && <b>{vorn}: </b>}
      {kcal === null ? '–' : zahlText(kcal)} kcal · Eiweiß {g(eiweiss)} · Fett {g(fett)} · Kohlenhydrate {g(kohlenhydrate)}
    </p>
  );
}

function Vorschau({ werte, gramm, einheitUngefaehr }: { werte: Readonly<Record<string, number>>; gramm: number | null; einheitUngefaehr: boolean }) {
  if (gramm === null) return null;
  const menge = (code: string) => (werte[code] === undefined ? null : (werte[code]! * gramm) / 100);
  return <NaehrwertSatz kcal={menge('ENERCC')} eiweiss={menge('PROT625')} fett={menge('FAT')} kohlenhydrate={menge('CHO')} {...(einheitUngefaehr ? { vorn: `≈ ${eineStelle(gramm)} g` } : {})} />;
}

const PORTIONEN = [
  { wert: 0.5, text: '½' },
  { wert: 1, text: '1' },
  { wert: 1.5, text: '1½' },
  { wert: 2, text: '2' },
];

/** Portionen oder Teller wählen: die üblichen mit einem Klick, jede andere als Zahl. */
export function PortionenWahl({ wert, onWert, titel = 'Portionen' }: { wert: number | null; onWert(wert: number | null): void; titel?: 'Portionen' | 'Teller' }) {
  return (
    <div className="portionen-wahl">
      <ZahlFeld label={titel} wert={wert} onWert={onWert} istErlaubt={(z) => z > 0 && z <= 200} fehlerText="Bitte eine Zahl über 0 eintragen." leerErlaubt stellen={2} />
      <div className="filter" role="group" aria-label={`Übliche Menge: ${titel}`}>
        {PORTIONEN.map((p) => (
          <button key={p.wert} type="button" className={`filter-knopf${wert === p.wert ? ' gewaehlt' : ''}`} aria-label={`${p.text} ${titel}`} onClick={() => onWert(p.wert)}>
            {p.text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Eintragen in zwei Schritten: auswählen, dann die Menge oder die Portionen. Zuletzt Gegessenes steht oben. */
export function EintragenDialog(props: { offen: boolean; datum: string; mahlzeit: Mahlzeit; onSchliessen(): void; onFertig(): void }) {
  const { offen, datum, mahlzeit } = props;
  const { stand } = useDaten();
  const { zeigen } = useMeldungen();
  const [zuletzt, setZuletzt] = useState<LebensmittelKurz[]>([]);
  const [lm, setLm] = useState<Lebensmittel | null>(null);
  const [rezept, setRezept] = useState<RezeptAnsicht | null>(null);
  const [teller, setTeller] = useState<TellerAnsicht | null>(null);
  const [mengen, setMengen] = useState<Mengenstand>({ menge: 100, einheit: 'g', groesse: 'M' });
  const [portionen, setPortionen] = useState<number | null>(1);
  const [speichert, setSpeichert] = useState(false);
  const mitGroessen = stand?.profil.stueckware !== 'gramm';

  useEffect(() => {
    if (!offen) return;
    setLm(null);
    setRezept(null);
    setTeller(null);
    setPortionen(1);
    void api.tagebuch.zuletzt().then((a) => a.ok && setZuletzt(a.wert));
  }, [offen]);

  const waehlen = (id: string) => {
    if (istTellerId(id)) {
      void api.teller.holen(id).then((a) => {
        if (a.ok && a.wert) setTeller(a.wert);
        else zeigen({ art: 'fehler', text: a.ok ? 'Diesen Teller gibt es nicht mehr.' : a.meldung });
      });
      return;
    }
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
      setMengen(startMenge(a.wert.umrechnung, a.wert.basis, mitGroessen));
    });
  };

  const umrechnungSetzen = (u: Umrechnung) => {
    if (!lm) return;
    void api.lebensmittel.umrechnungSpeichern(lm.id, u).then((a) => {
      if (a.ok) setLm(a.wert);
      else zeigen({ art: 'fehler', text: a.meldung });
    });
  };

  const gramm = lm && mengen.menge !== null ? inGramm(mengen.menge, mengen.einheit, lm.umrechnung, mengen.groesse) : null;
  const titelMahlzeit = MAHLZEITEN.find((m) => m.id === mahlzeit)?.titel ?? '';
  const portionSumme = useMemo(() => (rezept ? jePortion(rezeptSumme(rezept.zutaten), rezept.rezept.portionen) : teller ? tellerSumme(teller.posten) : null), [rezept, teller]);

  const senden = (eingabe: Parameters<typeof api.tagebuch.eintragen>[0]) => {
    setSpeichert(true);
    void api.tagebuch.eintragen(eingabe).then((a) => {
      setSpeichert(false);
      if (a.ok) props.onFertig();
      else zeigen({ art: 'fehler', text: a.meldung });
    });
  };

  const eintragen = () => {
    if (teller) {
      if (portionen !== null) senden({ datum, mahlzeit, lebensmittelId: teller.teller.id, menge: portionen, einheit: 'Teller', groesse: null });
      return;
    }
    if (rezept) {
      if (portionen !== null) senden({ datum, mahlzeit, lebensmittelId: rezept.rezept.id, menge: portionen, einheit: 'Portion', groesse: null });
      return;
    }
    if (!lm || mengen.menge === null || gramm === null) return;
    senden({ datum, mahlzeit, lebensmittelId: lm.id, menge: mengen.menge, einheit: mengen.einheit, groesse: lm.umrechnung.groessen && mengen.einheit === 'Stück' ? mengen.groesse : null });
  };

  const gewaehlt = lm !== null || rezept !== null || teller !== null;
  const naeherungMenge = rezept || teller ? portionen === null : mengen.menge === null || gramm === null;
  return (
    <Dialog
      titel={`Eintragen: ${titelMahlzeit}`}
      offen={offen}
      breit
      onSchliessen={props.onSchliessen}
      onAbsenden={eintragen}
      knoepfe={
        gewaehlt ? (
          <>
            <button
              type="button"
              className="knopf knopf-linie"
              onClick={() => {
                setLm(null);
                setRezept(null);
                setTeller(null);
              }}
            >
              <ArrowLeft className="i" aria-hidden /> Andere Auswahl
            </button>
            <button type="submit" className="knopf knopf-akzent" disabled={speichert || naeherungMenge}>
              {speichert ? <LoaderCircle className="i dreht" aria-hidden /> : null} Eintragen
            </button>
          </>
        ) : undefined
      }
    >
      {(rezept || teller) && portionSumme && (
        <div className="stapel">
          <div>
            <b className="eintrag-name">{rezept?.rezept.name ?? teller?.teller.name}</b>
            {rezept && <span className="leise"> · ergibt {zahlText(rezept.rezept.portionen, 2)} Portionen</span>}
          </div>
          <PortionenWahl wert={portionen} onWert={setPortionen} titel={teller ? 'Teller' : 'Portionen'} />
          {portionen !== null && (
            <NaehrwertSatz
              vorn={teller ? `${zahlText(portionen, 2)} Teller` : portionen === 1 ? '1 Portion' : `${zahlText(portionen, 2)} Portionen`}
              kcal={portionSumme.werte.ENERCC!.menge * portionen}
              eiweiss={portionSumme.werte.PROT625!.menge * portionen}
              fett={portionSumme.werte.FAT!.menge * portionen}
              kohlenhydrate={portionSumme.werte.CHO!.menge * portionen}
            />
          )}
          <p className="leise dialog-text">Die Zutaten kannst du danach für dieses eine Mal ändern, zum Beispiel weniger Öl: einfach auf den Eintrag klicken.</p>
        </div>
      )}
      {lm && (
        <div className="stapel">
          <div>
            <b className="eintrag-name">{lm.name}</b>
            {lm.marke && <span className="leise"> · {lm.marke}</span>}
          </div>
          <Mengenwahl umrechnung={lm.umrechnung} stand={mengen} mitGroessen={mitGroessen} onStand={setMengen} onUmrechnung={umrechnungSetzen} />
          <Vorschau werte={werteJe100g(lm)} gramm={gramm} einheitUngefaehr={istUngefaehr(mengen.einheit)} />
        </div>
      )}
      {!gewaehlt && offen && <LebensmittelWahl key={String(offen)} mitRezepten mitTellern zuletzt={zuletzt} onWahl={waehlen} />}
    </Dialog>
  );
}

function MahlzeitFeld({ wert, onWert }: { wert: Mahlzeit; onWert(m: Mahlzeit): void }) {
  return (
    <div className="feld">
      <label htmlFor="eintrag-mahlzeit">Mahlzeit</label>
      <select id="eintrag-mahlzeit" value={wert} onChange={(e) => onWert(e.target.value as Mahlzeit)}>
        {MAHLZEITEN.map((m) => (
          <option key={m.id} value={m.id}>
            {m.titel}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Menge oder Mahlzeit eines Lebensmittels ändern, oder den Eintrag löschen. Die Nährwerte bleiben, wie sie beim Eintragen waren. */
function LebensmittelBearbeiten({ eintrag, onSchliessen, onFertig }: { eintrag: TagebuchEintrag; onSchliessen(): void; onFertig(): void }) {
  const { stand } = useDaten();
  const { zeigen } = useMeldungen();
  const [mengen, setMengen] = useState<Mengenstand>({ menge: eintrag.menge, einheit: eintrag.einheit as MengenEinheit, groesse: eintrag.groesse ?? 'M' });
  const [mahlzeit, setMahlzeit] = useState<Mahlzeit>(eintrag.mahlzeit);
  const [umrechnung, setUmrechnung] = useState<Umrechnung>(eintrag.umrechnung);
  const mitGroessen = stand?.profil.stueckware !== 'gramm';
  const gramm = mengen.menge === null ? null : inGramm(mengen.menge, mengen.einheit, umrechnung, mengen.groesse);

  const speichern = () => {
    if (mengen.menge === null || gramm === null) return;
    void api.tagebuch
      .aendern(eintrag.id, { menge: mengen.menge, einheit: mengen.einheit, groesse: umrechnung.groessen && mengen.einheit === 'Stück' ? mengen.groesse : null, mahlzeit, umrechnung })
      .then((a) => {
        if (a.ok) onFertig();
        else zeigen({ art: 'fehler', text: a.meldung });
      });
  };

  return (
    <Dialog
      titel={eintrag.name}
      offen
      breit
      onSchliessen={onSchliessen}
      onAbsenden={speichern}
      knoepfe={<Knoepfe id={eintrag.id} onSchliessen={onSchliessen} onFertig={onFertig} gesperrt={mengen.menge === null || gramm === null} />}
    >
      <div className="stapel">
        <Mengenwahl umrechnung={umrechnung} stand={mengen} mitGroessen={mitGroessen} onStand={setMengen} onUmrechnung={setUmrechnung} />
        <MahlzeitFeld wert={mahlzeit} onWert={setMahlzeit} />
        <Vorschau werte={eintrag.werteJe100g} gramm={gramm} einheitUngefaehr={istUngefaehr(mengen.einheit)} />
        <p className="leise dialog-text">Die Nährwerte bleiben, wie sie beim Eintragen waren, auch wenn du das Lebensmittel später änderst.</p>
      </div>
    </Dialog>
  );
}

function Knoepfe({ id, onSchliessen, onFertig, gesperrt }: { id: string; onSchliessen(): void; onFertig(): void; gesperrt: boolean }) {
  const { zeigen } = useMeldungen();
  return (
    <>
      <button
        type="button"
        className="knopf knopf-leise knopf-links"
        onClick={() => {
          void api.tagebuch.loeschen(id).then((a) => {
            if (a.ok) onFertig();
            else zeigen({ art: 'fehler', text: a.meldung });
          });
        }}
      >
        <Trash2 className="i" aria-hidden /> Eintrag löschen
      </button>
      <button type="button" className="knopf knopf-linie" onClick={onSchliessen}>
        Abbrechen
      </button>
      <button type="submit" className="knopf knopf-akzent" disabled={gesperrt}>
        Speichern
      </button>
    </>
  );
}

interface ZutatZeile {
  schluessel: string;
  /** Kennung im Eintrag, bei neuen Zutaten fehlt sie. */
  id?: string;
  lebensmittelId: string;
  name: string;
  menge: number | null;
  einheit: MengenEinheit;
  groesse: Groesse | null;
  umrechnung: Umrechnung;
  werteJe100g: Readonly<Record<string, number>>;
  rolle: Rolle;
  gehoertZu?: string;
}

/**
 * Ein Rezept oder Teller im Tagebuch: Portionen ändern und die Zutaten für dieses eine Mal anpassen, zum Beispiel weniger Öl.
 * Die Mengen gelten für genau das, was eingetragen ist. Das Rezept selbst bleibt, wie es ist.
 */
function RezeptBearbeiten({ eintrag, onSchliessen, onFertig }: { eintrag: TagebuchEintrag; onSchliessen(): void; onFertig(): void }) {
  const { zeigen } = useMeldungen();
  const [portionen, setPortionen] = useState<number | null>(eintrag.menge);
  const [mahlzeit, setMahlzeit] = useState<Mahlzeit>(eintrag.mahlzeit);
  const [zeilen, setZeilen] = useState<ZutatZeile[]>(() =>
    (eintrag.rezept?.bestandteile ?? []).map((b) => ({ schluessel: b.id, id: b.id, lebensmittelId: b.lebensmittelId, name: b.name, menge: b.menge, einheit: b.einheit, groesse: b.groesse, umrechnung: b.umrechnung, werteJe100g: b.werteJe100g, rolle: b.rolle ?? 'extra', ...(b.gehoertZu ? { gehoertZu: b.gehoertZu } : {}) })),
  );
  const [geaendert, setGeaendert] = useState(false);
  const [dazu, setDazu] = useState(false);

  const portionenSetzen = (neu: number | null) => {
    // Andere Portionen: Alle Zutaten wachsen oder schrumpfen mit.
    if (neu !== null && portionen !== null && neu !== portionen) {
      const faktor = neu / portionen;
      setZeilen((alt) => alt.map((z) => ({ ...z, menge: z.menge === null ? null : z.menge * faktor })));
    }
    setPortionen(neu);
  };
  const zeileSetzen = (schluessel: string, menge: number | null) => {
    setGeaendert(true);
    setZeilen((alt) => alt.map((z) => (z.schluessel === schluessel ? { ...z, menge } : z)));
  };

  const gesamt = (code: string) => {
    let summe = 0;
    let bekannt = false;
    for (const z of zeilen) {
      const g = z.menge === null ? null : inGramm(z.menge, z.einheit, z.umrechnung, z.groesse ?? 'M');
      const je100 = z.werteJe100g[code];
      if (g !== null && je100 !== undefined) {
        summe += (je100 * g) / 100;
        bekannt = true;
      }
    }
    return bekannt ? summe : null;
  };

  const unvollstaendig = portionen === null || zeilen.length === 0 || zeilen.some((z) => z.menge === null);

  const speichern = () => {
    if (unvollstaendig || portionen === null) return;
    const bestandteile: BestandteilAenderung[] = zeilen.map((z) => ({ ...(z.id ? { id: z.id } : { lebensmittelId: z.lebensmittelId, rolle: z.rolle }), menge: z.menge!, einheit: z.einheit, groesse: z.groesse }));
    void api.tagebuch.aendern(eintrag.id, { menge: portionen, einheit: eintrag.einheit, groesse: null, mahlzeit, ...(geaendert ? { bestandteile } : {}) }).then((a) => {
      if (a.ok) onFertig();
      else zeigen({ art: 'fehler', text: a.meldung });
    });
  };

  return (
    <Dialog titel={eintrag.name} offen breit onSchliessen={onSchliessen} onAbsenden={speichern} knoepfe={<Knoepfe id={eintrag.id} onSchliessen={onSchliessen} onFertig={onFertig} gesperrt={unvollstaendig} />}>
      <div className="stapel">
        <PortionenWahl wert={portionen} onWert={portionenSetzen} titel={eintrag.art === 'teller' ? 'Teller' : 'Portionen'} />
        <MahlzeitFeld wert={mahlzeit} onWert={setMahlzeit} />
        <section aria-label="Zutaten für dieses eine Mal">
          <h3 className="dialog-zwischen">Zutaten für dieses eine Mal</h3>
          <div className="zutaten-anpassen">
            {(eintrag.art === 'teller' ? nachRollen(zeilen).flatMap((g) => g.eintraege) : zeilen).map((z) => (
              <div key={z.schluessel} className="zutat-anpassen">
                <ZahlFeld label={z.gehoertZu ? `${z.name} (aus ${z.gehoertZu})` : z.name} einheit={z.einheit} wert={z.menge} onWert={(m) => zeileSetzen(z.schluessel, m)} istErlaubt={(w) => w > 0 && w <= 100000} fehlerText="Bitte eine Menge über 0 eintragen." leerErlaubt stellen={2} />
                <button
                  type="button"
                  className="symbolknopf"
                  aria-label={`${z.name} weglassen`}
                  onClick={() => {
                    setGeaendert(true);
                    setZeilen((alt) => alt.filter((a) => a.schluessel !== z.schluessel));
                  }}
                >
                  <X className="i" aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="dazu" onClick={() => setDazu(true)}>
            <Plus className="i" aria-hidden /> Zutat dazu
          </button>
        </section>
        <NaehrwertSatz kcal={gesamt('ENERCC')} eiweiss={gesamt('PROT625')} fett={gesamt('FAT')} kohlenhydrate={gesamt('CHO')} />
        <p className="leise dialog-text">Das gilt nur für diesen Eintrag. {eintrag.art === 'teller' ? 'Der Teller bleibt, wie er ist.' : 'Das Rezept bleibt, wie es ist.'}</p>
      </div>
      <ZutatDialog
        offen={dazu}
        titel="Zutat dazu"
        onSchliessen={() => setDazu(false)}
        onFertig={(z) => {
          setDazu(false);
          setGeaendert(true);
          setZeilen((alt) => [...alt, { schluessel: `neu-${Date.now()}-${alt.length}`, lebensmittelId: z.lebensmittelId, name: z.name, menge: z.menge, einheit: z.einheit, groesse: z.groesse, umrechnung: z.umrechnung, werteJe100g: z.werteJe100g, rolle: 'extra' }]);
        }}
      />
    </Dialog>
  );
}

export function EintragBearbeiten(props: { eintrag: TagebuchEintrag | null; onSchliessen(): void; onFertig(): void }) {
  const { eintrag } = props;
  if (!eintrag) return null;
  if (eintrag.art !== 'lebensmittel') return <RezeptBearbeiten key={eintrag.id} eintrag={eintrag} onSchliessen={props.onSchliessen} onFertig={props.onFertig} />;
  return <LebensmittelBearbeiten key={eintrag.id} eintrag={eintrag} onSchliessen={props.onSchliessen} onFertig={props.onFertig} />;
}
