/**
 * Position analysis for the focus-order check (WCAG 2.4.3).
 *
 * Pure geometry — no browser needed. Takes elements in Tab order and reports
 * moves that run against the visual reading order. The visual order is
 * estimated with a simple rule: top to bottom, along the reading direction
 * within a row, and a move back up lands in the next column when that column
 * lies entirely after the previous element. Card grids, horizontal scrolling
 * and vertical `writing-mode` can therefore be misjudged; whether a deviation
 * matters is left to a human.
 */

import {
  FOCUS_ORDER_DETOUR_FAR_RATIO,
  FOCUS_ORDER_DETOUR_NEAR_RATIO,
  FOCUS_ORDER_MIN_BACKWARD_PX,
  FOCUS_ORDER_TOLERANCE_PX,
} from '../constants.js';
import type {
  FocusOrderDetour,
  FocusOrderTransition,
  PageRect,
} from '../types.js';

export interface FocusOrderPoint {
  rect: PageRect;
  /** 'fixed' / 'sticky' points are not compared: Tab scrolling moves their page coordinates. */
  positioning: 'flow' | 'fixed' | 'sticky';
  /**
   * Focus left the page (wrapped past the end) before reaching this point; the
   * move into it is not compared.
   */
  breakBefore?: boolean;
}

export interface AnalyzeFocusOrderOptions {
  viewport: { width: number; height: number };
  direction: 'ltr' | 'rtl';
}

export interface FocusOrderAnalysis {
  transitions: FocusOrderTransition[];
  detours: FocusOrderDetour[];
  skippedTransitions: number;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const isComparable = (point: FocusOrderPoint): boolean =>
  point.rect.width > 0 && point.rect.height > 0 && point.positioning === 'flow';

const centerDistance = (a: PageRect, b: PageRect): number =>
  Math.hypot(
    a.x + a.width / 2 - (b.x + b.width / 2),
    a.y + a.height / 2 - (b.y + b.height / 2),
  );

export function analyzeFocusOrder(
  points: readonly FocusOrderPoint[],
  options: AnalyzeFocusOrderOptions,
): FocusOrderAnalysis {
  const { viewport, direction } = options;
  const diagonal = Math.hypot(viewport.width, viewport.height);
  const rtl = direction === 'rtl';
  // Mirror x for rtl so that "reading direction" is always positive.
  const inlineStart = (rect: PageRect): number =>
    rtl ? -(rect.x + rect.width) : rect.x;

  const transitions: FocusOrderTransition[] = [];
  let skippedTransitions = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    if (!from || !to) continue;
    if (to.breakBefore || !isComparable(from) || !isComparable(to)) {
      skippedTransitions++;
      continue;
    }
    const f = from.rect;
    const t = to.rect;
    const fromStart = inlineStart(f);
    const fromEnd = fromStart + f.width;
    const toStart = inlineStart(t);
    const dx = toStart - fromStart;
    const dy = t.y - f.y;

    const overlap =
      Math.min(f.y + f.height, t.y + t.height) - Math.max(f.y, t.y);
    const sameRow = overlap >= 0.5 * Math.min(f.height, t.height);

    let kind: FocusOrderTransition['kind'];
    if (sameRow) {
      kind =
        toStart < fromStart - FOCUS_ORDER_TOLERANCE_PX
          ? 'backward-inline'
          : 'forward';
    } else if (t.y >= f.y - FOCUS_ORDER_TOLERANCE_PX) {
      kind = 'forward';
    } else if (toStart >= fromEnd - FOCUS_ORDER_TOLERANCE_PX) {
      kind = 'column-wrap';
    } else if (f.y - t.y > FOCUS_ORDER_MIN_BACKWARD_PX) {
      kind = 'backward-block';
    } else {
      kind = 'forward';
    }

    const distance = centerDistance(f, t);
    transitions.push({
      from: i,
      to: i + 1,
      kind,
      dx: round1(dx),
      dy: round1(dy),
      distance: round1(distance),
      distanceRatio: round3(distance / diagonal),
    });
  }

  const detours: FocusOrderDetour[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    if (!a || !b || !c) continue;
    if (b.breakBefore || c.breakBefore) continue;
    if (!isComparable(a) || !isComparable(b) || !isComparable(c)) continue;
    const distanceIn = centerDistance(a.rect, b.rect);
    const distanceOut = centerDistance(b.rect, c.rect);
    const distanceAcross = centerDistance(a.rect, c.rect);
    if (
      distanceIn >= FOCUS_ORDER_DETOUR_FAR_RATIO * diagonal &&
      distanceOut >= FOCUS_ORDER_DETOUR_FAR_RATIO * diagonal &&
      distanceAcross <= FOCUS_ORDER_DETOUR_NEAR_RATIO * diagonal
    ) {
      detours.push({
        index: i,
        distanceIn: round1(distanceIn),
        distanceOut: round1(distanceOut),
        distanceAcross: round1(distanceAcross),
      });
    }
  }

  return { transitions, detours, skippedTransitions };
}
