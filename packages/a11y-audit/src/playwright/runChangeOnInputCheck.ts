/**
 * Change on Input Check
 *
 * WCAG 3.2.2 (On Input)
 *
 * Changes the value of each form control, one at a time, and records whether
 * that alone caused a change of context: a main-frame navigation, a new
 * window, focus moving to another element, or a dialog. Advising users
 * beforehand makes such behavior conform, so findings are `incomplete`.
 *
 * Like the focus-indicator check, this one owns its `BrowserContext`: when a
 * change navigates the page it restarts in a fresh context and skips the
 * controls it already tried. For that reason it accepts a `browser` (not a
 * `page`) and navigates internally. The contexts it creates are closed before
 * it returns.
 *
 * What it does to the page: select -> another option, radio -> the first
 * unchecked radio of the group, checkbox -> toggled, text-like -> a fixed
 * value followed by blur (which fires `change`). Values are put back through
 * properties, without events.
 *
 * Limitations:
 * - Only controls in the main frame's light DOM (no iframes, shadow roots,
 *   contenteditable, or ARIA-only widgets such as role="combobox").
 * - One value per control (a different option, or a fixed text); changes that
 *   only happen for specific values are missed.
 * - Restoring values does not undo what handlers did to the page, so an
 *   earlier control can influence the result of a later one.
 * - A change that surfaces after `settleMs` (e.g. navigation after a network
 *   round trip) is missed. It may instead surface during the next control's
 *   focus wait and make that control skipped as `context-change-on-focus`.
 * - Large content changes (swapping a panel) are not recorded.
 * - Each control costs two waits: `settleMs` after changing its value, and the
 *   larger of `settleMs` and `CHANGE_ON_INPUT_FOCUS_SETTLE_MS` after focusing it.
 * - Controls of type date / time / range / color / file etc. are not collected.
 * - On a page whose ids change on every load, a restart finds the controls
 *   under new selectors and tries the same control again, so the same finding
 *   can repeat (restarts are capped at CHANGE_ON_INPUT_MAX_RESTARTS).
 * - It really changes values and fires `change`: pages that autosave or
 *   submit on change may send requests.
 */

import type {
  BrowserContext,
  BrowserContextOptions,
  Locator,
  Page,
} from '@playwright/test';
import type {
  ChangeOnInputCheckDetails,
  ChangeOnInputCheckResult,
  ChangeOnInputControl,
  ChangeOnInputControlKind,
  ChangeOnInputFinding,
  InputContextChange,
} from '../types.js';
import {
  CHANGE_ON_INPUT_FOCUS_SETTLE_MS,
  CHANGE_ON_INPUT_MAX_CONTROLS,
  CHANGE_ON_INPUT_MAX_RESTARTS,
  CHANGE_ON_INPUT_SETTLE_MS,
  CHANGE_ON_INPUT_TEXT_VALUES,
  CHANGE_ON_INPUT_TIMEOUT_MS,
  DEFAULT_CHANGE_ON_INPUT_RESULT_FILE,
  DIALOG_MESSAGE_MAX,
  HTML_SNIPPET_MAX_LENGTH,
} from '../constants.js';
import {
  buildAuditResult,
  normalizeChangeOnInputCheck,
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

export interface RunChangeOnInputCheckOptions
  extends AuditOutputOptions, ContextSourceOptions {
  /** Defaults to the TEST_PAGE environment variable. */
  targetUrl?: string;
  /** Options for the contexts created from `browser` (ignored with `createContext`). */
  contextOptions?: BrowserContextOptions;
  /**
   * Wait after each value change for a context change to surface (default: CHANGE_ON_INPUT_SETTLE_MS).
   * The wait after focusing a control is never shorter than CHANGE_ON_INPUT_FOCUS_SETTLE_MS.
   */
  settleMs?: number;
  /** Wall-clock budget for the whole check (default: CHANGE_ON_INPUT_TIMEOUT_MS). */
  timeBudgetMs?: number;
  /** Controls to try before stopping (default: CHANGE_ON_INPUT_MAX_CONTROLS). */
  maxControls?: number;
}

/** Timeout for a single Playwright action on a control, so a stuck one cannot eat the whole budget. */
const ACTION_TIMEOUT_MS = 5_000;

/**
 * Errors Playwright throws when the page is replaced under an action. Matched
 * against the first line only: later lines are a call log that mentions
 * "navigations" even for a plain timeout.
 */
const NAVIGATION_ERROR =
  /Execution context was destroyed|Frame was detached|Target page, context or browser has been closed/i;

/** What the browser reports about one control (see `collectControls`). */
interface CollectedControl extends ChangeOnInputControl {
  /** CSS locating the element to act on (for radio: the unchecked one). */
  locator: string;
  /** Why the control cannot be changed; such controls are listed in `skipped` (intentional exclusion). */
  skipReason: string | null;
  currentValue: string;
  /** `maxlength`, or -1. */
  maxLength: number;
  /** select: index of the option to choose. */
  altIndex: number;
  altText: string;
}

type ControlState = unknown;

interface ProbeResult {
  state: ControlState;
  /** Selector of the element that holds focus, when it is not the control. */
  movedTo: string | null;
}

// =============================================================================
// Browser-side functions (serialized by Playwright; keep them self-contained)
// =============================================================================

/** Find the controls to change, in page order. Runs in the browser. */
function collectControls(args: { snippetMax: number }): CollectedControl[] {
  const clip = (text: string | null | undefined): string =>
    (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);

  // Keep in sync with the function of the same name in probeControl.
  function getUniqueSelector(element: Element): string {
    // An id that several elements share does not identify any of them.
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

  function getLocator(element: Element): string {
    const idSelector = `[id="${element.id.replace(/["\\]/g, '\\$&')}"]`;
    if (element.id && document.querySelectorAll(idSelector).length === 1) {
      return idSelector;
    }
    return `body > ${getUniqueSelector(element)}`;
  }

  const isVisible = (element: Element): boolean => {
    // `visibilityProperty` also rejects `visibility: hidden` / `collapse`.
    if (!element.checkVisibility({ visibilityProperty: true })) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const isEnabled = (element: Element): boolean =>
    !element.matches(':disabled');

  const labelOf = (element: Element): string | null => {
    const labels = (element as HTMLInputElement).labels;
    const fromLabel =
      labels && labels.length > 0 ? clip(labels[0]?.textContent) : '';
    return fromLabel || clip(element.getAttribute('aria-label')) || null;
  };

  const TEXT_TYPES = [
    'text',
    'search',
    'email',
    'tel',
    'url',
    'number',
    'password',
  ];

  const found: CollectedControl[] = [];
  const seenRadios = new Set<Element>();

  const describe = (
    representative: Element,
    target: Element,
    controlKind: ChangeOnInputControlKind,
    type: string,
    rest: Partial<CollectedControl> = {},
  ): CollectedControl => {
    const html = representative.outerHTML;
    return {
      selector: getUniqueSelector(representative),
      locator: getLocator(target),
      controlKind,
      type,
      name: representative.getAttribute('name') || null,
      label: labelOf(representative),
      html: html.slice(0, args.snippetMax),
      htmlTruncated: html.length > args.snippetMax,
      skipReason: null,
      currentValue: '',
      maxLength: -1,
      altIndex: -1,
      altText: '',
      ...rest,
    };
  };

  for (const element of Array.from(
    document.querySelectorAll('select, input, textarea'),
  )) {
    if (element instanceof HTMLSelectElement) {
      if (!isEnabled(element) || !isVisible(element)) continue;
      const altIndex = Array.from(element.options).findIndex(
        (option, index) =>
          index !== element.selectedIndex &&
          !option.disabled &&
          !(
            option.parentElement instanceof HTMLOptGroupElement &&
            option.parentElement.disabled
          ),
      );
      found.push(
        describe(element, element, 'select', 'select', {
          skipReason: altIndex < 0 ? 'no-alternative-option' : null,
          altIndex,
          altText: clip(element.options[altIndex]?.text),
        }),
      );
    } else if (element instanceof HTMLTextAreaElement) {
      if (!isEnabled(element) || element.readOnly || !isVisible(element)) {
        continue;
      }
      found.push(
        describe(element, element, 'text', 'textarea', {
          currentValue: element.value,
          maxLength: element.maxLength,
        }),
      );
    } else if (element instanceof HTMLInputElement) {
      if (element.type === 'checkbox') {
        if (!isEnabled(element) || !isVisible(element)) continue;
        found.push(describe(element, element, 'checkbox', 'checkbox'));
      } else if (element.type === 'radio') {
        if (seenRadios.has(element)) continue;
        const group = element.name
          ? Array.from(
              document.querySelectorAll<HTMLInputElement>('input[type=radio]'),
            ).filter(
              (radio) =>
                radio.name === element.name && radio.form === element.form,
            )
          : [element];
        group.forEach((radio) => seenRadios.add(radio));
        const usable = group.filter(
          (radio) => isEnabled(radio) && isVisible(radio),
        );
        const representative = usable[0];
        if (!representative) continue;
        const target = usable.find((radio) => !radio.checked);
        found.push(
          describe(representative, target ?? representative, 'radio', 'radio', {
            skipReason: target ? null : 'no-unchecked-option',
          }),
        );
      } else if (TEXT_TYPES.includes(element.type)) {
        if (!isEnabled(element) || element.readOnly || !isVisible(element)) {
          continue;
        }
        found.push(
          describe(element, element, 'text', element.type, {
            currentValue: element.value,
            maxLength: element.maxLength,
          }),
        );
      }
    }
  }
  return found;
}

/**
 * Read, blur or silently restore one control. Runs in the browser on the
 * control (for radio: the one to check; the group is derived from it).
 */
function probeControl(
  element: Element,
  arg: {
    kind: ChangeOnInputControlKind;
    op: 'read' | 'blur' | 'restore';
    snapshot?: ControlState;
  },
): ProbeResult {
  const { kind, op, snapshot } = arg;
  const input = element as HTMLInputElement;

  const radioGroup = (): HTMLInputElement[] =>
    input.name
      ? Array.from(
          document.querySelectorAll<HTMLInputElement>('input[type=radio]'),
        ).filter(
          (radio) => radio.name === input.name && radio.form === input.form,
        )
      : [input];

  // Keep identical to the function of the same name in collectControls.
  function getUniqueSelector(target: Element): string {
    const idSelector = `[id="${target.id.replace(/["\\]/g, '\\$&')}"]`;
    if (target.id && document.querySelectorAll(idSelector).length === 1) {
      return `#${CSS.escape(target.id)}`;
    }
    const path: string[] = [];
    let current: Element | null = target;
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

  const readState = (): ControlState => {
    switch (kind) {
      case 'select':
        return Array.from((element as HTMLSelectElement).options).map(
          (option) => option.selected,
        );
      case 'checkbox':
        return input.checked;
      case 'radio':
        return radioGroup().findIndex((radio) => radio.checked);
      case 'text':
        return input.value;
    }
  };

  const focusOutside = (active: Element | null): string | null => {
    if (!active || active === document.body) return null;
    if (active === element) return null;
    if (kind === 'radio' && radioGroup().includes(active as HTMLInputElement)) {
      return null;
    }
    return getUniqueSelector(active);
  };

  if (op === 'restore') {
    switch (kind) {
      case 'select':
        Array.from((element as HTMLSelectElement).options).forEach(
          (option, index) => {
            option.selected = (snapshot as boolean[])[index] ?? false;
          },
        );
        break;
      case 'checkbox':
        input.checked = snapshot as boolean;
        break;
      case 'radio':
        radioGroup().forEach((radio, index) => {
          radio.checked = index === snapshot;
        });
        break;
      case 'text':
        input.value = snapshot as string;
        break;
    }
    return { state: readState(), movedTo: null };
  }

  if (op === 'blur') {
    // blur() fires `change` and then moves focus to <body> without a
    // `focusin`, so any `focusin` seen here came from a change handler.
    let landedOn: Element | null = null;
    const onFocusIn = (event: Event): void => {
      landedOn = event.target as Element;
    };
    document.addEventListener('focusin', onFocusIn, true);
    (element as HTMLElement).blur();
    document.removeEventListener('focusin', onFocusIn, true);
    return { state: readState(), movedTo: focusOutside(landedOn) };
  }

  return { state: readState(), movedTo: focusOutside(document.activeElement) };
}

/**
 * Selector of the element that holds focus, or null for <body>. Used when the
 * control itself is gone. Runs in the browser.
 */
function activeElementSelector(): string | null {
  const active = document.activeElement;
  if (
    !active ||
    active === document.body ||
    active === document.documentElement
  ) {
    return null;
  }
  // Keep identical to the function of the same name in collectControls.
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
  return getUniqueSelector(active);
}

// =============================================================================
// Node-side helpers
// =============================================================================

type ProbeArg = Parameters<typeof probeControl>[1];

const probe = (locator: Locator, arg: ProbeArg): Promise<ProbeResult> =>
  locator.evaluate(probeControl, arg);

/**
 * A text value to type: the first candidate that differs from the current
 * value, filled or cut to `maxlength` exactly (so a field that jumps ahead when
 * full is caught).
 */
function pickTextValue(
  type: string,
  current: string,
  maxLength: number,
): string | null {
  const values =
    type in CHANGE_ON_INPUT_TEXT_VALUES && type !== 'default'
      ? CHANGE_ON_INPUT_TEXT_VALUES[
          type as keyof typeof CHANGE_ON_INPUT_TEXT_VALUES
        ]
      : CHANGE_ON_INPUT_TEXT_VALUES.default;
  const fit = (value: string, filler: string): string =>
    maxLength > 0 && type !== 'number'
      ? value.padEnd(maxLength, filler).slice(0, maxLength)
      : value;
  const candidates: string[] = [fit(values[0], '1'), fit(values[1], '2')];
  // Truncation can make both equal to the current value: fall back to
  // full-length digits.
  if (maxLength > 0 && type !== 'number') {
    candidates.push('1'.repeat(maxLength), '2'.repeat(maxLength));
  }
  return candidates.find((candidate) => candidate !== current) ?? null;
}

function publicControl(collected: CollectedControl): ChangeOnInputControl {
  return {
    selector: collected.selector,
    controlKind: collected.controlKind,
    type: collected.type,
    name: collected.name,
    label: collected.label,
    html: collected.html,
    htmlTruncated: collected.htmlTruncated,
  };
}

const sameState = (a: ControlState, b: ControlState): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Run the change-on-input check against the target URL, write the result
 * JSON, and return the parsed result.
 */
export async function runChangeOnInputCheck(
  options: RunChangeOnInputCheckOptions,
): Promise<ChangeOnInputCheckResult> {
  const {
    browser,
    createContext,
    targetUrl: targetUrlOption,
    contextOptions,
    settleMs = CHANGE_ON_INPUT_SETTLE_MS,
    timeBudgetMs = CHANGE_ON_INPUT_TIMEOUT_MS,
    maxControls = CHANGE_ON_INPUT_MAX_CONTROLS,
    ...location
  } = options;

  assertWalkLimits({ timeBudgetMs });
  if (!(
    typeof settleMs === 'number' &&
    Number.isFinite(settleMs) &&
    settleMs > 0
  )) {
    throw new Error(
      `\`settleMs\` must be a positive finite number of milliseconds (got ${String(settleMs)}).`,
    );
  }
  if (!(Number.isInteger(maxControls) && maxControls > 0)) {
    throw new Error(
      `\`maxControls\` must be a positive integer (got ${String(maxControls)}).`,
    );
  }

  const newContext = resolveCreateContext(
    { browser, createContext },
    contextOptions,
  );
  const targetUrl = requireTargetUrl(targetUrlOption);
  const out = createAuditOutput({
    ...location,
    defaultFile: DEFAULT_CHANGE_ON_INPUT_RESULT_FILE,
  });

  const findings: ChangeOnInputFinding[] = [];
  const skipped: ChangeOnInputCheckDetails['skipped'] = [];
  const untested: ChangeOnInputCheckDetails['untested'] = [];
  // Marked before the control is touched, so one that navigates or throws is
  // never tried again after the restart.
  const tried = new Set<string>();
  let controlsFound = 0;
  let controlsTested = 0;
  let processed = 0;
  let restarts = 0;
  let startUrl = targetUrl;
  let aborted: ChangeOnInputCheckDetails['aborted'] = null;
  // Held outside the loop so it is closed in `finally` even if an attempt throws.
  let context: BrowserContext | null = null;
  const startedAt = Date.now();

  const abort = (
    reason: NonNullable<ChangeOnInputCheckDetails['aborted']>['reason'],
  ): void => {
    aborted = {
      reason,
      testedCount: controlsTested,
      foundCount: controlsFound,
    };
    out.warn(
      `\n⚠️  Stopped (${reason}): ${controlsTested} of ${controlsFound} controls were tested.`,
    );
  };

  try {
    for (let attempt = 0; !aborted; attempt += 1) {
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

      // Any main-frame navigation counts, including a reload to the same URL or
      // a `#`-only change: the viewport moving is a change of context too.
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
      // The initial load and setup must not count as caused by a control.
      resetRecords();

      const controls = await page.evaluate(collectControls, {
        snippetMax: HTML_SNIPPET_MAX_LENGTH,
      });
      if (attempt === 0) controlsFound = controls.length;

      let navigated = false;
      for (const control of controls) {
        if (tried.has(control.selector)) continue;
        if (Date.now() - startedAt > timeBudgetMs) {
          abort('timeout');
          break;
        }
        if (control.skipReason) {
          tried.add(control.selector);
          skipped.push({
            selector: control.selector,
            reason: control.skipReason,
          });
          continue;
        }
        if (processed >= maxControls) {
          abort('control-limit');
          break;
        }
        tried.add(control.selector);
        processed += 1;
        resetRecords();

        const kind = control.controlKind;
        const locator: Locator = page.locator(control.locator).first();
        let before: ControlState = null;
        let action = '';
        let focusMoved: string | null = null;
        let valueChanged = false;
        let trialError: unknown = null;
        // Focus alone already caused a context change (before the value changed).
        let changedOnFocus = false;
        // True once the value change started, so errors after it are its own.
        let changing = false;
        // Put the value back through properties: no event, so handlers do not
        // react to the restoring. A control that is gone is not worth failing on.
        const restoreValue = (): Promise<void> =>
          probe(locator, { kind, op: 'restore', snapshot: before }).then(
            () => {},
            () => {},
          );
        try {
          before = (await probe(locator, { kind, op: 'read' })).state;
          let typed: string | null = null;
          if (kind === 'text') {
            typed = pickTextValue(
              control.type,
              control.currentValue,
              control.maxLength,
            );
            if (typed === null) {
              skipped.push({
                selector: control.selector,
                reason: 'value-unchanged',
              });
              continue;
            }
          }
          await locator.focus();
          // Let a delayed on-focus handler show itself before the value changes.
          await page.waitForTimeout(
            Math.max(settleMs, CHANGE_ON_INPUT_FOCUS_SETTLE_MS),
          );
          // Anything focus alone causes is On Focus (3.2.1), not On Input: leave
          // the value alone and keep it out of the findings.
          const onFocus = await probe(locator, { kind, op: 'read' });
          if (
            onFocus.movedTo ||
            navigations.length > 0 ||
            newWindows.length > 0 ||
            dialogs.length > 0
          ) {
            changedOnFocus = true;
            throw new Error('context change on focus');
          }
          // From here on, whatever is recorded was caused by the value change.
          resetRecords();
          changing = true;
          if (kind === 'select') {
            action = `selected option ${control.altIndex + 1} "${control.altText}"`;
            await locator.selectOption({ index: control.altIndex });
          } else if (kind === 'radio') {
            action = 'checked';
            await locator.check();
          } else if (kind === 'checkbox') {
            action = before === true ? 'unchecked' : 'checked';
            await locator.click();
          } else if (typed !== null) {
            action = `typed "${typed}" and blurred`;
            await locator.fill(typed);
          }
          const after = await probe(locator, { kind, op: 'read' });
          valueChanged = !sameState(before, after.state);
          focusMoved = after.movedTo;
          if (kind === 'text') {
            const blurred = await probe(locator, { kind, op: 'blur' });
            focusMoved ??= blurred.movedTo;
          }
          await page.waitForTimeout(settleMs);
          // A handler may move focus a moment later (setTimeout).
          focusMoved ??= (await probe(locator, { kind, op: 'read' })).movedTo;
        } catch (error) {
          trialError = error;
        }

        await Promise.all(pendingPopups);
        let navigation = navigations.length > 0;
        if (trialError) {
          const message = (
            (trialError instanceof Error
              ? trialError.message
              : String(trialError)
            ).split('\n')[0] ?? ''
          ).slice(0, 200);
          if (!navigation && NAVIGATION_ERROR.test(message)) {
            navigation = true;
          }
        }

        if (!changing && (changedOnFocus || navigation)) {
          skipped.push({
            selector: control.selector,
            reason: 'context-change-on-focus',
          });
          // The page was replaced: carry on in a fresh context.
          if (navigation) {
            navigated = true;
            break;
          }
          continue;
        }

        if (
          trialError &&
          !navigation &&
          newWindows.length === 0 &&
          dialogs.length === 0
        ) {
          // The control may have been removed while a handler moved focus.
          if (changing && (await locator.count().catch(() => 1)) === 0) {
            focusMoved ??= await page
              .evaluate(activeElementSelector)
              .catch(() => null);
          }
          if (!focusMoved) {
            // The control vanished, was hidden or could not be operated.
            await restoreValue();
            untested.push({
              control: publicControl(control),
              reason: (trialError instanceof Error
                ? (trialError.message.split('\n')[0] ?? '')
                : String(trialError)
              ).slice(0, 200),
            });
            continue;
          }
        }

        const changes: InputContextChange[] = [];
        if (navigation) {
          changes.push({
            kind: 'navigation',
            toUrl: navigations.at(-1) ?? page.url(),
          });
        }
        for (const popup of newWindows) {
          changes.push({ kind: 'new-window', url: popup.url });
        }
        for (const dialog of dialogs)
          changes.push({ kind: 'dialog', ...dialog });
        if (focusMoved) {
          changes.push({ kind: 'focus-moved', toSelector: focusMoved });
        }

        if (changes.length > 0) {
          findings.push({ control: publicControl(control), action, changes });
          controlsTested += 1;
        } else if (valueChanged) {
          controlsTested += 1;
        } else {
          skipped.push({
            selector: control.selector,
            reason: 'value-unchanged',
          });
        }

        if (navigation) {
          navigated = true;
          break;
        }
        await restoreValue();
      }

      await context.close();
      context = null;
      // Nothing left to try: restarting would only reload the page.
      if (
        aborted ||
        !navigated ||
        controls.every((control) => tried.has(control.selector))
      ) {
        break;
      }
      if (restarts >= CHANGE_ON_INPUT_MAX_RESTARTS) {
        abort('restart-limit');
        break;
      }
      restarts += 1;
    }

    const details: ChangeOnInputCheckDetails = {
      controlsFound,
      controlsTested,
      skipped,
      untested,
      findings,
      restarts,
      aborted,
    };
    const result = buildAuditResult({
      source: 'change-on-input-check',
      url: startUrl,
      details,
      buckets: normalizeChangeOnInputCheck(details),
    });
    out.save(result);
    out.header('Change on Input Check', 'WCAG 3.2.2', startUrl);
    out.summary({
      'Controls found': controlsFound,
      'Controls tested': controlsTested,
      'Context changes': findings.length,
      Restarts: restarts,
    });
    out.outputPaths();
    return result;
  } finally {
    await context?.close();
  }
}
