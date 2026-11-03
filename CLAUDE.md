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

- **Rechenlogik** in `src/shared` (ohne Abhängigkeit vom Mac): `bedarf.ts` (Grundumsatz, Tempo, Untergrenze, Makros, Ziele), `referenzwerte.ts` (alle Werte mit Quelle und Stand, in der Einheit des BLS; die Regel steht oben in der Datei), `naehrstoffe.ts` (die 138 Nährstoffe in 9 Gruppen; **Selen führt der BLS nicht**), `profil.ts` (Profil, Prüfen der Eingaben), `format.ts` (deutsches Format, gerundete Anzeige).
- **Daten:** `starkmacher.sqlite` und `fotos/` in `~/Library/Application Support/Starkmacher/`, eingebautes `node:sqlite`, Aufbau über `MIGRATIONEN` in `sqlite.ts` (nur anhängen). Alles hängt am Profil `PROFIL_ID`. Eine kaputte Datei wird nie überschrieben (`BESCHAEDIGT`), beim Wiederherstellen daneben aufgehoben. Oberfläche: `daten/DatenKontext.tsx`, Änderungen sofort sichtbar, nach 800 ms gespeichert.
- **Sicherungen** (`main/sicherung.ts`): ein Ordner je Sicherung mit Datenbank (`VACUUM INTO`) und Fotos, bei jedem Start und auf Knopfdruck, die 30 neuesten bleiben, nur eigene Ordner werden aufgeräumt. Fotos aus der vorigen Sicherung werden verknüpft, wo das Laufwerk es kann. Ordner in iCloud werden abgelehnt (`icloudOrdner()` in `main/index.ts`).
- **Einstellungen:** Der Sicherungsordner liegt in `einstellungen.json` (betrifft nur diesen Mac), Stückware und ausgeblendete Nährstoffe im Profil (kommen beim Wiederherstellen mit).
- **Reiter** an einer Stelle: `src/renderer/src/reiter.ts`. Beim allerersten Start zeigt `App.tsx` nur `ErsterStart`.

### Entscheidungen, die man im Code wiederfindet

- **Regel (Lukas, 03.11.2026): der heutige Stand der Wissenschaft, in jeder Information.** Für jeden Nährstoff gilt die jüngste eigene wissenschaftliche Herleitung von DGE/ÖGE, EFSA, Nordischen Empfehlungen (NNR 2023) oder WHO, mit Quelle und Stand in `referenzwerte.ts`; übernimmt eine Stelle nur den Wert einer anderen, zählt das Original. Zuletzt geprüft am 03.11.2026. Neue Werte immer gegen diese Regel prüfen.
- **Vorgaben von Lukas (04.11.2026) gehen der Regel vor** und heißen im Programm „deine Vorgabe“ (Art „D“), nie Forschungsstand: Eiweiß 1,2–1,6 g/kg, bei Sport oder Kaloriendefizit 1,6–2,0 g/kg (geplant mit der Mitte; gerechnet mit dem echten Gewicht, höchstens mit dem bei BMI 25), Fett 25–35 %, Ballaststoffe 40–50 g, Omega-6 zu Omega-3 höchstens 5 : 1, EPA und DHA 1.000–2.000 mg, Leucin etwa 2,5 g je Mahlzeit. Die letzten drei wertet das Tagebuch ab Phase 3 aus. Blutwerte sind nicht eingebaut (Entscheidung offen).
- Muskelaufbau: +5 % oder +15 % auf den Verbrauch (Helms 2023). Abnehmen: −275 oder −550 kcal.
- Zucker gesamt höchstens 10 % der Energie (Lukas: frei oder aus Obst ist einerlei). Strenger als WHO und NNR.
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

Für Tests: `STARKMACHER_DATEN_ORDNER` (eigener Datenordner), `STARKMACHER_ICLOUD_ORDNER` (iCloud-Ordner vortäuschen), `STARKMACHER_BILDER=<ordner>` (Bildschirmfotos aus den Klick-Tests).

## Git

- `main` = von Lukas freigegebener Stand, pro Phase ein Branch (`phase-1`, …), nach Freigabe nach `main`. Repository: https://github.com/bbbukas/Starkmacher (privat). Commit-Nachrichten auf Deutsch.
