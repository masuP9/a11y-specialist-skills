/**
 * Character Key Shortcut Check
 *
 * WCAG 2.1.4 (Character Key Shortcuts)
 *
 * Puts focus on <body>, presses printable ASCII characters one at a time, and
 * records which keys make the page react: a navigation, a new window, a
 * dialog, focus moving, a DOM change clearly larger than the page makes on its
 * own, scrolling, or `preventDefault()`. Whether the shortcut can be turned
 * off or remapped, or is active only while a component has focus, needs a
 * human, so reacting keys are `incomplete`.
 *
 * Key events from <body> reach only body, html, document and window. With CDP
 * (Chromium) the key listeners on those four are read first, and when there
 * are none no key is pressed (inapplicable).
 *
 * Like the change-on-input check, this one owns its `BrowserContext`: when a
 * key changes the page it continues with the remaining keys in a fresh context
 * (state kept in localStorage is gone). For that reason it accepts a `browser`
 * (not a `page`) and navigates internally. The contexts it creates are closed
 * before it returns.
 *
 * Limitations:
 * - Focus is on <body> only. A shortcut that works only while a component has
 *   focus is an exception of 2.1.4 and is not looked at. A listener on a
 *   wrapper element of the whole app (e.g. React's `<div onKeyDown>`) is not
 *   reached from <body> and is missed; React 17+ puts listeners for nearly
 *   every event on its root, so CDP cannot tell them apart either.
 * - Only the 94 printable ASCII characters except space are pressed (no
 *   space, IME input, or characters of other layouts).
 * - Listeners are read on window, document, <html> and <body> only (Chromium
 *   only); listeners added after the first load are not found. In Chromium,
 *   no listener on those four means no key is pressed.
 * - Reactions are navigation, new window, dialog, focus moving, DOM change,
 *   scrolling and preventDefault(). Pages that only draw on a canvas, only
 *   play a sound, or react later than `settleMs` are not caught.
 * - A page that keeps rewriting its own DOM (clock, carousel) can hide small
 *   changes made by a key.
 * - The preventDefault() record misses listeners added to `window` later than
 *   the check's own, and events stopped before they reach `window`.
 * - It reloads only after a visible reaction, so a key that changes only
 *   internal state (e.g. silently disables shortcuts) leaves the next keys
 *   pressed in that state and their reactions can be missed; the second key of
 *   a two-stroke shortcut (`g` then `i`) can be reported as a shortcut of its
 *   own (an extra candidate for a human). Pass a single key in `keys` to check
 *   a suspect one alone. Reloading per key is not done: it costs 0.6 s or more
 *   each and 94 keys exceed the time budget.
 * - Shortcuts that work only in some states are seen in the state right after
 *   loading. Two-stroke shortcuts (`g` then `i`) are not pressed.
 * - It really presses keys: pages whose shortcuts delete or submit may have
 *   side effects. Use `keys` to narrow what is pressed.
 * - A page script that never returns (infinite loop) cannot be interrupted.
 */

import { randomUUID } from 'node:crypto';
import type {
  BrowserContext,
  BrowserContextOptions,
  Page,
} from '@playwright/test';
import type {
  CharacterKeyListener,
  CharacterKeyReaction,
  CharacterKeyResult,
  CharacterKeyShortcutCheckDetails,
  CharacterKeyShortcutCheckResult,
} from '../types.js';
import {
  CHARACTER_KEY_BASELINE_WINDOWS,
  CHARACTER_KEY_EVENT_TYPES,
  CHARACTER_KEY_MUTATION_MARGIN,
  CHARACTER_KEY_SHIFTED_KEYS,
  CHARACTER_KEY_SHORTCUT_KEYS,
  CHARACTER_KEY_SHORTCUT_MAX_RELOADS,
  CHARACTER_KEY_SHORTCUT_SETTLE_MS,
  CHARACTER_KEY_SHORTCUT_TIMEOUT_MS,
  DEFAULT_CHARACTER_KEY_SHORTCUT_RESULT_FILE,
  DIALOG_MESSAGE_MAX,
} from '../constants.js';
import {
  buildAuditResult,
  normalizeCharacterKeyShortcutCheck,
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

export interface RunCharacterKeyShortcutCheckOptions
  extends AuditOutputOptions, ContextSourceOptions {
  /** Defaults to the TEST_PAGE environment variable. */
  targetUrl?: string;
  /** Options for the contexts created from `browser` (ignored with `createContext`). */
  contextOptions?: BrowserContextOptions;
  /** Wait after each key (default: CHARACTER_KEY_SHORTCUT_SETTLE_MS). */
  settleMs?: number;
  /** Wall-clock budget for the whole check (default: CHARACTER_KEY_SHORTCUT_TIMEOUT_MS). */
  timeBudgetMs?: number;
  /** Keys to press, each a single printable non-space character (default: CHARACTER_KEY_SHORTCUT_KEYS). */
  keys?: readonly string[];
  /** Reloads after a reacting key (default: CHARACTER_KEY_SHORTCUT_MAX_RELOADS). 0 stops at the first reacting key. */
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

const PRINTABLE_KEY = /^[\x21-\x7e]$/;

interface Reading {
  mutations: number;
  prevented: boolean | null;
  scrollX: number;
  scrollY: number;
  focusedSelector: string | null;
}

// =============================================================================
// Browser-side functions (serialized by Playwright; keep them self-contained)
// =============================================================================

interface ObserverState {
  mutations: number;
  prevented: boolean | null;
  observer: MutationObserver;
}

/** Count DOM changes and record whether a keydown ended up default-prevented. */
function installObserver(stateKey: string): void {
  const state: ObserverState = {
    mutations: 0,
    prevented: null,
    observer: new MutationObserver((records) => {
      state.mutations += records.length;
    }),
  };
  state.observer.observe(document.documentElement, {
    childList: true,
    attributes: true,
    characterData: true,
    subtree: true,
  });
  // Bubble phase on window: runs after the page's own listeners on the way.
  // keypress and keyup count too: a page may cancel the key at any of the three.
  for (const type of ['keydown', 'keypress', 'keyup']) {
    window.addEventListener(type, (event) => {
      state.prevented = (state.prevented ?? false) || event.defaultPrevented;
    });
  }
  (window as unknown as Record<string, unknown>)[stateKey] = state;
}

/** Zero the counters and return the scroll position. Returns null if the state is gone. */
function resetObserver(
  stateKey: string,
): { scrollX: number; scrollY: number } | null {
  const state = (
    window as unknown as Record<string, ObserverState | undefined>
  )[stateKey];
  if (!state) return null;
  // Drop records queued before this point so they are not counted for the key.
  state.observer.takeRecords();
  state.mutations = 0;
  state.prevented = null;
  return { scrollX: window.scrollX, scrollY: window.scrollY };
}

/**
 * Put focus on <body>; true when it is there afterwards. Waits a task and a
 * frame after blur() so a page that takes focus back is noticed.
 */
async function focusBody(): Promise<boolean> {
  const isBody = (element: Element | null): boolean =>
    !element ||
    element === document.body ||
    element === document.documentElement;
  if (!isBody(document.activeElement)) {
    (document.activeElement as HTMLElement).blur();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return isBody(document.activeElement);
}

/** What changed since `resetObserver`. Returns null when the page was replaced. */
function readReaction(stateKey: string): Reading | null {
  const state = (
    window as unknown as Record<string, ObserverState | undefined>
  )[stateKey];
  if (!state) return null;

  function getUniqueSelector(element: Element): string {
    const idSelector = `[id="${element.id.replace(/["\\]/g, '\\$&')}"]`;
    if (element.id && document.querySelectorAll(idSelector).length === 1) {
      return `#${CSS.escape(element.id)}`;
    }
    const path: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (parent) {
        selector += `:nth-child(${Array.from(parent.children).indexOf(current) + 1})`;
      }
      path.unshift(selector);
      current = parent;
    }
    return path.join(' > ');
  }

  const active = document.activeElement;
  const focusedSelector =
    active && active !== document.body && active !== document.documentElement
      ? getUniqueSelector(active)
      : null;
  return {
    mutations: state.mutations,
    prevented: state.prevented,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    focusedSelector,
  };
}

// =============================================================================
// Node-side helpers
// =============================================================================

const firstLine = (error: unknown): string =>
  ((error instanceof Error ? error.message : String(error)).split('\n')[0] ??
    '') as string;

/**
 * Run the character key shortcut check against the target URL, write the
 * result JSON, and return the parsed result.
 */
export async function runCharacterKeyShortcutCheck(
  options: RunCharacterKeyShortcutCheckOptions,
): Promise<CharacterKeyShortcutCheckResult> {
  const {
    browser,
    createContext,
    targetUrl: targetUrlOption,
    contextOptions,
    settleMs = CHARACTER_KEY_SHORTCUT_SETTLE_MS,
    timeBudgetMs = CHARACTER_KEY_SHORTCUT_TIMEOUT_MS,
    keys: keysOption = CHARACTER_KEY_SHORTCUT_KEYS,
    maxReloads = CHARACTER_KEY_SHORTCUT_MAX_RELOADS,
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
  if (!(Number.isInteger(maxReloads) && maxReloads >= 0)) {
    throw new Error(
      `\`maxReloads\` must be a non-negative integer (got ${String(maxReloads)}).`,
    );
  }
  if (
    !Array.isArray(keysOption) ||
    keysOption.length === 0 ||
    !keysOption.every(
      (key) => typeof key === 'string' && PRINTABLE_KEY.test(key),
    )
  ) {
    throw new Error(
      '`keys` must be a non-empty array of single printable ASCII characters other than space (names such as "Enter" and key combinations are not accepted).',
    );
  }
  const keys = [...new Set(keysOption)];

  const newContext = resolveCreateContext(
    { browser, createContext },
    contextOptions,
  );
  const targetUrl = requireTargetUrl(targetUrlOption);
  const out = createAuditOutput({
    ...location,
    defaultFile: DEFAULT_CHARACTER_KEY_SHORTCUT_RESULT_FILE,
  });

  const stateKey = `__a11yCharKey_${randomUUID()}`;
  const startedAt = Date.now();
  let startUrl = targetUrl;
  // Held outside so it is closed in `finally` even if a step throws.
  let context: BrowserContext | null = null;
  let page!: Page;

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

  /** Open a fresh context at the target URL, recording context changes. */
  const openPage = async (): Promise<void> => {
    await context?.close();
    context = null;
    context = await newContext();
    const opened = await context.newPage();
    page = opened;
    // Any main-frame navigation counts, including a reload to the same URL or
    // a `#`-only change.
    opened.on('framenavigated', (frame) => {
      if (frame === opened.mainFrame()) navigations.push(frame.url());
    });
    context.on('page', (popup) => {
      if (popup === opened) return;
      const record = { url: 'about:blank' };
      newWindows.push(record);
      pendingPopups.push(
        popup
          .waitForLoadState('domcontentloaded', { timeout: ACTION_TIMEOUT_MS })
          .then(() => {
            record.url = popup.url();
          })
          .catch(() => {})
          .then(() => popup.close())
          .catch(() => {}),
      );
    });
    opened.on('dialog', (dialog) => {
      dialogs.push({
        dialogType: dialog.type(),
        message: dialog.message().slice(0, DIALOG_MESSAGE_MAX),
      });
      dialog.dismiss().catch(() => {});
    });
    await gotoAndSettle(opened, targetUrl);
    opened.setDefaultTimeout(ACTION_TIMEOUT_MS);
    resetRecords();
  };

  try {
    await openPage();
    startUrl = page.url();

    // Read the key listeners before adding any of our own.
    const listeners: CharacterKeyListener[] = [];
    const inspector = await openEventListenerInspector(page);
    if (inspector) {
      try {
        const targets = [
          ['window', 'window'],
          ['document', 'document'],
          ['html', 'document.documentElement'],
          ['body', 'document.body'],
        ] as const;
        for (const [target, expression] of targets) {
          // Only a document without <body> is skipped; any other failure surfaces.
          if (
            target === 'body' &&
            (await page.evaluate(() => document.body === null))
          ) {
            continue;
          }
          const records = await inspector.forExpression(
            expression,
            CHARACTER_KEY_EVENT_TYPES,
          );
          for (const record of records) {
            listeners.push({
              ...record,
              target,
              type: record.type as CharacterKeyListener['type'],
            });
          }
        }
      } finally {
        await inspector.close();
      }
    }

    const details: CharacterKeyShortcutCheckDetails = {
      listenerInspection: inspector ? 'cdp' : 'unsupported',
      listeners,
      keyProbe:
        inspector && listeners.length === 0 ? 'skipped-no-listeners' : 'ran',
      keysTried: [],
      reacted: [],
      untested: [],
      baselineDomMutations: null,
      reloads: 0,
      aborted: null,
    };

    if (details.keyProbe === 'ran') {
      await runKeys(details);
    }

    const result = buildAuditResult({
      source: 'character-key-shortcut-check',
      url: startUrl,
      details,
      buckets: normalizeCharacterKeyShortcutCheck(details),
    });
    out.save(result);
    out.header('Character Key Shortcut Check', 'WCAG 2.1.4', startUrl);
    out.summary({
      'Listener inspection': details.listenerInspection,
      'Key listeners': details.listeners.length,
      'Keys tried': details.keysTried.length,
      'Keys with reactions': details.reacted.length,
      Reloads: details.reloads,
    });
    out.outputPaths();
    return result;
  } finally {
    // `openPage` assigns it from a closure, which the compiler does not see.
    await (context as BrowserContext | null)?.close();
  }

  /** Baseline, then press each key in turn, reloading after a reaction. */
  async function runKeys(
    details: CharacterKeyShortcutCheckDetails,
  ): Promise<void> {
    const abort = (
      reason: NonNullable<
        CharacterKeyShortcutCheckDetails['aborted']
      >['reason'],
      remaining: readonly string[],
    ): void => {
      details.aborted = { reason, url: startUrl };
      for (const key of remaining) details.untested.push({ key, reason });
      out.warn(
        `\n⚠️  Stopped (${reason}): ${remaining.length} key(s) were not tried.`,
      );
    };

    /**
     * Continue in a fresh context. Stops the check (untested: `remaining`)
     * when the time budget or the reload limit is used up, or the page cannot
     * be opened; false then.
     */
    const tryReload = async (
      remaining: readonly string[],
    ): Promise<boolean> => {
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
        await page.evaluate(installObserver, stateKey);
        return true;
      } catch {
        abort('reload-failed', remaining);
        return false;
      }
    };

    // What the page does by itself, over several windows of the same length as
    // the wait after a key; the largest count is the baseline. Each wait is cut
    // to the time left; once the budget is used up no key is pressed. A page
    // that replaces itself during the measurement (redirect, reload) throws the
    // attempt away: it is reopened in a fresh context and measured again, up to
    // the reload limit.
    await page.evaluate(installObserver, stateKey);
    let baselineMutations: number | null = null;
    for (;;) {
      baselineMutations = null;
      const urlAtStart = page.url();
      let replaced = false;
      try {
        for (let w = 0; w < CHARACTER_KEY_BASELINE_WINDOWS; w += 1) {
          const remaining = timeBudgetMs - (Date.now() - startedAt);
          if (remaining <= 0) break;
          const zeroed = await page.evaluate(resetObserver, stateKey);
          await page.waitForTimeout(Math.min(settleMs, remaining));
          const observed = await page.evaluate(readReaction, stateKey);
          if (zeroed === null || observed === null) {
            replaced = true;
            break;
          }
          baselineMutations = Math.max(
            baselineMutations ?? 0,
            observed.mutations,
          );
        }
      } catch (error) {
        if (!NAVIGATION_ERROR.test(firstLine(error))) throw error;
        replaced = true;
      }
      if (!replaced && page.url() === urlAtStart) break;
      details.baselineDomMutations = null;
      if (!(await tryReload(keys))) return;
    }
    details.baselineDomMutations = baselineMutations;
    if (Date.now() - startedAt >= timeBudgetMs) {
      abort('timeout', keys);
      return;
    }
    const baselineCount = baselineMutations ?? 0;

    /**
     * A page replaced under us may not have reported its new URL yet: wait
     * briefly for it (a reload to the same URL never changes it).
     */
    const waitForNewUrl = async (before: string): Promise<void> => {
      if (navigations.length > 0 || page.url() !== before) return;
      await page
        .waitForURL((url) => url.href !== before, { timeout: 1_000 })
        .catch(() => {});
    };

    // The key pressed last whose page is still the one open, and the URL it was
    // pressed on: a navigation that lands after its settle wait is found when
    // the next key is prepared and belongs to that key.
    let lastPressed: { key: string; url: string } | null = null;

    // Shift is held while a key that needs it is prepared, pressed and read, so
    // its own keydown / keyup fall outside the observed window (resetObserver
    // drops what the keydown caused; what the keyup causes is dropped by the
    // next key's resetObserver). It is released on every path; a page that was
    // replaced meanwhile may refuse, which does not matter.
    let shiftHeld = false;
    const releaseShift = async (): Promise<void> => {
      if (!shiftHeld) return;
      shiftHeld = false;
      await page.keyboard.up('Shift').catch(() => {});
    };

    try {
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i] as string;
        if (Date.now() - startedAt > timeBudgetMs) {
          abort('timeout', keys.slice(i));
          return;
        }

        let scrollBefore: { scrollX: number; scrollY: number } | null = null;
        let onBody = false;
        let replaced = false;
        try {
          if (CHARACTER_KEY_SHIFTED_KEYS.has(key)) {
            await page.keyboard.down('Shift');
            shiftHeld = true;
          }
          onBody = await page.evaluate(focusBody);
          scrollBefore = await page.evaluate(resetObserver, stateKey);
        } catch (error) {
          if (!NAVIGATION_ERROR.test(firstLine(error))) throw error;
          replaced = true;
        }
        // Replaced under us, state gone (same-URL reload), or moved to another URL.
        if (
          replaced ||
          scrollBefore === null ||
          (lastPressed !== null && page.url() !== lastPressed.url)
        ) {
          await releaseShift();
          if (lastPressed !== null) {
            await waitForNewUrl(lastPressed.url);
            const navigation: CharacterKeyReaction = {
              kind: 'navigation',
              toUrl: navigations.at(-1) ?? page.url(),
            };
            const earlier = details.reacted.find(
              (r) => r.key === lastPressed?.key,
            );
            if (earlier) earlier.reactions.push(navigation);
            else {
              details.reacted.push({
                key: lastPressed.key,
                reactions: [navigation],
              });
            }
          }
          lastPressed = null;
          if (!(await tryReload(keys.slice(i)))) return;
          i -= 1;
          continue;
        }
        if (!onBody) {
          await releaseShift();
          details.untested.push({ key, reason: 'focus-not-on-body' });
          continue;
        }

        resetRecords();
        const urlBefore = page.url();
        details.keysTried.push(key);
        lastPressed = { key, url: urlBefore };

        let navigated = false;
        try {
          await page.keyboard.press(key);
          await page.waitForTimeout(settleMs);
        } catch (error) {
          if (!NAVIGATION_ERROR.test(firstLine(error))) throw error;
          navigated = true;
        }
        await Promise.all(pendingPopups);

        // A same-document update (history.replaceState, a hash change that keeps
        // the URL) is not a navigation: only another URL or a replaced page is.
        navigated ||= page.url() !== urlBefore;
        let reading: Reading | null = null;
        if (!navigated) {
          try {
            reading = await page.evaluate(readReaction, stateKey);
          } catch (error) {
            if (!NAVIGATION_ERROR.test(firstLine(error))) throw error;
          }
          // Gone state: replaced right after the check above, or reloaded to the same URL.
          if (reading === null) navigated = true;
        }

        const reactions: CharacterKeyReaction[] = [];
        if (navigated) {
          await waitForNewUrl(urlBefore);
          reactions.push({
            kind: 'navigation',
            toUrl: navigations.at(-1) ?? page.url(),
          });
        }
        for (const popup of newWindows) {
          reactions.push({ kind: 'new-window', url: popup.url });
        }
        for (const dialog of dialogs) {
          reactions.push({ kind: 'dialog', ...dialog });
        }
        if (reading) {
          if (reading.focusedSelector !== null) {
            reactions.push({
              kind: 'focus-moved',
              toSelector: reading.focusedSelector,
            });
          }
          if (
            reading.mutations > 0 &&
            (baselineCount === 0 ||
              reading.mutations >=
                2 * baselineCount + CHARACTER_KEY_MUTATION_MARGIN)
          ) {
            reactions.push({
              kind: 'dom-change',
              mutations: reading.mutations,
            });
          }
          const dx = reading.scrollX - scrollBefore.scrollX;
          const dy = reading.scrollY - scrollBefore.scrollY;
          if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) {
            reactions.push({ kind: 'scroll', dx, dy });
          }
          if (reactions.length === 0 && reading.prevented === true) {
            reactions.push({ kind: 'default-prevented' });
          }
        }
        // Release Shift only now that everything this key caused is settled: what
        // its keyup causes lands after this point and is dropped by the next
        // key's resetRecords / resetObserver.
        await releaseShift();
        if (reactions.length === 0) continue;

        const entry: CharacterKeyResult = { key, reactions };
        details.reacted.push(entry);

        // Reload only when keys remain and the page may have changed: a bare
        // preventDefault() leaves the page as it was.
        const rest = keys.slice(i + 1);
        if (
          rest.length === 0 ||
          reactions.every((reaction) => reaction.kind === 'default-prevented')
        ) {
          continue;
        }
        lastPressed = null;
        if (!(await tryReload(rest))) return;
      }
    } finally {
      await releaseShift();
    }
  }
}
