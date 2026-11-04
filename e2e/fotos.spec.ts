import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { ersterStart, foto, programmStarten, testordnerAnlegen, testordnerLoeschen } from './hilfen';

const BILDER = join(import.meta.dirname, '../tests/bilder');
const CODE = '4000000123453'; // erfunden, steht auch auf tests/bilder/barcode.png

/** Tut so, als hätte Lukas im Dateifenster dieses Bild gewählt. */
async function dateiWaehlen(app: ElectronApplication, name: string) {
  await app.evaluate(({ dialog }, pfad) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [pfad] })) as typeof dialog.showOpenDialog;
  }, join(BILDER, name));
}

const wert = (seite: Page, code: string) => seite.locator(`[data-code="${code}"] input`);

/** Eine erfundene Offline-Kopie mit einem einzigen Produkt. */
function kopieBauen(): { datei: string; ordner: string } {
  const ordner = mkdtempSync(join(tmpdir(), 'starkmacher-kopie-'));
  const datei = join(ordner, 'kopie.sqlite');
  const db = new DatabaseSync(datei);
  db.exec('CREATE TABLE produkte (schluessel TEXT PRIMARY KEY, name TEXT, marke TEXT, menge TEXT, kcal REAL, fett REAL, gesaettigt REAL, kohlenhydrate REAL, zucker REAL, ballaststoffe REAL, eiweiss REAL, salz REAL) WITHOUT ROWID');
  db.prepare('INSERT INTO produkte VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(CODE, 'Erfundenes Testmüsli', 'Testmarke', '500 g', 400, 8, 1.5, 65, 12, 9, 11, 0.1);
  db.close();
  return { datei, ordner };
}

test('Lebensmittel per Foto anlegen: Prüfseite, korrigieren, speichern', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);
  await seite.getByRole('link', { name: 'Lebensmittel' }).click();
  await seite.getByRole('link', { name: 'Per Foto' }).click();
  await expect(seite.getByRole('heading', { name: 'Lebensmittel per Foto' })).toBeVisible();
  await foto(seite, '60-foto-start');

  // Ein Bild, auf dem nichts steht, was das Programm gebrauchen kann
  await dateiWaehlen(app, 'rezept.png');
  await seite.getByRole('button', { name: 'Foto wählen' }).click();
  await expect(seite.getByText('weder eine Nährwerttabelle noch einen Barcode')).toBeVisible();

  // Die Nährwerttabelle, schief und unscharf wie vom Handy
  await dateiWaehlen(app, 'naehrwerte-handy.jpg');
  await seite.getByRole('button', { name: 'Foto wählen' }).click();
  await expect(seite.locator('.pruef-foto')).toBeVisible();
  await expect(wert(seite, 'ENERCC')).toHaveValue('364');
  await expect(wert(seite, 'FAT')).toHaveValue('11,6');
  await expect(wert(seite, 'FASAT')).toHaveValue('3,5');
  await expect(wert(seite, 'CHO')).toHaveValue('55');
  await expect(wert(seite, 'SUGAR')).toHaveValue('12');
  await expect(wert(seite, 'FIBT')).toHaveValue('6,2');
  await expect(wert(seite, 'PROT625')).toHaveValue('8,4');
  await expect(wert(seite, 'NACL')).toHaveValue('0,95');
  await foto(seite, '61-pruefseite');

  // Ohne Namen wird nichts gespeichert. Korrigieren und speichern.
  await seite.getByRole('button', { name: 'Speichern' }).click();
  await expect(seite.getByRole('alert')).toContainText('Namen');
  await seite.getByLabel('Name', { exact: true }).fill('Erfundenes Knuspermüsli');
  await wert(seite, 'NACL').fill('1');
  await seite.getByRole('button', { name: 'Speichern' }).click();
  await expect(seite.getByRole('heading', { name: 'Erfundenes Knuspermüsli' })).toBeVisible();
  await expect(seite.locator('.packungsfoto')).toBeVisible();

  // Es ist ein ganz normales Lebensmittel und findet sich in der Suche.
  await seite.getByRole('link', { name: 'Lebensmittel' }).click();
  await seite.getByRole('searchbox').or(seite.getByLabel('Lebensmittel suchen')).first().fill('knuspermüsli');
  await expect(seite.locator('.treffer', { hasText: 'Erfundenes Knuspermüsli' })).toBeVisible();
  await app.close();
  testordnerLoeschen(ordner);
});

test('Nur pro Portion: umgerechnet, und die Portion lässt sich ändern. Hineinziehen klappt auch.', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);
  await seite.evaluate(() => {
    window.location.hash = '#/lebensmittel/foto';
  });
  await expect(seite.getByRole('heading', { name: 'Lebensmittel per Foto' })).toBeVisible();

  // Ein Foto hineinziehen
  const bytes = [...readFileSync(join(BILDER, 'naehrwerte-portion.png'))];
  await seite.evaluate((inhalt) => {
    const daten = new DataTransfer();
    daten.items.add(new File([new Uint8Array(inhalt)], 'tabelle.png', { type: 'image/png' }));
    document.querySelector('.foto-eingang')!.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: daten }));
  }, bytes);
  await expect(seite.locator('.portion-hinweis')).toContainText('je Riegel');
  await expect(wert(seite, 'ENERCC')).toHaveValue('400');
  await expect(wert(seite, 'FAT')).toHaveValue('16');
  await foto(seite, '62-portion');

  // Wiegt ein Riegel eigentlich 50 g, rechnet das Programm neu.
  await seite.getByLabel('So schwer ist ein Riegel').fill('50');
  await seite.getByLabel('So schwer ist ein Riegel').blur();
  await expect(wert(seite, 'ENERCC')).toHaveValue('200');
  await expect(wert(seite, 'FAT')).toHaveValue('8');

  // Kein Bild hineinziehen: freundliche Meldung
  await seite.evaluate(() => {
    const daten = new DataTransfer();
    daten.items.add(new File(['kein Bild, nur Text, lang genug für die Prüfung'], 'text.png', { type: 'image/png' }));
    document.querySelector('.foto-eingang')!.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: daten }));
  });
  await expect(seite.getByText('Das ist kein Bild')).toBeVisible();

  // Abbrechen räumt das Foto wieder weg.
  await seite.getByRole('link', { name: 'Abbrechen' }).click();
  await expect(seite.getByRole('heading', { name: 'Lebensmittel', exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const { readdirSync, existsSync } = await import('node:fs');
      const fotos = join(ordner.daten, 'fotos');
      return existsSync(fotos) ? readdirSync(fotos).length : 0;
    })
    .toBe(0);
  await app.close();
  testordnerLoeschen(ordner);
});

test('Barcode: aus der Offline-Kopie, danach merkt sich das Lebensmittel seinen Code', async () => {
  const ordner = testordnerAnlegen();
  const kopie = kopieBauen();
  process.env.STARKMACHER_KOPIE = kopie.datei;
  const { app, seite } = await programmStarten(ordner);
  delete process.env.STARKMACHER_KOPIE;
  await ersterStart(seite);
  await seite.evaluate(() => {
    window.location.hash = '#/lebensmittel/foto';
  });
  await dateiWaehlen(app, 'barcode-handy.jpg');
  await seite.getByRole('button', { name: 'Foto wählen' }).click();

  // Name, Marke, Größe und Werte kommen aus der Kopie, und das Programm sagt, woher.
  await expect(seite.getByLabel('Name', { exact: true })).toHaveValue('Erfundenes Testmüsli');
  await expect(seite.getByLabel('Marke (freiwillig)')).toHaveValue('Testmarke');
  await expect(seite.getByLabel('Packungsgröße (freiwillig)')).toHaveValue('500');
  await expect(seite.getByLabel('Barcode (freiwillig)')).toHaveValue(CODE);
  await expect(wert(seite, 'ENERCC')).toHaveValue('400');
  await expect(seite.locator('.pruef-hinweis')).toContainText('Freiwillige');
  await foto(seite, '63-barcode');

  // Das Foto der Tabelle geht vor, was Freiwillige erfasst haben.
  await dateiWaehlen(app, 'naehrwerte-100g.png');
  await seite.getByRole('button', { name: 'Weiteres Foto' }).click();
  await expect(wert(seite, 'ENERCC')).toHaveValue('364');
  await expect(seite.getByLabel('Name', { exact: true })).toHaveValue('Erfundenes Testmüsli');
  await seite.getByRole('button', { name: 'Speichern' }).click();
  await expect(seite.getByRole('heading', { name: 'Erfundenes Testmüsli' })).toBeVisible();
  await expect(seite.getByText(`Barcode ${CODE}`)).toBeVisible();

  // Beim nächsten Mal kennt das Programm den Code, und die eigene Fassung geht vor.
  await seite.evaluate(() => {
    window.location.hash = '#/lebensmittel/foto';
  });
  await seite.getByLabel('Oder die Nummer unter dem Barcode eintippen').fill(CODE);
  await seite.getByRole('button', { name: 'Nachschlagen' }).click();
  await expect(seite.getByText('Das hast du schon gespeichert')).toBeVisible();
  await expect(seite.getByRole('heading', { name: 'Erfundenes Testmüsli' })).toBeVisible();

  // Die Quelle steht in „Über Starkmacher“.
  await seite.evaluate(() => {
    window.location.hash = '#/einstellungen';
  });
  await expect(seite.getByText('Open Database License (ODbL)')).toBeVisible();
  await app.close();
  testordnerLoeschen(ordner);
  rmSync(kopie.ordner, { recursive: true, force: true });
});

test('Barcode nicht gefunden: Das Programm bittet um ein Foto der Tabelle', async () => {
  const ordner = testordnerAnlegen();
  process.env.STARKMACHER_KOPIE = join(ordner.daten, 'gibt-es-nicht.sqlite');
  const { app, seite } = await programmStarten(ordner);
  delete process.env.STARKMACHER_KOPIE;
  await ersterStart(seite);
  await seite.evaluate(() => {
    window.location.hash = '#/lebensmittel/foto';
  });
  await seite.getByLabel('Oder die Nummer unter dem Barcode eintippen').fill('123');
  await seite.getByRole('button', { name: 'Nachschlagen' }).click();
  await expect(seite.getByText('Dieser Barcode stimmt nicht')).toBeVisible();
  await dateiWaehlen(app, 'barcode.png');
  await seite.getByRole('button', { name: 'Foto wählen' }).click();
  await expect(seite.locator('.pruef-hinweis')).toContainText('Foto der Nährwerttabelle');
  await expect(seite.getByLabel('Barcode (freiwillig)')).toHaveValue(CODE);
  await app.close();
  testordnerLoeschen(ordner);
});

test('Foto vom Handy: QR-Code, Bild landet auf der Prüfseite, nach dem Schließen ist zu', async () => {
  const ordner = testordnerAnlegen();
  process.env.STARKMACHER_HANDY_ADRESSE = '127.0.0.1';
  const { app, seite } = await programmStarten(ordner);
  delete process.env.STARKMACHER_HANDY_ADRESSE;
  await ersterStart(seite);
  await seite.evaluate(() => {
    window.location.hash = '#/lebensmittel/foto';
  });
  await seite.getByRole('button', { name: 'Foto vom Handy' }).click();
  const fenster = seite.getByRole('dialog');
  await expect(fenster.getByRole('img', { name: 'QR-Code für dein Handy' })).toBeVisible();
  const adresse = (await fenster.locator('.handy-adresse').getAttribute('data-adresse'))!;
  expect(adresse).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[\w-]+\/$/);
  await foto(seite, '64-handy');

  // Das Handy öffnet die Seite.
  const handySeite = await (await fetch(adresse)).text();
  expect(handySeite).toContain('Foto aufnehmen');

  // Falsche Adresse und falsche Datei werden abgewiesen, und auf dem Mac passiert nichts.
  expect((await fetch(`${new URL(adresse).origin}/falsch/bild`, { method: 'POST', body: readFileSync(join(BILDER, 'barcode.png')) })).status).toBe(404);
  expect((await fetch(`${adresse}bild`, { method: 'POST', body: 'Das ist kein Bild und auch keins, wenn es lang genug ist.' })).status).toBe(415);
  await expect(fenster.getByRole('status')).toHaveCount(0);

  // Ein Foto kommt an und landet auf der Prüfseite.
  expect((await fetch(`${adresse}bild`, { method: 'POST', body: readFileSync(join(BILDER, 'naehrwerte-handy.jpg')) })).status).toBe(200);
  await expect(fenster.getByRole('status')).toContainText('Ein Foto ist angekommen');
  await expect(seite.locator('.pruef-foto')).toBeVisible();
  await expect(wert(seite, 'ENERCC')).toHaveValue('364');

  // Die Seite selbst, so wie sie auf dem Handy erscheint: Ein Bild aus der Galerie geht wirklich über ihren Knopf hinaus.
  await app.evaluate(({ BrowserWindow }, url) => {
    // Eigene Sitzung: Nur das Programmfenster ist vom Netz getrennt, das Handy ist ein anderes Gerät.
    const telefon = new BrowserWindow({ width: 390, height: 780, webPreferences: { partition: 'nur-fuer-den-test' } });
    void telefon.loadURL(url);
  }, adresse);
  const telefon = await app.waitForEvent('window');
  await telefon.waitForLoadState('domcontentloaded');
  await expect(telefon.getByRole('heading', { name: 'Foto für dein Lebensmittel' })).toBeVisible();
  await expect(telefon.locator('#kamera')).toHaveAttribute('capture', 'environment');
  await foto(telefon, '67-handy-seite');
  await telefon.setInputFiles('#galerie', [join(BILDER, 'barcode.png'), join(BILDER, 'naehrwerte-100g.png')]);
  await expect(telefon.getByText('Foto 2 ist angekommen')).toBeVisible();
  await expect(telefon.getByText('Foto 1 ist angekommen')).toBeVisible();
  await foto(telefon, '68-handy-angekommen');
  await expect(fenster.getByRole('status')).toContainText('3 Fotos sind angekommen');
  await expect(seite.getByLabel('Barcode (freiwillig)')).toHaveValue(CODE);

  // Fenster zu: Die Verbindung ist zu, auch für die offene Seite auf dem Handy.
  await fenster.getByRole('button', { name: 'Fertig' }).click();
  await expect(fenster).toHaveCount(0);
  await expect(fetch(adresse)).rejects.toThrow();
  await telefon.setInputFiles('#galerie', join(BILDER, 'barcode.png'));
  await expect(telefon.getByText('Ist das Fenster am Mac noch offen')).toBeVisible();
  await app.close();
  testordnerLoeschen(ordner);
});

test('Rezept per Foto: mehrere Seiten, unklare Zutaten, auch vom Handy', async () => {
  const ordner = testordnerAnlegen();
  process.env.STARKMACHER_HANDY_ADRESSE = '127.0.0.1';
  const { app, seite } = await programmStarten(ordner);
  delete process.env.STARKMACHER_HANDY_ADRESSE;
  await ersterStart(seite);
  await seite.getByRole('link', { name: 'Rezepte' }).click();
  await seite.getByRole('link', { name: 'Per Foto' }).click();
  await expect(seite.getByRole('heading', { name: 'Rezept per Foto' })).toBeVisible();
  await dateiWaehlen(app, 'rezept.png');
  await seite.getByRole('button', { name: 'Foto wählen' }).click();

  // Name, Portionen, Zutaten mit dem passenden Eintrag, Zubereitung als Text
  await expect(seite.getByLabel('Name', { exact: true })).toHaveValue('Goldene Testpfanne');
  await expect(seite.getByLabel('Portionen')).toHaveValue('4');
  const zutaten = seite.getByRole('region', { name: 'Zutaten' });
  const zeile = (text: string) => zutaten.locator('.zutat-zeile', { hasText: text });
  await expect(zeile('2 EL Olivenöl')).toContainText('Olivenöl');
  await expect(zeile('200 g Mehl')).toContainText('Weizen Mehl, Type 405');
  await expect(zeile('3 Eier')).toContainText('Hühnerei roh');
  await expect(zeile('1 Dose Kichererbsen')).toContainText('Kichererbse reif, Konserve');
  await expect(zeile('1 Dose Kichererbsen')).toContainText('240 g');
  await expect(seite.getByLabel('Zubereitung')).toHaveValue(/Bei mittlerer Hitze stocken lassen/);
  await foto(seite, '65-rezept-pruefung', true);

  // Pfeffer ohne Menge ist markiert. Die Markierung geht weg, wenn man eine Alternative wählt.
  await expect(zeile('Pfeffer')).toHaveClass(/zutat-unklar/);
  await expect(zeile('Pfeffer')).toContainText('keine Menge');
  const pfeffer = zeile('Pfeffer').getByRole('combobox');
  await pfeffer.selectOption({ index: 1 });
  await expect(zeile('Pfeffer')).not.toHaveClass(/zutat-unklar/);

  // Was der BLS nicht kennt, muss geklärt werden, bevor gespeichert wird.
  const offen = seite.locator('.zutat-offen', { hasText: 'Muskat' });
  await expect(offen).toContainText('nichts Passendes');
  await seite.getByRole('button', { name: 'Speichern' }).click();
  await expect(seite.getByRole('alert')).toContainText('kläre');
  await offen.getByRole('button', { name: 'Als Notiz behalten' }).click();
  await expect(seite.locator('.zutat-offen', { hasText: 'Muskat' })).toHaveCount(0);
  await expect(seite.getByLabel('Notiz (freiwillig)')).toHaveValue(/1 Prise Muskat/);

  // Eine zweite Seite kommt vom Handy dazu.
  await seite.getByRole('button', { name: 'Foto vom Handy' }).click();
  const fenster = seite.getByRole('dialog');
  const adresse = (await fenster.locator('.handy-adresse').getAttribute('data-adresse'))!;
  expect((await (await fetch(adresse)).text())).toContain('Foto für dein Rezept');
  expect((await fetch(`${adresse}bild`, { method: 'POST', body: readFileSync(join(BILDER, 'rezept-spalten.png')) })).status).toBe(200);
  await expect(fenster.getByRole('status')).toContainText('angekommen');
  await fenster.getByRole('button', { name: 'Fertig' }).click();
  await expect(seite.getByLabel('Name', { exact: true })).toHaveValue('Goldene Testpfanne'); // Der erste Name bleibt.
  await expect(zeile('150 g rote Linsen')).toContainText('Linse rot reif');
  await expect(seite.getByLabel('Zubereitung')).toHaveValue(/Mit Kreuzkümmel würzen/);
  await expect(seite.locator('.pruef-spalte .foto-kachel')).toHaveCount(2);

  // Kreuzkümmel per Hand wählen statt des fehlenden Eintrags
  const kuemmel = seite.locator('.zutat-offen', { hasText: 'Kreuzkümmel' });
  await kuemmel.getByRole('button', { name: 'Zutat wählen' }).click();
  const wahlFenster = seite.getByRole('dialog');
  await expect(wahlFenster.getByLabel('Lebensmittel suchen')).toHaveValue('Kreuzkümmel');
  await wahlFenster.getByLabel('Lebensmittel suchen').fill('pfeffer schwarz');
  await wahlFenster.locator('.treffer', { hasText: 'Pfeffer schwarz' }).first().click();
  await wahlFenster.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(seite.locator('.zutat-offen', { hasText: 'Kreuzkümmel' })).toHaveCount(0);

  // Speichern ergibt ein normales Rezept.
  await seite.getByRole('button', { name: 'Speichern' }).click();
  await expect(seite.getByRole('heading', { name: 'Goldene Testpfanne' })).toBeVisible();
  await expect(seite.getByText('Weizen Mehl, Type 405').first()).toBeVisible();
  await foto(seite, '66-rezept-fertig');
  await app.close();
  testordnerLoeschen(ordner);
});
