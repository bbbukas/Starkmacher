/**
 * Die Reiter oben, an einer einzigen Stelle: Ein neuer Eintrag hier ergibt einen
 * neuen Reiter in der Kopfzeile samt Seite. `phase` sagt, wann er gefüllt wird.
 */
export const REITER = [
  { id: 'tagebuch', titel: 'Tagebuch', phase: 3, text: 'Hier trägst du ein, was du gegessen hast, und siehst, was heute noch fehlt.' },
  { id: 'teller', titel: 'Teller', phase: 5, text: 'Hier stellst du einfache Mahlzeiten zusammen, zum Beispiel Nudeln mit veganem Steak und Soße.' },
  { id: 'rezepte', titel: 'Rezepte', phase: 4, text: 'Hier sammelst du deine eigenen Rezepte mit Hashtags und allen Nährwerten.' },
  { id: 'lebensmittel', titel: 'Lebensmittel', phase: 2, text: 'Hier findest du über 7.000 Lebensmittel aus dem Bundeslebensmittelschlüssel und legst eigene an.' },
  { id: 'verlauf', titel: 'Verlauf', phase: 7, text: 'Hier siehst du dein Gewicht als Kurve und blickst auf Wochen und Monate zurück.' },
] as const;

export type ReiterId = (typeof REITER)[number]['id'];

export const istReiter = (id: string | undefined): id is ReiterId => REITER.some((r) => r.id === id);
