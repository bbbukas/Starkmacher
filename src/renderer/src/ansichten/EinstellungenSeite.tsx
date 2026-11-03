import { useCallback, useEffect, useState } from 'react';
import { ArchiveRestore, ChevronDown, FolderOpen, FolderSearch, HardDrive, Save, TriangleAlert } from 'lucide-react';
import { SICHERUNGEN_BEHALTEN, type Antwort, type ProgrammInfo, type SicherungsEintrag, type SicherungsZustand } from '@shared/api';
import { zahlText } from '@shared/format';
import { GRUPPEN, NAEHRSTOFFE, naehrstoffeDerGruppe, type Gruppe } from '@shared/naehrstoffe';
import type { Stueckware } from '@shared/profil';
import { QUELLEN } from '@shared/referenzwerte';
import { api } from '../api';
import { useDaten } from '../daten/DatenKontext';
import { Dialog, Rueckfrage } from '../komponenten/Dialog';
import { Wahl } from '../komponenten/Felder';
import { useMeldungen } from '../komponenten/Meldungen';

const ohneHeim = (pfad: string) => pfad.replace(/^\/Users\/[^/]+/, '~');

function zeitText(zeit: string): string {
  const d = new Date(zeit);
  if (Number.isNaN(d.getTime())) return zeit;
  const zwei = (z: number) => String(z).padStart(2, '0');
  return `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${d.getFullYear()}, ${zwei(d.getHours())}:${zwei(d.getMinutes())} Uhr`;
}

function groesseText(bytes: number): string {
  if (bytes < 1024 * 1024) return `${zahlText(Math.max(1, Math.round(bytes / 1024)))} KB`;
  return `${zahlText(bytes / (1024 * 1024), 1)} MB`;
}

export function EinstellungenSeite() {
  const { stand, ladeFehler, profilAendern, speichernJetzt } = useDaten();
  const [info, setInfo] = useState<ProgrammInfo | null>(null);
  const [zustand, setZustand] = useState<SicherungsZustand | null>(null);
  const [wiederOffen, setWiederOffen] = useState(false);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const { zeigen } = useMeldungen();

  const auffrischen = useCallback(() => void api.sicherung.zustand().then(setZustand), []);
  useEffect(auffrischen, [auffrischen]);
  useEffect(() => void api.programm.info().then(setInfo), []);

  const ordnerWaehlen = async () => {
    setBeschaeftigt(true);
    await speichernJetzt();
    const antwort: Antwort<SicherungsZustand | null> = await api.sicherung.ordnerWaehlen();
    setBeschaeftigt(false);
    if (!antwort.ok) zeigen({ art: 'fehler', text: antwort.meldung });
    else if (antwort.wert) {
      setZustand(antwort.wert);
      zeigen({ art: 'info', text: `Sicherungen gehen jetzt nach ${ohneHeim(antwort.wert.ordner)}.` });
    }
  };

  const sicherungJetzt = async () => {
    setBeschaeftigt(true);
    await speichernJetzt();
    const antwort = await api.sicherung.erstellen();
    setBeschaeftigt(false);
    if (!antwort.ok) zeigen({ art: 'fehler', text: antwort.meldung });
    else if (antwort.wert) zeigen({ art: 'info', text: 'Sicherung erstellt.' });
    else zeigen({ art: 'info', text: 'Noch gibt es nichts zu sichern.' });
    auffrischen();
  };

  return (
    <main className="seite seite-schmal">
      <h1 className="seitentitel">Einstellungen</h1>

      {ladeFehler && (
        <div className="hinweis hinweis-fehler" role="alert">
          <TriangleAlert className="i" aria-hidden />
          <p>{ladeFehler} Es wurde nichts überschrieben. Unten bei „Sicherung wiederherstellen“ kannst du einen früheren Stand zurückholen.</p>
        </div>
      )}

      <section className="karte">
        <h2>Sicherung</h2>
        <p className="leise">Bei jedem Start legt Starkmacher eine Kopie deiner Daten und Fotos an. Die letzten {SICHERUNGEN_BEHALTEN} bleiben, ältere werden gelöscht. In iCloud wird nie gesichert.</p>
        {zustand && (
          <>
            <dl className="angaben">
              <dt>Ordner</dt>
              <dd className="ordner" title={zustand.ordner}>
                {ohneHeim(zustand.ordner)}
              </dd>
              <dt>Letzte Sicherung</dt>
              <dd>{zustand.letzteSicherung ? zeitText(zustand.letzteSicherung.zeit) : 'noch keine'}</dd>
              <dt>Anzahl</dt>
              <dd>
                {zustand.anzahl} von {SICHERUNGEN_BEHALTEN}
              </dd>
            </dl>
            {zustand.fehler && (
              <div className="hinweis hinweis-fehler" role="alert">
                <TriangleAlert className="i" aria-hidden />
                <p>{zustand.fehler}</p>
              </div>
            )}
            {zustand.standardOrdner && (
              <div className="hinweis">
                <HardDrive className="i" aria-hidden />
                <p>Die Kopien liegen bisher nur auf diesem Mac. Geht der Mac kaputt, sind sie mit weg. Vorschlag: einen Ordner auf einem USB-Stick oder einer externen Festplatte wählen.</p>
              </div>
            )}
          </>
        )}
        <div className="knopfreihe">
          <button type="button" className="knopf knopf-linie" disabled={beschaeftigt} onClick={() => void ordnerWaehlen()}>
            <FolderSearch className="i" aria-hidden />
            Ordner wählen …
          </button>
          <button type="button" className="knopf knopf-leise" onClick={() => api.sicherung.ordnerZeigen()}>
            <FolderOpen className="i" aria-hidden />
            Im Finder zeigen
          </button>
        </div>
        <div className="knopfreihe">
          {stand && (
            <button type="button" className="knopf knopf-linie" disabled={beschaeftigt} onClick={() => void sicherungJetzt()}>
              <Save className="i" aria-hidden />
              Sicherung jetzt erstellen
            </button>
          )}
          <button type="button" className="knopf knopf-linie" disabled={beschaeftigt} onClick={() => setWiederOffen(true)}>
            <ArchiveRestore className="i" aria-hidden />
            Sicherung wiederherstellen …
          </button>
        </div>
      </section>

      {stand && (
        <>
          <section className="karte form-karte">
            <h2>Stückware wie Eier</h2>
            <Wahl<Stueckware>
              name="stueckware"
              beschriftung="Stückware wie Eier"
              optionen={[
                { id: 'groesse', titel: 'Nach Größe', text: 'S, M oder L, mit Standardgewicht' },
                { id: 'gramm', titel: 'In Gramm', text: 'Du trägst das Gewicht selbst ein' },
              ]}
              wert={stand.profil.stueckware}
              onWert={(stueckware) => profilAendern({ stueckware })}
            />
          </section>

          <section className="karte">
            <h2>Welche Nährstoffe angezeigt werden</h2>
            <p className="leise">Am Anfang ist alles sichtbar. Was du hier abwählst, verschwindet aus den Listen; die Werte bleiben erhalten.</p>
            <div className="stapel">
              {GRUPPEN.map((g) => (
                <GruppenAuswahl key={g.id} gruppe={g} ausgeblendet={stand.profil.ausgeblendet} onAendern={(ausgeblendet) => profilAendern({ ausgeblendet })} />
              ))}
            </div>
            {stand.profil.ausgeblendet.length > 0 && (
              <div className="knopfreihe">
                <button type="button" className="knopf knopf-leise" onClick={() => profilAendern({ ausgeblendet: [] })}>
                  Alle {NAEHRSTOFFE.length} wieder anzeigen
                </button>
              </div>
            )}
          </section>
        </>
      )}

      <section className="karte ueber">
        <h2>Über Starkmacher</h2>
        {info && (
          <dl className="angaben">
            <dt>Fassung</dt>
            <dd>
              {info.version}
              {info.entwicklung && ' (Entwicklung, eigener Datenordner)'}
            </dd>
            <dt>Daten</dt>
            <dd className="ordner" title={info.datenOrdner}>
              {ohneHeim(info.datenOrdner)}
            </dd>
          </dl>
        )}
        <p className="leise">Komplett offline: Starkmacher verbindet sich mit keinem Server. Deine Daten bleiben auf diesem Mac und in deinem Sicherungsordner.</p>
        <h3>Quellen</h3>
        <ul className="quellen">
          <li>
            <b>Lebensmittel:</b> Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 – Deutsche Nährstoffdatenbank. DOI 10.25826/Data20251217-134202-0. Lizenz CC BY 4.0.
          </li>
          <li>
            <b>Zwei Stufen:</b> Das Minimum ist für jeden Nährstoff die jüngste eigene wissenschaftliche Herleitung einer europäischen Fachstelle oder der WHO, geprüft am 03.11.2026. Das Optimum ist deine eigene Vorgabe (Eiweiß, Fett, Ballaststoffe, EPA und DHA, Omega-6 zu Omega-3, Leucin). Die Quelle je Nährstoff steht unter „Mein Bedarf“ am Buchstaben neben dem Namen.
          </li>
          {QUELLEN.map((q) => (
            <li key={q.kurz}>
              <b>{q.kurz}:</b> {q.titel}, {q.adresse}.
            </li>
          ))}
          <li>
            <b>Grundumsatz und Aktivität:</b> Deutsche Gesellschaft für Ernährung, Fragen und Antworten zur Energiezufuhr (2015). Müller-Formel.
          </li>
          <li>
            <b>Eiweiß, Minimum:</b> EFSA 2012; Nordic Nutrition Recommendations 2023; König D et al., Proteinzufuhr im Sport, Ernährungs Umschau 2020; Morton RW et al., Br J Sports Med 2018; Tagawa R et al., Nutr Rev 2021; Enhanced protein intake in adults with overweight/obesity, Clin Nutr ESPEN 2024.
          </li>
          <li>
            <b>Tempo:</b> Hall KD et al., Lancet 2011; Thomas DM et al., Int J Obes 2013; S3-Leitlinie Adipositas 2024; Helms ER et al., Sports Med Open 2023; Slater GJ et al., Front Nutr 2019.
          </li>
          <li>
            <b>Freier Zucker:</b> höchstens 10 % der Energie (WHO 2015, Nordic Nutrition Recommendations 2023). Zucker aus ganzem Obst, Gemüse und Milch zählt nicht mit.
          </li>
          <li>
            <b>Schriften und Symbole:</b> Fraunces und Nunito (SIL Open Font License), Lucide (ISC-Lizenz).
          </li>
        </ul>
      </section>

      {wiederOffen && (
        <Wiederherstellen
          onSchliessen={() => {
            setWiederOffen(false);
            auffrischen();
          }}
        />
      )}
    </main>
  );
}

function GruppenAuswahl({ gruppe, ausgeblendet, onAendern }: { gruppe: Gruppe; ausgeblendet: readonly string[]; onAendern(ausgeblendet: string[]): void }) {
  const naehrstoffe = naehrstoffeDerGruppe(gruppe.id);
  const codes = naehrstoffe.map((n) => n.code);
  const sichtbar = codes.filter((c) => !ausgeblendet.includes(c)).length;
  const alle = sichtbar === codes.length;
  return (
    <details className={`gruppe g-${gruppe.id}`}>
      <summary>
        <input
          type="checkbox"
          aria-label={`${gruppe.titel} anzeigen`}
          checked={sichtbar > 0}
          ref={(el) => {
            if (el) el.indeterminate = sichtbar > 0 && !alle;
          }}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onAendern(sichtbar > 0 ? [...new Set([...ausgeblendet, ...codes])] : ausgeblendet.filter((c) => !codes.includes(c)))}
        />
        <span className="punkt" />
        <span className="gruppe-titel">{gruppe.titel}</span>
        <span className="stand">
          {sichtbar} von {codes.length}
        </span>
        <ChevronDown className="i pfeil" aria-hidden />
      </summary>
      <div className="zeilen auswahl-zeilen">
        {naehrstoffe.map((n) => (
          <label key={n.code} className="auswahl-zeile">
            <input
              type="checkbox"
              checked={!ausgeblendet.includes(n.code)}
              onChange={(e) => onAendern(e.target.checked ? ausgeblendet.filter((c) => c !== n.code) : [...ausgeblendet, n.code])}
            />
            {n.name}
          </label>
        ))}
      </div>
    </details>
  );
}

function Wiederherstellen({ onSchliessen }: { onSchliessen(): void }) {
  const { speichernJetzt, ersetzen } = useDaten();
  const { zeigen } = useMeldungen();
  const [liste, setListe] = useState<SicherungsEintrag[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gewaehlt, setGewaehlt] = useState<SicherungsEintrag | null>(null);
  const [rueckfrage, setRueckfrage] = useState(false);

  useEffect(() => {
    void api.sicherung.liste().then((antwort) => {
      if (antwort.ok) setListe(antwort.wert);
      else setFehler(antwort.meldung);
    });
  }, []);

  const wiederherstellen = async () => {
    if (!gewaehlt) return;
    setRueckfrage(false);
    await speichernJetzt();
    const antwort = await api.sicherung.wiederherstellen(gewaehlt.name);
    if (!antwort.ok) {
      zeigen({ art: 'fehler', text: antwort.meldung });
      return;
    }
    ersetzen(antwort.wert);
    zeigen({ art: 'info', text: `Der Stand vom ${zeitText(gewaehlt.zeit)} ist wiederhergestellt. Dein vorheriger Stand liegt als neue Sicherung im Ordner.` });
    onSchliessen();
  };

  return (
    <>
      <Dialog
        titel="Sicherung wiederherstellen"
        offen={!rueckfrage}
        breit
        onSchliessen={onSchliessen}
        onAbsenden={() => gewaehlt && setRueckfrage(true)}
        knoepfe={
          <>
            <button type="button" className="knopf knopf-linie" onClick={onSchliessen}>
              Abbrechen
            </button>
            <button type="submit" className="knopf knopf-akzent" disabled={!gewaehlt}>
              Wiederherstellen …
            </button>
          </>
        }
      >
        {fehler && <p className="feld-fehler">{fehler}</p>}
        {!fehler && liste === null && <p className="leise">Sicherungen werden gelesen …</p>}
        {liste?.length === 0 && <p className="leise">Im Sicherungsordner liegt noch keine Sicherung.</p>}
        {liste && liste.length > 0 && (
          <div className="sicherungsliste" role="radiogroup" aria-label="Sicherungen, die neueste zuerst">
            {liste.map((s) => (
              <label key={s.name} className={`sicherung${s.lesbar ? '' : ' sicherung-kaputt'}`}>
                <input type="radio" name="sicherung" disabled={!s.lesbar} checked={gewaehlt?.name === s.name} onChange={() => setGewaehlt(s)} />
                <span className="sicherung-zeit">{zeitText(s.zeit)}</span>
                <span className="sicherung-info">
                  {s.lesbar ? `${groesseText(s.groesse)}${s.fotos > 0 ? `, ${zahlText(s.fotos)} Fotos` : ''}` : 'lässt sich nicht lesen'}
                </span>
              </label>
            ))}
          </div>
        )}
      </Dialog>
      <Rueckfrage
        offen={rueckfrage}
        titel="Diesen Stand wiederherstellen?"
        text={gewaehlt ? `Starkmacher geht zurück auf den Stand vom ${zeitText(gewaehlt.zeit)}. Dein jetziger Stand wird vorher automatisch gesichert – du kannst also auch das wieder rückgängig machen.` : ''}
        bestaetigen="Wiederherstellen"
        onAbbrechen={() => setRueckfrage(false)}
        onBestaetigen={() => void wiederherstellen()}
      />
    </>
  );
}
