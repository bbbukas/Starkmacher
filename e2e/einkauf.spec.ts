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

/** Vier Portionen: 400 g Nudeln, 4 EL Öl, 2 Eier. Bleibt auf der Seite des Rezepts. */
async function rezeptAnlegen(seite: Page) {
  await reiter(seite, 'Rezepte');
  await seite.getByRole('link', { name: 'Neues Rezept' }).click();
  await seite.getByLabel('Name', { exact: true }).fill('Nudelauflauf');
  await seite.getByLabel('Portionen').fill('4');
  await zutat(seite, 'teigwaren eifrei, gekocht', 'Teigwaren eifrei, gekocht', '400');
  await zutat(seite, 'Olivenöl', 'Olivenöl', '4', 'EL');
  await zutat(seite, 'ei', 'Hühnerei roh', '2');
  await seite.getByLabel(/Notiz/).fill('1 Prise Muskat');
  await seite.getByRole('button', { name: 'Speichern' }).click();
  await expect(seite.getByRole('heading', { name: 'Nudelauflauf', level: 1 })).toBeVisible();
}

/** 200 g Nudeln und 50 g Öl. Bleibt auf der Seite des Tellers. */
async function tellerAnlegen(seite: Page) {
  await reiter(seite, 'Teller');
  await seite.getByRole('link', { name: 'Neuer Teller' }).click();
  await seite.getByLabel('Name').fill('Schnelle Nudeln');
  const legen = async (rolle: string, suche: string, treffer: string, menge: string) => {
    await seite.getByRole('region', { name: 'Auf den Teller legen' }).getByRole('button', { name: rolle }).click();
    const fenster = seite.getByRole('dialog', { name: 'Auf den Teller legen' });
    await fenster.getByLabel('Lebensmittel suchen').fill(suche);
    await fenster.locator('.treffer', { hasText: treffer }).first().click();
    await fenster.getByLabel('Einheit').selectOption('g');
    await fenster.getByLabel('Menge', { exact: true }).fill(menge);
    await fenster.getByRole('button', { name: 'Übernehmen' }).click();
    await expect(fenster).toHaveCount(0);
  };
  await legen('Beilage', 'teigwaren eifrei, gekocht', 'Teigwaren eifrei, gekocht', '200');
  await legen('Soße und Dip', 'Olivenöl', 'Olivenöl', '50');
  await seite.getByRole('button', { name: 'Speichern' }).click();
  await expect(seite.getByText('Teller gespeichert.')).toBeVisible();
  await expect(seite.getByRole('button', { name: 'Auf die Einkaufsliste' })).toBeVisible();
}

test('Einkaufsliste: wählen, zusammenrechnen, abhaken, kopieren, leeren', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);

  await reiter(seite, 'Einkauf');
  await expect(seite.getByRole('heading', { name: 'Einkaufsliste' })).toBeVisible();
  await expect(seite.getByText('Wähle Rezepte und Teller, die du kochen möchtest.')).toBeVisible();
  await seite.getByRole('button', { name: 'Rezept oder Teller wählen' }).click();
  await expect(seite.getByRole('dialog').getByText('Du hast noch keine Rezepte und Teller.')).toBeVisible();
  await seite.getByRole('dialog').getByRole('button', { name: 'Fertig' }).click();

  // Direkt vom Rezept aus
  await rezeptAnlegen(seite);
  await seite.getByRole('button', { name: 'Auf die Einkaufsliste' }).click();
  await expect(seite.getByText('Auf der Einkaufsliste: 4 Portionen.')).toBeVisible();

  // Ein neuer Teller lässt sich erst nach dem Speichern auf die Liste setzen
  await reiter(seite, 'Teller');
  await seite.getByRole('link', { name: 'Neuer Teller' }).click();
  await expect(seite.getByRole('button', { name: 'Ins Tagebuch' })).toBeVisible();
  await expect(seite.getByRole('button', { name: 'Auf die Einkaufsliste' })).toHaveCount(0);
  await tellerAnlegen(seite);

  // Über die Auswahl: Der Dialog bleibt offen und zeigt, was schon darauf steht
  await reiter(seite, 'Einkauf');
  await seite.getByRole('button', { name: 'Rezept oder Teller wählen' }).click();
  const fenster = seite.getByRole('dialog', { name: 'Was soll auf die Liste?' });
  await expect(fenster.getByRole('button', { name: 'Nudelauflauf auf die Liste' })).toContainText('4 Portionen');
  await fenster.getByLabel('Rezept oder Teller suchen').fill('schnelle');
  await expect(fenster.getByRole('button', { name: 'Nudelauflauf auf die Liste' })).toHaveCount(0);
  await fenster.getByRole('button', { name: 'Schnelle Nudeln auf die Liste' }).click();
  await expect(fenster.getByRole('button', { name: 'Schnelle Nudeln auf die Liste' })).toContainText('1 Teller');
  await fenster.getByRole('button', { name: 'Fertig' }).click();
  await expect(fenster).toHaveCount(0);

  // Zusammengerechnet
  const zeile = (name: string) => seite.locator('.einkauf-zeile', { hasText: name });
  await expect(seite.locator('.einkauf-zeile')).toHaveCount(3);
  await expect(zeile('Teigwaren').locator('.einkauf-menge')).toHaveText('600 g');
  await expect(zeile('Teigwaren')).toContainText('Die Menge gilt gegart');
  await expect(zeile('Teigwaren')).toContainText('für Nudelauflauf, Schnelle Nudeln');
  await expect(zeile('Olivenöl').locator('.einkauf-menge')).toHaveText('≈ 90 g');
  await expect(zeile('Olivenöl')).toContainText('50 g und 4 EL');
  await expect(zeile('Hühnerei').locator('.einkauf-menge')).toHaveText('2 Stück (M)');
  await expect(seite.getByText('Notiz im Rezept: 1 Prise Muskat')).toBeVisible();
  await foto(seite, '80-einkauf');

  // Weniger Portionen: Eier kauft man ganz
  await seite.getByRole('button', { name: 'Nudelauflauf: weniger' }).click();
  await expect(seite.getByText('3 Portionen')).toBeVisible();
  await expect(zeile('Teigwaren').locator('.einkauf-menge')).toHaveText('500 g');
  await expect(zeile('Hühnerei').locator('.einkauf-menge')).toHaveText('2 Stück (M)');
  await expect(zeile('Hühnerei')).toContainText('1,5 gebraucht');

  // Abhaken: Die Zeile bleibt an ihrem Platz, sonst rutscht die nächste unter die Maus
  await seite.getByRole('checkbox', { name: /Hühnerei/ }).check();
  await expect(seite.locator('.einkauf-zeile').first()).toContainText('Hühnerei');
  await expect(seite.locator('.einkauf-zeile').first()).toHaveClass(/abgehakt/);
  await expect(seite.getByRole('status').filter({ hasText: 'abgehakt' })).toHaveText('1 von 3 abgehakt');
  await seite.getByRole('checkbox', { name: /Hühnerei/ }).uncheck();
  await expect(seite.getByRole('status').filter({ hasText: 'abgehakt' })).toHaveText('0 von 3 abgehakt');
  await seite.getByRole('checkbox', { name: /Teigwaren/ }).check();
  await expect(zeile('Teigwaren')).toHaveClass(/abgehakt/);
  await expect(seite.getByRole('status').filter({ hasText: 'abgehakt' })).toHaveText('1 von 3 abgehakt');
  await foto(seite, '81-einkauf-abgehakt');

  // Wird es mehr, gilt der Haken nicht mehr
  await seite.getByRole('button', { name: 'Nudelauflauf: mehr' }).click();
  await expect(zeile('Teigwaren').locator('.einkauf-menge')).toHaveText('600 g');
  await expect(seite.getByRole('checkbox', { name: /Teigwaren/ })).not.toBeChecked();
  await seite.getByRole('checkbox', { name: /Teigwaren/ }).check();
  await expect(seite.getByRole('checkbox', { name: /Teigwaren/ })).toBeChecked();

  // Kopieren: nur, was noch fehlt. Die Zwischenablage des Macs bleibt danach, wie sie war.
  const vorher = await app.evaluate(({ clipboard }) => clipboard.readText());
  await seite.getByRole('button', { name: 'Liste kopieren' }).click();
  await expect(seite.getByText('Liste kopiert.')).toBeVisible();
  const kopiert = await app.evaluate(({ clipboard }) => clipboard.readText());
  await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), vorher);
  expect(kopiert.split('\n')).toEqual(['2 Stück (M) Hühnerei roh', '≈ 90 g Olivenöl']);

  // Nach einem Neustart ist alles noch da
  await app.close();
  const neu = await programmStarten(ordner);
  const s = neu.seite;
  await reiter(s, 'Einkauf');
  await expect(s.getByRole('checkbox', { name: /Teigwaren/ })).toBeChecked();
  await expect(s.getByRole('status').filter({ hasText: 'abgehakt' })).toHaveText('1 von 3 abgehakt');
  await s.getByRole('button', { name: 'Alle Haken entfernen' }).click();
  await expect(s.getByRole('checkbox', { name: /Teigwaren/ })).not.toBeChecked();

  // Noch einmal wählen heißt noch einmal dieselbe Menge
  await s.getByRole('button', { name: 'Rezept oder Teller wählen' }).click();
  await s.getByRole('dialog').getByRole('button', { name: 'Schnelle Nudeln auf die Liste' }).click();
  await expect(s.getByRole('dialog').getByRole('button', { name: 'Schnelle Nudeln auf die Liste' })).toContainText('2 Teller');
  await s.getByRole('dialog').getByRole('button', { name: 'Fertig' }).click();
  await expect(s.locator('.einkauf-zeile', { hasText: 'Teigwaren' }).locator('.einkauf-menge')).toHaveText('800 g');

  // Ein Teller geht von der Liste
  await s.getByRole('button', { name: 'Schnelle Nudeln von der Liste nehmen' }).click();
  await expect(s.locator('.einkauf-zeile', { hasText: 'Teigwaren' }).locator('.einkauf-menge')).toHaveText('400 g');
  await expect(s.locator('.einkauf-zeile', { hasText: 'Olivenöl' }).locator('.einkauf-menge')).toHaveText('4 EL');

  // Ein gelöschtes Rezept sagt es
  await reiter(s, 'Rezepte');
  await s.getByRole('link', { name: /Nudelauflauf/ }).click();
  await s.getByRole('button', { name: 'Löschen' }).click();
  await s.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(s.getByText('Rezept gelöscht.')).toBeVisible();
  await reiter(s, 'Einkauf');
  await expect(s.getByText('Dieses Rezept gibt es nicht mehr.')).toBeVisible();
  await expect(s.locator('.einkauf-zeile')).toHaveCount(0);
  await expect(s.getByText('Hier steht gerade nichts drauf.')).toBeVisible();

  // Leeren fragt nach
  await s.getByRole('button', { name: 'Liste leeren' }).click();
  await s.getByRole('dialog').getByRole('button', { name: 'Leeren' }).click();
  await expect(s.getByText('Wähle Rezepte und Teller, die du kochen möchtest.')).toBeVisible();

  await neu.app.close();
  testordnerLoeschen(ordner);
});

test('Einkaufsliste im schmalen Fenster: Alles passt, auch die sechs Reiter', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);
  await rezeptAnlegen(seite);
  await seite.getByRole('button', { name: 'Auf die Einkaufsliste' }).click();
  await reiter(seite, 'Einkauf');
  await expect(seite.locator('.einkauf-zeile')).toHaveCount(3);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(420, 800));
  await expect.poll(() => seite.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await foto(seite, '82-einkauf-schmal', true);
  await app.close();
  testordnerLoeschen(ordner);
});
