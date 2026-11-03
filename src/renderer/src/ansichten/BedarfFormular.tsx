/**
 * Die Eingaben für „Mein Bedarf“. Dieselben Abschnitte erscheinen beim ersten Start
 * Schritt für Schritt und später auf der Seite „Mein Bedarf“ untereinander.
 */
import { AKTIVITAETEN, TEMPO_KCAL, type Bedarf } from '@shared/bedarf';
import { datumText, zahlText } from '@shared/format';
import { geburtsjahrErlaubt, gewichtErlaubt, groesseErlaubt, kcalErlaubt, makroErlaubt, neuestesGewicht, type Geschlecht, type Tempo, type Ziel } from '@shared/profil';
import { useDaten } from '../daten/DatenKontext';
import { Haken, Wahl, ZahlFeld } from '../komponenten/Felder';
import { Teller } from '../komponenten/Teller';

const GESCHLECHTER: readonly { id: Geschlecht; titel: string }[] = [
  { id: 'weiblich', titel: 'Weiblich' },
  { id: 'maennlich', titel: 'Männlich' },
];

const ZIELE: readonly { id: Ziel; titel: string; text: string }[] = [
  { id: 'abnehmen', titel: 'Abnehmen', text: 'Etwas weniger essen, als du verbrauchst' },
  { id: 'halten', titel: 'Gewicht halten', text: 'So viel essen, wie du verbrauchst' },
  { id: 'aufbauen', titel: 'Muskeln aufbauen', text: 'Etwas mehr essen, dazu viel Eiweiß' },
  { id: 'eigene', titel: 'Eigene Werte', text: 'Du trägst Kalorien und Makros selbst ein' },
];

const vorzeichen = (kcal: number) => `${kcal > 0 ? '+' : '−'}${zahlText(Math.abs(kcal))} kcal am Tag`;

export function UeberDich() {
  const { stand, profilAendern, gewichtEintragen } = useDaten();
  if (!stand) return null;
  const { profil, gewichte } = stand;
  const gewicht = neuestesGewicht(gewichte);
  const jahr = new Date().getFullYear();
  return (
    <>
      <div className="feld">
        <span className="feld-titel" id="geschlecht-titel">
          Geschlecht (für die Berechnung)
        </span>
        <Wahl name="geschlecht" beschriftung="Geschlecht" optionen={GESCHLECHTER} wert={profil.geschlecht} onWert={(geschlecht) => profilAendern({ geschlecht })} />
      </div>
      <div className="feld-reihe">
        <ZahlFeld
          label="Geburtsjahr"
          wert={profil.geburtsjahr}
          stellen={0}
          leerErlaubt
          platzhalter="1990"
          istErlaubt={(j) => geburtsjahrErlaubt(j, jahr)}
          fehlerText="Bitte ein Geburtsjahr mit vier Ziffern eintragen."
          hilfe="Dein Alter rechnet Starkmacher dann selbst weiter."
          onWert={(geburtsjahr) => profilAendern({ geburtsjahr })}
        />
        <ZahlFeld
          label="Größe"
          einheit="cm"
          wert={profil.groesseCm}
          stellen={1}
          leerErlaubt
          platzhalter="175"
          istErlaubt={groesseErlaubt}
          fehlerText="Bitte die Größe in Zentimetern eintragen, zum Beispiel 175."
          onWert={(groesseCm) => profilAendern({ groesseCm })}
        />
        <ZahlFeld
          label="Gewicht"
          einheit="kg"
          wert={gewicht?.kg ?? null}
          stellen={1}
          platzhalter="70"
          istErlaubt={gewichtErlaubt}
          fehlerText="Bitte das Gewicht in Kilogramm eintragen, zum Beispiel 70,5."
          hilfe={gewicht ? `Zuletzt eingetragen am ${datumText(gewicht.datum)}. Ein neuer Wert gilt ab heute.` : undefined}
          onWert={(kg) => {
            if (kg !== null) gewichtEintragen(kg);
          }}
        />
      </div>
    </>
  );
}

export function AktivitaetWahl() {
  const { stand, profilAendern } = useDaten();
  if (!stand) return null;
  const { profil } = stand;
  return (
    <>
      <Wahl
        name="aktivitaet"
        beschriftung="Wie sieht dein Alltag aus?"
        optionen={AKTIVITAETEN.map((a) => ({ id: a.id, titel: a.titel, text: a.text }))}
        wert={profil.aktivitaet}
        onWert={(aktivitaet) => profilAendern({ aktivitaet })}
      />
      <Haken label="Ich mache 4–5 Mal pro Woche 30–60 Minuten Sport" wert={profil.sport} onWert={(sport) => profilAendern({ sport })} />
    </>
  );
}

export function ZielWahl() {
  const { stand, bedarf, profilAendern } = useDaten();
  if (!stand) return null;
  const { profil } = stand;
  const tempoZiel = profil.ziel === 'abnehmen' || profil.ziel === 'aufbauen' ? profil.ziel : null;
  return (
    <>
      <Wahl name="ziel" beschriftung="Dein Ziel" optionen={ZIELE} wert={profil.ziel} onWert={(ziel) => profilAendern({ ziel })} />
      {tempoZiel && (
        <div className="feld">
          <span className="feld-titel">Tempo</span>
          <Wahl<Tempo>
            name="tempo"
            beschriftung="Tempo"
            optionen={[
              { id: 'sanft', titel: 'Sanft', text: tempoZiel === 'abnehmen' ? `Etwa 0,25 kg pro Woche (${vorzeichen(TEMPO_KCAL.abnehmen.sanft)})` : vorzeichen(TEMPO_KCAL.aufbauen.sanft) },
              { id: 'mittel', titel: 'Mittel', text: tempoZiel === 'abnehmen' ? `Etwa 0,5 kg pro Woche (${vorzeichen(TEMPO_KCAL.abnehmen.mittel)})` : vorzeichen(TEMPO_KCAL.aufbauen.mittel) },
            ]}
            wert={profil.tempo}
            onWert={(tempo) => profilAendern({ tempo })}
          />
        </div>
      )}
      {profil.ziel === 'eigene' && (
        <div className="feld-reihe feld-reihe-4">
          <ZahlFeld
            label="Kalorien"
            einheit="kcal"
            wert={profil.eigeneKcal}
            stellen={0}
            leerErlaubt
            istErlaubt={kcalErlaubt}
            fehlerText="Bitte eine Zahl zwischen 500 und 8.000 eintragen."
            onWert={(eigeneKcal) => profilAendern({ eigeneKcal })}
          />
          <ZahlFeld
            label="Eiweiß"
            einheit="g"
            wert={profil.eigeneEiweissG}
            leerErlaubt
            platzhalter={bedarf ? zahlText(bedarf.eiweissG) : undefined}
            istErlaubt={makroErlaubt}
            fehlerText="Bitte eine Zahl bis 1.500 eintragen."
            onWert={(eigeneEiweissG) => profilAendern({ eigeneEiweissG })}
          />
          <ZahlFeld
            label="Fett"
            einheit="g"
            wert={profil.eigeneFettG}
            leerErlaubt
            platzhalter={bedarf ? zahlText(bedarf.fettG) : undefined}
            istErlaubt={makroErlaubt}
            fehlerText="Bitte eine Zahl bis 1.500 eintragen."
            onWert={(eigeneFettG) => profilAendern({ eigeneFettG })}
          />
          <ZahlFeld
            label="Kohlenhydrate"
            einheit="g"
            wert={profil.eigeneKohlenhydrateG}
            leerErlaubt
            platzhalter={bedarf ? zahlText(bedarf.kohlenhydrateG) : undefined}
            istErlaubt={makroErlaubt}
            fehlerText="Bitte eine Zahl bis 1.500 eintragen."
            onWert={(eigeneKohlenhydrateG) => profilAendern({ eigeneKohlenhydrateG })}
          />
        </div>
      )}
    </>
  );
}

function MakroZahl({ klasse, titel, gramm, text }: { klasse: string; titel: string; gramm: number; text?: string }) {
  return (
    <div className={`makro ${klasse}`}>
      <span className="wort">{titel}</span>
      <span className="zahl">
        {zahlText(gramm, 1)} <small>g</small>
      </span>
      {text && <small className="makro-text">{text}</small>}
    </div>
  );
}

/** Das Ergebnis: der Tagesbedarf auf dem Teller, daneben die Makros und wie er zustande kommt. */
export function BedarfErgebnis({ bedarf }: { bedarf: Bedarf }) {
  const { stand } = useDaten();
  const ziel = stand?.profil.ziel;
  const eigen = ziel === 'eigene';
  return (
    <div className="ergebnis">
      <div className="ergebnis-oben">
        <Teller anteil={1}>
          <span className="teller-zahl">{zahlText(bedarf.kcal)}</span>
          <small>kcal am Tag</small>
        </Teller>
        <div className="makros">
          <MakroZahl klasse="g-aminosaeuren" titel="Eiweiß" gramm={bedarf.eiweissG} text={eigen ? undefined : `${zahlText(bedarf.eiweissFaktor, 1)} g je kg`} />
          <MakroZahl klasse="g-fettsaeuren" titel="Fett" gramm={bedarf.fettG} text={eigen ? undefined : `${zahlText(bedarf.fettAnteil * 100)} % der Energie`} />
          <MakroZahl klasse="g-kohlenhydrate" titel="Kohlenhydrate" gramm={bedarf.kohlenhydrateG} text={eigen ? undefined : 'der Rest'} />
        </div>
      </div>

      {bedarf.untergrenzeGegriffen && (
        <p className="sanft-hinweis" role="status">
          {eigen
            ? `Du hast ${zahlText(bedarf.wunschKcal)} kcal eingetragen. Damit dein Körper genug bekommt, setzt Starkmacher das Ziel auf ${zahlText(bedarf.kcal)} kcal.`
            : `Damit dein Körper genug bekommt, bleibt dein Ziel bei ${zahlText(bedarf.kcal)} kcal statt ${zahlText(bedarf.wunschKcal)} kcal. Es geht dann etwas langsamer, dafür gut versorgt.`}
        </p>
      )}
      {ziel === 'aufbauen' && <p className="feld-hilfe">Eiweiß hilft den Muskeln nur zusammen mit Training.</p>}

      {!eigen && (
        <dl className="rechenweg">
          <div>
            <dt>Grundumsatz</dt>
            <dd>{zahlText(bedarf.grundumsatz)} kcal</dd>
          </div>
          <div>
            <dt>Aktivität (PAL)</dt>
            <dd>× {zahlText(bedarf.pal, 1)}</dd>
          </div>
          <div>
            <dt>Dein Verbrauch</dt>
            <dd>{zahlText(bedarf.gesamtumsatz)} kcal</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

export const HINWEIS_GESUND =
  'Die Berechnung ist für gesunde Erwachsene gedacht. Für Schwangere, Stillende, Jugendliche und bei Erkrankungen bitte ärztlich beraten lassen.';
