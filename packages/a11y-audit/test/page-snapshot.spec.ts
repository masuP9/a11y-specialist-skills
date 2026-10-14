/**
 * page-snapshot: writes the page's accessibility tree and document facts as
 * material for criteria the other checks do not judge (2.4.1, 2.4.2, 3.1.1,
 * 3.2.3 / 3.2.4 / 3.2.6 across pages). It never reports a verdict.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { test, expect } from './helpers/fixtures.js';
import { startStaticServer } from './helpers/static-server.js';
import { runPageSnapshot } from '../dist/playwright/index.js';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';

const ajv = new Ajv2020({ strict: false, allowUnionTypes: true });
const validatePageSnapshot = ajv.compile(RESULT_SCHEMAS['page-snapshot']);

const FIXTURES_PAGES_DIR = path.resolve(
  new URL('./fixtures/pages', import.meta.url).pathname,
);

test('URL を渡すと、そのページの body の aria snapshot を Playwright の出力のまま書き出す', async ({
  baseUrl,
  page,
}, testInfo) => {
  const result = await runPageSnapshot({
    page,
    targetUrl: `${baseUrl}/page-snapshot/frames.html`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(result.details.snapshot).toBe(
    await page.locator('body').ariaSnapshot(),
  );
  expect(result.details.snapshot).toContain('- heading "Frames" [level=1]');
  expect(result.details.snapshotLength).toBe(result.details.snapshot.length);
});

test('リダイレクトするページでは、指定した URL と最終的に開いた URL を別々に書く', async ({
  baseUrl,
  page,
}, testInfo) => {
  const result = await runPageSnapshot({
    page,
    targetUrl: `${baseUrl}/page-snapshot/redirect.html`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(result.details.requestedUrl).toBe(
    `${baseUrl}/page-snapshot/redirect.html`,
  );
  expect(result.details.finalUrl).toBe(`${baseUrl}/page-snapshot/no-lang.html`);
  expect(result.url).toBe(`${baseUrl}/page-snapshot/no-lang.html`);
  expect(result.details.title).toBe('No lang');
});

test('html に lang 属性が無いと lang は null', async ({
  baseUrl,
  page,
}, testInfo) => {
  const result = await runPageSnapshot({
    page,
    targetUrl: `${baseUrl}/page-snapshot/no-lang.html`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(result.details.lang).toBeNull();
});

test('html の lang="" は null ではなく空文字のまま書く', async ({
  baseUrl,
  page,
}, testInfo) => {
  const result = await runPageSnapshot({
    page,
    targetUrl: `${baseUrl}/page-snapshot/empty-lang.html`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(result.details.lang).toBe('');
});

test('html の lang="ja" と document.title をそのまま書く', async ({
  baseUrl,
  page,
}, testInfo) => {
  const result = await runPageSnapshot({
    page,
    targetUrl: `${baseUrl}/page-snapshot/frames.html`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(result.details.lang).toBe('ja');
  expect(result.details.title).toBe('Frames | Example');
});

test('iframe は snapshot に「- iframe」行として出るものだけを、shadow DOM を展開した文書の順で、入れ子は親の直後に並べる', async ({
  baseUrl,
  page,
}, testInfo) => {
  const result = await runPageSnapshot({
    page,
    targetUrl: `${baseUrl}/page-snapshot/frames.html`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  // display:none と aria-hidden の中の iframe は snapshot に出ないので入らない。
  // 大きさ 0 の iframe は snapshot に出るので入る。
  expect(
    result.details.frames.map((f) => ({
      index: f.index,
      parentIndex: f.parentIndex,
      title: f.title,
    })),
  ).toEqual([
    { index: 0, parentIndex: null, title: 'Outer' },
    { index: 1, parentIndex: 0, title: 'Inner' },
    { index: 2, parentIndex: null, title: 'In shadow' },
    { index: 3, parentIndex: null, title: 'Zero size' },
  ]);
});

test('親を持たない frames の数は、本文の snapshot の「- iframe」行の数と同じ', async ({
  baseUrl,
  page,
}, testInfo) => {
  const result = await runPageSnapshot({
    page,
    targetUrl: `${baseUrl}/page-snapshot/frames.html`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  const iframeLines = result.details.snapshot
    .split('\n')
    .filter((line) => /^\s*- iframe\b/.test(line));
  const topLevelFrames = result.details.frames.filter(
    (f) => f.parentIndex === null,
  );
  expect(topLevelFrames).toHaveLength(iframeLines.length);
});

test('読めた iframe には中の aria snapshot と URL が入り、error は null', async ({
  baseUrl,
  page,
}, testInfo) => {
  const result = await runPageSnapshot({
    page,
    targetUrl: `${baseUrl}/page-snapshot/frames.html`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  const outer = result.details.frames[0]!;
  expect(outer.url).toBe(`${baseUrl}/page-snapshot/frame-outer.html`);
  expect(outer.snapshot).toContain('- button "Outer button"');
  expect(outer.snapshot).toContain('- iframe');
  expect(outer.error).toBeNull();
  const inner = result.details.frames[1]!;
  expect(inner.snapshot).toContain('- link "Leaf link"');
});

test('別オリジンの iframe も中の aria snapshot を読む', async ({
  baseUrl,
  page,
}, testInfo) => {
  const other = await startStaticServer(FIXTURES_PAGES_DIR);
  try {
    const frameUrl = `${other.baseUrl}/page-snapshot/frame-leaf.html`;
    const result = await runPageSnapshot({
      page,
      targetUrl: `${baseUrl}/page-snapshot/cross-origin.html#${encodeURIComponent(frameUrl)}`,
      outputDir: testInfo.outputDir,
      quiet: true,
    });

    expect(new URL(frameUrl).origin).not.toBe(new URL(baseUrl).origin);
    expect(result.details.frames).toHaveLength(1);
    expect(result.details.frames[0]!.url).toBe(frameUrl);
    expect(result.details.frames[0]!.snapshot).toContain('- link "Leaf link"');
  } finally {
    await other.close();
  }
});

test('中の snapshot を読めなかった iframe は snapshot が null で error に理由が入り、後ろの iframe は続けて読む', async ({
  baseUrl,
  page,
}, testInfo) => {
  const result = await runPageSnapshot({
    page,
    targetUrl: `${baseUrl}/page-snapshot/unreadable-frame.html`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  const [noBody, after] = result.details.frames;
  expect(noBody!.title).toBe('No body');
  expect(noBody!.url).toBe(`${baseUrl}/page-snapshot/no-body.svg`);
  expect(noBody!.snapshot).toBeNull();
  expect(noBody!.error).toEqual(expect.any(String));
  expect(after!.snapshot).toContain('- link "Leaf link"');
});

test('targetUrl を渡さないと、開いてあるページをそのまま撮り requestedUrl は null', async ({
  baseUrl,
  page,
}, testInfo) => {
  await page.goto(`${baseUrl}/page-snapshot/no-lang.html`);

  const result = await runPageSnapshot({
    page,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(result.details.requestedUrl).toBeNull();
  expect(result.details.finalUrl).toBe(`${baseUrl}/page-snapshot/no-lang.html`);
  expect(result.details.title).toBe('No lang');
});

test('ビューポートの幅と高さを書く', async ({ baseUrl, page }, testInfo) => {
  await page.setViewportSize({ width: 800, height: 600 });

  const result = await runPageSnapshot({
    page,
    targetUrl: `${baseUrl}/page-snapshot/no-lang.html`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(result.details.viewport).toEqual({ width: 800, height: 600 });
});

test('判定はしないので、違反などの配列は空で summary は全部 0', async ({
  baseUrl,
  page,
}, testInfo) => {
  const result = await runPageSnapshot({
    page,
    targetUrl: `${baseUrl}/page-snapshot/frames.html`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  expect(result.source).toBe('page-snapshot');
  expect(result.violations).toEqual([]);
  expect(result.incomplete).toEqual([]);
  expect(result.passes).toEqual([]);
  expect(result.inapplicable).toEqual([]);
  expect(result.summary).toEqual({
    violationCount: 0,
    incompleteCount: 0,
    passCount: 0,
  });
});

test('outputDir に page-snapshot-result.json を書き、その JSON は JSON Schema に合う', async ({
  baseUrl,
  page,
}, testInfo) => {
  await runPageSnapshot({
    page,
    targetUrl: `${baseUrl}/page-snapshot/frames.html`,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  const written = JSON.parse(
    fs.readFileSync(
      path.join(testInfo.outputDir, 'page-snapshot-result.json'),
      'utf-8',
    ),
  ) as unknown;
  const valid = validatePageSnapshot(written);
  expect(
    valid,
    `Schema validation failed: ${JSON.stringify(validatePageSnapshot.errors)}`,
  ).toBe(true);
});
