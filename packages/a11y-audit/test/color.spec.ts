/**
 * Unit tests for the color utilities (WCAG 1.4.11 / future 2.4.13). Pure
 * functions — no browser needed.
 */

import { test, expect } from '@playwright/test';
import {
  WHITE,
  compositeLayers,
  compositeOver,
  contrastRatio,
  floorRatio,
  relativeLuminance,
  toHexColor,
} from '../dist/index.js';

const BLACK = { r: 0, g: 0, b: 0 };
const GRAY_767676 = { r: 0x76, g: 0x76, b: 0x76 };
const GRAY_CCCCCC = { r: 0xcc, g: 0xcc, b: 0xcc };

test.describe('color utilities', () => {
  test('黒と白の比は 21 になる', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 10);
  });

  test('同じ色どうしの比は 1 になる', () => {
    expect(contrastRatio(GRAY_767676, GRAY_767676)).toBe(1);
  });

  test('引数の順を入れ替えても比は同じになる', () => {
    expect(contrastRatio(GRAY_767676, WHITE)).toBe(
      contrastRatio(WHITE, GRAY_767676),
    );
  });

  test('#767676 と白の比は 4.54 以上 4.55 未満になる', () => {
    const ratio = contrastRatio(GRAY_767676, WHITE);
    expect(ratio).toBeGreaterThanOrEqual(4.54);
    expect(ratio).toBeLessThan(4.55);
  });

  test('#cccccc と白の比を floorRatio すると 1.6 になる', () => {
    expect(floorRatio(contrastRatio(GRAY_CCCCCC, WHITE))).toBe(1.6);
  });

  test('floorRatio(2.996) は 3 に切り上げず 2.99 になる', () => {
    expect(floorRatio(2.996)).toBe(2.99);
  });

  test('相対輝度は黒で 0、白で 1 になる', () => {
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 10);
  });

  test('黒 50% を白の上に重ねると各チャンネルは 127.5 になる', () => {
    const result = compositeOver({ r: 0, g: 0, b: 0, a: 0.5 }, WHITE);
    expect(result).toEqual({ r: 127.5, g: 127.5, b: 127.5 });
  });

  test('複数の層は遠い層を先に塗って合成する', () => {
    // 近い順: 白 50%、黒 50%。黒 50% を白に塗る → 127.5、その上に白 50% → 191.25
    const result = compositeLayers(
      [
        { r: 255, g: 255, b: 255, a: 0.5 },
        { r: 0, g: 0, b: 0, a: 0.5 },
      ],
      WHITE,
    );
    expect(result).toEqual({ r: 191.25, g: 191.25, b: 191.25 });
  });

  test('層が空なら土台の色をそのまま返す', () => {
    expect(compositeLayers([], WHITE)).toEqual(WHITE);
  });

  test('toHexColor はチャンネルを丸めて #rrggbb にする', () => {
    expect(toHexColor({ r: 127.5, g: 0, b: 255.4 })).toBe('#8000ff');
  });
});
