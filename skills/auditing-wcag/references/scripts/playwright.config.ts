import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['**/*.ts'],
  testIgnore: ['**/types.ts', '**/constants.ts', '**/utils/**', '**/detectors/**'],
  timeout: 60000,
  use: {
    baseURL: 'https://www.cyberagent.co.jp',
    headless: true,
  },
});
