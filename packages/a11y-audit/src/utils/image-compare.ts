/**
 * Image comparison utilities using pixelmatch.
 *
 * NOTE: `pixelmatch` and `pngjs` are optional peer/runtime deps (only the
 * auto-play check needs them). This module top-level imports them, so it must
 * only be loaded via a dynamic `import()` (`runAutoPlayDetection`, and
 * `runFocusIndicatorCheck` when `screenshotDiff` is on) — never statically
 * from the package barrel. That keeps the other checks usable when
 * the optional deps are absent.
 */

import * as fs from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import type { FocusVisualDiff, ImageDiffResult, PageRect } from '../types.js';
import { PIXELMATCH_THRESHOLD } from '../constants.js';

/**
 * Compare two PNG images using pixel-level diff.
 *
 * @returns Diff statistics
 */
export function compareImages(
  img1Path: string,
  img2Path: string,
  diffOutputPath: string,
): ImageDiffResult {
  const img1 = PNG.sync.read(fs.readFileSync(img1Path));
  const img2 = PNG.sync.read(fs.readFileSync(img2Path));

  const { width, height } = img1;
  const totalPixels = width * height;

  const diff = new PNG({ width, height });

  const diffPixels = pixelmatch(
    img1.data,
    img2.data,
    diff.data,
    width,
    height,
    {
      threshold: PIXELMATCH_THRESHOLD,
    },
  );

  fs.writeFileSync(diffOutputPath, PNG.sync.write(diff));

  const diffPercent = (diffPixels / totalPixels) * 100;

  return { diffPixels, totalPixels, diffPercent };
}

/**
 * Compare a full-page baseline PNG with a PNG of one region of the same page.
 *
 * @param baseline Full-page PNG (CSS-pixel scale)
 * @param region PNG of the area `clip` (page coordinates, integers)
 * @returns Share of changed pixels and their bounding box in page coordinates
 * @throws if `region` does not have the size of `clip`
 */
export function compareRegionToBaseline(
  baseline: Buffer,
  region: Buffer,
  clip: PageRect,
): FocusVisualDiff {
  const base = PNG.sync.read(baseline);
  const focused = PNG.sync.read(region);
  const { width, height } = clip;
  if (focused.width !== width || focused.height !== height) {
    throw new Error(
      `Region is ${focused.width}x${focused.height}, expected ${width}x${height}`,
    );
  }

  const cropped = new PNG({ width, height });
  PNG.bitblt(base, cropped, clip.x, clip.y, width, height, 0, 0);

  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(
    cropped.data,
    focused.data,
    diff.data,
    width,
    height,
    { threshold: PIXELMATCH_THRESHOLD },
  );
  if (diffPixels === 0) return { diffRatio: 0, rect: null };

  // pixelmatch paints differing pixels pure red and leaves the rest gray/yellow.
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (
        diff.data[i] === 255 &&
        diff.data[i + 1] === 0 &&
        diff.data[i + 2] === 0
      ) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return {
    diffRatio: diffPixels / (width * height),
    rect: {
      x: clip.x + minX,
      y: clip.y + minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    },
  };
}

/** Format diff percentage as string with 3 decimal places */
export function formatDiffPercent(diffPercent: number): string {
  return diffPercent.toFixed(3) + '%';
}

/** Check if change is significant based on threshold */
export function hasSignificantChange(
  diffPercent: number,
  threshold: number,
): boolean {
  return diffPercent > threshold;
}

/** Ensure output directory exists */
export function ensureOutputDir(outputDir: string): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
}
