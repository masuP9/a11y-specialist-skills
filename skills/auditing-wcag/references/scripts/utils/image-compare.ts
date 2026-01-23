/**
 * Image comparison utilities using pixelmatch
 */

import * as fs from 'fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import type { ImageDiffResult } from '../types';
import { PIXELMATCH_THRESHOLD } from '../constants';

/**
 * Compare two PNG images using pixel-level diff
 * @param img1Path - Path to first image
 * @param img2Path - Path to second image
 * @param diffOutputPath - Path to save diff image
 * @returns Diff statistics
 */
export function compareImages(
  img1Path: string,
  img2Path: string,
  diffOutputPath: string
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
    { threshold: PIXELMATCH_THRESHOLD }
  );

  fs.writeFileSync(diffOutputPath, PNG.sync.write(diff));

  const diffPercent = (diffPixels / totalPixels) * 100;

  return { diffPixels, totalPixels, diffPercent };
}

/**
 * Format diff percentage as string with 3 decimal places
 */
export function formatDiffPercent(diffPercent: number): string {
  return diffPercent.toFixed(3) + '%';
}

/**
 * Check if change is significant based on threshold
 */
export function hasSignificantChange(diffPercent: number, threshold: number): boolean {
  return diffPercent > threshold;
}

/**
 * Ensure output directory exists
 */
export function ensureOutputDir(outputDir: string): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
}

/**
 * Save JSON result to file
 */
export function saveJsonResult(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
