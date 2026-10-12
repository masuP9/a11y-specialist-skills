/**
 * Motion Actuation Check — WCAG 2.5.4 (Motion Actuation)
 *
 * Lists the devicemotion / deviceorientation / deviceorientationabsolute
 * listeners on `window` and `document` through the Chrome DevTools Protocol
 * (see cdpEventListeners.ts) and reports each as a candidate (`incomplete`):
 * whether a UI alternative exists and motion actuation can be turned off needs
 * a human. Unless `simulate: false`, synthetic events are dispatched to window
 * and DOM mutations are counted as evidence that the page really reacts.
 *
 * The caller is responsible for navigating the page before calling this.
 *
 * Limitations:
 * - CDP is Chromium only; elsewhere the result is `listenerInspection:
 *   'unsupported'` and `incomplete`.
 * - Only the main frame's window / document are inspected, not iframes.
 * - Listeners attached after a user action (e.g. after the iOS
 *   `DeviceMotionEvent.requestPermission()` prompt) are not found.
 * - Generic Sensor API (`Accelerometer` etc.) and camera / microphone based
 *   motion detection are not inspected.
 * - Synthetic events are `isTrusted: false`. Pages that check `isTrusted`, or
 *   only draw on a canvas, show "no DOM change"; the listener is still reported.
 * - The simulation changes the state of the given page; pass `simulate: false`
 *   when reusing the page afterwards. The CLI uses a fresh context per check.
 */

import type { Page } from '@playwright/test';
import type {
  MotionActuationCheckDetails,
  MotionActuationCheckResult,
  MotionEventType,
  MotionListener,
  MotionSimulationResult,
} from '../types.js';
import {
  DEFAULT_MOTION_ACTUATION_RESULT_FILE,
  MOTION_EVENT_TYPES,
  MOTION_SIMULATION_EVENT_COUNT,
  MOTION_SIMULATION_INTERVAL_MS,
  MOTION_SIMULATION_SETTLE_MS,
  MOTION_SIMULATION_TIMEOUT_MS,
} from '../constants.js';
import {
  buildAuditResult,
  normalizeMotionActuationCheck,
} from '../utils/axe-format.js';
import {
  createAuditOutput,
  type AuditOutputOptions,
} from '../utils/test-harness.js';
import {
  openEventListenerInspector,
  type EventListenerInspector,
} from './cdpEventListeners.js';

export interface RunMotionActuationCheckOptions extends AuditOutputOptions {
  /** A page already navigated to the target URL. */
  page: Page;
  /** Dispatch synthetic motion/orientation events to see whether the page reacts. Default: true. */
  simulate?: boolean;
}

type PageSimulationOutcome =
  | { eventsDispatched: number; domMutations: number }
  | { error: string };

/** Runs in the page: dispatches synthetic events and counts DOM mutations. */
async function dispatchMotionEvents(args: {
  type: MotionEventType;
  count: number;
  intervalMs: number;
  settleMs: number;
}): Promise<PageSimulationOutcome> {
  const { type, count, intervalMs, settleMs } = args;
  const isMotion = type === 'devicemotion';
  if (
    typeof (isMotion ? DeviceMotionEvent : DeviceOrientationEvent) !==
    'function'
  ) {
    return { error: 'constructor-unavailable' };
  }

  let mutations = 0;
  const observer = new MutationObserver((records) => {
    mutations += records.length;
  });
  observer.observe(document.documentElement, {
    childList: true,
    attributes: true,
    characterData: true,
    subtree: true,
  });

  for (let i = 0; i < count; i++) {
    let event: Event;
    if (isMotion) {
      const x = i % 2 === 0 ? 25 : -25;
      event = new DeviceMotionEvent(type, {
        acceleration: { x, y: 0, z: 0 },
        accelerationIncludingGravity: { x, y: 0, z: 0 },
        rotationRate: { alpha: 0, beta: 0, gamma: 0 },
        interval: 16,
      });
    } else {
      const angle = (60 * i) / Math.max(count - 1, 1);
      event = new DeviceOrientationEvent(type, {
        alpha: 0,
        beta: angle,
        gamma: angle,
        absolute: type === 'deviceorientationabsolute',
      });
    }
    window.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  await new Promise((resolve) => setTimeout(resolve, settleMs));

  // Records still queued count too.
  mutations += observer.takeRecords().length;
  observer.disconnect();
  return { eventsDispatched: count, domMutations: mutations };
}

const NAVIGATION_ERROR_PATTERN = /Execution context was destroyed|navigat/i;

/**
 * Dispatch one event type, bounded by MOTION_SIMULATION_TIMEOUT_MS. A handler
 * that never returns is stopped through CDP; the page itself is left open
 * (it belongs to the caller).
 */
async function simulateOne(
  page: Page,
  inspector: EventListenerInspector,
  type: MotionEventType,
  urlBefore: string,
): Promise<MotionSimulationResult> {
  const notMeasured = {
    type,
    eventsDispatched: null,
    domMutations: null,
    navigated: false,
    urlAfter: null,
  } satisfies Omit<MotionSimulationResult, 'error'>;

  const evaluation = page.evaluate(dispatchMotionEvents, {
    type,
    count: MOTION_SIMULATION_EVENT_COUNT,
    intervalMs: MOTION_SIMULATION_INTERVAL_MS,
    settleMs: MOTION_SIMULATION_SETTLE_MS,
  });
  // If the timeout wins, this promise may reject later (after termination).
  evaluation.catch(() => {});

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), MOTION_SIMULATION_TIMEOUT_MS);
  });
  let settled:
    | { outcome: PageSimulationOutcome }
    | { failure: unknown }
    | 'timeout';
  try {
    settled = await Promise.race([
      evaluation.then(
        (outcome) => ({ outcome }),
        (failure: unknown) => ({ failure }),
      ),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }

  if (settled === 'timeout') {
    try {
      await inspector.terminateExecution();
    } catch {
      return { ...notMeasured, error: 'timeout-unrecoverable' };
    }
    return { ...notMeasured, error: 'timeout' };
  }

  const urlAfter = page.url();
  const navigated = urlAfter !== urlBefore;
  if ('failure' in settled) {
    const message =
      settled.failure instanceof Error
        ? settled.failure.message
        : String(settled.failure);
    if (navigated || NAVIGATION_ERROR_PATTERN.test(message)) {
      return {
        ...notMeasured,
        navigated: true,
        urlAfter,
        error: null,
      };
    }
    return { ...notMeasured, error: message };
  }

  const { outcome } = settled;
  if ('error' in outcome) {
    return {
      ...notMeasured,
      navigated,
      urlAfter: navigated ? urlAfter : null,
      error: outcome.error,
    };
  }
  return {
    type,
    eventsDispatched: outcome.eventsDispatched,
    domMutations: outcome.domMutations,
    navigated,
    urlAfter: navigated ? urlAfter : null,
    error: null,
  };
}

/**
 * Run the motion actuation check against the current page, write the result
 * JSON, and return the parsed result.
 */
export async function runMotionActuationCheck(
  options: RunMotionActuationCheckOptions,
): Promise<MotionActuationCheckResult> {
  const { page, simulate, ...location } = options;
  const out = createAuditOutput({
    ...location,
    defaultFile: DEFAULT_MOTION_ACTUATION_RESULT_FILE,
  });

  // The simulation may navigate; the result describes the page as inspected.
  const url = page.url();
  const inspector = await openEventListenerInspector(page);

  const details: MotionActuationCheckDetails = {
    listenerInspection: inspector ? 'cdp' : 'unsupported',
    listeners: [],
    simulation: { status: 'unsupported', results: [] },
  };

  if (inspector) {
    try {
      for (const target of ['window', 'document'] as const) {
        const records = await inspector.forExpression(
          target,
          MOTION_EVENT_TYPES,
        );
        for (const record of records) {
          details.listeners.push({
            ...record,
            target,
            type: record.type as MotionEventType,
          });
        }
      }

      const windowTypes = new Set<string>(
        details.listeners
          .filter((l: MotionListener) => l.target === 'window')
          .map((l) => l.type),
      );
      if (simulate === false) {
        details.simulation.status = 'disabled';
      } else if (windowTypes.size === 0) {
        details.simulation.status = 'skipped-no-listeners';
      } else {
        details.simulation.status = 'ran';
        for (const type of MOTION_EVENT_TYPES) {
          if (!windowTypes.has(type)) continue;
          const result = await simulateOne(page, inspector, type, url);
          details.simulation.results.push(result);
          // After a navigation or a stuck handler the page is not in a state
          // to keep dispatching into.
          if (result.navigated || result.error?.startsWith('timeout')) break;
        }
      }
    } finally {
      await inspector.close();
    }
  }

  const result: MotionActuationCheckResult = buildAuditResult({
    source: 'motion-actuation-check',
    url,
    details,
    buckets: normalizeMotionActuationCheck(details),
  });

  out.header('Motion Actuation Check Results', 'WCAG 2.5.4', result.url);

  out.summary({
    'Listener inspection': details.listenerInspection,
    'Motion listeners': details.listeners.length,
    Simulation: details.simulation.status,
  });

  out.issueList<MotionListener>(
    'Motion Listener Candidates',
    details.listeners,
    (listener, i) => [
      `${i + 1}. ${listener.target} "${listener.type}" (script ${listener.scriptId}, line ${listener.lineNumber + 1}:${listener.columnNumber + 1})`,
    ],
  );

  out.save(result);

  out.outputPaths();

  return result;
}
