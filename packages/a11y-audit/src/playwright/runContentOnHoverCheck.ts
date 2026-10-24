/**
 * Content on Hover or Focus Check
 *
 * WCAG 1.4.13 (Content on Hover or Focus)
 *
 * Finds elements that may show content on hover or focus, hovers and focuses
 * them, finds the elements that became visible, and measures three
 * conditions: the content can be dismissed (Escape, without moving the pointer
 * or focus), the pointer can move onto it, and it stays until dismissed or the
 * pointer or focus leaves the trigger. A failed condition is `incomplete`: the
 * exceptions (content that reports an input error, content that does not
 * obscure or replace other content) need a human.
 *
 * Triggers come from two places only:
 * - CSS rules with `:hover` / `:focus` / `:focus-within` / `:focus-visible`
 *   followed by a combinator (`.menu:hover > .sub`); the part before the
 *   pseudo-class and everything after the pseudo-classes are removed from it
 *   gives the trigger elements;
 * - listeners for mouseenter / mouseover / pointerenter / pointerover / focus /
 *   focusin attached to the element itself (read with CDP, Chromium only).
 * Listeners on window, document, <html>, <body> or on an element with
 * POINTER_GESTURE_DELEGATION_MIN_TYPES or more event types (a framework root)
 * serve elements that CDP cannot tell apart: they are reported as delegation
 * roots (all three rules `incomplete`, one page node) and not tried. With no
 * trigger and no delegation root nothing is hovered or focused (inapplicable).
 *
 * Like the character key shortcut check, this one owns its `BrowserContext`:
 * when content could not be put away it continues with the remaining triggers
 * in a fresh context. For that reason it accepts a `browser` (not a `page`) and
 * navigates internally. The contexts it creates are closed before it returns.
 *
 * Limitations:
 * - Triggers are CSS rules with a combinator after the pseudo-class and
 *   listeners on the element itself (Chromium only). Attributes (`title`,
 *   `aria-describedby`, `aria-haspopup`) alone make no trigger. Rules of
 *   cross-origin style sheets are not read (reported). At most `maxTriggers`
 *   triggers are tried (the rest is reported). Elements inside iframes are
 *   not looked at. Visible elements with hover or focus listeners inside
 *   shadow roots are not tried; they are counted and reported
 *   (`shadowTriggersSkipped`).
 * - Content shown through delegated listeners (React and the like) is not
 *   measured; it is reported as a delegation root and left to a human. Outside
 *   Chromium delegation cannot be detected either (reported).
 * - New content is an element that was not visible before and is now: content
 *   that only changes inside an element that was already visible, that is
 *   shown with `opacity` or `transform` alone, or that is drawn on a canvas is
 *   not found.
 * - Dismissal is tried with Escape only; another way (a close button, a
 *   modifier key) still shows up as a failure. When Escape dismisses the
 *   content but also moves focus, it is reported too (the dismissal might be
 *   a side effect of the blur).
 * - When the trigger itself is not focusable, only its first focusable
 *   descendant is focused; content shown only by another descendant is missed.
 * - "Stays" is judged over `persistMs` only. The pointer moves from the center
 *   of the trigger straight to the center of the largest new element; content
 *   that is reachable only by another path is reported as a failure. The
 *   pointer is tried on content only when it stayed for `persistMs`.
 * - Between triggers the pointer goes to a corner, focus is blurred and Escape
 *   is pressed. Only content that is still visible afterwards makes the check
 *   reload the page (a new context; state kept in localStorage is gone).
 * - It really focuses elements: a page that navigates on focus is reported as
 *   not tried (`navigated`). It does not click.
 * - A page script that never returns (infinite loop) cannot be interrupted.
 */

import { randomUUID } from 'node:crypto';
import type {
  BrowserContext,
  BrowserContextOptions,
  Page,
} from '@playwright/test';
import type {
  ContentOnHoverCheckDetails,
  ContentOnHoverCheckResult,
  HoverContentResult,
  HoverContentRoot,
  HoverDelegationRoot,
  HoverTrigger,
} from '../types.js';
import {
  CONTENT_ON_HOVER_LISTENER_TYPES,
  CONTENT_ON_HOVER_MAX_LISTENER_NODES,
  CONTENT_ON_HOVER_MAX_RELOADS,
  CONTENT_ON_HOVER_MAX_TRIGGERS,
  CONTENT_ON_HOVER_PERSIST_MS,
  CONTENT_ON_HOVER_SETTLE_MS,
  CONTENT_ON_HOVER_TEXT_MAX,
  CONTENT_ON_HOVER_TIMEOUT_MS,
  DEFAULT_CONTENT_ON_HOVER_RESULT_FILE,
  HTML_SNIPPET_MAX_LENGTH,
  POINTER_GESTURE_DELEGATION_MIN_TYPES,
} from '../constants.js';
import {
  buildAuditResult,
  normalizeContentOnHoverCheck,
} from '../utils/axe-format.js';
import { openEventListenerInspector } from './cdpEventListeners.js';
import { gotoAndSettle } from './gotoAndSettle.js';
import {
  assertWalkLimits,
  createAuditOutput,
  requireTargetUrl,
  resolveCreateContext,
  type AuditOutputOptions,
  type ContextSourceOptions,
} from '../utils/test-harness.js';

export interface RunContentOnHoverCheckOptions
  extends AuditOutputOptions, ContextSourceOptions {
  /** Defaults to the TEST_PAGE environment variable. */
  targetUrl?: string;
  /** Options for the contexts created from `browser` (ignored with `createContext`). */
  contextOptions?: BrowserContextOptions;
  /** Wait after showing, dismissing or moving the pointer (default: CONTENT_ON_HOVER_SETTLE_MS). */
  settleMs?: number;
  /** How long shown content must stay (default: CONTENT_ON_HOVER_PERSIST_MS). */
  persistMs?: number;
  /** Wall-clock budget for the whole check (default: CONTENT_ON_HOVER_TIMEOUT_MS). */
  timeBudgetMs?: number;
  /** Upper bound on candidate triggers (default: CONTENT_ON_HOVER_MAX_TRIGGERS). */
  maxTriggers?: number;
  /** Reloads when content could not be cleared (default: CONTENT_ON_HOVER_MAX_RELOADS). */
  maxReloads?: number;
}

/** Timeout for a single Playwright action, so a stuck page cannot eat the whole budget. */
const ACTION_TIMEOUT_MS = 5_000;

/**
 * Errors Playwright throws when the page is replaced under an action. Matched
 * against the first line only: later lines are a call log that mentions
 * "navigations" even for a plain timeout.
 */
const NAVIGATION_ERROR =
  /Execution context was destroyed|Frame was detached|Target page, context or browser has been closed/i;

type Method = 'hover' | 'focus';
type Slot = 'content' | 'hover';

// =============================================================================
// Browser-side functions (serialized by Playwright; keep them self-contained)
// =============================================================================

interface HoverState {
  /** Elements that were visible before the trigger was shown. */
  seen: WeakSet<Element>;
  /** New content found for the first showing and for the pointer-on-content showing. */
  roots: Record<Slot, Element[]>;
  /**
   * Trigger and focus-target elements, indexed like `details.triggers`. Kept so
   * that DOM inserted by earlier triggers cannot shift a path selector onto
   * another element. Filled on first use after a reload.
   */
  triggers: (Element | null)[];
  focusTargets: (Element | null)[];
}

interface CollectArgs {
  stateKey: string;
  nodesKey: string;
  listenerIndices: number[];
  delegationIndices: number[];
  maxTriggers: number;
  htmlMax: number;
}

interface CollectResult {
  triggers: HoverTrigger[];
  triggersTruncated: number;
  cssRulesUnreadable: number;
  /** Visible listener nodes inside shadow roots (not candidates). */
  shadowTriggersSkipped: number;
  /** Delegation nodes, plus <html> / <body> found among the listener nodes. */
  promoted: {
    index: number;
    selector: string;
    shadowHosts: string[];
    kind: 'root' | 'html-body';
  }[];
}

/**
 * Find the trigger elements (CSS rules and the listener nodes CDP stored at
 * `window[nodesKey]`). Removes `window[nodesKey]` when done.
 */
function collectTriggers(args: CollectArgs): CollectResult {
  const {
    stateKey,
    nodesKey,
    listenerIndices,
    delegationIndices,
    maxTriggers,
    htmlMax,
  } = args;
  const w = window as unknown as Record<string, unknown>;
  const nodes = (w[nodesKey] as unknown[] | undefined) ?? [];
  delete w[nodesKey];

  // Keep in sync with getUniqueSelector() in runPointerGestureCheck.ts
  // (scopeSelector) and the copies below.
  function getUniqueSelector(element: Element): string {
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
      let selector = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      const siblings = parent ? parent.children : scope.children;
      selector += `:nth-child(${Array.from(siblings).indexOf(current) + 1})`;
      path.unshift(selector);
      current = parent;
    }
    return (current ? ['body', ...path] : path).join(' > ');
  }

  function shadowHostsOf(element: Element): string[] {
    const hosts: string[] = [];
    let root = element.getRootNode();
    while (root instanceof ShadowRoot) {
      hosts.unshift(getUniqueSelector(root.host));
      root = root.host.getRootNode();
    }
    return hosts;
  }

  function isVisible(element: Element): boolean {
    return (
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== 'hidden'
    );
  }

  // Reachable by keyboard: tabindex="-1" (script-focusable only) does not count.
  function isFocusable(element: Element): boolean {
    if ((element as HTMLButtonElement).disabled) return false;
    if (!isVisible(element)) return false;
    return (element as HTMLElement).tabIndex >= 0;
  }

  // --- CSS rules ------------------------------------------------------------

  const PSEUDO_SOURCE = ':(?:hover|focus-within|focus-visible|focus)(?![\\w-])';
  const HAS_PSEUDO = new RegExp(PSEUDO_SOURCE);
  const PSEUDO_ALL = new RegExp(PSEUDO_SOURCE, 'g');

  /** Split a selector list at the commas outside parentheses and brackets. */
  function splitList(text: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '\\') i += 1;
      else if (ch === '(' || ch === '[') depth += 1;
      else if (ch === ')' || ch === ']') depth -= 1;
      else if (ch === ',' && depth === 0) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(text.slice(start));
    return parts.map((part) => part.trim()).filter((part) => part !== '');
  }

  /**
   * For each compound selector that has a hover or focus pseudo-class and is
   * followed by a combinator, the selector up to that compound with the
   * pseudo-classes removed. A compound that is nothing but the pseudo-class
   * (`:hover > .x`) gives none.
   */
  function triggerSelectors(selector: string): string[] {
    const compounds: { text: string; end: number }[] = [];
    let depth = 0;
    let quote = '';
    let start = -1;
    for (let i = 0; i < selector.length; i += 1) {
      const ch = selector[i] as string;
      if (ch === '\\') {
        if (start < 0) start = i;
        i += 1;
        continue;
      }
      if (quote) {
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '(' || ch === '[') depth += 1;
      else if (ch === ')' || ch === ']') depth -= 1;
      else if (depth === 0 && /[\s>+~]/.test(ch)) {
        if (start >= 0) {
          compounds.push({ text: selector.slice(start, i), end: i });
          start = -1;
        }
        continue;
      }
      if (start < 0) start = i;
    }
    if (start >= 0) {
      compounds.push({ text: selector.slice(start), end: selector.length });
    }

    const found: string[] = [];
    for (let c = 0; c < compounds.length - 1; c += 1) {
      const compound = compounds[c] as { text: string; end: number };
      if (!HAS_PSEUDO.test(compound.text)) continue;
      if (compound.text.replace(PSEUDO_ALL, '') === '') continue;
      found.push(selector.slice(0, compound.end).replace(PSEUDO_ALL, ''));
    }
    return found;
  }

  const sources = new Map<Element, Set<'css' | 'listener'>>();
  function addSource(element: Element, source: 'css' | 'listener'): void {
    const set = sources.get(element) ?? new Set();
    set.add(source);
    sources.set(element, set);
  }

  let cssRulesUnreadable = 0;
  const seenSheets = new Set<CSSStyleSheet>();
  /**
   * `parent` is the selector list of the enclosing style rule (CSS nesting):
   * `&` in a nested selector stands for it, and a nested selector without `&`
   * is a descendant of it.
   */
  function visitRules(rules: CSSRuleList, parent: string | null): void {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        const selectors = splitList(rule.selectorText).map((selector) => {
          if (parent === null) return selector;
          return selector.includes('&')
            ? selector.replace(/&/g, `:is(${parent})`)
            : `:is(${parent}) ${selector}`;
        });
        for (const selector of selectors) {
          for (const query of triggerSelectors(selector)) {
            try {
              for (const element of Array.from(
                document.querySelectorAll(query),
              )) {
                addSource(element, 'css');
              }
            } catch {
              // A selector the browser rejects (e.g. an emptied :not()).
            }
          }
        }
        if (rule.cssRules.length > 0) {
          visitRules(rule.cssRules, selectors.join(', '));
        }
      } else if (rule instanceof CSSImportRule) {
        if (rule.styleSheet) visitSheet(rule.styleSheet);
      } else if ('cssRules' in rule) {
        visitRules((rule as CSSGroupingRule).cssRules, parent);
      }
    }
  }
  function visitSheet(sheet: CSSStyleSheet): void {
    if (seenSheets.has(sheet) || sheet.disabled) return;
    seenSheets.add(sheet);
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      cssRulesUnreadable += 1;
      return;
    }
    visitRules(rules, null);
  }
  for (const sheet of Array.from(document.styleSheets)) visitSheet(sheet);
  for (const sheet of document.adoptedStyleSheets) visitSheet(sheet);

  // --- Listener nodes -------------------------------------------------------

  const promoted: CollectResult['promoted'] = [];
  const promote = (
    index: number,
    element: Element,
    kind: 'root' | 'html-body',
  ): void => {
    promoted.push({
      index,
      selector: getUniqueSelector(element),
      shadowHosts: shadowHostsOf(element),
      kind,
    });
  };
  let shadowTriggersSkipped = 0;
  const delegationElements = new Set<Element>();
  for (const index of delegationIndices) {
    const node = nodes[index];
    if (!(node instanceof Element)) continue;
    delegationElements.add(node);
    promote(index, node, 'root');
  }
  for (const index of listenerIndices) {
    const node = nodes[index];
    if (!(node instanceof Element)) continue;
    if (node === document.documentElement || node === document.body) {
      delegationElements.add(node);
      promote(index, node, 'html-body');
    } else if (node.getRootNode() === document) {
      addSource(node, 'listener');
    } else if (isVisible(node)) {
      shadowTriggersSkipped += 1;
    }
  }

  // --- Triggers -------------------------------------------------------------

  const candidates = Array.from(sources.keys())
    .filter(
      (element) =>
        element !== document.documentElement &&
        element !== document.body &&
        !delegationElements.has(element) &&
        isVisible(element),
    )
    .sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );

  const kept = candidates.slice(0, maxTriggers);
  const focusElements = kept.map((element) =>
    isFocusable(element)
      ? element
      : (Array.from(element.querySelectorAll('*')).find(isFocusable) ?? null),
  );
  const triggers: HoverTrigger[] = kept.map((element, i) => {
    const focusElement = focusElements[i] ?? null;
    const html = element.outerHTML;
    return {
      selector: getUniqueSelector(element),
      sources: (['css', 'listener'] as const).filter((source) =>
        sources.get(element)?.has(source),
      ),
      focusTarget: focusElement ? getUniqueSelector(focusElement) : null,
      html: html.length > htmlMax ? html.slice(0, htmlMax) : html,
      htmlTruncated: html.length > htmlMax,
    };
  });

  // Keep the elements themselves: later triggers are found by index, not by a
  // path that earlier triggers may have shifted by inserting DOM.
  w[stateKey] = {
    seen: new WeakSet(),
    roots: { content: [], hover: [] },
    triggers: kept,
    focusTargets: focusElements,
  } satisfies HoverState;

  return {
    triggers,
    triggersTruncated: candidates.length - triggers.length,
    cssRulesUnreadable,
    shadowTriggersSkipped,
    promoted,
  };
}

/**
 * Make sure the state exists and has the trigger `index`: kept from the
 * collection while this page lives, looked up by selector in a page that was
 * loaded again. False when the trigger is gone.
 */
function resolveTrigger(args: {
  stateKey: string;
  index: number;
  selector: string;
  focusTarget: string | null;
}): boolean {
  const w = window as unknown as Record<string, HoverState | undefined>;
  const state: HoverState = w[args.stateKey] ?? {
    seen: new WeakSet(),
    roots: { content: [], hover: [] },
    triggers: [],
    focusTargets: [],
  };
  w[args.stateKey] = state;
  const find = (selector: string): Element | null => {
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  };
  const trigger = state.triggers[args.index];
  if (!trigger || !trigger.isConnected) {
    state.triggers[args.index] = find(args.selector);
  }
  const target = state.focusTargets[args.index];
  if (args.focusTarget !== null && (!target || !target.isConnected)) {
    state.focusTargets[args.index] = find(args.focusTarget);
  }
  return Boolean(state.triggers[args.index]);
}

/**
 * Scroll the trigger (or the element to focus) into view, wait a frame for
 * scroll handlers, and return its center; null when it is missing or has no
 * size. Done before the visible elements are marked, so that what the scroll
 * itself reveals (a "back to top" link) is not taken for the trigger's content.
 */
async function scrollToTarget(args: {
  stateKey: string;
  index: number;
  kind: 'trigger' | 'focus';
}): Promise<{ x: number; y: number } | null> {
  const state = (window as unknown as Record<string, HoverState | undefined>)[
    args.stateKey
  ];
  const element = state
    ? (args.kind === 'trigger' ? state.triggers : state.focusTargets)[
        args.index
      ]
    : null;
  if (!element) return null;
  element.scrollIntoView({
    block: 'center',
    inline: 'center',
    behavior: 'instant' as ScrollBehavior,
  });
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Remember every visible element so that new content can be told apart.
 * `clearRoots` also forgets the content found for the previous trigger.
 */
function markVisible(args: { stateKey: string; clearRoots: boolean }): void {
  const w = window as unknown as Record<string, HoverState | undefined>;
  const state: HoverState = w[args.stateKey] ?? {
    seen: new WeakSet(),
    roots: { content: [], hover: [] },
    triggers: [],
    focusTargets: [],
  };
  state.seen = new WeakSet();
  if (args.clearRoots) state.roots = { content: [], hover: [] };
  // Keep the visibility test in sync with findNewContent and readVisibility.
  for (const element of Array.from(document.querySelectorAll('*'))) {
    if (
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== 'hidden'
    ) {
      state.seen.add(element);
    }
  }
  w[args.stateKey] = state;
}

/** Focus the element of trigger `index` without scrolling again. */
function focusElement(args: { stateKey: string; index: number }): void {
  const state = (window as unknown as Record<string, HoverState | undefined>)[
    args.stateKey
  ];
  (state?.focusTargets[args.index] as HTMLElement | null | undefined)?.focus({
    preventScroll: true,
  });
}

interface NewContent {
  roots: HoverContentRoot[];
  viewport: { width: number; height: number };
}

/**
 * The outermost elements that are visible now and were not before (and are
 * not the trigger or its ancestors). They are kept in the state under `slot`.
 * Returns null when the state is gone (the page was replaced).
 */
function findNewContent(args: {
  stateKey: string;
  index: number;
  slot: Slot;
  htmlMax: number;
  textMax: number;
}): NewContent | null {
  const { stateKey, index, slot, htmlMax, textMax } = args;
  const state = (window as unknown as Record<string, HoverState | undefined>)[
    stateKey
  ];
  if (!state) return null;

  // Keep in sync with getUniqueSelector() in collectTriggers.
  function getUniqueSelector(element: Element): string {
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
      let selector = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      const siblings = parent ? parent.children : scope.children;
      selector += `:nth-child(${Array.from(siblings).indexOf(current) + 1})`;
      path.unshift(selector);
      current = parent;
    }
    return (current ? ['body', ...path] : path).join(' > ');
  }

  const trigger = state.triggers[index] ?? null;

  // Keep the visibility test in sync with markVisible and readVisibility.
  const fresh = new Set<Element>();
  for (const element of Array.from(document.querySelectorAll('*'))) {
    if (
      !state.seen.has(element) &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== 'hidden'
    ) {
      fresh.add(element);
    }
  }

  const IGNORED_TAGS = ['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'];
  const eligible = (element: Element): boolean => {
    if (IGNORED_TAGS.includes(element.tagName)) return false;
    if (trigger && (element === trigger || element.contains(trigger))) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const roots: Element[] = [];
  for (const element of fresh) {
    if (!eligible(element)) continue;
    let outer = false;
    for (
      let ancestor = element.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      if (fresh.has(ancestor) && eligible(ancestor)) {
        outer = true;
        break;
      }
    }
    if (!outer) roots.push(element);
  }
  state.roots[slot] = roots;

  return {
    roots: roots.map((element) => {
      const rect = element.getBoundingClientRect();
      const html = element.outerHTML;
      const text = (
        (element as HTMLElement).innerText ??
        element.textContent ??
        ''
      )
        .replace(/\s+/g, ' ')
        .trim();
      return {
        selector: getUniqueSelector(element),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        html: html.length > htmlMax ? html.slice(0, htmlMax) : html,
        htmlTruncated: html.length > htmlMax,
        text: text.slice(0, textMax),
      };
    }),
    viewport: { width: window.innerWidth, height: window.innerHeight },
  };
}

/**
 * Whether each element kept under `slot` ('all': both slots) is still visible.
 * Returns null when the state is gone.
 */
function readVisibility(args: {
  stateKey: string;
  slot: Slot | 'all';
}): boolean[] | null {
  const state = (window as unknown as Record<string, HoverState | undefined>)[
    args.stateKey
  ];
  if (!state) return null;
  const elements =
    args.slot === 'all'
      ? [...state.roots.content, ...state.roots.hover]
      : state.roots[args.slot];
  // Keep the visibility test in sync with markVisible and findNewContent.
  return elements.map(
    (element) =>
      element.isConnected &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== 'hidden',
  );
}

/** Blur the focused element. */
function blurActive(): void {
  (document.activeElement as HTMLElement | null)?.blur();
}

/** A string that identifies the focused element, or null when focus is on the page. */
function activeIdentity(): string | null {
  const active = document.activeElement;
  if (
    !active ||
    active === document.body ||
    active === document.documentElement
  ) {
    return null;
  }
  const path: string[] = [];
  for (let el: Element | null = active; el; el = el.parentElement) {
    const parent: Element | null = el.parentElement;
    path.unshift(
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}:${
        parent ? Array.from(parent.children).indexOf(el) : 0
      }`,
    );
  }
  return path.join('/');
}

// =============================================================================
// Node-side helpers
// =============================================================================

const firstLine = (error: unknown): string =>
  ((error instanceof Error ? error.message : String(error)).split('\n')[0] ??
    '') as string;

interface ListenerData {
  rootsOutsideElements: HoverDelegationRoot[];
  /** Indices in window[nodesKey] of nodes with a hover or focus listener of their own. */
  listenerIndices: number[];
  /** Indices of nodes with so many event types that they delegate. */
  delegationIndices: number[];
  /**
   * Event type count, the hover or focus types, and those among them that
   * reach descendants (for <html> and <body>), by index.
   */
  infoByIndex: Map<
    number,
    { eventTypeCount: number; types: string[]; reachTypes: string[] }
  >;
  listenerNodesTruncated: boolean;
}

const hoverTypesOf = (types: ReadonlySet<string>): string[] =>
  CONTENT_ON_HOVER_LISTENER_TYPES.filter((type) => types.has(type));

/**
 * Whether a listener on window, document, <html> or <body> is run for events on
 * descendants: events that bubble, or a capturing listener. A `focus` listener
 * without capture (revalidate-on-focus in a data library) only sees the target
 * itself.
 */
const BUBBLING_TYPES: readonly string[] = [
  'mouseover',
  'pointerover',
  'focusin',
];
const NON_BUBBLING_TYPES: readonly string[] = [
  'focus',
  'mouseenter',
  'pointerenter',
];
const reachesDescendants = (l: {
  type: string;
  useCapture: boolean;
}): boolean =>
  BUBBLING_TYPES.includes(l.type) ||
  (NON_BUBBLING_TYPES.includes(l.type) && l.useCapture);

/** Read the listeners through CDP; null outside Chromium. Leaves the nodes at window[nodesKey]. */
async function inspectListeners(
  page: Page,
  nodesKey: string,
): Promise<ListenerData | null> {
  const inspector = await openEventListenerInspector(page);
  if (!inspector) return null;
  try {
    const rootsOutsideElements: HoverDelegationRoot[] = [];
    for (const target of ['window', 'document'] as const) {
      const listeners = await inspector.forExpression(target);
      const hover = hoverTypesOf(
        new Set(listeners.filter(reachesDescendants).map((l) => l.type)),
      );
      if (hover.length > 0) {
        rootsOutsideElements.push({
          selector: target,
          shadowHosts: [],
          eventTypeCount: new Set(listeners.map((l) => l.type)).size,
          types: hover,
        });
      }
    }

    const subtree = await inspector.forSubtree('document.documentElement');
    const typesByNode = new Map<number, Set<string>>();
    const reachByNode = new Map<number, Set<string>>();
    for (const l of subtree) {
      const set = typesByNode.get(l.backendNodeId) ?? new Set<string>();
      set.add(l.type);
      typesByNode.set(l.backendNodeId, set);
      if (reachesDescendants(l)) {
        const reach = reachByNode.get(l.backendNodeId) ?? new Set<string>();
        reach.add(l.type);
        reachByNode.set(l.backendNodeId, reach);
      }
    }
    const info = new Map<
      number,
      {
        eventTypeCount: number;
        types: string[];
        reachTypes: string[];
        delegates: boolean;
      }
    >();
    for (const [backendNodeId, types] of typesByNode) {
      const hover = hoverTypesOf(types);
      if (hover.length === 0) continue;
      info.set(backendNodeId, {
        eventTypeCount: types.size,
        types: hover,
        reachTypes: hoverTypesOf(reachByNode.get(backendNodeId) ?? new Set()),
        delegates: types.size >= POINTER_GESTURE_DELEGATION_MIN_TYPES,
      });
    }

    const allIds = [...info.keys()].sort((a, b) => a - b);
    const ids = allIds.slice(0, CONTENT_ON_HOVER_MAX_LISTENER_NODES);
    const indices = await inspector.collectNodes(ids, nodesKey);

    const data: ListenerData = {
      rootsOutsideElements,
      listenerIndices: [],
      delegationIndices: [],
      infoByIndex: new Map(),
      listenerNodesTruncated: allIds.length > ids.length,
    };
    ids.forEach((id, i) => {
      const index = indices[i] ?? -1;
      const entry = info.get(id);
      if (index < 0 || !entry) return;
      data.infoByIndex.set(index, {
        eventTypeCount: entry.eventTypeCount,
        types: entry.types,
        reachTypes: entry.reachTypes,
      });
      (entry.delegates ? data.delegationIndices : data.listenerIndices).push(
        index,
      );
    });
    return data;
  } finally {
    await inspector.close();
  }
}

interface Pair {
  trigger: HoverTrigger;
  /** Position in `details.triggers`. */
  index: number;
  method: Method;
}

/**
 * Run the content on hover or focus check against the target URL, write the
 * result JSON, and return the parsed result.
 */
export async function runContentOnHoverCheck(
  options: RunContentOnHoverCheckOptions,
): Promise<ContentOnHoverCheckResult> {
  const {
    browser,
    createContext,
    targetUrl: targetUrlOption,
    contextOptions,
    settleMs = CONTENT_ON_HOVER_SETTLE_MS,
    persistMs = CONTENT_ON_HOVER_PERSIST_MS,
    timeBudgetMs = CONTENT_ON_HOVER_TIMEOUT_MS,
    maxTriggers = CONTENT_ON_HOVER_MAX_TRIGGERS,
    maxReloads = CONTENT_ON_HOVER_MAX_RELOADS,
    ...location
  } = options;

  assertWalkLimits({ timeBudgetMs });
  for (const [name, value] of [
    ['settleMs', settleMs],
    ['persistMs', persistMs],
  ] as const) {
    if (!(typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
      throw new Error(
        `\`${name}\` must be a non-negative finite number of milliseconds (got ${String(value)}).`,
      );
    }
  }
  if (!(Number.isInteger(maxTriggers) && maxTriggers >= 1)) {
    throw new Error(
      `\`maxTriggers\` must be a positive integer (got ${String(maxTriggers)}).`,
    );
  }
  if (!(Number.isInteger(maxReloads) && maxReloads >= 0)) {
    throw new Error(
      `\`maxReloads\` must be a non-negative integer (got ${String(maxReloads)}).`,
    );
  }

  const newContext = resolveCreateContext(
    { browser, createContext },
    contextOptions,
  );
  const targetUrl = requireTargetUrl(targetUrlOption);
  const out = createAuditOutput({
    ...location,
    defaultFile: DEFAULT_CONTENT_ON_HOVER_RESULT_FILE,
  });

  const stateKey = `__a11yContentOnHover_${randomUUID()}`;
  const nodesKey = `__a11yContentOnHoverNodes_${randomUUID()}`;
  const startedAt = Date.now();
  let startUrl = targetUrl;
  // Held outside so it is closed in `finally` even if a step throws.
  let context: BrowserContext | null = null;
  let page!: Page;

  /** Open a fresh context at the target URL. */
  const openPage = async (): Promise<void> => {
    await context?.close();
    context = null;
    context = await newContext();
    const opened = await context.newPage();
    page = opened;
    // Windows and dialogs the page opens by itself must not block the check.
    context.on('page', (popup) => {
      if (popup !== opened) popup.close().catch(() => {});
    });
    opened.on('dialog', (dialog) => {
      dialog.dismiss().catch(() => {});
    });
    await gotoAndSettle(opened, targetUrl);
    opened.setDefaultTimeout(ACTION_TIMEOUT_MS);
  };

  try {
    await openPage();
    startUrl = page.url();

    // Read the listeners before adding any state of our own.
    const listenerData = await inspectListeners(page, nodesKey);
    const collected = await page.evaluate(collectTriggers, {
      stateKey,
      nodesKey,
      listenerIndices: listenerData?.listenerIndices ?? [],
      delegationIndices: listenerData?.delegationIndices ?? [],
      maxTriggers,
      htmlMax: HTML_SNIPPET_MAX_LENGTH,
    });

    const details: ContentOnHoverCheckDetails = {
      listenerInspection: listenerData ? 'cdp' : 'unsupported',
      delegationRoots: [
        ...(listenerData?.rootsOutsideElements ?? []),
        ...collected.promoted.flatMap(
          ({ index, selector, shadowHosts, kind }) => {
            const info = listenerData?.infoByIndex.get(index);
            // <html> and <body> delegate only through listeners that reach descendants.
            const types =
              kind === 'html-body'
                ? (info?.reachTypes ?? [])
                : (info?.types ?? []);
            if (kind === 'html-body' && types.length === 0) return [];
            return [
              {
                selector,
                shadowHosts,
                eventTypeCount: info?.eventTypeCount ?? 0,
                types,
              },
            ];
          },
        ),
      ],
      listenerNodesTruncated: listenerData?.listenerNodesTruncated ?? false,
      triggers: collected.triggers,
      triggersTruncated: collected.triggersTruncated,
      cssRulesUnreadable: collected.cssRulesUnreadable,
      shadowTriggersSkipped: collected.shadowTriggersSkipped,
      results: [],
      noContent: 0,
      untested: [],
      reloads: 0,
      aborted: null,
    };

    await tryTriggers(details);

    const result = buildAuditResult({
      source: 'content-on-hover-check',
      url: startUrl,
      details,
      buckets: normalizeContentOnHoverCheck(details),
    });
    out.save(result);
    out.header('Content on Hover or Focus Check', 'WCAG 1.4.13', startUrl);
    out.summary({
      'Listener inspection': details.listenerInspection,
      'Delegation roots': details.delegationRoots.length,
      Triggers: details.triggers.length,
      'Pairs with content': details.results.length,
      'Not dismissible': details.results.filter(
        (r) =>
          r.dismissible === 'stayed' ||
          (r.dismissible === 'dismissed' && r.escapeMovedFocus),
      ).length,
      'Not hoverable': details.results.filter(
        (r) => r.hoverable === 'disappeared',
      ).length,
      'Not persistent': details.results.filter(
        (r) => r.persistent === 'disappeared',
      ).length,
      Reloads: details.reloads,
    });
    out.outputPaths();
    return result;
  } finally {
    // `openPage` assigns it from a closure, which the compiler does not see.
    await (context as BrowserContext | null)?.close();
  }

  /** Hover and focus each trigger in turn, reloading only when content cannot be put away. */
  async function tryTriggers(
    details: ContentOnHoverCheckDetails,
  ): Promise<void> {
    const pairs: Pair[] = details.triggers.flatMap((trigger, index) => [
      { trigger, index, method: 'hover' as const },
      ...(trigger.focusTarget !== null
        ? [{ trigger, index, method: 'focus' as const }]
        : []),
    ]);

    const abort = (
      reason: NonNullable<ContentOnHoverCheckDetails['aborted']>['reason'],
      remaining: readonly Pair[],
    ): void => {
      details.aborted = { reason, url: startUrl };
      for (const { trigger, method } of remaining) {
        details.untested.push({ trigger: trigger.selector, method, reason });
      }
      out.warn(
        `\n⚠️  Stopped (${reason}): ${remaining.length} trigger(s) were not tried.`,
      );
    };

    /**
     * Continue in a fresh context. Stops the check (untested: `remaining`)
     * when the time budget or the reload limit is used up, or the page cannot
     * be opened; false then.
     */
    const tryReload = async (remaining: readonly Pair[]): Promise<boolean> => {
      if (Date.now() - startedAt > timeBudgetMs) {
        abort('timeout', remaining);
        return false;
      }
      if (details.reloads >= maxReloads) {
        abort('reload-limit', remaining);
        return false;
      }
      details.reloads += 1;
      try {
        await openPage();
        return true;
      } catch {
        abort('reload-failed', remaining);
        return false;
      }
    };

    /** Pointer to a corner, focus off, Escape: put the page back as it was. */
    const resetState = async (): Promise<void> => {
      await page.mouse.move(0, 0);
      await page.evaluate(blurActive);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(settleMs);
    };

    // True while nothing of the previous trigger is left to put away.
    let clean = true;

    /** Try one trigger and method. */
    async function tryPair({
      trigger,
      index,
      method,
    }: Pair): Promise<'content' | 'empty' | 'not-found' | 'navigated'> {
      const urlBefore = page.url();
      const moved = (): boolean => page.url() !== urlBefore;

      if (!clean) await resetState();
      const found = await page.evaluate(resolveTrigger, {
        stateKey,
        index,
        selector: trigger.selector,
        focusTarget: trigger.focusTarget,
      });
      if (!found) return 'not-found';

      /**
       * Scroll the target into view and let scroll handlers run, so that what
       * the scroll reveals is already visible when the elements are marked.
       */
      const scrollToTrigger = async () => {
        const point = await page.evaluate(scrollToTarget, {
          stateKey,
          index,
          kind: method === 'hover' ? ('trigger' as const) : ('focus' as const),
        });
        if (point) await page.waitForTimeout(Math.min(settleMs, 100));
        return point;
      };
      const point = await scrollToTrigger();
      if (!point) return 'not-found';

      // Everything visible now is old; content of the previous trigger that
      // could not be put away is among it and is not taken for new content.
      await page.evaluate(markVisible, { stateKey, clearRoots: true });

      clean = false;
      if (method === 'focus') {
        await page.evaluate(focusElement, { stateKey, index });
      } else {
        await page.mouse.move(point.x, point.y, { steps: 1 });
      }
      await page.waitForTimeout(settleMs);
      if (moved()) return 'navigated';

      const shown = await page.evaluate(findNewContent, {
        stateKey,
        index,
        slot: 'content' as const,
        htmlMax: HTML_SNIPPET_MAX_LENGTH,
        textMax: CONTENT_ON_HOVER_TEXT_MAX,
      });
      if (shown === null || moved()) return 'navigated';
      if (shown.roots.length === 0) {
        details.noContent += 1;
        return 'empty';
      }

      // Stays by itself?
      await page.waitForTimeout(persistMs);
      const afterWait = await page.evaluate(readVisibility, {
        stateKey,
        slot: 'content' as const,
      });
      if (afterWait === null || moved()) return 'navigated';
      const persistent = afterWait.every(Boolean) ? 'stayed' : 'disappeared';

      // Dismissed by Escape without moving the pointer or focus? Only content
      // that is still there can be asked.
      let dismissible: HoverContentResult['dismissible'] = 'not-tested';
      let escapeMovedFocus = false;
      if (persistent === 'stayed') {
        const focusBefore = await page.evaluate(activeIdentity);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(settleMs);
        const focusAfter = await page.evaluate(activeIdentity);
        const afterEscape = await page.evaluate(readVisibility, {
          stateKey,
          slot: 'content' as const,
        });
        if (afterEscape === null || moved()) return 'navigated';
        dismissible = afterEscape.some(Boolean) ? 'stayed' : 'dismissed';
        escapeMovedFocus = focusBefore !== focusAfter;
      }

      // Can the pointer move onto it? Shown again, because Escape may have
      // dismissed it. Content that went away by itself says nothing about it.
      let hoverable: HoverContentResult['hoverable'] =
        method === 'focus' ? 'not-applicable' : 'not-tested';
      if (method === 'hover' && persistent === 'stayed') {
        await resetState();
        const againPoint = await scrollToTrigger();
        if (againPoint) {
          await page.evaluate(markVisible, { stateKey, clearRoots: false });
          await page.mouse.move(againPoint.x, againPoint.y, { steps: 1 });
          await page.waitForTimeout(settleMs);
          const again = await page.evaluate(findNewContent, {
            stateKey,
            index,
            slot: 'hover' as const,
            htmlMax: HTML_SNIPPET_MAX_LENGTH,
            textMax: CONTENT_ON_HOVER_TEXT_MAX,
          });
          if (again === null || moved()) return 'navigated';
          const largest = again.roots.reduce<HoverContentRoot | null>(
            (best, root) =>
              !best ||
              root.rect.width * root.rect.height >
                best.rect.width * best.rect.height
                ? root
                : best,
            null,
          );
          if (largest) {
            const x = largest.rect.x + largest.rect.width / 2;
            const y = largest.rect.y + largest.rect.height / 2;
            if (
              x >= 0 &&
              y >= 0 &&
              x <= again.viewport.width &&
              y <= again.viewport.height
            ) {
              await page.mouse.move(x, y, { steps: 10 });
              await page.waitForTimeout(settleMs);
              const onContent = await page.evaluate(readVisibility, {
                stateKey,
                slot: 'hover' as const,
              });
              if (onContent === null || moved()) return 'navigated';
              hoverable = onContent.every(Boolean) ? 'stayed' : 'disappeared';
            }
          }
        }
      }

      details.results.push({
        trigger: trigger.selector,
        method,
        content: shown.roots,
        persistent,
        dismissible,
        escapeMovedFocus,
        hoverable,
      });
      return 'content';
    }

    for (let i = 0; i < pairs.length; i += 1) {
      const pair = pairs[i] as Pair;
      if (Date.now() - startedAt > timeBudgetMs) {
        abort('timeout', pairs.slice(i));
        return;
      }

      let outcome: Awaited<ReturnType<typeof tryPair>>;
      try {
        outcome = await tryPair(pair);
      } catch (error) {
        if (!NAVIGATION_ERROR.test(firstLine(error))) throw error;
        outcome = 'navigated';
      }

      const rest = pairs.slice(i + 1);
      if (outcome === 'not-found' || outcome === 'navigated') {
        details.untested.push({
          trigger: pair.trigger.selector,
          method: pair.method,
          reason: outcome === 'navigated' ? 'navigated' : 'trigger-not-found',
        });
      }
      if (outcome === 'navigated') {
        if (rest.length > 0) {
          if (!(await tryReload(rest))) return;
          clean = true;
        }
        continue;
      }
      // Nothing new was shown, so nothing needs putting away.
      if (outcome !== 'content' || rest.length === 0) continue;

      // Put the page back for the next trigger; reload only when content of
      // this one is still visible afterwards.
      let stuck: boolean;
      try {
        await resetState();
        const left = await page.evaluate(readVisibility, {
          stateKey,
          slot: 'all' as const,
        });
        stuck = left === null || left.some(Boolean);
        clean = true;
      } catch (error) {
        if (!NAVIGATION_ERROR.test(firstLine(error))) throw error;
        stuck = true;
      }
      if (stuck) {
        if (!(await tryReload(rest))) return;
        clean = true;
      }
    }
  }
}
