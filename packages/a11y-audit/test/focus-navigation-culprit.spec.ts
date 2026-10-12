/**
 * Issue #84: when focus on an element navigates the page, the check must not
 * blame the element focused before it.
 *
 * On a busy machine the page's focus report for the navigating element can be
 * lost in the navigation, and asking the page for its focused element fails
 * because the navigation is under way. The fixture reproduces both without CPU
 * throttling by replacing the check's own page-side functions
 * (`window.reportFocus`, `window.describeActiveElement`); rename them in the
 * check and this test must follow.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from '@playwright/test';
import { runFocusIndicatorCheck } from '../dist/playwright/index.js';

// Drops the report for the navigating link and makes the focused-element
// query throw, as when both are cut off by the navigation.
const LOSE_REPORT_SCRIPT = `<script>
  var report = window.reportFocus;
  window.reportFocus = function (data) {
    if (data.tag === 'A') return;
    return report(data);
  };
  window.describeActiveElement = function () {
    throw new Error('navigation in progress');
  };
</script>`;

const page = (loseReport: boolean) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>culprit fixture</title></head>
<body>
  <button id="plain" style="outline: none">plain</button>
  <a id="jump" href="#" onfocus="location.href = '/navigated'">jump</a>
  ${loseReport ? LOSE_REPORT_SCRIPT : ''}
</body></html>`;

const NAVIGATED_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>navigated</title></head>
<body><p>navigated</p></body></html>`;

let server: Server;
let port: number;
// Requests to `/` so far: only the first attempt loses the report.
let firstAttemptRequests = 0;

test.beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (req.url === '/navigated') {
        res.end(NAVIGATED_HTML);
      } else if (req.url === '/always-lost') {
        res.end(page(true));
      } else {
        firstAttemptRequests++;
        res.end(page(firstAttemptRequests === 1));
      }
    });
    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as AddressInfo).port;
      resolve();
    });
  });
});

test.beforeEach(() => {
  firstAttemptRequests = 0;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test('focus report lost in the navigation: the previous element is not recorded as the 3.2.1 culprit', async ({
  browser,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(
    result.details.onFocusViolations.map((v) => v.element.selector),
  ).toEqual(['#jump']);
});

test('focus report lost in the navigation: the previous element is still checked for 2.4.7', async ({
  browser,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(result.details.issues.map((el) => el.selector)).toContain('#plain');
});

test('focus report lost on every attempt: 3.2.1 is incomplete, not passed, and no element is blamed', async ({
  browser,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/always-lost`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(result.details.interrupted).toBe(true);
  expect(result.details.onFocusViolations).toEqual([]);
  expect(result.incomplete.map((r) => r.id)).toContain(
    'a11y-skills/no-context-change-on-focus',
  );
  expect(result.passes.map((r) => r.id)).not.toContain(
    'a11y-skills/no-context-change-on-focus',
  );
});
