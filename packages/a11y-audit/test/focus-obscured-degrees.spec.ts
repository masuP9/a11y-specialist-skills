/**
 * 2.4.11 (focus not obscured, minimum) fails only when the focused element is
 * entirely hidden; 2.4.12 (enhanced) fails when any part of it is hidden.
 */

import { test, expect } from './helpers/fixtures.js';
import { runFocusIndicatorCheck } from '../dist/playwright/index.js';

const MINIMUM = 'a11y-skills/focus-not-obscured';
const ENHANCED = 'a11y-skills/focus-not-obscured-enhanced';

async function runDegreesFixture(
  browser: Parameters<typeof runFocusIndicatorCheck>[0]['browser'],
  baseUrl: string,
  outputDir: string,
) {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/focus-obscured-degrees.html`,
    outputDir,
  });
  const targetsOf = (ruleId: string) =>
    result.incomplete
      .filter((rule) => rule.id === ruleId)
      .flatMap((rule) => rule.nodes.map((node) => node.target[0]));
  return { result, targetsOf };
}

test('全部隠れる要素は fullyObscured が true になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const { result } = await runDegreesFixture(
    browser,
    baseUrl,
    testInfo.outputDir,
  );

  const issue = result.details.focusObscuredIssues.find(
    (i) => i.element.selector === '#fully-obscured',
  );
  expect(issue?.fullyObscured).toBe(true);
});

test('半分だけ隠れる要素は fullyObscured が false になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const { result } = await runDegreesFixture(
    browser,
    baseUrl,
    testInfo.outputDir,
  );

  const issue = result.details.focusObscuredIssues.find(
    (i) => i.element.selector === '#half-obscured',
  );
  expect(issue?.fullyObscured).toBe(false);
});

test('重なり合う 2 枚に隠された要素は重なりを二重に数えず、一部だけ隠れた扱いになる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const { result } = await runDegreesFixture(
    browser,
    baseUrl,
    testInfo.outputDir,
  );

  const issue = result.details.focusObscuredIssues.find(
    (i) => i.element.selector === '#double-covered',
  );
  expect(issue?.obscuredRatio).toBeCloseTo(100 / 120, 2);
  expect(issue?.fullyObscured).toBe(false);
});

test('20% 未満しか隠れない要素も記録される', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const { result } = await runDegreesFixture(
    browser,
    baseUrl,
    testInfo.outputDir,
  );

  const issue = result.details.focusObscuredIssues.find(
    (i) => i.element.selector === '#slightly-obscured',
  );
  expect(issue?.obscuredRatio).toBeCloseTo(0.1, 2);
  expect(issue?.fullyObscured).toBe(false);
});

test('隠れない要素は記録されない', async ({ browser, baseUrl }, testInfo) => {
  const { result } = await runDegreesFixture(
    browser,
    baseUrl,
    testInfo.outputDir,
  );

  const selectors = result.details.focusObscuredIssues.map(
    (i) => i.element.selector,
  );
  expect(selectors).not.toContain('#not-obscured');
});

test('2.4.11 の規則には全部隠れる要素だけが出る', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const { targetsOf } = await runDegreesFixture(
    browser,
    baseUrl,
    testInfo.outputDir,
  );

  expect(targetsOf(MINIMUM)).toEqual(['#fully-obscured']);
});

test('2.4.12 の規則には一部でも隠れる要素がすべて出る', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const { targetsOf } = await runDegreesFixture(
    browser,
    baseUrl,
    testInfo.outputDir,
  );

  expect(targetsOf(ENHANCED).sort()).toEqual([
    '#double-covered',
    '#fully-obscured',
    '#half-obscured',
    '#slightly-obscured',
  ]);
});

test('隠れる要素がなければ 2.4.11 も 2.4.12 も passes に入る', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/focus-indicator/clear.html`,
    outputDir: testInfo.outputDir,
  });

  const passed = result.passes.map((rule) => rule.id);
  expect(passed).toContain(MINIMUM);
  expect(passed).toContain(ENHANCED);
});
