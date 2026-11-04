/**
 * Klickt Phase 1 im echten Programm durch: erster Start, Reiter, Mein Bedarf,
 * Einstellungen, Sicherung, Neustart und Wiederherstellen. Alles mit erfundenen
 * Testdaten in einem eigenen Ordner.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { ersterStart, foto, gespeichert, programmStarten, sicherungenIn, testordnerAnlegen, testordnerLoeschen } from './hilfen';

test('Erster Start führt durch „Mein Bedarf“, danach gibt es die Reiter', async () => {
  const ordner = testordnerAnlegen();
  try {
    let { app, seite } = await programmStarten(ordner);

    // Vor dem ersten Durchlauf keine Reiter
    await expect(seite.getByRole('heading', { name: 'Schön, dass du da bist!' })).toBeVisible();
    await expect(seite.getByRole('navigation', { name: 'Bereiche' })).toHaveCount(0);
    expect(sicherungenIn(ordner.sicherungen)).toHaveLength(0); // noch keine Daten, also nichts zu sichern
    await foto(seite, '1-erster-start');

    // Ohne Angaben geht es nicht weiter, und das Programm sagt freundlich, was fehlt
    await seite.getByRole('button', { name: 'Weiter' }).click();
    await expect(seite.getByText('Bitte noch eintragen: Geschlecht, Geburtsjahr, Größe, Gewicht.')).toBeVisible();

    // Unsinn wird beim Verlassen des Felds angesprochen und nicht übernommen
    await seite.getByLabel('Größe').fill('5');
    await seite.getByLabel('Geburtsjahr').click();
    await expect(seite.getByText('Bitte die Größe in Zentimetern eintragen')).toBeVisible();

    await seite.getByRole('radio', { name: 'Männlich' }).check({ force: true });
    await seite.getByLabel('Geburtsjahr').fill('1986');
    await seite.getByLabel('Größe').fill('180');
    await seite.getByLabel('Gewicht').fill('71');
    await foto(seite, '2-ueber-dich');
    await seite.getByRole('button', { name: 'Weiter' }).click();

    await expect(seite.getByRole('heading', { name: 'Wie aktiv bist du?' })).toBeVisible();
    await seite.getByRole('radio', { name: /Fast nur sitzend/ }).check({ force: true });
    await foto(seite, '3-aktivitaet');
    await seite.getByRole('button', { name: 'Weiter' }).click();

    await expect(seite.getByRole('heading', { name: 'Was hast du vor?' })).toBeVisible();
    await seite.getByRole('radio', { name: /Abnehmen/ }).check({ force: true });
    await seite.getByRole('radio', { name: /Mittel/ }).check({ force: true });
    await foto(seite, '4-ziel');
    await seite.getByRole('button', { name: 'Weiter' }).click();

    // Ergebnis: 71 kg, 40 Jahre: Grundumsatz 1.667, mal 1,4 = 2.334, minus 550
    await expect(seite.getByRole('heading', { name: 'Das ist dein Tagesbedarf' })).toBeVisible();
    await expect(seite.locator('.teller-zahl')).toHaveText('1.784');
    await expect(seite.locator('.rechenweg')).toContainText('1.667 kcal');
    await expect(seite.getByText('Die Berechnung ist für gesunde Erwachsene gedacht.')).toBeVisible();
    await foto(seite, '5-ergebnis');
    await seite.getByRole('button', { name: "Los geht's" }).click();

    // Danach die Reiter in der richtigen Reihenfolge, und das Tagebuch öffnet mit heute
    const reiter = seite.getByRole('navigation', { name: 'Bereiche' }).getByRole('link');
    await expect(reiter).toHaveText(['Tagebuch', 'Teller', 'Rezepte', 'Lebensmittel', 'Verlauf']);
    await expect(reiter.first()).toHaveAttribute('aria-current', 'page');
    await expect(seite.locator('.tag h1')).toHaveText(/\d+\. \p{L}+$/u);
    await expect(seite.getByRole('link', { name: 'Mein Bedarf' })).toBeVisible();
    await expect(seite.getByRole('link', { name: 'Einstellungen' })).toBeVisible();
    await foto(seite, '6-tagebuch');

    // Jeder Reiter hat seine Seite
    await seite.getByRole('link', { name: 'Verlauf' }).click();
    await expect(seite.getByRole('heading', { name: 'Verlauf' })).toBeVisible();
    await expect(seite.getByRole('region', { name: 'Gewicht' })).toBeVisible();
    await expect(seite.getByRole('region', { name: 'Rückblick' })).toBeVisible();

    // Neustart: kein erster Start mehr, alles noch da, eine Sicherung ist entstanden
    await gespeichert(seite);
    await app.close();
    ({ app, seite } = await programmStarten(ordner));
    await expect(seite.getByRole('navigation', { name: 'Bereiche' })).toBeVisible();
    await expect(seite.getByRole('heading', { name: 'Schön, dass du da bist!' })).toHaveCount(0);
    expect(sicherungenIn(ordner.sicherungen)).toHaveLength(1);
    await seite.getByRole('link', { name: 'Mein Bedarf' }).click();
    await expect(seite.locator('.teller-zahl')).toHaveText('1.784');
    await app.close();
  } finally {
    testordnerLoeschen(ordner);
  }
});

test('Mein Bedarf: rechnet mit, sagt Änderungen an, hält die Untergrenze ein', async () => {
  const ordner = testordnerAnlegen();
  try {
    const { app, seite } = await programmStarten(ordner);
    await ersterStart(seite, '70');
    await seite.getByRole('link', { name: 'Mein Bedarf' }).click();
    await expect(seite.getByRole('heading', { name: 'Mein Bedarf', level: 1 })).toBeVisible();
    await expect(seite.getByText('Die Berechnung ist für gesunde Erwachsene gedacht.')).toBeVisible();
    await foto(seite, '7-mein-bedarf', true);

    const kcal = seite.locator('.teller-zahl');
    const vorher = await kcal.textContent();

    // Ein neues Gewicht: Die Ziele passen sich an, und das Programm sagt es
    await seite.getByRole('textbox', { name: 'Gewicht' }).fill('80');
    await expect(kcal).not.toHaveText(vorher!);
    await expect(seite.getByText(/Dein Bedarf hat sich geändert/)).toBeVisible();
    await gespeichert(seite);

    // Nährstoffe stehen nach Gruppen, mit Ziel und Art des Werts
    const vitamine = seite.locator('details.g-vitamine');
    await expect(vitamine).toHaveAttribute('open', '');
    await expect(vitamine.locator('.ziel-zeile', { hasText: 'Vitamin C' })).toContainText('110 mg');
    await expect(vitamine.locator('.ziel-zeile', { hasText: 'Kommt vor allem von der Sonne' })).toContainText('Vitamin D');
    await expect(seite.locator('details.g-mineralstoffe .ziel-zeile', { hasText: 'Kupfer' })).toContainText('1,6 mg');
    await expect(seite.locator('details.g-mineralstoffe .ziel-zeile', { hasText: /^SalzH/ })).toContainText('höchstens 5 g');
    await seite.locator('details.g-aminosaeuren summary').click();
    await expect(seite.locator('details.g-aminosaeuren .ziel-zeile', { hasText: 'Lysin' })).toContainText('ohne Ziel');
    await expect(seite.locator('details.g-aminosaeuren .ziel-zeile', { hasText: /^Leucin/ })).toContainText('ohne Ziel');
    await expect(seite.locator('details.g-mineralstoffe .ziel-zeile', { hasText: 'Chrom' })).toContainText('Es ist nicht belegt');
    await seite.locator('details.g-ballaststoffe summary').click();
    const ballaststoffe = seite.locator('details.g-ballaststoffe .ziel-zeile', { hasText: 'Ballaststoffe gesamt' });
    await expect(ballaststoffe).toContainText('Minimum 30 g');
    await expect(ballaststoffe).toContainText('Optimum 30–40 g');
    await expect(ballaststoffe.locator('.optimum')).toHaveAttribute('title', 'Optimum. Quelle: Reynolds 2019 und 2020');
    await seite.locator('details.g-kohlenhydrate summary').click();
    await expect(seite.locator('details.g-kohlenhydrate .ziel-zeile', { hasText: 'Freier Zucker' })).toContainText('höchstens');
    await expect(seite.locator('details.g-kohlenhydrate .ziel-zeile', { hasText: /^Zucker gesamt/ })).toContainText('ohne Ziel');
    await seite.locator('details.g-fettsaeuren summary').click();
    await expect(seite.locator('details.g-fettsaeuren .ziel-zeile', { hasText: 'EPA und DHA zusammen' })).toContainText('Optimum 250–1.000 mg');
    await expect(seite.locator('details.g-fettsaeuren .ziel-zeile', { hasText: 'EPA und DHA zusammen' })).toContainText('Minimum 250 mg');
    await expect(seite.locator('details.g-fettsaeuren .ziel-zeile', { hasText: 'Verhältnis zu Omega-3' })).toHaveCount(1);
    await expect(seite.locator('details.g-fettsaeuren .ziel-zeile', { hasText: 'Omega-6 zu Omega-3' })).toHaveCount(0);
    await expect(seite.getByText('deine eigene Vorgabe')).toHaveCount(0);
    await expect(seite.locator('details.g-vitamine .ziel-zeile', { hasText: 'Vitamin C' }).locator('abbr')).toHaveAttribute('title', 'Empfehlung. Quelle: DGE/ÖGE 2015');

    // Eigene Werte unter der Untergrenze werden freundlich angehoben
    await seite.getByRole('radio', { name: /Eigene Werte/ }).check({ force: true });
    await seite.getByRole('textbox', { name: 'Kalorien' }).fill('900');
    await expect(seite.getByText(/Du hast 900 kcal eingetragen. Damit dein Körper genug bekommt/)).toBeVisible();
    await expect(kcal).not.toHaveText('900');
    await foto(seite, '8-untergrenze');
    await app.close();
  } finally {
    testordnerLoeschen(ordner);
  }
});

test('Einstellungen: Sicherung, iCloud-Ablehnung, Wiederherstellen, Nährstoffe ausblenden', async () => {
  const ordner = testordnerAnlegen();
  try {
    let { app, seite } = await programmStarten(ordner);
    await ersterStart(seite, '70');
    await seite.getByRole('link', { name: 'Einstellungen' }).click();
    await expect(seite.getByRole('heading', { name: 'Einstellungen', level: 1 })).toBeVisible();
    await foto(seite, '9-einstellungen', true);

    // Sicherung jetzt erstellen
    await seite.getByRole('button', { name: 'Sicherung jetzt erstellen' }).click();
    await expect(seite.getByText('Sicherung erstellt.')).toBeVisible();
    expect(sicherungenIn(ordner.sicherungen)).toHaveLength(1);

    // Ein Ordner in iCloud wird abgelehnt
    const inIcloud = join(ordner.icloud, 'Sicherungen');
    await app.evaluate(({ dialog }, pfad) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [pfad] })) as typeof dialog.showOpenDialog;
    }, inIcloud);
    await seite.getByRole('button', { name: 'Ordner wählen …' }).click();
    await expect(seite.getByText(/Dieser Ordner liegt in iCloud/)).toBeVisible();
    expect(sicherungenIn(ordner.sicherungen)).toHaveLength(1);

    // Stückware umstellen und Nährstoffe ausblenden
    await seite.getByRole('radio', { name: /In Gramm/ }).check({ force: true });
    await seite.locator('details.g-vitamine summary .gruppe-titel').click();
    await seite.getByRole('checkbox', { name: 'Vitamin K', exact: true }).uncheck();
    await seite.getByRole('checkbox', { name: 'Aminosäuren anzeigen' }).uncheck();
    await gespeichert(seite);
    await seite.getByRole('link', { name: 'Mein Bedarf' }).click();
    await expect(seite.locator('details.g-vitamine .ziel-zeile', { hasText: 'Vitamin C' })).toBeVisible();
    await expect(seite.locator('details.g-vitamine .ziel-zeile .name', { hasText: /^Vitamin KS$/ })).toHaveCount(0); // „S“ ist die Marke für Schätzwert
    await expect(seite.locator('details.g-aminosaeuren')).toHaveCount(0);

    // Etwas ändern, dann die Sicherung von vorhin zurückholen
    await seite.getByLabel('Größe').fill('190');
    await gespeichert(seite);
    await seite.getByRole('link', { name: 'Einstellungen' }).click();
    await seite.getByRole('button', { name: 'Sicherung wiederherstellen …' }).click();
    const liste = seite.getByRole('dialog', { name: 'Sicherung wiederherstellen' });
    await liste.getByRole('radio').first().check();
    await liste.getByRole('button', { name: 'Wiederherstellen …' }).click();
    await seite.getByRole('dialog', { name: 'Diesen Stand wiederherstellen?' }).getByRole('button', { name: 'Wiederherstellen' }).click();
    await expect(seite.getByText(/ist wiederhergestellt/)).toBeVisible();
    expect(sicherungenIn(ordner.sicherungen)).toHaveLength(2); // der vorherige Stand wurde gesichert

    await seite.getByRole('link', { name: 'Mein Bedarf' }).click();
    await expect(seite.getByLabel('Größe')).toHaveValue('180');
    await expect(seite.locator('details.g-aminosaeuren')).toBeVisible(); // die Auswahl von damals gilt wieder

    // Über Starkmacher nennt die Quellen
    await seite.getByRole('link', { name: 'Einstellungen' }).click();
    await expect(seite.getByText(/Bundeslebensmittelschlüssel \(BLS\), Version 4.0/)).toContainText('10.25826/Data20251217-134202-0');
    await expect(seite.getByText(/Bundeslebensmittelschlüssel \(BLS\), Version 4.0/)).toContainText('CC BY 4.0');

    // Neustart legt eine weitere Sicherung an
    await app.close();
    ({ app, seite } = await programmStarten(ordner));
    await expect(seite.getByRole('navigation', { name: 'Bereiche' })).toBeVisible();
    expect(sicherungenIn(ordner.sicherungen)).toHaveLength(3);
    await app.close();
  } finally {
    testordnerLoeschen(ordner);
  }
});

test('Kaputte Datendatei: nichts wird überschrieben, eine Sicherung holt den Stand zurück', async () => {
  const ordner = testordnerAnlegen();
  try {
    let { app, seite } = await programmStarten(ordner);
    await ersterStart(seite, '70');
    await seite.getByRole('link', { name: 'Einstellungen' }).click();
    await seite.getByRole('button', { name: 'Sicherung jetzt erstellen' }).click();
    await expect(seite.getByText('Sicherung erstellt.')).toBeVisible();
    await app.close();

    const datei = join(ordner.daten, 'starkmacher.sqlite');
    writeFileSync(datei, 'kaputt kaputt kaputt kaputt kaputt kaputt kaputt');
    ({ app, seite } = await programmStarten(ordner));
    await expect(seite.getByRole('heading', { name: 'Deine Daten lassen sich nicht öffnen' })).toBeVisible();
    expect(readFileSync(datei, 'utf8')).toContain('kaputt');
    await foto(seite, '10-kaputt');

    await seite.getByRole('link', { name: 'Zu den Einstellungen' }).click();
    await seite.getByRole('button', { name: 'Sicherung wiederherstellen …' }).click();
    const liste = seite.getByRole('dialog', { name: 'Sicherung wiederherstellen' });
    await liste.getByRole('radio').first().check();
    await liste.getByRole('button', { name: 'Wiederherstellen …' }).click();
    await seite.getByRole('dialog', { name: 'Diesen Stand wiederherstellen?' }).getByRole('button', { name: 'Wiederherstellen' }).click();
    await expect(seite.getByText(/ist wiederhergestellt/)).toBeVisible();
    await expect(seite.getByRole('navigation', { name: 'Bereiche' })).toBeVisible();
    await app.close();
  } finally {
    testordnerLoeschen(ordner);
  }
});

test('Offline: Die Oberfläche kommt nicht ins Internet, und im schmalen Fenster passt alles', async () => {
  const ordner = testordnerAnlegen();
  try {
    const { app, seite } = await programmStarten(ordner);
    await ersterStart(seite, '70');

    const ergebnis = await seite.evaluate(() =>
      fetch('https://example.com/').then(
        () => 'erreicht',
        () => 'gesperrt',
      ),
    );
    expect(ergebnis).toBe('gesperrt');
    expect(await seite.evaluate(() => Object.keys(window).includes('require'))).toBe(false);

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(420, 700));
    await expect.poll(() => seite.evaluate(() => innerWidth)).toBeLessThan(500);
    for (const pfad of ['#/tagebuch', '#/bedarf', '#/einstellungen']) {
      await seite.evaluate((p) => {
        location.hash = p;
      }, pfad);
      await expect.poll(() => seite.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await seite.evaluate(() => {
      location.hash = '#/bedarf';
    });
    await foto(seite, '11-schmal');
    await seite.evaluate(() => {
      location.hash = '#/tagebuch';
    });
    await foto(seite, '12-schmal-tagebuch');
    await expect(seite.getByRole('navigation', { name: 'Bereiche' }).getByRole('link', { name: 'Verlauf' })).toBeInViewport();
    await app.close();
  } finally {
    testordnerLoeschen(ordner);
  }
});
