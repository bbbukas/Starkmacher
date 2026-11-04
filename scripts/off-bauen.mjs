/**
 * Baut die Offline-Kopie von Open Food Facts: ressourcen/openfoodfacts-de.sqlite. Nur Produkte aus Deutschland, nur
 * Name, Marke, Menge und Packungswerte (Bauauftrag 5.3). Die Daten stehen unter der Lizenz ODbL.
 *
 *   npm run off                  baut aus import/openfoodfacts/en.openfoodfacts.org.products.csv.gz
 *   npm run off -- --wenn-fehlt  baut nur, wenn die Kopie fehlt und die Ausgangsdatei da ist
 *
 * Aktualisieren von Hand: die Ausgangsdatei neu laden (world.openfoodfacts.org/data, rund 1,5 GB), `npm run off`,
 * dann `npm run paket`. Das Programm selbst geht dafür nicht ins Internet.
 *
 * Die Ausgangsdatei ist fremde Daten: Sie wird nur Zeile für Zeile gelesen, jeder Wert wird geprüft.
 */
import { createReadStream, existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { createGunzip } from 'node:zlib';

const WURZEL = join(import.meta.dirname, '..');
const QUELLE = process.argv.find((a) => a.endsWith('.gz')) ?? join(WURZEL, 'import/openfoodfacts/en.openfoodfacts.org.products.csv.gz');
const ZIEL = join(WURZEL, 'ressourcen/openfoodfacts-de.sqlite');

if (process.argv.includes('--wenn-fehlt') && (existsSync(ZIEL) || !existsSync(QUELLE))) process.exit(0);
if (!existsSync(QUELLE)) {
  console.error(`Die Ausgangsdatei fehlt: ${QUELLE}`);
  process.exit(1);
}

/** Spalten im Programm und in der Datei, mit der höchsten Menge, die je 100 g möglich ist. Darüber ist es ein Tippfehler. */
const WERTE = [
  ['kcal', 'energy-kcal_100g', 950],
  ['fett', 'fat_100g', 100],
  ['gesaettigt', 'saturated-fat_100g', 100],
  ['kohlenhydrate', 'carbohydrates_100g', 100],
  ['zucker', 'sugars_100g', 100],
  ['ballaststoffe', 'fiber_100g', 100],
  ['eiweiss', 'proteins_100g', 100],
  ['salz', 'salt_100g', 100],
];

const gueltig = (code) => {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const ziffern = [...code].map(Number);
  const pruef = ziffern.pop();
  let summe = 0;
  for (const [i, z] of ziffern.reverse().entries()) summe += i % 2 === 0 ? z * 3 : z;
  return (10 - (summe % 10)) % 10 === pruef;
};

/** Kein Steuerzeichen, keine überlangen Texte. */
const text = (roh, laenge) => {
  const t = (roh ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return t === '' ? null : t.slice(0, laenge);
};

const vorlaeufig = `${ZIEL}.neu`;
rmSync(vorlaeufig, { force: true });
const db = new DatabaseSync(vorlaeufig);
db.exec(`
  PRAGMA journal_mode = OFF;
  PRAGMA synchronous = OFF;
  CREATE TABLE info (schluessel TEXT PRIMARY KEY, wert TEXT NOT NULL);
  CREATE TABLE produkte (
    schluessel TEXT PRIMARY KEY,
    name TEXT,
    marke TEXT,
    menge TEXT,
    ${WERTE.map(([s]) => `${s} REAL`).join(', ')}
  ) WITHOUT ROWID;
`);
const rein = db.prepare(`INSERT OR REPLACE INTO produkte VALUES (?, ?, ?, ?, ${WERTE.map(() => '?').join(', ')})`);

const zeilen = createInterface({ input: createReadStream(QUELLE).pipe(createGunzip()), crlfDelay: Infinity });
let spalten = null;
let alle = 0;
let deutsche = 0;
let genommen = 0;
db.exec('BEGIN');
for await (const zeile of zeilen) {
  const teile = zeile.split('\t');
  if (!spalten) {
    spalten = new Map(teile.map((n, i) => [n, i]));
    for (const n of ['code', 'product_name', 'brands', 'quantity', 'countries_tags', ...WERTE.map((w) => w[1])]) {
      if (!spalten.has(n)) throw new Error(`Spalte fehlt in der Datei: ${n}`);
    }
    continue;
  }
  alle++;
  const feld = (n) => teile[spalten.get(n)];
  if (!(feld('countries_tags') ?? '').includes('en:germany')) continue;
  deutsche++;
  const code = feld('code') ?? '';
  if (!gueltig(code)) continue;
  const werte = WERTE.map(([, spalte, hoechst]) => {
    const roh = feld(spalte);
    if (roh === undefined || roh === '') return null;
    const z = Number(roh);
    return Number.isFinite(z) && z >= 0 && z <= hoechst ? Math.round(z * 100) / 100 : null;
  });
  // Manche Produkte nennen nur Kilojoule.
  if (werte[0] === null) {
    const kj = Number(feld('energy_100g') || NaN);
    if (Number.isFinite(kj) && kj > 0 && kj <= 3975) werte[0] = Math.round(kj / 4.184);
  }
  const name = text(feld('product_name'), 160);
  // Ohne Name und ohne einen einzigen Wert hilft der Eintrag nicht.
  if (name === null && werte.every((w) => w === null)) continue;
  rein.run(code.replace(/^0+/, ''), name, text(feld('brands'), 100), text(feld('quantity'), 40), ...werte);
  genommen++;
  if (alle % 500_000 === 0) console.log(`${alle.toLocaleString('de-DE')} Zeilen gelesen, ${genommen.toLocaleString('de-DE')} übernommen`);
}
db.exec('COMMIT');
db.prepare('INSERT INTO info VALUES (?, ?)').run('stand', new Date(statSync(QUELLE).mtimeMs).toISOString().slice(0, 10));
db.prepare('INSERT INTO info VALUES (?, ?)').run('lizenz', 'Open Food Facts, Open Database License (ODbL)');
db.exec('VACUUM');
db.close();
renameSync(vorlaeufig, ZIEL);
console.log(`Fertig: ${alle.toLocaleString('de-DE')} Zeilen, ${deutsche.toLocaleString('de-DE')} aus Deutschland, ${genommen.toLocaleString('de-DE')} übernommen, ${(statSync(ZIEL).size / 1024 / 1024).toFixed(1)} MB`);
