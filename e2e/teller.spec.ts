import { expect, test, type Page } from '@playwright/test';
import { ersterStart, foto, programmStarten, testordnerAnlegen, testordnerLoeschen } from './hilfen';

const reiter = (seite: Page, name: string) => seite.getByRole('navigation', { name: 'Bereiche' }).getByRole('link', { name }).click();

/** Legt etwas in der Rolle auf den Teller. Bei schon belegter Rolle führt der Knopf über „Dazu“. */
async function auflegen(seite: Page, rolle: string, suche: string, treffer: string | RegExp, menge?: string, einheit?: string) {
  const region = seite.getByRole('region', { name: rolle });
  if (await region.count()) await region.getByRole('button', { name: new RegExp(`${rolle}: noch etwas dazu`) }).click();
  else await seite.getByRole('region', { name: 'Auf den Teller legen' }).getByRole('button', { name: rolle }).click();
  const fenster = seite.getByRole('dialog', { name: 'Auf den Teller legen' });
  await fenster.getByLabel('Lebensmittel suchen').fill(suche);
  await fenster.locator('.treffer', { hasText: treffer }).first().click();
  if (einheit) await fenster.getByLabel('Einheit').selectOption(einheit);
  if (menge) await fenster.getByLabel('Menge', { exact: true }).fill(menge);
  await fenster.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(fenster).toHaveCount(0);
}

test('Teller anlegen: nach Rollen geordnet, Nährwerte, speichern, ändern, löschen', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);
  await reiter(seite, 'Teller');
  await expect(seite.getByText('Hier stellst du einfache Mahlzeiten zusammen')).toBeVisible();
  await seite.getByRole('link', { name: 'Neuer Teller' }).click();
  await expect(seite.getByText('Sobald etwas auf dem Teller liegt')).toBeVisible();
  await expect(seite.getByRole('button', { name: 'Ins Tagebuch' })).toBeDisabled();

  // Ohne Name und Inhalt lässt er sich nicht aufheben
  await seite.getByRole('button', { name: 'Speichern' }).click();
  await expect(seite.getByRole('alert')).toContainText('Namen');
  await seite.getByLabel('Name', { exact: true }).fill('Nudeln mit Lachs');
  await seite.getByRole('button', { name: 'Speichern' }).click();
  await expect(seite.getByRole('alert')).toContainText('auf den Teller');

  // Bestandteile mit Rollen: Die Ansicht ordnet sie, egal in welcher Reihenfolge sie kommen
  await auflegen(seite, 'Soße und Dip', 'Olivenöl', 'Olivenöl', '1', 'EL');
  await auflegen(seite, 'Beilage', 'teigwaren eifrei, gekocht', 'Teigwaren eifrei, gekocht', '200');
  await auflegen(seite, 'Hauptsache', 'lachs gegrillt', 'Lachs gegrillt', '150');
  await auflegen(seite, 'Gemüse und Salat', 'spinat gedünstet', 'Spinat gedünstet', '100');
  const titel = await seite.locator('.teller-rolle h2').allInnerTexts();
  expect(titel).toEqual(['Hauptsache', 'Beilage', 'Gemüse und Salat', 'Soße und Dip']);
  await expect(seite.getByRole('region', { name: 'Soße und Dip' })).toContainText('1 EL ≈ 10 g');
  await expect(seite.getByRole('alert')).toHaveCount(0);

  // Nährwerte des ganzen Tellers mit Anteil am Tagesbedarf
  const kcal = async () => Number((await seite.getByRole('region', { name: 'Der ganze Teller' }).locator('.teller-zahl').innerText()).replace(/\D/g, ''));
  await expect.poll(kcal).toBeGreaterThan(300);
  await expect(seite.locator('details.g-vitamine .nw-zeile', { hasText: 'Vitamin B12' }).locator('.nw-anteil')).toContainText('%');
  await foto(seite, '50-teller', true);

  // Noch eine zweite Sache in derselben Rolle, und ein Rollenwechsel
  await auflegen(seite, 'Gemüse und Salat', 'tomate roh', 'Tomate roh', '100');
  await expect(seite.getByRole('region', { name: 'Gemüse und Salat' }).locator('.zutat-zeile')).toHaveCount(2);
  await seite.getByRole('button', { name: 'Tomate roh ändern' }).click();
  const aendern = seite.getByRole('dialog', { name: 'Bestandteil ändern' });
  await aendern.getByLabel('Rolle auf dem Teller').selectOption('topping');
  await aendern.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(seite.getByRole('region', { name: 'Topping' })).toContainText('Tomate roh');
  await seite.getByRole('button', { name: 'Tomate roh entfernen' }).click();
  await expect(seite.getByRole('region', { name: 'Topping' })).toHaveCount(0);

  // Speichern: Er steht in der Liste und kommt mit allem wieder
  await seite.getByRole('button', { name: 'Speichern' }).click();
  await expect(seite.getByText('Teller gespeichert.')).toBeVisible();
  await reiter(seite, 'Teller');
  const karte = seite.locator('.rezept-karte', { hasText: 'Nudeln mit Lachs' });
  await expect(karte).toContainText('Lachs gegrillt, Teigwaren eifrei, Spinat gedünstet und 1 mehr');
  await seite.getByLabel('Teller suchen').fill('gibtsnicht');
  await expect(seite.getByText('Dazu passt gerade kein Teller.')).toBeVisible();
  await seite.getByLabel('Teller suchen').fill('nudeln');
  await karte.click();
  await expect(seite.getByLabel('Name', { exact: true })).toHaveValue('Nudeln mit Lachs');
  await expect(seite.locator('.zutat-zeile')).toHaveCount(4);

  // Löschen mit Rückfrage
  await seite.getByRole('button', { name: 'Löschen' }).click();
  await seite.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(seite.getByText('Teller gelöscht.')).toBeVisible();
  await seite.getByLabel('Teller suchen').fill('');
  await expect(seite.locator('.rezept-karte')).toHaveCount(0);

  await app.close();
  testordnerLoeschen(ordner);
});

test('Teller ins Tagebuch: direkt, gespeichert, angepasst, alter Stand bleibt', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);
  await reiter(seite, 'Teller');
  await seite.getByRole('link', { name: 'Neuer Teller' }).click();
  await auflegen(seite, 'Hauptsache', 'Olivenöl', 'Olivenöl', '4', 'EL');
  await auflegen(seite, 'Beilage', 'teigwaren eifrei, gekocht', 'Teigwaren eifrei, gekocht', '200');

  // Direkt ins Tagebuch, ganz ohne Namen
  await seite.getByRole('button', { name: 'Ins Tagebuch' }).click();
  const fenster = seite.getByRole('dialog', { name: 'Ins Tagebuch eintragen' });
  await fenster.getByLabel('Mahlzeit').selectOption('mittag');
  await fenster.getByRole('button', { name: 'Eintragen' }).click();
  const mittag = seite.getByRole('article', { name: 'Mittag' });
  const entwurf = mittag.locator('.eintrag');
  await expect(entwurf).toContainText('Olivenöl und Teigwaren eifrei');
  await expect(entwurf).toContainText('Teller');
  await expect(entwurf).toContainText('1 Teller');

  // Er wurde dabei nicht aufgehoben
  await reiter(seite, 'Teller');
  await expect(seite.locator('.rezept-karte')).toHaveCount(0);

  // Einen Teller mit Namen aufheben und im Tagebuch wiederverwenden
  await seite.getByRole('link', { name: 'Neuer Teller' }).click();
  await seite.getByLabel('Name', { exact: true }).fill('Mein Mittag');
  await auflegen(seite, 'Hauptsache', 'teigwaren eifrei, gekocht', 'Teigwaren eifrei, gekocht', '300');
  await auflegen(seite, 'Soße und Dip', 'Olivenöl', 'Olivenöl', '2', 'EL');
  await seite.getByRole('button', { name: 'Speichern' }).click();
  await expect(seite.locator('.seitentitel')).toHaveText('Mein Mittag');

  await reiter(seite, 'Tagebuch');
  const abend = seite.getByRole('article', { name: 'Abend' });
  await abend.getByRole('button', { name: 'Eintragen' }).click();
  const auswahl = seite.getByRole('dialog', { name: 'Eintragen: Abend' });
  await auswahl.getByLabel('Lebensmittel suchen').fill('mein mittag');
  await auswahl.getByRole('region', { name: 'Deine Teller' }).locator('.treffer').first().click();
  await auswahl.getByRole('button', { name: '1½ Teller' }).click();
  await foto(seite, '51-teller-eintragen');
  await auswahl.getByRole('button', { name: 'Eintragen' }).click();
  const eintrag = abend.locator('.eintrag', { hasText: 'Mein Mittag' });
  await expect(eintrag).toContainText('1,5 Teller');
  const kc = async () => Number((await eintrag.locator('.kc').innerText()).replace(/\D/g, ''));
  const anfang = await kc();
  expect(anfang).toBeGreaterThan(800);

  // Für dieses eine Mal: Die Mengen gelten für das Eingetragene
  await eintrag.click();
  const bearbeiten = seite.getByRole('dialog', { name: 'Mein Mittag' });
  await expect(bearbeiten.getByLabel('Olivenöl', { exact: true })).toHaveValue('3');
  await expect(bearbeiten.getByText('Der Teller bleibt, wie er ist.')).toBeVisible();
  await bearbeiten.getByLabel('Olivenöl', { exact: true }).fill('1');
  await foto(seite, '52-teller-anpassen');
  await bearbeiten.getByRole('button', { name: 'Speichern' }).click();
  await expect(eintrag).toContainText('heute angepasst');
  await expect.poll(kc).toBeLessThan(anfang);
  const danach = await kc();

  // Der gespeicherte Teller ist unverändert, und seine Änderung ändert den Tag nicht
  await reiter(seite, 'Teller');
  await seite.locator('.rezept-karte', { hasText: 'Mein Mittag' }).click();
  await expect(seite.getByRole('region', { name: 'Soße und Dip' })).toContainText('2 EL ≈ 20 g');
  await seite.getByRole('button', { name: 'Olivenöl entfernen' }).click();
  await seite.getByRole('button', { name: 'Speichern' }).click();
  await expect(seite.getByText('Teller gespeichert.')).toBeVisible();
  await reiter(seite, 'Tagebuch');
  await expect(eintrag.locator('.kc')).toHaveText(String(danach));

  // Zuletzt Gegessenes zeigt den Teller
  await seite.getByRole('article', { name: 'Snacks' }).getByRole('button', { name: 'Eintragen' }).click();
  await expect(seite.getByRole('region', { name: 'Zuletzt gegessen' })).toContainText('Mein Mittag');
  await seite.getByRole('dialog').getByRole('button', { name: 'Schließen' }).click();
  await foto(seite, '53-tag-mit-teller', true);

  // Im schmalen Fenster passt alles
  await seite.setViewportSize({ width: 420, height: 800 });
  expect(await seite.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(420);
  await reiter(seite, 'Teller');
  await seite.locator('.rezept-karte').click();
  await expect(seite.getByLabel('Name', { exact: true })).toHaveValue('Mein Mittag');
  expect(await seite.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(420);
  await foto(seite, '54-schmal-teller', true);

  await app.close();
  testordnerLoeschen(ordner);
});

test('Ein Rezept auf dem Teller: als Portion, und seine Zutaten lassen sich im Tagebuch anpassen', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);

  await reiter(seite, 'Rezepte');
  await seite.getByRole('link', { name: 'Neues Rezept' }).click();
  await seite.getByLabel('Name', { exact: true }).fill('Tomatensoße');
  await seite.getByLabel('Portionen').fill('4');
  await seite.getByRole('button', { name: 'Zutat hinzufügen' }).click();
  const zutat = seite.getByRole('dialog', { name: 'Zutat hinzufügen' });
  await zutat.getByLabel('Lebensmittel suchen').fill('tomate roh');
  await zutat.locator('.treffer', { hasText: 'Tomate roh' }).first().click();
  await zutat.getByLabel('Menge', { exact: true }).fill('800');
  await zutat.getByLabel('Einheit').selectOption('g');
  await zutat.getByRole('button', { name: 'Übernehmen' }).click();
  await seite.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(seite.getByRole('heading', { name: 'Tomatensoße', level: 1 })).toBeVisible();

  await reiter(seite, 'Teller');
  await seite.getByRole('link', { name: 'Neuer Teller' }).click();
  await seite.getByRole('region', { name: 'Auf den Teller legen' }).getByRole('button', { name: 'Soße und Dip' }).click();
  const fenster = seite.getByRole('dialog', { name: 'Auf den Teller legen' });
  await fenster.getByLabel('Lebensmittel suchen').fill('tomatensoße');
  await fenster.getByRole('region', { name: 'Deine Rezepte' }).locator('.treffer').first().click();
  await fenster.getByRole('button', { name: '½ Portionen', exact: true }).click();
  await fenster.getByRole('button', { name: 'Übernehmen' }).click();
  const zeile = seite.getByRole('region', { name: 'Soße und Dip' }).locator('.zutat-zeile');
  await expect(zeile).toContainText('Tomatensoße');
  await expect(zeile).toContainText('Rezept');
  await expect(zeile).toContainText('0,5 Portionen');

  await seite.getByRole('button', { name: 'Ins Tagebuch' }).click();
  await seite.getByRole('dialog', { name: 'Ins Tagebuch eintragen' }).getByRole('button', { name: 'Eintragen' }).click();
  await seite.locator('.eintrag', { hasText: 'Tomatensoße' }).click();
  const bearbeiten = seite.getByRole('dialog', { name: 'Tomatensoße' });
  await expect(bearbeiten.getByLabel('Tomate roh (aus Tomatensoße)', { exact: true })).toHaveValue('100');

  await app.close();
  testordnerLoeschen(ordner);
});
