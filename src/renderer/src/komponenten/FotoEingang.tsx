import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { ImagePlus, LoaderCircle, Smartphone } from 'lucide-react';
import qrcode from 'qrcode-generator';
import type { Antwort, FotoErgebnis, FotoZweck } from '@shared/api';
import { api } from '../api';
import { Dialog } from './Dialog';
import { useMeldungen } from './Meldungen';

function QrCode({ text }: { text: string }) {
  const { pfad, groesse } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let zeile = 0; zeile < n; zeile++) {
      for (let spalte = 0; spalte < n; spalte++) {
        if (qr.isDark(zeile, spalte)) d += `M${spalte} ${zeile}h1v1h-1z`;
      }
    }
    return { pfad: d, groesse: n };
  }, [text]);
  // Der weiße Rand gehört zum Code, ohne ihn lesen ihn Kameras schlechter.
  return (
    <svg className="qr-code" viewBox={`-4 -4 ${groesse + 8} ${groesse + 8}`} role="img" aria-label="QR-Code für dein Handy" shapeRendering="crispEdges">
      <rect x={-4} y={-4} width={groesse + 8} height={groesse + 8} fill="#fff" />
      <path d={pfad} fill="#000" />
    </svg>
  );
}

const ANLEITUNG: Readonly<Record<FotoZweck, string>> = {
  lebensmittel: 'Fotografiere die Nährwerttabelle oder den Barcode der Packung.',
  rezept: 'Fotografiere das Rezept oder die Zutatenliste. Bei mehreren Seiten schickst du einfach mehrere Fotos.',
};

/**
 * Die Handy-Seite: Solange dieses Fenster offen ist, nimmt der Mac Fotos über das eigene WLAN an. Es gehört auf die Seite
 * und nicht in den Eingang: Beim ersten Foto wechselt die Seite zur Prüfseite, das Fenster muss dabei offen bleiben.
 */
export function HandyDialog({ offen, zweck, onSchliessen, onErgebnis }: { offen: boolean; zweck: FotoZweck; onSchliessen(): void; onErgebnis(e: FotoErgebnis): void }) {
  // Ein Foto trifft immer den aktuellen Stand der Seite, auch wenn das Fenster schon länger offen ist.
  const empfaenger = useRef(onErgebnis);
  empfaenger.current = onErgebnis;
  const [adresse, setAdresse] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [angekommen, setAngekommen] = useState(0);
  const [geschlossen, setGeschlossen] = useState(false);

  useEffect(() => {
    if (!offen) return;
    let abgebrochen = false;
    setAdresse(null);
    setFehler(null);
    setAngekommen(0);
    setGeschlossen(false);
    const ende = api.fotos.beiHandy((ereignis) => {
      if (ereignis.art === 'foto') {
        setAngekommen((n) => n + 1);
        setFehler(null);
        empfaenger.current(ereignis.ergebnis);
      } else if (ereignis.art === 'fehler') {
        setFehler(ereignis.meldung);
      } else {
        setGeschlossen(true);
        setAdresse(null);
      }
    });
    void api.fotos.handyOeffnen(zweck).then((a) => {
      if (abgebrochen) return;
      if (a.ok) setAdresse(a.wert.adresse);
      else setFehler(a.meldung);
    });
    return () => {
      abgebrochen = true;
      ende();
      api.fotos.handySchliessen();
    };
  }, [offen, zweck]);

  return (
    <Dialog
      titel="Foto vom Handy"
      offen={offen}
      onSchliessen={onSchliessen}
      knoepfe={
        <button type="button" className="knopf knopf-akzent" onClick={onSchliessen}>
          {angekommen > 0 ? 'Fertig' : 'Schließen'}
        </button>
      }
    >
      <div className="stapel handy-fenster">
        {fehler && (
          <div className="hinweis hinweis-fehler" role="alert">
            <p>{fehler}</p>
          </div>
        )}
        {geschlossen && <p className="sanft-hinweis">Die Verbindung hat sich nach langer Pause geschlossen. Öffne dieses Fenster neu, um weitere Fotos zu schicken.</p>}
        {adresse && (
          <>
            <QrCode text={adresse} />
            <ol className="handy-schritte">
              <li>Dein Handy muss im selben WLAN sein wie dein Mac.</li>
              <li>Halte die Kamera des Handys auf den Code und öffne den Link.</li>
              <li>{ANLEITUNG[zweck]}</li>
            </ol>
            <p className="leise handy-adresse" data-adresse={adresse}>
              Oder tippe diese Adresse ins Handy: {adresse}
            </p>
            <p className="leise">Die Verbindung ist nur offen, solange dieses Fenster offen ist. Sie bleibt in deinem WLAN und nimmt nur Bilder an.</p>
          </>
        )}
        {!adresse && !fehler && !geschlossen && <LoaderCircle className="i gross dreht" aria-hidden />}
        {angekommen > 0 && (
          <p className="sanft-hinweis" role="status">
            ✓ {angekommen === 1 ? 'Ein Foto ist' : `${angekommen} Fotos sind`} angekommen. Wenn das alles war, klick auf Fertig.
          </p>
        )}
      </div>
    </Dialog>
  );
}

/** Ein Foto hineinziehen, auswählen oder vom Handy schicken. Klein: für weitere Fotos auf der Prüfseite. */
export function FotoEingang({ zweck, klein, text, onErgebnis, onHandy }: { zweck: FotoZweck; klein?: boolean; text?: string; onErgebnis(e: FotoErgebnis): void; onHandy(): void }) {
  const { zeigen } = useMeldungen();
  const [liest, setLiest] = useState(0);
  const [drueber, setDrueber] = useState(false);

  const fertig = (a: Antwort<FotoErgebnis | null>) => {
    setLiest((n) => n - 1);
    if (!a.ok) zeigen({ art: 'fehler', text: a.meldung });
    else if (a.wert) onErgebnis(a.wert);
  };

  const waehlen = () => {
    setLiest((n) => n + 1);
    void api.fotos.waehlen(zweck).then(fertig);
  };

  const fallen = (e: DragEvent) => {
    e.preventDefault();
    setDrueber(false);
    for (const datei of Array.from(e.dataTransfer.files)) {
      setLiest((n) => n + 1);
      void datei
        .arrayBuffer()
        .then((inhalt) => api.fotos.einlesen(new Uint8Array(inhalt), zweck))
        .then(fertig);
    }
  };

  return (
    <div
      className={`foto-eingang${klein ? ' klein' : ''}${drueber ? ' drueber' : ''}`}
      aria-label="Foto hineinziehen"
      role="group"
      onDragOver={(e) => {
        e.preventDefault();
        setDrueber(true);
      }}
      onDragLeave={() => setDrueber(false)}
      onDrop={fallen}
    >
      {!klein && <p className="foto-eingang-text">{text ?? 'Zieh ein Foto hierher, oder wähle eins aus.'}</p>}
      <div className="knopfreihe foto-eingang-knoepfe">
        <button type="button" className={`knopf ${klein ? 'knopf-linie knopf-klein' : 'knopf-akzent'}`} onClick={waehlen}>
          <ImagePlus className="i" aria-hidden /> {klein ? 'Weiteres Foto' : 'Foto wählen'}
        </button>
        <button type="button" className={`knopf knopf-linie${klein ? ' knopf-klein' : ''}`} onClick={onHandy}>
          <Smartphone className="i" aria-hidden /> Foto vom Handy
        </button>
      </div>
      {liest > 0 && (
        <p className="foto-liest" role="status">
          <LoaderCircle className="i dreht" aria-hidden /> Starkmacher liest das Foto …
        </p>
      )}
    </div>
  );
}
