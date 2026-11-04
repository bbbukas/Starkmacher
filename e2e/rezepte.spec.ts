import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ersterStart, foto, programmStarten, testordnerAnlegen, testordnerLoeschen } from './hilfen';

const reiter = (seite: Page, name: string) => seite.getByRole('navigation', { name: 'Bereiche' }).getByRole('link', { name }).click();

async function zutat(seite: Page, suche: string, treffer: string | RegExp, menge: string, einheit?: string) {
  await seite.getByRole('button', { name: 'Zutat hinzufügen' }).click();
  const fenster = seite.getByRole('dialog', { name: 'Zutat hinzufügen' });
  await fenster.getByLabel('Lebensmittel suchen').fill(suche);
  await fenster.locator('.treffer', { hasText: treffer }).first().click();
  if (einheit) await fenster.getByLabel('Einheit').selectOption(einheit);
  await fenster.getByLabel('Menge', { exact: true }).fill(menge);
  await fenster.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(fenster).toHaveCount(0);
}

/** Legt ein Rezept mit vier Portionen an und bleibt auf seiner Seite. */
async function rezeptAnlegen(seite: Page, name: string) {
  await reiter(seite, 'Rezepte');
  await seite.getByRole('link', { name: 'Neues Rezept' }).click();
  await seite.getByLabel('Name', { exact: true }).fill(name);
  await seite.getByLabel('Portionen').fill('4');
  await zutat(seite, 'teigwaren eifrei, gekocht', 'Teigwaren eifrei, gekocht', '400');
  await zutat(seite, 'Olivenöl', 'Olivenöl', '4', 'EL');
  await seite.getByRole('button', { name: 'Speichern' }).click();
  await expect(seite.getByRole('heading', { name, level: 1 })).toBeVisible();
}

test('Rezept anlegen, ansehen, bearbeiten, als Variante speichern, löschen', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);
  await reiter(seite, 'Rezepte');
  await expect(seite.getByText('Hier sammelst du deine eigenen Rezepte.')).toBeVisible();
  await seite.getByRole('link', { name: 'Neues Rezept' }).click();

  // Ohne Name und Zutat geht es nicht
  await seite.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(seite.getByRole('alert')).toContainText('Namen');
  await seite.getByLabel('Name', { exact: true }).fill('Nudeln mit Olivenöl');
  await seite.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(seite.getByRole('alert')).toContainText('Zutat');

  // Zutaten mit Menge und Einheit, die Vorschau rechnet mit
  await seite.getByLabel('Portionen').fill('4');
  await zutat(seite, 'teigwaren eifrei, gekocht', 'Teigwaren eifrei, gekocht', '400');
  await zutat(seite, 'Olivenöl', 'Olivenöl', '4', 'EL');
  await zutat(seite, 'ei', 'Hühnerei roh', '2');
  await expect(seite.locator('.zutat-zeile', { hasText: 'Olivenöl' })).toContainText('4 EL ≈ 40 g');
  await expect(seite.locator('.zutat-zeile', { hasText: 'Hühnerei roh' })).toContainText('2 Stück (M) ≈ 104 g');
  await expect(seite.locator('.eintrag-vorschau')).toContainText('Je Portion');

  // Eine Zutat ändern und eine entfernen
  await seite.getByRole('button', { name: 'Olivenöl ändern' }).click();
  await seite.getByRole('dialog', { name: 'Zutat ändern' }).getByLabel('Menge', { exact: true }).fill('2');
  await seite.getByRole('dialog', { name: 'Zutat ändern' }).getByRole('button', { name: 'Übernehmen' }).click();
  await expect(seite.locator('.zutat-zeile', { hasText: 'Olivenöl' })).toContainText('2 EL ≈ 20 g');
  await seite.getByRole('button', { name: 'Hühnerei roh entfernen' }).click();
  await expect(seite.locator('.zutat-zeile')).toHaveCount(2);

  await seite.getByLabel('Zubereitung').fill('Nudeln kochen\nMit Öl mischen');
  await seite.getByLabel('Notiz (freiwillig)').fill('Schmeckt auch kalt');

  // Foto des Gerichts
  await app.evaluate(({ dialog }, pfad) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [pfad] })) as typeof dialog.showOpenDialog;
  }, join(import.meta.dirname, '../build/icon.png'));
  await seite.getByRole('button', { name: 'Foto wählen' }).click();
  await expect(seite.getByAltText('Foto des Gerichts')).toBeVisible();
  await foto(seite, '40-rezept-formular', true);

  await seite.getByRole('button', { name: 'Speichern', exact: true }).click();

  // Die Rezeptseite: Zutaten, Schritte, Nährwerte für das ganze Rezept und je Portion
  await expect(seite.getByRole('heading', { name: 'Nudeln mit Olivenöl', level: 1 })).toBeVisible();
  await expect(seite.getByText('ergibt 4 Portionen')).toBeVisible();
  await expect(seite.getByRole('region', { name: 'Zutaten' })).toContainText('2 EL ≈ 20 g');
  await expect(seite.getByRole('region', { name: 'Zubereitung' }).getByRole('listitem')).toHaveCount(2);
  await expect(seite.getByRole('region', { name: 'Notiz' })).toContainText('Schmeckt auch kalt');
  await expect(seite.getByAltText('Foto von Nudeln mit Olivenöl')).toBeVisible();
  const kcalZeile = seite.locator('details.g-energie .nw-zeile', { hasText: 'Kalorien' });
  await seite.locator('details.g-energie summary').click();
  const ganz = Number((await kcalZeile.locator('.nw-100').innerText()).replace(/\D/g, ''));
  const portion = Number((await kcalZeile.locator('.nw-menge').innerText()).replace(/\D/g, ''));
  expect(Math.abs(ganz / 4 - portion)).toBeLessThanOrEqual(1);
  await expect(seite.locator('.teller-zahl')).toHaveText(String(portion));
  await expect(seite.locator('details.g-vitamine .nw-zeile', { hasText: 'Vitamin E' }).locator('.nw-anteil')).toContainText('%');
  await foto(seite, '41-rezept', true);

  // In der Liste, mit Suche
  await reiter(seite, 'Rezepte');
  await expect(seite.locator('.rezept-karte', { hasText: 'Nudeln mit Olivenöl' })).toContainText('4 Portionen');
  await seite.getByLabel('Rezept suchen').fill('olivenol');
  await expect(seite.locator('.rezept-karte')).toHaveCount(1);
  await seite.getByLabel('Rezept suchen').fill('gibtsnicht');
  await expect(seite.getByText('Dazu passt gerade kein Rezept.')).toBeVisible();
  await seite.getByLabel('Rezept suchen').fill('');

  // Als neues Rezept speichern: das Original bleibt
  await seite.locator('.rezept-karte').first().click();
  await seite.getByRole('link', { name: 'Als neues Rezept speichern' }).click();
  await expect(seite.getByLabel('Name', { exact: true })).toHaveValue('Nudeln mit Olivenöl (Variante)');
  await seite.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(seite.getByRole('heading', { name: 'Nudeln mit Olivenöl (Variante)', level: 1 })).toBeVisible();
  await reiter(seite, 'Rezepte');
  await expect(seite.locator('.rezept-karte')).toHaveCount(2);

  // Bearbeiten ändert dasselbe Rezept
  await seite.locator('.rezept-karte', { hasText: '(Variante)' }).click();
  await seite.getByRole('link', { name: 'Bearbeiten' }).click();
  await seite.getByLabel('Name', { exact: true }).fill('Ofennudeln');
  await seite.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(seite.getByRole('heading', { name: 'Ofennudeln', level: 1 })).toBeVisible();

  // Löschen mit Rückfrage: das Foto bleibt fürs Original
  await seite.getByRole('button', { name: 'Löschen' }).click();
  await seite.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(seite.getByText('Rezept gelöscht.')).toBeVisible();
  await expect(seite.locator('.rezept-karte')).toHaveCount(1);
  await seite.locator('.rezept-karte').first().click();
  await expect(seite.getByAltText('Foto von Nudeln mit Olivenöl')).toBeVisible();

  await app.close();
  testordnerLoeschen(ordner);
});

test('Hashtags anlegen, umbenennen, einfärben, filtern und löschen', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);
  await rezeptAnlegen(seite, 'Pasta');
  await reiter(seite, 'Rezepte');

  await seite.getByRole('button', { name: 'Hashtags verwalten' }).click();
  const fenster = seite.getByRole('dialog', { name: 'Hashtags' });
  for (const name of ['#vegan', 'unter 30 Minuten']) {
    await fenster.getByLabel('Neuer Hashtag').fill(name);
    await fenster.getByRole('button', { name: 'Anlegen' }).click();
    await expect(fenster.getByLabel('Neuer Hashtag')).toHaveValue('');
  }
  await expect(fenster.getByLabel('Name von #unter30Minuten')).toBeVisible();
  // Doppelt geht nicht
  await fenster.getByLabel('Neuer Hashtag').fill('VEGAN');
  await fenster.getByRole('button', { name: 'Anlegen' }).click();
  await expect(seite.getByText('Den Hashtag #VEGAN gibt es schon.')).toBeVisible();
  await fenster.getByLabel('Neuer Hashtag').fill('');
  // Umbenennen und einfärben
  await fenster.getByLabel('Name von #vegan').fill('pflanzlich');
  await fenster.getByLabel('Name von #vegan').blur();
  await expect(fenster.getByLabel('Name von #pflanzlich')).toBeVisible();
  await fenster.getByRole('radiogroup', { name: 'Farbe von pflanzlich' }).getByRole('radio', { name: 'minze' }).click({ force: true });
  await expect(fenster.getByRole('radiogroup', { name: 'Farbe von pflanzlich' }).getByRole('radio', { name: 'minze' })).toBeChecked();
  await foto(seite, '42-hashtags');
  await fenster.getByRole('button', { name: 'Fertig' }).click();

  // Dem Rezept zuordnen
  await seite.locator('.rezept-karte').click();
  await seite.getByRole('link', { name: 'Bearbeiten' }).click();
  await seite.getByRole('region', { name: 'Hashtags' }).getByText('#pflanzlich').click();
  await seite.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(seite.locator('.unter-titel')).toContainText('#pflanzlich');

  // Zweites Rezept mit beiden Hashtags
  await rezeptAnlegen(seite, 'Salat');
  await seite.getByRole('link', { name: 'Bearbeiten' }).click();
  await seite.getByRole('region', { name: 'Hashtags' }).getByText('#pflanzlich').click();
  await seite.getByRole('region', { name: 'Hashtags' }).getByText('#unter30Minuten').click();
  await seite.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(seite.locator('.unter-titel')).toContainText('#unter30Minuten');

  // Filtern nach mehreren: Beide müssen passen
  await reiter(seite, 'Rezepte');
  const filter = seite.locator('.hashtag-filter');
  await expect(seite.locator('.rezept-karte')).toHaveCount(2);
  await filter.getByText('#pflanzlich').click();
  await expect(seite.locator('.rezept-karte')).toHaveCount(2);
  await filter.getByText('#unter30Minuten').click();
  await expect(seite.locator('.rezept-karte')).toHaveCount(1);
  await expect(seite.locator('.rezept-karte')).toContainText('Salat');
  await foto(seite, '43-rezepte-gefiltert');

  // Löschen mit Rückfrage: Das Rezept bleibt
  await seite.getByRole('button', { name: 'Hashtags verwalten' }).click();
  await seite.getByRole('button', { name: '#unter30Minuten löschen' }).click();
  await seite.getByRole('dialog', { name: 'Hashtag löschen?' }).getByRole('button', { name: 'Löschen' }).click();
  await expect(seite.getByRole('dialog', { name: 'Hashtags' }).getByLabel('Name von #unter30Minuten')).toHaveCount(0);
  await seite.getByRole('dialog', { name: 'Hashtags' }).getByRole('button', { name: 'Fertig' }).click();
  await expect(seite.locator('.rezept-karte')).toHaveCount(2);

  await app.close();
  testordnerLoeschen(ordner);
});

test('Rezept im Tagebuch: Portionen, für dieses eine Mal weniger Öl, alter Stand bleibt', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);
  await rezeptAnlegen(seite, 'Pasta aglio e olio');

  // Von der Rezeptseite ins Tagebuch
  await seite.getByRole('button', { name: 'Ins Tagebuch' }).click();
  const fenster = seite.getByRole('dialog', { name: 'Ins Tagebuch eintragen' });
  await fenster.getByRole('button', { name: '1½ Portionen' }).click();
  await fenster.getByLabel('Mahlzeit').selectOption('abend');
  await fenster.getByRole('button', { name: 'Eintragen' }).click();

  const abend = seite.getByRole('article', { name: 'Abend' });
  const eintrag = abend.locator('.eintrag', { hasText: 'Pasta aglio e olio' });
  await expect(eintrag).toContainText('1,5 Portionen');
  await expect(eintrag).toContainText('Rezept');
  const kcal = async () => Number((await eintrag.locator('.kc').innerText()).replace(/\D/g, ''));
  const anfang = await kcal();
  expect(anfang).toBeGreaterThan(300);

  // Portionen ändern: Die Zutaten wachsen mit
  await eintrag.click();
  let bearbeiten = seite.getByRole('dialog', { name: 'Pasta aglio e olio' });
  await expect(bearbeiten.getByLabel('Olivenöl', { exact: true })).toHaveValue('1,5');
  await bearbeiten.getByLabel('Portionen', { exact: true }).fill('1');
  await expect(bearbeiten.getByLabel('Olivenöl', { exact: true })).toHaveValue('1');
  await foto(seite, '44-eintrag-anpassen');
  await bearbeiten.getByRole('button', { name: 'Speichern' }).click();
  await expect(eintrag).toContainText('1 Portion');
  await expect(eintrag).not.toContainText('heute angepasst');
  const einePortion = await kcal();
  expect(einePortion).toBeLessThan(anfang);

  // Für dieses eine Mal weniger Öl
  await eintrag.click();
  bearbeiten = seite.getByRole('dialog', { name: 'Pasta aglio e olio' });
  await bearbeiten.getByLabel('Olivenöl', { exact: true }).fill('0,5');
  await bearbeiten.getByRole('button', { name: 'Speichern' }).click();
  await expect(eintrag).toContainText('heute angepasst');
  const wenigerOel = await kcal();
  expect(wenigerOel).toBeLessThan(einePortion);

  // Eine Zutat dazu, eine weg
  await eintrag.click();
  bearbeiten = seite.getByRole('dialog', { name: 'Pasta aglio e olio' });
  await bearbeiten.getByRole('button', { name: 'Zutat dazu' }).click();
  const dazu = seite.getByRole('dialog', { name: 'Zutat dazu' });
  await dazu.getByLabel('Lebensmittel suchen').fill('Tomate roh');
  await dazu.locator('.treffer', { hasText: 'Tomate roh' }).first().click();
  await dazu.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(bearbeiten.getByLabel('Tomate roh', { exact: true })).toBeVisible();
  await bearbeiten.getByRole('button', { name: 'Olivenöl weglassen' }).click();
  await expect(bearbeiten.getByLabel('Olivenöl', { exact: true })).toHaveCount(0);
  await bearbeiten.getByRole('button', { name: 'Speichern' }).click();
  await expect.poll(kcal).toBeLessThan(wenigerOel);
  const nachAnpassung = await kcal();

  // Das Rezept selbst ist unverändert
  await seite.getByRole('navigation', { name: 'Bereiche' }).getByRole('link', { name: 'Rezepte' }).click();
  await seite.locator('.rezept-karte').click();
  await expect(seite.getByRole('region', { name: 'Zutaten' })).toContainText('4 EL ≈ 40 g');
  await expect(seite.getByRole('region', { name: 'Zutaten' })).not.toContainText('Tomate');

  // Rezept ändern: Der Eintrag im Tagebuch behält seinen Stand
  await seite.getByRole('link', { name: 'Bearbeiten' }).click();
  await seite.getByRole('button', { name: 'Olivenöl entfernen' }).click();
  await seite.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(seite.getByRole('region', { name: 'Zutaten' })).not.toContainText('Olivenöl');
  await reiter(seite, 'Tagebuch');
  await expect(abend.locator('.eintrag .kc')).toHaveText(String(nachAnpassung));

  // Beim Eintragen stehen Rezepte mit in der Auswahl, zuletzt Gegessenes oben
  await seite.getByRole('article', { name: 'Mittag' }).getByRole('button', { name: 'Eintragen' }).click();
  const auswahl = seite.getByRole('dialog', { name: 'Eintragen: Mittag' });
  await expect(auswahl.getByRole('region', { name: 'Zuletzt gegessen' })).toContainText('Pasta aglio e olio');
  await auswahl.getByLabel('Lebensmittel suchen').fill('aglio');
  await auswahl.getByRole('region', { name: 'Deine Rezepte' }).locator('.treffer').first().click();
  await auswahl.getByRole('button', { name: '½ Portionen', exact: true }).click();
  await auswahl.getByRole('button', { name: 'Eintragen' }).click();
  await expect(seite.getByRole('article', { name: 'Mittag' }).locator('.eintrag')).toContainText('0,5 Portionen');
  await foto(seite, '45-tag-mit-rezept', true);

  await seite.setViewportSize({ width: 420, height: 800 });
  expect(await seite.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(420);
  await reiter(seite, 'Rezepte');
  expect(await seite.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(420);
  await seite.locator('.rezept-karte').click();
  expect(await seite.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(420);
  await foto(seite, '46-schmal-rezept', true);

  await app.close();
  testordnerLoeschen(ordner);
});
