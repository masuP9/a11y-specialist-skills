import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from '@playwright/test';
import { runFocusIndicatorCheck } from '../dist/playwright/index.js';

const PAGE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>delayed nav fixture</title></head>
<body>
  <button id="safe">safe</button>
  <button id="delayed-nav">navigates on focus (delayed)</button>
  <script>
    var fired = false;
    document.getElementById('delayed-nav').addEventListener('focus', function() {
      if (!fired) {
        fired = true;
        setTimeout(function() { location.href = '/navigated'; }, 500);
      }
    });
  </script>
</body></html>`;

const NAVIGATED_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>navigated</title></head>
<body><p>navigated</p></body></html>`;

let server: Server;
let port: number;

test.beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createServer((req, res) => {
      if (req.url === '/navigated') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(NAVIGATED_HTML);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(PAGE_HTML);
      }
    });
    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as AddressInfo).port;
      resolve();
    });
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test('runFocusIndicatorCheck detects focus-triggered navigation delayed beyond the settle window', async ({
  browser,
}, testInfo) => {
  // navigationSettleMs (600) must exceed the 500ms one-shot focus-to-navigate
  // delay so the navigation is caught in the same Tab iteration as #delayed-nav
  // rather than a later iteration (which would falsely attribute it to another
  // element, exhaust retries, and leave the rule as inapplicable).
  // The pre-fix code has a hardcoded 50ms that cannot wait long enough: the
  // 500ms timer fires during a later iteration where #safe is focused, causing
  // a false attribution, 2 retries, and totalFocusableElements=0.
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/`,
    outputDir: testInfo.outputDir,
    navigationSettleMs: 600,
  });

  // The delayed-nav button triggers navigation 500ms after first focus — far
  // beyond the default 50ms settle window. The configurable navigationSettleMs
  // (600) must cover the full delay for correct detection and attribution.
  expect(result.details.onFocusViolations.length).toBeGreaterThanOrEqual(1);

  const navViolation = result.details.onFocusViolations.find((v) =>
    v.toUrl.includes('/navigated')
  );
  expect(navViolation).toBeDefined();

  const ruleResult = result.violations.find(
    (r) => r.id === 'a11y-skills/no-context-change-on-focus'
  );
  expect(ruleResult).toBeDefined();
});
