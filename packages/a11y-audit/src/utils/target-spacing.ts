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
  Point,
  Rect,
  TargetSpacingIntersection,
  TargetSpacingResult,
} from '../types.js';

export type {
  Point,
  Rect,
  TargetSpacingIntersection,
  TargetSpacingResult,
} from '../types.js';

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
   * bounding box itself. An empty list falls back to `bounds`.
   */
  rects: Rect[];
  /** `true` when the bounding box is less than the AA threshold in either dimension. */
  undersized: boolean;
  /**
   * Region in which this neighbor's circle center may lie, when the
   * neighbor's position relative to the subject is not fixed (e.g. a
   * `position: fixed` element swept over the scroll range). Defaults to the
   * center of `bounds`. Only read when this target is a neighbor.
   */
  centerRect?: Rect;
}

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
   * (e.g. a `<label>` and its control). Only consulted for neighbors that
   * are geometrically close enough to matter.
   */
  isSameTarget?: (target: SpacingTarget, other: SpacingTarget) => boolean;
}

export const DEFAULT_SPACING_EPSILON = 0.01;

/** Round to 2 decimals (CSS px reporting precision). */
export function roundPx(n: number): number {
  return Math.round(n * 100) / 100;
}

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

/** Whether `distance` is below `threshold`, allowing touching within `epsilon`. */
function isCloserThan(
  distance: number,
  threshold: number,
  epsilon: number,
): boolean {
  return distance < threshold - epsilon;
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
  return isCloserThan(distancePointToRect(center, rect), radius, epsilon);
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
  return isCloserThan(distanceBetweenPoints(a, b), radius * 2, epsilon);
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
    if (other.index === target.index) {
      continue;
    }

    // Cheap reject: neither a rect hit (needs < radius) nor a circle hit
    // (needs center distance < diameter) is possible beyond `diameter` from
    // the center in either axis.
    const b = other.bounds;
    if (
      b.left > center.x + diameter ||
      b.right < center.x - diameter ||
      b.top > center.y + diameter ||
      b.bottom < center.y - diameter
    ) {
      continue;
    }

    if (isSameTarget(target, other)) {
      continue;
    }

    const rects = other.rects.length > 0 ? other.rects : [other.bounds];
    let nearest = Infinity;
    for (const rect of rects) {
      nearest = Math.min(nearest, distancePointToRect(center, rect));
    }
    if (
      rects.some((rect) => circleIntersectsRect(center, radius, rect, epsilon))
    ) {
      intersections.push({
        selector: other.selector,
        kind: 'target',
        distance: roundPx(nearest),
        required: radius,
      });
      continue;
    }

    if (other.undersized) {
      // The neighbor's center is a point, or a region when it can move
      // relative to the subject (`centerRect`): the circles intersect when
      // the closest possible center is less than a diameter away.
      const centerDistance = other.centerRect
        ? distancePointToRect(center, other.centerRect)
        : distanceBetweenPoints(center, rectCenter(other.bounds));
      if (isCloserThan(centerDistance, diameter, epsilon)) {
        intersections.push({
          selector: other.selector,
          kind: 'circle',
          distance: roundPx(centerDistance),
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
    center: { x: roundPx(center.x), y: roundPx(center.y) },
    applies: intersections.length === 0,
    intersections,
  };
}

/**
 * One-line, human-readable description of a spacing result, shared by the
 * console output, `exceptionDetails`, and the normalized failure summary.
 *
 * - applies: `no other target within a 24px circle centered on the target`
 * - fails:   `a 24px circle centered on the target intersects the circle of
 *             undersized target #b (22px, requires 24px) (+1 more)`
 */
export function describeTargetSpacing(spacing: TargetSpacingResult): string {
  const nearest = spacing.intersections[0];
  if (!nearest) {
    return `no other target within a ${spacing.diameter}px circle centered on the target`;
  }
  const what =
    nearest.kind === 'circle'
      ? `the circle of undersized target ${nearest.selector}`
      : `target ${nearest.selector}`;
  const more =
    spacing.intersections.length > 1
      ? ` (+${spacing.intersections.length - 1} more)`
      : '';
  return (
    `a ${spacing.diameter}px circle centered on the target intersects ${what} ` +
    `(${nearest.distance}px, requires ${nearest.required}px)${more}`
  );
}
