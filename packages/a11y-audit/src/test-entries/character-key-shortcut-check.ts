/**
 * Compatibility test entry for the character key shortcut check (WCAG 2.1.4).
 *
 * Thin wrapper around `runCharacterKeyShortcutCheck`. Target URL from
 * `TEST_PAGE`, output dir from `A11Y_OUTPUT_DIR` (falling back to cwd). This
 * check owns its browser context (see runCharacterKeyShortcutCheck).
 */

import { test } from '@playwright/test';
import { runCharacterKeyShortcutCheck } from '../playwright/runCharacterKeyShortcutCheck.js';

test('character key shortcut check', async ({ browser }) => {
  // The check's own budget is 60 s, longer than Playwright's default 30 s.
  test.setTimeout(180_000);
  await runCharacterKeyShortcutCheck({ browser });
});
