import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { ersterStart, foto, programmStarten, testordnerAnlegen, testordnerLoeschen } from './hilfen';

test('Suchen, ansehen, Menge wählen: echter BLS', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);
  await seite.getByRole('navigation', { name: 'Bereiche' }).getByRole('link', { name: 'Lebensmittel' }).click();
  await expect(seite.getByRole('heading', { name: 'Lebensmittel', level: 1 })).toBeVisible();
  await expect(seite.getByText('Über 7.000 Lebensmittel')).toBeVisible();

  // Umlaute und Teilwörter
  const suche = seite.getByLabel('Lebensmittel suchen');
  await suche.fill('frischkase');
  await expect(seite.locator('.treffer').first()).toContainText('Frischkäse');
  await suche.fill('kaese');
  await expect(seite.locator('.treffer').first()).toContainText(/käse/i);
  await foto(seite, '20-suche');

  // Das Naheliegende steht oben
  await suche.fill('apfel');
  await expect(seite.locator('.treffer').first()).toContainText('Apfel');
  await suche.fill('huhnerei roh');
  await seite.locator('.treffer', { hasText: 'Hühnerei roh' }).first().click();

  // Eier: Stück nach Größe, mit ≈
  await expect(seite.getByRole('heading', { name: 'Hühnerei roh' })).toBeVisible();
  await expect(seite.getByLabel('Einheit')).toHaveValue('Stück');
  await expect(seite.getByText('≈ 52 g')).toBeVisible();
  await seite.getByRole('radio', { name: 'L', exact: true }).check({ force: true });
  await expect(seite.getByText('≈ 60 g')).toBeVisible();
  await expect(seite.getByText('Max Rubner-Institut (2025)')).toBeVisible();
  await expect(seite.locator('details.g-vitamine .nw-zeile', { hasText: 'Vitamin B12' }).locator('.nw-anteil')).toContainText('%');
  await foto(seite, '21-detail-ei', true);

  // Menge in Gramm: Es rechnet mit, und die Quelle bleibt stehen
  await seite.getByLabel('Einheit').selectOption('g');
  await seite.getByLabel('Menge').fill('100');
  await expect(seite.locator('.umgerechnet')).toHaveCount(0);

  // Was fehlt, ist keine Null. Selen führt der BLS nicht, deshalb gibt es die Zeile gar nicht.
  await expect(seite.locator('.nw-zeile', { hasText: 'Selen' })).toHaveCount(0);

  // Zuletzt verwendet
  await seite.locator('a.zurueck').click();
  await suche.fill('');
  await expect(seite.getByRole('region', { name: 'Zuletzt verwendet' }).getByText('Hühnerei roh')).toBeVisible();

  // Korrekturen des Max Rubner-Instituts sind übernommen und gekennzeichnet
  await suche.fill('Milch entrahmt, frisch');
  await seite.locator('.treffer', { hasText: 'Milch entrahmt, frisch' }).first().click();
  await expect(seite.getByText('Korrigiert laut Erratum')).toBeVisible();
  await expect(seite.locator('details.g-vitamine .nw-zeile', { hasText: /^Retinol/ }).locator('.nw-100')).toHaveText('2,4 µg');

  // Freier Zucker: Bei Milch zählt er nicht
  await seite.locator('details.g-kohlenhydrate summary').click();
  await expect(seite.locator('.nw-extra', { hasText: 'Freier Zucker' }).locator('.nw-100')).toHaveText('0 g');

  await app.close();
  testordnerLoeschen(ordner);
});

test('Eigenes Lebensmittel anlegen, schätzen, korrigieren und löschen', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);
  await seite.getByRole('navigation', { name: 'Bereiche' }).getByRole('link', { name: 'Lebensmittel' }).click();
  await seite.getByRole('link', { name: 'Neues Lebensmittel' }).click();

  // Ohne Namen geht es nicht
  await seite.getByRole('button', { name: 'Speichern' }).click();
  await expect(seite.getByRole('alert')).toContainText('Namen');

  await seite.getByLabel('Name', { exact: true }).fill('Frischkäse Natur Testhof');
  await seite.getByLabel('Marke (freiwillig)').fill('Testhof');
  await seite.getByLabel('Packungsgröße (freiwillig)').fill('200');
  await seite.getByLabel('Kalorien').fill('240');
  await seite.getByLabel('Fett', { exact: true }).fill('22');
  await seite.getByLabel('davon gesättigte Fettsäuren').fill('14');
  await seite.getByLabel('Kohlenhydrate', { exact: true }).fill('3');
  await seite.getByLabel('davon Zucker').fill('3');
  await seite.getByLabel('Eiweiß', { exact: true }).fill('6');
  await seite.getByLabel('Salz').fill('0,8');
  await seite.getByText('Nur natürlicher Zucker').click();

  // Schätzung: ähnliche Lebensmittel vorschlagen, nichts geht automatisch
  await seite.getByRole('button', { name: 'Ähnliche Lebensmittel suchen' }).click();
  const vorschlag = seite.locator('.vorschlag').first();
  await expect(vorschlag).toContainText('Frischkäse');
  await foto(seite, '22-schaetzung', true);
  await vorschlag.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(seite.getByText(/Geschätzt aus BLS: .*Frischkäse/)).toBeVisible();

  // Foto der Packung
  await app.evaluate(({ dialog }, pfad) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [pfad] })) as typeof dialog.showOpenDialog;
  }, join(import.meta.dirname, '../build/icon.png'));
  await seite.getByRole('button', { name: 'Foto der Packung wählen' }).click();
  await expect(seite.getByAltText('Foto der Packung')).toBeVisible();

  await seite.getByRole('button', { name: 'Speichern' }).click();
  await expect(seite.getByRole('heading', { name: 'Frischkäse Natur Testhof' })).toBeVisible();
  await expect(seite.getByText('Eigenes', { exact: true })).toBeVisible();
  await expect(seite.getByText(/geschätzt aus BLS/)).toBeVisible();
  await expect(seite.getByAltText(/Packung von/)).toBeVisible();
  await expect(seite.locator('details.g-mineralstoffe .nw-zeile', { hasText: 'Calcium' }).locator('abbr')).toHaveText('~');
  await seite.locator('details.g-kohlenhydrate summary').click();
  await expect(seite.locator('.nw-extra', { hasText: 'Freier Zucker' }).locator('.nw-100')).toHaveText('0 g');
  await foto(seite, '23-eigenes', true);

  // 1 Packung ist bekannt, 1 Dose muss das Programm erfragen
  await seite.getByLabel('Einheit').selectOption('Packung');
  await seite.getByLabel('Menge').fill('1');
  await expect(seite.getByText('≈ 200 g')).toBeVisible();
  await seite.getByLabel('Einheit').selectOption('Dose');
  await seite.getByLabel('Wie viel wiegt 1 Dose?').fill('240');
  await seite.getByRole('button', { name: 'Merken' }).click();
  await expect(seite.getByText('≈ 240 g')).toBeVisible();

  // Umrechnung anpassen und Standardwerte wiederherstellen
  await seite.getByRole('button', { name: 'Umrechnungen' }).click();
  const fenster = seite.getByRole('dialog', { name: 'Umrechnungen' });
  await fenster.getByLabel('1 EL').fill('25');
  await fenster.getByRole('button', { name: 'Speichern' }).click();
  await seite.getByLabel('Einheit').selectOption('EL');
  await expect(seite.getByText('≈ 25 g')).toBeVisible();

  // In der Suche und im Filter
  await seite.locator('a.zurueck').click();
  await seite.getByRole('radio', { name: 'Nur eigene' }).check({ force: true });
  await seite.getByLabel('Lebensmittel suchen').fill('');
  await expect(seite.getByRole('region', { name: 'Treffer' }).getByText('Frischkäse Natur Testhof')).toBeVisible();
  await seite.getByRole('radio', { name: 'Nur BLS' }).check({ force: true });
  await seite.getByLabel('Lebensmittel suchen').fill('testhof');
  await expect(seite.getByText('Dazu habe ich nichts gefunden')).toBeVisible();
  await seite.getByRole('radio', { name: 'Alle' }).check({ force: true });

  // Bearbeiten, dann löschen mit Rückfrage
  await seite.locator('.treffer', { hasText: 'Frischkäse Natur Testhof' }).click();
  await seite.getByRole('link', { name: 'Bearbeiten' }).click();
  await seite.getByLabel('Name', { exact: true }).fill('Frischkäse Hof');
  await seite.getByRole('button', { name: 'Speichern' }).click();
  await expect(seite.getByRole('heading', { name: 'Frischkäse Hof' })).toBeVisible();
  await seite.getByRole('button', { name: 'Löschen' }).click();
  await seite.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(seite.getByText('Lebensmittel gelöscht.')).toBeVisible();
  await seite.getByLabel('Lebensmittel suchen').fill('Frischkäse Hof');
  await expect(seite.getByText('Dazu habe ich nichts gefunden')).toBeVisible();

  await app.close();
  testordnerLoeschen(ordner);
});

test('Persönliche Version: Original bleibt, Zurücksetzen holt es zurück', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);
  await seite.getByRole('navigation', { name: 'Bereiche' }).getByRole('link', { name: 'Lebensmittel' }).click();
  await seite.getByLabel('Lebensmittel suchen').fill('Olivenöl');
  await seite.locator('.treffer', { hasText: 'Olivenöl' }).first().click();
  await expect(seite.getByRole('heading', { name: 'Olivenöl' })).toBeVisible();

  // 1 EL Öl wiegt 10 g
  await seite.getByLabel('Einheit').selectOption('EL');
  await seite.getByLabel('Menge').fill('2');
  await expect(seite.getByText('≈ 20 g')).toBeVisible();

  await seite.getByRole('link', { name: 'Eigene Version anlegen' }).click();
  await expect(seite.getByText('Das Original aus dem BLS bleibt unverändert')).toBeVisible();
  await seite.getByLabel('Kalorien').fill('800');
  await seite.getByRole('button', { name: 'Speichern' }).click();
  await expect(seite.getByText('Eigene Version', { exact: true })).toBeVisible();
  await seite.getByLabel('Einheit').selectOption('g');
  await expect(seite.locator('.nw-zeile', { hasText: 'Kalorien' }).locator('.nw-100')).toHaveText('800 kcal');

  // In der Suche steht die Version statt des Originals
  await seite.locator('a.zurueck').click();
  const treffer = seite.locator('.treffer', { hasText: 'Olivenöl' });
  await expect(treffer.first()).toContainText('Eigene Version');
  await expect(treffer.first()).toContainText('800 kcal');
  await treffer.first().click();

  await seite.getByRole('button', { name: 'Auf das Original zurücksetzen' }).click();
  await seite.getByRole('dialog').getByRole('button', { name: 'Zurücksetzen' }).click();
  await expect(seite.getByText('Das Original ist wieder da.')).toBeVisible();
  await expect(seite.getByRole('link', { name: 'Eigene Version anlegen' })).toBeVisible();
  await expect(seite.locator('.nw-zeile', { hasText: 'Kalorien' }).locator('.nw-100')).not.toHaveText('800 kcal');

  await app.close();
  testordnerLoeschen(ordner);
});

test('Stückware in Gramm: Eier ohne Größe, und im schmalen Fenster passt alles', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);
  await seite.getByRole('link', { name: 'Einstellungen' }).click();
  await seite.getByRole('radio', { name: /Gramm/ }).check({ force: true });
  await seite.getByRole('navigation', { name: 'Bereiche' }).getByRole('link', { name: 'Lebensmittel' }).click();
  await seite.getByLabel('Lebensmittel suchen').fill('Hühnerei roh');
  await seite.locator('.treffer', { hasText: 'Hühnerei roh' }).first().click();
  await expect(seite.getByLabel('Einheit')).toHaveValue('g');
  await expect(seite.getByLabel('Einheit').locator('option', { hasText: 'Stück' })).toHaveCount(0);

  await seite.setViewportSize({ width: 420, height: 800 });
  const breite = await seite.evaluate(() => document.documentElement.scrollWidth);
  expect(breite).toBeLessThanOrEqual(420);
  await foto(seite, '24-schmal-detail', true);
  await seite.locator('a.zurueck').click();
  expect(await seite.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(420);
  await foto(seite, '25-schmal-suche');
  await app.close();
  testordnerLoeschen(ordner);
});
