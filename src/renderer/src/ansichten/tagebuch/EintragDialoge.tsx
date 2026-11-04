import { useEffect, useState } from 'react';
import { ArrowLeft, LoaderCircle, Search, Trash2 } from 'lucide-react';
import { inGramm, istUngefaehr, type Umrechnung } from '@shared/einheiten';
import { zahlText } from '@shared/format';
import { werteJe100g, type Lebensmittel, type LebensmittelKurz } from '@shared/lebensmittel';
import { MAHLZEITEN, type Mahlzeit, type TagebuchEintrag } from '@shared/tagebuch';
import { api } from '../../api';
import { useDaten } from '../../daten/DatenKontext';
import { Dialog } from '../../komponenten/Dialog';
import { Mengenwahl, startMenge, type Mengenstand } from '../../komponenten/Mengenwahl';
import { useMeldungen } from '../../komponenten/Meldungen';
import { Herkunftsmarke } from '../lebensmittel/LebensmittelSuche';

function Vorschau({ werte, gramm, einheitUngefaehr }: { werte: Readonly<Record<string, number>>; gramm: number | null; einheitUngefaehr: boolean }) {
  if (gramm === null) return null;
  const menge = (code: string) => (werte[code] === undefined ? null : (werte[code]! * gramm) / 100);
  const text = (code: string, einheit: string) => {
    const m = menge(code);
    return m === null ? '–' : `${zahlText(m, m < 10 && einheit === 'g' ? 1 : 0)} ${einheit}`;
  };
  return (
    <p className="eintrag-vorschau">
      {einheitUngefaehr && <b>≈ {zahlText(gramm, gramm < 10 ? 1 : 0)} g: </b>}
      {text('ENERCC', 'kcal')} · Eiweiß {text('PROT625', 'g')} · Fett {text('FAT', 'g')} · Kohlenhydrate {text('CHO', 'g')}
    </p>
  );
}

function Treffer({ lm, onWahl }: { lm: LebensmittelKurz; onWahl(id: string): void }) {
  return (
    <button type="button" className="treffer treffer-knopf" onClick={() => onWahl(lm.id)}>
      <span className="treffer-name">
        {lm.name}
        {lm.marke && <span className="leise"> · {lm.marke}</span>}
      </span>
      <Herkunftsmarke lm={lm} />
      <span className="treffer-werte">
        <b>{lm.kcal === null ? '–' : zahlText(lm.kcal)} kcal</b>
      </span>
    </button>
  );
}

/** Eintragen in zwei Schritten: Lebensmittel suchen, dann die Menge wählen. Zuletzt Gegessenes steht oben. */
export function EintragenDialog(props: { offen: boolean; datum: string; mahlzeit: Mahlzeit; onSchliessen(): void; onFertig(): void }) {
  const { offen, datum, mahlzeit } = props;
  const { stand } = useDaten();
  const { zeigen } = useMeldungen();
  const [text, setText] = useState('');
  const [treffer, setTreffer] = useState<LebensmittelKurz[]>([]);
  const [zuletzt, setZuletzt] = useState<LebensmittelKurz[]>([]);
  const [lm, setLm] = useState<Lebensmittel | null>(null);
  const [mengen, setMengen] = useState<Mengenstand>({ menge: 100, einheit: 'g', groesse: 'M' });
  const [speichert, setSpeichert] = useState(false);
  const mitGroessen = stand?.profil.stueckware !== 'gramm';

  useEffect(() => {
    if (!offen) return;
    setText('');
    setTreffer([]);
    setLm(null);
    void api.tagebuch.zuletzt().then((a) => a.ok && setZuletzt(a.wert));
  }, [offen]);

  useEffect(() => {
    if (!offen || text.trim() === '') {
      setTreffer([]);
      return;
    }
    let abgebrochen = false;
    const uhr = setTimeout(() => {
      void api.lebensmittel.suchen({ text, filter: 'alle' }).then((a) => {
        if (!abgebrochen && a.ok) setTreffer(a.wert.treffer.slice(0, 40));
      });
    }, 120);
    return () => {
      abgebrochen = true;
      clearTimeout(uhr);
    };
  }, [text, offen]);

  const waehlen = (id: string) => {
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

  const eintragen = () => {
    if (!lm) {
      const erster = treffer[0];
      if (erster) waehlen(erster.id);
      return;
    }
    if (mengen.menge === null || gramm === null) return;
    setSpeichert(true);
    void api.tagebuch
      .eintragen({ datum, mahlzeit, lebensmittelId: lm.id, menge: mengen.menge, einheit: mengen.einheit, groesse: lm.umrechnung.groessen && mengen.einheit === 'Stück' ? mengen.groesse : null })
      .then((a) => {
        setSpeichert(false);
        if (a.ok) props.onFertig();
        else zeigen({ art: 'fehler', text: a.meldung });
      });
  };

  return (
    <Dialog
      titel={`Eintragen: ${titelMahlzeit}`}
      offen={offen}
      breit
      onSchliessen={props.onSchliessen}
      onAbsenden={eintragen}
      knoepfe={
        lm ? (
          <>
            <button type="button" className="knopf knopf-linie" onClick={() => setLm(null)}>
              <ArrowLeft className="i" aria-hidden /> Anderes Lebensmittel
            </button>
            <button type="submit" className="knopf knopf-akzent" disabled={speichert || mengen.menge === null || gramm === null}>
              {speichert ? <LoaderCircle className="i dreht" aria-hidden /> : null} Eintragen
            </button>
          </>
        ) : undefined
      }
    >
      {lm ? (
        <div className="stapel">
          <div>
            <b className="eintrag-name">{lm.name}</b>
            {lm.marke && <span className="leise"> · {lm.marke}</span>}
          </div>
          <Mengenwahl umrechnung={lm.umrechnung} stand={mengen} mitGroessen={mitGroessen} onStand={setMengen} onUmrechnung={umrechnungSetzen} />
          <Vorschau werte={werteJe100g(lm)} gramm={gramm} einheitUngefaehr={istUngefaehr(mengen.einheit)} />
        </div>
      ) : (
        <div className="stapel">
          <div className="suchfeld">
            <Search className="i" aria-hidden />
            <input type="text" data-autofokus value={text} placeholder="Suchen, zum Beispiel Apfel oder Skyr" aria-label="Lebensmittel suchen" autoComplete="off" onChange={(e) => setText(e.target.value)} />
          </div>
          {text.trim() === '' && zuletzt.length > 0 && (
            <section aria-label="Zuletzt gegessen">
              <h3 className="dialog-zwischen">Zuletzt gegessen</h3>
              <div className="treffer-liste dialog-liste">
                {zuletzt.map((k) => (
                  <Treffer key={k.id} lm={k} onWahl={waehlen} />
                ))}
              </div>
            </section>
          )}
          {text.trim() !== '' && treffer.length > 0 && (
            <div className="treffer-liste dialog-liste">
              {treffer.map((k) => (
                <Treffer key={k.id} lm={k} onWahl={waehlen} />
              ))}
            </div>
          )}
          {text.trim() === '' && zuletzt.length === 0 && <p className="leise">Tippe los, über 7.000 Lebensmittel warten auf dich.</p>}
        </div>
      )}
    </Dialog>
  );
}

/** Menge oder Mahlzeit ändern, oder den Eintrag löschen. Die Nährwerte bleiben, wie sie beim Eintragen waren. */
export function EintragBearbeiten(props: { eintrag: TagebuchEintrag | null; onSchliessen(): void; onFertig(): void }) {
  const { eintrag } = props;
  const { stand } = useDaten();
  const { zeigen } = useMeldungen();
  const [mengen, setMengen] = useState<Mengenstand>({ menge: 100, einheit: 'g', groesse: 'M' });
  const [mahlzeit, setMahlzeit] = useState<Mahlzeit>('snacks');
  const [umrechnung, setUmrechnung] = useState<Umrechnung | null>(null);
  const mitGroessen = stand?.profil.stueckware !== 'gramm';

  useEffect(() => {
    if (!eintrag) return;
    setMengen({ menge: eintrag.menge, einheit: eintrag.einheit, groesse: eintrag.groesse ?? 'M' });
    setMahlzeit(eintrag.mahlzeit);
    setUmrechnung(eintrag.umrechnung);
  }, [eintrag]);

  if (!eintrag || !umrechnung) return null;
  const gramm = mengen.menge === null ? null : inGramm(mengen.menge, mengen.einheit, umrechnung, mengen.groesse);

  const speichern = () => {
    if (mengen.menge === null || gramm === null) return;
    void api.tagebuch
      .aendern(eintrag.id, { menge: mengen.menge, einheit: mengen.einheit, groesse: umrechnung.groessen && mengen.einheit === 'Stück' ? mengen.groesse : null, mahlzeit, umrechnung })
      .then((a) => {
        if (a.ok) props.onFertig();
        else zeigen({ art: 'fehler', text: a.meldung });
      });
  };
  const loeschen = () => {
    void api.tagebuch.loeschen(eintrag.id).then((a) => {
      if (a.ok) props.onFertig();
      else zeigen({ art: 'fehler', text: a.meldung });
    });
  };

  return (
    <Dialog
      titel={eintrag.name}
      offen
      breit
      onSchliessen={props.onSchliessen}
      onAbsenden={speichern}
      knoepfe={
        <>
          <button type="button" className="knopf knopf-leise knopf-links" onClick={loeschen}>
            <Trash2 className="i" aria-hidden /> Eintrag löschen
          </button>
          <button type="button" className="knopf knopf-linie" onClick={props.onSchliessen}>
            Abbrechen
          </button>
          <button type="submit" className="knopf knopf-akzent" disabled={mengen.menge === null || gramm === null}>
            Speichern
          </button>
        </>
      }
    >
      <div className="stapel">
        <Mengenwahl umrechnung={umrechnung} stand={mengen} mitGroessen={mitGroessen} onStand={setMengen} onUmrechnung={setUmrechnung} />
        <div className="feld">
          <label htmlFor="eintrag-mahlzeit">Mahlzeit</label>
          <select id="eintrag-mahlzeit" value={mahlzeit} onChange={(e) => setMahlzeit(e.target.value as Mahlzeit)}>
            {MAHLZEITEN.map((m) => (
              <option key={m.id} value={m.id}>
                {m.titel}
              </option>
            ))}
          </select>
        </div>
        <Vorschau werte={eintrag.werteJe100g} gramm={gramm} einheitUngefaehr={istUngefaehr(mengen.einheit)} />
        <p className="leise dialog-text">Die Nährwerte bleiben, wie sie beim Eintragen waren, auch wenn du das Lebensmittel später änderst.</p>
      </div>
    </Dialog>
  );
}
