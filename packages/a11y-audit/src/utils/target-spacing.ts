/**
 * Geometry for the WCAG 2.5.8 "spacing" exception.
 *
 * Definition (SC 2.5.8 Target Size (Minimum), exception "Spacing"):
 *
 * > Undersized targets (those less than 24 by 24 CSS pixels) are positioned
 * > so that if a 24 CSS pixel diameter circle is centered on the bounding box
 * > of each, the circles do not intersect another target or the circle for
 * > another undersized target.
 *
 * This module is pure (no DOM) so it can be unit-tested in isolation. The
 * runner collects rectangles in the browser and calls `evaluateTargetSpacing`
 * in Node.
 */

import type {
  TargetSpacingIntersection,
  TargetSpacingResult,
} from '../types.js';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

/** One target as seen by the spacing evaluation. */
export interface SpacingTarget {
  /** Stable identifier (index into the collected target list). */
  index: number;
  /** CSS selector, echoed into intersection reports. */
  selector: string;
  /** Bounding box; the circle is centered on it. */
  bounds: Rect;
  /**
   * Painted rectangles used when this target is a *neighbor*. For a wrapped
   * inline link these are the per-line boxes; for a block element it is the
   * bounding box itself.
   */
  rects: Rect[];
  /** `true` when the bounding box is less than the AA threshold in either dimension. */
  undersized: boolean;
}

export type {
  TargetSpacingIntersection,
  TargetSpacingResult,
} from '../types.js';

export interface EvaluateTargetSpacingOptions {
  /** Circle diameter in CSS px (default 24). */
  diameter?: number;
  /**
   * Tolerance for floating point noise. Distances within `epsilon` of the
   * threshold count as *not* intersecting (touching is allowed).
   */
  epsilon?: number;
  /**
   * Returns `true` when `other` must not be treated as a separate target
   * (ancestor/descendant, or a `<label>` and its control).
   */
  isSameTarget?: (target: SpacingTarget, other: SpacingTarget) => boolean;
}

export const DEFAULT_SPACING_EPSILON = 0.01;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Center of a rectangle. */
export function rectCenter(rect: Rect): Point {
  return {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  };
}

/** Distance from a point to the nearest point of a rectangle (0 when inside). */
export function distancePointToRect(point: Point, rect: Rect): number {
  const nearestX = Math.min(Math.max(point.x, rect.left), rect.right);
  const nearestY = Math.min(Math.max(point.y, rect.top), rect.bottom);
  return Math.hypot(point.x - nearestX, point.y - nearestY);
}

/** Distance between two points. */
export function distanceBetweenPoints(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Whether a circle intersects a rectangle. Touching (distance equal to the
 * radius, within `epsilon`) is not an intersection.
 */
export function circleIntersectsRect(
  center: Point,
  radius: number,
  rect: Rect,
  epsilon = DEFAULT_SPACING_EPSILON,
): boolean {
  return distancePointToRect(center, rect) < radius - epsilon;
}

/**
 * Whether two circles of equal `radius` intersect. Touching is not an
 * intersection.
 */
export function circlesIntersect(
  a: Point,
  b: Point,
  radius: number,
  epsilon = DEFAULT_SPACING_EPSILON,
): boolean {
  return distanceBetweenPoints(a, b) < radius * 2 - epsilon;
}

/**
 * Evaluate the spacing exception for one undersized target against every
 * other target on the page.
 *
 * For each neighbor (skipping those `isSameTarget` rules out):
 * 1. If the target's circle intersects any of the neighbor's painted rects,
 *    report a `target` intersection.
 * 2. Otherwise, if the neighbor is undersized and the two circles intersect,
 *    report a `circle` intersection.
 */
export function evaluateTargetSpacing(
  target: SpacingTarget,
  others: readonly SpacingTarget[],
  options: EvaluateTargetSpacingOptions = {},
): TargetSpacingResult {
  const {
    diameter = 24,
    epsilon = DEFAULT_SPACING_EPSILON,
    isSameTarget = () => false,
  } = options;
  const radius = diameter / 2;
  const center = rectCenter(target.bounds);
  const intersections: TargetSpacingIntersection[] = [];

  for (const other of others) {
    if (other.index === target.index || isSameTarget(target, other)) {
      continue;
    }

    const rects = other.rects.length > 0 ? other.rects : [other.bounds];
    let nearest = Infinity;
    for (const rect of rects) {
      nearest = Math.min(nearest, distancePointToRect(center, rect));
    }
    if (nearest < radius - epsilon) {
      intersections.push({
        selector: other.selector,
        kind: 'target',
        distance: round2(nearest),
        required: radius,
      });
      continue;
    }

    if (other.undersized) {
      const otherCenter = rectCenter(other.bounds);
      const centerDistance = distanceBetweenPoints(center, otherCenter);
      if (centerDistance < diameter - epsilon) {
        intersections.push({
          selector: other.selector,
          kind: 'circle',
          distance: round2(centerDistance),
          required: diameter,
        });
      }
    }
  }

  intersections.sort(
    (a, b) => a.distance / a.required - b.distance / b.required,
  );

  return {
    diameter,
    center: { x: round2(center.x), y: round2(center.y) },
    applies: intersections.length === 0,
    intersections,
  };
}
