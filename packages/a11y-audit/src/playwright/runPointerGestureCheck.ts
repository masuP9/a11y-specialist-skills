/**
 * Pointer Gesture Check — WCAG 2.5.1 (Pointer Gestures) / 2.5.7 (Dragging
 * Movements)
 *
 * Lists elements that may be operated by dragging, swiping or multiple fingers
 * and reports them as candidates (all `incomplete`; a human or an AI checks
 * that the same function works with a single pointer without a path or
 * dragging, and whether the gesture is essential). One run feeds two rules,
 * `a11y-skills/pointer-gestures` (2.5.1) and `a11y-skills/dragging-movements`
 * (2.5.7), because the signals overlap.
 *
 * Signals (see PointerGestureSignalKind):
 * - listeners, read through CDP in one call for the whole document: dragstart /
 *   drop; a press listener together with a move listener on the same element;
 *   listeners that look at multiple touches;
 * - `draggable="true"` and known widget markup (custom sliders, sortable lists,
 *   carousels, maps), matched in the document and in open shadow roots.
 * Move listeners alone (hover effects) and nodes with listeners for many event
 * types (framework delegation roots) are not candidates.
 *
 * The caller is responsible for navigating the page before calling this. No
 * events are sent and the page is left untouched; the temporary
 * `window.__a11yPointerGesture_*` property is always deleted afterwards.
 *
 * Limitations:
 * - Listeners are visible only in Chromium (CDP). Elsewhere only attributes and
 *   widget markup are used and both rules get a manual-check note.
 * - Gestures built on delegation (a handler on `document`, or on a root with
 *   DELEGATION_MIN_TYPES or more event types, dispatching on `event.target`)
 *   cannot be attributed to an element; the attributes and widget markup still
 *   apply.
 * - A drag that adds its move listener to `document` only after the press is
 *   not seen as `move-listener` (the move listener does not exist yet). A
 *   press listener alone overlaps 2.5.2 and is not reported here.
 * - Multiple fingers are recognised by matching the first characters of the
 *   handler source; counting `pointerId`s is not recognised.
 * - Elements inside iframes are not inspected (a map iframe is matched as a
 *   widget). Candidates inside open shadow roots are given as `shadowHosts` +
 *   `selector`; closed shadow roots are not visible.
 * - If listener inspection does not stop within the grace period after its
 *   time limit (the page or CDP is not responding), the page scan is skipped
 *   and both rules are `incomplete`; in that case the temporary
 *   `window.__a11yPointerGesture_*` property may remain.
 * - Nothing is dragged or swiped to see whether something moves.
 */

import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import type {
  PointerGestureCandidate,
  PointerGestureCheckDetails,
  PointerGestureCheckResult,
  PointerGestureCriterion,
  PointerGestureDelegationRoot,
  PointerGestureListenerLocation,
  PointerGesturePageListener,
  PointerGestureSignal,
  PointerGestureSignalKind,
} from '../types.js';
import {
  DEFAULT_POINTER_GESTURE_RESULT_FILE,
  HTML_SNIPPET_MAX_LENGTH,
  POINTER_GESTURE_CANCEL_GRACE_MS,
  POINTER_GESTURE_CRITERIA_BY_SIGNAL,
  POINTER_GESTURE_DELEGATION_MIN_TYPES,
  POINTER_GESTURE_DRAG_TYPES,
  POINTER_GESTURE_INSPECTION_TIMEOUT_MS,
  POINTER_GESTURE_MAX_CANDIDATES,
  POINTER_GESTURE_MAX_LISTENER_NODES,
  POINTER_GESTURE_MOVE_TYPES,
  POINTER_GESTURE_MULTIPOINT_PATTERN,
  POINTER_GESTURE_MULTIPOINT_TYPES,
  POINTER_GESTURE_PRESS_TYPES,
  POINTER_GESTURE_WIDGET_HINTS,
} from '../constants.js';
import {
  buildAuditResult,
  normalizePointerGestureCheck,
} from '../utils/axe-format.js';
import {
  createAuditOutput,
  type AuditOutputOptions,
} from '../utils/test-harness.js';
import {
  openEventListenerInspector,
  type EventListenerInspector,
  type EventListenerRecord,
} from './cdpEventListeners.js';

export interface RunPointerGestureCheckOptions extends AuditOutputOptions {
  /** A page already navigated to the target URL. */
  page: Page;
  /**
   * Upper bound for the listener inspection (ms). Default:
   * POINTER_GESTURE_INSPECTION_TIMEOUT_MS. Mainly for tests of the timeout path.
   */
  inspectionTimeoutMs?: number;
}

// =============================================================================
// Scan (runs in the page)
// =============================================================================

interface ScanArgs {
  nodesKey: string;
  /** Signals found from listeners, for the node at `window[nodesKey][index]`. */
  nodeSignals: { index: number; signals: PointerGestureSignal[] }[];
  delegationIndices: number[];
  hints: { kind: PointerGestureSignalKind; selector: string }[];
  criteriaBySignal: typeof POINTER_GESTURE_CRITERIA_BY_SIGNAL;
  htmlSnippetMaxLength: number;
  maxCandidates: number;
}

interface ScanResult {
  candidates: PointerGestureCandidate[];
  candidateCounts: PointerGestureCheckDetails['candidateCounts'];
  delegationRoots: { index: number; selector: string; shadowHosts: string[] }[];
}

/**
 * Serialized and run in the page, so it cannot use imports: the helpers below
 * are copied from runAccessibleAuthenticationCheck.ts on purpose.
 */
function scanPointerGestures(args: ScanArgs): ScanResult {
  const {
    nodesKey,
    nodeSignals,
    delegationIndices,
    hints,
    criteriaBySignal,
    htmlSnippetMaxLength,
    maxCandidates,
  } = args;
  const nodes =
    ((window as unknown as Record<string, unknown>)[nodesKey] as
      | unknown[]
      | undefined) ?? [];

  // Like getUniqueSelector() in runAccessibleAuthenticationCheck.ts, except
  // that the search scope is the document or the shadow root the element is in.
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

  function isVisible(element: Element): boolean {
    return (
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== 'hidden'
    );
  }

  const entries = new Map<
    Element,
    { order: number | null; signals: PointerGestureSignal[] }
  >();
  function entryOf(element: Element) {
    let entry = entries.get(element);
    if (!entry) {
      entry = { order: null, signals: [] };
      entries.set(element, entry);
    }
    return entry;
  }

  // Signals from listeners first (they are attached to nodes collected by CDP).
  for (const { index, signals } of nodeSignals) {
    const node = nodes[index];
    if (node instanceof Element) entryOf(node).signals.push(...signals);
  }

  // One depth-first walk of the composed tree (document and open shadow roots),
  // so that candidates come out in document order. compareDocumentPosition does
  // not order nodes across shadow roots, and querySelectorAll does not look
  // inside them.
  const brokenHints = new Set<string>();
  let counter = 0;
  const attributeSignals = new Map<Element, PointerGestureSignal[]>();
  function visit(element: Element): void {
    const order = counter++;
    const found: PointerGestureSignal[] = [];
    if (element.getAttribute('draggable') === 'true') {
      found.push({
        kind: 'draggable-attribute',
        detail: 'draggable="true"',
        listener: null,
      });
    }
    for (const hint of hints) {
      if (brokenHints.has(hint.selector)) continue;
      try {
        if (element.matches(hint.selector)) {
          found.push({
            kind: hint.kind,
            detail: hint.selector,
            listener: null,
          });
        }
      } catch {
        brokenHints.add(hint.selector);
      }
    }
    if (found.length > 0) attributeSignals.set(element, found);
    const entry = entries.get(element);
    if (entry) entry.order = order;
    else if (found.length > 0) entryOf(element).order = order;
  }
  function walk(parent: ParentNode): void {
    for (const element of Array.from(parent.children)) {
      visit(element);
      if (element.shadowRoot) walk(element.shadowRoot);
      walk(element);
    }
  }
  walk(document);
  for (const [element, found] of attributeSignals) {
    entryOf(element).signals.unshift(...found);
  }

  // Elements the walk did not reach (e.g. inside a closed shadow root) go last.
  let unreached = counter;
  const ordered = Array.from(entries.entries())
    .filter(([, entry]) => entry.signals.length > 0)
    .map(([element, entry]) => ({
      element,
      order: entry.order ?? unreached++,
      signals: entry.signals,
    }))
    .sort((a, b) => a.order - b.order);

  const candidates: PointerGestureCandidate[] = [];
  const foundCounts: Record<PointerGestureCriterion, number> = {
    '2.5.1': 0,
    '2.5.7': 0,
  };
  const keptCounts: Record<PointerGestureCriterion, number> = {
    '2.5.1': 0,
    '2.5.7': 0,
  };
  ordered.forEach(({ element, signals }, position) => {
    const criteria = (['2.5.1', '2.5.7'] as const).filter((criterion) =>
      signals.some((s) => criteriaBySignal[s.kind].includes(criterion)),
    );
    for (const criterion of criteria) foundCounts[criterion]++;
    if (position >= maxCandidates) return;
    for (const criterion of criteria) keptCounts[criterion]++;
    candidates.push({
      selector: scopeSelector(element),
      shadowHosts: shadowHostsOf(element),
      ...safeOuterHTML(element),
      tagName: element.tagName.toLowerCase(),
      role: element.getAttribute('role'),
      visible: isVisible(element),
      signals,
      criteria,
    });
  });

  const delegationRoots: ScanResult['delegationRoots'] = [];
  for (const index of delegationIndices) {
    const node = nodes[index];
    if (!(node instanceof Element)) continue;
    delegationRoots.push({
      index,
      selector: scopeSelector(node),
      shadowHosts: shadowHostsOf(node),
    });
  }

  return {
    candidates,
    candidateCounts: {
      total: ordered.length,
      byCriterion: {
        '2.5.1': { found: foundCounts['2.5.1'], kept: keptCounts['2.5.1'] },
        '2.5.7': { found: foundCounts['2.5.7'], kept: keptCounts['2.5.7'] },
      },
    },
    delegationRoots,
  };
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

function locationOf(l: EventListenerRecord): PointerGestureListenerLocation {
  return {
    scriptId: l.scriptId,
    lineNumber: l.lineNumber,
    columnNumber: l.columnNumber,
    handlerPreview: l.handlerPreview,
  };
}

const MULTIPOINT_PREVIEW_TYPES: readonly string[] = ['touchstart', 'touchmove'];

function isMultipoint(l: EventListenerRecord): boolean {
  return (
    (POINTER_GESTURE_MULTIPOINT_TYPES as readonly string[]).includes(l.type) ||
    (MULTIPOINT_PREVIEW_TYPES.includes(l.type) &&
      l.handlerPreview !== null &&
      POINTER_GESTURE_MULTIPOINT_PATTERN.test(l.handlerPreview))
  );
}

const PAGE_LISTENER_TYPES: readonly string[] = [
  ...POINTER_GESTURE_PRESS_TYPES,
  ...POINTER_GESTURE_MOVE_TYPES,
  ...POINTER_GESTURE_DRAG_TYPES,
  ...POINTER_GESTURE_MULTIPOINT_TYPES,
];

/** Signals a single node's listeners give (none when they show nothing). */
function signalsOfListeners(
  listeners: readonly EventListenerRecord[],
): PointerGestureSignal[] {
  const signals: PointerGestureSignal[] = [];
  const first = (types: readonly string[]) =>
    listeners.find((l) => types.includes(l.type));
  const present = (types: readonly string[]) =>
    types.filter((type) => listeners.some((l) => l.type === type));

  const drag = present(POINTER_GESTURE_DRAG_TYPES);
  const dragListener = first(drag);
  if (dragListener) {
    signals.push({
      kind: 'drag-listener',
      detail: drag.join('+'),
      listener: locationOf(dragListener),
    });
  }

  const press = present(POINTER_GESTURE_PRESS_TYPES);
  const move = present(POINTER_GESTURE_MOVE_TYPES);
  const pressListener = first(press);
  if (pressListener && move.length > 0) {
    signals.push({
      kind: 'move-listener',
      detail: [...press, ...move].join('+'),
      listener: locationOf(pressListener),
    });
  }

  const multipoint = listeners.filter(isMultipoint);
  const multipointListener = multipoint[0];
  if (multipointListener) {
    signals.push({
      kind: 'multipoint-listener',
      detail: [...new Set(multipoint.map((l) => l.type))].join('+'),
      listener: locationOf(multipointListener),
    });
  }
  return signals;
}

interface ListenerData {
  pageListeners: PointerGesturePageListener[];
  /** window / document roots (element roots are added after the page scan). */
  rootsOutsideElements: PointerGestureDelegationRoot[];
  listenerNodesTruncated: boolean;
  nodeSignals: ScanArgs['nodeSignals'];
  /** index in window[nodesKey] -> number of event types, for delegation roots. */
  delegationTypeCounts: Map<number, number>;
}

const NO_LISTENER_DATA: ListenerData = {
  pageListeners: [],
  rootsOutsideElements: [],
  listenerNodesTruncated: false,
  nodeSignals: [],
  delegationTypeCounts: new Map(),
};

function distinctTypes(listeners: readonly EventListenerRecord[]): number {
  return new Set(listeners.map((l) => l.type)).size;
}

async function inspectListeners(
  inspector: EventListenerInspector,
  nodesKey: string,
  run: { cancelled: boolean },
): Promise<ListenerData> {
  const stopIfCancelled = () => {
    if (run.cancelled) throw new Error('cancelled');
  };

  const pageListeners: PointerGesturePageListener[] = [];
  const rootsOutsideElements: PointerGestureDelegationRoot[] = [];
  for (const target of ['window', 'document'] as const) {
    const listeners = await inspector.forExpression(target);
    stopIfCancelled();
    const eventTypeCount = distinctTypes(listeners);
    const isDelegationRoot =
      eventTypeCount >= POINTER_GESTURE_DELEGATION_MIN_TYPES;
    if (isDelegationRoot) {
      rootsOutsideElements.push({
        selector: target,
        shadowHosts: [],
        eventTypeCount,
      });
    }
    for (const l of listeners) {
      // A delegation root keeps only its multiple-touch listeners.
      if (
        isDelegationRoot
          ? !isMultipoint(l)
          : !PAGE_LISTENER_TYPES.includes(l.type)
      ) {
        continue;
      }
      pageListeners.push({
        ...locationOf(l),
        target,
        type: l.type,
        multipoint: isMultipoint(l),
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

  const signalsByNode = new Map<number, PointerGestureSignal[]>();
  const delegationByNode = new Map<number, number>();
  for (const [backendNodeId, listeners] of byNode) {
    const eventTypeCount = distinctTypes(listeners);
    if (eventTypeCount >= POINTER_GESTURE_DELEGATION_MIN_TYPES) {
      delegationByNode.set(backendNodeId, eventTypeCount);
      continue;
    }
    const signals = signalsOfListeners(listeners);
    if (signals.length > 0) signalsByNode.set(backendNodeId, signals);
  }

  const allIds = [...signalsByNode.keys(), ...delegationByNode.keys()].sort(
    (a, b) => a - b,
  );
  const ids = allIds.slice(0, POINTER_GESTURE_MAX_LISTENER_NODES);
  const indices = await inspector.collectNodes(
    ids,
    nodesKey,
    () => run.cancelled,
  );
  stopIfCancelled();

  const nodeSignals: ListenerData['nodeSignals'] = [];
  const delegationTypeCounts = new Map<number, number>();
  ids.forEach((id, i) => {
    const index = indices[i] ?? -1;
    if (index < 0) return;
    const signals = signalsByNode.get(id);
    if (signals) nodeSignals.push({ index, signals });
    const eventTypeCount = delegationByNode.get(id);
    if (eventTypeCount !== undefined) {
      delegationTypeCounts.set(index, eventTypeCount);
    }
  });

  return {
    pageListeners,
    rootsOutsideElements,
    listenerNodesTruncated: allIds.length > ids.length,
    nodeSignals,
    delegationTypeCounts,
  };
}

/**
 * Run the pointer gesture check against the current page, write the result
 * JSON, and return the parsed result.
 */
export async function runPointerGestureCheck(
  options: RunPointerGestureCheckOptions,
): Promise<PointerGestureCheckResult> {
  const { page, inspectionTimeoutMs, ...location } = options;
  const out = createAuditOutput({
    ...location,
    defaultFile: DEFAULT_POINTER_GESTURE_RESULT_FILE,
  });

  const url = page.url();
  const nodesKey = `__a11yPointerGesture_${randomUUID()}`;
  const run = { cancelled: false };

  let listenerInspection: PointerGestureCheckDetails['listenerInspection'] =
    'cdp';
  let inspectionError: string | null = null;
  let listenerData = NO_LISTENER_DATA;
  let scanSkipped = false;
  let scan: ScanResult = {
    candidates: [],
    candidateCounts: {
      total: 0,
      byCriterion: {
        '2.5.1': { found: 0, kept: 0 },
        '2.5.7': { found: 0, kept: 0 },
      },
    },
    delegationRoots: [],
  };

  let inspector: EventListenerInspector | null = null;
  try {
    inspector = await openEventListenerInspector(page);
    if (!inspector) listenerInspection = 'unsupported';
  } catch (error) {
    listenerInspection = 'failed';
    inspectionError = firstLine(error);
  }

  try {
    if (inspector) {
      const inspection = inspectListeners(inspector, nodesKey, run);
      inspection.catch(() => {}); // Do not leak a rejection after a timeout.
      try {
        listenerData = await withTimeout(
          inspection,
          inspectionTimeoutMs ?? POINTER_GESTURE_INSPECTION_TIMEOUT_MS,
        );
      } catch (error) {
        // withTimeout does not stop the work: tell it to stop writing to the
        // page, and wait until it has before cleaning up.
        run.cancelled = true;
        const stopped = await withTimeout(
          inspection.then(
            () => true,
            () => true,
          ),
          POINTER_GESTURE_CANCEL_GRACE_MS,
        ).catch(() => false);
        listenerInspection = 'failed';
        inspectionError = isStepTimeout(error)
          ? stopped
            ? 'timeout'
            : 'timeout-unrecoverable'
          : firstLine(error);
        listenerData = NO_LISTENER_DATA;
        scanSkipped = !stopped;
      }
    }

    if (!scanSkipped) {
      scan = await page.evaluate(scanPointerGestures, {
        nodesKey,
        nodeSignals: listenerData.nodeSignals,
        delegationIndices: [...listenerData.delegationTypeCounts.keys()],
        hints: POINTER_GESTURE_WIDGET_HINTS.map(({ kind, selector }) => ({
          kind,
          selector,
        })),
        criteriaBySignal: POINTER_GESTURE_CRITERIA_BY_SIGNAL,
        htmlSnippetMaxLength: HTML_SNIPPET_MAX_LENGTH,
        maxCandidates: POINTER_GESTURE_MAX_CANDIDATES,
      });
    }
  } finally {
    // Always remove the temporary property (a no-op when it was never created).
    await withTimeout(
      page.evaluate((key) => {
        delete (window as unknown as Record<string, unknown>)[key];
      }, nodesKey),
      1_000,
    ).catch(() => {});
    if (inspector) await withTimeout(inspector.close(), 1_000).catch(() => {});
  }

  const details: PointerGestureCheckDetails = {
    listenerInspection,
    inspectionError,
    candidates: scan.candidates,
    candidateCounts: scan.candidateCounts,
    listenerNodesTruncated: listenerData.listenerNodesTruncated,
    pageListeners: listenerData.pageListeners,
    delegationRoots: [
      ...listenerData.rootsOutsideElements,
      ...scan.delegationRoots.map(({ index, selector, shadowHosts }) => ({
        selector,
        shadowHosts,
        eventTypeCount: listenerData.delegationTypeCounts.get(index) ?? 0,
      })),
    ],
  };

  const result: PointerGestureCheckResult = buildAuditResult({
    source: 'pointer-gesture-check',
    url,
    details,
    buckets: normalizePointerGestureCheck(details),
  });

  out.header('Pointer Gesture Check Results', 'WCAG 2.5.1 / 2.5.7', result.url);

  out.summary({
    'Listener inspection': details.listenerInspection,
    Candidates: details.candidates.length,
    'Delegation roots': details.delegationRoots.length,
  });

  out.issueList<PointerGestureCandidate>(
    'Pointer Gesture Candidates',
    details.candidates,
    (candidate, i) => [
      `${i + 1}. ${candidate.selector} [${candidate.criteria.join(', ')}] ${candidate.signals.map((s) => s.kind).join(', ')}`,
    ],
  );

  out.save(result);

  out.outputPaths();

  return result;
}
