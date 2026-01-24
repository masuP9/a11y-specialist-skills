/**
 * Time Limit Detector
 *
 * WCAG 2.2.1 (Timing Adjustable)
 *
 * This script:
 * 1. Hooks setTimeout/setInterval to capture timer registrations
 * 2. Checks for meta refresh tags
 * 3. Scans visible text for countdown/timeout keywords
 * 4. Reports potential time limits that may affect users
 *
 * WCAG 2.2.1 requires that time limits can be turned off, adjusted, or extended.
 *
 * Limitations:
 * - Cannot confirm if users can extend/disable time limits
 * - Many timers may be benign (analytics, UI animations) and need manual triage
 * - Server-side timeouts cannot be detected
 */

import { test } from '@playwright/test';
import type {
  MetaRefreshInfo,
  TimerInfo,
  CountdownIndicator,
} from './types';
import {
  TIME_LIMIT_KEYWORDS,
  TIME_LIMIT_THRESHOLD_MS,
  TIME_LIMIT_MIN_MS,
} from './constants';
import {
  getTargetUrl,
  logAuditHeader,
  logSummary,
  logIssueList,
  saveAuditResult,
  logOutputPaths,
} from './utils/test-harness';

interface TimerHookArgs {
  minMs: number;
  maxMs: number;
}

interface TimeLimitIndicatorsArgs {
  keywords: readonly string[];
}

interface TimeLimitIndicatorsResult {
  metaRefresh: MetaRefreshInfo[];
  countdownIndicators: CountdownIndicator[];
}

/**
 * Create timer hook script to inject before page load
 */
function createTimerHookScript(args: TimerHookArgs): void {
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
        callStack = (e as Error).stack?.split('\n').slice(2, 5).join('\n') || null;
      }
      capturedTimers.push({
        type: 'setTimeout',
        delayMs: actualDelay,
        callStack,
      });
    }

    return originalSetTimeout.call(window, callback as () => void, delay, ...rest) as unknown as number;
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
        callStack = (e as Error).stack?.split('\n').slice(2, 5).join('\n') || null;
      }
      capturedTimers.push({
        type: 'setInterval',
        delayMs: actualDelay,
        callStack,
      });
    }

    return originalSetInterval.call(window, callback as () => void, delay, ...rest) as unknown as number;
  };

  (window as unknown as Record<string, unknown>).__capturedTimers = capturedTimers;
}

/**
 * Detect meta refresh and countdown indicators in browser context
 */
function detectTimeLimitIndicators(args: TimeLimitIndicatorsArgs): TimeLimitIndicatorsResult {
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

  // Check for meta refresh
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
          seconds: parseInt(match[1], 10),
          url: match[2]?.trim() || null,
        });
      }
    }
  });

  // Search for countdown indicators in visible text
  const countdownIndicators: CountdownIndicator[] = [];
  const visibleText = document.body.innerText || '';
  const lowerText = visibleText.toLowerCase();

  for (const keyword of keywords) {
    if (!lowerText.includes(keyword.toLowerCase())) {
      continue;
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
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

test('time limit detector (WCAG 2.2.1)', async ({ page }) => {
  await page.addInitScript(createTimerHookScript, {
    minMs: TIME_LIMIT_MIN_MS,
    maxMs: TIME_LIMIT_THRESHOLD_MS,
  });

  const targetUrl = getTargetUrl('?criteria=2.2.1');
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const timers: TimerInfo[] = await page.evaluate(() => {
    return (window as unknown as Record<string, TimerInfo[]>).__capturedTimers || [];
  });

  const indicators = await page.evaluate(detectTimeLimitIndicators, {
    keywords: [...TIME_LIMIT_KEYWORDS],
  });

  const hasTimeLimits =
    indicators.metaRefresh.length > 0 ||
    timers.length > 0 ||
    indicators.countdownIndicators.length > 0;

  const result = {
    url: page.url(),
    metaRefresh: indicators.metaRefresh,
    timers,
    countdownIndicators: indicators.countdownIndicators,
    hasTimeLimits,
  };

  const outputPath = 'time-limit-result.json';

  // Output results
  logAuditHeader('Time Limit Detection Results', 'WCAG 2.2.1', result.url);

  logSummary({
    'Meta refresh tags': result.metaRefresh.length,
    [`Timers detected (${TIME_LIMIT_MIN_MS / 1000}s - ${TIME_LIMIT_THRESHOLD_MS / 1000}s)`]: result.timers.length,
    'Countdown text indicators': result.countdownIndicators.length,
    'Time limits detected': result.hasTimeLimits,
  });

  logIssueList<MetaRefreshInfo>(
    'Meta Refresh',
    result.metaRefresh,
    (meta, i) => {
      const lines = [
        `${i + 1}. content="${meta.content}"`,
        `   Refresh in ${meta.seconds} seconds`,
      ];
      if (meta.url) {
        lines.push(`   Redirects to: ${meta.url}`);
      }
      return lines;
    }
  );

  logIssueList<TimerInfo>(
    'Detected Timers',
    result.timers,
    (timer, i) => {
      const lines = [
        `${i + 1}. ${timer.type} - ${timer.delayMs}ms (${(timer.delayMs / 1000).toFixed(1)}s)`,
      ];
      if (timer.callStack) {
        lines.push(`   Stack: ${timer.callStack.split('\n')[0]}`);
      }
      return lines;
    }
  );

  logIssueList<CountdownIndicator>(
    'Countdown Indicators',
    result.countdownIndicators,
    (indicator, i) => {
      const truncatedText =
        indicator.text.length > 80 ? indicator.text.slice(0, 80) + '...' : indicator.text;
      return [
        `${i + 1}. <${indicator.tagName}> "${indicator.selector}"`,
        `   Text: "${truncatedText}"`,
      ];
    },
    5
  );

  saveAuditResult(result, { outputPath });
  logOutputPaths(outputPath);
});
