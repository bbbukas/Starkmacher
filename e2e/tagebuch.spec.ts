import { expect, test, type Page } from '@playwright/test';
import { ersterStart, foto, programmStarten, testordnerAnlegen, testordnerLoeschen } from './hilfen';

const mahlzeit = (seite: Page, name: string) => seite.getByRole('article', { name });

async function eintragen(seite: Page, wo: string, suche: string, treffer: string | RegExp, menge?: string, einheit?: string) {
  await mahlzeit(seite, wo).getByRole('button', { name: 'Eintragen' }).click();
  const fenster = seite.getByRole('dialog');
  await fenster.getByLabel('Lebensmittel suchen').fill(suche);
  await fenster.locator('.treffer', { hasText: treffer }).first().click();
  if (einheit) await fenster.getByLabel('Einheit').selectOption(einheit);
  if (menge) await fenster.getByLabel('Menge', { exact: true }).fill(menge);
  await fenster.getByRole('button', { name: 'Eintragen' }).click();
  await expect(fenster).toHaveCount(0);
}

test('Einen Tag eintragen: Summe, Stufen, Ändern, Löschen', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);
  await expect(seite.getByText('Ein neuer Tag, alles ist offen.')).toBeVisible();
  await expect(seite.getByRole('article', { name: 'Frühstück' }).getByText('Noch nichts eingetragen.')).toBeVisible();
  for (const m of ['Frühstück', 'Mittag', 'Abend', 'Nacht', 'Snacks']) await expect(mahlzeit(seite, m)).toBeVisible();
  await foto(seite, '30-tag-leer');

  // Lebensmittel eintragen, die Mengenwahl rechnet mit
  await mahlzeit(seite, 'Frühstück').getByRole('button', { name: 'Eintragen' }).click();
  const fenster = seite.getByRole('dialog');
  await fenster.getByLabel('Lebensmittel suchen').fill('haferflocken');
  await fenster.locator('.treffer', { hasText: 'Hafer Flocken' }).first().click();
  await fenster.getByLabel('Einheit').selectOption('EL');
  await fenster.getByLabel('Menge', { exact: true }).fill('5');
  await expect(fenster.locator('.eintrag-vorschau')).toContainText('≈ 40 g');
  await foto(seite, '31-eintragen');
  await fenster.getByRole('button', { name: 'Eintragen' }).click();

  const hafer = mahlzeit(seite, 'Frühstück').locator('.eintrag', { hasText: 'Hafer Flocken' });
  await expect(hafer).toContainText('5 EL ≈ 40 g');

  // Die Tagessumme zählt mit, und der Teller füllt sich
  const zahl = async () => Number((await seite.locator('.teller-zahl').innerText()).replace(/\./g, ''));
  await expect.poll(zahl).toBeGreaterThan(100);
  const nachHafer = await zahl();
  await expect(seite.locator('.summe .g-aminosaeuren .rest')).toContainText('noch');

  // Eier nach Größe
  await eintragen(seite, 'Frühstück', 'ei', 'Hühnerei roh');
  await expect(mahlzeit(seite, 'Frühstück').locator('.eintrag', { hasText: 'Hühnerei roh' })).toContainText('1 Stück (M) ≈ 52 g');
  await expect.poll(zahl).toBeGreaterThan(nachHafer);

  // Stufen: Vitamin B12 steht in der Gruppe, Vitamin D ist nie eine Lücke
  await expect(seite.locator('details.g-vitamine .zeile', { hasText: 'Vitamin B12' }).locator('.lage')).toContainText('noch');
  await expect(seite.locator('details.g-vitamine .zeile', { hasText: /^Vitamin DE/ }).locator('.lage')).toContainText('kommt vor allem von der Sonne');
  await expect(seite.locator('.fehlt .kurz')).not.toContainText('Vitamin D');

  // Minimum erreicht: Das soll man sehen. 500 g Lachs bringen Vitamin B12 und EPA und DHA über das Minimum.
  await eintragen(seite, 'Abend', 'lachs gegrillt', 'Lachs gegrillt', '500', 'g');
  await expect(seite.locator('details.g-vitamine .zeile', { hasText: 'Vitamin B12' }).locator('.lage')).toContainText('✓ Minimum erreicht');
  await seite.locator('details.g-fettsaeuren summary').click();
  await expect(seite.locator('details.g-fettsaeuren .zeile', { hasText: 'EPA und DHA zusammen' }).locator('.lage')).not.toContainText('noch 250');
  await expect(seite.locator('details.g-vitamine .stand')).toContainText(/\d+ von \d+ geschafft/);
  await foto(seite, '32-tag-gefuellt', true);

  // Ändern: Menge und Mahlzeit
  await mahlzeit(seite, 'Abend').locator('.eintrag', { hasText: 'Lachs gegrillt' }).click();
  const bearbeiten = seite.getByRole('dialog');
  await bearbeiten.getByLabel('Menge', { exact: true }).fill('100');
  await bearbeiten.getByLabel('Mahlzeit').selectOption('mittag');
  await bearbeiten.getByRole('button', { name: 'Speichern' }).click();
  await expect(mahlzeit(seite, 'Mittag').locator('.eintrag', { hasText: 'Lachs gegrillt' })).toContainText('100 g');
  await expect(mahlzeit(seite, 'Abend').getByText('Noch nichts eingetragen.')).toBeVisible();

  // Löschen
  await mahlzeit(seite, 'Mittag').locator('.eintrag', { hasText: 'Lachs gegrillt' }).click();
  await seite.getByRole('dialog').getByRole('button', { name: 'Eintrag löschen' }).click();
  await expect(mahlzeit(seite, 'Mittag').getByText('Noch nichts eingetragen.')).toBeVisible();

  // Zuletzt Gegessenes steht beim nächsten Eintragen oben. Der gelöschte Lachs zählt nicht mehr.
  await mahlzeit(seite, 'Snacks').getByRole('button', { name: 'Eintragen' }).click();
  const zuletzt = seite.getByRole('region', { name: 'Zuletzt gegessen' });
  await expect(zuletzt.locator('.treffer').first()).toContainText('Hühnerei roh');
  await expect(zuletzt.getByText('Hafer Flocken')).toBeVisible();
  await expect(zuletzt.getByText('Lachs gegrillt')).toHaveCount(0);
  await seite.getByRole('dialog').getByRole('button', { name: 'Schließen' }).click();

  await app.close();
  testordnerLoeschen(ordner);
});

test('Was fehlt, und ein Klick trägt den Vorschlag ein', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);

  const fehlt = seite.getByRole('region', { name: 'Was heute noch fehlt' });
  await expect(fehlt.locator('.kurz')).toContainText(/Noch etwa [\d.]+ kcal und .* Eiweiß/);
  const vorschlag = fehlt.locator('.vorschlag-tag').first();
  await expect(vorschlag).toContainText('Etwa');
  await expect(vorschlag.locator('.wirkung')).toContainText('kcal');
  // Nichts Exotisches
  await expect(fehlt).not.toContainText(/Kaviar|Hummer|Nährhefe/);
  await foto(seite, '33-vorschlaege');

  const vorher = await fehlt.locator('.kurz').innerText();
  await fehlt.getByLabel('Vorschläge eintragen bei').selectOption('snacks');
  const name = (await vorschlag.locator('b').innerText()).replace(/^Etwa .*?(g|\)|EL|TL|Stück) /, '');
  await vorschlag.getByRole('button', { name: 'Eintragen' }).click();
  await expect(seite.getByText(/ist eingetragen, bei Snacks/)).toBeVisible();
  await expect(mahlzeit(seite, 'Snacks').locator('.eintrag')).toHaveCount(1);
  await expect(mahlzeit(seite, 'Snacks').locator('.eintrag')).toContainText(name.slice(0, 5));
  await expect(fehlt.locator('.kurz')).not.toHaveText(vorher);

  await app.close();
  testordnerLoeschen(ordner);
});

test('Den Tag wechseln, und ein alter Eintrag behält seinen Stand', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);
  const titel = seite.locator('.tag h1');
  const heute = await titel.innerText();
  await expect(seite.locator('.heute')).toBeVisible();

  await eintragen(seite, 'Mittag', 'Olivenöl', 'Olivenöl', '100', 'g');
  const kcal = mahlzeit(seite, 'Mittag').locator('.eintrag', { hasText: 'Olivenöl' }).locator('.kc');
  const vorher = await kcal.innerText();

  // Eigene Version mit anderen Kalorien: Der Eintrag von heute ändert sich nicht.
  await seite.getByRole('navigation', { name: 'Bereiche' }).getByRole('link', { name: 'Lebensmittel' }).click();
  await seite.getByLabel('Lebensmittel suchen').fill('Olivenöl');
  await seite.locator('.treffer', { hasText: 'Olivenöl' }).first().click();
  await seite.getByRole('link', { name: 'Eigene Version anlegen' }).click();
  await seite.getByLabel('Kalorien').fill('100');
  await seite.getByRole('button', { name: 'Speichern' }).click();
  await expect(seite.getByText('Eigene Version', { exact: true })).toBeVisible();
  await seite.getByRole('navigation', { name: 'Bereiche' }).getByRole('link', { name: 'Tagebuch' }).click();
  await expect(kcal).toHaveText(vorher);

  // Pfeile: ein Tag zurück ist leer, und „Zu heute“ führt zurück
  await seite.getByRole('button', { name: 'Tag davor' }).click();
  await expect(titel).not.toHaveText(heute);
  await expect(seite.locator('.heute')).toHaveCount(0);
  await expect(mahlzeit(seite, 'Mittag').getByText('Noch nichts eingetragen.')).toBeVisible();
  await seite.getByRole('button', { name: 'Tag danach' }).click();
  await expect(titel).toHaveText(heute);
  await expect(kcal).toHaveText(vorher);

  // Kalender: ein bestimmter Tag
  await seite.getByLabel('Tag wählen').fill('2026-03-15');
  await expect(titel).toHaveText('Sonntag, 15. März');
  await expect(mahlzeit(seite, 'Mittag').getByText('Noch nichts eingetragen.')).toBeVisible();
  await expect(seite.getByRole('region', { name: 'Was heute noch fehlt' })).toBeVisible();
  await seite.getByRole('button', { name: 'Zu heute' }).click();
  await expect(titel).toHaveText(heute);

  // Nach dem Neustart ist alles noch da.
  await app.close();
  const zweit = await programmStarten(ordner);
  await expect(mahlzeit(zweit.seite, 'Mittag').locator('.eintrag', { hasText: 'Olivenöl' }).locator('.kc')).toHaveText(vorher);
  await zweit.app.close();
  testordnerLoeschen(ordner);
});

test('Über dem Höchstwert: freundlich, und im schmalen Fenster passt alles', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);
  await eintragen(seite, 'Snacks', 'Speisesalz', 'Speisesalz', '10', 'g');
  const salz = seite.locator('details.g-mineralstoffe .zeile', { hasText: /^SalzH/ });
  await expect(salz.locator('.lage')).toHaveText('heute etwas mehr');
  await expect(salz.locator('.balken-mehr')).toBeVisible();
  // Nichts Rotes als Warnung und kein Vorschlag mit noch mehr Salz
  await expect(seite.getByRole('region', { name: 'Was heute noch fehlt' })).not.toContainText('Parmesan');

  await seite.setViewportSize({ width: 420, height: 800 });
  expect(await seite.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(420);
  await foto(seite, '34-schmal-tag', true);
  await mahlzeit(seite, 'Mittag').getByRole('button', { name: 'Eintragen' }).click();
  expect(await seite.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(420);
  await app.close();
  testordnerLoeschen(ordner);
});
