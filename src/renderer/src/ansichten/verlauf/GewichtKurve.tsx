import { useEffect, useMemo, useRef, useState } from 'react';
import { datumText, zahlText } from '@shared/format';
import type { Gewicht } from '@shared/profil';
import { gewichtsAchse } from '@shared/rueckblick';

const HOEHE = 240;
const RAND = { oben: 14, rechts: 72, unten: 28, links: 44 };
const MARKEN_BIS = 60;
const MONATE = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

const zeitVon = (datum: string) => new Date(`${datum}T12:00:00`).getTime();
const kgText = (kg: number) => `${zahlText(kg, 1)} kg`;

function kurzesDatum(zeit: number, mitJahr: boolean): string {
  const d = new Date(zeit);
  return `${d.getDate()}. ${MONATE[d.getMonth()]}${mitJahr ? ` ${String(d.getFullYear()).slice(2)}` : ''}`;
}

/**
 * Das Gewicht über die Zeit als Linie. Die Zeit läuft maßstabsgetreu, ein großer Abstand zwischen zwei Werten bleibt also sichtbar.
 * Der Fadenkreuz-Hinweis springt zum nächsten Wert. Die Tabelle unter der Kurve zeigt dasselbe ohne Maus.
 */
export function GewichtKurve({ gewichte }: { gewichte: readonly Gewicht[] }) {
  const flaeche = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(640);
  const [nah, setNah] = useState<number | null>(null);

  useEffect(() => {
    const el = flaeche.current;
    if (!el) return;
    const messen = () => setBreite(Math.max(280, el.clientWidth));
    messen();
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, []);

  const achse = useMemo(() => gewichtsAchse(gewichte.map((g) => g.kg)), [gewichte]);
  const anfang = zeitVon(gewichte[0]!.datum);
  const ende = zeitVon(gewichte.at(-1)!.datum);
  const innen = breite - RAND.links - RAND.rechts;
  const hoch = HOEHE - RAND.oben - RAND.unten;
  const xVon = (zeit: number) => (ende === anfang ? RAND.links + innen / 2 : RAND.links + ((zeit - anfang) / (ende - anfang)) * innen);
  const yVon = (kg: number) => RAND.oben + (1 - (kg - achse.von) / (achse.bis - achse.von)) * hoch;
  const punkte = gewichte.map((g) => ({ ...g, x: xVon(zeitVon(g.datum)), y: yVon(g.kg) }));
  const letzter = punkte.at(-1)!;

  // Soweit die Beschriftung passt, sonst weniger Daten.
  const mitJahr = new Date(anfang).getFullYear() !== new Date(ende).getFullYear();
  const platz = Math.max(2, Math.floor(innen / (mitJahr ? 92 : 76)));
  const zeiten = ende === anfang ? [anfang] : Array.from({ length: platz }, (_, i) => anfang + ((ende - anfang) * i) / (platz - 1));

  const bewegen = (clientX: number) => {
    const links = flaeche.current?.getBoundingClientRect().left ?? 0;
    const x = clientX - links;
    let beste = 0;
    punkte.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs(punkte[beste]!.x - x)) beste = i;
    });
    setNah(beste);
  };

  const aktiv = nah === null ? null : (punkte[nah] ?? null);
  const verlauf = punkte.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const beschreibung = `Gewichtskurve mit ${punkte.length} ${punkte.length === 1 ? 'Wert' : 'Werten'}: zuletzt ${kgText(letzter.kg)} am ${datumText(letzter.datum)}.`;

  return (
    <div ref={flaeche} className="kurve" onPointerMove={(e) => bewegen(e.clientX)} onPointerLeave={() => setNah(null)}>
      <svg width={breite} height={HOEHE} role="img" aria-label={beschreibung}>
        {achse.striche.map((s) => (
          <g key={s}>
            <line className="kurve-gitter" x1={RAND.links} x2={breite - RAND.rechts} y1={yVon(s)} y2={yVon(s)} />
            <text className="kurve-text" x={RAND.links - 8} y={yVon(s) + 4} textAnchor="end">
              {zahlText(s, 1)}
            </text>
          </g>
        ))}
        {zeiten.map((z, i) => (
          <text key={z} className="kurve-text" x={xVon(z)} y={HOEHE - 8} textAnchor={zeiten.length === 1 ? 'middle' : i === 0 ? 'start' : i === zeiten.length - 1 ? 'end' : 'middle'}>
            {kurzesDatum(z, mitJahr)}
          </text>
        ))}
        {punkte.length > 1 && <path className="kurve-linie" d={verlauf} />}
        {aktiv && <line className="kurve-kreuz" x1={aktiv.x} x2={aktiv.x} y1={RAND.oben} y2={HOEHE - RAND.unten} />}
        {(punkte.length <= MARKEN_BIS ? punkte : [letzter]).map((p) => (
          <circle key={p.datum} className="kurve-punkt" cx={p.x} cy={p.y} r={4} />
        ))}
        {aktiv && <circle className="kurve-punkt" cx={aktiv.x} cy={aktiv.y} r={6} />}
        <text className="kurve-wert" x={letzter.x + 10} y={letzter.y + 4}>
          {kgText(letzter.kg)}
        </text>
      </svg>
      {aktiv && (
        <div className="kurve-tipp" role="status" style={{ top: Math.max(0, aktiv.y - 26), ...(aktiv.x > RAND.links + innen / 2 ? { right: breite - aktiv.x + 12 } : { left: aktiv.x + 12 }) }}>
          <b>{kgText(aktiv.kg)}</b>
          <span>{datumText(aktiv.datum)}</span>
        </div>
      )}
    </div>
  );
}
