/**
 * Was nur diesen Mac betrifft: der Ordner für die Sicherungen. Alles, was zum
 * Profil gehört (Stückware, ausgeblendete Nährstoffe), liegt in der Datenbank und
 * kommt beim Wiederherstellen einer Sicherung mit zurück.
 */
import { jsonLesen, jsonSchreiben } from './dateien';

interface EinstellungsDatei {
  sicherungsOrdner?: string;
}

export class Einstellungen {
  private werte: EinstellungsDatei = {};

  constructor(private readonly datei: string) {}

  async laden(): Promise<void> {
    try {
      const ordner = (await jsonLesen<Record<string, unknown>>(this.datei))?.sicherungsOrdner;
      this.werte = typeof ordner === 'string' && ordner.trim() ? { sicherungsOrdner: ordner } : {};
    } catch (fehler) {
      console.error('[starkmacher] Einstellungen nicht lesbar – Standardwerte', fehler);
      this.werte = {};
    }
  }

  sicherungsOrdner(): string | undefined {
    return this.werte.sicherungsOrdner;
  }

  async sicherungsOrdnerSetzen(ordner: string): Promise<void> {
    this.werte = { ...this.werte, sicherungsOrdner: ordner };
    await jsonSchreiben(this.datei, this.werte);
  }
}
