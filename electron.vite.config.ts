import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

const alias = { '@shared': resolve(import.meta.dirname, 'src/shared') };

/**
 * Content-Security-Policy nur im fertigen Programm. Beim Entwickeln braucht
 * Vite eingebettete Skripte (Neu-Laden bei Änderungen), die die Regel sonst
 * blockieren würde.
 *
 * connect-src 'none': Die Oberfläche spricht mit keinem Server.
 */
function sicherheitsRegelnImPaket(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'starkmacher-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`);
    },
  };
}

export default defineConfig({
  main: {
    resolve: { alias },
  },
  preload: {
    resolve: { alias },
    build: {
      // Mit sandbox: true lädt Electron das Preload-Skript nur als CommonJS.
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    resolve: { alias },
    plugins: [react(), sicherheitsRegelnImPaket()],
  },
});
