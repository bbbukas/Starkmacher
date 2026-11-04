import { useEffect, useState } from 'react';
import { Check, ClipboardCopy, LoaderCircle, Minus, Plus, Search, ShoppingBasket, Trash2, TriangleAlert, X } from 'lucide-react';
import type { Antwort } from '@shared/api';
import { anzahlErlaubt, anzahlText, type EinkaufAnsicht, type EinkaufQuellenStand, type EinkaufZeile } from '@shared/einkauf';
import { zahlText } from '@shared/format';
import type { RezeptKurz } from '@shared/rezepte';
import type { TellerKurz } from '@shared/teller';
import { api } from '../../api';
import { Dialog, Rueckfrage } from '../../komponenten/Dialog';
import { useMeldungen } from '../../komponenten/Meldungen';
import { pfade } from '../../router';

/** Rezepte und Teller zum Auswählen. Der Dialog bleibt offen, damit sich mehrere nacheinander wählen lassen. */
function AuswahlDialog(props: { offen: boolean; quellen: readonly EinkaufQuellenStand[]; onSchliessen(): void; onWahl(id: string): void }) {
  const { offen, quellen } = props;
  const { zeigen } = useMeldungen();
  const [text, setText] = useState('');
  const [rezepte, setRezepte] = useState<RezeptKurz[] | null>(null);
  const [teller, setTeller] = useState<TellerKurz[] | null>(null);

  useEffect(() => {
    if (!offen) return;
    let abgebrochen = false;
    const uhr = setTimeout(() => {
      void Promise.all([api.rezepte.liste({ text, hashtags: [] }), api.teller.liste(text)]).then(([r, t]) => {
        if (abgebrochen) return;
        if (r.ok) setRezepte(r.wert);
        else zeigen({ art: 'fehler', text: r.meldung });
        if (t.ok) setTeller(t.wert);
        else zeigen({ art: 'fehler', text: t.meldung });
      });
    }, 100);
    return () => {
      abgebrochen = true;
      clearTimeout(uhr);
    };
  }, [offen, text, zeigen]);

  useEffect(() => {
    if (offen) setText('');
  }, [offen]);

  const zeile = (id: string, name: string, art: string, unter: string) => {
    const da = quellen.find((q) => q.bezugId === id);
    return (
      <button key={id} type="button" className="einkauf-wahl" aria-label={`${name} auf die Liste`} onClick={() => props.onWahl(id)}>
        <span className="einkauf-wahl-text">
          <b>{name}</b>
          <small className="leise">
            <span className="art-chip">{art}</span>
            {unter}
          </small>
        </span>
        {da ? (
          <span className="einkauf-wahl-da">
            <Check className="i" aria-hidden /> {anzahlText(da)}
          </span>
        ) : (
          <Plus className="i" aria-hidden />
        )}
      </button>
    );
  };

  const nichts = rezepte?.length === 0 && teller?.length === 0;
  return (
    <Dialog
      titel="Was soll auf die Liste?"
      offen={offen}
      breit
      onSchliessen={props.onSchliessen}
      knoepfe={
        <button type="button" className="knopf knopf-akzent" onClick={props.onSchliessen}>
          Fertig
        </button>
      }
    >
      <div className="stapel">
        <div className="suchfeld">
          <Search className="i" aria-hidden />
          <input type="text" value={text} placeholder="Rezept oder Teller suchen" aria-label="Rezept oder Teller suchen" autoComplete="off" onChange={(e) => setText(e.target.value)} />
        </div>
        {nichts &&
          (text.trim() !== '' ? (
            <p className="leise">Dazu passt gerade nichts.</p>
          ) : (
            <p className="leise">
              Du hast noch keine Rezepte und Teller. Leg sie unter <a href={pfade.reiter('rezepte')}>Rezepte</a> oder <a href={pfade.reiter('teller')}>Teller</a> an.
            </p>
          ))}
        <div className="einkauf-wahlen">
          {rezepte?.map((r) => zeile(r.id, r.name, 'Rezept', `ergibt ${zahlText(r.portionen, 2)} ${r.portionen === 1 ? 'Portion' : 'Portionen'}`))}
          {teller?.map((t) => zeile(t.id, t.name, 'Teller', t.inhalt))}
        </div>
      </div>
    </Dialog>
  );
}

function ListenZeile({ z, onHaken }: { z: EinkaufZeile; onHaken(ja: boolean): void }) {
  return (
    <label className={`einkauf-zeile${z.abgehakt ? ' abgehakt' : ''}`}>
      <input type="checkbox" checked={z.abgehakt} onChange={(e) => onHaken(e.target.checked)} />
      <span className="einkauf-menge">{z.menge}</span>
      <span className="einkauf-text">
        <b>{z.name}</b>
        {z.genauer && <small>{z.genauer}</small>}
        {z.gegart && <small>Die Menge gilt gegart, roh wiegt es anders.</small>}
        <small>für {z.fuer.join(', ')}</small>
      </span>
    </label>
  );
}

function QuellenZeile({ q, onAnzahl, onEntfernen }: { q: EinkaufQuellenStand; onAnzahl(anzahl: number): void; onEntfernen(): void }) {
  return (
    <div className="einkauf-quelle">
      <div className="einkauf-quelle-kopf">
        <span className="einkauf-quelle-name">
          <b>{q.name}</b>
          <span className="art-chip art-chip-nach">{q.art === 'rezept' ? 'Rezept' : 'Teller'}</span>
        </span>
        <button type="button" className="symbolknopf" aria-label={`${q.name} von der Liste nehmen`} onClick={onEntfernen}>
          <X className="i" aria-hidden />
        </button>
      </div>
      {q.fehlt ? (
        <p className="leise einkauf-quelle-text">{q.art === 'rezept' ? 'Dieses Rezept gibt es nicht mehr.' : 'Diesen Teller gibt es nicht mehr.'} Es zählt nicht mit.</p>
      ) : (
        <div className="einkauf-schritte">
          <button type="button" className="knopf-rund" aria-label={`${q.name}: weniger`} disabled={!anzahlErlaubt(q.anzahl - 1)} onClick={() => onAnzahl(q.anzahl - 1)}>
            <Minus className="i" aria-hidden />
          </button>
          <span className="einkauf-anzahl">{anzahlText(q)}</span>
          <button type="button" className="knopf-rund" aria-label={`${q.name}: mehr`} disabled={!anzahlErlaubt(q.anzahl + 1)} onClick={() => onAnzahl(q.anzahl + 1)}>
            <Plus className="i" aria-hidden />
          </button>
        </div>
      )}
      {q.ohne.length > 0 && <p className="leise einkauf-quelle-text">Ohne {q.ohne.map((n) => `„${n}“`).join(', ')}: Dieses Rezept gibt es nicht mehr.</p>}
      {q.notiz && <p className="leise einkauf-quelle-text notiz">Notiz im Rezept: {q.notiz}</p>}
    </div>
  );
}

/** Der Reiter „Einkauf“ (Bauauftrag Abschnitt 10): Rezepte und Teller wählen, zusammengerechnete Mengen abhaken. */
export function EinkaufSeite() {
  const { zeigen } = useMeldungen();
  const [ansicht, setAnsicht] = useState<EinkaufAnsicht | null>(null);
  const [waehlen, setWaehlen] = useState(false);
  const [leeren, setLeeren] = useState(false);

  useEffect(() => {
    let abgebrochen = false;
    void api.einkauf.ansicht().then((a) => {
      if (abgebrochen) return;
      if (a.ok) setAnsicht(a.wert);
      else zeigen({ art: 'fehler', text: a.meldung });
    });
    return () => {
      abgebrochen = true;
    };
  }, [zeigen]);

  const uebernehmen = (a: Antwort<EinkaufAnsicht>) => {
    if (a.ok) setAnsicht(a.wert);
    else zeigen({ art: 'fehler', text: a.meldung });
  };

  if (!ansicht) {
    return (
      <main className="seite seite-schmal mitte">
        <LoaderCircle className="i gross dreht" aria-hidden />
      </main>
    );
  }

  const { quellen, zeilen } = ansicht;
  const abgehakt = zeilen.filter((z) => z.abgehakt).length;
  const offen = zeilen.length - abgehakt;
  const haken = (z: EinkaufZeile, ja: boolean) => {
    // Sofort sichtbar, nicht erst, wenn der Haken gespeichert ist.
    setAnsicht((a) => a && { ...a, zeilen: a.zeilen.map((x) => (x.schluessel === z.schluessel ? { ...x, abgehakt: ja } : x)) });
    void api.einkauf.abhaken(z.schluessel, ja).then((a) => {
      uebernehmen(a);
      if (!a.ok) void api.einkauf.ansicht().then(uebernehmen);
    });
  };

  return (
    <main className="seite">
      <div className="kopf-reihe">
        <h1 className="seitentitel">Einkaufsliste</h1>
        <button type="button" className="knopf knopf-akzent" onClick={() => setWaehlen(true)}>
          <Plus className="i" aria-hidden /> Rezept oder Teller wählen
        </button>
      </div>

      {quellen.length === 0 ? (
        <section className="karte kommt-bald">
          <ShoppingBasket className="i gross" aria-hidden />
          <p>Wähle Rezepte und Teller, die du kochen möchtest. Gleiche Zutaten rechnet das Programm zusammen.</p>
          <p className="leise">Du kannst auch direkt bei einem Rezept oder Teller auf „Auf die Einkaufsliste“ klicken.</p>
        </section>
      ) : (
        <div className="spalten einkauf-spalten">
          <section className="karte" aria-label="Zum Abhaken">
            <div className="einkauf-kopf">
              <h2>{offen === 0 && zeilen.length > 0 ? 'Alles im Korb' : 'Noch zu kaufen'}</h2>
              <span className="leise" role="status">
                {abgehakt} von {zeilen.length} abgehakt
              </span>
            </div>
            {zeilen.length === 0 && <p className="leise">Hier steht gerade nichts drauf.</p>}
            {/* Abgehakte Zeilen bleiben an ihrem Platz: Sonst rutscht beim Klicken die nächste unter die Maus. */}
            <div>
              {zeilen.map((z) => (
                <ListenZeile key={z.schluessel} z={z} onHaken={(ja) => haken(z, ja)} />
              ))}
            </div>
            <div className="knopfreihe">
              <button
                type="button"
                className="knopf knopf-linie"
                disabled={offen === 0}
                onClick={() => {
                  void api.einkauf.kopieren().then((a) => {
                    if (a.ok) zeigen({ art: 'info', text: 'Liste kopiert. Du kannst sie jetzt einfügen, wo du möchtest.' });
                    else zeigen({ art: 'fehler', text: a.meldung });
                  });
                }}
              >
                <ClipboardCopy className="i" aria-hidden /> Liste kopieren
              </button>
              {abgehakt > 0 && (
                <button type="button" className="knopf knopf-leise" onClick={() => void api.einkauf.hakenEntfernen().then(uebernehmen)}>
                  Alle Haken entfernen
                </button>
              )}
            </div>
          </section>

          <section className="karte" aria-label="Das steht auf der Liste">
            <h2>Das steht auf der Liste</h2>
            {quellen.some((q) => q.fehlt || q.ohne.length > 0) && (
              <div className="hinweis" role="status">
                <TriangleAlert className="i" aria-hidden />
                <p>Etwas davon gibt es nicht mehr, deshalb fehlen seine Zutaten auf der Liste.</p>
              </div>
            )}
            {quellen.map((q) => (
              <QuellenZeile key={q.bezugId} q={q} onAnzahl={(anzahl) => void api.einkauf.anzahl(q.bezugId, anzahl).then(uebernehmen)} onEntfernen={() => void api.einkauf.entfernen(q.bezugId).then(uebernehmen)} />
            ))}
            <div className="knopfreihe">
              <button type="button" className="knopf knopf-leise" onClick={() => setLeeren(true)}>
                <Trash2 className="i" aria-hidden /> Liste leeren
              </button>
            </div>
          </section>
        </div>
      )}

      <AuswahlDialog offen={waehlen} quellen={quellen} onSchliessen={() => setWaehlen(false)} onWahl={(id) => void api.einkauf.hinzufuegen(id).then(uebernehmen)} />
      <Rueckfrage
        offen={leeren}
        titel="Liste leeren?"
        text="Alle Rezepte, Teller und Haken verschwinden von der Liste. Deine Rezepte und Teller selbst bleiben."
        bestaetigen="Leeren"
        onAbbrechen={() => setLeeren(false)}
        onBestaetigen={() => {
          void api.einkauf.leeren().then(uebernehmen);
          setLeeren(false);
        }}
      />
    </main>
  );
}
