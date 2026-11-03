import type { ReactNode } from 'react';

const UMFANG = 2 * Math.PI * 82;

/** Der Teller mit Besteck (Design B): Der Rand füllt sich mit den Kalorien des Tages. */
export function Teller({ anteil, children }: { anteil: number; children: ReactNode }) {
  const gefuellt = Math.max(0, Math.min(1, anteil)) * UMFANG;
  return (
    <div className="gedeck">
      <svg className="besteck" viewBox="0 0 18 112" aria-hidden="true">
        <path fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" d="M3 3v24c0 6 3 8 6 8s6-2 6-8V3M9 3v28M9 35v74" />
      </svg>
      <div className="teller">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="98" fill="#FFF8F4" stroke="#F8D8CB" strokeWidth="2" />
          <circle cx="100" cy="100" r="66" fill="#FFFFFF" stroke="#F8D8CB" strokeWidth="1.5" />
          <circle cx="100" cy="100" r="82" fill="none" stroke="color-mix(in srgb, var(--g-energie) 20%, #fff)" strokeWidth="15" />
          {gefuellt > 0 && (
            <circle
              cx="100"
              cy="100"
              r="82"
              fill="none"
              stroke="var(--g-energie)"
              strokeWidth="15"
              strokeLinecap="round"
              strokeDasharray={`${gefuellt} ${UMFANG}`}
              transform="rotate(-90 100 100)"
            />
          )}
        </svg>
        <div className="teller-mitte">{children}</div>
      </div>
      <svg className="besteck" viewBox="0 0 18 112" aria-hidden="true">
        <path fill="currentColor" d="M7 2c6 6 9 19 7 44H8.500v61a2 2 0 0 1-4 0V6c0-3 1-5 2.500-4z" />
      </svg>
    </div>
  );
}
