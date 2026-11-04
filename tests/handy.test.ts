/** Die Handy-Seite (Bauauftrag Abschnitt 12): nur mit gültiger Adresse, nur Bilder, schließt sich wieder. Über 127.0.0.1, nie ins WLAN. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NetworkInterfaceInfo } from 'node:os';
import { BILD_HOECHSTENS_BYTES } from '@shared/bildArt';
import { HandySeite, lokaleAdresse } from '../src/main/handy';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);

let handy: HandySeite;
const eingegangen: Buffer[] = [];

async function oeffnen(ruheMs?: number, beiEnde?: () => void): Promise<string> {
  handy = new HandySeite();
  eingegangen.length = 0;
  return handy.oeffnen({ titel: 'Foto für <dein> Lebensmittel', adresse: '127.0.0.1', beiBild: (d) => eingegangen.push(d), ...(ruheMs ? { ruheMs } : {}), ...(beiEnde ? { beiEnde } : {}) });
}

const senden = (url: string, inhalt: Buffer | string) => fetch(`${url}bild`, { method: 'POST', body: typeof inhalt === 'string' ? inhalt : new Uint8Array(inhalt) });

afterEach(() => handy?.schliessen());

describe('Die Handy-Seite', () => {
  it('zeigt mit der richtigen Adresse die Seite, ohne etwas nachzuladen', async () => {
    const url = await oeffnen();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[\w-]{24}\/$/);
    const antwort = await fetch(url);
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(antwort.headers.get('cache-control')).toBe('no-store');
    const html = await antwort.text();
    expect(html).toContain('Foto aufnehmen');
    expect(html).toContain('capture="environment"');
    expect(html).toContain('Aus der Galerie wählen');
    expect(html).toContain('multiple');
    expect(html).toContain('Foto für &lt;dein&gt; Lebensmittel');
    expect(html).not.toMatch(/https?:\/\//);
  });
  it('ohne gültige Adresse gibt es nichts', async () => {
    const url = await oeffnen();
    const wurzel = new URL(url).origin;
    for (const pfad of ['/', '/falsch/', '/falsch/bild', `${new URL(url).pathname.slice(0, -2)}x/`, `${new URL(url).pathname}geheim`, '/../', '/favicon.ico']) {
      expect((await fetch(`${wurzel}${pfad}`)).status, pfad).toBe(404);
    }
    expect((await fetch(`${wurzel}/falsch/bild`, { method: 'POST', body: new Uint8Array(JPEG) })).status).toBe(404);
    expect(eingegangen).toEqual([]);
  });
  it('jede Verbindung hat eine neue Einmal-Adresse, die alte gilt nicht mehr', async () => {
    const erste = await oeffnen();
    const zweite = await handy.oeffnen({ titel: 't', adresse: '127.0.0.1', beiBild: () => {} });
    expect(zweite).not.toBe(erste);
    await expect(fetch(erste)).rejects.toThrow();
    expect((await fetch(zweite)).status).toBe(200);
  });
  it('nimmt ein Bild an und gibt es weiter', async () => {
    const url = await oeffnen();
    const antwort = await senden(url, JPEG);
    expect(antwort.status).toBe(200);
    expect(eingegangen).toHaveLength(1);
    expect(eingegangen[0]?.equals(JPEG)).toBe(true);
  });
  it('mehrere Fotos für ein Rezept', async () => {
    const url = await oeffnen();
    await senden(url, JPEG);
    await senden(url, JPEG);
    expect(eingegangen).toHaveLength(2);
  });
  it('nimmt nur Bilder an, egal was der Absender behauptet', async () => {
    const url = await oeffnen();
    expect((await senden(url, '<html>keine Bilddatei</html>')).status).toBe(415);
    const getarnt = await fetch(`${url}bild`, { method: 'POST', body: '%PDF-1.7 aaaaaaaaaaaaaaaaa', headers: { 'Content-Type': 'image/jpeg' } });
    expect(getarnt.status).toBe(415);
    expect((await senden(url, Buffer.alloc(0))).status).toBe(415);
    expect(eingegangen).toEqual([]);
  });
  it('zu große Bilder werden abgewiesen', async () => {
    const url = await oeffnen();
    const riesig = Buffer.concat([JPEG, Buffer.alloc(BILD_HOECHSTENS_BYTES)]);
    const antwort = await senden(url, riesig).catch(() => null);
    // Der Mac bricht die Verbindung ab: Entweder sieht das Handy noch die Antwort oder einen Abbruch.
    if (antwort) expect(antwort.status).toBe(413);
    expect(eingegangen).toEqual([]);
  });
  it('schließt sich wieder: Danach ist nichts mehr erreichbar', async () => {
    const url = await oeffnen();
    expect(handy.offen).toBe(true);
    handy.schliessen();
    expect(handy.offen).toBe(false);
    await expect(fetch(url)).rejects.toThrow();
    await expect(senden(url, JPEG)).rejects.toThrow();
    handy.schliessen(); // Zweimal schadet nicht.
  });
  it('schließt sich nach langer Ruhe von selbst und sagt es', async () => {
    const ende = vi.fn();
    const url = await oeffnen(40, ende);
    await vi.waitFor(() => expect(ende).toHaveBeenCalledOnce(), { timeout: 2000 });
    expect(handy.offen).toBe(false);
    await expect(fetch(url)).rejects.toThrow();
  });
});

describe('Die Adresse im WLAN', () => {
  const netz = (address: string, internal = false, family: 'IPv4' | 'IPv6' = 'IPv4') => ({ address, internal, family }) as NetworkInterfaceInfo;
  it('nimmt das WLAN des Macs', () => {
    expect(lokaleAdresse({ lo0: [netz('127.0.0.1', true)], en0: [netz('fe80::1', false, 'IPv6'), netz('192.168.1.23')], en5: [netz('10.0.0.4')] })).toBe('192.168.1.23');
  });
  it('sonst ein anderes eigenes Netz, zum Beispiel über Kabel', () => {
    expect(lokaleAdresse({ en5: [netz('10.0.0.4')] })).toBe('10.0.0.4');
    expect(lokaleAdresse({ en0: [netz('172.20.10.2')] })).toBe('172.20.10.2');
  });
  it('nie eine öffentliche Adresse, kein VPN und nichts ohne Netz', () => {
    expect(lokaleAdresse({ en0: [netz('84.12.34.56')] })).toBeNull();
    expect(lokaleAdresse({ en0: [netz('169.254.10.10')] })).toBeNull();
    expect(lokaleAdresse({ utun3: [netz('10.8.0.2')] })).toBeNull();
    expect(lokaleAdresse({ lo0: [netz('127.0.0.1', true)] })).toBeNull();
    expect(lokaleAdresse({})).toBeNull();
  });
});
