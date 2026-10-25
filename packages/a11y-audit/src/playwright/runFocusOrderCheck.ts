/**
 * Focus Order Check
 *
 * WCAG 2.4.3 (Focus Order)
 *
 * Two observations, both reported as `incomplete` (whether the order still
 * preserves meaning and operability is for a human to decide):
 *
 * 1. Presses Tab through the main document and records where each focused
 *    element sits. `analyzeFocusOrder` then reports moves against the visual
 *    reading order: back up the page, backwards along a row, and long jumps
 *    that return to where they started.
 * 2. Reloads the page, presses Enter on each likely dialog trigger and Escape
 *    (or a close button) to close it, and records where focus went when a
 *    modal dialog opened and when it closed.
 *
 * Like the change-on-input check, this one owns its `BrowserContext`, so it
 * accepts a `browser` (not a `page`) and navigates internally. The context it
 * creates is closed before it returns.
 *
 * Limitations:
 * - The visual order is estimated with a simple rule (top to bottom, along the
 *   reading direction within a row, a move back up lands in the next column).
 *   Card grids, horizontal scrolling and vertical `writing-mode` can be misjudged.
 * - Elements that are, or sit inside, `position: fixed` / `sticky` are not
 *   compared (Tab scrolling moves their page coordinates). Elements without a
 *   size are not compared either.
 * - While focus is inside an iframe the iframe's box is the position and the
 *   order inside it is not examined. Only open shadow roots are entered.
 * - Dialogs are opened only from controls with `aria-haspopup="dialog"`, an
 *   `aria-controls` pointing at a dialog, `commandfor` + `command="show-modal"`,
 *   or a common library's `data-*` attribute. A dialog opened by a plain button
 *   is not seen.
 * - It presses Enter to open and Escape / a close button to close, after a
 *   reload per trigger. A trigger that also submits or navigates sends
 *   requests; `maxDialogTriggers: 0` presses no trigger.
 * - Focus trapping inside the dialog (leaking out on Tab) is not examined.
 * - Focus that does not return to the trigger can be right (the trigger is
 *   gone, the flow moves on), hence `incomplete`.
 * - A page script that never returns cannot be interrupted.
 */

import type {
  BrowserContext,
  BrowserContextOptions,
  Page,
} from '@playwright/test';
import type {
  FocusOrderCheckDetails,
  FocusOrderCheckResult,
  FocusOrderDialogProbe,
  FocusOrderStop,
  PageRect,
} from '../types.js';
import {
  DEFAULT_FOCUS_ORDER_RESULT_FILE,
  FOCUS_ORDER_SETTLE_MS,
  FOCUSABLE_SELECTOR,
  FOCUS_ORDER_DIALOG_CLOSE_NAME_PATTERN,
  FOCUS_ORDER_DIALOG_CLOSE_SELECTOR,
  FOCUS_ORDER_DIALOG_SELECTOR,
  FOCUS_ORDER_DIALOG_SETTLE_MS,
  FOCUS_ORDER_DIALOG_TARGET_SELECTOR,
  FOCUS_ORDER_DIALOG_TRIGGER_SELECTOR,
  FOCUS_ORDER_FRAME_SLACK,
  FOCUS_ORDER_MAX_DIALOG_TRIGGERS,
  FOCUS_ORDER_MAX_TAB_PRESSES,
  FOCUS_ORDER_TAB_SLACK,
  FOCUS_ORDER_TIMEOUT_MS,
  HTML_SNIPPET_MAX_LENGTH,
} from '../constants.js';
import {
  buildAuditResult,
  normalizeFocusOrderCheck,
} from '../utils/axe-format.js';
import { analyzeFocusOrder } from '../utils/focus-order.js';
import { gotoAndSettle } from './gotoAndSettle.js';
import {
  assertWalkLimits,
  createAuditOutput,
  requireTargetUrl,
  resolveCreateContext,
  type AuditOutputOptions,
  type ContextSourceOptions,
} from '../utils/test-harness.js';

export interface RunFocusOrderCheckOptions
  extends AuditOutputOptions, ContextSourceOptions {
  /** Target URL. Falls back to the `TEST_PAGE` env var; required. */
  targetUrl?: string;
  /** Options forwarded to `browser.newContext()`. Ignored when `createContext` is used. */
  contextOptions?: BrowserContextOptions;
  /** Wait after each Tab press (default: FOCUS_ORDER_SETTLE_MS). */
  settleMs?: number;
  /** Wall-clock budget for the whole check (default: FOCUS_ORDER_TIMEOUT_MS). */
  timeBudgetMs?: number;
  /** Cap on Tab presses (default: FOCUS_ORDER_MAX_TAB_PRESSES). */
  maxTabPresses?: number;
  /**
   * Dialog triggers to open and close (default: FOCUS_ORDER_MAX_DIALOG_TRIGGERS).
   * 0 presses no trigger (triggers are still collected and counted). Opening
   * presses Enter on the trigger after a reload.
   */
  maxDialogTriggers?: number;
}

/** Timeout for a single Playwright action, so a stuck one cannot eat the whole budget. */
const ACTION_TIMEOUT_MS = 5_000;

/**
 * Errors Playwright throws when the page is replaced under an action. Matched
 * against the first line only: later lines are a call log.
 */
const NAVIGATION_ERROR =
  /Execution context was destroyed|Frame was detached|Target page, context or browser has been closed/i;

/** Compare pages by URL without the fragment: a hash-only change is not a navigation. */
const withoutHash = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
};

const firstLine = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';

// =============================================================================
// Browser-side functions (serialized by Playwright; keep them self-contained)
//
// Functions passed to page.evaluate cannot share helpers, so each one that
// needs getUniqueSelector carries its own copy. Keep them in step: the copies
// in describeFocus and locateFocus are shadow-root aware (relative to the
// containing root); the others only see the light DOM and prefix `body > `.
// =============================================================================

interface FocusDescription {
  elementId: number;
  selector: string;
  shadowHosts: string[];
  tag: string;
  role: string | null;
  name: string;
  html: string;
  htmlTruncated: boolean;
  rect: PageRect;
  positioning: 'flow' | 'fixed' | 'sticky';
  inFrame: boolean;
}

/** Focusable elements (through open shadow roots) and frames. Runs in the browser. */
function countFocusable(args: { focusableSelector: string }): {
  focusableCount: number;
  frameCount: number;
} {
  const count = (root: Document | ShadowRoot): number =>
    root.querySelectorAll(args.focusableSelector).length +
    [...root.querySelectorAll('*')].reduce(
      (sum, host) => sum + (host.shadowRoot ? count(host.shadowRoot) : 0),
      0,
    );
  return {
    focusableCount: count(document),
    frameCount: document.querySelectorAll('iframe, frame').length,
  };
}

/** Describe the focused element, or null when nothing in the page has focus. Runs in the browser. */
function describeFocus(args: { snippetMax: number }): FocusDescription | null {
  // Relative to the root (document or shadow root) that contains the element.
  // Keep in sync with getUniqueSelector in the other browser-side functions.
  function getUniqueSelector(element: Element): string {
    const root = element.getRootNode() as Document | ShadowRoot;
    const idSelector = `[id="${element.id.replace(/["\\]/g, '\\$&')}"]`;
    if (element.id && root.querySelectorAll(idSelector).length === 1) {
      return `#${CSS.escape(element.id)}`;
    }
    const path: string[] = [];
    let current: Element | null = element;
    while (
      current &&
      current !== document.body &&
      current !== document.documentElement
    ) {
      const siblings: Element[] = Array.from(
        current.parentElement
          ? current.parentElement.children
          : (root as ShadowRoot).children,
      );
      path.unshift(
        `${current.tagName.toLowerCase()}:nth-child(${siblings.indexOf(current) + 1})`,
      );
      current = current.parentElement;
    }
    return (root instanceof Document ? 'body > ' : '') + path.join(' > ');
  }

  let el: Element | null = document.activeElement;
  const hosts: Element[] = [];
  while (el?.shadowRoot?.activeElement) {
    hosts.push(el);
    el = el.shadowRoot.activeElement;
  }
  if (!el || el === document.body || el === document.documentElement) {
    return null;
  }

  const w = window as unknown as {
    __a11yFocusOrderIds?: WeakMap<Element, number>;
    __a11yFocusOrderNext?: number;
  };
  const ids = (w.__a11yFocusOrderIds ??= new WeakMap<Element, number>());
  let elementId = ids.get(el);
  if (elementId === undefined) {
    elementId = w.__a11yFocusOrderNext = (w.__a11yFocusOrderNext ?? 0) + 1;
    ids.set(el, elementId);
  }

  const box = el.getBoundingClientRect();
  const outerHTML = el.outerHTML;

  let positioning: 'flow' | 'fixed' | 'sticky' = 'flow';
  for (let node: Element | null = el; node;) {
    const position = getComputedStyle(node).position;
    if (position === 'fixed') {
      positioning = 'fixed';
      break;
    }
    if (position === 'sticky') positioning = 'sticky';
    const root = node.getRootNode();
    node =
      node.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
  }

  return {
    elementId,
    selector: getUniqueSelector(el),
    shadowHosts: hosts.map(getUniqueSelector),
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role'),
    name: (el.getAttribute('aria-label') || el.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80),
    html: outerHTML.slice(0, args.snippetMax),
    htmlTruncated: outerHTML.length > args.snippetMax,
    rect: {
      x: box.left + window.scrollX,
      y: box.top + window.scrollY,
      width: box.width,
      height: box.height,
    },
    positioning,
    inFrame: el.tagName === 'IFRAME' || el.tagName === 'FRAME',
  };
}

interface DialogTrigger {
  selector: string;
  tag: string;
  role: string | null;
  name: string;
  html: string;
  htmlTruncated: boolean;
}

/** Controls that likely open a dialog, in page order. Runs in the browser. */
function collectDialogTriggers(args: {
  triggerSelector: string;
  dialogSelector: string;
  targetSelector: string;
  snippetMax: number;
}): DialogTrigger[] {
  // Keep in sync with getUniqueSelector in the other browser-side functions.
  function getUniqueSelector(element: Element): string {
    const idSelector = `[id="${element.id.replace(/["\\]/g, '\\$&')}"]`;
    if (element.id && document.querySelectorAll(idSelector).length === 1) {
      return `#${CSS.escape(element.id)}`;
    }
    const path: string[] = [];
    let current: Element | null = element;
    while (
      current &&
      current !== document.body &&
      current !== document.documentElement
    ) {
      const parent: Element | null = current.parentElement;
      path.unshift(
        `${current.tagName.toLowerCase()}:nth-child(${parent ? Array.from(parent.children).indexOf(current) + 1 : 1})`,
      );
      current = parent;
    }
    return `body > ${path.join(' > ')}`;
  }

  const isTrigger = (el: Element): boolean => {
    if (el.matches(args.triggerSelector)) return true;
    const controls = el.getAttribute('aria-controls');
    if (
      controls
        ?.split(/\s+/)
        .some((id) => document.getElementById(id)?.matches(args.targetSelector))
    ) {
      return true;
    }
    return (
      el.hasAttribute('commandfor') &&
      el.getAttribute('command') === 'show-modal'
    );
  };

  const seen = new Set<string>();
  const triggers: DialogTrigger[] = [];
  const candidates = document.querySelectorAll(
    `${args.triggerSelector}, [aria-controls], [commandfor]`,
  );
  for (const el of candidates) {
    if (!isTrigger(el)) continue;
    if (!el.checkVisibility({ visibilityProperty: true })) continue;
    if (el.getClientRects().length === 0) continue;
    if (el.matches(':disabled') || el.closest('[inert]')) continue;
    const selector = getUniqueSelector(el);
    if (seen.has(selector)) continue;
    seen.add(selector);
    const outerHTML = el.outerHTML;
    triggers.push({
      selector,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      name: (el.getAttribute('aria-label') || el.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80),
      html: outerHTML.slice(0, args.snippetMax),
      htmlTruncated: outerHTML.length > args.snippetMax,
    });
  }
  return triggers;
}

/** Selectors of the dialogs that are visible now. Runs in the browser. */
function visibleDialogs(args: { dialogSelector: string }): string[] {
  // Keep in sync with getUniqueSelector in the other browser-side functions.
  function getUniqueSelector(element: Element): string {
    const idSelector = `[id="${element.id.replace(/["\\]/g, '\\$&')}"]`;
    if (element.id && document.querySelectorAll(idSelector).length === 1) {
      return `#${CSS.escape(element.id)}`;
    }
    const path: string[] = [];
    let current: Element | null = element;
    while (
      current &&
      current !== document.body &&
      current !== document.documentElement
    ) {
      const parent: Element | null = current.parentElement;
      path.unshift(
        `${current.tagName.toLowerCase()}:nth-child(${parent ? Array.from(parent.children).indexOf(current) + 1 : 1})`,
      );
      current = parent;
    }
    return `body > ${path.join(' > ')}`;
  }
  return [...document.querySelectorAll(args.dialogSelector)]
    .filter(
      (el) =>
        el.checkVisibility({ visibilityProperty: true }) &&
        el.getClientRects().length > 0,
    )
    .map(getUniqueSelector);
}

interface FocusPlace {
  where: 'inside' | 'trigger' | 'body' | 'elsewhere';
  selector: string | null;
}

/**
 * Where focus is, relative to the trigger and (when given) the dialog. Runs in
 * the browser.
 */
function locateFocus(args: {
  triggerSelector: string;
  dialogSelector: string | null;
}): FocusPlace {
  // Keep in sync with getUniqueSelector in the other browser-side functions.
  function getUniqueSelector(element: Element): string {
    const root = element.getRootNode() as Document | ShadowRoot;
    const idSelector = `[id="${element.id.replace(/["\\]/g, '\\$&')}"]`;
    if (element.id && root.querySelectorAll(idSelector).length === 1) {
      return `#${CSS.escape(element.id)}`;
    }
    const path: string[] = [];
    let current: Element | null = element;
    while (
      current &&
      current !== document.body &&
      current !== document.documentElement
    ) {
      const siblings: Element[] = Array.from(
        current.parentElement
          ? current.parentElement.children
          : (root as ShadowRoot).children,
      );
      path.unshift(
        `${current.tagName.toLowerCase()}:nth-child(${siblings.indexOf(current) + 1})`,
      );
      current = current.parentElement;
    }
    return (root instanceof Document ? 'body > ' : '') + path.join(' > ');
  }

  let active: Element | null = document.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  if (
    !active ||
    active === document.body ||
    active === document.documentElement
  ) {
    return { where: 'body', selector: null };
  }
  const dialog = args.dialogSelector
    ? document.querySelector(args.dialogSelector)
    : null;
  if (dialog) {
    for (let node: Element | null = active; node;) {
      if (dialog.contains(node)) return { where: 'inside', selector: null };
      const root = node.getRootNode();
      node = root instanceof ShadowRoot ? root.host : null;
    }
  }
  const selector = getUniqueSelector(active);
  if (
    active === document.querySelector(args.triggerSelector) ||
    (active.getRootNode() instanceof Document &&
      selector === args.triggerSelector)
  ) {
    return { where: 'trigger', selector: null };
  }
  return { where: 'elsewhere', selector };
}

/**
 * The dialog that appeared since `before`: its selector, whether it is modal,
 * and where focus went. Null when none appeared. Runs in the browser.
 */
function inspectOpenedDialog(args: {
  before: string[];
  dialogSelector: string;
}): { dialogSelector: string; modal: boolean } | null {
  // Keep in sync with getUniqueSelector in the other browser-side functions.
  function getUniqueSelector(element: Element): string {
    const idSelector = `[id="${element.id.replace(/["\\]/g, '\\$&')}"]`;
    if (element.id && document.querySelectorAll(idSelector).length === 1) {
      return `#${CSS.escape(element.id)}`;
    }
    const path: string[] = [];
    let current: Element | null = element;
    while (
      current &&
      current !== document.body &&
      current !== document.documentElement
    ) {
      const parent: Element | null = current.parentElement;
      path.unshift(
        `${current.tagName.toLowerCase()}:nth-child(${parent ? Array.from(parent.children).indexOf(current) + 1 : 1})`,
      );
      current = parent;
    }
    return `body > ${path.join(' > ')}`;
  }
  const opened = [...document.querySelectorAll(args.dialogSelector)].filter(
    (el) =>
      el.checkVisibility({ visibilityProperty: true }) &&
      el.getClientRects().length > 0 &&
      !args.before.includes(getUniqueSelector(el)),
  );
  // The last one in page order is the innermost when dialogs nest.
  const dialog = opened.at(-1);
  if (!dialog) return null;
  return {
    dialogSelector: getUniqueSelector(dialog),
    modal:
      dialog.matches('dialog:modal') ||
      dialog.getAttribute('aria-modal') === 'true',
  };
}

/** Whether the dialog is still on screen. Runs in the browser. */
function isDialogVisible(args: { dialogSelector: string }): boolean {
  const dialog = document.querySelector(args.dialogSelector);
  return (
    !!dialog &&
    dialog.checkVisibility({ visibilityProperty: true }) &&
    dialog.getClientRects().length > 0
  );
}

/** Selector of the first visible close button inside the dialog, or null. Runs in the browser. */
function findCloseButton(args: {
  dialogSelector: string;
  closeSelector: string;
  namePattern: { source: string; flags: string };
}): string | null {
  const dialog = document.querySelector(args.dialogSelector);
  if (!dialog) return null;
  const pattern = new RegExp(args.namePattern.source, args.namePattern.flags);
  for (const el of dialog.querySelectorAll(
    `${args.closeSelector}, button, [role="button"]`,
  )) {
    if (!el.checkVisibility({ visibilityProperty: true })) continue;
    if (el.getClientRects().length === 0) continue;
    const name = (el.getAttribute('aria-label') || el.textContent || '').trim();
    if (!el.matches(args.closeSelector) && !pattern.test(name)) continue;

    const idSelector = `[id="${el.id.replace(/["\\]/g, '\\$&')}"]`;
    if (el.id && document.querySelectorAll(idSelector).length === 1) {
      return `#${CSS.escape(el.id)}`;
    }
    const path: string[] = [];
    let current: Element | null = el;
    while (
      current &&
      current !== document.body &&
      current !== document.documentElement
    ) {
      const parent: Element | null = current.parentElement;
      path.unshift(
        `${current.tagName.toLowerCase()}:nth-child(${parent ? Array.from(parent.children).indexOf(current) + 1 : 1})`,
      );
      current = parent;
    }
    return `body > ${path.join(' > ')}`;
  }
  return null;
}

// =============================================================================
// Runner
// =============================================================================

/**
 * Run the focus-order check against the target URL, write the result JSON, and
 * return the parsed result.
 */
export async function runFocusOrderCheck(
  options: RunFocusOrderCheckOptions,
): Promise<FocusOrderCheckResult> {
  const {
    browser,
    createContext,
    targetUrl: targetUrlOption,
    contextOptions,
    settleMs = FOCUS_ORDER_SETTLE_MS,
    timeBudgetMs = FOCUS_ORDER_TIMEOUT_MS,
    maxTabPresses = FOCUS_ORDER_MAX_TAB_PRESSES,
    maxDialogTriggers = FOCUS_ORDER_MAX_DIALOG_TRIGGERS,
    ...location
  } = options;

  assertWalkLimits({ timeBudgetMs, maxTabPresses });
  if (!(
    typeof settleMs === 'number' &&
    Number.isFinite(settleMs) &&
    settleMs > 0
  )) {
    throw new Error(
      `\`settleMs\` must be a positive finite number of milliseconds (got ${String(settleMs)}).`,
    );
  }
  if (!(Number.isInteger(maxDialogTriggers) && maxDialogTriggers >= 0)) {
    throw new Error(
      `\`maxDialogTriggers\` must be a non-negative integer (got ${String(maxDialogTriggers)}).`,
    );
  }

  const newContext = resolveCreateContext(
    { browser, createContext },
    contextOptions,
  );
  const targetUrl = requireTargetUrl(targetUrlOption);
  const out = createAuditOutput({
    ...location,
    defaultFile: DEFAULT_FOCUS_ORDER_RESULT_FILE,
  });

  const startedAt = Date.now();
  const timedOut = (): boolean => Date.now() - startedAt > timeBudgetMs;
  // Held outside `try` so it is closed in `finally` even if a step throws.
  let context: BrowserContext | null = null;

  try {
    context = await newContext();
    const page: Page = await context.newPage();
    page.setDefaultTimeout(ACTION_TIMEOUT_MS);
    // The line above also caps page.goto; keep Playwright's default for navigations.
    page.setDefaultNavigationTimeout(30_000);

    // --- A. Tab walk --------------------------------------------------------
    await gotoAndSettle(page, targetUrl);
    const startUrl = page.url();
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
    const direction = await page.evaluate(() =>
      getComputedStyle(document.documentElement).direction === 'rtl'
        ? ('rtl' as const)
        : ('ltr' as const),
    );
    const { focusableCount, frameCount } = await page.evaluate(countFocusable, {
      focusableSelector: FOCUSABLE_SELECTOR,
    });
    const wanted =
      focusableCount +
      FOCUS_ORDER_TAB_SLACK +
      frameCount * FOCUS_ORDER_FRAME_SLACK;
    const pressN = Math.min(wanted, maxTabPresses);

    const stops: FocusOrderStop[] = [];
    let aborted: FocusOrderCheckDetails['aborted'] = null;
    let ended: FocusOrderCheckDetails['tabWalk']['ended'] = 'tab-limit';
    let presses = 0;
    // Where the walk started: the element focused at load (it may not be
    // tabbable) and the first element reached by Tab. Returning to either
    // ends the walk.
    const starts = new Map<number, FocusOrderStop>();
    let firstTabSeen = false;
    // Element of the previous press; reset when focus left the page, so that a
    // single focusable element is recognized again after the walk wraps.
    let lastId: number | null = null;
    // Focus left the page after at least one stop: the next stop follows a wrap.
    let wrapped = false;

    // Focus may already sit on an element at load (autofocus or script): it is
    // the first stop (step 0) and the walk starts from there.
    const initial = await page.evaluate(describeFocus, {
      snippetMax: HTML_SNIPPET_MAX_LENGTH,
    });
    if (initial !== null) {
      lastId = initial.elementId;
      const stop = toStop(initial, 0, false, false);
      starts.set(initial.elementId, stop);
      stops.push(stop);
    }

    while (true) {
      if (presses >= pressN) {
        ended = 'tab-limit';
        break;
      }
      if (timedOut()) {
        ended = 'timeout';
        aborted = { reason: 'timeout', url: page.url() };
        break;
      }
      presses += 1;
      let described: FocusDescription | null;
      try {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(settleMs);
        if (withoutHash(page.url()) !== withoutHash(startUrl)) {
          ended = 'navigation';
          aborted = { reason: 'navigation', url: page.url() };
          break;
        }
        described = await page.evaluate(describeFocus, {
          snippetMax: HTML_SNIPPET_MAX_LENGTH,
        });
      } catch (error) {
        if (!NAVIGATION_ERROR.test(firstLine(error))) throw error;
        ended = 'navigation';
        aborted = { reason: 'navigation', url: page.url() };
        break;
      }
      if (described === null) {
        lastId = null;
        if (stops.length > 0) wrapped = true;
        continue;
      }
      if (described.elementId === lastId) continue;
      lastId = described.elementId;
      const start = starts.get(described.elementId);
      if (start) {
        // Back at a starting element. When focus stayed in the page since the
        // last stop, record it again so the closing move is compared too.
        if (!wrapped) {
          // Built from what is observed now, not from the earlier stop.
          stops.push(toStop(described, presses, false, true));
        }
        ended = 'cycle';
        break;
      }
      const stop = toStop(described, presses, wrapped, false);
      if (!firstTabSeen) {
        firstTabSeen = true;
        starts.set(described.elementId, stop);
      }
      stops.push(stop);
      wrapped = false;
    }

    const { transitions, detours, skippedTransitions } = analyzeFocusOrder(
      stops.map((stop) => ({
        rect: stop.rect,
        positioning: stop.positioning,
        breakBefore: stop.afterWrap,
      })),
      { viewport, direction },
    );

    // --- B. Dialogs ---------------------------------------------------------
    const dialogs: FocusOrderDialogProbe[] = [];
    let dialogsNotTried = 0;
    let allTriggers: DialogTrigger[] = [];
    let dialogSearch: FocusOrderCheckDetails['dialogSearch'] = 'ran';
    let dialogSearchError: string | null = null;
    if (timedOut()) {
      dialogSearch = 'timeout';
      aborted ??= { reason: 'timeout', url: page.url() };
    } else {
      try {
        await reload(page, targetUrl);
        if (withoutHash(page.url()) !== withoutHash(startUrl)) {
          // A script redirected away right after load.
          dialogSearch = 'navigated';
          aborted ??= { reason: 'navigation', url: page.url() };
        } else {
          allTriggers = await page.evaluate(collectDialogTriggers, {
            triggerSelector: FOCUS_ORDER_DIALOG_TRIGGER_SELECTOR,
            dialogSelector: FOCUS_ORDER_DIALOG_SELECTOR,
            targetSelector: FOCUS_ORDER_DIALOG_TARGET_SELECTOR,
            snippetMax: HTML_SNIPPET_MAX_LENGTH,
          });
        }
      } catch (error) {
        // Whatever goes wrong here must not lose the Tab-walk result.
        if (NAVIGATION_ERROR.test(firstLine(error))) {
          dialogSearch = 'navigated';
          aborted ??= { reason: 'navigation', url: page.url() };
        } else {
          dialogSearch = 'error';
          dialogSearchError = firstLine(error);
        }
      }
    }
    const triggers = allTriggers.slice(0, maxDialogTriggers);

    for (const [index, trigger] of triggers.entries()) {
      if (timedOut()) {
        dialogsNotTried = triggers.length - index;
        aborted ??= { reason: 'timeout', url: page.url() };
        break;
      }
      const probe: FocusOrderDialogProbe = {
        trigger,
        status: 'not-opened',
        dialogSelector: null,
        modal: null,
        focusAfterOpen: null,
        focusAfterOpenSelector: null,
        closedBy: null,
        focusAfterClose: null,
        focusAfterCloseSelector: null,
        error: null,
      };
      dialogs.push(probe);
      try {
        await probeDialog(page, targetUrl, probe);
      } catch (error) {
        // Values observed before the failure stay in `probe`.
        if (NAVIGATION_ERROR.test(firstLine(error))) {
          probe.status = 'navigated';
        } else {
          probe.status = 'error';
          probe.error = firstLine(error);
        }
      }
    }

    const details: FocusOrderCheckDetails = {
      viewport,
      direction,
      stops,
      transitions,
      skippedTransitions,
      detours,
      tabWalk: {
        presses,
        ended,
        capped: wanted > maxTabPresses,
        focusableCount,
        frameCount,
      },
      dialogTriggersFound: allTriggers.length,
      dialogs,
      dialogsNotTried,
      dialogSearch,
      dialogSearchError,
      aborted,
    };
    const result = buildAuditResult({
      source: 'focus-order-check',
      url: startUrl,
      details,
      buckets: normalizeFocusOrderCheck(details),
    });
    out.save(result);
    out.header('Focus Order Results', 'WCAG 2.4.3', startUrl);
    out.summary({
      'Tab stops': stops.length,
      'Walk ended': ended,
      'Moves against visual order': transitions.filter(
        (t) => t.kind === 'backward-block' || t.kind === 'backward-inline',
      ).length,
      Detours: detours.length,
      'Dialogs tried': dialogs.length,
    });
    out.outputPaths();
    return result;
  } finally {
    await context?.close();
  }
}

function toStop(
  described: FocusDescription,
  step: number,
  afterWrap: boolean,
  revisit: boolean,
): FocusOrderStop {
  return {
    step,
    selector: described.selector,
    shadowHosts: described.shadowHosts,
    tag: described.tag,
    role: described.role,
    name: described.name,
    html: described.html,
    htmlTruncated: described.htmlTruncated,
    rect: described.rect,
    positioning: described.positioning,
    inFrame: described.inFrame,
    afterWrap,
    revisit,
  };
}

/**
 * Load the page afresh. When the page already sits on the target URL with a
 * #fragment, goto is a same-document navigation that keeps the page state, so
 * state would leak between probes; going through about:blank forces a real load.
 */
async function reload(page: Page, targetUrl: string): Promise<void> {
  await page.goto('about:blank');
  await gotoAndSettle(page, targetUrl);
}

/**
 * Open one dialog from its trigger, close it, and record where focus went.
 * Fills `probe` as it observes, so a navigation or error part-way keeps what was
 * seen. Throws on unexpected errors (the caller records them).
 */
async function probeDialog(
  page: Page,
  targetUrl: string,
  probe: FocusOrderDialogProbe,
): Promise<void> {
  const triggerSelector = probe.trigger.selector;
  const dialogSettle = (): Promise<void> =>
    page.waitForTimeout(FOCUS_ORDER_DIALOG_SETTLE_MS);

  await reload(page, targetUrl);
  const baseline = withoutHash(page.url());
  const before = await page.evaluate(visibleDialogs, {
    dialogSelector: FOCUS_ORDER_DIALOG_SELECTOR,
  });

  await page.locator(triggerSelector).first().focus({
    timeout: ACTION_TIMEOUT_MS,
  });
  await page.keyboard.press('Enter');
  await dialogSettle();
  const navigated = (): boolean => {
    if (withoutHash(page.url()) === baseline) return false;
    probe.status = 'navigated';
    return true;
  };
  if (navigated()) return;

  const opened = await page.evaluate(inspectOpenedDialog, {
    before,
    dialogSelector: FOCUS_ORDER_DIALOG_SELECTOR,
  });
  if (!opened) return;
  probe.status = 'opened';
  probe.dialogSelector = opened.dialogSelector;
  probe.modal = opened.modal;
  const afterOpen = await page.evaluate(locateFocus, {
    triggerSelector,
    dialogSelector: opened.dialogSelector,
  });
  probe.focusAfterOpen = afterOpen.where;
  probe.focusAfterOpenSelector = afterOpen.selector;

  const stillOpen = (): Promise<boolean> =>
    page.evaluate(isDialogVisible, { dialogSelector: opened.dialogSelector });

  await page.keyboard.press('Escape');
  await dialogSettle();
  if (navigated()) return;
  if (!(await stillOpen())) {
    probe.closedBy = 'escape';
  } else {
    const closeSelector = await page.evaluate(findCloseButton, {
      dialogSelector: opened.dialogSelector,
      closeSelector: FOCUS_ORDER_DIALOG_CLOSE_SELECTOR,
      namePattern: {
        source: FOCUS_ORDER_DIALOG_CLOSE_NAME_PATTERN.source,
        flags: FOCUS_ORDER_DIALOG_CLOSE_NAME_PATTERN.flags,
      },
    });
    if (closeSelector === null) return;
    await page.locator(closeSelector).first().focus({
      timeout: ACTION_TIMEOUT_MS,
    });
    await page.keyboard.press('Enter');
    await dialogSettle();
    if (navigated()) return;
    if (await stillOpen()) return;
    probe.closedBy = 'close-button';
  }

  const afterClose = await page.evaluate(locateFocus, {
    triggerSelector,
    dialogSelector: null,
  });
  // 'inside' cannot occur without a dialog selector.
  if (afterClose.where !== 'inside') {
    probe.focusAfterClose = afterClose.where;
    probe.focusAfterCloseSelector = afterClose.selector;
  }
}
