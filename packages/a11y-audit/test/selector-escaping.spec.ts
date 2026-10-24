import { test, expect } from './helpers/fixtures.js';
import { runFixtureCheck } from './helpers/fixtures.js';
import { runFocusIndicatorCheck } from '../dist/playwright/index.js';

test('`:r1:` の id を持つリンクがフォーカスで遷移すると、検査は落ちずに 3.2.1 違反を 1 件報告し、selector は `#\\:r1\\:` になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/finding-context-change-react-id.html`,
    outputDir: testInfo.outputDir,
  });

  expect(result.details.onFocusViolations).toHaveLength(1);
  expect(result.details.onFocusViolations[0].element.selector).toBe(
    '#\\:r1\\:',
  );
  expect(
    result.violations.some(
      (v) => v.id === 'a11y-skills/no-context-change-on-focus',
    ),
  ).toBe(true);
});

test('`:r1:` の id を持つ入力欄に autocomplete が無いと、報告される target は `#\\:r1\\:` になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = (await runFixtureCheck(
    'autocomplete-audit',
    'autocomplete/finding-missing-react-id.html',
    baseUrl,
    { page, browser, testInfo },
  )) as {
    incomplete: { id: string; nodes: { target: string[] }[] }[];
  };

  const missing = result.incomplete.find(
    (r) => r.id === 'a11y-skills/autocomplete-missing',
  );
  expect(missing?.nodes[0].target[0]).toBe('#\\:r1\\:');
});
