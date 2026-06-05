import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['**/*.ts'],
  timeout: 60000,
  use: {
    baseURL: process.env.TEST_PAGE || 'https://a11yc.com/city-komaru/practice/',
    headless: true,
  },
});
