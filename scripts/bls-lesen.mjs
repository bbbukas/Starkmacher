/**
 * Liest die Excel-Datei des BLS. Eine .xlsx ist ein Zip-Archiv mit XML darin, das reicht hier ohne
 * zusätzliche Bibliothek: `unzip` gehört zum Mac, und die Datei hat eine einfache, feste Form.
 * Nur für das Bauen von bls-4.0.sqlite gedacht, kommt nicht ins Programm.
 */
import { execFileSync } from 'node:child_process';

const auspacken = (archiv, datei) => execFileSync('unzip', ['-p', archiv, datei], { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf8' });

const ENTITAETEN = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const entschluesseln = (text) =>
  text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e) => {
    if (e[0] !== '#') return ENTITAETEN[e];
    return String.fromCodePoint(e[1] === 'x' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10));
  });

function geteilteTexte(archiv) {
  const xml = auspacken(archiv, 'xl/sharedStrings.xml');
  const texte = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    // Formatierter Text besteht aus mehreren <t>-Stücken, ohne die <rPh>-Lesehilfen.
    const inhalt = si[1].replace(/<rPh[\s\S]*?<\/rPh>/g, '');
    texte.push(entschluesseln([...inhalt.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  }
  return texte;
}

function spaltenNummer(zelle) {
  let n = 0;
  for (const z of zelle) {
    const c = z.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/** Gibt die Zeilen des ersten Blatts als Listen von Zellinhalten (Text oder Zahl, leer = null). */
export function xlsxLesen(archiv) {
  const texte = geteilteTexte(archiv);
  const xml = auspacken(archiv, 'xl/worksheets/sheet1.xml');
  const zeilen = [];
  for (const zeile of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const zellen = [];
    for (const c of zeile[1].matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const r = /\br="([A-Z]+)\d+"/.exec(c[1])?.[1];
      if (!r || c[2] === undefined) continue;
      const typ = /\bt="([^"]+)"/.exec(c[1])?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[2])?.[1];
      let wert = null;
      if (typ === 's' && v !== undefined) wert = texte[Number(v)] ?? null;
      else if (typ === 'inlineStr') wert = entschluesseln(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(c[2])?.[1] ?? '');
      else if (typ === 'str' && v !== undefined) wert = entschluesseln(v);
      else if (v !== undefined) wert = Number(v);
      zellen[spaltenNummer(r)] = wert;
    }
    zeilen.push(zellen);
  }
  return zeilen;
}
