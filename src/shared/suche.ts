/**
 * Die Suche: Sie verträgt Teilwörter und Umlaute („kase“ und „kaese“ finden „Käse“), und das
 * Naheliegende steht oben. Dazu der Vorschlag ähnlicher BLS-Lebensmittel für die Schätzung (Bauauftrag 5.3).
 */

/** Auf beide Seiten angewandt: ä, ae und a werden gleich. Dass dabei auch „Steuer“ zu „stuer“ wird, stört deshalb nicht. */
export function suchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/é|è|ê/g, 'e')
    .replace(/à|â/g, 'a')
    .replace(/ç/g, 'c')
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u')
    .replace(/sosse/g, 'sauce')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

export const suchWorte = (text: string) => suchText(text).split(' ').filter(Boolean);

/** Einfach Zubereitetes und Rohes zuerst, nicht das Fertiggericht, das zufällig so heißt. */
const GRUNDFORM = / (roh|frisch|natur)( |$)/;

/**
 * Alltagswörter, unter denen der BLS etwas anderes führt. Sie finden zusätzlich diese Einträge und stellen sie nach oben
 * (geschrieben wie suchText sie liefert: „Hühnerei“ wird „huhnerei“).
 */
const ALLTAG: Readonly<Record<string, readonly string[]>> = {
  ei: ['huhnerei roh'],
  eier: ['huhnerei roh'],
  nudeln: ['teigwaren eifrei', 'eierteigwaren', 'eier frischteigwaren'],
  nudel: ['teigwaren eifrei', 'eierteigwaren', 'eier frischteigwaren'],
  pasta: ['teigwaren eifrei', 'eierteigwaren', 'eier frischteigwaren'],
  spaghetti: ['teigwaren eifrei', 'eierteigwaren'],
  haferflocken: ['hafer flocken'],
  quark: ['speisequark'],
  kase: ['frischkasezubereitung natur', 'frischkase', 'schnittkase', 'hartkase', 'weichkase', 'bergkase'],
  wasser: ['trinkwasser', 'mineralwasser', 'tafelwasser'],
  hahnchen: ['hahnchen brustfilet'],
  huhn: ['hahnchen brustfilet'],
  brot: ['roggenmischbrot', 'weizenmischbrot', 'roggenvollkornbrot', 'weizenvollkornbrot', 'weizenbrot'],
  zucker: ['zucker weiss'],
  salz: ['speisesalz'],
  ol: ['olivenol', 'rapsol', 'sonnenblumenol'],
  sahne: ['schlagsahne'],
  cola: ['colagetrank'],
};

/** Die Einzahl, wenn jemand die Mehrzahl tippt: „Linsen“ findet auch „Linse reif“. */
function grundwort(wort: string): string | null {
  if (wort.length < 5) return null;
  if (wort.endsWith('en')) return wort.slice(0, -1);
  if (wort.endsWith('n') || wort.endsWith('e')) return wort.slice(0, -1);
  return null;
}

/** Gerichte und Gebäck stehen hinten: Wer „Joghurt“ sucht, meint selten den Joghurt-Dip. */
const SPAETER = new Set(['X', 'Y', 'D']);

function wertFuerStelle(text: string, wort: string, stelle: number, erstes: boolean): number {
  let wert: number;
  if (text === wort) wert = 1000;
  else if (stelle === 0) wert = erstes ? 300 : 120;
  else if (text[stelle - 1] === ' ') wert = erstes ? 150 : 80;
  else wert = 30;
  // Das Wort ist ganz da und nicht nur Teil eines längeren
  const danach = text[stelle + wort.length];
  if (danach === undefined || danach === ' ') wert += 60;
  return wert;
}

/**
 * Wie gut passt der Eintrag? Null: gar nicht. Jedes Suchwort muss vorkommen.
 * `gruppe`: der Anfangsbuchstabe im BLS, null bei eigenen Lebensmitteln.
 */
export function trefferWert(name: string, worte: readonly string[], gruppe?: string | null): number | null {
  const text = suchText(name);
  let wert = 0;
  for (const [i, wort] of worte.entries()) {
    // Als ganze Wörter, sonst wäre auch „Weizenbrötchen“ ein „Weizenbrot“.
    const alltag = ALLTAG[wort]?.some((a) => text === a || text.startsWith(`${a} `));
    if (alltag) {
      wert += 500;
      continue;
    }
    const stelle = text.indexOf(wort);
    if (stelle !== -1) {
      wert += wertFuerStelle(text, wort, stelle, i === 0);
      continue;
    }
    const einzahl = grundwort(wort);
    const stelleEinzahl = einzahl === null ? -1 : text.indexOf(einzahl);
    if (einzahl === null || stelleEinzahl === -1) return null;
    wert += wertFuerStelle(text, einzahl, stelleEinzahl, i === 0) - 40;
  }
  if (GRUNDFORM.test(text)) wert += 40;
  if (gruppe === null) wert += 60; // Eigenes kennt man, es darf weiter oben stehen.
  if (gruppe && SPAETER.has(gruppe)) wert -= 80;
  // Kürzere Namen zuerst: „Apfel roh“ vor „Apfel gebacken mit Vanillesauce“.
  return wert - Math.min(text.length, 90);
}

export function sortierteTreffer<T extends { name: string; gruppe?: string | null }>(eintraege: readonly T[], text: string): T[] {
  const worte = suchWorte(text);
  if (worte.length === 0) return [];
  const treffer: { eintrag: T; wert: number }[] = [];
  for (const eintrag of eintraege) {
    const wert = trefferWert(eintrag.name, worte, eintrag.gruppe);
    if (wert !== null) treffer.push({ eintrag, wert });
  }
  treffer.sort((a, b) => b.wert - a.wert || a.eintrag.name.localeCompare(b.eintrag.name, 'de'));
  return treffer.map((t) => t.eintrag);
}

/** Die Packungswerte, mit denen sich Lebensmittel vergleichen lassen, und wie viel Abstand jeweils „viel“ ist. */
const VERGLEICH: readonly (readonly [string, number])[] = [
  ['ENERCC', 80],
  ['FAT', 8],
  ['FASAT', 5],
  ['CHO', 12],
  ['SUGAR', 8],
  ['PROT625', 6],
  ['NACL', 1],
];

/** Worte, die nichts über das Lebensmittel sagen. */
const FUELLWORTE = new Set(['mit', 'und', 'von', 'aus', 'fur', 'der', 'die', 'das', 'mind', 'fett', 'natur', 'bio', 'classic', 'original', 'light']);

export function vergleichsAbstand(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): number | null {
  let summe = 0;
  let anzahl = 0;
  for (const [code, viel] of VERGLEICH) {
    const x = a[code];
    const y = b[code];
    if (x === undefined || y === undefined) continue;
    summe += Math.abs(x - y) / viel;
    anzahl++;
  }
  return anzahl === 0 ? null : summe / anzahl;
}

export interface AehnlichEintrag {
  code: string;
  name: string;
  werte: Readonly<Record<string, number>>;
}

/**
 * Sucht die ähnlichsten Einträge über Name und Packungswerte. Der Name wiegt schwerer, denn gleich viel Fett macht
 * aus Käse keine Wurst. Gerichte kommen nur dran, wenn der Name passt, denn als Schätzung für ein Produkt taugen sie selten.
 */
export function aehnlichste<T extends AehnlichEintrag>(eigen: { name: string; werte: Readonly<Record<string, number>> }, eintraege: readonly T[], anzahl = 6): T[] {
  const worte = suchWorte(eigen.name).filter((w) => w.length >= 3 && !FUELLWORTE.has(w));
  const bewertet: { eintrag: T; wert: number }[] = [];
  for (const eintrag of eintraege) {
    const text = suchText(eintrag.name);
    let name = 0;
    for (const wort of worte) {
      const stelle = text.indexOf(wort);
      if (stelle === -1) continue;
      name += stelle === 0 ? 3 : text[stelle - 1] === ' ' ? 2.5 : 1.5;
    }
    const gericht = eintrag.code.startsWith('X') || eintrag.code.startsWith('Y');
    if (gericht && name === 0) continue;
    const abstand = vergleichsAbstand(eigen.werte, eintrag.werte);
    if (name === 0 && abstand === null) continue;
    bewertet.push({ eintrag, wert: name * 2 - (abstand ?? 1) - (gericht ? 1 : 0) - (GRUNDFORM.test(text) ? 0 : 0.05) });
  }
  bewertet.sort((a, b) => b.wert - a.wert || a.eintrag.name.localeCompare(b.eintrag.name, 'de'));
  return bewertet.slice(0, anzahl).map((b) => b.eintrag);
}
