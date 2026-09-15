/**
 * Unit tests for the WCAG 2.5.8 spacing-exception geometry. Pure functions —
 * no browser needed.
 */

import { test, expect } from '@playwright/test';
import {
  circleIntersectsRect,
  circlesIntersect,
  distancePointToRect,
  evaluateTargetSpacing,
  rectCenter,
} from '../dist/index.js';
import type { Rect, SpacingTarget } from '../dist/index.js';

const box = (
  left: number,
  top: number,
  width: number,
  height: number,
): Rect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

const target = (
  index: number,
  bounds: Rect,
  overrides: Partial<SpacingTarget> = {},
): SpacingTarget => ({
  index,
  selector: `#t${index}`,
  bounds,
  rects: [bounds],
  undersized:
    Math.min(bounds.right - bounds.left, bounds.bottom - bounds.top) < 24,
  ...overrides,
});

// =============================================================================
// Primitives
// =============================================================================

test('rectCenter and distancePointToRect', () => {
  const rect = box(10, 10, 20, 20);
  expect(rectCenter(rect)).toEqual({ x: 20, y: 20 });
  // inside → 0
  expect(distancePointToRect({ x: 15, y: 15 }, rect)).toBe(0);
  // left of the rect
  expect(distancePointToRect({ x: 0, y: 20 }, rect)).toBe(10);
  // diagonal corner: (3,4,5) triangle
  expect(distancePointToRect({ x: 7, y: 6 }, rect)).toBe(5);
});

test('circleIntersectsRect: touching is not an intersection', () => {
  const rect = box(12, 0, 20, 20);
  expect(circleIntersectsRect({ x: 0, y: 10 }, 12, rect)).toBe(false);
  expect(circleIntersectsRect({ x: 0.5, y: 10 }, 12, rect)).toBe(true);
  // within epsilon of touching → no intersection
  expect(circleIntersectsRect({ x: 0.005, y: 10 }, 12, rect)).toBe(false);
});

test('circlesIntersect: touching is not an intersection', () => {
  expect(circlesIntersect({ x: 0, y: 0 }, { x: 24, y: 0 }, 12)).toBe(false);
  expect(circlesIntersect({ x: 0, y: 0 }, { x: 23.99, y: 0 }, 12)).toBe(false);
  expect(circlesIntersect({ x: 0, y: 0 }, { x: 23.9, y: 0 }, 12)).toBe(true);
});

// =============================================================================
// evaluateTargetSpacing
// =============================================================================

test('two 20px targets need a 4px gap (centers 24px apart)', () => {
  const a = target(0, box(0, 0, 20, 20));
  const okNeighbor = target(1, box(24, 0, 20, 20));
  const ok = evaluateTargetSpacing(a, [a, okNeighbor]);
  expect(ok.applies).toBe(true);
  expect(ok.center).toEqual({ x: 10, y: 10 });
  expect(ok.diameter).toBe(24);

  const closeNeighbor = target(1, box(22, 0, 20, 20));
  const fail = evaluateTargetSpacing(a, [a, closeNeighbor]);
  expect(fail.applies).toBe(false);
  expect(fail.intersections).toEqual([
    { selector: '#t1', kind: 'circle', distance: 22, required: 24 },
  ]);
});

test('circle vs. a large neighbor reports a target intersection', () => {
  const small = target(0, box(0, 0, 20, 20));
  // 100x40 neighbor whose left edge is 11px from the small target's center
  const large = target(1, box(21, -10, 100, 40));
  const result = evaluateTargetSpacing(small, [small, large]);
  expect(result.applies).toBe(false);
  expect(result.intersections).toEqual([
    { selector: '#t1', kind: 'target', distance: 11, required: 12 },
  ]);

  // 12px away → touching → applies
  const touching = target(1, box(22, -10, 100, 40));
  expect(evaluateTargetSpacing(small, [small, touching]).applies).toBe(true);
});

test('wide, short targets: stacked fails, side by side passes (per definition)', () => {
  const rows = [target(0, box(0, 0, 200, 20)), target(1, box(0, 20, 200, 20))];
  expect(evaluateTargetSpacing(rows[0]!, rows).applies).toBe(false);

  const cols = [target(0, box(0, 0, 200, 20)), target(1, box(200, 0, 200, 20))];
  expect(evaluateTargetSpacing(cols[0]!, cols).applies).toBe(true);
});

test('neighbor line boxes are used instead of the bounding box', () => {
  const small = target(0, box(100, 34, 20, 20));
  // A wrapped link: bounding box 0..220 × 0..40, painted as two line boxes.
  const wrapped = target(1, box(0, 0, 220, 40), {
    rects: [box(0, 0, 220, 20), box(0, 20, 10, 20)],
    undersized: false,
  });
  const result = evaluateTargetSpacing(small, [small, wrapped]);
  expect(result.applies).toBe(true);

  // Same neighbor as one solid box → its bottom edge is 4px from the center.
  const solid = target(1, box(0, 0, 220, 40), { undersized: false });
  const failing = evaluateTargetSpacing(small, [small, solid]);
  expect(failing.applies).toBe(false);
  expect(failing.intersections[0]).toMatchObject({
    kind: 'target',
    distance: 4,
  });
});

test('isSameTarget excludes related targets; intersections sort nearest first', () => {
  const a = target(0, box(0, 0, 20, 20));
  const nested = target(1, box(0, 0, 20, 20));
  const closer = target(2, box(21, 0, 20, 20)); // circle: 21px of 24
  const farther = target(3, box(-23, 0, 20, 20)); // circle: 23px of 24

  const withRelation = evaluateTargetSpacing(a, [a, nested, closer, farther], {
    isSameTarget: (_t, other) => other.index === 1,
  });
  expect(withRelation.intersections.map((i) => i.selector)).toEqual([
    '#t2',
    '#t3',
  ]);

  const without = evaluateTargetSpacing(a, [a, nested, closer, farther]);
  expect(without.intersections[0]).toMatchObject({
    selector: '#t1',
    kind: 'target',
    distance: 0,
  });
});

test('diameter option scales the circle', () => {
  const a = target(0, box(0, 0, 20, 20));
  const b = target(1, box(30, 0, 20, 20)); // centers 30px apart
  expect(evaluateTargetSpacing(a, [a, b], { diameter: 24 }).applies).toBe(true);
  expect(evaluateTargetSpacing(a, [a, b], { diameter: 44 }).applies).toBe(
    false,
  );
});

test('centerRect: a neighbor whose center can move is tested at its closest position', () => {
  const a = target(0, box(0, 0, 20, 20)); // center (10, 10)
  // An undersized neighbor swept vertically: its painted box is 40px away
  // horizontally (no rect hit), but its center may lie anywhere on
  // x=30, y∈[10, 200] — the closest is 20px away, so the circles intersect.
  const swept = target(1, box(20, 0, 20, 210), {
    undersized: true,
    centerRect: { left: 30, top: 10, right: 30, bottom: 200 },
    rects: [box(50, 0, 20, 210)],
  });
  const result = evaluateTargetSpacing(a, [a, swept]);
  expect(result.intersections).toEqual([
    { selector: '#t1', kind: 'circle', distance: 20, required: 24 },
  ]);

  // Far enough at every position → no intersection.
  const far = {
    ...swept,
    centerRect: { left: 34, top: 10, right: 34, bottom: 200 },
  };
  expect(evaluateTargetSpacing(a, [a, far]).applies).toBe(true);
});
