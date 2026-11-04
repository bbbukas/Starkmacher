/**
 * Der Aufbau von bls-4.0.sqlite. Die Datei wird einmal mit scripts/bls-bauen.mjs aus den Daten des
 * Max Rubner-Instituts gebaut und im Programm nur gelesen. Bewusst ohne Abhängigkeiten, weil auch das Skript
 * diese Datei einliest.
 *
 * `werte` und `spuren` sind JSON: So bleibt die Datei klein und ein Lebensmittel lässt sich auf einmal lesen.
 * Ein fehlender Schlüssel in `werte` heißt „keine Angabe“, nie null (BLS-Dokumentation, Abschnitt 4.3).
 */
export const BLS_SCHEMA = `
  CREATE TABLE info (schluessel TEXT PRIMARY KEY, wert TEXT NOT NULL) WITHOUT ROWID;
  CREATE TABLE lebensmittel (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_en TEXT,
    werte TEXT NOT NULL,
    spuren TEXT NOT NULL,
    freier_zucker_g REAL,
    anmerkung TEXT,
    hinweise TEXT NOT NULL
  ) WITHOUT ROWID;
`;

/** Fassung der Datei. Passt sie nicht zum Programm, muss scripts/bls-bauen.mjs neu laufen. */
export const BLS_FASSUNG = '1';
