import { defineConfig } from '@playwright/test';

// Klickt das fertige Programm (out/) wirklich durch. Vorher `npm run build` –
// `npm run test:e2e` erledigt beides.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results',
});
