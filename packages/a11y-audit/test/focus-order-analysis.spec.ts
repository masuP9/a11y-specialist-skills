/**
 * Unit tests for the WCAG 2.4.3 position analysis. Pure function — no browser
 * needed. Viewport is 1000x1000 (diagonal ~1414px) throughout.
 */

import { test, expect } from '@playwright/test';
import { analyzeFocusOrder } from '../dist/index.js';
import type { FocusOrderPoint } from '../dist/index.js';

const viewport = { width: 1000, height: 1000 };

const point = (
  x: number,
  y: number,
  width = 100,
  height = 20,
  positioning: FocusOrderPoint['positioning'] = 'flow',
): FocusOrderPoint => ({ rect: { x, y, width, height }, positioning });

test.describe('analyzeFocusOrder transitions', () => {
  test('同じ行で右へ進む 2 点は forward で dx が正になる', () => {
    const { transitions } = analyzeFocusOrder([point(100, 0), point(300, 0)], {
      viewport,
      direction: 'ltr',
    });
    expect(transitions).toHaveLength(1);
    expect(transitions[0].kind).toBe('forward');
    expect(transitions[0].dx).toBeGreaterThan(0);
  });

  test('同じ行で左へ戻る 2 点は backward-inline で dx が -200 になる', () => {
    const { transitions } = analyzeFocusOrder([point(300, 0), point(100, 0)], {
      viewport,
      direction: 'ltr',
    });
    expect(transitions[0].kind).toBe('backward-inline');
    expect(transitions[0].dx).toBe(-200);
  });

  test('下の行の左端へ進む改行は forward になる', () => {
    const { transitions } = analyzeFocusOrder([point(800, 0), point(0, 100)], {
      viewport,
      direction: 'ltr',
    });
    expect(transitions[0].kind).toBe('forward');
  });

  test('左の列の下から右の列の上へ移ると column-wrap になる', () => {
    const { transitions } = analyzeFocusOrder([point(0, 800), point(500, 0)], {
      viewport,
      direction: 'ltr',
    });
    expect(transitions[0].kind).toBe('column-wrap');
  });

  test('同じ列で上へ戻ると backward-block で dy が -400 になる', () => {
    const { transitions } = analyzeFocusOrder(
      [point(100, 500), point(100, 100)],
      { viewport, direction: 'ltr' },
    );
    expect(transitions[0].kind).toBe('backward-block');
    expect(transitions[0].dy).toBe(-400);
  });

  test('行が重ならない小さな要素が 10px だけ上へ戻っても forward になる', () => {
    const { transitions } = analyzeFocusOrder(
      [point(100, 100, 100, 4), point(100, 90, 100, 4)],
      { viewport, direction: 'ltr' },
    );
    expect(transitions[0].kind).toBe('forward');
  });

  test('rtl で同じ行を左へ進むと forward になる', () => {
    const { transitions } = analyzeFocusOrder([point(700, 0), point(500, 0)], {
      viewport,
      direction: 'rtl',
    });
    expect(transitions[0].kind).toBe('forward');
  });

  test('rtl で同じ行を右へ戻ると backward-inline になる', () => {
    const { transitions } = analyzeFocusOrder([point(500, 0), point(700, 0)], {
      viewport,
      direction: 'rtl',
    });
    expect(transitions[0].kind).toBe('backward-inline');
  });

  test('fixed を含む 2 点は比べずに skippedTransitions を数える', () => {
    const { transitions, skippedTransitions } = analyzeFocusOrder(
      [point(0, 0), point(0, 500, 100, 20, 'fixed')],
      { viewport, direction: 'ltr' },
    );
    expect(transitions).toEqual([]);
    expect(skippedTransitions).toBe(1);
  });

  test('幅 0 の点を含む 2 点は比べずに skippedTransitions を数える', () => {
    const { transitions, skippedTransitions } = analyzeFocusOrder(
      [point(0, 0), point(0, 500, 0, 20)],
      { viewport, direction: 'ltr' },
    );
    expect(transitions).toEqual([]);
    expect(skippedTransitions).toBe(1);
  });

  test('distanceRatio は小数 3 桁に丸められる', () => {
    const { transitions } = analyzeFocusOrder([point(0, 0), point(300, 0)], {
      viewport,
      direction: 'ltr',
    });
    expect(transitions[0].distanceRatio).toBe(
      Math.round(transitions[0].distanceRatio * 1000) / 1000,
    );
    expect(transitions[0].distanceRatio).toBeCloseTo(
      300 / Math.hypot(1000, 1000),
      3,
    );
  });
});

test.describe('analyzeFocusOrder detours', () => {
  test('近い A と C の間に遠い B があると B が detour になる', () => {
    const { detours } = analyzeFocusOrder(
      [point(0, 0, 20, 20), point(900, 900, 20, 20), point(10, 10, 20, 20)],
      { viewport, direction: 'ltr' },
    );
    expect(detours).toHaveLength(1);
    expect(detours[0].index).toBe(1);
    expect(detours[0].distanceIn).toBeGreaterThan(1250);
    expect(detours[0].distanceIn).toBeLessThan(1300);
  });

  test('C も A から遠いなら detour にならない', () => {
    const { detours } = analyzeFocusOrder(
      [point(0, 0, 20, 20), point(900, 900, 20, 20), point(0, 900, 20, 20)],
      { viewport, direction: 'ltr' },
    );
    expect(detours).toEqual([]);
  });
});
