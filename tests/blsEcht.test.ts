/**
 * Prüft die fertige bls-4.0.sqlite, soweit sie auf diesem Mac schon gebaut ist (npm run bls). Das sind öffentliche
 * Daten des Max Rubner-Instituts, keine persönlichen. Fehlt die Datei, entfällt dieser Teil.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { grundbestandOeffnen } from '../src/main/daten/bls';
import { standardUmrechnung } from '@shared/einheiten';
import { naehrstoff } from '@shared/naehrstoffe';
import { aehnlichste, sortierteTreffer } from '@shared/suche';
import { zutatSuchen, ZUTAT_EINTRAEGE } from '@shared/rezeptFoto';
import { ALLTAGS_NAMEN } from '@shared/vorschlaege';

const DATEI = join(import.meta.dirname, '../ressourcen/bls-4.0.sqlite');

describe.runIf(existsSync(DATEI))('Der echte BLS', () => {
  const grund = grundbestandOeffnen(DATEI);
  const liste = grund.liste();
  const werte = (code: string) => grund.holen(code)!.werte;

  it('die Alltagsliste für Vorschläge gibt es wirklich, und zu jedem Eintrag sind die Kalorien bekannt', () => {
    const nachName = new Map(grund.vorschlagsListe().map((e) => [e.name, e]));
    for (const name of ALLTAGS_NAMEN) {
      expect(nachName.has(name), name).toBe(true);
      expect(nachName.get(name)!.werte.ENERCC, name).toBeDefined();
    }
  });
  it('„pasteurisiert“ macht aus Milch keine Paste', () => {
    expect(standardUmrechnung('Vollmilch frisch, 3,5 % Fett, pasteurisiert', 'M111000').dichte).toBe(1.03);
    expect(standardUmrechnung('Tomatenmark', 'G000000').dichte).toBe(1.1);
    expect(standardUmrechnung('Würzpaste', 'R000000').dichte).toBe(1.1);
  });
  it('die üblichen Einträge für Rezeptzutaten gibt es wirklich', () => {
    const namen = new Set(liste.map((e) => e.name));
    for (const [wort, name] of Object.entries(ZUTAT_EINTRAEGE)) expect(namen.has(name), `${wort}: ${name}`).toBe(true);
  });
  it('Zutaten vom Foto finden den passenden, rohen Eintrag', () => {
    const bestand = liste.map((e) => ({ name: e.name, gruppe: e.code[0] ?? null }));
    const erster = (name: string, zeile = name) => zutatSuchen({ name, zeile }, bestand).treffer[0]?.name;
    const erwartet: Readonly<Record<string, string>> = {
      Mehl: 'Weizen Mehl, Type 405',
      Olivenöl: 'Olivenöl',
      Eier: 'Hühnerei roh',
      Zwiebel: 'Speisezwiebel roh',
      Knoblauch: 'Knoblauch roh',
      Milch: 'Vollmilch frisch, 3,5 % Fett, pasteurisiert',
      'rote Linsen': 'Linse rot reif',
      Möhre: 'Karotte/Möhre, roh',
      Butter: 'Süßrahmbutter',
      Kartoffeln: 'Kartoffel geschält, roh',
      Tomaten: 'Tomate roh',
      Reis: 'Reis poliert, roh',
      Hackfleisch: 'Rind/Schwein, Hackfleisch gemischt, roh',
      Champignons: 'Champignon roh',
      Brokkoli: 'Broccoli roh',
    };
    for (const [zutat, eintrag] of Object.entries(erwartet)) expect(erster(zutat), zutat).toBe(eintrag);
    expect(erster('Kichererbsen', '1 Dose Kichererbsen (240 g)')).toBe('Kichererbse reif, Konserve, abgetropft');
    // Was der BLS nicht führt, bleibt ohne Vorschlag und landet auf der Prüfseite bei „noch zu klären“.
    expect(erster('Kreuzkümmel')).toBeUndefined();
  });
  it('hat alle 7.140 Lebensmittel, und jeder Wert gehört zu einem bekannten Nährstoff', () => {
    expect(liste).toHaveLength(7140);
    for (const eintrag of liste.filter((_, i) => i % 40 === 0)) {
      for (const code of Object.keys(grund.holen(eintrag.code)!.werte)) expect(naehrstoff(code), code).toBeDefined();
    }
  });
  it('übernimmt die Korrekturen aus dem Erratum (Stand August 2026)', () => {
    expect(werte('M111100')).toMatchObject({ RETOL: 2.4, VITA: 3.1, VITAA: 2.7 });
    expect(werte('M111200').ID).toBe(9.5);
    expect(werte('M113200').ID).toBe(11.6);
    expect(werte('H210100').CA).toBe(254);
    expect(werte('H210200').CA).toBe(236);
    expect(werte('T104100').FAT).toBe(4.3);
    expect(grund.holen('H210100')!.hinweise[0]).toContain('Erratum');
  });
  it('die Überschätzung bei Oligosacchariden ist weg', () => {
    // Laut Erratum waren es bei diesem Sirup 23,1 % zu viel, bei Chicoree 2,4 %.
    const sirup = werte('S151000');
    expect(((sirup.ENERCC! + sirup.OLSAC! * 2 - sirup.ENERCC!) / (sirup.ENERCC! + sirup.OLSAC! * 2)) * 100).toBeCloseTo(23.1, 1);
    expect(sirup.ENERCC).toBeLessThan(330);
  });
  it('unbekannte Werte fehlen, statt 0 zu sein', () => {
    expect(werte('M200100').VITAA).toBeUndefined(); // Milchmischgetränk: Vitamin A wird nachgerechnet
    expect(werte('F201100').PHE).toBeUndefined(); // Aprikose: scheinbare Null bei Phenylalanin
    expect(werte('F549100').ZN).toBeUndefined(); // Jackfrucht: leeres Zinkfeld
    expect(werte('G322132').ZN).toBe(0); // Grünkohl gekocht: unter der Bestimmungsgrenze
    expect(grund.holen('G322132')!.spuren).toContain('ZN');
  });
  it('schätzt den freien Zucker sinnvoll', () => {
    const frei = (code: string) => grund.holen(code)!.freierZuckerG;
    expect(frei('F110100')).toBe(0); // Apfel roh
    expect(frei('M111200')).toBe(0); // Milch 1,5 %
    expect(frei('C131000')).toBe(0); // Hafer
    expect(frei('S120000')).toBeGreaterThan(60); // Honig
    expect(frei('S151000')).toBeGreaterThan(0); // Glukosesirup
    expect(frei('X384143')).toBeGreaterThan(0); // Barbecuesauce
    expect(frei('Y8A1000')).toBeGreaterThan(0); // Zabaione
    // In süßem Joghurt zählt nur, was über die Laktose hinausgeht.
    const joghurt = liste.find((e) => e.name.startsWith('Joghurt mind. 3,5 % Fett, mit Vanillezubereitung'))!;
    expect(frei(joghurt.code)).toBeLessThan(joghurt.werte.SUGAR!);
    expect(frei(joghurt.code)).toBeGreaterThan(0);
  });
  it('die Suche findet Alltägliches', () => {
    const mitGruppe = liste.map((e) => ({ ...e, gruppe: e.code[0] ?? null }));
    const erstes = (text: string) => sortierteTreffer(mitGruppe, text)[0]?.name;
    expect(erstes('hafer flocken')).toBe('Hafer Flocken');
    expect(erstes('haferflocken')).toBe('Hafer Flocken');
    expect(erstes('olivenol')).toBe('Olivenöl');
    expect(erstes('huhnerei roh')).toBe('Hühnerei roh');
    expect(erstes('ei')).toBe('Hühnerei roh');
    expect(erstes('Banane')).toBe('Banane roh');
    expect(erstes('apfel')).toBe('Apfel roh');
    expect(erstes('joghurt')).toMatch(/^Joghurt (mild|mind)/);
    expect(erstes('quark')).toMatch(/^Speisequark/);
    expect(erstes('linsen')).toMatch(/^Linse/);
    expect(erstes('nudeln')).toMatch(/teigwaren/i);
    expect(erstes('brot')).toMatch(/brot$/);
    expect(erstes('hähnchen')).toMatch(/Brustfilet/);
    expect(erstes('zucker')).toMatch(/^Zucker weiß/);
    expect(sortierteTreffer(mitGruppe, 'kase').length).toBeGreaterThan(50);
    expect(sortierteTreffer(mitGruppe, 'kaese')).toHaveLength(sortierteTreffer(mitGruppe, 'käse').length);
  });
  it('schlägt zu einem Packungsprodukt Passendes vor', () => {
    const treffer = aehnlichste({ name: 'Frischkäse Natur', werte: { ENERCC: 240, FAT: 22, FASAT: 14, CHO: 3, SUGAR: 3, PROT625: 6, NACL: 0.8 } }, liste);
    expect(treffer[0]?.name).toMatch(/Frischkäse/);
    for (const t of treffer) expect(t.name).toMatch(/Frischkäse|käse/i);
  });
  it('die Standardumrechnung passt zu echten Namen', () => {
    const name = (code: string) => grund.holen(code)!.name;
    expect(standardUmrechnung(name('E111100'), 'E111100').groessen).not.toBeNull();
    expect(standardUmrechnung(name('Q120000'), 'Q120000').el).toBe(10);
    expect(standardUmrechnung(name('C133000'), 'C133000').el).toBe(8);
  });
});
