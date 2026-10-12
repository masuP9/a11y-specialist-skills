/**
 * CDP event listener inspector: lists listeners on window / document / elements
 * through DOMDebugger.getEventListeners, including ones set via on* properties.
 */

import { test, expect } from './helpers/fixtures.js';
import { openEventListenerInspector } from '../dist/playwright/cdpEventListeners.js';

const FIXTURE = 'event-listeners/listeners.html';

test('window の devicemotion を絞り込むと capture の listener が 1 件取れる', async ({
  page,
  baseUrl,
}) => {
  await page.goto(`${baseUrl}/${FIXTURE}`);
  const inspector = await openEventListenerInspector(page);
  if (!inspector) throw new Error('CDP is unavailable');
  try {
    const listeners = await inspector.forExpression('window', ['devicemotion']);
    expect(listeners).toHaveLength(1);
    expect(listeners[0]?.type).toBe('devicemotion');
    expect(listeners[0]?.useCapture).toBe(true);
  } finally {
    await inspector.close();
  }
});

test('window.onkeydown で付けた handler も取れて handlerPreview に関数名を含む', async ({
  page,
  baseUrl,
}) => {
  await page.goto(`${baseUrl}/${FIXTURE}`);
  const inspector = await openEventListenerInspector(page);
  if (!inspector) throw new Error('CDP is unavailable');
  try {
    const listeners = await inspector.forExpression('window', ['keydown']);
    expect(listeners).toHaveLength(1);
    expect(listeners[0]?.handlerPreview).toContain('onKey');
  } finally {
    await inspector.close();
  }
});

test('document の keydown は passive かつ once として取れる', async ({
  page,
  baseUrl,
}) => {
  await page.goto(`${baseUrl}/${FIXTURE}`);
  const inspector = await openEventListenerInspector(page);
  if (!inspector) throw new Error('CDP is unavailable');
  try {
    const listeners = await inspector.forExpression('document', ['keydown']);
    expect(listeners).toHaveLength(1);
    expect(listeners[0]?.passive).toBe(true);
    expect(listeners[0]?.once).toBe(true);
  } finally {
    await inspector.close();
  }
});

test('forEach は要素ごとに listener を並べ、listener の無い要素は空配列になる', async ({
  page,
  baseUrl,
}) => {
  await page.goto(`${baseUrl}/${FIXTURE}`);
  const inspector = await openEventListenerInspector(page);
  if (!inspector) throw new Error('CDP is unavailable');
  try {
    const perElement = await inspector.forEach(
      'document.querySelectorAll("button")',
      ['pointerdown', 'click'],
    );
    expect(
      perElement.map((listeners) => listeners.map((l) => l.type).sort()),
    ).toEqual([['click', 'pointerdown'], ['click'], []]);
  } finally {
    await inspector.close();
  }
});

test('数値を返す式を渡すと例外になる', async ({ page, baseUrl }) => {
  await page.goto(`${baseUrl}/${FIXTURE}`);
  const inspector = await openEventListenerInspector(page);
  if (!inspector) throw new Error('CDP is unavailable');
  try {
    await expect(inspector.forExpression('1')).rejects.toThrow();
  } finally {
    await inspector.close();
  }
});

test('close を 2 回呼んでも例外にならない', async ({ page, baseUrl }) => {
  await page.goto(`${baseUrl}/${FIXTURE}`);
  const inspector = await openEventListenerInspector(page);
  if (!inspector) throw new Error('CDP is unavailable');
  await inspector.close();
  await expect(inspector.close()).resolves.toBeUndefined();
});
