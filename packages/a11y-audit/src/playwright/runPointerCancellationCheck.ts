/**
 * Pointer Cancellation Check
 *
 * WCAG 2.5.2 (Pointer Cancellation)
 *
 * Sends only the down-events (`pointerdown`, then `mousedown`) to each
 * operable element and never releases, then records whether that alone made
 * the page do something: a main-frame navigation, a new window, a dialog, focus
 * moving to another element, or a DOM change (`style` attribute changes
 * excluded). Such an element is an `activated-on-press` candidate. Elements
 * that have a press listener (`pointerdown` / `mousedown` / `touchstart`) but
 * no release or click listener of their own, and showed no change, are
 * reported as `press-only-listener` candidates. Whether the function can be
 * aborted or undone, or reacting on the down-event is essential, needs a
 * human, so every candidate is `incomplete`.
 *
 * Elements pressed: elements with a press listener of their own (read through
 * CDP in one call for the whole document), elements with an inline
 * `onpointerdown` / `onmousedown` / `ontouchstart` attribute, and operable
 * elements (POINTER_CANCELLATION_TARGET_SELECTOR; delegated handlers have to be
 * found by pressing). Elements are collected from the document and open shadow
 * roots; hidden and disabled ones are skipped.
 *
 * Like the change-on-input check, this one owns its `BrowserContext`: when a
 * press navigates the page, or a handler never returns, it restarts in a fresh
 * context and skips the elements it already tried. For that reason it accepts a
 * `browser` (not a `page`) and navigates internally. The contexts it creates
 * are closed before it returns.
 *
 * Limitations:
 * - The down-events are synthetic (`isTrusted` is false) and dispatched with
 *   `dispatchEvent`: handlers that check `isTrusted` do not react. `touchstart`
 *   is not sent (a `touchstart` listener is only used as evidence). Real
 *   mouse presses are avoided because releasing them produces `click`.
 * - After observing, only `pointercancel` is sent. What a handler started (a
 *   drag, a timer) is not undone, so an earlier press can influence a later one.
 * - A change that surfaces after `settleMs` (e.g. navigation after a network
 *   round trip) is missed: the press that caused it gets no finding. If such a
 *   navigation commits while a later target is being pressed, that target is
 *   pressed again after the restart.
 * - On a page that changes on its own (a ticker, an auto-rotating carousel),
 *   DOM changes are not used as evidence (see `domObservation`); navigation,
 *   new windows, dialogs and focus moves still are. `style` attribute changes
 *   are never counted.
 * - Pages that submit or save on the down-event really do so.
 * - "Press-only" looks at the element's own listeners: an ancestor's `click`
 *   listener is not seen. CDP is Chromium-only; elsewhere there is no listener
 *   evidence and the rule gets a manual-check note.
 * - Elements inside iframes are not examined; closed shadow roots are not
 *   visible.
 * - Limits: POINTER_CANCELLATION_MAX_TARGETS elements, a wall-clock budget, and
 *   POINTER_CANCELLATION_MAX_RESTARTS restarts. A handler that never returns is
 *   cut off after `stepTimeoutMs`, the context is closed and the check
 *   restarts; the element is reported as untested (`incomplete`).
 * - If listener inspection fails, is unsupported, or finds more than
 *   POINTER_GESTURE_MAX_LISTENER_NODES elements with press listeners, the rule
 *   is `incomplete` with a page-level note.
 */

import { randomUUID } from 'node:crypto';
import type {
  BrowserContext,
  BrowserContextOptions,
  Page,
} from '@playwright/test';
import type {
  PointerCancellationChange,
  PointerCancellationCheckDetails,
  PointerCancellationCheckResult,
  PointerCancellationFinding,
  PointerCancellationPageListener,
  PointerCancellationTarget,
  PointerCancellationTargetSource,
  PointerGestureListenerLocation,
} from '../types.js';
import {
  DEFAULT_POINTER_CANCELLATION_RESULT_FILE,
  DIALOG_MESSAGE_MAX,
  HTML_SNIPPET_MAX_LENGTH,
  POINTER_CANCELLATION_BACKGROUND_MS,
  POINTER_CANCELLATION_INSPECTION_TIMEOUT_MS,
  POINTER_CANCELLATION_MAX_ATTRIBUTES,
  POINTER_CANCELLATION_MAX_RESTARTS,
  POINTER_CANCELLATION_MAX_TARGETS,
  POINTER_CANCELLATION_RELEASE_TYPES,
  POINTER_CANCELLATION_SETTLE_MS,
  POINTER_CANCELLATION_STEP_TIMEOUT_MS,
  POINTER_CANCELLATION_TARGET_SELECTOR,
  POINTER_CANCELLATION_TIMEOUT_MS,
  POINTER_GESTURE_DELEGATION_MIN_TYPES,
  POINTER_GESTURE_MAX_LISTENER_NODES,
  POINTER_GESTURE_PRESS_TYPES,
} from '../constants.js';
import {
  buildAuditResult,
  normalizePointerCancellationCheck,
} from '../utils/axe-format.js';
import { gotoAndSettle } from './gotoAndSettle.js';
import {
  assertWalkLimits,
  createAuditOutput,
  requireTargetUrl,
  resolveCreateContext,
  type AuditOutputOptions,
  type ContextSourceOptions,
} from '../utils/test-harness.js';
import {
  openEventListenerInspector,
  type EventListenerInspector,
  type EventListenerRecord,
} from './cdpEventListeners.js';

export interface RunPointerCancellationCheckOptions
  extends AuditOutputOptions, ContextSourceOptions {
  /** Defaults to the TEST_PAGE environment variable. */
  targetUrl?: string;
  /** Options for the contexts created from `browser` (ignored with `createContext`). */
  contextOptions?: BrowserContextOptions;
  /** Wait after each press for a change to surface (default: POINTER_CANCELLATION_SETTLE_MS). */
  settleMs?: number;
  /** Wall-clock budget for the whole check (default: POINTER_CANCELLATION_TIMEOUT_MS). */
  timeBudgetMs?: number;
  /** Targets to press before stopping (default: POINTER_CANCELLATION_MAX_TARGETS). */
  maxTargets?: number;
  /** Upper bound for the listener inspection per page load (default: POINTER_CANCELLATION_INSPECTION_TIMEOUT_MS). Mainly for tests. */
  inspectionTimeoutMs?: number;
  /** Upper bound for each in-page step and for closing a context (default: POINTER_CANCELLATION_STEP_TIMEOUT_MS). Mainly for tests. */
  stepTimeoutMs?: number;
}

/** Timeout for a single Playwright action, so a stuck one cannot eat the whole budget. */
const ACTION_TIMEOUT_MS = 5_000;

/**
 * Errors Playwright throws when the page is replaced under an action. Matched
 * against the first line only: later lines are a call log that mentions
 * "navigations" even for a plain timeout.
 */
const NAVIGATION_ERROR =
  /Execution context was destroyed|Frame was detached|Target page, context or browser has been closed/i;

// =============================================================================
// Browser-side functions (serialized by Playwright; keep them self-contained)
// =============================================================================

interface ListenerNodeInfo {
  index: number;
  press: string[];
  release: string[];
  pressListener: PointerGestureListenerLocation | null;
}

interface CollectArgs {
  nodesKey: string;
  targetsKey: string;
  listenerNodes: ListenerNodeInfo[];
  /** True when this load's listeners were inspected through CDP. */
  inspected: boolean;
  /** True when listener nodes beyond the cap were left out: an element not listed may still have listeners. */
  listenerNodesTruncated: boolean;
  selector: string;
  htmlSnippetMaxLength: number;
}

interface PressState {
  elements: Element[];
  roots: (Document | ShadowRoot)[];
  observer: MutationObserver | null;
  records: MutationRecord[];
  before: Element | null;
}

interface PressOutcome {
  addedNodes: number;
  removedNodes: number;
  textChanges: number;
  attributes: string[];
  focusMovedTo: string | null;
}

/**
 * Find the elements to press, in the order they are pressed, and keep them (and
 * the roots to observe) at `window[targetsKey]`. Runs in the browser.
 */
function collectTargets(args: CollectArgs): PointerCancellationTarget[] {
  const {
    nodesKey,
    targetsKey,
    listenerNodes,
    inspected,
    listenerNodesTruncated,
    selector,
    htmlSnippetMaxLength,
  } = args;
  const w = window as unknown as Record<string, unknown>;
  const nodes = (w[nodesKey] as unknown[] | undefined) ?? [];

  // Keep in sync with the functions of the same names in endPress and in
  // runPointerGestureCheck.ts (copied on purpose: nothing can be imported here).
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

  function shadowHostsOf(element: Element): string[] {
    const hosts: string[] = [];
    let root = element.getRootNode();
    while (root instanceof ShadowRoot) {
      hosts.unshift(scopeSelector(root.host));
      root = root.host.getRootNode();
    }
    return hosts;
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

  const isVisible = (element: Element): boolean => {
    // `visibilityProperty` also rejects `visibility: hidden` / `collapse`.
    if (!element.checkVisibility({ visibilityProperty: true })) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const isDisabled = (element: Element): boolean =>
    element.matches(':disabled') ||
    element.getAttribute('aria-disabled') === 'true';

  const listenerInfo = new Map<Element, ListenerNodeInfo>();
  for (const info of listenerNodes) {
    const node = nodes[info.index];
    if (node instanceof Element) listenerInfo.set(node, info);
  }

  const INLINE_HANDLERS = ['onpointerdown', 'onmousedown', 'ontouchstart'];
  const roots: (Document | ShadowRoot)[] = [document];
  const found: {
    element: Element;
    sources: PointerCancellationTargetSource[];
  }[] = [];

  // One depth-first walk of the composed tree (document and open shadow
  // roots), so that elements come out in document order.
  function visit(element: Element): void {
    const sources: PointerCancellationTargetSource[] = [];
    if (listenerInfo.has(element)) sources.push('listener');
    if (INLINE_HANDLERS.some((name) => element.hasAttribute(name))) {
      sources.push('inline-handler');
    }
    if (element.matches(selector)) sources.push('interactive');
    if (sources.length === 0) return;
    if (!isVisible(element) || isDisabled(element)) return;
    found.push({ element, sources });
  }
  function walk(parent: ParentNode): void {
    for (const element of Array.from(parent.children)) {
      visit(element);
      if (element.shadowRoot) {
        roots.push(element.shadowRoot);
        walk(element.shadowRoot);
      }
      walk(element);
    }
  }
  walk(document);

  // Elements with evidence first, so a target limit keeps them.
  const hasEvidence = (sources: PointerCancellationTargetSource[]): boolean =>
    sources.includes('listener') || sources.includes('inline-handler');
  const ordered = [
    ...found.filter(({ sources }) => hasEvidence(sources)),
    ...found.filter(({ sources }) => !hasEvidence(sources)),
  ];

  const state: PressState = {
    elements: ordered.map(({ element }) => element),
    roots,
    observer: null,
    records: [],
    before: null,
  };
  w[targetsKey] = state;
  // The nodes are kept in the state; the temporary array is not needed.
  delete w[nodesKey];

  return ordered.map(({ element, sources }) => {
    const info = listenerInfo.get(element);
    return {
      selector: scopeSelector(element),
      shadowHosts: shadowHostsOf(element),
      ...safeOuterHTML(element),
      tagName: element.tagName.toLowerCase(),
      role: element.getAttribute('role'),
      sources,
      listeners: info
        ? { press: info.press, release: info.release }
        : inspected && !listenerNodesTruncated
          ? { press: [], release: [] }
          : null,
      pressListener: info?.pressListener ?? null,
    };
  });
}

/**
 * Start observing DOM changes and, with an `index`, send the down-events to
 * that element. Without an `index` it only observes (used to watch the page
 * before any press). Runs in the browser.
 */
function startPress(args: { targetsKey: string; index: number | null }): {
  /** The element was removed from the page. */
  missing: boolean;
  /** The state is gone: the page was replaced (e.g. a late navigation). */
  pageReplaced: boolean;
  dispatched: string[];
} {
  const state = (window as unknown as Record<string, PressState | undefined>)[
    args.targetsKey
  ];
  if (!state) return { missing: false, pageReplaced: true, dispatched: [] };
  const element = args.index === null ? null : state.elements[args.index];
  if (args.index !== null && !element?.isConnected) {
    return { missing: true, pageReplaced: false, dispatched: [] };
  }

  state.observer?.disconnect();
  state.records = [];
  const observer = new MutationObserver((records) => {
    state.records.push(...records);
  });
  for (const root of state.roots) {
    observer.observe(root, {
      childList: true,
      characterData: true,
      attributes: true,
      subtree: true,
    });
  }
  state.observer = observer;

  let active: Element | null = document.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  state.before = active;

  const dispatched: string[] = [];
  if (element) {
    const rect = element.getBoundingClientRect();
    const init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 0,
      buttons: 1,
      view: window,
    };
    dispatched.push('pointerdown');
    // Like a browser, send no compatibility mouse event after a cancelled
    // pointerdown.
    const notCancelled = element.dispatchEvent(
      new PointerEvent('pointerdown', {
        ...init,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      }),
    );
    if (notCancelled) {
      dispatched.push('mousedown');
      element.dispatchEvent(new MouseEvent('mousedown', init));
    }
  }
  return { missing: false, pageReplaced: false, dispatched };
}

/**
 * Stop observing and report what changed since `startPress` (with an `index`,
 * also whether focus moved). Runs in the browser.
 */
function endPress(args: {
  targetsKey: string;
  index: number | null;
  maxAttributes: number;
}): PressOutcome {
  const outcome: PressOutcome = {
    addedNodes: 0,
    removedNodes: 0,
    textChanges: 0,
    attributes: [],
    focusMovedTo: null,
  };
  const state = (window as unknown as Record<string, PressState | undefined>)[
    args.targetsKey
  ];
  // The page was replaced after the press: the caller sees the navigation.
  if (!state) return outcome;
  const element = args.index === null ? null : state.elements[args.index];

  const records = [...state.records, ...(state.observer?.takeRecords() ?? [])];
  state.observer?.disconnect();
  state.observer = null;
  state.records = [];

  const attributes = new Set<string>();
  for (const record of records) {
    if (record.type === 'childList') {
      outcome.addedNodes += record.addedNodes.length;
      outcome.removedNodes += record.removedNodes.length;
    } else if (record.type === 'characterData') {
      outcome.textChanges += 1;
    } else if (record.attributeName && record.attributeName !== 'style') {
      // `style` changes are usually press feedback, not a function.
      attributes.add(record.attributeName);
    }
  }
  outcome.attributes = Array.from(attributes).slice(0, args.maxAttributes);

  if (element) {
    // Keep in sync with the functions of the same names in collectTargets.
    const scopeSelector = (target: Element): string => {
      const scope = target.getRootNode() as Document | ShadowRoot;
      if (
        target.id &&
        scope.querySelectorAll(`#${CSS.escape(target.id)}`).length === 1
      ) {
        return `#${CSS.escape(target.id)}`;
      }
      if (target === document.documentElement) return 'html';
      if (target === document.body) return 'body';
      const path: string[] = [];
      let current: Element | null = target;
      while (current && current !== document.body) {
        let part = current.tagName.toLowerCase();
        const parent: Element | null = current.parentElement;
        const siblings = parent ? parent.children : scope.children;
        part += `:nth-child(${Array.from(siblings).indexOf(current) + 1})`;
        path.unshift(part);
        current = parent;
      }
      return (current ? ['body', ...path] : path).join(' > ');
    };
    const shadowHostsOf = (target: Element): string[] => {
      const hosts: string[] = [];
      let root = target.getRootNode();
      while (root instanceof ShadowRoot) {
        hosts.unshift(scopeSelector(root.host));
        root = root.host.getRootNode();
      }
      return hosts;
    };

    let after: Element | null = document.activeElement;
    while (after?.shadowRoot?.activeElement) {
      after = after.shadowRoot.activeElement;
    }
    if (
      after &&
      after !== state.before &&
      after !== document.body &&
      after !== document.documentElement
    ) {
      // Focus moving to the pressed element, or into it, is not a function.
      let inside = false;
      let node: Node | null = after;
      while (node && !inside) {
        inside = node === element;
        node =
          node.parentNode ?? (node instanceof ShadowRoot ? node.host : null);
        if (node instanceof ShadowRoot) node = node.host;
      }
      if (!inside) {
        outcome.focusMovedTo = [
          ...shadowHostsOf(after),
          scopeSelector(after),
        ].join(' >>> ');
      }
    }
  }
  return outcome;
}

/**
 * Abort the press, which is what 2.5.2 asks for. A separate step from
 * `endPress`, so that what a `pointercancel` handler does is not mixed into
 * what the press caused. `pointerup` / `mouseup` are not sent so that nothing
 * is completed on release. Runs in the browser.
 */
function cancelPress(args: { targetsKey: string; index: number }): void {
  const state = (window as unknown as Record<string, PressState | undefined>)[
    args.targetsKey
  ];
  state?.elements[args.index]?.dispatchEvent(
    new PointerEvent('pointercancel', {
      bubbles: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
    }),
  );
}

// =============================================================================
// Listener inspection (Node side)
// =============================================================================

/** Rejects when `promise` takes longer than `ms`; the promise is left running. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('step timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isStepTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === 'step timeout';
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.split('\n')[0] ?? '').slice(0, 200);
}

function distinctTypes(listeners: readonly EventListenerRecord[]): number {
  return new Set(listeners.map((l) => l.type)).size;
}

const PRESS_TYPES: readonly string[] = POINTER_GESTURE_PRESS_TYPES;
const RELEASE_TYPES: readonly string[] = POINTER_CANCELLATION_RELEASE_TYPES;

interface ListenerData {
  pageListeners: PointerCancellationPageListener[];
  /** window / document / element roots with listeners for many event types. */
  delegationRootCount: number;
  listenerNodesTruncated: boolean;
  nodes: ListenerNodeInfo[];
}

const NO_LISTENER_DATA: ListenerData = {
  pageListeners: [],
  delegationRootCount: 0,
  listenerNodesTruncated: false,
  nodes: [],
};

async function inspectListeners(
  inspector: EventListenerInspector,
  nodesKey: string,
  run: { cancelled: boolean },
): Promise<ListenerData> {
  const stopIfCancelled = () => {
    if (run.cancelled) throw new Error('cancelled');
  };

  const pageListeners: PointerCancellationPageListener[] = [];
  let delegationRootCount = 0;
  for (const target of ['window', 'document'] as const) {
    const listeners = await inspector.forExpression(target);
    stopIfCancelled();
    if (distinctTypes(listeners) >= POINTER_GESTURE_DELEGATION_MIN_TYPES) {
      delegationRootCount += 1;
      continue;
    }
    for (const l of listeners) {
      if (!PRESS_TYPES.includes(l.type)) continue;
      pageListeners.push({
        target,
        type: l.type,
        scriptId: l.scriptId,
        lineNumber: l.lineNumber,
        columnNumber: l.columnNumber,
        handlerPreview: l.handlerPreview,
      });
    }
  }

  const subtree = await inspector.forSubtree('document.documentElement');
  stopIfCancelled();
  const byNode = new Map<number, EventListenerRecord[]>();
  for (const l of subtree) {
    const list = byNode.get(l.backendNodeId) ?? [];
    list.push(l);
    byNode.set(l.backendNodeId, list);
  }

  const infoByNode = new Map<number, Omit<ListenerNodeInfo, 'index'>>();
  for (const listeners of byNode.values()) {
    if (distinctTypes(listeners) >= POINTER_GESTURE_DELEGATION_MIN_TYPES) {
      delegationRootCount += 1;
    }
  }
  for (const [backendNodeId, listeners] of byNode) {
    if (distinctTypes(listeners) >= POINTER_GESTURE_DELEGATION_MIN_TYPES) {
      continue;
    }
    const first = listeners.find((l) => PRESS_TYPES.includes(l.type));
    if (!first) continue;
    infoByNode.set(backendNodeId, {
      press: PRESS_TYPES.filter((type) =>
        listeners.some((l) => l.type === type),
      ),
      release: RELEASE_TYPES.filter((type) =>
        listeners.some((l) => l.type === type),
      ),
      pressListener: {
        scriptId: first.scriptId,
        lineNumber: first.lineNumber,
        columnNumber: first.columnNumber,
        handlerPreview: first.handlerPreview,
      },
    });
  }

  const allIds = [...infoByNode.keys()].sort((a, b) => a - b);
  const ids = allIds.slice(0, POINTER_GESTURE_MAX_LISTENER_NODES);
  const indices = await inspector.collectNodes(
    ids,
    nodesKey,
    () => run.cancelled,
  );
  stopIfCancelled();

  const nodes: ListenerNodeInfo[] = [];
  ids.forEach((id, i) => {
    const index = indices[i] ?? -1;
    const info = infoByNode.get(id);
    if (index >= 0 && info) nodes.push({ index, ...info });
  });

  return {
    pageListeners,
    delegationRootCount,
    listenerNodesTruncated: allIds.length > ids.length,
    nodes,
  };
}

/**
 * Run the pointer cancellation check against the target URL, write the result
 * JSON, and return the parsed result.
 */
export async function runPointerCancellationCheck(
  options: RunPointerCancellationCheckOptions,
): Promise<PointerCancellationCheckResult> {
  const {
    browser,
    createContext,
    targetUrl: targetUrlOption,
    contextOptions,
    settleMs = POINTER_CANCELLATION_SETTLE_MS,
    timeBudgetMs = POINTER_CANCELLATION_TIMEOUT_MS,
    maxTargets = POINTER_CANCELLATION_MAX_TARGETS,
    inspectionTimeoutMs = POINTER_CANCELLATION_INSPECTION_TIMEOUT_MS,
    stepTimeoutMs = POINTER_CANCELLATION_STEP_TIMEOUT_MS,
    ...location
  } = options;

  assertWalkLimits({ timeBudgetMs });
  if (
    !(typeof settleMs === 'number' && Number.isFinite(settleMs) && settleMs > 0)
  ) {
    throw new Error(
      `\`settleMs\` must be a positive finite number of milliseconds (got ${String(settleMs)}).`,
    );
  }
  for (const [name, value] of [
    ['stepTimeoutMs', stepTimeoutMs],
    ['inspectionTimeoutMs', inspectionTimeoutMs],
  ] as const) {
    if (!(typeof value === 'number' && Number.isFinite(value) && value > 0)) {
      throw new Error(
        `\`${name}\` must be a positive finite number of milliseconds (got ${String(value)}).`,
      );
    }
  }
  if (!(Number.isInteger(maxTargets) && maxTargets > 0)) {
    throw new Error(
      `\`maxTargets\` must be a positive integer (got ${String(maxTargets)}).`,
    );
  }

  const newContext = resolveCreateContext(
    { browser, createContext },
    contextOptions,
  );
  const targetUrl = requireTargetUrl(targetUrlOption);
  const out = createAuditOutput({
    ...location,
    defaultFile: DEFAULT_POINTER_CANCELLATION_RESULT_FILE,
  });

  const findings: PointerCancellationFinding[] = [];
  const untested: PointerCancellationCheckDetails['untested'] = [];
  let pageListeners: PointerCancellationPageListener[] = [];
  let delegationRootCount = 0;
  let listenerInspection: PointerCancellationCheckDetails['listenerInspection'] =
    'cdp';
  let inspectionError: string | null = null;
  let listenerNodesTruncated = false;
  let domObservation: PointerCancellationCheckDetails['domObservation'] =
    'used';
  // Marked before the element is pressed, so one that navigates or hangs is
  // never pressed again after the restart.
  const tried = new Set<string>();
  let targetsFound = 0;
  let targetsTested = 0;
  let processed = 0;
  let restarts = 0;
  let startUrl = targetUrl;
  let aborted: PointerCancellationCheckDetails['aborted'] = null;
  // Held outside the loop so it is closed in `finally` even if an attempt throws.
  let context: BrowserContext | null = null;
  const startedAt = Date.now();

  const abort = (
    reason: NonNullable<PointerCancellationCheckDetails['aborted']>['reason'],
  ): void => {
    aborted = { reason, testedCount: targetsTested, foundCount: targetsFound };
    out.warn(
      `\n⚠️  Stopped (${reason}): ${targetsTested} of ${targetsFound} targets were pressed.`,
    );
  };

  // A page handler that never returns must not stall the check: every in-page
  // step is cut off after `stepTimeoutMs`.
  const step = <T>(promise: Promise<T>): Promise<T> => {
    promise.catch(() => {}); // Do not leak a rejection after a timeout.
    return withTimeout(promise, stepTimeoutMs);
  };

  // Closing a context also discards a page whose main thread is stuck.
  const closeContext = async (): Promise<boolean> => {
    const current = context;
    context = null;
    if (!current) return true;
    try {
      await withTimeout(current.close(), stepTimeoutMs);
      return true;
    } catch {
      return false;
    }
  };

  try {
    for (let attempt = 0; !aborted; attempt += 1) {
      let needRestart = false;
      let targets: PointerCancellationTarget[] = [];
      try {
        context = await newContext();
        const page: Page = await context.newPage();

        // Context changes seen since the last reset.
        const navigations: string[] = [];
        const newWindows: { url: string }[] = [];
        const dialogs: { dialogType: string; message: string }[] = [];
        const pendingPopups: Promise<void>[] = [];
        const resetRecords = (): void => {
          navigations.length = 0;
          newWindows.length = 0;
          dialogs.length = 0;
          pendingPopups.length = 0;
        };

        // Any main-frame navigation counts, including a reload to the same URL
        // or a `#`-only change: the viewport moving is a change of context too.
        page.on('framenavigated', (frame) => {
          if (frame === page.mainFrame()) navigations.push(frame.url());
        });
        context.on('page', (popup) => {
          if (popup === page) return;
          const record = { url: 'about:blank' };
          newWindows.push(record);
          pendingPopups.push(
            popup
              .waitForLoadState('domcontentloaded', {
                timeout: ACTION_TIMEOUT_MS,
              })
              .then(() => {
                record.url = popup.url();
              })
              .catch(() => {})
              .then(() => popup.close())
              .catch(() => {}),
          );
        });
        page.on('dialog', (dialog) => {
          dialogs.push({
            dialogType: dialog.type(),
            message: dialog.message().slice(0, DIALOG_MESSAGE_MAX),
          });
          dialog.dismiss().catch(() => {});
        });

        await gotoAndSettle(page, targetUrl);
        page.setDefaultTimeout(ACTION_TIMEOUT_MS);
        if (attempt === 0) startUrl = page.url();
        // The initial load and setup must not count as caused by a press.
        resetRecords();

        // Listeners, read through CDP for the whole document in one go.
        const nodesKey = `__a11yPointerCancel_nodes_${randomUUID()}`;
        const targetsKey = `__a11yPointerCancel_targets_${randomUUID()}`;
        const run = { cancelled: false };
        let listenerData = NO_LISTENER_DATA;
        let inspected = false;
        let inspector: EventListenerInspector | null = null;
        const inspection = (async () => {
          inspector = await openEventListenerInspector(page);
          if (!inspector) return null;
          return inspectListeners(inspector, nodesKey, run);
        })();
        inspection.catch(() => {});
        try {
          const data = await withTimeout(inspection, inspectionTimeoutMs);
          if (data) {
            listenerData = data;
            inspected = true;
          } else if (listenerInspection === 'cdp') {
            listenerInspection = 'unsupported';
          }
        } catch (error) {
          // withTimeout does not stop the work: tell it to stop writing to the
          // page. The context is discarded, so nothing else needs cleaning up.
          run.cancelled = true;
          // The first failure is kept; a later success does not hide it.
          if (listenerInspection === 'cdp') {
            listenerInspection = 'failed';
            inspectionError = isStepTimeout(error)
              ? 'timeout'
              : firstLine(error);
          }
        } finally {
          const opened = inspector as EventListenerInspector | null;
          if (opened) await withTimeout(opened.close(), 1_000).catch(() => {});
        }
        if (attempt === 0) {
          pageListeners = listenerData.pageListeners;
          delegationRootCount = listenerData.delegationRootCount;
        }
        if (listenerData.listenerNodesTruncated) listenerNodesTruncated = true;

        try {
          targets = await step(
            page.evaluate(collectTargets, {
              nodesKey,
              targetsKey,
              listenerNodes: listenerData.nodes,
              inspected,
              listenerNodesTruncated: listenerData.listenerNodesTruncated,
              selector: POINTER_CANCELLATION_TARGET_SELECTOR,
              htmlSnippetMaxLength: HTML_SNIPPET_MAX_LENGTH,
            }),
          );
        } catch (error) {
          if (!isStepTimeout(error)) throw error;
          abort('unresponsive');
          break;
        }
        if (attempt === 0) targetsFound = targets.length;

        // Does the page change on its own? Then DOM changes after a press say
        // nothing about the press.
        if (attempt === 0) {
          try {
            await step(page.evaluate(startPress, { targetsKey, index: null }));
            // Longer than one press: a slow ticker must be seen at least once.
            await page.waitForTimeout(
              Math.max(settleMs, POINTER_CANCELLATION_BACKGROUND_MS),
            );
            const background = await step(
              page.evaluate(endPress, {
                targetsKey,
                index: null,
                maxAttributes: POINTER_CANCELLATION_MAX_ATTRIBUTES,
              }),
            );
            if (
              background.addedNodes +
                background.removedNodes +
                background.textChanges +
                background.attributes.length >
              0
            ) {
              domObservation = 'ignored-background-activity';
            }
          } catch (error) {
            if (!isStepTimeout(error)) throw error;
            abort('unresponsive');
            break;
          }
          resetRecords();
        }

        // Targets pressed in this load, including the current one.
        let pressedInAttempt = 0;
        for (const [index, target] of targets.entries()) {
          const key = JSON.stringify([...target.shadowHosts, target.selector]);
          if (tried.has(key)) continue;
          if (Date.now() - startedAt > timeBudgetMs) {
            abort('timeout');
            break;
          }
          if (processed >= maxTargets) {
            abort('target-limit');
            break;
          }
          tried.add(key);
          processed += 1;
          resetRecords();
          const urlBefore = page.url();

          let dispatched: string[] = [];
          let outcome: PressOutcome | null = null;
          let trialError: unknown = null;
          // What was recorded when the press had been observed, before the
          // cancel: effects of `pointercancel` are not the press's.
          let snapshot: {
            navigations: string[];
            newWindows: { url: string }[];
            dialogs: { dialogType: string; message: string }[];
            url: string;
          } | null = null;
          let cancelRestart = false;
          try {
            const started = await step(
              page.evaluate(startPress, { targetsKey, index }),
            );
            if (started.pageReplaced) {
              // A navigation (probably caused by an earlier press) committed
              // late. Nothing is known about this target: press it again,
              // first, after the restart.
              tried.delete(key);
              processed -= 1;
              needRestart = true;
              break;
            }
            if (started.missing) {
              untested.push({ target, reason: 'element-gone' });
              continue;
            }
            pressedInAttempt += 1;
            dispatched = started.dispatched;
            await page.waitForTimeout(settleMs);
            await Promise.all(pendingPopups);
            outcome = await step(
              page.evaluate(endPress, {
                targetsKey,
                index,
                maxAttributes: POINTER_CANCELLATION_MAX_ATTRIBUTES,
              }),
            );
            snapshot = {
              navigations: [...navigations],
              newWindows: newWindows.map((popup) => ({ ...popup })),
              dialogs: dialogs.map((dialog) => ({ ...dialog })),
              url: page.url(),
            };
          } catch (error) {
            trialError = error;
          }

          if (snapshot) {
            // The target has been observed; a problem with the cancel only
            // restarts the check, it does not make the target untested.
            try {
              await step(page.evaluate(cancelPress, { targetsKey, index }));
              await Promise.all(pendingPopups);
            } catch (error) {
              if (
                isStepTimeout(error) ||
                NAVIGATION_ERROR.test(firstLine(error))
              ) {
                cancelRestart = true;
              }
            }
            if (
              navigations.length > snapshot.navigations.length ||
              page.url() !== snapshot.url
            ) {
              cancelRestart = true;
            }
            // Nothing the cancel did is blamed on any target.
            resetRecords();
          }
          const seenNavigations = snapshot?.navigations ?? navigations;
          const seenNewWindows = snapshot?.newWindows ?? newWindows;
          const seenDialogs = snapshot?.dialogs ?? dialogs;

          let navigation =
            seenNavigations.length > 0 ||
            (snapshot?.url ?? page.url()) !== urlBefore;
          if (trialError) {
            if (isStepTimeout(trialError)) {
              // The page is stuck: discard it and carry on in a fresh context.
              untested.push({ target, reason: 'handler-timeout' });
              needRestart = true;
              break;
            }
            const message = firstLine(trialError);
            if (!navigation && NAVIGATION_ERROR.test(message)) {
              navigation = true;
            } else if (
              !navigation &&
              seenNewWindows.length === 0 &&
              seenDialogs.length === 0
            ) {
              untested.push({ target, reason: message });
              continue;
            }
          }

          if (navigation && pressedInAttempt > 1) {
            // An earlier press in this load may have scheduled this
            // navigation, so it cannot be blamed on this target. Press this
            // target again, first, in a fresh load.
            tried.delete(key);
            processed -= 1;
            needRestart = true;
            break;
          }

          const changes: PointerCancellationChange[] = [];
          if (navigation) {
            changes.push({
              kind: 'navigation',
              toUrl: seenNavigations.at(-1) ?? snapshot?.url ?? page.url(),
            });
          }
          for (const popup of seenNewWindows) {
            changes.push({ kind: 'new-window', url: popup.url });
          }
          for (const dialog of seenDialogs) {
            changes.push({ kind: 'dialog', ...dialog });
          }
          if (outcome?.focusMovedTo) {
            changes.push({
              kind: 'focus-moved',
              toSelector: outcome.focusMovedTo,
            });
          }
          if (
            domObservation === 'used' &&
            outcome &&
            outcome.addedNodes +
              outcome.removedNodes +
              outcome.textChanges +
              outcome.attributes.length >
              0
          ) {
            changes.push({
              kind: 'dom',
              addedNodes: outcome.addedNodes,
              removedNodes: outcome.removedNodes,
              textChanges: outcome.textChanges,
              attributes: outcome.attributes,
            });
          }

          targetsTested += 1;
          if (changes.length > 0) {
            findings.push({
              target,
              kind: 'activated-on-press',
              dispatched,
              changes,
            });
          } else if (
            target.listeners &&
            target.listeners.press.length > 0 &&
            target.listeners.release.length === 0
          ) {
            findings.push({
              target,
              kind: 'press-only-listener',
              dispatched,
              changes: [],
            });
          }

          // The cancelled target is not pressed again after the restart.
          if (navigation || cancelRestart) {
            needRestart = true;
            break;
          }
        }
      } finally {
        if (!(await closeContext()) && !aborted) abort('unresponsive');
      }

      // Nothing left to press: restarting would only reload the page.
      if (
        aborted ||
        !needRestart ||
        targets.every((target) =>
          tried.has(JSON.stringify([...target.shadowHosts, target.selector])),
        )
      ) {
        break;
      }
      if (restarts >= POINTER_CANCELLATION_MAX_RESTARTS) {
        abort('restart-limit');
        break;
      }
      restarts += 1;
    }

    const details: PointerCancellationCheckDetails = {
      listenerInspection,
      inspectionError,
      listenerNodesTruncated,
      domObservation,
      targetsFound,
      targetsTested,
      findings,
      untested,
      pageListeners,
      delegationRootCount,
      restarts,
      aborted,
    };
    const result = buildAuditResult({
      source: 'pointer-cancellation-check',
      url: startUrl,
      details,
      buckets: normalizePointerCancellationCheck(details),
    });
    out.save(result);
    out.header('Pointer Cancellation Check', 'WCAG 2.5.2', startUrl);
    out.summary({
      'Listener inspection': listenerInspection,
      'Targets found': targetsFound,
      'Targets pressed': targetsTested,
      Findings: findings.length,
      Restarts: restarts,
    });
    out.outputPaths();
    return result;
  } finally {
    await closeContext();
  }
}
