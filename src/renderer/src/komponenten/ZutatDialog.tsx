import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { inGramm, type Groesse, type MengenEinheit, type Umrechnung } from '@shared/einheiten';
import { zahlText } from '@shared/format';
import { werteJe100g, type Lebensmittel } from '@shared/lebensmittel';
import { api } from '../api';
import { useDaten } from '../daten/DatenKontext';
import { Dialog } from './Dialog';
import { LebensmittelWahl } from './LebensmittelWahl';
import { Mengenwahl, startMenge, type Mengenstand } from './Mengenwahl';
import { useMeldungen } from './Meldungen';

export interface GewaehlteZutat {
  lebensmittelId: string;
  name: string;
  menge: number;
  einheit: MengenEinheit;
  groesse: Groesse | null;
  /** Für die Vorschau beim Anpassen im Tagebuch. */
  umrechnung: Umrechnung;
  werteJe100g: Record<string, number>;
}

/** Eine Zutat wählen und ihre Menge festlegen. Mit `start` öffnet das Fenster gleich bei der Menge. */
export function ZutatDialog(props: { offen: boolean; titel: string; start?: { lebensmittelId: string; menge: number; einheit: MengenEinheit; groesse: Groesse | null } | null; onSchliessen(): void; onFertig(zutat: GewaehlteZutat): void }) {
  const { offen, start } = props;
  const { stand } = useDaten();
  const { zeigen } = useMeldungen();
  const [lm, setLm] = useState<Lebensmittel | null>(null);
  const [mengen, setMengen] = useState<Mengenstand>({ menge: 100, einheit: 'g', groesse: 'M' });
  const mitGroessen = stand?.profil.stueckware !== 'gramm';

  const waehlen = (id: string, vorgabe?: Mengenstand) => {
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
    if (start) waehlen(start.lebensmittelId, { menge: start.menge, einheit: start.einheit, groesse: start.groesse ?? 'M' });
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

  const fertig = () => {
    if (!lm || mengen.menge === null || gramm === null) return;
    props.onFertig({
      lebensmittelId: lm.id,
      name: lm.name,
      menge: mengen.menge,
      einheit: mengen.einheit,
      groesse: mengen.einheit === 'Stück' && lm.umrechnung.groessen ? mengen.groesse : null,
      umrechnung: lm.umrechnung,
      werteJe100g: werteJe100g(lm),
    });
  };

  const kcal = lm && gramm !== null ? werteJe100g(lm).ENERCC : undefined;
  return (
    <Dialog
      titel={props.titel}
      offen={offen}
      breit
      onSchliessen={props.onSchliessen}
      onAbsenden={fertig}
      knoepfe={
        lm ? (
          <>
            {!start && (
              <button type="button" className="knopf knopf-linie" onClick={() => setLm(null)}>
                <ArrowLeft className="i" aria-hidden /> Anderes Lebensmittel
              </button>
            )}
            <button type="submit" className="knopf knopf-akzent" disabled={mengen.menge === null || gramm === null}>
              Übernehmen
            </button>
          </>
        ) : undefined
      }
    >
      {lm ? (
        <div className="stapel">
          <b className="eintrag-name">{lm.name}</b>
          <Mengenwahl umrechnung={lm.umrechnung} stand={mengen} mitGroessen={mitGroessen} onStand={setMengen} onUmrechnung={umrechnungSetzen} />
          {gramm !== null && (
            <p className="eintrag-vorschau">
              ≈ {zahlText(gramm, gramm < 10 ? 1 : 0)} g{kcal !== undefined && `, ${zahlText((kcal * gramm) / 100)} kcal`}
            </p>
          )}
        </div>
      ) : (
        <LebensmittelWahl onWahl={(id) => waehlen(id)} />
      )}
    </Dialog>
  );
}
