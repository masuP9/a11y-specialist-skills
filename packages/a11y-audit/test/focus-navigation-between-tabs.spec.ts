/**
 * Issue #164: a navigation that lands after the check stopped waiting for one
 * Tab, and before the next Tab finished, must still count as a 3.2.1 violation
 * of the element whose focus started it. The delays here are chosen so the
 * navigation falls outside the default 25 ms wait.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from '@playwright/test';
import { runFocusIndicatorCheck } from '../dist/playwright/index.js';

const delayedJumpPage = (delayMs: number) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>delayed jump</title></head>
<body>
  <a id="before" href="#">before</a>
  <a id="jump" href="#" onfocus="setTimeout(function () { location.href = '/navigated'; }, ${delayMs})">jump</a>
  <a id="after-1" href="#">after 1</a>
  <a id="after-2" href="#">after 2</a>
</body></html>`;

// The destination has its own links: measuring them instead of the original
// page's is what a missed navigation looks like.
const NAVIGATED_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>navigated</title></head>
<body><a id="destination" href="#">destination</a></body></html>`;

// Nothing can name the link: the page's reports are replaced, and the
// focused-element query throws. Rename these in the check and this must follow.
const LOSE_ALL_REPORTS_SCRIPT = `<script>
  var report = window.reportFocus;
  window.reportFocus = function (data) {
    if (data.tag === 'A') return;
    return report(data);
  };
  window.describeActiveElement = function () {
    throw new Error('navigation in progress');
  };
  window.reportFocusNavigation = function () {};
</script>`;

const DELAYED_JUMP_REPORTS_LOST_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>reports lost</title></head>
<body>
  <a id="jump" href="#" onfocus="setTimeout(function () { location.href = '/navigated'; }, 40)">jump</a>
  ${LOSE_ALL_REPORTS_SCRIPT}
</body></html>`;

// The page leaves by itself after the check has started walking; focus has
// nothing to do with it. networkidle takes 500 ms, so the timer must be longer.
const LEAVES_BY_ITSELF_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>leaves by itself</title></head>
<body>
  <a id="first" href="#">first</a>
  <a id="second" href="#">second</a>
  <script>setTimeout(function () { location.href = '/navigated'; }, 800);</script>
</body></html>`;

// The link navigates in its own focus handler, but the destination takes long
// to answer, so the URL changes only after the walk has moved on or ended.
const SLOW_SERVER_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>slow server</title></head>
<body>
  <a id="jump" href="#" onfocus="location.href = '/slow-navigated'">jump</a>
  <a id="after" href="#">after</a>
</body></html>`;

// Only the last element navigates, later than the Tabs left in the walk take.
const LAST_ELEMENT_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>last element</title></head>
<body>
  <a id="before" href="#">before</a>
  <a id="jump" href="#" onfocus="setTimeout(function () { location.href = '/navigated'; }, 500)">jump</a>
</body></html>`;

let server: Server;
let port: number;

test.beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      const delay = /^\/delay\/(\d+)$/.exec(req.url ?? '');
      if (delay) {
        res.end(delayedJumpPage(Number(delay[1])));
      } else if (req.url === '/reports-lost') {
        res.end(DELAYED_JUMP_REPORTS_LOST_HTML);
      } else if (req.url === '/leaves-by-itself') {
        res.end(LEAVES_BY_ITSELF_HTML);
      } else if (req.url === '/slow-server') {
        res.end(SLOW_SERVER_HTML);
      } else if (req.url === '/last-element') {
        res.end(LAST_ELEMENT_HTML);
      } else if (req.url === '/slow-navigated') {
        setTimeout(() => res.end(NAVIGATED_HTML), 1500);
      } else {
        res.end(NAVIGATED_HTML);
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

test('onfocus から 40ms 後に遷移するページでは、遷移を起こしたリンクが 3.2.1 の違反になる', async ({
  browser,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/delay/40`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(
    result.details.onFocusViolations.map((v) => v.element.selector),
  ).toEqual(['#jump']);
});

test('onfocus から 50ms 後に遷移するページでは、遷移を起こしたリンクが 3.2.1 の違反になる', async ({
  browser,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/delay/50`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(
    result.details.onFocusViolations.map((v) => v.element.selector),
  ).toEqual(['#jump']);
});

test('onfocus から 40ms 後に遷移するページでは、遷移したリンクより後ろの要素も元のページで測られる', async ({
  browser,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/delay/40`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(result.details.allElements.map((el) => el.selector)).toEqual([
    '#before',
    '#after-1',
    '#after-2',
  ]);
});

test('onfocus から 300ms 後に遷移するページでは、遷移の間にフォーカスが移った後ろのリンクを違反にしない', async ({
  browser,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/delay/300`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(
    result.details.onFocusViolations.map((v) => v.element.selector),
  ).toEqual(['#jump']);
});

test('遅れて遷移する要素を特定できないページでは、3.2.1 を適合にせず incomplete にして、どの要素も違反にしない', async ({
  browser,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/reports-lost`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(result.details.unidentifiedNavigation).toBe(true);
  expect(result.details.onFocusViolations).toEqual([]);
  expect(result.incomplete.map((r) => r.id)).toContain(
    'a11y-skills/no-context-change-on-focus',
  );
  expect(result.passes.map((r) => r.id)).not.toContain(
    'a11y-skills/no-context-change-on-focus',
  );
});

test('遅れた遷移の特定の途中で Tab の上限に達したら、3.2.1 を適合にせず incomplete にする', async ({
  browser,
}, testInfo) => {
  // 最初の歩きで 3 回ほど Tab を押して遷移を見つけ、歩き直しの途中で上限に達する。
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/delay/40`,
    outputDir: testInfo.outputDir,
    quiet: true,
    maxTabPresses: 5,
  });

  expect(result.details.aborted?.reason).toBe('tab-limit');
  expect(result.passes.map((r) => r.id)).not.toContain(
    'a11y-skills/no-context-change-on-focus',
  );
});

test('フォーカスと関係なくページが自分で遷移するときは、どの要素も違反にせず遷移先を測る', async ({
  browser,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/leaves-by-itself`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(result.details.onFocusViolations).toEqual([]);
  expect(result.details.unidentifiedNavigation).toBe(false);
  expect(result.details.allElements.map((el) => el.selector)).toEqual([
    '#destination',
  ]);
});

test('フォーカスの処理の中で始まった遷移は、遷移先の応答が遅くてもそのリンクの違反になる', async ({
  browser,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/slow-server`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(
    result.details.onFocusViolations.map((v) => v.element.selector),
  ).toEqual(['#jump']);
});

test('最後の要素のフォーカスから 500ms 後の遷移も、残りの Tab を押し終えた後で捕まえる', async ({
  browser,
}, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/last-element`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(
    result.details.onFocusViolations.map((v) => v.element.selector),
  ).toEqual(['#jump']);
});

test('画面撮影を有効にしても、onfocus から 50ms 後に遷移するページの検査は撮影で詰まらない', async ({
  browser,
}, testInfo) => {
  const startedAt = Date.now();
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: `http://127.0.0.1:${port}/delay/50`,
    outputDir: testInfo.outputDir,
    quiet: true,
    screenshotDiff: true,
  });

  expect(
    result.details.onFocusViolations.map((v) => v.element.selector),
  ).toEqual(['#jump']);
  expect(Date.now() - startedAt).toBeLessThan(15_000);
});
