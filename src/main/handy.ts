/**
 * Die Handy-Seite (Bauauftrag 5.3): Das Handy öffnet über den QR-Code eine einfache Seite direkt vom Mac und schickt so
 * Fotos über das eigene WLAN. Die Verbindung ist nur offen, solange das Fenster offen ist, hat eine zufällige
 * Einmal-Adresse und nimmt nur Bilder an. Die Sperre ins Internet betrifft das nicht: Hier fragt niemand etwas im Internet an.
 */
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import type { AddressInfo } from 'node:net';
import { bildArt, BILD_HOECHSTENS_BYTES } from '@shared/bildArt';
import { handySeiteHtml } from './handySeite';

/** Nach so langer Ruhe schließt sich die Verbindung von selbst, falls das Fenster offen vergessen wurde. */
const RUHE_MS = 15 * 60 * 1000;
const FOTOS_HOECHSTENS = 40;

const privat = (ip: string) => /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(ip);

/** Die Adresse dieses Macs im eigenen WLAN. Null: Er ist gerade in keinem Netz. en0 ist beim Mac das WLAN. */
export function lokaleAdresse(netze: Readonly<Record<string, readonly NetworkInterfaceInfo[] | undefined>> = networkInterfaces()): string | null {
  const passend = (name: string) => (netze[name] ?? []).find((a) => a.family === 'IPv4' && !a.internal && privat(a.address))?.address ?? null;
  const wlan = passend('en0');
  if (wlan) return wlan;
  for (const name of Object.keys(netze).filter((n) => /^en\d/.test(n))) {
    const a = passend(name);
    if (a) return a;
  }
  return null;
}

export interface HandyOptionen {
  /** Überschrift auf dem Handy: „Foto für dein Lebensmittel“. */
  titel: string;
  /** Die Adresse, unter der die Seite erreichbar ist. */
  adresse: string;
  beiBild(daten: Buffer): void;
  /** Die Verbindung hat sich von selbst geschlossen. */
  beiEnde?(): void;
  ruheMs?: number;
}

export class HandySeite {
  private server: Server | null = null;
  private ruhe: NodeJS.Timeout | null = null;
  private fotos = 0;

  get offen(): boolean {
    return this.server !== null;
  }

  /** Öffnet die Verbindung unter einer neuen Einmal-Adresse. */
  async oeffnen(o: HandyOptionen): Promise<string> {
    this.schliessen();
    const zeichen = randomBytes(18).toString('base64url');
    const seite = `/${zeichen}/`;
    const bild = `/${zeichen}/bild`;
    const html = handySeiteHtml(o.titel);
    this.fotos = 0;

    const server = createServer((anfrage, antwort) => {
      this.ruheNeu(o);
      if (anfrage.method === 'GET' && anfrage.url === seite) {
        antwort.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
        });
        antwort.end(html);
        return;
      }
      if (anfrage.method === 'POST' && anfrage.url === bild) {
        this.bildAnnehmen(anfrage, antwort, o);
        return;
      }
      // Wer die Adresse nicht kennt, erfährt nichts.
      antwort.writeHead(404);
      antwort.end();
    });
    server.requestTimeout = 120_000;
    await new Promise<void>((fertig, fehler) => {
      server.once('error', fehler);
      server.listen(0, o.adresse, () => fertig());
    });
    this.server = server;
    this.ruheNeu(o);
    return `http://${o.adresse}:${(server.address() as AddressInfo).port}${seite}`;
  }

  private antworten(antwort: ServerResponse, status: number, meldung: string): void {
    antwort.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    antwort.end(meldung);
  }

  private bildAnnehmen(anfrage: IncomingMessage, antwort: ServerResponse, o: HandyOptionen): void {
    if (this.fotos >= FOTOS_HOECHSTENS) {
      this.antworten(antwort, 429, 'Das sind genug Fotos für dieses Mal.');
      anfrage.destroy();
      return;
    }
    const teile: Buffer[] = [];
    let groesse = 0;
    let zuGross = false;
    anfrage.on('data', (teil: Buffer) => {
      groesse += teil.length;
      if (groesse > BILD_HOECHSTENS_BYTES) {
        zuGross = true;
        this.antworten(antwort, 413, 'Dieses Bild ist zu groß.');
        anfrage.destroy();
        return;
      }
      teile.push(teil);
    });
    anfrage.on('end', () => {
      if (zuGross) return;
      const daten = Buffer.concat(teile);
      if (bildArt(daten) === null) {
        this.antworten(antwort, 415, 'Es lassen sich nur Bilder schicken.');
        return;
      }
      this.fotos++;
      this.antworten(antwort, 200, 'angekommen');
      o.beiBild(daten);
    });
    anfrage.on('error', () => {});
  }

  private ruheNeu(o: HandyOptionen): void {
    if (this.ruhe) clearTimeout(this.ruhe);
    this.ruhe = setTimeout(() => {
      this.schliessen();
      o.beiEnde?.();
    }, o.ruheMs ?? RUHE_MS);
    this.ruhe.unref?.();
  }

  schliessen(): void {
    if (this.ruhe) clearTimeout(this.ruhe);
    this.ruhe = null;
    const server = this.server;
    this.server = null;
    if (!server) return;
    server.close();
    server.closeAllConnections();
  }
}
