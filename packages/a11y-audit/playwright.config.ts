import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for this package's own smoke tests.
 *
 * Consumers of @masup9/a11y-audit do NOT use this config — they wire the
 * package's functions (or `test-entries/*`) into their own Playwright setup.
 */
export default defineConfig({
  testDir: './test',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
  },
});
