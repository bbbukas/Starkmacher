/** Sicherungen: anlegen, aufräumen, iCloud ablehnen. Alles mit erfundenen Daten in einem eigenen Ordner. */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SICHERUNG_MUSTER, SICHERUNGEN_BEHALTEN } from '@shared/api';
import { leeresProfil } from '@shared/profil';
import { DatenDienst } from '../src/main/daten/dienst';
import { neuesteZuerst, Sicherungen, zeitstempel } from '../src/main/sicherung';

let wurzel: string;
let dienst: DatenDienst;
let ziel: string;
let icloud: string;
let gewaehlt: string | undefined;

function sicherungen(uhr?: () => Date): Sicherungen {
  return new Sicherungen({
    fotoOrdner: dienst.fotoOrdner,
    standardOrdner: join(wurzel, 'standard'),
    icloudOrdner: [icloud],
    gewaehlterOrdner: () => gewaehlt,
    ordnerMerken: async (o) => {
      gewaehlt = o;
    },
    hatDaten: () => dienst.hatDaten(),
    datenbankKopieren: (z) => dienst.kopieSchreiben(z),
    ...(uhr ? { jetzt: uhr } : {}),
  });
}

const eigeneSicherungen = (o: string) => readdirSync(o).filter((n) => SICHERUNG_MUSTER.test(n));

beforeEach(() => {
  wurzel = mkdtempSync(join(tmpdir(), 'starkmacher-sicherung-'));
  ziel = join(wurzel, 'ziel');
  icloud = join(wurzel, 'Mobile Documents');
  mkdirSync(icloud);
  mkdirSync(join(wurzel, 'daten'));
  gewaehlt = ziel;
  dienst = new DatenDienst(join(wurzel, 'daten'));
  dienst.oeffnen();
  dienst.migrieren();
});
afterEach(() => {
  dienst.schliessen();
  rmSync(wurzel, { recursive: true, force: true });
});

const speichereEtwas = () => dienst.speichern({ profil: { ...leeresProfil(), geschlecht: 'weiblich', geburtsjahr: 1990 } });

describe('Sicherung anlegen', () => {
  it('ohne Daten gibt es nichts zu sichern', async () => {
    expect(await sicherungen().erstellen()).toBeNull();
    expect(existsSync(ziel)).toBe(false);
  });

  it('legt einen Ordner mit Datenbank und Fotos an und hinterlässt nichts Halbes', async () => {
    speichereEtwas();
    mkdirSync(dienst.fotoOrdner);
    writeFileSync(join(dienst.fotoOrdner, 'packung.jpg'), 'erfundenes foto');
    const e = await sicherungen(() => new Date(2026, 10, 3, 21, 40, 5)).erstellen();
    expect(e).toMatchObject({ name: 'Starkmacher-Sicherung-2026-11-03_21-40-05', zeit: '2026-11-03T21:40:05', fotos: 1, lesbar: true });
    expect(readdirSync(ziel)).toEqual(['Starkmacher-Sicherung-2026-11-03_21-40-05']);
    expect(readdirSync(join(ziel, e!.name)).sort()).toEqual(['fotos', 'starkmacher.sqlite']);
    expect(readdirSync(join(ziel, e!.name, 'fotos'))).toEqual(['packung.jpg']);
  });

  it('zwei Sicherungen in derselben Sekunde bekommen verschiedene Namen', async () => {
    speichereEtwas();
    const s = sicherungen(() => new Date(2026, 10, 3, 21, 40, 5));
    const a = await s.erstellen();
    const b = await s.erstellen();
    expect(a?.name).not.toBe(b?.name);
    expect(b?.name).toBe('Starkmacher-Sicherung-2026-11-03_21-40-05-2');
    expect(neuesteZuerst([a!.name, b!.name])[0]).toBe(b!.name);
  });

  it('unveränderte Fotos belegen keinen zusätzlichen Platz', async () => {
    speichereEtwas();
    mkdirSync(dienst.fotoOrdner);
    writeFileSync(join(dienst.fotoOrdner, 'a.jpg'), 'erfundenes foto');
    const s = sicherungen();
    const eins = await s.erstellen();
    const zwei = await s.erstellen();
    const a = statSync(join(ziel, eins!.name, 'fotos', 'a.jpg'));
    const b = statSync(join(ziel, zwei!.name, 'fotos', 'a.jpg'));
    expect(a.ino).toBe(b.ino);
    expect(b.nlink).toBe(2);
  });

  it('eine Sicherung bleibt heil, wenn eine ältere gelöscht wird', async () => {
    speichereEtwas();
    mkdirSync(dienst.fotoOrdner);
    writeFileSync(join(dienst.fotoOrdner, 'a.jpg'), 'erfundenes foto');
    const s = sicherungen();
    const eins = await s.erstellen();
    const zwei = await s.erstellen();
    rmSync(join(ziel, eins!.name), { recursive: true });
    expect(readdirSync(join(ziel, zwei!.name, 'fotos'))).toEqual(['a.jpg']);
  });

  it('klappt die Kopie nicht, bleibt keine halbe Sicherung liegen', async () => {
    speichereEtwas();
    const s = new Sicherungen({
      fotoOrdner: dienst.fotoOrdner,
      standardOrdner: ziel,
      icloudOrdner: [],
      gewaehlterOrdner: () => ziel,
      ordnerMerken: async () => undefined,
      hatDaten: () => true,
      datenbankKopieren: () => {
        throw new Error('Platte voll');
      },
    });
    await expect(s.erstellen()).rejects.toMatchObject({ code: 'ORDNER' });
    expect(readdirSync(ziel)).toEqual([]);
    expect((await s.zustand()).fehler).toContain('konnte nicht');
  });
});

describe('Aufräumen', () => {
  it('die 30 neuesten bleiben, fremde Dateien bleiben unberührt', async () => {
    speichereEtwas();
    mkdirSync(ziel);
    writeFileSync(join(ziel, 'meine-notiz.txt'), 'fremd');
    mkdirSync(join(ziel, 'Urlaubsfotos'));
    let minute = 0;
    const s = sicherungen(() => new Date(2026, 10, 3, 12, minute));
    for (; minute < SICHERUNGEN_BEHALTEN + 3; minute++) await s.erstellen();
    const namen = eigeneSicherungen(ziel);
    expect(namen).toHaveLength(SICHERUNGEN_BEHALTEN);
    expect(namen).not.toContain(`Starkmacher-Sicherung-${zeitstempel(new Date(2026, 10, 3, 12, 0))}`);
    expect(namen).toContain(`Starkmacher-Sicherung-${zeitstempel(new Date(2026, 10, 3, 12, SICHERUNGEN_BEHALTEN + 2))}`);
    expect(existsSync(join(ziel, 'meine-notiz.txt'))).toBe(true);
    expect(existsSync(join(ziel, 'Urlaubsfotos'))).toBe(true);
  });

  it('räumt Reste abgebrochener Sicherungen weg', async () => {
    speichereEtwas();
    mkdirSync(join(ziel, '.Starkmacher-Sicherung-2026-01-01_00-00-00.neu'), { recursive: true });
    await sicherungen().erstellen();
    expect(readdirSync(ziel).filter((n) => n.endsWith('.neu'))).toEqual([]);
  });
});

describe('iCloud', () => {
  it('lehnt einen Ordner in iCloud ab', async () => {
    speichereEtwas();
    const s = sicherungen();
    await expect(s.ordnerSetzen(join(icloud, 'Sicherungen'))).rejects.toMatchObject({ code: 'ORDNER', message: expect.stringContaining('iCloud') });
    expect(gewaehlt).toBe(ziel);
    expect(existsSync(join(icloud, 'Sicherungen'))).toBe(false);
  });

  it('erkennt iCloud auch hinter einer Verknüpfung', async () => {
    speichereEtwas();
    const verknuepfung = join(wurzel, 'harmlos');
    symlinkSync(icloud, verknuepfung);
    await expect(sicherungen().ordnerSetzen(join(verknuepfung, 'Sicherungen'))).rejects.toMatchObject({ code: 'ORDNER' });
  });

  it('sichert nie in iCloud, auch wenn der Ordner schon so eingetragen ist', async () => {
    speichereEtwas();
    gewaehlt = join(icloud, 'alt');
    const s = sicherungen();
    await expect(s.erstellen()).rejects.toMatchObject({ code: 'ORDNER' });
    expect(existsSync(join(icloud, 'alt'))).toBe(false);
    const zustand = await s.zustand();
    expect(zustand.imIcloud).toBe(true);
    expect(zustand.fehler).toContain('iCloud');
  });

  it('nimmt einen anderen Ordner an und sichert gleich dorthin', async () => {
    speichereEtwas();
    const neu = join(wurzel, 'usb-stick');
    const s = sicherungen();
    await s.ordnerSetzen(neu);
    expect(gewaehlt).toBe(neu);
    expect(eigeneSicherungen(neu)).toHaveLength(1);
  });
});

describe('Zurückholen vorbereiten', () => {
  it('nimmt nur echte Sicherungen, keine Pfade', async () => {
    speichereEtwas();
    const s = sicherungen();
    const e = await s.erstellen();
    expect(await s.pruefen(e!.name)).toBe(join(ziel, e!.name));
    await expect(s.pruefen('../../etc')).rejects.toMatchObject({ code: 'UNGUELTIG' });
    await expect(s.pruefen('Starkmacher-Sicherung-1999-01-01_00-00-00')).rejects.toMatchObject({ code: 'BESCHAEDIGT' });
    await expect(s.pruefen(42)).rejects.toMatchObject({ code: 'UNGUELTIG' });
  });

  it('die Liste zeigt die neueste zuerst und erkennt kaputte', async () => {
    speichereEtwas();
    let minute = 0;
    const s = sicherungen(() => new Date(2026, 10, 3, 12, minute++));
    const eins = await s.erstellen();
    const zwei = await s.erstellen();
    writeFileSync(join(ziel, eins!.name, 'starkmacher.sqlite'), 'kaputt kaputt kaputt');
    const liste = await s.liste();
    expect(liste.map((e) => e.name)).toEqual([zwei!.name, eins!.name]);
    expect(liste.map((e) => e.lesbar)).toEqual([true, false]);
  });
});
