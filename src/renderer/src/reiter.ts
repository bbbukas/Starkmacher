/**
 * Die Reiter oben, an einer einzigen Stelle: Ein neuer Eintrag hier ergibt einen
 * neuen Reiter in der Kopfzeile.
 */
export const REITER = [
  { id: 'tagebuch', titel: 'Tagebuch' },
  { id: 'teller', titel: 'Teller' },
  { id: 'rezepte', titel: 'Rezepte' },
  { id: 'lebensmittel', titel: 'Lebensmittel' },
  { id: 'verlauf', titel: 'Verlauf' },
] as const;

export type ReiterId = (typeof REITER)[number]['id'];

export const istReiter = (id: string | undefined): id is ReiterId => REITER.some((r) => r.id === id);
