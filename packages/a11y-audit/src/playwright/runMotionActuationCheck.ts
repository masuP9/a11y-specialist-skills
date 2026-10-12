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

import { randomUUID } from 'node:crypto';
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

interface SimulationArgs {
  type: MotionEventType;
  count: number;
  intervalMs: number;
  settleMs: number;
  /**
   * window[cancelKey].cancelled = true stops the page function before its next
   * dispatch: Runtime.terminateExecution does not cancel pending timers.
   */
  cancelKey: string;
}

type PageStepOutcome<T> = T | { error: string };

/**
 * Runs in the page: dispatches `count` events (when `dispatch`) with the same
 * waits as the baseline, and counts DOM mutations over the whole window. Called
 * once without dispatching (baseline: changes the page makes by itself) and once
 * with, so the two windows are structurally identical.
 */
async function observeMotionWindow(
  args: SimulationArgs & { dispatch: boolean },
): Promise<PageStepOutcome<{ domMutations: number }>> {
  const { type, count, intervalMs, settleMs, dispatch, cancelKey } = args;
  const isCancelled = () =>
    (window as unknown as Record<string, { cancelled?: boolean } | undefined>)[
      cancelKey
    ]?.cancelled === true;
  const isMotion = type === 'devicemotion';
  // `typeof` on an undeclared name is safe (they are missing in non-secure contexts).
  if (
    isMotion
      ? typeof DeviceMotionEvent !== 'function'
      : typeof DeviceOrientationEvent !== 'function'
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
    if (isCancelled()) {
      observer.disconnect();
      return { error: 'cancelled' };
    }
    if (dispatch) {
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
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  await new Promise((resolve) => setTimeout(resolve, settleMs));
  if (isCancelled()) {
    observer.disconnect();
    return { error: 'cancelled' };
  }

  // Records still queued count too.
  mutations += observer.takeRecords().length;
  observer.disconnect();
  return { domMutations: mutations };
}

const NAVIGATION_ERROR_PATTERN =
  /Execution context was destroyed|because of a navigation/i;

type StepResult<T> = { outcome: T } | { failure: unknown };
type SimulationSequence =
  | {
      phase: 'baseline';
      step: StepResult<PageStepOutcome<{ domMutations: number }>>;
    }
  | {
      phase: 'dispatch';
      baseline: number;
      step: StepResult<PageStepOutcome<{ domMutations: number }>>;
    };

function settleStep<T>(promise: Promise<T>): Promise<StepResult<T>> {
  return promise.then(
    (outcome) => ({ outcome }),
    (failure: unknown) => ({ failure }),
  );
}

/**
 * Baseline then dispatch, in two separate evaluates, so a navigation during the
 * baseline is not attributed to the synthetic events.
 */
async function runSequence(
  page: Page,
  args: SimulationArgs,
  onEvaluation: (evaluation: Promise<unknown>) => unknown,
  urlBefore: string,
  run: { cancelled: boolean },
): Promise<SimulationSequence> {
  const baselineEvaluation = page.evaluate(observeMotionWindow, {
    ...args,
    dispatch: false,
  });
  onEvaluation(baselineEvaluation);
  const baselineStep = await settleStep(baselineEvaluation);
  if (
    'failure' in baselineStep ||
    'error' in baselineStep.outcome ||
    page.url() !== urlBefore ||
    run.cancelled
  ) {
    return { phase: 'baseline', step: baselineStep };
  }
  const baseline = baselineStep.outcome.domMutations;

  const dispatchEvaluation = page.evaluate(observeMotionWindow, {
    ...args,
    dispatch: true,
  });
  onEvaluation(dispatchEvaluation);
  return {
    phase: 'dispatch',
    baseline,
    step: await settleStep(dispatchEvaluation),
  };
}

/**
 * Simulate one event type, bounded by MOTION_SIMULATION_TIMEOUT_MS. A handler
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
    baselineDomMutations: null,
    navigated: false,
    urlAfter: null,
  } satisfies Omit<MotionSimulationResult, 'error'>;

  // Evaluations still pending when the timeout wins may reject later (after
  // termination); never let that escape.
  let sequenceSettled = false;
  const run = { cancelled: false };
  const cancelKey = `__a11yMotion_${randomUUID()}`;
  const sequence = runSequence(
    page,
    {
      type,
      count: MOTION_SIMULATION_EVENT_COUNT,
      intervalMs: MOTION_SIMULATION_INTERVAL_MS,
      settleMs: MOTION_SIMULATION_SETTLE_MS,
      cancelKey,
    },
    (evaluation) => evaluation.catch(() => {}),
    urlBefore,
    run,
  );
  void sequence.then(
    () => (sequenceSettled = true),
    () => (sequenceSettled = true),
  );
  sequence.catch(() => {});

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), MOTION_SIMULATION_TIMEOUT_MS);
  });
  let settled: SimulationSequence | 'timeout';
  try {
    settled = await Promise.race([sequence, timeout]);
  } finally {
    clearTimeout(timer);
  }

  // A sequence that finished just as the timeout fired is not terminated.
  if (settled === 'timeout' && sequenceSettled) settled = await sequence;
  if (settled === 'timeout') {
    run.cancelled = true;
    let terminated = true;
    try {
      await inspector.terminateExecution();
    } catch {
      terminated = false;
    }
    // Pending timers survive termination: tell the page function to stop
    // before it dispatches again. Bounded, since the page may still be stuck.
    await Promise.race([
      page
        .evaluate((key) => {
          (window as unknown as Record<string, unknown>)[key] = {
            cancelled: true,
          };
        }, cancelKey)
        .catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 1_000)),
    ]);
    return {
      ...notMeasured,
      error: terminated ? 'timeout' : 'timeout-unrecoverable',
    };
  }

  const urlAfter = page.url();
  const navigated = urlAfter !== urlBefore;
  const { step } = settled;
  if ('failure' in step) {
    const message =
      step.failure instanceof Error
        ? step.failure.message
        : String(step.failure);
    if (navigated || NAVIGATION_ERROR_PATTERN.test(message)) {
      return {
        ...notMeasured,
        navigated: true,
        urlAfter,
        error:
          settled.phase === 'baseline' ? 'navigated-before-dispatch' : null,
      };
    }
    return { ...notMeasured, error: message };
  }
  if ('error' in step.outcome) {
    return {
      ...notMeasured,
      navigated,
      urlAfter: navigated ? urlAfter : null,
      error: step.outcome.error,
    };
  }
  if (settled.phase === 'baseline') {
    // Baseline succeeded but the URL changed during it.
    return {
      ...notMeasured,
      navigated: true,
      urlAfter,
      error: 'navigated-before-dispatch',
    };
  }
  return {
    type,
    eventsDispatched: MOTION_SIMULATION_EVENT_COUNT,
    domMutations: step.outcome.domMutations,
    baselineDomMutations: settled.baseline,
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
      } else if (details.listeners.length === 0) {
        details.simulation.status = 'skipped-no-listeners';
      } else if (windowTypes.size === 0) {
        details.simulation.status = 'skipped-document-only';
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
    buckets: normalizeMotionActuationCheck(details, url),
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
