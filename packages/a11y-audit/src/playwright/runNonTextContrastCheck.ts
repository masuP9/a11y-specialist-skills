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
 * - `behindIndicators` is filled only for icon buttons stopped by nothing but
 *   `out-of-flow`, when the elements under 5x5 points of the button leave no
 *   doubt about the outer color; `status` is unchanged. Text painted under the
 *   button is not seen, an image small enough to fit between the points is
 *   missed, and an in-flow pseudo element glyph has no readable box, so
 *   whether it leaves the button is not checked.
 * - Lines drawn with `box-shadow` or `outline` are measured separately into
 *   `otherIndicators` and do not change `status`. Only a single visible shadow
 *   layer with no blur, sides at least 1px wide and not cut off by an
 *   ancestor's `overflow`, and an outline that is solid / dashed / dotted /
 *   double, at least 1px wide and not drawn inside the box, are measured;
 *   otherwise `otherSkipped` says why. An outer shadow and an outline are
 *   compared with the outer color, an inset shadow also with the border.
 *   Overlaps by neighbors and `clip-path` / `contain` on ancestors are not
 *   seen. `border-image` and pseudo element borders are not measured.
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
  NonTextContrastOtherIndicator,
  NonTextContrastOtherSkipReason,
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
  /** Visible box-shadow layers (transparent or zero-size layers dropped). */
  shadows: RawShadow[];
  /** A visible outline, or null. */
  outline: RawOutline | null;
}

type Side = 'top' | 'right' | 'bottom' | 'left';

/** How wide the line is on each side, and whether an ancestor's overflow cuts it off. */
type RawSideBands = Record<Side, { width: number; clipped: boolean }>;

interface RawShadow {
  inset: boolean;
  color: RawRgba;
  blur: number;
  sides: RawSideBands;
}

interface RawOutline {
  style: string;
  width: number;
  offset: number;
  color: RawRgba;
  sides: RawSideBands;
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
  /**
   * For each entry of `colors`, the layers (nearest first) painted under it,
   * read from the elements under the button; null when they cannot be decided.
   */
  behind: RawRgba[][] | null;
}

interface RawBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** What `scanIcon` found, with the elements `behindLayers` needs in the page. */
interface IconScan {
  exists: boolean;
  icon: RawIcon;
  /** For each entry of `icon.colors`, where the walk to the button starts. */
  sources: Element[];
  /** Drawn shapes, with the stroke included. */
  shapeRects: RawBox[];
  /** A `::before` / `::after` glyph is absolute / fixed without an opaque background. */
  positionedGlyph: boolean;
}

/** An outer shadow or outline, and the area it paints. */
interface RawReach {
  box: DOMRect;
  paint: RawBox;
  /** Nothing is painted inside the element's own box (false for a negative offset). */
  ownBoxClear: boolean;
}

/** What `elementsFromPoint` cannot show; read once per page. */
interface RawPagePaint {
  inert: Element[];
  reaches: RawReach[];
  positionedInertPseudo: boolean;
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
  function scanIcon(button: Element, existsOnly: boolean): IconScan {
    const elements = [button, ...Array.from(button.querySelectorAll('*'))];
    const tooMany = elements.length > maxIconParts;
    const collect = !existsOnly && !tooMany;
    const icon: RawIcon = {
      tooMany,
      hasImage: false,
      overlap: false,
      svgUse: false,
      colors: [],
      behind: null,
    };
    let exists = false;
    let positionedGlyph = false;
    const sources: Element[] = [];
    const addColor = (color: RawIconColor, source: Element): void => {
      icon.colors.push(color);
      sources.push(source);
    };
    const shapes: {
      svg: Element | null;
      filled: boolean;
      rect: RawBox;
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
        const positioned =
          (pcs.position === 'absolute' || pcs.position === 'fixed') &&
          bgc.a < 1;
        if (positioned) positionedGlyph = true;
        addColor(
          {
            color: toRgba(pcs.color),
            paintServer: false,
            bg: {
              layers: bgc.a > 0 ? [bgc, ...base.layers] : base.layers,
              // A positioned glyph may be drawn outside its owner, over unknown content.
              blockedBy:
                effectOf(pcs) ??
                (positioned ? 'out-of-flow' : null) ??
                base.blockedBy,
            },
          },
          node,
        );
      }

      if (existsOnly && exists) {
        return { exists, icon, sources, shapeRects: [], positionedGlyph };
      }

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
      const source = node.parentElement ?? node;
      let filled = false;
      let stroked = false;
      if (tag !== 'line' && cs.fill !== 'none') {
        if (cs.fill.startsWith('url(')) {
          addColor(
            { color: { r: 0, g: 0, b: 0, a: 1 }, paintServer: true, bg },
            source,
          );
          filled = true;
        } else {
          const c = toRgba(cs.fill);
          c.a *= Number(cs.fillOpacity);
          if (c.a > 0) {
            addColor({ color: c, paintServer: false, bg }, source);
            filled = true;
          }
        }
      }
      const strokeWidth = parseFloat(cs.strokeWidth) || 0;
      if (cs.stroke !== 'none' && strokeWidth > 0) {
        if (cs.stroke.startsWith('url(')) {
          addColor(
            { color: { r: 0, g: 0, b: 0, a: 1 }, paintServer: true, bg },
            source,
          );
          stroked = true;
        } else {
          const c = toRgba(cs.stroke);
          c.a *= Number(cs.strokeOpacity);
          if (c.a > 0) {
            addColor({ color: c, paintServer: false, bg }, source);
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
    return {
      exists,
      icon,
      sources,
      shapeRects: shapes.map((s) => s.rect),
      positionedGlyph,
    };
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

  /** Split at commas / whitespace outside parentheses (computed values only). */
  function splitTopLevel(value: string, separator: ',' | ' '): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of value) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (depth === 0 && (separator === ' ' ? /\s/.test(ch) : ch === ',')) {
        if (current.trim()) parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  /**
   * Padding boxes of ancestors whose overflow cuts off what is drawn outside
   * the component. <html> and <body> pass their overflow to the viewport, so
   * they are skipped. A positioned component may escape an ancestor that is
   * not its containing block; it is still treated as cut off (not measured).
   */
  function clipBoxes(el: Element): DOMRect[] {
    const boxes: DOMRect[] = [];
    for (let n = el.parentElement; n; n = n.parentElement) {
      if (n === document.documentElement || n === document.body) continue;
      const ncs = getComputedStyle(n);
      if (ncs.overflowX === 'visible' && ncs.overflowY === 'visible') continue;
      const b = n.getBoundingClientRect();
      const left = b.left + (parseFloat(ncs.borderLeftWidth) || 0);
      const top = b.top + (parseFloat(ncs.borderTopWidth) || 0);
      boxes.push(
        new DOMRect(
          left,
          top,
          b.right - (parseFloat(ncs.borderRightWidth) || 0) - left,
          b.bottom - (parseFloat(ncs.borderBottomWidth) || 0) - top,
        ),
      );
    }
    return boxes;
  }

  /**
   * Band widths per side. `outward` bands lie outside the border box, starting
   * `gap` px away from it; any part of them beyond a clip box marks the side
   * as clipped.
   */
  function sideBands(
    widths: Record<Side, number>,
    rect: DOMRect,
    clips: DOMRect[],
    outward: boolean,
    gap = 0,
  ): RawSideBands {
    const cut = (side: Side, w: number): boolean =>
      outward &&
      w > 0 &&
      clips.some((c) =>
        side === 'top'
          ? rect.top - gap - w < c.top
          : side === 'bottom'
            ? rect.bottom + gap + w > c.bottom
            : side === 'left'
              ? rect.left - gap - w < c.left
              : rect.right + gap + w > c.right,
      );
    return {
      top: { width: widths.top, clipped: cut('top', widths.top) },
      right: { width: widths.right, clipped: cut('right', widths.right) },
      bottom: { width: widths.bottom, clipped: cut('bottom', widths.bottom) },
      left: { width: widths.left, clipped: cut('left', widths.left) },
    };
  }

  /** Visible box-shadow layers; transparent and zero-size layers are dropped. */
  function collectShadows(
    cs: CSSStyleDeclaration,
    rect: DOMRect,
    clips: DOMRect[],
  ): RawShadow[] {
    if (cs.boxShadow === 'none') return [];
    const shadows: RawShadow[] = [];
    for (const layer of splitTopLevel(cs.boxShadow, ',')) {
      const lengths: number[] = [];
      const colorParts: string[] = [];
      let inset = false;
      for (const token of splitTopLevel(layer, ' ')) {
        if (token === 'inset') inset = true;
        else if (/^-?[\d.]+(e-?\d+)?(px)?$/i.test(token)) {
          lengths.push(parseFloat(token));
        } else colorParts.push(token);
      }
      const [ox = 0, oy = 0, blur = 0, spread = 0] = lengths;
      const color = toRgba(colorParts.join(' ') || cs.color);
      // An inset shadow offset down shows a wider band at the top.
      const s = inset ? -1 : 1;
      const widths = {
        top: spread - s * oy,
        right: spread + s * ox,
        bottom: spread + s * oy,
        left: spread - s * ox,
      };
      const drawn = blur > 0 || Object.values(widths).some((w) => w > 0);
      if (color.a === 0 || !drawn) continue;
      shadows.push({
        inset,
        color,
        blur,
        sides: sideBands(widths, rect, clips, !inset),
      });
    }
    return shadows;
  }

  function collectOutline(
    cs: CSSStyleDeclaration,
    rect: DOMRect,
    clips: DOMRect[],
  ): RawOutline | null {
    const width = parseFloat(cs.outlineWidth) || 0;
    if (cs.outlineStyle === 'none' || cs.outlineStyle === 'hidden') return null;
    // `auto` is the browser's focus ring; its color is not the computed one.
    const color =
      cs.outlineStyle === 'auto'
        ? { r: 0, g: 0, b: 0, a: 1 }
        : toRgba(cs.outlineColor);
    if (width <= 0 || color.a === 0) return null;
    const offset = parseFloat(cs.outlineOffset) || 0;
    const w = { top: width, right: width, bottom: width, left: width };
    return {
      style: cs.outlineStyle,
      width,
      offset,
      color,
      sides: sideBands(w, rect, clips, offset >= 0, Math.max(offset, 0)),
    };
  }

  function collectBoundary(el: Element): RawBoundary {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const clips = clipBoxes(el);
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
      shadows: collectShadows(cs, rect, clips),
      outline: collectOutline(cs, rect, clips),
    };
  }

  const boxesOverlap = (a: RawBox, b: RawBox): boolean =>
    a.left < b.right &&
    b.left < a.right &&
    a.top < b.bottom &&
    b.top < a.bottom;

  const IMAGE_LIKE_TAGS = new Set([
    'img',
    'video',
    'canvas',
    'iframe',
    'object',
    'embed',
    'picture',
  ]);

  /** Drawn at all (opacity: 0 and visibility count); assumed drawn if it cannot be asked. */
  function isPainted(node: Element): boolean {
    const probe = node as Element & {
      checkVisibility?: (options?: object) => boolean;
    };
    return (
      probe.checkVisibility?.({
        opacityProperty: true,
        visibilityProperty: true,
      }) ?? true
    );
  }

  /** A generated box paints a background; `only` narrows which pseudo elements count. */
  function pseudoDraws(
    node: Element,
    only?: (pcs: CSSStyleDeclaration) => boolean,
  ): boolean {
    return ['::before', '::after'].some((pseudo) => {
      const pcs = getComputedStyle(node, pseudo);
      return (
        pcs.display !== 'none' &&
        pcs.visibility === 'visible' &&
        pcs.content !== 'none' &&
        pcs.content !== 'normal' &&
        Number(pcs.opacity) > 0 &&
        (pcs.backgroundImage !== 'none' || toRgba(pcs.backgroundColor).a > 0) &&
        (!only || only(pcs))
      );
    });
  }

  /** An inset shadow, or a visible border band that reaches `rect`. */
  function edgePaintsOver(
    node: Element,
    cs: CSSStyleDeclaration,
    rect: DOMRect,
  ): boolean {
    const box = node.getBoundingClientRect();
    if (collectShadows(cs, box, []).some((s) => s.inset)) return true;
    return (['top', 'right', 'bottom', 'left'] as const).some((side) => {
      const width =
        parseFloat(cs.getPropertyValue(`border-${side}-width`)) || 0;
      const style = cs.getPropertyValue(`border-${side}-style`);
      if (width <= 0 || style === 'none' || style === 'hidden') return false;
      if (
        toRgba(cs.getPropertyValue(`border-${side}-color`)).a === 0 &&
        cs.borderImageSource === 'none'
      ) {
        return false;
      }
      const band: RawBox = {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
      };
      if (side === 'top') band.bottom = box.top + width;
      if (side === 'bottom') band.top = box.bottom - width;
      if (side === 'left') band.right = box.left + width;
      if (side === 'right') band.left = box.right - width;
      return boxesOverlap(band, rect);
    });
  }

  /** Whether a `pointer-events: none` element paints something at `rect`. */
  function inertDraws(node: Element, rect: DOMRect): boolean {
    const cs = getComputedStyle(node);
    return (
      cs.backgroundImage !== 'none' ||
      toRgba(cs.backgroundColor).a > 0 ||
      cs.getPropertyValue('backdrop-filter') !== 'none' ||
      IMAGE_LIKE_TAGS.has(node.localName) ||
      node instanceof SVGElement ||
      pseudoDraws(node) ||
      edgePaintsOver(node, cs, rect)
    );
  }

  let pagePaint: RawPagePaint | null = null;
  function readPagePaint(): RawPagePaint {
    if (pagePaint) return pagePaint;
    const paint: RawPagePaint = {
      inert: [],
      reaches: [],
      positionedInertPseudo: false,
    };
    for (const node of Array.from(document.querySelectorAll('*'))) {
      if (!isPainted(node)) continue;
      const cs = getComputedStyle(node);
      if (cs.pointerEvents === 'none') paint.inert.push(node);
      paint.positionedInertPseudo ||= pseudoDraws(
        node,
        (pcs) =>
          pcs.pointerEvents === 'none' &&
          (pcs.position === 'absolute' || pcs.position === 'fixed'),
      );
      const box = node.getBoundingClientRect();
      for (const s of collectShadows(cs, box, [])) {
        if (s.inset) continue;
        paint.reaches.push({
          box,
          paint: {
            left: box.left - s.sides.left.width - s.blur,
            right: box.right + s.sides.right.width + s.blur,
            top: box.top - s.sides.top.width - s.blur,
            bottom: box.bottom + s.sides.bottom.width + s.blur,
          },
          ownBoxClear: true,
        });
      }
      const outline = collectOutline(cs, box, []);
      if (outline) {
        const reach = outline.width + outline.offset;
        paint.reaches.push({
          box,
          paint: {
            left: box.left - reach,
            right: box.right + reach,
            top: box.top - reach,
            bottom: box.bottom + reach,
          },
          ownBoxClear: outline.offset >= 0,
        });
      }
    }
    pagePaint = paint;
    return paint;
  }

  /**
   * The layers under each icon color of a button stopped only by `out-of-flow`,
   * read from the elements under it; null when something could change the
   * color. The page-wide part runs only for such buttons.
   */
  function behindLayers(button: Element, scan: IconScan): RawRgba[][] | null {
    const { icon, sources, shapeRects } = scan;
    if (
      icon.tooMany ||
      icon.hasImage ||
      icon.svgUse ||
      icon.overlap ||
      scan.positionedGlyph ||
      icon.colors.length === 0 ||
      !icon.colors.every(
        (c) => !c.paintServer && c.bg.blockedBy === 'out-of-flow',
      )
    ) {
      return null;
    }

    const rect = button.getBoundingClientRect();
    if (
      shapeRects.some(
        (s) =>
          s.left < rect.left ||
          s.right > rect.right ||
          s.top < rect.top ||
          s.bottom > rect.bottom,
      )
    ) {
      return null;
    }

    // What is under a fixed or sticky box changes with scrolling.
    for (const source of sources) {
      for (let n: Element | null = source; n; n = n.parentElement) {
        const position = getComputedStyle(n).position;
        if (position === 'fixed' || position === 'sticky') return null;
      }
    }

    const inButton = (n: Element): boolean => button.contains(n);
    let below: Element[] | null = null;
    // Inset from the edges so that the corner points still land on a round button.
    for (let i = 1; i <= 5; i++) {
      for (let j = 1; j <= 5; j++) {
        const stack = document.elementsFromPoint(
          rect.left + (rect.width * i) / 6,
          rect.top + (rect.height * j) / 6,
        );
        const split = stack.findIndex((n) => !inButton(n));
        // Covered, off screen, or something painted between the button and its icon.
        if (stack.length === 0 || split <= 0) return null;
        const rest: Element[] = stack.slice(split);
        if (rest.some(inButton)) return null;
        if (
          below &&
          (below.length !== rest.length || rest.some((n, k) => n !== below![k]))
        ) {
          return null;
        }
        below = rest;
      }
    }
    const under = below!;

    if (
      [button, ...Array.from(button.querySelectorAll('*'))].some((n) =>
        pseudoDraws(n),
      )
    ) {
      return null;
    }
    for (const n of under) {
      const cs = getComputedStyle(n);
      if (
        IMAGE_LIKE_TAGS.has(n.localName) ||
        n instanceof SVGElement ||
        cs.backgroundImage !== 'none' ||
        cs.getPropertyValue('mask-image') !== 'none' ||
        (cs.backgroundClip !== 'border-box' &&
          toRgba(cs.backgroundColor).a > 0) ||
        pseudoDraws(n) ||
        edgePaintsOver(n, cs, rect)
      ) {
        return null;
      }
      // An ancestor may have no box at the point and so not be in the list.
      for (let a: Element | null = n; a; a = a.parentElement) {
        if (effectOf(getComputedStyle(a))) return null;
      }
    }

    const page = readPagePaint();
    if (
      page.positionedInertPseudo ||
      page.inert.some(
        (n) =>
          !inButton(n) &&
          boxesOverlap(n.getBoundingClientRect(), rect) &&
          inertDraws(n, rect),
      ) ||
      page.reaches.some(
        (r) =>
          boxesOverlap(r.paint, rect) &&
          !(
            r.ownBoxClear &&
            r.box.left <= rect.left &&
            r.box.right >= rect.right &&
            r.box.top <= rect.top &&
            r.box.bottom >= rect.bottom
          ),
      )
    ) {
      return null;
    }

    // <body>'s background moves to the canvas only when <html> has none, so a
    // short body can paint where it has no box.
    const root = document.documentElement;
    const body = document.body;
    if (
      getComputedStyle(root).backgroundImage !== 'none' ||
      (body && getComputedStyle(body).backgroundImage !== 'none')
    ) {
      return null;
    }
    const painters = [...under];
    if (
      body &&
      !under.includes(body) &&
      toRgba(getComputedStyle(root).backgroundColor).a === 0
    ) {
      painters.push(body);
    }
    if (!under.includes(root)) painters.push(root);

    const outer: RawRgba[] = [];
    let outerOpaque = false;
    for (const n of painters) {
      const c = toRgba(getComputedStyle(n).backgroundColor);
      if (c.a > 0) outer.push(c);
      if (c.a === 1) {
        outerOpaque = true;
        break;
      }
    }

    const result: RawRgba[][] = [];
    for (const source of sources) {
      const layers: RawRgba[] = [];
      let opaque = false;
      for (let n: Element | null = source; n && !opaque; n = n.parentElement) {
        const c = toRgba(getComputedStyle(n).backgroundColor);
        if (c.a > 0) layers.push(c);
        opaque = c.a === 1;
        if (n === button) break;
      }
      if (!opaque && !outerOpaque && rootIsDark) return null;
      result.push(opaque ? layers : [...layers, ...outer]);
    }
    return result;
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
    let icon: RawIcon | null = null;
    if (kind === 'icon-button') {
      const iconScan = scanIcon(el, false);
      iconScan.icon.behind = behindLayers(el, iconScan);
      icon = iconScan.icon;
    }
    components.push({
      selector: scopeSelector(el),
      ...safeOuterHTML(el),
      kind,
      boundary: kind === 'icon-button' ? null : collectBoundary(el),
      icon,
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
      ...(b.shadows.length > 0 ? (['box-shadow'] as const) : []),
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
  const borderUnder = b.backgroundClip === 'border-box' ? fill : outer;
  const borders = b.borders
    .filter(
      (border) =>
        border.width > 0 &&
        border.style !== 'none' &&
        border.style !== 'hidden' &&
        border.color.a > 0,
    )
    .map((border) => ({
      side: border.side,
      color: compositeOver(border.color, borderUnder),
    }));
  const entries: ReturnType<typeof indicatorEntry>[] = [];
  if (b.background.a > 0) {
    entries.push(indicatorEntry('background', fill, outer));
  }
  for (const border of borders) {
    entries.push(indicatorEntry(`border-${border.side}`, border.color, outer));
  }
  const withOthers = {
    ...component,
    ...measureOtherLines(
      b,
      outer,
      fill,
      borders.map((border) => border.color),
    ),
  };
  if (entries.length === 0) return { ...withOthers, status: 'no-boundary' };
  const measured = withIndicators(withOthers, entries);
  const best = Math.max(...entries.map((e) => e.raw));
  return {
    ...measured,
    status: best < NON_TEXT_CONTRAST_MIN_RATIO ? 'low' : 'pass',
  };
}

const MEASURED_OUTLINE_STYLES = new Set([
  'solid',
  'dashed',
  'dotted',
  'double',
]);

/** null when some side is wide enough and not cut off; otherwise why not. */
function unusableBands(
  sides: RawSideBands,
): Extract<NonTextContrastOtherSkipReason, 'thin' | 'clipped'> | null {
  const wide = Object.values(sides).filter((s) => s.width >= 1);
  if (wide.length === 0) return 'thin';
  return wide.every((s) => s.clipped) ? 'clipped' : null;
}

/** The lowest ratio against the given neighbors (a line must stand out from each). */
function otherIndicator(
  part: NonTextContrastOtherIndicator['part'],
  color: RgbColor,
  neighbors: RgbColor[],
): NonTextContrastOtherIndicator {
  const [lowest] = neighbors
    .map((against) => ({ against, raw: contrastRatio(color, against) }))
    .sort((x, y) => x.raw - y.raw);
  return {
    part,
    color: toHexColor(color),
    against: toHexColor(lowest!.against),
    ratio: floorRatio(lowest!.raw),
  };
}

/**
 * box-shadow / outline lines (they do not change `status`). An outer shadow
 * and an outline (offset ≥ 0) sit on the outer color; an inset shadow sits on
 * the fill, inside the border, so it is also compared with each border color.
 */
function measureOtherLines(
  b: RawBoundary,
  outer: RgbColor,
  fill: RgbColor,
  borderColors: RgbColor[],
): Pick<NonTextContrastComponent, 'otherIndicators' | 'otherSkipped'> {
  const otherIndicators: NonTextContrastOtherIndicator[] = [];
  const otherSkipped: NonTextContrastOtherSkipReason[] = [];
  const [shadow, ...moreShadows] = b.shadows;
  if (moreShadows.length > 0) {
    otherSkipped.push('multiple-shadows');
  } else if (shadow) {
    const why =
      shadow.blur > 0 ? 'blurred-shadow' : unusableBands(shadow.sides);
    if (why) otherSkipped.push(why);
    else {
      otherIndicators.push(
        otherIndicator(
          'box-shadow',
          compositeOver(shadow.color, shadow.inset ? fill : outer),
          shadow.inset ? [outer, ...borderColors] : [outer],
        ),
      );
    }
  }
  const outline = b.outline;
  if (outline) {
    const why = !MEASURED_OUTLINE_STYLES.has(outline.style)
      ? 'outline-style'
      : outline.offset < 0
        ? 'outline-inside'
        : unusableBands(outline.sides);
    if (why) otherSkipped.push(why);
    else {
      otherIndicators.push(
        otherIndicator('outline', compositeOver(outline.color, outer), [outer]),
      );
    }
  }
  return { otherIndicators, otherSkipped };
}

type IndicatorEntry = ReturnType<typeof indicatorEntry>;

function addDistinct(entries: IndicatorEntry[], entry: IndicatorEntry): void {
  const duplicate = entries.some(
    (e) =>
      e.indicator.color === entry.indicator.color &&
      e.indicator.against === entry.indicator.against,
  );
  if (!duplicate) entries.push(entry);
}

function measureBehind(
  icon: RawIcon,
): NonTextContrastComponent['behindIndicators'] {
  const entries: IndicatorEntry[] = [];
  icon.behind?.forEach((layers, i) => {
    const bg = compositeLayers(layers, WHITE);
    addDistinct(
      entries,
      indicatorEntry('icon', compositeOver(icon.colors[i]!.color, bg), bg),
    );
  });
  return entries.map((e) => ({ ...e.indicator, part: 'icon' }));
}

function measureIcon(
  raw: RawComponent,
  base: NonTextContrastComponent,
): NonTextContrastComponent {
  const icon = raw.icon!;
  if (icon.tooMany) return undetermined(base, 'too-many-icon-parts');

  const entries: IndicatorEntry[] = [];
  let blocked: Reason | null = null;
  for (const c of icon.colors) {
    const reason = c.paintServer ? 'svg-paint-server' : c.bg.blockedBy;
    if (reason) {
      blocked ??= reason;
      continue;
    }
    const bg = compositeLayers(c.bg.layers, WHITE);
    addDistinct(
      entries,
      indicatorEntry(
        'icon',
        compositeOver({ ...toRgb(c.color), a: c.color.a }, bg),
        bg,
      ),
    );
  }
  const measured =
    entries.length > 0 ? withIndicators(base, entries) : { ...base };

  // An image may carry the meaning, and its colors cannot be read.
  if (icon.hasImage) return undetermined(measured, 'image-icon');
  if (blocked) {
    return undetermined(
      { ...measured, behindIndicators: measureBehind(icon) },
      blocked,
    );
  }
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
    otherIndicators: [],
    otherSkipped: [],
    behindIndicators: [],
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
