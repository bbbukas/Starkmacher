import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DialogProps {
  titel: string;
  offen: boolean;
  onSchliessen(): void;
  /** Wenn gesetzt, ist der Inhalt ein Formular – Enter löst das hier aus. */
  onAbsenden?(): void;
  children: ReactNode;
  knoepfe?: ReactNode;
  breit?: boolean;
}

/** Offene Fenster, das oberste zuletzt – Escape schließt nur das oberste. */
const offeneFenster: symbol[] = [];

/**
 * Fenster in der Mitte. Escape oder Klick daneben schließt. Wird direkt in
 * <body> gezeichnet, damit Fenster in Fenstern eigene Formulare haben.
 */
export function Dialog({ titel, offen, onSchliessen, onAbsenden, children, knoepfe, breit }: DialogProps) {
  const kasten = useRef<HTMLDivElement>(null);
  const schliessen = useRef(onSchliessen);
  schliessen.current = onSchliessen;

  useEffect(() => {
    if (!offen) return;
    const zeichen = Symbol(titel);
    offeneFenster.push(zeichen);
    const vorher = document.activeElement as HTMLElement | null;
    const erstes = kasten.current?.querySelector<HTMLElement>('[data-autofokus], input:not(:disabled), textarea, select, button.knopf-akzent');
    erstes?.focus();
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && offeneFenster.at(-1) === zeichen) {
        e.stopPropagation();
        schliessen.current();
      }
    };
    window.addEventListener('keydown', taste);
    return () => {
      window.removeEventListener('keydown', taste);
      offeneFenster.splice(offeneFenster.indexOf(zeichen), 1);
      vorher?.focus?.();
    };
    // Nur beim Öffnen und Schließen – nicht bei jeder neuen onSchliessen-Funktion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offen]);

  if (!offen) return null;

  const absenden = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onAbsenden?.();
  };

  return createPortal(
    <div className="dialog-hintergrund" onMouseDown={(e) => e.target === e.currentTarget && onSchliessen()}>
      <div ref={kasten} className={`dialog${breit ? ' dialog-breit' : ''}`} role="dialog" aria-modal="true" aria-label={titel}>
        <form onSubmit={absenden}>
          <div className="dialog-kopf">
            <h2>{titel}</h2>
            <button type="button" className="symbolknopf" onClick={onSchliessen} aria-label="Schließen">
              <X className="i" aria-hidden />
            </button>
          </div>
          <div className="dialog-inhalt">{children}</div>
          {knoepfe && <div className="dialog-knoepfe">{knoepfe}</div>}
        </form>
      </div>
    </div>,
    document.body,
  );
}

/** Rückfrage vor Entfernen, Wiederherstellen o. Ä. */
export function Rueckfrage(props: {
  offen: boolean;
  titel: string;
  text: ReactNode;
  bestaetigen: string;
  onBestaetigen(): void;
  onAbbrechen(): void;
}) {
  return (
    <Dialog
      titel={props.titel}
      offen={props.offen}
      onSchliessen={props.onAbbrechen}
      onAbsenden={props.onBestaetigen}
      knoepfe={
        <>
          <button type="button" className="knopf knopf-linie" onClick={props.onAbbrechen}>
            Abbrechen
          </button>
          <button type="submit" className="knopf knopf-akzent">
            {props.bestaetigen}
          </button>
        </>
      }
    >
      <p className="dialog-text">{props.text}</p>
    </Dialog>
  );
}
