/**
 * Issue #84: when focus on an element navigates the page, the check must not
 * blame the element focused before it.
 *
 * On a busy machine the page's focus report for the navigating element can be
 * lost in the navigation, and asking the page for its focused element fails
 * because the navigation is under way. The fixture reproduces both without CPU
 * throttling by replacing the check's own page-side functions
 * (`window.reportFocus`, `window.describeActiveElement`,
 * `window.reportFocusNavigation`); rename them in the check and this test must
 * follow.
 *
 * Playwright drops a page's `exposeFunction` call when the
 * navigation removes the page before the call is handled, so the check also
 * learns the culprit from the page's `navigate` event, sent another way.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from '@playwright/test';
import { runFocusIndicatorCheck } from '../dist/playwright/index.js';

// Drops the focus report for the navigating link and makes the
// focused-element query throw, as when both are cut off by the navigation.
const LOSE_FOCUS_REPORT_SCRIPT = `<script>
  var report = window.reportFocus;
  window.reportFocus = function (data) {
    if (data.tag === 'A') return;
    return report(data);
  };
  window.describeActiveElement = function () {
    throw new Error('navigation in progress');
  };
</script>`;

// Also drops the navigate-event report, so nothing names the link.
const LOSE_ALL_REPORTS_SCRIPT = `${LOSE_FOCUS_REPORT_SCRIPT}<script>
  window.reportFocusNavigation = function () {};
</script>`;

type Lose = 'none' | 'focus-report' | 'all';

const page = (lose: Lose, target = '/navigated') => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>culprit fixture</title></head>
<body>
  <button id="plain" style="outline: none">plain</button>
  <a id="jump" href="#" onfocus="location.href = '${target}'">jump</a>
  ${lose === 'focus-report' ? LOSE_FOCUS_REPORT_SCRIPT : ''}
  ${lose === 'all' ? LOSE_ALL_REPORTS_SCRIPT : ''}
</body></html>`;

// The first link starts the navigation from a timer, after the check has
// pressed Tab again and focused the next link. Both links' focus reports are
// lost, so only the navigate-event report could name an element.
const TIMER_NAVIGATION_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>timer navigation fixture</title></head>
<body>
  <a id="late" href="#" onfocus="setTimeout(function () { location.href = '/navigated'; }, 120)">late</a>
  <a id="next" href="#">next</a>
  ${LOSE_FOCUS_REPORT_SCRIPT}
</body></html>`;

const NAVIGATED_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>navigated</title></head>
<body><p>navigated</p></body></html>`;

// The destination focuses its own field on load, and that page's focus
// report reaches the check after the navigating link's report was lost.
const NAVIGATED_AUTOFOCUS_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>navigated</title></head>
<body><input id="dest" autofocus aria-label="destination"></body></html>`;

// The iframe is added only when #plain gets focus, i.e. after the check has
// started walking, and the link inside it navigates the parent page.
const LAZY_FRAME_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>lazy frame fixture</title></head>
<body>
  <button id="plain">plain</button>
  <script>
    document.getElementById('plain').addEventListener('focus', function () {
      if (document.querySelector('iframe')) return;
      var frame = document.createElement('iframe');
      frame.title = 'lazy';
      frame.src = '/lazy-frame-child';
      document.body.appendChild(frame);
    });
  </script>
</body></html>`;

const LAZY_FRAME_CHILD_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>lazy frame child</title></head>
<body>
  <a id="inner" href="#" onfocus="top.location.href = '/navigated'">inner</a>
</body></html>`;

let server: Server;
let port: number;
// Requests to the first-attempt pages so far: only the first attempt loses
// the report.
let firstAttemptRequests = 0;

test.beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (req.url === '/navigated') {
        res.end(NAVIGATED_HTML);
      } else if (req.url === '/navigated-autofocus') {
        res.end(NAVIGATED_AUTOFOCUS_HTML);
      } else if (req.url === '/lazy-frame') {
        res.end(LAZY_FRAME_HTML);
      } else if (req.url === '/lazy-frame-child') {
        res.end(LAZY_FRAME_CHILD_HTML);
      } else if (req.url === '/timer-navigation') {
        res.end(TIMER_NAVIGATION_HTML);
      } else if (req.url === '/always-lost') {
        res.end(page('all'));
      } else if (req.url === '/focus-report-always-lost') {
        res.end(page('focus-report'));
      } else if (req.url === '/to-autofocus') {
        firstAttemptRequests++;
        res.end(
          page(
            firstAttemptRequests === 1 ? 'all' : 'none',
            '/navigated-autofocus',
          ),
        );
      } else {
        firstAttemptRequests++;
        res.end(page(firstAttemptRequests === 1 ? 'all' : 'none'));
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

test('focus report and focused-element query lost on every attempt: the navigate event still names the link as the 3.2.1 culprit', async ({
  browser,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/focus-report-always-lost`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(
    result.details.onFocusViolations.map((v) => v.element.selector),
  ).toEqual(['#jump']);
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

test('focus report lost and the Tab limit reached right after: 3.2.1 is incomplete, not passed', async ({
  browser,
}, testInfo) => {
  // Tab 1 focuses #plain, Tab 2 focuses #jump and navigates; the limit then
  // stops the restart.
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/always-lost`,
    outputDir: testInfo.outputDir,
    quiet: true,
    maxTabPresses: 2,
  });

  expect(result.details.aborted?.reason).toBe('tab-limit');
  expect(result.details.unidentifiedNavigation).toBe(true);
  expect(result.incomplete.map((r) => r.id)).toContain(
    'a11y-skills/no-context-change-on-focus',
  );
});

test('focus report lost and the destination page autofocuses a field: the destination field is not recorded as the 3.2.1 culprit', async ({
  browser,
}, testInfo) => {
  // A long settle window lets the destination's autofocus report arrive
  // before the culprit is chosen.
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/to-autofocus`,
    outputDir: testInfo.outputDir,
    quiet: true,
    navigationSettleMs: 1000,
  });

  expect(
    result.details.onFocusViolations.map((v) => v.element.selector),
  ).toEqual(['#jump']);
});

test('link in an iframe loaded after the walk started navigates the parent: the link, not the iframe, is recorded as the 3.2.1 culprit', async ({
  browser,
}, testInfo) => {
  // A long settle window lets the iframe load before the next Tab.
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/lazy-frame`,
    outputDir: testInfo.outputDir,
    quiet: true,
    navigationSettleMs: 500,
  });

  expect(
    result.details.onFocusViolations.map((v) => v.element.selector),
  ).toEqual(['#inner']);
});

test('navigation started by a timer after focus moved to the next link: the next link is not recorded as the 3.2.1 culprit', async ({
  browser,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/timer-navigation`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(
    result.details.onFocusViolations.map((v) => v.element.selector),
  ).not.toContain('#next');
});
