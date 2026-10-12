/**
 * `echoAttribute` hands the caller's own element mark back on every record
 * that points at an element, so results can be matched to the caller's
 * elements without relying on the check's own selector format.
 */

import { test, expect } from './helpers/fixtures.js';
import { runFocusIndicatorCheck } from '../dist/playwright/index.js';

const PAGE = 'focus-indicator/echo-attribute.html';

test('echoAttribute を渡すと、Tab で回った各要素の記録に属性の値が入り、属性が無い要素は null になる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/${PAGE}`,
    outputDir: testInfo.outputDir,
    echoAttribute: 'data-test-id',
  });

  const echoBySelector = Object.fromEntries(
    result.details.allElements.map((record) => [record.selector, record.echo]),
  );
  expect(echoBySelector['#obscured-btn']).toBe('obscured');
  expect(echoBySelector['#no-style-btn']).toBe('no-style');
  expect(echoBySelector['#plain-btn']).toBeNull();
});

test('echoAttribute を渡すと、フォーカス表示が無い要素の指摘にも属性の値が入る', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/${PAGE}`,
    outputDir: testInfo.outputDir,
    echoAttribute: 'data-test-id',
  });

  const issue = result.details.issues.find(
    (i) => i.selector === '#no-style-btn',
  );
  expect(issue?.echo).toBe('no-style');
});

test('echoAttribute を渡すと、フォーカスが隠れた要素と隠している要素の両方に属性の値が入る', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/${PAGE}`,
    outputDir: testInfo.outputDir,
    echoAttribute: 'data-test-id',
  });

  const obscured = result.details.focusObscuredIssues.find(
    (i) => i.element.selector === '#obscured-btn',
  );
  expect(obscured?.element.echo).toBe('obscured');
  expect(obscured?.overlaps[0]?.obscuredBy.echo).toBe('header');
});

test('echoAttribute を渡すと、フォーカスで画面遷移した要素(3.2.1)の記録に属性の値が入る', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/${PAGE}`,
    outputDir: testInfo.outputDir,
    echoAttribute: 'data-test-id',
  });

  expect(result.details.onFocusViolations).toHaveLength(1);
  expect(result.details.onFocusViolations[0]?.element.echo).toBe('trigger');
});

test('echoAttribute を渡さないと、どの記録にも echo の項目が付かない', async ({
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `${baseUrl}/${PAGE}`,
    outputDir: testInfo.outputDir,
  });

  expect(result.details.allElements[0]).not.toHaveProperty('echo');
  expect(result.details.issues[0]).not.toHaveProperty('echo');
  expect(result.details.focusObscuredIssues[0]?.element).not.toHaveProperty(
    'echo',
  );
  expect(
    result.details.focusObscuredIssues[0]?.overlaps[0]?.obscuredBy,
  ).not.toHaveProperty('echo');
  expect(result.details.onFocusViolations[0]?.element).not.toHaveProperty(
    'echo',
  );
});

test('属性名として不正な文字列を echoAttribute に渡すと、ブラウザを開く前にエラーになる', async ({
  browser,
  baseUrl,
}, testInfo) => {
  await expect(
    runFocusIndicatorCheck({
      browser,
      targetUrl: `${baseUrl}/${PAGE}`,
      outputDir: testInfo.outputDir,
      echoAttribute: 'data test"id',
    }),
  ).rejects.toThrow(/echoAttribute/);
});
