import { expect, test } from '@playwright/test';
import { KEYBOARD_TRAP_WALK_SETTLE_MS } from '../dist/constants.js';

test('keyboard-trap-check の Tab ごとの既定の待ちは 25ms（Plan 021 で 5 ページと fixture 5 件の結果が 50ms と同じだった値）', () => {
  expect(KEYBOARD_TRAP_WALK_SETTLE_MS).toBe(25);
});
