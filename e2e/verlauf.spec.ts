import { expect, test, type Page } from '@playwright/test';
import { ersterStart, foto, gespeichert, programmStarten, testordnerAnlegen, testordnerLoeschen } from './hilfen';

const mahlzeit = (seite: Page, name: string) => seite.getByRole('article', { name });

async function eintragen(seite: Page, wo: string, suche: string, treffer: string | RegExp, menge: string, einheit: string) {
  await mahlzeit(seite, wo).getByRole('button', { name: 'Eintragen' }).click();
  const fenster = seite.getByRole('dialog');
  await fenster.getByLabel('Lebensmittel suchen').fill(suche);
  await fenster.locator('.treffer', { hasText: treffer }).first().click();
  await fenster.getByLabel('Einheit').selectOption(einheit);
  await fenster.getByLabel('Menge', { exact: true }).fill(menge);
  await fenster.getByRole('button', { name: 'Eintragen' }).click();
  await expect(fenster).toHaveCount(0);
}

const zweistellig = (z: number) => String(z).padStart(2, '0');
const alsDatum = (d: Date) => `${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())}`;

/** Montag vor einer Woche: immer ein vergangener Tag, und die ganze Woche ist vorbei. */
function montagLetzteWoche(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7);
  return d;
}

test('Gewicht: mit Datum eintragen, Kurve, der neueste Wert gilt, löschen', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);
  await seite.getByRole('link', { name: 'Verlauf' }).click();
  const gewicht = seite.getByRole('region', { name: 'Gewicht' });
  await expect(seite.getByRole('heading', { name: 'Verlauf' })).toBeVisible();
  await expect(gewicht.locator('.gewicht-stand')).toContainText('70 kg');
  await expect(gewicht.getByText('Ab dem zweiten Wert entsteht eine Kurve.')).toBeVisible();
  await expect(gewicht.locator('.kurve-linie')).toHaveCount(0);
  await expect(gewicht.locator('.kurve-punkt')).toHaveCount(1);

  // Ein älterer Wert ändert „Mein Bedarf“ nicht.
  await gewicht.getByLabel('Gewicht in kg').fill('72,5');
  await gewicht.getByLabel('Datum').fill('2026-01-10');
  await gewicht.getByRole('button', { name: 'Eintragen' }).click();
  await expect(seite.getByText('Für „Mein Bedarf“ gilt weiter der neueste Wert.')).toBeVisible();
  await expect(gewicht.locator('.kurve-linie')).toHaveCount(1);
  await expect(gewicht.locator('.gewicht-stand')).toContainText('70 kg');
  await expect(gewicht.locator('.gewicht-stand')).toContainText('2,5 kg weniger als am 10.01.2026');
  // Das Datum springt zurück auf heute, damit der nächste Wert nicht aus Versehen auf dem alten Tag landet.
  await expect(gewicht.getByLabel('Datum')).toHaveValue(alsDatum(new Date()));

  // Noch einer, kurz danach: Beide müssen ankommen, auch nach einem Neustart.
  await gewicht.getByLabel('Gewicht in kg').fill('71');
  await gewicht.getByLabel('Datum').fill('2026-03-15');
  await gewicht.getByRole('button', { name: 'Eintragen' }).click();
  await expect(gewicht.locator('.kurve-punkt')).toHaveCount(3);
  await foto(seite, '70-gewicht');

  // Über die Kurve fahren: der Wert steht da.
  const kurve = gewicht.locator('.kurve svg');
  const box = (await kurve.boundingBox())!;
  await seite.mouse.move(box.x + 50, box.y + 100);
  await expect(gewicht.locator('.kurve-tipp')).toContainText('72,5 kg');
  await expect(gewicht.locator('.kurve-tipp')).toContainText('10.01.2026');
  await foto(seite, '71-gewicht-hinweis');
  await seite.mouse.move(box.x - 40, box.y - 40);
  await expect(gewicht.locator('.kurve-tipp')).toHaveCount(0);

  // Falsche Eingaben
  await gewicht.getByLabel('Gewicht in kg').fill('5');
  await gewicht.getByRole('button', { name: 'Eintragen' }).click();
  await expect(gewicht.getByRole('alert')).toContainText('Kilogramm');
  await gewicht.getByLabel('Gewicht in kg').fill('70');
  await gewicht.getByLabel('Datum').fill('2099-01-01');
  await gewicht.getByRole('button', { name: 'Eintragen' }).click();
  await expect(gewicht.getByRole('alert')).toContainText('Zukunft');
  await expect(gewicht.locator('.kurve-punkt')).toHaveCount(3);

  // Ein neuer Wert von heute gilt für „Mein Bedarf“.
  await gewicht.getByLabel('Datum').fill(alsDatum(new Date()));
  await gewicht.getByLabel('Gewicht in kg').fill('68');
  await gewicht.getByRole('button', { name: 'Eintragen' }).click();
  await expect(gewicht.locator('.gewicht-stand')).toContainText('68 kg');
  await expect(gewicht.locator('.kurve-punkt')).toHaveCount(3); // Heute gab es schon einen Wert, er wird ersetzt.
  await gespeichert(seite);
  await seite.getByRole('link', { name: 'Mein Bedarf' }).click();
  await expect(seite.getByRole('heading', { name: 'Mein Bedarf', level: 1 })).toBeVisible();
  await expect(seite.getByLabel('Gewicht', { exact: true })).toHaveValue('68');
  await seite.getByRole('link', { name: 'Verlauf' }).click();
  await expect(seite.getByRole('heading', { name: 'Verlauf', level: 1 })).toBeVisible();

  // Die Tabelle zeigt alle Werte, das Neueste oben. Löschen fragt nach.
  await gewicht.getByText('Alle Werte ansehen (3)').click();
  const zeilen = gewicht.locator('.gewicht-tabelle tbody tr');
  await expect(zeilen).toHaveCount(3);
  await expect(zeilen.first()).toContainText('68 kg');
  await gewicht.getByRole('button', { name: 'Gewicht vom 15.03.2026 löschen' }).click();
  await seite.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(zeilen).toHaveCount(2);
  await gewicht.getByRole('button', { name: 'Gewicht vom 10.01.2026 löschen' }).click();
  await seite.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(zeilen).toHaveCount(1);
  // Das letzte Gewicht bleibt, „Mein Bedarf“ rechnet damit.
  await expect(zeilen.first().getByRole('button')).toHaveCount(0);
  await gespeichert(seite);
  await app.close();

  // Nach dem Neustart ist alles noch so.
  const neu = await programmStarten(ordner);
  await neu.seite.getByRole('link', { name: 'Verlauf' }).click();
  await expect(neu.seite.getByRole('region', { name: 'Gewicht' }).getByText('Alle Werte ansehen (1)')).toBeVisible();
  await expect(neu.seite.getByRole('region', { name: 'Gewicht' }).locator('.gewicht-stand')).toContainText('68 kg');
  await neu.app.close();
  testordnerLoeschen(ordner);
});

test('Rückblick: Woche und Monat, Tage und Wochen getrennt, nur Tage mit Einträgen', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);

  // Zwei Tage in der letzten Woche: 1 kg Skyr bringt viel Eiweiß und Calcium, am zweiten Tag dazu viel Salz.
  const montag = montagLetzteWoche();
  const dienstag = new Date(montag);
  dienstag.setDate(montag.getDate() + 1);
  await seite.evaluate((d) => {
    window.location.hash = `#/tagebuch/${d}`;
  }, alsDatum(montag));
  await expect(mahlzeit(seite, 'Mittag')).toBeVisible();
  await eintragen(seite, 'Mittag', 'skyr', 'Skyr', '1000', 'g');
  await seite.evaluate((d) => {
    window.location.hash = `#/tagebuch/${d}`;
  }, alsDatum(dienstag));
  await expect(seite.locator('.tag h1')).toContainText(`${dienstag.getDate()}.`);
  await eintragen(seite, 'Mittag', 'skyr', 'Skyr', '1000', 'g');
  await eintragen(seite, 'Abend', 'speisesalz', 'Speisesalz', '20', 'g');

  await seite.getByRole('link', { name: 'Verlauf' }).click();
  const rueckblick = seite.getByRole('region', { name: 'Rückblick' });
  await expect(rueckblick.locator('.rueckblick-stand')).toBeVisible();

  // Am Anfang steht die laufende Woche, außer es ist Montag. Bis zur letzten Woche zurückblättern.
  const stand = rueckblick.locator('.rueckblick-stand');
  if (!(await stand.innerText()).startsWith('2 von 7')) {
    await rueckblick.getByRole('button', { name: 'Woche davor' }).click();
  }
  await expect(stand).toContainText('2 von 7 Tagen eingetragen, nur diese Tage zählen.');
  await expect(rueckblick.getByRole('button', { name: 'Woche danach' })).toBeEnabled();

  // Eiweiß zählt je Tag, Calcium im Schnitt der Woche.
  const eiweiss = rueckblick.locator('details.g-makros .zeile', { hasText: 'Eiweiß' });
  await expect(eiweiss.locator('.lage')).toContainText('an 2 von 2 Tagen Minimum erreicht');
  await expect(eiweiss.locator('.menge')).toContainText('Ø');
  const calcium = rueckblick.locator('details.g-mineralstoffe .zeile', { hasText: 'Calcium' });
  await expect(calcium.locator('.lage')).toContainText('im Schnitt der Woche erreicht');
  const jod = rueckblick.locator('details.g-mineralstoffe .zeile', { hasText: 'Jod' });
  await expect(jod.locator('.lage')).toContainText('im Schnitt der Woche');
  // Vitamin D ist auch hier nie eine Lücke.
  await expect(rueckblick.locator('details.g-vitamine .zeile', { hasText: /^Vitamin DE/ }).locator('.lage')).toContainText('kommt vor allem von der Sonne');
  await expect(rueckblick.getByRole('group', { name: 'Was meistens gefehlt hat' })).not.toContainText('Vitamin D');

  // Was meistens fehlte
  const fehlte = rueckblick.getByRole('group', { name: 'Was meistens gefehlt hat' });
  await expect(fehlte).toContainText('In dieser Woche zu niedrig:');
  await expect(fehlte).toContainText('An den meisten Tagen zu wenig:');
  await foto(seite, '72-rueckblick', true);

  // Der Monat, in dem der Montag liegt: Es geht auch ganz leer, und blättern geht.
  await rueckblick.getByRole('button', { name: 'Monat', exact: true }).click();
  await expect(rueckblick.getByRole('button', { name: 'Monat', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (let i = 0; i < 24; i++) await rueckblick.getByRole('button', { name: 'Monat davor' }).click();
  await expect(stand).toContainText('steht noch nichts');
  await expect(rueckblick.getByRole('group', { name: 'Was meistens gefehlt hat' })).toHaveCount(0);
  await foto(seite, '73-rueckblick-leer');
  await rueckblick.getByRole('button', { name: 'Woche', exact: true }).click();
  await expect(rueckblick.getByRole('button', { name: 'Woche danach' })).toBeVisible();

  await app.close();
  testordnerLoeschen(ordner);
});

test('Rückblick: Die laufende Woche sagt, dass heute noch nicht zählt, und im schmalen Fenster passt alles', async () => {
  const ordner = testordnerAnlegen();
  const { app, seite } = await programmStarten(ordner);
  await ersterStart(seite);
  await eintragen(seite, 'Mittag', 'skyr', 'Skyr', '100', 'g');
  await seite.getByRole('link', { name: 'Verlauf' }).click();
  const rueckblick = seite.getByRole('region', { name: 'Rückblick' });
  await expect(rueckblick.locator('.rueckblick-stand')).toBeVisible();
  // Am Montag steht am Anfang die letzte Woche: einen Schritt vor in die heutige.
  const danach = rueckblick.getByRole('button', { name: 'Woche danach' });
  if (await danach.isEnabled()) await danach.click();
  await expect(rueckblick.locator('.rueckblick-stand')).toContainText('Heute zählt noch nicht mit');
  await expect(danach).toBeDisabled();

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(420, 800));
  await expect.poll(() => seite.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await foto(seite, '74-schmal-verlauf');
  await app.close();
  testordnerLoeschen(ordner);
});
