/**
 * Time Limit Detector — WCAG 2.2.1 (Timing Adjustable)
 *
 * Hooks setTimeout/setInterval (via an init script injected BEFORE navigation),
 * checks meta refresh tags, and scans visible text for countdown/timeout
 * keywords.
 *
 * Because the timer hook must be installed before page scripts run, this
 * function OWNS navigation: pass an un-navigated `page` and a `targetUrl`
 * (option → `TEST_PAGE` env → required). Unlike the focus check it does not
 * need a fresh context per attempt, so it stays page-based.
 */

import type { Page } from '@playwright/test';
import type {
  TimeLimitDetectorResult,
  MetaRefreshInfo,
  TimerInfo,
  CountdownIndicator,
} from '../types.js';
import {
  TIME_LIMIT_KEYWORDS,
  TIME_LIMIT_THRESHOLD_MS,
  TIME_LIMIT_MIN_MS,
  DEFAULT_TIME_LIMIT_RESULT_FILE,
} from '../constants.js';
import {
  saveAuditResult,
  requireTargetUrl,
  logAuditHeader,
  logSummary,
  logIssueList,
  logOutputPaths,
  type OutputLocationOptions,
} from '../utils/test-harness.js';

/** Timer hook injected before page load (browser context). */
function createTimerHookScript(args: { minMs: number; maxMs: number }): void {
  const { minMs, maxMs } = args;
  const capturedTimers: TimerInfo[] = [];

  const originalSetTimeout = window.setTimeout;
  const originalSetInterval = window.setInterval;

  (window as unknown as Record<string, unknown>).setTimeout = function (
    callback: TimerHandler,
    delay?: number,
    ...rest: unknown[]
  ): number {
    const actualDelay = delay || 0;

    if (actualDelay >= minMs && actualDelay <= maxMs) {
      let callStack: string | null = null;
      try {
        throw new Error();
      } catch (e) {
        callStack =
          (e as Error).stack?.split('\n').slice(2, 5).join('\n') || null;
      }
      capturedTimers.push({ type: 'setTimeout', delayMs: actualDelay, callStack });
    }

    return (originalSetTimeout as (...args: unknown[]) => unknown).apply(window, [
      callback,
      delay,
      ...rest,
    ]) as unknown as number;
  };

  (window as unknown as Record<string, unknown>).setInterval = function (
    callback: TimerHandler,
    delay?: number,
    ...rest: unknown[]
  ): number {
    const actualDelay = delay || 0;

    if (actualDelay >= minMs && actualDelay <= maxMs) {
      let callStack: string | null = null;
      try {
        throw new Error();
      } catch (e) {
        callStack =
          (e as Error).stack?.split('\n').slice(2, 5).join('\n') || null;
      }
      capturedTimers.push({ type: 'setInterval', delayMs: actualDelay, callStack });
    }

    return (originalSetInterval as (...args: unknown[]) => unknown).apply(window, [
      callback,
      delay,
      ...rest,
    ]) as unknown as number;
  };

  (window as unknown as Record<string, unknown>).__capturedTimers = capturedTimers;
}

interface TimeLimitIndicatorsResult {
  metaRefresh: MetaRefreshInfo[];
  countdownIndicators: CountdownIndicator[];
}

/** Detect meta refresh + countdown indicators (browser context). */
function detectTimeLimitIndicators(args: {
  keywords: readonly string[];
}): TimeLimitIndicatorsResult {
  const { keywords } = args;

  function getUniqueSelector(element: Element, elementIndex: number): string {
    if (element.id) {
      return `#${element.id}`;
    }
    const path: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (parent) {
        const childIndex = Array.from(parent.children).indexOf(current) + 1;
        selector += `:nth-child(${childIndex})`;
      }
      path.unshift(selector);
      current = parent;
    }
    return path.length > 0 ? path.join(' > ') : `[data-index="${elementIndex}"]`;
  }

  const metaRefresh: MetaRefreshInfo[] = [];
  const metaTags = document.querySelectorAll('meta[http-equiv="refresh"]');

  metaTags.forEach((meta) => {
    const content = meta.getAttribute('content');
    if (content) {
      const trimmed = content.trim();
      const match = trimmed.match(/^(\d+)\s*(?:;\s*url\s*=\s*(.+))?$/i);
      if (match) {
        metaRefresh.push({
          content,
          seconds: parseInt(match[1] ?? '0', 10),
          url: match[2]?.trim() || null,
        });
      }
    }
  });

  const countdownIndicators: CountdownIndicator[] = [];
  const visibleText = document.body.innerText || '';
  const lowerText = visibleText.toLowerCase();

  for (const keyword of keywords) {
    if (!lowerText.includes(keyword.toLowerCase())) {
      continue;
    }

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );
    let node: Text | null;
    let elementIndex = 0;

    while ((node = walker.nextNode() as Text | null)) {
      if (node.textContent?.toLowerCase().includes(keyword.toLowerCase())) {
        const parent = node.parentElement;
        if (parent) {
          const fullText = parent.textContent?.trim().slice(0, 150) || '';
          const alreadyAdded = countdownIndicators.some((c) => c.text === fullText);
          if (!alreadyAdded && fullText.length > 0) {
            countdownIndicators.push({
              selector: getUniqueSelector(parent, elementIndex),
              text: fullText,
              tagName: parent.tagName.toLowerCase(),
            });
          }
        }
      }
      elementIndex++;
    }
  }

  return { metaRefresh, countdownIndicators };
}

export interface RunTimeLimitDetectorOptions extends OutputLocationOptions {
  /** An un-navigated page (this function navigates after installing the timer hook). */
  page: Page;
  /** Target URL. Falls back to the `TEST_PAGE` env var; required. */
  targetUrl?: string;
  /** Minimum timer delay to capture, ms (default: 10000). */
  minMs?: number;
  /** Maximum timer delay to capture, ms (default: 600000). */
  maxMs?: number;
  /** How long to wait after load for timers to register, ms (default: 2000). */
  settleMs?: number;
}

/**
 * Run the time limit detector, write the result JSON, and return the result.
 */
export async function runTimeLimitDetector(
  options: RunTimeLimitDetectorOptions
): Promise<TimeLimitDetectorResult> {
  const {
    page,
    targetUrl: targetUrlOption,
    minMs = TIME_LIMIT_MIN_MS,
    maxMs = TIME_LIMIT_THRESHOLD_MS,
    settleMs = 2000,
    ...location
  } = options;

  const targetUrl = requireTargetUrl(targetUrlOption);

  await page.addInitScript(createTimerHookScript, { minMs, maxMs });

  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(settleMs);

  const timers: TimerInfo[] = await page.evaluate(() => {
    return (
      (window as unknown as Record<string, TimerInfo[]>).__capturedTimers || []
    );
  });

  const indicators = await page.evaluate(detectTimeLimitIndicators, {
    keywords: [...TIME_LIMIT_KEYWORDS],
  });

  const hasTimeLimits =
    indicators.metaRefresh.length > 0 ||
    timers.length > 0 ||
    indicators.countdownIndicators.length > 0;

  const result: TimeLimitDetectorResult = {
    url: page.url(),
    metaRefresh: indicators.metaRefresh,
    timers,
    countdownIndicators: indicators.countdownIndicators,
    hasTimeLimits,
  };

  logAuditHeader('Time Limit Detection Results', 'WCAG 2.2.1', result.url);

  logSummary({
    'Meta refresh tags': result.metaRefresh.length,
    [`Timers detected (${minMs / 1000}s - ${maxMs / 1000}s)`]: result.timers.length,
    'Countdown text indicators': result.countdownIndicators.length,
    'Time limits detected': result.hasTimeLimits,
  });

  logIssueList<MetaRefreshInfo>('Meta Refresh', result.metaRefresh, (meta, i) => {
    const lines = [
      `${i + 1}. content="${meta.content}"`,
      `   Refresh in ${meta.seconds} seconds`,
    ];
    if (meta.url) {
      lines.push(`   Redirects to: ${meta.url}`);
    }
    return lines;
  });

  logIssueList<TimerInfo>('Detected Timers', result.timers, (timer, i) => {
    const lines = [
      `${i + 1}. ${timer.type} - ${timer.delayMs}ms (${(timer.delayMs / 1000).toFixed(1)}s)`,
    ];
    if (timer.callStack) {
      lines.push(`   Stack: ${timer.callStack.split('\n')[0]}`);
    }
    return lines;
  });

  logIssueList<CountdownIndicator>(
    'Countdown Indicators',
    result.countdownIndicators,
    (indicator, i) => {
      const truncatedText =
        indicator.text.length > 80
          ? indicator.text.slice(0, 80) + '...'
          : indicator.text;
      return [
        `${i + 1}. <${indicator.tagName}> "${indicator.selector}"`,
        `   Text: "${truncatedText}"`,
      ];
    },
    5
  );

  const resolvedPath = saveAuditResult(result, {
    ...location,
    defaultFile: DEFAULT_TIME_LIMIT_RESULT_FILE,
  });
  logOutputPaths(resolvedPath);

  return result;
}
