/**
 * Was das Hilfsprogramm aus einem Foto liest, und wie daraus Zeilen werden. Die Tabellenerkennung von macOS hat bei
 * schiefen Bildern Zeilen verrutscht (Phase 0, Abschnitt 7). Deshalb ordnet das Programm selbst über die Position zu.
 * Reine Rechnung, damit sie sich mit erfundenen Daten prüfen lässt.
 */

/** Ein Stück Text aus dem Foto. Koordinaten sind Anteile von 0 bis 1, von oben links. */
export interface TextStueck {
  text: string;
  x: number;
  y: number;
  b: number;
  h: number;
  /** Wie schief die Zeile liegt: Änderung von y je Änderung von x. */
  steigung: number;
  sicher: number;
}

export interface FotoBarcode {
  wert: string;
  art: string;
}

export interface FotoLesung {
  zeilen: TextStueck[];
  barcodes: FotoBarcode[];
}

function mittelwert(werte: readonly number[], rueckfall: number): number {
  if (werte.length === 0) return rueckfall;
  const sortiert = [...werte].sort((a, b) => a - b);
  return sortiert[Math.floor(sortiert.length / 2)]!;
}

/** Die Schieflage des Bilds, aus den breiten Textstücken: Kurze liefern oft gar keine. */
export function schieflage(stuecke: readonly TextStueck[]): number {
  return mittelwert(
    stuecke.filter((s) => s.b > 0.05 && s.steigung !== 0).map((s) => s.steigung),
    0,
  );
}

/** Ordnet Textstücke zu Zeilen, von oben nach unten und in jeder Zeile von links nach rechts. Rechnet die Schieflage heraus. */
export function zeilenOrdnen(stuecke: readonly TextStueck[]): TextStueck[][] {
  if (stuecke.length === 0) return [];
  const schief = schieflage(stuecke);
  // Schiefe Stücke haben zu hohe Kästen, deshalb zählt nur die Höhe der flachen.
  const hoehe = mittelwert(
    stuecke.filter((s) => s.steigung === 0).map((s) => s.h),
    mittelwert(
      stuecke.map((s) => s.h),
      0.03,
    ),
  );
  const toleranz = hoehe * 0.55;
  const mitte = (s: TextStueck) => s.y + s.h / 2 - schief * (s.x + s.b / 2);
  const sortiert = [...stuecke].sort((a, b) => mitte(a) - mitte(b));
  const zeilen: { mitte: number; stuecke: TextStueck[] }[] = [];
  for (const s of sortiert) {
    const letzte = zeilen.at(-1);
    if (letzte && Math.abs(mitte(s) - letzte.mitte) <= toleranz) {
      letzte.stuecke.push(s);
      letzte.mitte = letzte.stuecke.reduce((summe, x) => summe + mitte(x), 0) / letzte.stuecke.length;
    } else {
      zeilen.push({ mitte: mitte(s), stuecke: [s] });
    }
  }
  return zeilen.map((z) => z.stuecke.sort((a, b) => a.x - b.x));
}

/** Kleinbuchstaben ohne Umlaute, für den Vergleich mit Wörtern, die das Programm kennt. */
export function wortForm(text: string): string {
  return text.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

/** Wie viele Buchstaben sich unterscheiden. */
export function abstand(a: string, b: string): number {
  const zeile = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let links = i;
    let diagonal = i - 1;
    for (let j = 1; j <= b.length; j++) {
      const oben = zeile[j]!;
      const neu = Math.min(oben + 1, links + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = oben;
      zeile[j] = neu;
      links = neu;
    }
  }
  return zeile[b.length]!;
}

/** Kommt das Wort im Text vor, auch mit einem Lesefehler je fünf Buchstaben? */
export function enthaeltWort(text: string, wort: string): boolean {
  const form = wortForm(text);
  if (form.includes(wort)) return true;
  const erlaubt = Math.floor(wort.length / 5);
  if (erlaubt === 0) return false;
  return form.split(/[^a-z0-9]+/).some((w) => w.length >= wort.length - erlaubt && abstand(w.slice(0, wort.length + erlaubt), wort) <= erlaubt);
}
