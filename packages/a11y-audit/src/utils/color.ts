/**
 * Color math for contrast checks (WCAG 1.4.11, and later 2.4.13).
 *
 * Channels are sRGB numbers in 0–255, so a computed-style color and a pngjs
 * pixel (`data[i], data[i + 1], data[i + 2]`) can both be passed as-is.
 */

/** An sRGB color with 0–255 channels (fractions allowed after compositing). */
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/** RgbColor with alpha 0–1. */
export interface RgbaColor extends RgbColor {
  a: number;
}

/** The page base color when nothing opaque is painted. */
export const WHITE: RgbColor = { r: 255, g: 255, b: 255 };

/** Paint `top` over an opaque `bottom` (source-over). */
export function compositeOver(top: RgbaColor, bottom: RgbColor): RgbColor {
  return {
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
  };
}

/**
 * Paint `layers` (nearest first) over `base`: the farthest layer is painted
 * first. Returns `base` when `layers` is empty.
 */
export function compositeLayers(
  layers: readonly RgbaColor[],
  base: RgbColor,
): RgbColor {
  return layers.reduceRight<RgbColor>(
    (below, layer) => compositeOver(layer, below),
    base,
  );
}

/** WCAG 2.x relative luminance (sRGB, linearization threshold 0.04045). */
export function relativeLuminance(c: RgbColor): number {
  const linear = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
}

/** WCAG 2.x contrast ratio, 1–21, not rounded. Order of arguments does not matter. */
export function contrastRatio(a: RgbColor, b: RgbColor): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Round a ratio DOWN to 2 decimals for display (2.996 → 2.99, never 3.00). */
export function floorRatio(ratio: number): number {
  // The epsilon absorbs float error such as 4.5 * 100 = 449.99999999999994.
  return Math.floor(ratio * 100 + 1e-9) / 100;
}

/** '#rrggbb' (channels rounded and clamped to 0–255). */
export function toHexColor(c: RgbColor): string {
  const hex = (v: number): string =>
    Math.min(255, Math.max(0, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
}
