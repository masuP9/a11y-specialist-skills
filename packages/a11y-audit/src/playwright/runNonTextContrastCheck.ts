/**
 * Non-text Contrast Check — WCAG 1.4.11 (Non-text Contrast)
 *
 * Measures, from computed styles, the contrast of
 * - the boundary (border or fill) of inputs, checkboxes, radio buttons and
 *   switches against the color around them, and
 * - the icon (inline SVG shapes, icon-font `::before` / `::after` text) of
 *   icon-only buttons against the color behind it,
 * and reports what is below 3:1 as candidates. Everything is `incomplete`.
 * When a color cannot be decided (background image, gradient, opacity,
 * filters, positioned over non-ancestors, SVG paint servers, images, ...) the
 * component is reported as undetermined instead of passing.
 *
 * The page is read with one `page.evaluate`; computed colors are converted to
 * sRGB by painting them on a detached 1x1 canvas (so `oklch()`, `color-mix()`
 * and friends work without a Node-side parser). The caller is responsible for
 * navigating the page first. No events are sent and the page is not modified.
 *
 * Limitations:
 * - Only the look at load time is seen (no hover, focus, checked or error
 *   states). A component that has focus when the check runs is measured with
 *   its focus look.
 * - The outer color comes from the ancestors' backgrounds. Overlaps by
 *   non-ancestors (z-index, negative margins, transforms) are not seen; only
 *   walking through a background-less absolute / fixed element stops with
 *   `out-of-flow`.
 * - Borders drawn with `box-shadow`, `outline`, `border-image` or pseudo
 *   elements are not measured (`otherVisuals` records that they exist).
 *   `inset` / `outset` borders count as the single computed border color.
 * - Native checkboxes and radio buttons drawn by the browser (`user-agent`) are
 *   not measured; with `accent-color` they are `undetermined`. Default inputs
 *   and selects are measured with their computed border color.
 * - Icons: SVG `fill` / `stroke` and pseudo element text color only. Image or
 *   CSS background-image icons are `undetermined`; so are icons with parts both
 *   above and below 3:1, and SVGs whose shapes are drawn over filled shapes.
 *   Icon parts that are not drawn (display:none, hidden) are ignored, and
 *   visually hidden (sr-only) text does not stop a button from counting as an
 *   icon button. A `<use>` whose target sets its own fill / stroke, or points
 *   outside the document, is `svg-use`; an icon with no readable color is
 *   `no-icon-color`.
 * - Controls hidden with opacity or sr-only CSS (including native checkboxes
 *   behind a custom box) are `undetermined` (`opacity` / `visually-hidden`).
 * - `color-scheme: light dark` follows the browser's color scheme preference.
 * - Parts inside a component (check mark, switch knob) are not compared.
 * - Main document light DOM only (no iframes or shadow roots); at most
 *   NON_TEXT_CONTRAST_MAX_COMPONENTS components are measured (the rest are
 *   counted in `componentCounts` and reported for manual review).
 * - Charts and other non-component graphics are not examined.
 */

import type { Page } from '@playwright/test';
import type {
  NonTextContrastCheckDetails,
  NonTextContrastCheckResult,
  NonTextContrastComponent,
  NonTextContrastComponentKind,
  NonTextContrastIndicator,
  NonTextContrastUndeterminedReason,
} from '../types.js';
import {
  DEFAULT_NON_TEXT_CONTRAST_RESULT_FILE,
  HTML_SNIPPET_MAX_LENGTH,
  NON_TEXT_CONTRAST_MAX_COMPONENTS,
  NON_TEXT_CONTRAST_MAX_ICON_PARTS,
  NON_TEXT_CONTRAST_MIN_RATIO,
  NON_TEXT_CONTRAST_SELECTOR,
  NON_TEXT_CONTRAST_TEXT_INPUT_TYPES,
} from '../constants.js';
import {
  buildAuditResult,
  normalizeNonTextContrastCheck,
} from '../utils/axe-format.js';
import {
  WHITE,
  compositeLayers,
  compositeOver,
  contrastRatio,
  floorRatio,
  toHexColor,
  type RgbColor,
} from '../utils/color.js';
import {
  createAuditOutput,
  type AuditOutputOptions,
} from '../utils/test-harness.js';

export interface RunNonTextContrastCheckOptions extends AuditOutputOptions {
  /** A page already navigated to the target URL. */
  page: Page;
}

// =============================================================================
// Raw data collected in the page
// =============================================================================

type Reason = NonTextContrastUndeterminedReason;

interface RawRgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Background layers (nearest first) behind a point, or why they are unknown. */
interface RawLayers {
  layers: RawRgba[];
  blockedBy: Reason | null;
  /**
   * The part of `blockedBy` that comes from opacity / filter on an ancestor
   * (not from the background layers). Set by `layersFrom` only.
   */
  effectBlockedBy?: Reason | null;
}

interface RawBorder {
  side: 'top' | 'right' | 'bottom' | 'left';
  width: number;
  style: string;
  color: RawRgba;
}

interface RawBoundary {
  /** Why the component's own look cannot be decided (own image / opacity / filter). */
  selfBlockedBy: Reason | null;
  outer: RawLayers;
  background: RawRgba;
  backgroundClip: string;
  borders: RawBorder[];
  appearance: string;
  accentColor: string;
  /** Hidden the sr-only way (1px box or clipped). */
  visuallyHidden: boolean;
  isInput: boolean;
  boxShadow: boolean;
  outline: boolean;
}

interface RawIconColor {
  color: RawRgba;
  /** The paint is a gradient / pattern (`url(...)`), so `color` is meaningless. */
  paintServer: boolean;
  bg: RawLayers;
}

interface RawIcon {
  tooMany: boolean;
  hasImage: boolean;
  overlap: boolean;
  /** A `<use>` whose target sets its own colors (or cannot be resolved). */
  svgUse: boolean;
  colors: RawIconColor[];
}

interface RawComponent {
  selector: string;
  html: string;
  htmlTruncated: boolean;
  kind: NonTextContrastComponentKind;
  boundary: RawBoundary | null;
  icon: RawIcon | null;
}

interface ScanArgs {
  selector: string;
  textInputTypes: readonly string[];
  maxComponents: number;
  maxIconParts: number;
  htmlSnippetMaxLength: number;
}

interface ScanResult {
  components: RawComponent[];
  componentCounts: NonTextContrastCheckDetails['componentCounts'];
}

/**
 * Serialized and run in the page, so it cannot use imports: `scopeSelector`,
 * `safeOuterHTML` and `isVisible` are copied from runPointerGestureCheck.ts on
 * purpose.
 */
function scanNonTextContrast(args: ScanArgs): ScanResult {
  const {
    selector,
    textInputTypes,
    maxComponents,
    maxIconParts,
    htmlSnippetMaxLength,
  } = args;

  // A detached canvas turns any CSS color (oklch(), color-mix(), ...) into sRGB.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d canvas is not available');
  function toRgba(css: string): RawRgba {
    ctx!.clearRect(0, 0, 1, 1);
    ctx!.fillStyle = '#000';
    ctx!.fillStyle = css;
    ctx!.fillRect(0, 0, 1, 1);
    const data = ctx!.getImageData(0, 0, 1, 1).data;
    return { r: data[0]!, g: data[1]!, b: data[2]!, a: data[3]! / 255 };
  }

  function scopeSelector(element: Element): string {
    const scope = element.getRootNode() as Document | ShadowRoot;
    if (
      element.id &&
      scope.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1
    ) {
      return `#${CSS.escape(element.id)}`;
    }
    if (element === document.documentElement) return 'html';
    if (element === document.body) return 'body';
    const path: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.body) {
      let part = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      const siblings = parent ? parent.children : scope.children;
      part += `:nth-child(${Array.from(siblings).indexOf(current) + 1})`;
      path.unshift(part);
      current = parent;
    }
    return (current ? ['body', ...path] : path).join(' > ');
  }

  function safeOuterHTML(element: Element): {
    html: string;
    htmlTruncated: boolean;
  } {
    const html = element.outerHTML || `<${element.tagName.toLowerCase()}>`;
    return html.length > htmlSnippetMaxLength
      ? { html: html.slice(0, htmlSnippetMaxLength), htmlTruncated: true }
      : { html, htmlTruncated: false };
  }

  function isVisible(element: Element): boolean {
    return (
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== 'hidden'
    );
  }

  /**
   * opacity / filter / mix-blend-mode act on the whole subtree. backdrop-filter
   * only changes what is behind the element, so callers pass
   * `withBackdrop = false` once an opaque layer has been found below it.
   */
  function effectOf(
    cs: CSSStyleDeclaration,
    withBackdrop = true,
  ): Reason | null {
    if (Number(cs.opacity) < 1) return 'opacity';
    if (
      cs.filter !== 'none' ||
      (withBackdrop && cs.getPropertyValue('backdrop-filter') !== 'none') ||
      cs.getPropertyValue('mix-blend-mode') !== 'normal'
    ) {
      return 'filter';
    }
    return null;
  }

  // Whether the canvas behind the page is dark. <meta name="color-scheme"> does
  // not show in the computed style. `light dark` follows the user preference.
  const rootScheme = getComputedStyle(document.documentElement)
    .getPropertyValue('color-scheme')
    .toLowerCase();
  const scheme =
    rootScheme === 'normal' || rootScheme === ''
      ? (
          document
            .querySelector('meta[name="color-scheme"]')
            ?.getAttribute('content') ?? ''
        ).toLowerCase()
      : rootScheme;
  const schemeHasDark = /\bdark\b/.test(scheme);
  const rootIsDark =
    schemeHasDark &&
    (!/\blight\b/.test(scheme) ||
      matchMedia('(prefers-color-scheme: dark)').matches);

  /** Rendered (has a box, not hidden); falls back where checkVisibility is missing. */
  function isRendered(node: Element): boolean {
    const probe = node as Element & {
      checkVisibility?: (options?: object) => boolean;
    };
    if (probe.checkVisibility) {
      return probe.checkVisibility({
        checkVisibilityCSS: true,
        visibilityProperty: true,
      });
    }
    return (
      node.getClientRects().length > 0 &&
      getComputedStyle(node).visibility !== 'hidden'
    );
  }

  /** sr-only style hiding: a box of 1px or less, or clipped away. */
  function isVisuallyHiddenBox(el: Element, checkSize = true): boolean {
    const box = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return (
      (checkSize && (box.width <= 1 || box.height <= 1)) ||
      cs.clip !== 'auto' ||
      cs.clipPath !== 'none'
    );
  }

  /** Text a sighted user can see: not display:none, hidden or sr-only clipped. */
  function hasVisibleText(el: Element): boolean {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!(t.textContent ?? '').trim()) continue;
      const parent = t.parentElement;
      if (parent && getComputedStyle(parent).visibility === 'hidden') continue;
      // Transparent text color: the glyphs are not painted.
      if (parent && toRgba(getComputedStyle(parent).color).a === 0) continue;
      let hidden = false;
      for (let n = parent; n && n !== el; n = n.parentElement) {
        if (Number(getComputedStyle(n).opacity) === 0) {
          hidden = true;
          break;
        }
        // A display: contents wrapper has no box of its own; only box-free
        // checks (clip, clip-path, opacity, visibility) apply to it.
        const contents = getComputedStyle(n).display === 'contents';
        const noBox = !contents && n.getClientRects().length === 0;
        if (noBox || isVisuallyHiddenBox(n, !contents)) {
          hidden = true;
          break;
        }
      }
      if (!hidden) return true;
    }
    return false;
  }

  /**
   * Walk up to the root. Effects are checked on every ancestor; background
   * layers are collected only until the first opaque one.
   */
  function layersFrom(start: Element | null, startOpaque = false): RawLayers {
    const layers: RawRgba[] = [];
    let opaque = startOpaque;
    let layerBlock: Reason | null = null;
    let effectBlock: Reason | null = null;
    for (let el = start; el; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (!opaque && layerBlock === null) {
        if (cs.backgroundImage !== 'none') {
          layerBlock = 'background-image';
        } else {
          const c = toRgba(cs.backgroundColor);
          if (c.a > 0) layers.push(c);
          if (c.a === 1) opaque = true;
          else if (cs.position === 'absolute' || cs.position === 'fixed') {
            layerBlock = 'out-of-flow';
          }
        }
      }
      effectBlock ??= effectOf(cs, !opaque);
    }
    if (!opaque && layerBlock === null && rootIsDark) {
      layerBlock = 'color-scheme';
    }
    return {
      layers,
      blockedBy: effectBlock ?? layerBlock,
      effectBlockedBy: effectBlock,
    };
  }

  const SHAPES = new Set([
    'path',
    'circle',
    'rect',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'text',
    'use',
  ]);

  /**
   * Whether the shapes a `<use>` points to choose their own fill / stroke (so the
   * `<use>` element's inherited paint is not what is drawn). An external or
   * unresolvable target counts as yes.
   */
  function useSetsOwnColors(use: Element): boolean {
    const href = use.getAttribute('href') ?? use.getAttribute('xlink:href');
    if (!href || !href.startsWith('#')) return true;
    const target = use.ownerDocument.getElementById(href.slice(1));
    if (!target) return true;
    // Two signals, either is enough: (a) the computed paint differs from the
    // parent's (stylesheet rules), (b) a fill / stroke attribute or inline
    // declaration exists, even when its value equals the parent's. currentColor
    // follows the <use>'s color, which is what is measured, so it counts as
    // inherited.
    const inheritsPaint = (value: string): boolean =>
      /^(currentcolor|inherit)$/i.test(value.trim());
    return [target, ...Array.from(target.querySelectorAll('*'))].some((el) => {
      for (const name of ['fill', 'stroke']) {
        const attr = el.getAttribute(name);
        if (attr !== null && !inheritsPaint(attr)) return true;
      }
      for (const m of (el.getAttribute('style') ?? '').matchAll(
        /(?:^|[;\s])(?:fill|stroke)\s*:\s*([^;]+)/gi,
      )) {
        if (!inheritsPaint(m[1]!)) return true;
      }
      const parent = el.parentElement;
      if (!parent) return false;
      const own = getComputedStyle(el);
      const inherited = getComputedStyle(parent);
      return own.fill !== inherited.fill || own.stroke !== inherited.stroke;
    });
  }

  /**
   * Icon sources of a button (itself and its descendants). With `existsOnly`
   * it stops at the first source and collects no colors.
   */
  function scanIcon(
    button: Element,
    existsOnly: boolean,
  ): { exists: boolean; icon: RawIcon } {
    const elements = [button, ...Array.from(button.querySelectorAll('*'))];
    const tooMany = elements.length > maxIconParts;
    const collect = !existsOnly && !tooMany;
    const icon: RawIcon = {
      tooMany,
      hasImage: false,
      overlap: false,
      svgUse: false,
      colors: [],
    };
    let exists = false;
    const shapes: {
      svg: Element | null;
      filled: boolean;
      rect: { left: number; right: number; top: number; bottom: number };
    }[] = [];

    for (const node of elements) {
      // Parts that are not drawn (display:none ancestor, hidden) are not icon sources.
      if (!isRendered(node)) continue;
      const tag = node.tagName.toLowerCase();
      const cs = getComputedStyle(node);
      if (tag === 'svg') exists = true;
      if (
        tag === 'img' ||
        tag === 'image' ||
        (tag === 'input' && (node as HTMLInputElement).type === 'image') ||
        cs.backgroundImage !== 'none'
      ) {
        exists = true;
        icon.hasImage = true;
      }

      for (const pseudo of ['::before', '::after']) {
        const pcs = getComputedStyle(node, pseudo);
        const content = pcs.content;
        if (
          pcs.display === 'none' ||
          pcs.visibility !== 'visible' ||
          content === 'none' ||
          content === 'normal'
        ) {
          continue;
        }
        // A generated box with a CSS image (even with empty content) is an image icon.
        if (
          pcs.backgroundImage !== 'none' ||
          /^(url|image-set|-webkit-image-set)\(/.test(content)
        ) {
          exists = true;
          icon.hasImage = true;
          continue;
        }
        // Only a text glyph has a color to read.
        if (content === '""' || content === "''") continue;
        exists = true;
        if (!collect) continue;
        const bgc = toRgba(pcs.backgroundColor);
        const base = layersFrom(node, bgc.a === 1);
        icon.colors.push({
          color: toRgba(pcs.color),
          paintServer: false,
          bg: {
            layers: bgc.a > 0 ? [bgc, ...base.layers] : base.layers,
            // A positioned glyph may be drawn outside its owner, over unknown content.
            blockedBy:
              effectOf(pcs) ??
              ((pcs.position === 'absolute' || pcs.position === 'fixed') &&
              bgc.a < 1
                ? 'out-of-flow'
                : null) ??
              base.blockedBy,
          },
        });
      }

      if (existsOnly && exists) return { exists, icon };

      if (
        !collect ||
        !SHAPES.has(tag) ||
        !(node instanceof SVGElement) ||
        node.closest('defs, clipPath, mask, pattern, marker, symbol') ||
        cs.display === 'none' ||
        cs.visibility === 'hidden'
      ) {
        continue;
      }
      if (tag === 'use' && useSetsOwnColors(node)) {
        icon.svgUse = true;
        continue;
      }
      const bgBase = layersFrom(node.parentElement);
      const bg: RawLayers = {
        layers: bgBase.layers,
        blockedBy: effectOf(cs) ?? bgBase.blockedBy,
      };
      let filled = false;
      let stroked = false;
      if (tag !== 'line' && cs.fill !== 'none') {
        if (cs.fill.startsWith('url(')) {
          icon.colors.push({
            color: { r: 0, g: 0, b: 0, a: 1 },
            paintServer: true,
            bg,
          });
          filled = true;
        } else {
          const c = toRgba(cs.fill);
          c.a *= Number(cs.fillOpacity);
          if (c.a > 0) {
            icon.colors.push({ color: c, paintServer: false, bg });
            filled = true;
          }
        }
      }
      const strokeWidth = parseFloat(cs.strokeWidth) || 0;
      if (cs.stroke !== 'none' && strokeWidth > 0) {
        if (cs.stroke.startsWith('url(')) {
          icon.colors.push({
            color: { r: 0, g: 0, b: 0, a: 1 },
            paintServer: true,
            bg,
          });
          stroked = true;
        } else {
          const c = toRgba(cs.stroke);
          c.a *= Number(cs.strokeOpacity);
          if (c.a > 0) {
            icon.colors.push({ color: c, paintServer: false, bg });
            stroked = true;
          }
        }
      }
      if (!filled && !stroked) continue;
      const box = node.getBoundingClientRect();
      const svg = node.ownerSVGElement;
      const half = stroked
        ? (strokeWidth * (svg?.getScreenCTM()?.a ?? 1)) / 2
        : 0;
      shapes.push({
        svg,
        filled,
        rect: {
          left: box.left - half,
          right: box.right + half,
          top: box.top - half,
          bottom: box.bottom + half,
        },
      });
    }

    // A shape drawn over an earlier filled shape of the same SVG may sit on a
    // background that is not an ancestor's. Closed intervals: touching counts.
    shapes.forEach((later, j) => {
      for (let i = 0; i < j; i++) {
        const earlier = shapes[i]!;
        if (
          earlier.filled &&
          earlier.svg === later.svg &&
          earlier.rect.left <= later.rect.right &&
          later.rect.left <= earlier.rect.right &&
          earlier.rect.top <= later.rect.bottom &&
          later.rect.top <= earlier.rect.bottom
        ) {
          icon.overlap = true;
        }
      }
    });
    return { exists, icon };
  }

  function roleOf(el: Element): string {
    return (el.getAttribute('role') ?? '')
      .trim()
      .split(/\s+/)[0]!
      .toLowerCase();
  }

  /** First matching kind, in the order of the design table. */
  function kindOf(el: Element): NonTextContrastComponentKind | null {
    const tag = el.tagName.toLowerCase();
    const role = roleOf(el);
    const inputType = tag === 'input' ? (el as HTMLInputElement).type : '';
    if (role === 'switch') return 'switch';
    if (inputType === 'checkbox' || role === 'checkbox') return 'checkbox';
    if (inputType === 'radio' || role === 'radio') return 'radio';
    if (
      tag === 'textarea' ||
      tag === 'select' ||
      (tag === 'input' && textInputTypes.includes(inputType)) ||
      role === 'textbox' ||
      role === 'searchbox' ||
      role === 'combobox'
    ) {
      return 'text-input';
    }
    if (
      (tag === 'button' || role === 'button') &&
      !hasVisibleText(el) &&
      scanIcon(el, true).exists
    ) {
      return 'icon-button';
    }
    return null;
  }

  function collectBoundary(el: Element): RawBoundary {
    const cs = getComputedStyle(el);
    const borders = (['top', 'right', 'bottom', 'left'] as const).map(
      (side): RawBorder => ({
        side,
        width: parseFloat(cs.getPropertyValue(`border-${side}-width`)) || 0,
        style: cs.getPropertyValue(`border-${side}-style`),
        color: toRgba(cs.getPropertyValue(`border-${side}-color`)),
      }),
    );
    const background = toRgba(cs.backgroundColor);
    const outer = layersFrom(el.parentElement);
    // The outer walk starts at the parent, so a positioned component itself may
    // sit over non-ancestor content. Only the layer side is marked: a native
    // control still ignores the outer color.
    if (
      (cs.position === 'absolute' || cs.position === 'fixed') &&
      background.a < 1 &&
      outer.blockedBy === null
    ) {
      outer.blockedBy = 'out-of-flow';
    }
    return {
      selfBlockedBy:
        cs.backgroundImage !== 'none' ? 'background-image' : effectOf(cs),
      outer,
      background,
      backgroundClip: cs.backgroundClip,
      borders,
      appearance: cs.getPropertyValue('appearance'),
      accentColor: cs.getPropertyValue('accent-color'),
      visuallyHidden: isVisuallyHiddenBox(el),
      isInput: el.tagName === 'INPUT',
      boxShadow: cs.boxShadow !== 'none',
      outline: cs.outlineStyle !== 'none',
    };
  }

  const components: RawComponent[] = [];
  const componentCounts: ScanResult['componentCounts'] = {
    boundary: { found: 0, kept: 0 },
    icon: { found: 0, kept: 0 },
  };
  for (const el of Array.from(document.querySelectorAll(selector))) {
    if (
      el.matches(':disabled') ||
      el.closest('[aria-disabled="true"]') ||
      el.closest('[inert]') ||
      !isVisible(el)
    ) {
      continue;
    }
    const kind = kindOf(el);
    if (kind === null) continue;
    const counts =
      kind === 'icon-button' ? componentCounts.icon : componentCounts.boundary;
    counts.found++;
    if (components.length >= maxComponents) continue;
    counts.kept++;
    components.push({
      selector: scopeSelector(el),
      ...safeOuterHTML(el),
      kind,
      boundary: kind === 'icon-button' ? null : collectBoundary(el),
      icon: kind === 'icon-button' ? scanIcon(el, false).icon : null,
    });
  }
  return { components, componentCounts };
}

// =============================================================================
// Measurement (Node side)
// =============================================================================

const toRgb = (c: RawRgba): RgbColor => ({ r: c.r, g: c.g, b: c.b });

function undetermined(
  component: NonTextContrastComponent,
  reason: Reason,
): NonTextContrastComponent {
  return { ...component, status: 'undetermined', undeterminedReason: reason };
}

/**
 * Keep the best (largest) ratio and decide with the unrounded values; the
 * indicators carry the ratio rounded down.
 */
function withIndicators(
  component: NonTextContrastComponent,
  entries: { indicator: NonTextContrastIndicator; raw: number }[],
): NonTextContrastComponent {
  const best = Math.max(...entries.map((e) => e.raw));
  return {
    ...component,
    indicators: entries.map((e) => e.indicator),
    bestRatio: floorRatio(best),
  };
}

function indicatorEntry(
  part: NonTextContrastIndicator['part'],
  color: RgbColor,
  against: RgbColor,
): { indicator: NonTextContrastIndicator; raw: number } {
  const raw = contrastRatio(color, against);
  return {
    indicator: {
      part,
      color: toHexColor(color),
      against: toHexColor(against),
      ratio: floorRatio(raw),
    },
    raw,
  };
}

function measureBoundary(
  raw: RawComponent,
  base: NonTextContrastComponent,
): NonTextContrastComponent {
  const b = raw.boundary!;
  const component: NonTextContrastComponent = {
    ...base,
    otherVisuals: [
      ...(b.boxShadow ? (['box-shadow'] as const) : []),
      ...(b.outline ? (['outline'] as const) : []),
    ],
  };
  // The component's own blockers come first: a native input hidden with
  // opacity or sr-only CSS is not an untouched browser control.
  if (b.selfBlockedBy) return undetermined(component, b.selfBlockedBy);
  if (b.visuallyHidden) return undetermined(component, 'visually-hidden');
  // A native control ignores the outer background color but not an ancestor's
  // opacity / filter.
  if (b.outer.effectBlockedBy) {
    return undetermined(component, b.outer.effectBlockedBy);
  }
  if (raw.kind !== 'text-input' && b.isInput && b.appearance !== 'none') {
    return b.accentColor === 'auto'
      ? { ...component, status: 'user-agent' }
      : undetermined(component, 'accent-color');
  }
  if (b.outer.blockedBy) return undetermined(component, b.outer.blockedBy);

  const outer = compositeLayers(b.outer.layers, WHITE);
  const fill = compositeOver(b.background, outer);
  const entries: ReturnType<typeof indicatorEntry>[] = [];
  if (b.background.a > 0) {
    entries.push(indicatorEntry('background', fill, outer));
  }
  for (const border of b.borders) {
    if (
      border.width > 0 &&
      border.style !== 'none' &&
      border.style !== 'hidden' &&
      border.color.a > 0
    ) {
      const under = b.backgroundClip === 'border-box' ? fill : outer;
      entries.push(
        indicatorEntry(
          `border-${border.side}`,
          compositeOver(border.color, under),
          outer,
        ),
      );
    }
  }
  if (entries.length === 0) return { ...component, status: 'no-boundary' };
  const measured = withIndicators(component, entries);
  const best = Math.max(...entries.map((e) => e.raw));
  return {
    ...measured,
    status: best < NON_TEXT_CONTRAST_MIN_RATIO ? 'low' : 'pass',
  };
}

function measureIcon(
  raw: RawComponent,
  base: NonTextContrastComponent,
): NonTextContrastComponent {
  const icon = raw.icon!;
  if (icon.tooMany) return undetermined(base, 'too-many-icon-parts');

  const entries: ReturnType<typeof indicatorEntry>[] = [];
  let blocked: Reason | null = null;
  for (const c of icon.colors) {
    const reason = c.paintServer ? 'svg-paint-server' : c.bg.blockedBy;
    if (reason) {
      blocked ??= reason;
      continue;
    }
    const bg = compositeLayers(c.bg.layers, WHITE);
    const entry = indicatorEntry(
      'icon',
      compositeOver({ ...toRgb(c.color), a: c.color.a }, bg),
      bg,
    );
    const duplicate = entries.some(
      (e) =>
        e.indicator.color === entry.indicator.color &&
        e.indicator.against === entry.indicator.against,
    );
    if (!duplicate) entries.push(entry);
  }
  const measured =
    entries.length > 0 ? withIndicators(base, entries) : { ...base };

  // An image may carry the meaning, and its colors cannot be read.
  if (icon.hasImage) return undetermined(measured, 'image-icon');
  if (blocked) return undetermined(measured, blocked);
  if (icon.svgUse) return undetermined(measured, 'svg-use');
  if (icon.overlap) return undetermined(measured, 'svg-overlap');
  // Nothing measurable was drawn: do not turn that into a pass.
  if (entries.length === 0) return undetermined(measured, 'no-icon-color');

  const below = entries.filter((e) => e.raw < NON_TEXT_CONTRAST_MIN_RATIO);
  if (below.length === 0) return { ...measured, status: 'pass' };
  if (below.length === entries.length) return { ...measured, status: 'low' };
  // Whether the faint parts are needed to understand the icon is a human call.
  return undetermined(measured, 'mixed-icon-colors');
}

function measureComponent(raw: RawComponent): NonTextContrastComponent {
  const base: NonTextContrastComponent = {
    selector: raw.selector,
    html: raw.html,
    htmlTruncated: raw.htmlTruncated,
    kind: raw.kind,
    status: 'pass',
    undeterminedReason: null,
    bestRatio: null,
    indicators: [],
    otherVisuals: [],
  };
  return raw.kind === 'icon-button'
    ? measureIcon(raw, base)
    : measureBoundary(raw, base);
}

/**
 * Run the non-text contrast check against the current page, write the result
 * JSON, and return the parsed result.
 */
export async function runNonTextContrastCheck(
  options: RunNonTextContrastCheckOptions,
): Promise<NonTextContrastCheckResult> {
  const { page, ...location } = options;
  const out = createAuditOutput({
    ...location,
    defaultFile: DEFAULT_NON_TEXT_CONTRAST_RESULT_FILE,
  });

  const url = page.url();
  const scan = await page.evaluate(scanNonTextContrast, {
    selector: NON_TEXT_CONTRAST_SELECTOR,
    textInputTypes: NON_TEXT_CONTRAST_TEXT_INPUT_TYPES,
    maxComponents: NON_TEXT_CONTRAST_MAX_COMPONENTS,
    maxIconParts: NON_TEXT_CONTRAST_MAX_ICON_PARTS,
    htmlSnippetMaxLength: HTML_SNIPPET_MAX_LENGTH,
  });

  const details: NonTextContrastCheckDetails = {
    threshold: NON_TEXT_CONTRAST_MIN_RATIO,
    components: scan.components.map(measureComponent),
    componentCounts: scan.componentCounts,
  };

  const result: NonTextContrastCheckResult = buildAuditResult({
    source: 'non-text-contrast-check',
    url,
    details,
    buckets: normalizeNonTextContrastCheck(details),
  });

  out.header('Non-text Contrast Results', 'WCAG 1.4.11', result.url);

  const { boundary, icon } = details.componentCounts;
  out.summary({
    Components: details.components.length,
    'Not measured (limit)':
      boundary.found - boundary.kept + (icon.found - icon.kept),
    Low: details.components.filter((c) => c.status === 'low').length,
    Undetermined: details.components.filter((c) => c.status === 'undetermined')
      .length,
  });

  out.issueList<NonTextContrastComponent>(
    'Non-text Contrast Candidates',
    details.components.filter(
      (c) =>
        c.status === 'low' ||
        c.status === 'no-boundary' ||
        c.status === 'undetermined',
    ),
    (c, i) => [
      `${i + 1}. ${c.selector} [${c.kind}] ${c.status}${c.undeterminedReason ? ` (${c.undeterminedReason})` : ''} best=${c.bestRatio ?? 'n/a'}`,
    ],
  );

  out.save(result);

  out.outputPaths();

  return result;
}
