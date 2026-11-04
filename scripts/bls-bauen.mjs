/**
 * Baut ressourcen/bls-4.0.sqlite aus den Daten des Max Rubner-Instituts.
 *
 *   npm run bls               baut neu
 *   npm run bls -- --wenn-fehlt   baut nur, wenn die Datei noch fehlt
 *
 * Erwartet import/BLS_4_0_2025_DE.zip (blsdb.de → BLS-Daten → Download BLS-Daten).
 * Beim Einlesen gelten die Korrekturen aus dem Erratum des Instituts (Stand August 2026). Laut Erratum sind sie bis
 * zum Update 4.1 für Berechnungen maßgeblich. Alle Änderungen stehen je Lebensmittel in `hinweise`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BLS_FASSUNG, BLS_SCHEMA } from '../src/shared/blsAufbau.ts';
import { freierZuckerG, zuckerRegel } from '../src/shared/freierZucker.ts';
import { naehrstoff } from '../src/shared/naehrstoffe.ts';
import { xlsxLesen } from './bls-lesen.mjs';

const WURZEL = join(import.meta.dirname, '..');
const ARCHIV = join(WURZEL, 'import/BLS_4_0_2025_DE.zip');
const ZIEL = join(WURZEL, 'ressourcen/bls-4.0.sqlite');
const KORREKTUREN = JSON.parse(readFileSync(join(import.meta.dirname, 'bls-korrekturen.json'), 'utf8'));

if (process.argv.includes('--wenn-fehlt') && existsSync(ZIEL)) process.exit(0);
if (!existsSync(ARCHIV)) {
  console.error(`Es fehlt ${ARCHIV}.\nHerunterladen: blsdb.de → BLS-Daten → Download BLS-Daten, dann nach import/ legen.`);
  process.exit(1);
}

// Auspacken in einen eigenen, leeren Ordner außerhalb des Projekts
const ordner = mkdtempSync(join(tmpdir(), 'starkmacher-bls-'));
execFileSync('unzip', ['-q', '-j', ARCHIV, '*BLS_4_0_Daten_2025_DE.xlsx', '-d', ordner]);
const zeilen = xlsxLesen(join(ordner, 'BLS_4_0_Daten_2025_DE.xlsx'));
rmSync(ordner, { recursive: true, force: true });

const kopf = zeilen[0];
if (kopf[0] !== 'BLS Code' || kopf.length !== 418) throw new Error('Die Datei sieht anders aus als erwartet.');
const SPUREN_WORTE = new Set(['TR', '<LOD', '<LOQ', '<LOD or <LOQ']);
const naehrstoffe = [];
for (let i = 3; i < 417; i += 3) naehrstoffe.push({ code: kopf[i].split(' ')[0], spalte: i });
if (naehrstoffe.length !== 138) throw new Error(`Erwartet 138 Nährstoffe, gefunden ${naehrstoffe.length}.`);
// Datei und Programm müssen dieselben Kürzel und Einheiten kennen.
for (const { code, spalte } of naehrstoffe) {
  const bekannt = naehrstoff(code);
  if (!bekannt) throw new Error(`Das Kürzel ${code} fehlt in src/shared/naehrstoffe.ts.`);
  const einheit = /\[(.+?)\/100g\]/.exec(kopf[spalte])?.[1];
  if (einheit !== bekannt.einheit) throw new Error(`${code}: Die Datei nennt ${einheit}, das Programm ${bekannt.einheit}.`);
}

const ERRATUM = 'Korrigiert laut Erratum des Max Rubner-Instituts (Stand August 2026):';
const ANGEKUENDIGT = 'Laut Erratum des Max Rubner-Instituts (Stand August 2026) wird hier nachgerechnet:';

function korrigieren(code, werte, spuren, hinweise) {
  const setzen = (schluessel, wert) => {
    werte[schluessel] = wert;
    spuren.delete(schluessel);
  };
  const entfernen = (schluessel) => {
    delete werte[schluessel];
    spuren.delete(schluessel);
  };

  // 1.2 Magermilch: viel zu hohes Vitamin A
  if (code === 'M111100') {
    setzen('RETOL', 2.4);
    setzen('VITA', 3.1);
    setzen('VITAA', 2.7);
    hinweise.push(`${ERRATUM} Vitamin A und Retinol.`);
  }
  // Gerichte daraus: Der alte Wert ist viel zu hoch, der richtige noch nicht bekannt. Also lieber keine Angabe als ein falscher Wert.
  if (KORREKTUREN.magermilch.includes(code)) {
    for (const c of ['RETOL', 'VITA', 'VITAA']) entfernen(c);
    hinweise.push(`${ANGEKUENDIGT} Vitamin A ist in diesem Lebensmittel zu hoch angegeben und steht deshalb bis zum Update ohne Angabe da.`);
  }
  // 1.3 Fettarme Milch: zu wenig Jod
  if (code === 'M111200') {
    setzen('ID', 9.5);
    hinweise.push(`${ERRATUM} Jod.`);
  }
  if (code === 'M113200' || code === 'M1A5200') {
    setzen('ID', 11.6);
    hinweise.push(`${ERRATUM} Jod.`);
  }
  if (KORREKTUREN.milch15.includes(code)) hinweise.push(`${ANGEKUENDIGT} Jod ist etwas zu niedrig angegeben.`);
  // 2 Mandeln: zu wenig Calcium
  if (code === 'H210100') {
    setzen('CA', 254);
    hinweise.push(`${ERRATUM} Calcium.`);
  }
  if (code === 'H210200') {
    setzen('CA', 236);
    hinweise.push(`${ERRATUM} Calcium.`);
  }
  if (KORREKTUREN.mandel.includes(code)) hinweise.push(`${ANGEKUENDIGT} Calcium ist etwas zu niedrig angegeben.`);
  // 3 Oligosaccharide wurden in der Energie doppelt gezählt: 2 kcal bzw. 8 kJ je Gramm zu viel
  if (KORREKTUREN.oligosaccharide.includes(code)) {
    const oligo = werte.OLSAC;
    if (oligo === undefined) throw new Error(`${code}: Oligosaccharide fehlen.`);
    if (werte.ENERCC !== undefined) werte.ENERCC = Math.round((werte.ENERCC - oligo * 2) * 100) / 100;
    if (werte.ENERCJ !== undefined) werte.ENERCJ = Math.round((werte.ENERCJ - oligo * 8) * 100) / 100;
    hinweise.push(`${ERRATUM} Kalorien.`);
  }
  // 5 Phenylalanin: scheinbare Nullwerte sind unbekannt, nicht null
  if (KORREKTUREN.phenylalanin.includes(code)) {
    entfernen('PHE');
    hinweise.push(`${ANGEKUENDIGT} Phenylalanin steht bis zum Update ohne Angabe da.`);
  }
  // 6 Sardelle: laut Erratum 2,3–6,3 g Fett statt 13,7 g. Der Endwert steht noch aus, gerechnet wird mit der Mitte.
  if (code === 'T104100') {
    const fett = 4.3;
    const weniger = (werte.FAT ?? 0) - fett;
    setzen('FAT', fett);
    werte.ENERCC = Math.round((werte.ENERCC - weniger * 9) * 100) / 100;
    werte.ENERCJ = Math.round((werte.ENERCJ - weniger * 37) * 100) / 100;
    hinweise.push(`${ERRATUM} Fett (2,3–6,3 g, hier die Mitte) und Kalorien. Die einzelnen Fettsäuren sind noch die alten.`);
  }
  if (KORREKTUREN.sardelle.includes(code)) hinweise.push(`${ANGEKUENDIGT} Fett und Kalorien sind zu hoch angegeben.`);
}

mkdirSync(join(WURZEL, 'ressourcen'), { recursive: true });
rmSync(ZIEL, { force: true });
const db = new DatabaseSync(ZIEL);
db.exec('PRAGMA journal_mode = OFF; PRAGMA page_size = 8192;');
db.exec(BLS_SCHEMA);
const einfuegen = db.prepare('INSERT INTO lebensmittel (code, name, name_en, werte, spuren, freier_zucker_g, anmerkung, hinweise) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

let anzahl = 0;
let leerBeiZink = 0;
const regeln = { kein: 0, frei: 0 };
db.exec('BEGIN');
for (const zeile of zeilen.slice(1)) {
  const code = zeile[0];
  const name = String(zeile[1]).trim();
  const werte = {};
  const spuren = new Set();
  for (const { code: c, spalte } of naehrstoffe) {
    const inhalt = zeile[spalte];
    if (typeof inhalt === 'number') werte[c] = inhalt;
    else if (SPUREN_WORTE.has(inhalt)) {
      // Spuren und Werte unter der Nachweisgrenze zählen als 0, werden aber als „Spuren“ gezeigt.
      werte[c] = 0;
      spuren.add(c);
    } else if (inhalt !== '-' && inhalt !== null && inhalt !== undefined) throw new Error(`${code}/${c}: unbekannter Wert ${inhalt}`);
    else if (inhalt === null || inhalt === undefined) {
      if (c === 'ZN') leerBeiZink++;
    }
  }
  // 4 Zink: sechs leere Felder sind laut Erratum Werte unter der Nachweisgrenze, die übrigen unbekannt.
  if (['G322132', 'G470132', 'G510132', 'G611132', 'M715800', 'N540900'].includes(code)) {
    werte.ZN = 0;
    spuren.add('ZN');
  }
  const hinweise = [];
  korrigieren(code, werte, spuren, hinweise);
  const regel = zuckerRegel(code, name);
  regeln[regel]++;
  einfuegen.run(
    code,
    name,
    zeile[2] ? String(zeile[2]).trim() : null,
    JSON.stringify(werte),
    JSON.stringify([...spuren]),
    freierZuckerG(regel, werte.SUGAR ?? null, werte.LACS ?? null),
    zeile[417] ? String(zeile[417]).trim() : null,
    JSON.stringify(hinweise),
  );
  anzahl++;
}
const info = db.prepare('INSERT INTO info (schluessel, wert) VALUES (?, ?)');
info.run('fassung', BLS_FASSUNG);
info.run('quelle', 'Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0');
info.run('erratum', 'August 2026');
db.exec('COMMIT');

// Probe gegen die Angaben im Erratum, damit eine stille Änderung der Datei auffällt.
const zahl = (code, c) => JSON.parse(db.prepare('SELECT werte FROM lebensmittel WHERE code = ?').get(code).werte)[c];
const pruefen = (wahr, text) => {
  if (!wahr) throw new Error(`Probe fehlgeschlagen: ${text}`);
};
const fehlerProzent = (alt, neu) => (((alt - neu) / alt) * 100).toFixed(1); // so rechnet das Erratum
pruefen(anzahl === 7140, `7.140 Lebensmittel, gefunden ${anzahl}`);
pruefen(leerBeiZink === 59, `59 leere Zinkfelder, gefunden ${leerBeiZink}`);
pruefen(zahl('M111100', 'RETOL') === 2.4, 'Magermilch Retinol');
pruefen(zahl('H210100', 'CA') === 254, 'Mandel Calcium');
pruefen(zahl('M111200', 'ID') === 9.5, 'Milch 1,5 % Jod');
pruefen(zahl('M200100', 'VITAA') === undefined, 'Vitamin A im Milchmischgetränk entfernt');
const sirup = zahl('S151000', 'ENERCC');
pruefen(fehlerProzent(sirup + 47.7 * 2, sirup) === '23.1', `Glukosesirup: Überschätzung ${fehlerProzent(sirup + 47.7 * 2, sirup)} % statt 23,1 %`);
db.exec('VACUUM');
db.close();
console.log(`Fertig: ${anzahl} Lebensmittel in ${ZIEL}. Freier Zucker: ${regeln.frei} mit Zählung, ${regeln.kein} ohne.`);
