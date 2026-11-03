/** Fehler mit Code und einem Satz, den Lukas versteht. */
export type FehlerCode =
  | 'UNGUELTIG' // Eingabe oder Datei passt nicht
  | 'BESCHAEDIGT' // Datendatei lässt sich nicht lesen
  | 'ZU_NEU' // Datei stammt von einer neueren Starkmacher-Fassung
  | 'ORDNER' // Sicherungsordner fehlt, ist nicht beschreibbar oder liegt in iCloud
  | 'FEHLER'; // alles andere

export class StarkFehler extends Error {
  constructor(
    readonly code: FehlerCode,
    meldung: string,
  ) {
    super(meldung);
    this.name = 'StarkFehler';
  }
}
