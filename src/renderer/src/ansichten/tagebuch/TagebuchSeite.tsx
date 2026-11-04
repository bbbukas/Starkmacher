import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Apple, CalendarDays, ChevronLeft, ChevronRight, Moon, Plus, Sun, Sunrise, Sunset, type LucideIcon } from 'lucide-react';
import type { VorschlagsAntwort } from '@shared/api';
import type { Bedarf } from '@shared/bedarf';
import { tagText, zahlText } from '@shared/format';
import { datumErlaubt, datumVon } from '@shared/profil';
import { eintragWert, kcalFrei, MAHLZEITEN, mengenText, tagesLuecken, tagesMotto, tagessumme, type Mahlzeit, type Tagessumme, type TagebuchEintrag } from '@shared/tagebuch';
import { knappeWochenwerte, wochenstand } from '@shared/woche';
import { api } from '../../api';
import { useDaten } from '../../daten/DatenKontext';
import { useMeldungen } from '../../komponenten/Meldungen';
import { Teller } from '../../komponenten/Teller';
import { gehe, pfade } from '../../router';
import { EintragBearbeiten, EintragenDialog } from './EintragDialoge';
import { TagesGruppen } from './TagesGruppen';
import { WasFehlt } from './WasFehlt';

const SYMBOLE: Readonly<Record<Mahlzeit, LucideIcon>> = { fruehstueck: Sunrise, mittag: Sun, abend: Sunset, nacht: Moon, snacks: Apple };

const tagVersetzen = (datum: string, tage: number) => {
  const d = new Date(`${datum}T12:00:00`);
  d.setDate(d.getDate() + tage);
  return datumVon(d);
};

const gramm = (g: number) => zahlText(g, g < 10 ? 1 : 0);

function MakroFeld({ klasse, titel, code, ziel, summe }: { klasse: string; titel: string; code: string; ziel: number; summe: Tagessumme }) {
  const menge = summe.werte[code]!.menge;
  const rest = ziel - menge;
  return (
    <div className={`feld-karte ${klasse}`}>
      <span className="wort">{titel}</span>
      <span className="zahl">
        {gramm(menge)} <small>von {zahlText(ziel)} g</small>
      </span>
      <div className="balken">
        <i style={{ width: `${Math.min(100, ziel > 0 ? (menge / ziel) * 100 : 0)}%` }} />
      </div>
      <span className="rest">{rest > 0 ? `noch ${gramm(rest)} g` : rest === 0 ? 'genau geschafft' : `${gramm(-rest)} g über dem Plan`}</span>
    </div>
  );
}

function SummenKarten({ summe, bedarf }: { summe: Tagessumme; bedarf: Bedarf }) {
  const kcal = summe.werte.ENERCC!.menge;
  const frei = kcalFrei(summe, bedarf);
  return (
    <section className="summe" aria-label="Tagessumme">
      <div className="feld-karte kcal">
        <Teller anteil={kcal / bedarf.kcal}>
          <span className="teller-zahl">{zahlText(kcal)}</span>
          <small>von {zahlText(bedarf.kcal)} kcal</small>
        </Teller>
        <span className="rest">{frei >= 0 ? `noch etwa ${zahlText(frei)} kcal frei` : `etwa ${zahlText(-frei)} kcal über dem Ziel`}</span>
      </div>
      <MakroFeld klasse="g-aminosaeuren" titel="Eiweiß" code="PROT625" ziel={bedarf.eiweissG} summe={summe} />
      <MakroFeld klasse="g-fettsaeuren" titel="Fett" code="FAT" ziel={bedarf.fettG} summe={summe} />
      <MakroFeld klasse="g-kohlenhydrate" titel="Kohlenhydrate" code="CHO" ziel={bedarf.kohlenhydrateG} summe={summe} />
    </section>
  );
}

function MahlzeitKarte({ id, titel, eintraege, onEintragen, onOeffnen }: { id: Mahlzeit; titel: string; eintraege: readonly TagebuchEintrag[]; onEintragen(): void; onOeffnen(e: TagebuchEintrag): void }) {
  const Symbol = SYMBOLE[id];
  const kcal = eintraege.reduce((summe, e) => summe + (eintragWert(e, 'ENERCC') ?? 0), 0);
  return (
    <article className="mahlzeit" aria-label={titel}>
      <header>
        <span className="bild">
          <Symbol className="i" aria-hidden />
        </span>
        <h2>{titel}</h2>
        {eintraege.length > 0 && <span className="summe-klein">{zahlText(kcal)} kcal</span>}
      </header>
      {eintraege.length === 0 ? (
        <p className="leer">Noch nichts eingetragen.</p>
      ) : (
        eintraege.map((e) => {
          const k = eintragWert(e, 'ENERCC');
          return (
            <button key={e.id} type="button" className="eintrag" onClick={() => onOeffnen(e)}>
              <b>
                {e.name}
                {e.marke && <span className="leise"> · {e.marke}</span>}
              </b>
              <small>
                {e.art === 'rezept' && <span className="art-chip">Rezept</span>}
                {e.art === 'teller' && <span className="art-chip">Teller</span>}
                {mengenText(e)}
                {e.rezept?.angepasst && ' · heute angepasst'}
              </small>
              <span className="kc">{k === null ? '–' : zahlText(k)}</span>
            </button>
          );
        })
      )}
      <button type="button" className="dazu" onClick={onEintragen}>
        <Plus className="i" aria-hidden /> Eintragen
      </button>
    </article>
  );
}

/** Das Tagebuch: ein Tag pro Ansicht, am Anfang heute (Bauauftrag Abschnitt 8). */
export function TagebuchSeite({ datumImPfad }: { datumImPfad: string | undefined }) {
  const { stand, bedarf, speichernJetzt } = useDaten();
  const { zeigen } = useMeldungen();
  const heute = datumVon(new Date());
  const datum = datumErlaubt(datumImPfad) ? datumImPfad : heute;
  const [eintraege, setEintraege] = useState<TagebuchEintrag[] | null>(null);
  const [wocheEintraege, setWocheEintraege] = useState<TagebuchEintrag[]>([]);
  const [antwort, setAntwort] = useState<VorschlagsAntwort | null>(null);
  const [eintragenIn, setEintragenIn] = useState<Mahlzeit | null>(null);
  const [offen, setOffen] = useState<TagebuchEintrag | null>(null);
  const kalender = useRef<HTMLInputElement>(null);

  const laden = useCallback(() => {
    void api.tagebuch.tag(datum).then((a) => {
      if (a.ok && a.wert.datum === datum) {
        setEintraege(a.wert.eintraege);
        setWocheEintraege(a.wert.woche);
      } else if (!a.ok) zeigen({ art: 'fehler', text: a.meldung });
    });
    // Die Vorschläge rechnet der Hauptprozess mit dem gespeicherten Profil. Eine gerade gemachte Änderung muss also erst dort ankommen.
    void speichernJetzt()
      .then(() => api.tagebuch.vorschlaege(datum))
      .then((a) => {
        if (a.ok) setAntwort(a.wert);
      });
  }, [datum, zeigen, speichernJetzt]);

  // `bedarf` gehört dazu: Ändert sich das Gewicht, ändern sich Lücken und Vorschläge.
  useEffect(laden, [laden, bedarf]);

  const summe = useMemo(() => tagessumme(eintraege ?? []), [eintraege]);
  const ausgeblendet = stand?.profil.ausgeblendet ?? [];
  const luecken = useMemo(() => (bedarf ? tagesLuecken(summe, bedarf, ausgeblendet) : []), [summe, bedarf, ausgeblendet]);
  const woche = useMemo(() => wochenstand(wocheEintraege, datum, heute), [wocheEintraege, datum, heute]);
  const knappe = useMemo(() => (bedarf ? knappeWochenwerte(woche, bedarf, ausgeblendet) : []), [woche, bedarf, ausgeblendet]);

  const wechseln = (neu: string) => {
    if (datumErlaubt(neu)) {
      setEintraege(null);
      setWocheEintraege([]);
      setAntwort(null);
      gehe(pfade.tagebuchTag(neu));
    }
  };

  return (
    <main className="seite">
      <div className="tag">
        <button type="button" className="knopf-rund" aria-label="Tag davor" onClick={() => wechseln(tagVersetzen(datum, -1))}>
          <ChevronLeft className="i" aria-hidden />
        </button>
        <h1>{tagText(new Date(`${datum}T12:00:00`))}</h1>
        <button type="button" className="knopf-rund" aria-label="Tag danach" onClick={() => wechseln(tagVersetzen(datum, 1))}>
          <ChevronRight className="i" aria-hidden />
        </button>
        <span className="kalender">
          <button type="button" className="knopf-rund" aria-label="Kalender öffnen" onClick={() => kalender.current?.showPicker()}>
            <CalendarDays className="i" aria-hidden />
          </button>
          <input ref={kalender} type="date" aria-label="Tag wählen" value={datum} onChange={(e) => wechseln(e.target.value)} />
        </span>
        {datum === heute ? (
          <span className="heute">heute</span>
        ) : (
          <button type="button" className="knopf knopf-linie knopf-klein" onClick={() => wechseln(heute)}>
            Zu heute
          </button>
        )}
        {bedarf && eintraege && <span className="motto">{tagesMotto(summe, bedarf, luecken)}</span>}
      </div>

      {bedarf && <SummenKarten summe={summe} bedarf={bedarf} />}

      <div className="spalten">
        <div className="stapel">
          {MAHLZEITEN.map((m) => (
            <MahlzeitKarte key={m.id} id={m.id} titel={m.titel} eintraege={(eintraege ?? []).filter((e) => e.mahlzeit === m.id)} onEintragen={() => setEintragenIn(m.id)} onOeffnen={setOffen} />
          ))}
        </div>
        <div className="stapel">
          {bedarf && eintraege && <WasFehlt datum={datum} istHeute={datum === heute} summe={summe} bedarf={bedarf} luecken={luecken} woche={woche} knappe={knappe} antwort={antwort} onGeaendert={laden} />}
          {bedarf && <TagesGruppen summe={summe} woche={woche} bedarf={bedarf} ausgeblendet={ausgeblendet} />}
        </div>
      </div>

      <EintragenDialog
        offen={eintragenIn !== null}
        datum={datum}
        mahlzeit={eintragenIn ?? 'snacks'}
        onSchliessen={() => setEintragenIn(null)}
        onFertig={() => {
          setEintragenIn(null);
          laden();
        }}
      />
      <EintragBearbeiten
        eintrag={offen}
        onSchliessen={() => setOffen(null)}
        onFertig={() => {
          setOffen(null);
          laden();
        }}
      />
    </main>
  );
}
