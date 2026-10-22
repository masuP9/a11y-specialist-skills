/**
 * Target Size Check
 *
 * WCAG 2.5.8 (Target Size Minimum - AA): 24x24 CSS px
 * WCAG 2.5.5 (Target Size Enhanced - AAA): 44x44 CSS px
 *
 * The caller is responsible for navigating the page before calling this
 * function.
 *
 * Note: when `screenshot` is enabled this function appends an annotation
 * overlay to the page DOM before capturing the screenshot. Collecting targets
 * also scrolls the page (to hit-test targets outside the initial viewport)
 * and restores the original scroll position afterwards.
 *
 * Spacing exception (SC 2.5.8): evaluated geometrically per the WCAG
 * definition — a 24px-diameter circle centered on each undersized target's
 * bounding box must not intersect another target, nor the circle of another
 * undersized target. See `utils/target-spacing.ts`. Nested interactive
 * elements count as separate targets (an undersized control inside a larger
 * clickable ancestor fails the exception); only a `<label>` (explicit or
 * implicit), its control and that control's other labels are treated as one
 * target. `position: fixed` targets are compared with each other as they
 * are, and with a normal-flow target at the scroll position where the two are
 * farthest apart (scroll 0 when the fixed target is above, the maximum scroll
 * when it is below); `position: sticky` is treated as normal flow.
 *
 * Limitations:
 * - Essential exception requires manual review
 * - Cannot detect all redundant target cases
 * - Targets that only react to script-attached handlers (no `onclick`
 *   attribute, no role, no tabindex) are not detected, so a verified spacing
 *   exception can miss such a neighbor
 * - Shadow DOM and iframe content are not inspected
 * - Size and spacing use only the part left visible by ancestors that clip
 *   their overflow; `clip-path` and `clip` are not considered
 */

import type { Page } from '@playwright/test';
import type {
  TargetSizeIssue,
  TargetSizeCheckResult,
  TargetSizeCheckDetails,
  TargetSizeException,
  TargetSizeExceptionAssessment,
  TargetSpacingResult,
} from '../types.js';
import {
  INTERACTIVE_SELECTOR,
  TARGET_SIZE_AA,
  TARGET_SIZE_AAA,
  INLINE_CONTEXT_TAGS,
  UA_CONTROLLED_INPUT_TYPES,
  INLINE_CONTEXT_MIN_TEXT,
  DEFAULT_TARGET_SIZE_RESULT_FILE,
  DEFAULT_TARGET_SIZE_SCREENSHOT_FILE,
  HTML_SNIPPET_MAX_LENGTH,
} from '../constants.js';
import {
  buildAuditResult,
  normalizeTargetSizeCheck,
} from '../utils/axe-format.js';
import {
  takeAuditScreenshot,
  resolveScreenshotPath,
  createAuditOutput,
  type AuditOutputOptions,
} from '../utils/test-harness.js';
import {
  addPageAnnotations,
  type AnnotationConfig,
  type CircleAnnotationConfig,
} from '../utils/annotations.js';
import {
  describeTargetSpacing,
  evaluateTargetSpacing,
  rectCenter,
  roundPx,
  type Point,
  type Rect,
  type SpacingTarget,
} from '../utils/target-spacing.js';

/** Basic target info collected from DOM */
interface BasicTargetInfo {
  /** Position in the collected list; stable identifier for relations. */
  index: number;
  selector: string;
  tagName: string;
  html: string;
  htmlTruncated: boolean;
  role: string | null;
  width: number;
  height: number;
  href: string | null;
  inputType: string | null;
  appearance: string;
  parentTag: string | null;
  parentTextLength: number;
  /** Bounding box in document coordinates (CSS px). */
  boundingRect: Rect;
  /** Per-line painted boxes in document coordinates (CSS px). */
  clientRects: Rect[];
  /**
   * `true` when the element (or an ancestor) is `position: fixed`. For such
   * targets `boundingRect`/`clientRects` are viewport coordinates (they do
   * not move with the document), which equal document coordinates at
   * scroll 0.
   */
  fixed: boolean;
  /**
   * Indices of targets that share this target's function: a `<label>` and
   * its control, and every label of that same control.
   */
  sameTargetIndices: number[];
}

interface CollectedTargets {
  targets: BasicTargetInfo[];
  /**
   * Targets skipped because another element covers their hit-test point or
   * a clipping ancestor hides them entirely.
   */
  occludedCount: number;
  /** Maximum vertical window scroll offset in CSS px. */
  maxScrollY: number;
  /** Window scroll offsets at collection time (restored on return). */
  scroll: Point;
}

/**
 * Collect basic target information from DOM (runs in browser context).
 *
 * Scrolls the page to hit-test every target's painted center and restores
 * the original scroll position before returning.
 */
function collectBasicTargetInfo(args: {
  interactiveSelector: string;
  htmlSnippetMaxLength: number;
}): CollectedTargets {
  const { interactiveSelector, htmlSnippetMaxLength } = args;

  function getHtmlSnippet(element: Element): {
    html: string;
    htmlTruncated: boolean;
  } {
    let html: string;
    try {
      html = element.outerHTML || '';
    } catch {
      html = '';
    }
    if (!html) {
      return {
        html: `<${element.tagName.toLowerCase()}>`,
        htmlTruncated: false,
      };
    }
    if (html.length > htmlSnippetMaxLength) {
      return { html: html.slice(0, htmlSnippetMaxLength), htmlTruncated: true };
    }
    return { html, htmlTruncated: false };
  }

  function getUniqueSelector(element: Element, elementIndex: number): string {
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }
    const path: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === current!.tagName,
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
      path.unshift(selector);
      current = parent;
    }
    return path.length > 0
      ? path.join(' > ')
      : `[data-index="${elementIndex}"]`;
  }

  // Mirrors `roundPx` in utils/target-spacing.ts (this closure cannot import).
  const round2 = (n: number): number => Math.round(n * 100) / 100;

  const originalScrollX = window.scrollX;
  const originalScrollY = window.scrollY;

  const toDocRect = (rect: Rect): Rect => ({
    left: round2(rect.left + originalScrollX),
    top: round2(rect.top + originalScrollY),
    right: round2(rect.right + originalScrollX),
    bottom: round2(rect.bottom + originalScrollY),
  });

  // Pass 1: visible candidates, measured at the original scroll position.
  interface Candidate {
    el: HTMLElement;
    /** Size of the visible (unclipped) bounding box. */
    width: number;
    height: number;
    appearance: string;
    fixed: boolean;
    boundingRect: Rect;
    clientRects: Rect[];
  }
  const candidates: Candidate[] = [];
  const elements = document.querySelectorAll(interactiveSelector);

  // Viewport-fixed: the element or an ancestor is `position: fixed` AND no
  // ancestor above that fixed element establishes a containing block for it
  // (transform, perspective, filter, backdrop-filter, will-change of those,
  // contain, container-type) — such a fixed element scrolls with the page.
  // Sticky elements are treated as normal flow (limitation).
  const styleCache = new Map<Element, CSSStyleDeclaration>();
  const styleOf = (el: Element): CSSStyleDeclaration => {
    let cs = styleCache.get(el);
    if (!cs) {
      cs = getComputedStyle(el);
      styleCache.set(el, cs);
    }
    return cs;
  };
  const isSet = (value: string | undefined): boolean =>
    value !== undefined && value !== '' && value !== 'none';
  const formsContainingBlockForFixed = (cs: CSSStyleDeclaration): boolean =>
    isSet(cs.transform) ||
    // Individual transform properties are independent of `transform`.
    isSet(cs.translate) ||
    isSet(cs.rotate) ||
    isSet(cs.scale) ||
    isSet(cs.perspective) ||
    isSet(cs.filter) ||
    isSet(cs.backdropFilter) ||
    /transform|translate|rotate|scale|perspective|filter/.test(cs.willChange) ||
    /paint|layout|strict|content/.test(cs.contain) ||
    // `content-visibility: auto | hidden` implies layout containment.
    /auto|hidden/.test(cs.getPropertyValue('content-visibility')) ||
    (cs.containerType !== undefined &&
      cs.containerType !== '' &&
      cs.containerType !== 'normal');
  const isFixed = (el: Element): boolean => {
    let fixedSeen = false;
    let cursor: Element | null = el;
    while (cursor && cursor !== document.documentElement) {
      const cs = styleOf(cursor);
      if (fixedSeen && formsContainingBlockForFixed(cs)) {
        return false;
      }
      if (cs.position === 'fixed') {
        fixedSeen = true;
      }
      cursor = cursor.parentElement;
    }
    // On the root only containment is checked: transform/filter there do not
    // reliably contain fixed descendants across browsers.
    if (fixedSeen) {
      const root = styleOf(document.documentElement);
      if (
        /paint|layout|strict|content/.test(root.contain) ||
        /auto|hidden/.test(root.getPropertyValue('content-visibility'))
      ) {
        return false;
      }
    }
    return fixedSeen;
  };
  const toViewportRect = (rect: Rect): Rect => ({
    left: round2(rect.left),
    top: round2(rect.top),
    right: round2(rect.right),
    bottom: round2(rect.bottom),
  });

  // The viewport box left visible by ancestors that clip their overflow
  // (`overflow: hidden | clip`, per axis, or paint containment). Only
  // ancestors on the containing-block chain clip: an absolutely positioned
  // element escapes static ancestors and a viewport-fixed one escapes all.
  // `<html>`'s overflow is skipped, and so is `<body>`'s when it propagates
  // to the viewport (both belong to the page scroll); their paint
  // containment still clips. Scroll containers (`auto | scroll`) are not
  // clips: their hidden content is reachable by scrolling, so it keeps its
  // full size. Limitation: `clip-path` and `clip` are not considered, the
  // part of a scroll container's content outside its scrollport still
  // counts, and a rotated/skewed/mirrored clip box is approximated by its
  // bounding box.
  /** Whether the element or an ancestor may scale/rotate/zoom its box. */
  const transformedCache = new Map<Element, boolean>();
  const isTransformed = (el: Element | null): boolean => {
    if (!el) {
      return false;
    }
    let result = transformedCache.get(el);
    if (result === undefined) {
      const cs = styleOf(el);
      result =
        isSet(cs.transform) ||
        isSet(cs.scale) ||
        isSet(cs.rotate) ||
        isSet(cs.perspective) ||
        (cs.zoom !== '' && cs.zoom !== '1' && cs.zoom !== 'normal') ||
        isTransformed(el.parentElement);
      transformedCache.set(el, result);
    }
    return result;
  };
  const clipsAxis = (overflow: string): boolean =>
    overflow === 'hidden' || overflow === 'clip';
  const hasContainment = (cs: CSSStyleDeclaration): boolean =>
    /paint|layout|size|strict|content/.test(cs.contain) ||
    /auto|hidden/.test(cs.getPropertyValue('content-visibility'));
  const rootStyle = styleOf(document.documentElement);
  // Containment on either element stops the propagation.
  const bodyOverflowPropagates =
    rootStyle.overflowX === 'visible' &&
    rootStyle.overflowY === 'visible' &&
    !hasContainment(rootStyle) &&
    !(document.body && hasContainment(styleOf(document.body)));
  const ancestorClip = (el: Element): Rect => {
    const clip = {
      left: -Infinity,
      top: -Infinity,
      right: Infinity,
      bottom: Infinity,
    };
    let position = styleOf(el).position;
    for (let anc = el.parentElement; anc; anc = anc.parentElement) {
      const cs = styleOf(anc);
      const inChain =
        position === 'fixed'
          ? formsContainingBlockForFixed(cs)
          : position !== 'absolute' ||
            cs.position !== 'static' ||
            formsContainingBlockForFixed(cs);
      // `display: contents` has no box and overflow does not apply to
      // inline boxes (an inline `<svg>` is a replaced element and does
      // clip).
      if (!inChain || cs.display === 'contents') {
        continue;
      }
      position = cs.position;
      if (cs.display === 'inline' && !(anc instanceof SVGSVGElement)) {
        continue;
      }
      const paint =
        /paint|strict|content/.test(cs.contain) ||
        /auto|hidden/.test(cs.getPropertyValue('content-visibility'));
      const ownOverflow =
        anc !== document.documentElement &&
        !(anc === document.body && bodyOverflowPropagates);
      const overflowX = ownOverflow ? cs.overflowX : 'visible';
      const overflowY = ownOverflow ? cs.overflowY : 'visible';
      const clipX = paint || clipsAxis(overflowX);
      const clipY = paint || clipsAxis(overflowY);
      if (!clipX && !clipY) {
        continue;
      }
      // Clip edge in viewport coordinates: the padding box, or the
      // `overflow-clip-margin` box for `overflow: clip` and for paint
      // containment without an overflow clip (the margin does not widen
      // `hidden`). Computed lengths keep fractional px (unlike the integer
      // `clientLeft`/`clientWidth`) and are scaled like the transformed
      // bounding box; hidden/clip boxes have no scrollbars.
      const box = anc.getBoundingClientRect();
      const px = (prop: string): number =>
        parseFloat(cs.getPropertyValue(prop)) || 0;
      // Scale only under a transform: otherwise the ratio below is 1 up to
      // rounding (`offsetWidth`) or scrollbar gutters, which would fake one.
      // Under a transform it compares with the untransformed border box in
      // fractional px (limitation: a scrollbar gutter there still skews it).
      const layoutSize = (size: string, a: string, b: string): number =>
        px(size) +
        (cs.boxSizing === 'border-box'
          ? 0
          : px(`padding-${a}`) +
            px(`padding-${b}`) +
            px(`border-${a}-width`) +
            px(`border-${b}-width`));
      const layoutW = layoutSize('width', 'left', 'right');
      const layoutH = layoutSize('height', 'top', 'bottom');
      const scaled = isTransformed(anc);
      const scaleX = scaled && layoutW > 0 ? box.width / layoutW : 1;
      const scaleY = scaled && layoutH > 0 ? box.height / layoutH : 1;
      const clipMargin = cs.getPropertyValue('overflow-clip-margin');
      const inset = (side: string, overflow: string): number => {
        if (overflow !== 'clip' && !(paint && overflow === 'visible')) {
          return px(`border-${side}-width`);
        }
        const edge = clipMargin.includes('border-box')
          ? 0
          : clipMargin.includes('content-box')
            ? px(`border-${side}-width`) + px(`padding-${side}`)
            : px(`border-${side}-width`);
        return edge - (parseFloat(clipMargin.replace(/^[a-z-]+\s*/, '')) || 0);
      };
      if (clipX) {
        clip.left = Math.max(
          clip.left,
          box.left + inset('left', overflowX) * scaleX,
        );
        clip.right = Math.min(
          clip.right,
          box.right - inset('right', overflowX) * scaleX,
        );
      }
      if (clipY) {
        clip.top = Math.max(
          clip.top,
          box.top + inset('top', overflowY) * scaleY,
        );
        clip.bottom = Math.min(
          clip.bottom,
          box.bottom - inset('bottom', overflowY) * scaleY,
        );
      }
    }
    return clip;
  };
  const intersect = (r: Rect, clip: Rect): Rect | null => {
    const out = {
      left: Math.max(r.left, clip.left),
      top: Math.max(r.top, clip.top),
      right: Math.min(r.right, clip.right),
      bottom: Math.min(r.bottom, clip.bottom),
    };
    return out.right > out.left && out.bottom > out.top ? out : null;
  };
  /**
   * The element's bounding box and per-line boxes cut to the part clipping
   * ancestors leave visible, measured now in viewport coordinates.
   * `bounding` is `null` when nothing is visible.
   */
  const visibleBoxes = (
    el: Element,
  ): { bounding: Rect | null; rects: Rect[] } => {
    const clip = ancestorClip(el);
    return {
      bounding: intersect(el.getBoundingClientRect(), clip),
      rects: Array.from(el.getClientRects())
        .map((r) => intersect(r, clip))
        .filter((r): r is Rect => r !== null),
    };
  };

  // Targets whose painted boxes are entirely clipped by an ancestor.
  let clippedCount = 0;

  elements.forEach((element) => {
    const el = element as HTMLElement;
    const rect = el.getBoundingClientRect();

    // Skip invisible elements
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    const computedStyle = getComputedStyle(el);
    if (
      computedStyle.visibility === 'hidden' ||
      computedStyle.display === 'none'
    ) {
      return;
    }

    const fixed = isFixed(el);
    // Fixed elements keep viewport coordinates; everything else is stored in
    // document coordinates.
    const convert = fixed ? toViewportRect : toDocRect;

    // Skip elements positioned off the page (e.g. `left: -9999px` skip
    // links). Measured in document coordinates so targets above/left of the
    // current scroll position are kept — they are still spacing neighbors.
    if (
      !fixed &&
      (rect.bottom + originalScrollY < 0 || rect.right + originalScrollX < 0)
    ) {
      return;
    }
    if (fixed && (rect.bottom < 0 || rect.right < 0)) {
      return;
    }

    // Measure only the part left visible by clipping ancestors (e.g. a
    // collapsed code block): the hidden part is neither a target area nor a
    // spacing obstacle.
    const visible = visibleBoxes(el);
    if (!visible.bounding) {
      clippedCount++;
      return;
    }
    const clientRects = visible.rects.map(convert);

    candidates.push({
      el,
      width: round2(visible.bounding.right - visible.bounding.left),
      height: round2(visible.bounding.bottom - visible.bounding.top),
      appearance: computedStyle.appearance,
      fixed,
      boundingRect: convert(visible.bounding),
      clientRects:
        clientRects.length > 0 ? clientRects : [convert(visible.bounding)],
    });
  });

  // Pass 2: hit-test each candidate's painted center. Targets covered by
  // another element (overlay, sticky header, clipped container) are not
  // pointer targets and are dropped. Scroll only when the point is outside
  // the current viewport; visit candidates in document order to minimise
  // scrolling.
  const canScroll = typeof window.scrollTo === 'function';
  // `behavior: 'instant'` bypasses CSS `scroll-behavior: smooth`, which
  // would otherwise animate asynchronously and leave the synchronous
  // re-measure below looking at the old position.
  const scrollTo = (left: number, top: number): void => {
    window.scrollTo({ left, top, behavior: 'instant' });
  };
  const firstRect = (c: Candidate): Rect => c.clientRects[0] ?? c.boundingRect;
  const tileH = Math.max(1, window.innerHeight);
  const tileW = Math.max(1, window.innerWidth);
  // Visit viewport-sized tiles in order so each tile is scrolled to once.
  const order = candidates
    .map((c, i) => {
      const r = firstRect(c);
      return {
        i,
        ty: Math.floor(r.top / tileH),
        tx: Math.floor(r.left / tileW),
        y: r.top,
        x: r.left,
      };
    })
    .sort((a, b) => a.ty - b.ty || a.tx - b.tx || a.y - b.y || a.x - b.x)
    .map((o) => o.i);
  const inViewport = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight;
  /** Viewport center of the element's first visible box, measured now. */
  const paintedCenter = (el: Element): Point | null => {
    const fresh = visibleBoxes(el).rects[0];
    return fresh
      ? { x: (fresh.left + fresh.right) / 2, y: (fresh.top + fresh.bottom) / 2 }
      : null;
  };

  const occluded = new Set<number>();
  for (const i of order) {
    const candidate = candidates[i];
    if (!candidate) {
      continue;
    }
    const { el } = candidate;
    const first = firstRect(candidate);
    const docX = (first.left + first.right) / 2;
    const docY = (first.top + first.bottom) / 2;

    // Fixed elements stay where they are; no scrolling can bring them
    // "into" the viewport.
    if (
      !candidate.fixed &&
      !inViewport(docX - window.scrollX, docY - window.scrollY) &&
      canScroll
    ) {
      scrollTo(
        Math.max(0, docX - window.innerWidth / 2),
        Math.max(0, docY - window.innerHeight / 2),
      );
    }

    // Always measure at hit-test time: fixed/sticky elements move relative
    // to the document whenever the page scrolls.
    const point = paintedCenter(el);
    if (!point || !inViewport(point.x, point.y)) {
      // Cannot hit-test (e.g. inner scroll container); keep the target.
      continue;
    }

    const hit = document.elementFromPoint(point.x, point.y);
    if (hit && hit !== el && !el.contains(hit)) {
      occluded.add(i);
    }
  }

  if (canScroll) {
    scrollTo(originalScrollX, originalScrollY);
  }

  // Pass 3: build the target list with relations.
  const kept = candidates.filter((_, i) => !occluded.has(i));
  const indexByElement = new Map<Element, number>();
  kept.forEach((c, index) => indexByElement.set(c.el, index));

  // Group each labelable control with all of its labels (explicit `for` and
  // implicit wrapping): every member of a group is the same target.
  const groups = new Map<Element, number[]>();
  kept.forEach((c, index) => {
    let control: Element | null = null;
    if (c.el instanceof HTMLLabelElement) {
      control = c.el.control;
    } else if ('labels' in c.el && (c.el as HTMLInputElement).labels?.length) {
      control = c.el;
    }
    if (control) {
      const members = groups.get(control) ?? [];
      members.push(index);
      groups.set(control, members);
    }
  });
  const sameTarget: number[][] = kept.map(() => []);
  for (const members of groups.values()) {
    for (const a of members) {
      for (const b of members) {
        if (a !== b) {
          sameTarget[a]?.push(b);
        }
      }
    }
  }

  const targets: BasicTargetInfo[] = kept.map((c, index) => {
    const { el } = c;
    const tagName = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const inputType = el instanceof HTMLInputElement ? el.type : null;
    const href = el instanceof HTMLAnchorElement ? el.href : null;

    // Get parent info for inline exception check
    const parent = el.parentElement;
    const parentTag = parent ? parent.tagName.toLowerCase() : null;
    const parentTextLength = parent ? (parent.textContent || '').length : 0;

    return {
      index,
      selector: getUniqueSelector(el, index),
      tagName,
      ...getHtmlSnippet(el),
      role,
      width: c.width,
      height: c.height,
      href,
      inputType,
      appearance: c.appearance,
      parentTag,
      parentTextLength,
      boundingRect: c.boundingRect,
      clientRects: c.clientRects,
      fixed: c.fixed,
      sameTargetIndices: sameTarget[index] ?? [],
    };
  });

  return {
    targets,
    occludedCount: occluded.size + clippedCount,
    maxScrollY: Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    ),
    scroll: { x: originalScrollX, y: originalScrollY },
  };
}

/**
 * Parse accessible name from ariaSnapshot output.
 */
function parseAccessibleName(snapshot: string): string | null {
  // ariaSnapshot format: "- role \"accessible name\"" or "- role \"accessible name\" [state]"
  const match = snapshot.match(/^- \w+(?:\s+"([^"]*)")?/);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

/**
 * Check if element qualifies for inline exception.
 */
function checkInlineException(
  target: BasicTargetInfo,
  inlineContextTags: readonly string[],
  minTextLength: number,
): { applies: boolean; details: string | null } {
  // Only links typically qualify for inline exception
  if (target.tagName !== 'a' || !target.href) {
    return { applies: false, details: null };
  }

  if (
    target.parentTag &&
    inlineContextTags.includes(target.parentTag) &&
    target.parentTextLength >= minTextLength
  ) {
    return {
      applies: true,
      details: `Inline link within <${target.parentTag}>, surrounding text: ${target.parentTextLength} chars`,
    };
  }

  return { applies: false, details: null };
}

/**
 * Check if element qualifies for UA control exception.
 */
function checkUAControlException(
  target: BasicTargetInfo,
  uaControlledTypes: readonly string[],
): { applies: boolean; details: string | null } {
  // Check native form controls that haven't been restyled
  if (target.tagName === 'select') {
    if (target.appearance !== 'none') {
      return {
        applies: true,
        details: 'Native <select> element with default appearance',
      };
    }
  }

  if (
    target.tagName === 'input' &&
    target.inputType &&
    uaControlledTypes.includes(target.inputType)
  ) {
    if (target.appearance !== 'none') {
      return {
        applies: true,
        details: `Native <input type="${target.inputType}"> with default appearance`,
      };
    }
  }

  return { applies: false, details: null };
}

/**
 * Check for redundant targets (same href with at least one meeting size).
 */
function findRedundantTargets(
  targets: BasicTargetInfo[],
): Map<string, BasicTargetInfo[]> {
  const byHref = new Map<string, BasicTargetInfo[]>();

  for (const target of targets) {
    if (target.href) {
      const existing = byHref.get(target.href) || [];
      existing.push(target);
      byHref.set(target.href, existing);
    }
  }

  return byHref;
}

/**
 * Build the spacing evaluator: a function that returns the spacing result
 * for one undersized target against every other collected target. A
 * `<label>` and its control are the same target; every other pair —
 * nested interactive elements included — counts as separate targets.
 */
function buildSpacingEvaluator(
  targets: readonly BasicTargetInfo[],
  aaThreshold: number,
  maxScrollY: number,
): (target: BasicTargetInfo) => TargetSpacingResult {
  // Viewport coordinates of a fixed target equal its document coordinates at
  // scroll 0, so every target is compared in the page at scroll 0, except
  // that fixed/flow pairs are moved to the scroll position chosen below.
  const spacingTargets: SpacingTarget[] = targets.map((t) => ({
    index: t.index,
    selector: t.selector,
    bounds: t.boundingRect,
    rects: t.clientRects,
    undersized: Math.min(t.width, t.height) < aaThreshold,
  }));
  const centerY = (t: BasicTargetInfo): number => rectCenter(t.boundingRect).y;
  const moveY = (r: Rect, dy: number): Rect => ({
    ...r,
    top: r.top + dy,
    bottom: r.bottom + dy,
  });

  const isSameTarget = (a: SpacingTarget, b: SpacingTarget): boolean =>
    targets[a.index]?.sameTargetIndices.includes(b.index) ?? false;

  return (target) => {
    // A fixed/flow pair is compared at the scroll position where the flow
    // target is farthest from the fixed one. Scrolling down moves the flow
    // target up: when the fixed one is above (fixed header) that is scroll
    // 0; when it is below (back-to-top button) it is the maximum scroll.
    // Passing a fixed element mid-scroll is never a failure.
    const neighbors = spacingTargets.map((n) => {
      const other = targets[n.index]!;
      if (other.fixed === target.fixed) {
        return n;
      }
      const fixedT = target.fixed ? target : other;
      const flowT = target.fixed ? other : target;
      const scrollY = centerY(fixedT) < centerY(flowT) ? 0 : maxScrollY;
      // Move the neighbor into the subject's frame at that scroll position.
      const dy = other.fixed ? scrollY : -scrollY;
      return {
        ...n,
        bounds: moveY(n.bounds, dy),
        rects: n.rects.map((r) => moveY(r, dy)),
      };
    });
    return evaluateTargetSpacing(spacingTargets[target.index]!, neighbors, {
      diameter: aaThreshold,
      isSameTarget,
    });
  };
}

/**
 * Analyze targets and categorize by pass/fail level.
 */
function analyzeTargets(
  targets: Array<BasicTargetInfo & { accessibleName: string | null }>,
  aaThreshold: number,
  aaaThreshold: number,
  env: { scroll: Point; maxScrollY: number },
): {
  failAA: TargetSizeIssue[];
  failAAAOnly: TargetSizeIssue[];
  passCount: number;
  excepted: TargetSizeIssue[];
} {
  const failAA: TargetSizeIssue[] = [];
  const failAAAOnly: TargetSizeIssue[] = [];
  const excepted: TargetSizeIssue[] = [];
  let passCount = 0;

  // Build href map for redundancy check
  const hrefMap = findRedundantTargets(targets);
  const evaluateSpacing = buildSpacingEvaluator(
    targets,
    aaThreshold,
    env.maxScrollY,
  );

  for (const target of targets) {
    const minDimension = Math.min(target.width, target.height);

    // Determine level
    let level: 'fail-aa' | 'fail-aaa-only' | 'pass';
    if (minDimension >= aaaThreshold) {
      passCount++;
      continue;
    } else if (minDimension >= aaThreshold) {
      level = 'fail-aaa-only';
    } else {
      level = 'fail-aa';
    }

    // Check exceptions (only relevant for fail-aa)
    let exception: TargetSizeException | null = null;
    let exceptionDetails: string | null = null;
    let exceptionAssessment: TargetSizeExceptionAssessment = 'not-assessed';
    let spacing: TargetSpacingResult | null = null;

    if (level === 'fail-aa') {
      // Spacing geometry is evaluated for every undersized target so the
      // result (and the screenshot circle) is available whichever exception
      // is finally recorded.
      spacing = evaluateSpacing(target);
      if (target.fixed) {
        // Fixed targets are evaluated in viewport coordinates; the reported
        // center follows the document-coordinate contract.
        spacing = {
          ...spacing,
          center: {
            x: roundPx(spacing.center.x + env.scroll.x),
            y: roundPx(spacing.center.y + env.scroll.y),
          },
        };
      }

      if (spacing.applies) {
        // Verified geometrically: strongest evidence, wins over heuristics.
        exception = 'spacing';
        exceptionDetails = describeTargetSpacing(spacing);
        exceptionAssessment = 'verified';
      }

      // Check inline exception
      const inlineCheck = checkInlineException(
        target,
        INLINE_CONTEXT_TAGS,
        INLINE_CONTEXT_MIN_TEXT,
      );
      if (!exception && inlineCheck.applies) {
        exception = 'inline';
        exceptionDetails = inlineCheck.details;
      }

      // Check UA control exception
      if (!exception) {
        const uaCheck = checkUAControlException(
          target,
          UA_CONTROLLED_INPUT_TYPES,
        );
        if (uaCheck.applies) {
          exception = 'ua-control';
          exceptionDetails = uaCheck.details;
        }
      }

      // Check redundant exception
      if (!exception && target.href) {
        const sameHrefTargets = hrefMap.get(target.href) || [];
        const hasLargerTarget = sameHrefTargets.some(
          (t) =>
            t.selector !== target.selector &&
            Math.min(t.width, t.height) >= aaThreshold,
        );
        if (hasLargerTarget) {
          exception = 'redundant';
          exceptionDetails = `Another link to same URL meets size requirement`;
        }
      }

      if (exception && exceptionAssessment !== 'verified') {
        // Heuristic exceptions can never rule out manual confirmation.
        exceptionAssessment = 'possible';
      }
      // Otherwise `not-assessed` (initial value): no exception found and the
      // essential exception cannot be ruled out automatically.
    }

    const issue: TargetSizeIssue = {
      selector: target.selector,
      tagName: target.tagName,
      html: target.html,
      htmlTruncated: target.htmlTruncated,
      role: target.role,
      accessibleName: target.accessibleName,
      width: target.width,
      height: target.height,
      minDimension: Math.round(minDimension * 100) / 100,
      level,
      exception,
      exceptionDetails,
      exceptionAssessment,
      href: target.href,
      spacing,
    };

    if (exception) {
      excepted.push(issue);
    } else if (level === 'fail-aa') {
      failAA.push(issue);
    } else {
      failAAAOnly.push(issue);
    }
  }

  return { failAA, failAAAOnly, passCount, excepted };
}

export interface RunTargetSizeCheckOptions extends AuditOutputOptions {
  /** A page already navigated to the target URL. */
  page: Page;
  /** Minimum (AA) threshold in CSS px (default: 24). */
  aaThreshold?: number;
  /** Enhanced (AAA) threshold in CSS px (default: 44). */
  aaaThreshold?: number;
  /** Whether to capture an annotated screenshot (default: false). Mutates the page DOM. */
  screenshot?: boolean;
  /**
   * Whether to resolve each target's accessible name via
   * `locator.ariaSnapshot()` (default: true). One call per target, run
   * sequentially — slow on pages with hundreds of links. When `false`,
   * `accessibleName` is `null` for every target.
   */
  resolveAccessibleNames?: boolean;
}

/**
 * Run the target size check against the current page, write the result JSON
 * (and optionally an annotated screenshot), and return the parsed result.
 */
export async function runTargetSizeCheck(
  options: RunTargetSizeCheckOptions,
): Promise<TargetSizeCheckResult> {
  const {
    page,
    aaThreshold = TARGET_SIZE_AA,
    aaaThreshold = TARGET_SIZE_AAA,
    screenshot = false,
    resolveAccessibleNames = true,
    ...location
  } = options;
  const out = createAuditOutput({
    ...location,
    defaultFile: DEFAULT_TARGET_SIZE_RESULT_FILE,
  });

  // Collect basic target info from DOM
  const {
    targets: basicTargets,
    occludedCount,
    maxScrollY,
    scroll,
  } = await page.evaluate(collectBasicTargetInfo, {
    interactiveSelector: INTERACTIVE_SELECTOR,
    htmlSnippetMaxLength: HTML_SNIPPET_MAX_LENGTH,
  });

  // Enhance with accessible names via ariaSnapshot() (optional: one
  // sequential round trip per target)
  const targets: Array<BasicTargetInfo & { accessibleName: string | null }> =
    [];
  for (const basicTarget of basicTargets) {
    let accessibleName: string | null = null;

    if (resolveAccessibleNames) {
      try {
        const locator = page.locator(basicTarget.selector).first();
        const snapshot = await locator.ariaSnapshot();
        accessibleName = parseAccessibleName(snapshot);
      } catch {
        // If ariaSnapshot fails, accessibleName remains null
      }
    }

    targets.push({
      ...basicTarget,
      accessibleName,
    });
  }

  // Analyze targets
  const { failAA, failAAAOnly, passCount, excepted } = analyzeTargets(
    targets,
    aaThreshold,
    aaaThreshold,
    { scroll, maxScrollY },
  );

  const verifiedSpacing = excepted.filter(
    (t) => t.exceptionAssessment === 'verified',
  );
  const possibleExceptions = excepted.filter(
    (t) => t.exceptionAssessment !== 'verified',
  );

  const details: TargetSizeCheckDetails = {
    totalTargetsChecked: targets.length,
    failAA,
    failAAAOnly,
    passedTargets: passCount,
    occludedTargets: occludedCount,
    exceptedTargets: excepted,
    summary: {
      failAACount: failAA.length,
      failAAAOnlyCount: failAAAOnly.length,
      passCount,
      exceptedCount: excepted.length,
      verifiedCount: verifiedSpacing.length,
    },
  };

  const result: TargetSizeCheckResult = buildAuditResult({
    source: 'target-size-check',
    url: page.url(),
    details,
    buckets: normalizeTargetSizeCheck(details),
  });

  // Output results
  out.header('Target Size Check Results', 'WCAG 2.5.5 / 2.5.8', result.url);

  out.summary({
    'Total targets checked': details.totalTargetsChecked,
    'Skipped (covered by another element or clipped from view)':
      details.occludedTargets,
  });

  out.log('\nSummary:');
  out.log(`  Pass (>= ${aaaThreshold}px): ${details.summary.passCount}`);
  out.log(
    `  Fail AAA only (${aaThreshold}-${aaaThreshold - 1}px): ${details.summary.failAAAOnlyCount}`,
  );
  out.log(`  Fail AA (< ${aaThreshold}px): ${details.summary.failAACount}`);
  out.log(`  Verified spacing exception: ${verifiedSpacing.length}`);
  out.log(`  Possible exceptions: ${possibleExceptions.length}`);

  out.issueList<TargetSizeIssue>(
    `Fail AA (< ${aaThreshold}px) - Requires Fix`,
    failAA,
    (el, i) => {
      const lines = [
        `${i + 1}. <${el.tagName}> "${el.selector}"`,
        `   Size: ${el.width}x${el.height}px (min: ${el.minDimension}px)`,
        `   Name: "${el.accessibleName || 'none'}"`,
      ];
      if (el.spacing) {
        lines.push(`   Spacing: ${describeTargetSpacing(el.spacing)}`);
      }
      return lines;
    },
  );

  out.issueList<TargetSizeIssue>(
    `Fail AAA Only (${aaThreshold}-${aaaThreshold - 1}px) - Recommended Fix`,
    failAAAOnly,
    (el, i) => [
      `${i + 1}. <${el.tagName}> "${el.selector}"`,
      `   Size: ${el.width}x${el.height}px (min: ${el.minDimension}px)`,
      `   Name: "${el.accessibleName || 'none'}"`,
    ],
    5,
  );

  out.issueList<TargetSizeIssue>(
    `Verified Spacing Exception (< ${aaThreshold}px, conforms to 2.5.8)`,
    verifiedSpacing,
    (el, i) => [
      `${i + 1}. <${el.tagName}> "${el.selector}"`,
      `   Size: ${el.width}x${el.height}px (min: ${el.minDimension}px)`,
    ],
    5,
  );

  out.issueList<TargetSizeIssue>(
    'Possible Exceptions (Manual Review Recommended)',
    possibleExceptions,
    (el, i) => {
      const lines = [
        `${i + 1}. <${el.tagName}> "${el.selector}"`,
        `   Size: ${el.width}x${el.height}px (min: ${el.minDimension}px)`,
        `   Exception: ${el.exception} - ${el.exceptionDetails}`,
      ];
      if (el.spacing) {
        lines.push(`   Spacing: ${describeTargetSpacing(el.spacing)}`);
      }
      return lines;
    },
    5,
  );

  out.save(result);

  let screenshotPath: string | undefined;
  if (screenshot) {
    // Build annotations for screenshot
    const passSelectors = targets
      .filter((t) => Math.min(t.width, t.height) >= aaaThreshold)
      .map((t) => t.selector);

    const annotations: AnnotationConfig[] = [
      ...passSelectors.map((s) => ({
        selector: s,
        label: 'PASS',
        colorScheme: 'pass' as const,
      })),
      ...failAAAOnly.map((t) => ({
        selector: t.selector,
        label: 'AA Pass',
        colorScheme: 'warning' as const,
      })),
      ...failAA.map((t) => ({
        selector: t.selector,
        label: 'AA Fail',
        colorScheme: 'fail' as const,
      })),
      ...verifiedSpacing.map((t) => ({
        selector: t.selector,
        label: 'Spacing OK',
        colorScheme: 'info' as const,
      })),
      ...possibleExceptions.map((t) => ({
        selector: t.selector,
        label: 'Exception',
        colorScheme: 'info' as const,
      })),
    ];

    // Spacing circles for every undersized target
    const circles: CircleAnnotationConfig[] = [...failAA, ...excepted].flatMap(
      (t): CircleAnnotationConfig[] =>
        t.spacing
          ? [
              {
                x: t.spacing.center.x,
                y: t.spacing.center.y,
                diameter: t.spacing.diameter,
                colorScheme: t.spacing.applies ? 'pass' : 'fail',
              },
            ]
          : [],
    );

    await addPageAnnotations(page, annotations, circles);
    screenshotPath = await takeAuditScreenshot(page, {
      path: resolveScreenshotPath(
        out.resultPath,
        DEFAULT_TARGET_SIZE_SCREENSHOT_FILE,
      ),
    });

    // Legend
    out.log('\nLegend:');
    out.log(`  PASS (green): >= ${aaaThreshold}px - AA Pass, AAA Pass`);
    out.log(
      `  AA Pass (orange): ${aaThreshold}-${aaaThreshold - 1}px - AA Pass, AAA Fail`,
    );
    out.log(`  AA Fail (red): < ${aaThreshold}px - AA Fail, AAA Fail`);
    out.log(
      `  Spacing OK (blue): < ${aaThreshold}px but spacing exception verified`,
    );
    out.log(`  Exception (blue): Possible exception (manual review needed)`);
    out.log(
      `  Circles (${aaThreshold}px): green = no other target inside, red = intersects another target`,
    );
  }

  out.outputPaths(screenshotPath);

  return result;
}
