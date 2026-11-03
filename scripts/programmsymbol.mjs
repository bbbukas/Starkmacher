/**
 * Macht aus build/icon.svg das Programmsymbol build/icon.png (1024 × 1024,
 * durchsichtige Ecken). electron-builder baut daraus das Mac-Symbol.
 * Aufruf: npm run symbol
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';

const wurzel = join(import.meta.dirname, '..');
const svg = readFileSync(join(wurzel, 'build/icon.svg'));

app.disableHardwareAcceleration();
app.dock?.hide();

void app.whenReady().then(async () => {
  const fenster = new BrowserWindow({
    width: 1024,
    height: 1024,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  const html = `<!doctype html><html><head><style>html,body{margin:0;background:transparent;overflow:hidden}img{display:block;width:1024px;height:1024px}</style></head><body><img src="data:image/svg+xml;base64,${svg.toString('base64')}"></body></html>`;
  await fenster.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
  await new Promise((r) => setTimeout(r, 600));
  let bild = await fenster.webContents.capturePage();
  if (bild.getSize().width !== 1024) bild = bild.resize({ width: 1024, height: 1024, quality: 'best' });
  writeFileSync(join(wurzel, 'build/icon.png'), bild.toPNG());
  console.log('build/icon.png geschrieben', bild.getSize());
  app.quit();
});
