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

const SUBTREE_FIXTURE = 'event-listeners/subtree.html';

test('forSubtree は子孫の pointermove を backendNodeId 付きで 1 件返し handlerPreview に関数名を含む', async ({
  page,
  baseUrl,
}) => {
  await page.goto(`${baseUrl}/${SUBTREE_FIXTURE}`);
  const inspector = await openEventListenerInspector(page);
  if (!inspector) throw new Error('CDP is unavailable');
  try {
    const listeners = await inspector.forSubtree('document.documentElement', [
      'pointermove',
    ]);
    expect(listeners).toHaveLength(1);
    expect(listeners[0]?.handlerPreview).toContain('onMove');
    expect(typeof listeners[0]?.backendNodeId).toBe('number');
  } finally {
    await inspector.close();
  }
});

test('forSubtree は open shadow root の中の touchmove も 1 件返す', async ({
  page,
  baseUrl,
}) => {
  await page.goto(`${baseUrl}/${SUBTREE_FIXTURE}`);
  const inspector = await openEventListenerInspector(page);
  if (!inspector) throw new Error('CDP is unavailable');
  try {
    const listeners = await inspector.forSubtree('document.documentElement', [
      'touchmove',
    ]);
    expect(listeners).toHaveLength(1);
  } finally {
    await inspector.close();
  }
});

test('collectNodes は forSubtree の backendNodeId から要素を window[key] に並べ番号を返す', async ({
  page,
  baseUrl,
}) => {
  await page.goto(`${baseUrl}/${SUBTREE_FIXTURE}`);
  const inspector = await openEventListenerInspector(page);
  if (!inspector) throw new Error('CDP is unavailable');
  try {
    const listeners = await inspector.forSubtree('document.documentElement', [
      'pointermove',
    ]);
    const indices = await inspector.collectNodes(
      listeners.map((l) => l.backendNodeId),
      '__testNodes',
    );
    const id = await page.evaluate(
      (i) =>
        (window as unknown as Record<string, Element[]>)['__testNodes']?.[i]
          ?.id,
      indices[0] as number,
    );
    expect(id).toBe('map');
  } finally {
    await inspector.close();
  }
});

test('collectNodes は iframe の中の要素の backendNodeId に -1 を返す', async ({
  page,
  baseUrl,
}) => {
  await page.goto(`${baseUrl}/${SUBTREE_FIXTURE}`);
  const inspector = await openEventListenerInspector(page);
  if (!inspector) throw new Error('CDP is unavailable');
  try {
    const listeners = await inspector.forSubtree('document.documentElement', [
      'pointerdown',
    ]);
    expect(listeners.length).toBeGreaterThan(0);
    const indices = await inspector.collectNodes(
      listeners.map((l) => l.backendNodeId),
      '__testNodes',
    );
    expect(indices).toEqual(listeners.map(() => -1));
  } finally {
    await inspector.close();
  }
});

test('collectNodes は shouldStop が 2 回目の呼び出しから true なら 2 件目以降を -1 にして 1 件だけ書く', async ({
  page,
  baseUrl,
}) => {
  await page.goto(`${baseUrl}/${SUBTREE_FIXTURE}`);
  const inspector = await openEventListenerInspector(page);
  if (!inspector) throw new Error('CDP is unavailable');
  try {
    const listeners = await inspector.forSubtree('document.documentElement', [
      'pointermove',
      'dragstart',
      'click',
    ]);
    expect(listeners).toHaveLength(3);
    // 1st call: before creating the array; 2nd: before the first node; 3rd+: stop.
    let calls = 0;
    const indices = await inspector.collectNodes(
      listeners.map((l) => l.backendNodeId),
      '__testNodes',
      () => ++calls >= 3,
    );
    const length = await page.evaluate(
      () =>
        (window as unknown as Record<string, Element[]>)['__testNodes']?.length,
    );
    expect(indices).toEqual([0, -1, -1]);
    expect(length).toBe(1);
  } finally {
    await inspector.close();
  }
});

test('collectNodes は shouldStop が最初から true ならページに何も書かない', async ({
  page,
  baseUrl,
}) => {
  await page.goto(`${baseUrl}/${SUBTREE_FIXTURE}`);
  const inspector = await openEventListenerInspector(page);
  if (!inspector) throw new Error('CDP is unavailable');
  try {
    const listeners = await inspector.forSubtree('document.documentElement', [
      'pointermove',
    ]);
    const indices = await inspector.collectNodes(
      listeners.map((l) => l.backendNodeId),
      '__testNodes',
      () => true,
    );
    const type = await page.evaluate(
      () =>
        typeof (window as unknown as Record<string, unknown>)['__testNodes'],
    );
    expect(indices).toEqual([-1]);
    expect(type).toBe('undefined');
  } finally {
    await inspector.close();
  }
});
