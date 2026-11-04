# Starkmacher (Projekt „Rezept-Tracker“)

Mac-Programm für Lukas: persönlicher Nährstoffbedarf, Lebensmittel, Rezepte, Teller und ein Tagebuch, das zeigt, was heute noch fehlt. Komplett offline, alle Daten nur auf dem Mac.

## Zuerst lesen

- Projektnotiz: `~/Obsidian/Zentrale/10 Projekte/Rezept-Tracker/Rezept-Tracker.md`
- **Bauauftrag** (die einzige Quelle für Anforderungen): `~/Obsidian/Zentrale/10 Projekte/Rezept-Tracker/Bauauftrag Starkmacher.md`
- Ergebnis der Planung mit Quellen: `~/Obsidian/Zentrale/10 Projekte/Rezept-Tracker/Phase 0 Ergebnis.md`
- Regeln: `~/Obsidian/Zentrale/00 System/Regeln.md`

Nach jeder Sitzung: Projektnotiz aktualisieren (Status, nächste Schritte), wichtige Entscheidungen zusätzlich in `00 System/Entscheidungen.md`.

## Wichtig im Umgang

- Lukas ist technisch Anfänger: alles einfach auf Deutsch erklären, vor Änderungen kurz sagen, was passiert und warum, genaue Klicks nennen.
- Phasenweise arbeiten (Bauauftrag Abschnitt 13): bauen, testen, in wenigen Sätzen erklären, wie man es ausprobiert, auf Lukas' Okay warten. Pro Phase ein Branch, nach Freigabe nach `main`.
- Eine neue Programmfassung kommt nur mit Lukas' Freigabe nach `/Programme` (vorherige Fassung als Sicherung behalten).
- Nie Schlüssel, Passwörter oder Tokens in Chat, Vault oder Code. Keine Kundendaten aus dem Versicherungsvertrieb.
- **Persönliche Daten kommen nie ins Repository.** Testdaten und Testbilder sind erfunden.
- Nur kostenlose Werkzeuge; neue Dienste erst nach Datenschutz-Check und Lukas' Entscheidung.
- **Nichts in iCloud speichern, nie** – weder Daten noch Sicherungen.
- An Eventdelfin und Systemfinanz wird nichts geändert. Sie sind nur technisches Vorbild, das Aussehen bewusst nicht.

## Technik

- **Electron 44** (Hauptprozess `src/main`, Brücke `src/preload`, Oberfläche `src/renderer`), **electron-vite**, **React 19**, **TypeScript**, Tests mit **vitest** und **Playwright** (`_electron`). Schriften (Fraunces, Nunito) und Symbole (Lucide) werden mitgeliefert. Der Hauptprozess sperrt alle Anfragen ins Internet (`session.webRequest.onBeforeRequest`).
- Design „Sonntagstisch“ (Variante B aus `design/vorschau.html`, Umsetzung `src/renderer/src/styles.css`). Jede Nährstoffgruppe hat eine feste Farbe (`--g-…`, Klassen `.g-…`); Eiweiß trägt die Farbe der Aminosäuren, Fett die der Fettsäuren. Kein Rot als Warnung. Programmsymbol: `build/icon.svg` → `npm run symbol`.

### Bausteine

```
Oberfläche ──window.starkmacher──▶ preload ──IPC──▶ main/ipc.ts ──▶ main/daten/dienst.ts ──▶ Datenquelle (main/daten/datenquelle.ts)
                                                                                              └ SqliteQuelle (main/daten/sqlite.ts)
```

- **Rechenlogik** in `src/shared` (ohne Abhängigkeit vom Mac): `bedarf.ts` (Grundumsatz, Tempo, Untergrenze, Makros, Ziele), `referenzwerte.ts` (alle Werte mit Quelle und Stand, in der Einheit des BLS; die Regel steht oben in der Datei), `naehrstoffe.ts` (die 138 Nährstoffe in 9 Gruppen; **Selen führt der BLS nicht**), `profil.ts` (Profil, Prüfen der Eingaben), `format.ts` (deutsches Format, gerundete Anzeige), `lebensmittel.ts` (Aufbau, Prüfen, Nährwerte je Menge, Anteil am Bedarf), `einheiten.ts` (Mengen, Standardumrechnungen), `suche.ts` (Suche, ähnliche Lebensmittel), `freierZucker.ts` (Schätzung je Lebensmittel), `tagebuch.ts` (Einträge, Tagessumme, Stufen, Lücken), `woche.ts` (Wochenstand), `vorschlaege.ts` (Vorschläge unter allen Grenzen, Alltagsliste), `rezepte.ts` (Rezepte, Hashtags, Nährwerte je Portion), `teller.ts` (Teller, Rollen).
- **Daten:** `starkmacher.sqlite` und `fotos/` in `~/Library/Application Support/Starkmacher/`, eingebautes `node:sqlite`, Aufbau über `MIGRATIONEN` in `sqlite.ts` (nur anhängen). Alles hängt am Profil `PROFIL_ID`. Eine kaputte Datei wird nie überschrieben (`BESCHAEDIGT`), beim Wiederherstellen daneben aufgehoben. Oberfläche: `daten/DatenKontext.tsx`, Änderungen sofort sichtbar, nach 800 ms gespeichert.
- **Grundbestand (BLS 4.0):** `ressourcen/bls-4.0.sqlite`, nur zum Lesen, kommt über `extraResources` ins Programm und nicht ins Repository. Bauen mit `npm run bls` aus `import/BLS_4_0_2025_DE.zip` (blsdb.de → BLS-Daten → Download BLS-Daten), Aufbau in `shared/blsAufbau.ts`. Zugriff über die Schnittstelle `Grundbestand` (`main/daten/bls.ts`), zusammengeführt mit dem Eigenen in `main/daten/lebensmittelDienst.ts`. In `werte` heißt ein fehlender Schlüssel „keine Angabe“, nie null; Spuren und Werte unter der Nachweisgrenze stehen auf 0 und zusätzlich in `spuren`.
- **Kennungen:** `bls:CODE` und `eigen:UUID`. Eine persönliche Version trägt die Kennung des Originals und liegt in `eigene_lebensmittel` darüber; Löschen setzt sie zurück.
- **Tagebuch** (`main/daten/tagebuchDienst.ts`, Oberfläche `ansichten/tagebuch/`): Ein Eintrag hält Werte je 100 g und Umrechnung fest und ändert sich nie mit dem Lebensmittel. Menge und Mahlzeit bleiben änderbar. Im Hauptprozess rechnen die Vorschläge mit dem gespeicherten Profil, die Oberfläche speichert vorher (`speichernJetzt`).
- **Wochenstand** (`shared/woche.ts`): Vitamine und Mineralstoffe mit Mindestwert sowie EPA und DHA zählen im Schnitt der Woche, Montag bis Sonntag (`zaehltWoechentlich`). `tagesLuecken` nennt sie deshalb nicht, den Vorschlägen gibt `wochenLueckenFuerTag` einen Tagesanteil. In `TagesGruppen` stehen in `summe` und `ziel` dieser Zeilen die Werte der Woche.
- **Rezepte** (`main/daten/rezeptDienst.ts`, Oberfläche `ansichten/rezepte/`): Kennung `rezept:UUID`. Die Nährwerte rechnet der Dienst jedes Mal aus dem heutigen Stand der Zutaten. Im Tagebuch hält ein Rezept-Eintrag seine Zutaten als `rezept.bestandteile` fest, umgerechnet auf die gegessene Menge; dort lassen sie sich für dieses eine Mal ändern (`angepasst`). `tagessumme` zählt die einzelnen Zutaten, damit sichtbar bleibt, wo eine Angabe fehlt. Ein Foto kann nach „Als neues Rezept speichern“ zu mehreren Rezepten gehören und wird erst entfernt, wenn keins es mehr nutzt.
- **Teller** (`main/daten/tellerDienst.ts`, Oberfläche `ansichten/teller/`): Kennung `teller:UUID`, Bestandteile mit Rolle, Rezepte darauf als Portion. Rechnet wie ein Rezept immer mit dem heutigen Stand; ein Rezept zerfällt dabei in seine Zutaten. Zum Aufheben braucht ein Teller einen Namen, ins Tagebuch kommt er auch ohne (`tellerEintragen`, Kennung `teller:entwurf`). Im Tagebuch nutzt er dasselbe Feld `rezept` wie ein Rezept, mit `art: 'teller'` und `portionen: 1`.
- **Fotos** (`main/fotos.ts`): beim Einlesen auf längstens 2.000 Pixel verkleinert, richtig gedreht und ohne Angaben aus der Datei (auch ohne Standort), die Oberfläche bekommt sie als `data:`-Adresse.
- **Hilfsprogramm** (`native/sehen.swift` → `ressourcen/starkmacher-sehen`, Zugriff über `main/sehen.ts`): Text und Barcodes mit Apple Vision, dazu das Speichern der Fotos. Kommt über `extraResources` ins Programm, nicht ins Repository.
- **Fotos auswerten** (`main/fotoDienst.ts`): nimmt Gewähltes, Hineingezogenes und Fotos vom Handy, das Ergebnis geht immer auf eine Prüfseite. Rechnungen in `shared/fotoText.ts` (Zeilen über die Position, Schieflage), `shared/naehrwertFoto.ts` (Tabelle, Zweifel), `shared/rezeptFoto.ts` (Zutatenzeilen, `ZUTAT_EINTRAEGE`, `zutatSuchen`), `shared/barcode.ts`, `shared/bildArt.ts`. Oberfläche: `komponenten/FotoEingang.tsx`, Prüfseiten sind `LebensmittelFormular` und `RezeptFormular` mit `perFoto`. `HandyDialog` hängt an der Seite, nicht am Eingang, sonst schließt es sich beim Wechsel zur Prüfseite.
- **Handy-Seite** (`main/handy.ts`, `main/handySeite.ts`): Server im Hauptprozess, nur auf der WLAN-Adresse, nur solange das Fenster offen ist, höchstens 15 Minuten Ruhe, zufällige Einmal-Adresse, nur echte Bilder nach den ersten Bytes. Enthält keine Abhängigkeit von Electron, damit sie sich testen lässt.
- **Barcode:** Reihenfolge eigene Lebensmittel (`nachBarcode`), dann Offline-Kopie von Open Food Facts (`main/daten/kopie.ts`, `ressourcen/openfoodfacts-de.sqlite`, nur zum Lesen, nicht im Repository), dann Bitte um ein Foto der Tabelle. Bauen mit `npm run off` aus `import/openfoodfacts/en.openfoodfacts.org.products.csv.gz` (world.openfoodfacts.org/data, rund 1,5 GB). Fehlt die Kopie, geht alles andere trotzdem. Lizenz ODbL, Quellenangabe in „Über Starkmacher“.
- **Sicherungen** (`main/sicherung.ts`): ein Ordner je Sicherung mit Datenbank (`VACUUM INTO`) und Fotos, bei jedem Start und auf Knopfdruck, die 30 neuesten bleiben, nur eigene Ordner werden aufgeräumt. Fotos aus der vorigen Sicherung werden verknüpft, wo das Laufwerk es kann. Ordner in iCloud werden abgelehnt (`icloudOrdner()` in `main/index.ts`).
- **Einstellungen:** Der Sicherungsordner liegt in `einstellungen.json` (betrifft nur diesen Mac), Stückware und ausgeblendete Nährstoffe im Profil (kommen beim Wiederherstellen mit).
- **Reiter** an einer Stelle: `src/renderer/src/reiter.ts`. Beim allerersten Start zeigt `App.tsx` nur `ErsterStart`.

### Entscheidungen, die man im Code wiederfindet

- **Regel (Lukas, 03.11.2026): der heutige Stand der Wissenschaft, in jeder Information.** Für jeden Nährstoff gilt die jüngste eigene wissenschaftliche Herleitung von DGE/ÖGE, EFSA, Nordischen Empfehlungen (NNR 2023) oder WHO, mit Quelle und Stand in `referenzwerte.ts`; übernimmt eine Stelle nur den Wert einer anderen, zählt das Original. Zuletzt geprüft am 03.11.2026. Neue Werte immer gegen diese Regel prüfen.
- **Zwei Stufen (Lukas, 04.11.2026): Die Werte nach dieser Regel sind das Minimum. Das Optimum ist der Bereich, für den die Forschung einen Nutzen über das Minimum hinaus zeigt, immer mit Quelle.** Lukas' frühere eigene Vorgaben gelten nicht mehr als solche. Im Datenmodell: `von` = Minimum, `optimum` = Spanne mit `quelle`. Eiweiß: Minimum 0,83 g/kg, ab 65 Jahren 1,2 g/kg, beim Abnehmen und Muskelaufbau 1,6 g/kg; Optimum 1,2–1,6 g/kg (Phillips 2016), bei Sport oder Kaloriendefizit 1,6–2,0 g/kg (DGE 2020, ACSM 2016); geplant mit der Mitte des Optimums, gerechnet mit dem echten Gewicht, höchstens mit dem bei BMI 25. Fett: Minimum 25 %, Optimum 25–35 % (EFSA 2017, NNR 2023). Ballaststoffe: Minimum 30 g, Optimum 30–40 g, geplant mit 35 g (Reynolds 2019 und 2020). EPA und DHA: Minimum 250 mg, Optimum 250–1.000 mg (VITAL 2019, Gencer 2021). Bewusst kein Ziel: Omega-6 zu Omega-3 (NNR 2023, AHA 2009), Leucin je Mahlzeit (Schwelle umstritten). Vitamine und Mineralstoffe: nur das Minimum, weil ein Nutzen darüber nicht belegt ist (USPSTF 2022, DGE-Arbeitsgruppe Sporternährung 2020). Es gibt bewusst keine Blutwerte. Neue Optimum-Werte nur mit Quelle, Prüfung in `Phase 0 Ergebnis.md`, Abschnitt 17.
- **Wochenschnitt (Lukas, 04.11.2026):** Die Referenzwerte müssen nicht jeden Tag erfüllt werden, der Durchschnitt einer Woche reicht (DGE 2018, Frage 4; DGE 2012). Wochenziel = Tageswert × Tage mit Einträgen und kommende Tage; vergangene Tage ohne Eintrag zählen nicht. Kalorien, Makros, Ballaststoffe, übrige Fettsäuren und reine Obergrenzen bleiben beim Tag. Die Grenzen für Vorschläge bleiben die des Tages. Prüfung in `Phase 0 Ergebnis.md`, Abschnitt 22.
- **Fotos:** Die Tabelle vom Foto geht vor den Werten aus Open Food Facts. Rezepte nennen die rohe Menge, deshalb steht Rohes vor Gegartem. Die Sicherheitsangabe von Vision wird nicht genutzt, sie steht auch bei richtig gelesenen Zahlen oft nur auf 0,3. Zweifel kommen aus der Einheit, dem Lesefehler oder der Prüfung der Werte gegeneinander. Prüfung in `Phase 0 Ergebnis.md`, Abschnitt 23.
- **Erratum (Lukas' Regel „heutiger Stand“):** Das Max Rubner-Institut nennt seine Korrekturen vom August 2026 bis zum Update 4.1 maßgeblich. `scripts/bls-bauen.mjs` arbeitet sie ein (Listen in `scripts/bls-korrekturen.json`), jeweils mit Hinweis beim Lebensmittel. Wo der richtige Wert noch fehlt, steht „keine Angabe“ statt eines bekannt falschen Werts. CC BY verlangt, Änderungen anzugeben: `BLS_AENDERUNGEN` in `lebensmittel.ts`. Kommt BLS 4.1, entfällt das.
- **Freier Zucker:** Regel je Lebensmittel `kein` oder `frei` aus BLS-Gruppe und Name, `frei` zählt den Zucker ohne die Laktose (Zucker aus Milch ist auch in Gesüßtem nicht frei). Eigene: der ganze Zucker, außer „nur natürlicher Zucker“.
- **Vorschläge:** nur aus den eigenen Lebensmitteln und der Alltagsliste `ALLTAGS_NAMEN` in `vorschlaege.ts`, nicht aus allen 7.140 Einträgen, sonst gewinnt rechnerisch das Exotischste. Die Menge bleibt unter allen Grenzen und wird nur abgerundet. Ein unbekannter Wert bremst nicht, außer den Kalorien (ohne sie kein Vorschlag).
- **Schätzung:** Das Programm trägt nichts selbst ein. Übernommene Werte liegen getrennt in `schaetzung`, eigene gehen immer vor.
- Muskelaufbau: +5 % oder +15 % auf den Verbrauch (Helms 2023). Abnehmen: −275 oder −550 kcal.
- Nur freier Zucker hat eine Grenze: höchstens 10 % der Energie (WHO 2015, NNR 2023). Der BLS kennt ihn nicht (`freierZuckerHoechstG` in `bedarf.ts`), die Schätzung je Lebensmittel kommt mit Phase 2 und 3.
- Vitamin D, Fluorid, Chlorid und Wasser haben `keineLuecke`: angezeigt, aber nie als Lücke gemeldet. Chrom hat kein Ziel (EFSA 2014, NNR 2023).
- Höchstwerte von der EFSA, Salz 5 g (EFSA 2019, WHO); bewusst keiner für Magnesium (gilt nur für Nahrungsergänzung) und Fluorid (widerspräche dem DGE-Wert für Männer).

## Befehle

| Befehl | Was passiert |
|---|---|
| `npm run dev` | Programm im Entwicklungsmodus starten (eigener Datenordner „Starkmacher Entwicklung“, nie die echten Daten) |
| `npm test` | Automatische Tests (Rechenlogik, Speichern, Sicherung) |
| `npm run test:e2e` | Programm bauen und mit Playwright wirklich durchklicken (eigener Datenordner) |
| `npm run typecheck` | TypeScript prüfen |
| `npm run paket` | `release/mac-arm64/Starkmacher.app` bauen (ad hoc signiert) |
| `npm run symbol` | Programmsymbol aus `build/icon.svg` neu erzeugen |
| `npm run bls` | `ressourcen/bls-4.0.sqlite` neu bauen (`test:e2e` und `paket` bauen sie, wenn sie fehlt) |
| `npm run sehen` | Hilfsprogramm für Fotos neu bauen (`dev`, `test:e2e` und `paket` bauen es, wenn es fehlt) |
| `npm run off` | Offline-Kopie von Open Food Facts neu bauen. Danach `npm run paket`, sonst bleibt die App beim alten Stand |
| `swift native/testbilder.swift` | Die erfundenen Testbilder in `tests/bilder` neu erzeugen |

Für Tests: `STARKMACHER_DATEN_ORDNER` (eigener Datenordner), `STARKMACHER_ICLOUD_ORDNER` (iCloud-Ordner vortäuschen), `STARKMACHER_BILDER=<ordner>` (Bildschirmfotos aus den Klick-Tests), `STARKMACHER_PAKET=1` (Klick-Tests gegen die fertige App in `release/`), `STARKMACHER_KOPIE=<datei>` (erfundene Offline-Kopie), `STARKMACHER_HANDY_ADRESSE=127.0.0.1` (Handy-Seite bleibt auf diesem Mac).

## Git

- `main` = von Lukas freigegebener Stand, pro Phase ein Branch (`phase-1`, …), nach Freigabe nach `main`. Repository: https://github.com/bbbukas/Starkmacher (privat). Commit-Nachrichten auf Deutsch.
