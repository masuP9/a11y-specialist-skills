/**
 * Accessible Authentication Check — WCAG 3.3.8 (Accessible Authentication, Minimum)
 *
 * Looks at the main document for password / verification code / username
 * fields and CAPTCHA-like elements, and reports three kinds of candidates
 * (all `incomplete`; a human decides whether another way through
 * authentication exists):
 * - pasting into password / verification code fields does not work (measured
 *   by pasting a short probe text with the keyboard; see paste test below),
 * - autocomplete="off" (or a value that does not name the field) on an
 *   authentication field,
 * - CAPTCHA-like elements.
 *
 * A field with no autocomplete attribute, or only "on" (`missing`), is kept in
 * `details` but not reported: password managers usually infer the purpose from
 * the control type, so it does not stop them the way "off" does. When the
 * field's name matches the 1.3.5 patterns, autocomplete-audit's
 * `autocomplete-missing` may report it; a field that matches neither is not
 * reported by either check.
 *
 * The paste test (unless `paste: false`) grants clipboard permissions to the
 * page's context, overwrites the clipboard, and briefly opens a helper page in
 * that context (a secure-context page served from a route that never touches
 * the network; headless Chromium only exposes `navigator.clipboard` there).
 * The raw value of a field is never recorded: a page may put a real secret
 * back instead of the probe, so only a comparison with the probe is kept.
 *
 * The caller is responsible for navigating the page before calling this.
 *
 * Limitations:
 * - Only `input` elements of the main document are inspected: not iframes
 *   (e.g. a third-party login widget) and not shadow roots.
 * - The paste test is verified on Chromium. If granting the permission or the
 *   control paste on the helper page fails, the test is `unavailable`.
 * - The paste test changes the page's context (permissions, clipboard, a
 *   short-lived extra page). Field values are put back, except for a field
 *   whose paste timed out (the page is stuck, so nothing more is done to it),
 *   and state a page changes in response to `input` events is not. Pass
 *   `paste: false` when
 *   reusing the page. The CLI uses a fresh context per check.
 * - Invisible / disabled / readonly fields are not paste-tested (reported as
 *   untested). A login form that appears only after a click must be opened by
 *   the caller before the page is passed in.
 * - One-time-code fields are found partly by name; split one-digit fields are
 *   usually found only for the first one. CAPTCHAs are found by name: a custom
 *   implementation without "captcha" in its markup is not found, and
 *   score-based (invisible) ones are listed too.
 * - Whether an alternative (passkey, SSO, e-mail link) exists, and whether a
 *   CAPTCHA only recognizes objects or user-provided content, is not judged.
 */

import type { Page } from '@playwright/test';
import type {
  AccessibleAuthenticationCheckDetails,
  AccessibleAuthenticationCheckResult,
  AuthField,
  AuthFieldKind,
  AuthPasteResult,
  CaptchaCandidate,
} from '../types.js';
import {
  AUTH_CAPTCHA_SELECTOR,
  AUTH_EXPECTED_AUTOCOMPLETE,
  AUTH_OTP_NAME_PATTERN,
  AUTH_OTP_NAME_WORDS,
  AUTH_PASTE_FIELD_TIMEOUT_MS,
  AUTH_PASTE_HELPER_URL,
  AUTH_PASTE_PROBE,
  AUTH_PASTE_SETTLE_MS,
  AUTH_PASTE_STEP_TIMEOUT_MS,
  DEFAULT_ACCESSIBLE_AUTHENTICATION_RESULT_FILE,
  HTML_SNIPPET_MAX_LENGTH,
} from '../constants.js';
import {
  buildAuditResult,
  normalizeAccessibleAuthenticationCheck,
} from '../utils/axe-format.js';
import {
  createAuditOutput,
  type AuditOutputOptions,
} from '../utils/test-harness.js';
import {
  openEventListenerInspector,
  type EventListenerInspector,
} from './cdpEventListeners.js';
import { autocompleteTokens } from './runAutocompleteAudit.js';

export interface RunAccessibleAuthenticationCheckOptions extends AuditOutputOptions {
  /** A page already navigated to the target URL. */
  page: Page;
  /**
   * Paste into password / one-time-code fields to see whether pasting works.
   * Grants clipboard permissions to the page's context, overwrites the
   * clipboard, and opens a short-lived helper page in that context. Default: true.
   */
  paste?: boolean;
}

// =============================================================================
// Scan (runs in the page)
// =============================================================================

interface ScanArgs {
  htmlSnippetMaxLength: number;
  otpSource: string;
  otpFlags: string;
  otpWords: readonly string[];
  captchaSelector: string;
}

type RawAuthField = Omit<
  AuthField,
  'autocompleteStatus' | 'paste' | 'pasteListenerCount'
>;

interface ScanResult {
  fields: RawAuthField[];
  captchas: CaptchaCandidate[];
}

/**
 * Serialized and run in the page, so it cannot use imports: the helpers below
 * are repeated here on purpose. The page is left untouched (no attributes).
 */
function scanAuthentication(args: ScanArgs): ScanResult {
  const {
    htmlSnippetMaxLength,
    otpSource,
    otpFlags,
    otpWords,
    captchaSelector,
  } = args;
  const otpPattern = new RegExp(otpSource, otpFlags);

  // Like collectBasicFieldInfo() in runAutocompleteAudit.ts, except that an id
  // is used only when it is unique in the document (escaped so that it is valid
  // CSS), and the path always starts at body.
  function getUniqueSelector(element: Element): string {
    if (
      element.id &&
      document.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1
    ) {
      return `#${CSS.escape(element.id)}`;
    }
    if (element === document.body) return 'body';
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
    return ['body', ...path].join(' > ');
  }

  // outerHTML without any `value` attribute (on the element and its
  // descendants): a page may carry a real secret as an initial value.
  function safeOuterHTML(element: Element): {
    html: string;
    htmlTruncated: boolean;
  } {
    const clone = element.cloneNode(true) as Element;
    clone.removeAttribute('value');
    clone
      .querySelectorAll('[value]')
      .forEach((descendant) => descendant.removeAttribute('value'));
    const html = clone.outerHTML || `<${element.tagName.toLowerCase()}>`;
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

  function labelOf(input: HTMLInputElement): string | null {
    const parts: string[] = [];
    input.labels?.forEach((label) => parts.push(label.textContent ?? ''));
    parts.push(input.getAttribute('aria-label') ?? '');
    for (const ref of (input.getAttribute('aria-labelledby') ?? '').split(
      /\s+/,
    )) {
      if (ref) parts.push(document.getElementById(ref)?.textContent ?? '');
    }
    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, 80) : null;
  }

  // The same split as autocompleteTokens() in runAutocompleteAudit.ts.
  function tokensOf(input: HTMLInputElement): string[] {
    return (input.getAttribute('autocomplete') ?? '')
      .replace(/[A-Z]/g, (c) => c.toLowerCase())
      .split(/[\t\n\f\r ]+/)
      .filter((token) => token !== '');
  }

  // Phrases match anywhere; short words only as whole words (camelCase and
  // non-alphanumerics split them), so `otpCode` matches and `footprint` does not.
  function looksLikeOtp(value: string | null): boolean {
    if (!value) return false;
    if (otpPattern.test(value)) return true;
    return value
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .some((word) => otpWords.includes(word));
  }

  const searchPattern = /search|query|検索/i;
  function commonAncestor(a: Element, b: Element): Element | null {
    for (let p: Element | null = a; p; p = p.parentElement) {
      if (p.contains(b)) return p;
    }
    return null;
  }

  const textTypes = ['text', 'tel', 'number', 'email', 'search', 'url'];
  const entries = Array.from(document.querySelectorAll('input')).map((el) => {
    const label = labelOf(el);
    const tokens = tokensOf(el);
    let kind: AuthFieldKind | null = null;
    if (
      (el.type === 'password' || textTypes.includes(el.type)) &&
      tokens.includes('one-time-code')
    ) {
      kind = 'one-time-code';
    } else if (el.type === 'password') {
      kind = 'password';
    } else if (
      ['text', 'tel', 'number'].includes(el.type) &&
      [el.name, el.id, label, el.placeholder].some(looksLikeOtp)
    ) {
      kind = 'one-time-code';
    } else if (textTypes.includes(el.type) && tokens.includes('username')) {
      kind = 'username';
    }
    return { el, label, kind };
  });

  // The last text field before the first password field of the same form
  // (or of the document, for fields outside any form) is the username. Search
  // fields are skipped, and outside a form the field must share a block with
  // the password field (a common ancestor other than body / html).
  const firstPassword = new Map<HTMLFormElement | null, number>();
  entries.forEach((entry, i) => {
    if (entry.kind === 'password' && !firstPassword.has(entry.el.form)) {
      firstPassword.set(entry.el.form, i);
    }
  });
  for (const [form, passwordIndex] of firstPassword) {
    const password = entries[passwordIndex]?.el;
    for (let i = passwordIndex - 1; i >= 0; i--) {
      const entry = entries[i];
      if (
        !password ||
        !entry ||
        entry.el.form !== form ||
        !['text', 'email', 'tel'].includes(entry.el.type) ||
        [entry.el.name, entry.el.id, entry.el.placeholder, entry.label].some(
          (value) => value && searchPattern.test(value),
        )
      ) {
        continue;
      }
      if (form === null) {
        const ancestor = commonAncestor(entry.el, password);
        if (
          !ancestor ||
          ancestor === document.body ||
          ancestor === document.documentElement
        ) {
          continue;
        }
      }
      if (entry.kind === null) entry.kind = 'username';
      break;
    }
  }

  const fields: RawAuthField[] = [];
  for (const { el, label, kind } of entries) {
    if (kind === null) continue;
    fields.push({
      selector: getUniqueSelector(el),
      ...safeOuterHTML(el),
      kind,
      inputType: el.type,
      name: el.name || null,
      id: el.id || null,
      labelText: label,
      autocomplete: el.getAttribute('autocomplete'),
      formAutocomplete: el.form?.getAttribute('autocomplete') ?? null,
      editable: !(el.matches(':disabled') || el.readOnly),
      visible: isVisible(el),
      formSelector: el.form ? getUniqueSelector(el.form) : null,
    });
  }

  const skippedTags = ['SCRIPT', 'STYLE', 'LINK', 'META'];
  const matched = Array.from(document.querySelectorAll(captchaSelector)).filter(
    (el) => !skippedTags.includes(el.tagName),
  );
  const matchedSet = new Set<Element>(matched);
  const parts = captchaSelector.split(/,\s*/);
  const captchas: CaptchaCandidate[] = [];
  for (const el of matched) {
    // Outermost match only: skip the iframe inside .g-recaptcha, etc.
    let nested = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (matchedSet.has(p)) nested = true;
    }
    if (nested) continue;
    captchas.push({
      selector: getUniqueSelector(el),
      ...safeOuterHTML(el),
      matchedBy: parts.find((part) => el.matches(part)) ?? captchaSelector,
      visible: isVisible(el),
    });
  }

  return { fields, captchas };
}

function autocompleteStatusOf(
  kind: AuthFieldKind,
  autocomplete: string | null,
  formAutocomplete: string | null,
): AuthField['autocompleteStatus'] {
  const tokens = autocompleteTokens(autocomplete ?? '');
  if (tokens.length === 0) {
    // Without a value of its own, a field takes "off" from its form (HTML spec).
    const formTokens = autocompleteTokens(formAutocomplete ?? '');
    return formTokens.length === 1 && formTokens[0] === 'off'
      ? 'off'
      : 'missing';
  }
  // "on" does not turn autofill off, so it counts as no explicit value.
  if (tokens.length === 1 && tokens[0] === 'on') return 'missing';
  if (tokens.length === 1 && tokens[0] === 'off') return 'off';
  // section-* / shipping / billing / webauthn / contact-type tokens are ignored
  // by looking only for the expected field names.
  const expected = AUTH_EXPECTED_AUTOCOMPLETE[kind];
  return tokens.some((token) => expected.includes(token)) ? 'ok' : 'mismatch';
}

// =============================================================================
// Paste test
// =============================================================================

/** Rejects when `promise` takes longer than `ms`; the promise is left running. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('step timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const NAVIGATION_ERROR_PATTERN =
  /Execution context was destroyed|because of a navigation/i;

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.split('\n')[0] ?? '').slice(0, 200);
}

/**
 * Paste the clipboard into one field and record how the value compares with
 * the probe. Mutates `state` as it goes (so a timeout keeps what was already
 * measured) and returns without touching the page once `signal.cancelled` is
 * set: a Promise.race does not stop the operations it abandons.
 */
async function pasteOne(
  page: Page,
  field: AuthField,
  state: AuthPasteResult,
  signal: { cancelled: boolean },
): Promise<void> {
  const locator = page.locator(field.selector).first();
  const options = { timeout: AUTH_PASTE_STEP_TIMEOUT_MS };

  // Kept in this variable only, to be put back; never recorded.
  const original = await locator.inputValue(options);
  if (signal.cancelled) return;
  await locator.focus(options);
  if (signal.cancelled) return;
  // A focus handler may move focus elsewhere; pasting would go to the wrong field.
  const focused = await locator.evaluate(
    (el) =>
      el === document.activeElement ||
      (el.getRootNode() as Document | ShadowRoot).activeElement === el,
    undefined,
    options,
  );
  if (signal.cancelled) return;
  if (!focused) {
    state.error = 'focus-moved';
    return;
  }
  await locator.evaluate(
    (el) => {
      (el as HTMLInputElement).value = '';
    },
    undefined,
    options,
  );
  if (signal.cancelled) return;
  await page.keyboard.press('ControlOrMeta+V');
  if (signal.cancelled) return;
  await new Promise((resolve) => setTimeout(resolve, AUTH_PASTE_SETTLE_MS));
  if (signal.cancelled) return;
  const after = await locator.inputValue(options);
  if (signal.cancelled) return;

  const probe = AUTH_PASTE_PROBE;
  if (after === probe) {
    state.valueAfterPaste = 'probe';
  } else if (after !== '' && probe.startsWith(after)) {
    state.valueAfterPaste = 'probe-prefix';
  } else {
    state.valueAfterPaste = after === '' ? 'empty' : 'other';
  }
  state.result =
    state.valueAfterPaste === 'probe' ||
    state.valueAfterPaste === 'probe-prefix'
      ? 'inserted'
      : 'blocked';

  if (state.result === 'blocked') {
    // Tells "the paste event is cancelled" from "the value is cleared later".
    state.pasteEventPrevented = await locator.evaluate(
      (el, text) => {
        const data = new DataTransfer();
        data.setData('text/plain', text);
        const event = new ClipboardEvent('paste', {
          clipboardData: data,
          cancelable: true,
          bubbles: true,
        });
        el.dispatchEvent(event);
        return event.defaultPrevented;
      },
      probe,
      options,
    );
    if (signal.cancelled) return;
  }

  await locator.evaluate(
    (el, value) => {
      (el as HTMLInputElement).value = value;
    },
    original,
    options,
  );
}

/**
 * Paste test for one field, bounded by AUTH_PASTE_FIELD_TIMEOUT_MS. A handler
 * that never returns is stopped through CDP; the page itself stays open (it
 * belongs to the caller). `stop` is true when later fields must not be tried.
 */
async function pasteField(
  page: Page,
  inspector: EventListenerInspector | null,
  field: AuthField,
  urlBefore: string,
): Promise<{ paste: AuthPasteResult; stop: boolean }> {
  const state: AuthPasteResult = {
    result: null,
    valueAfterPaste: null,
    pasteEventPrevented: null,
    navigated: false,
    error: null,
  };
  const signal = { cancelled: false };

  let opSettled = false;
  const operation = pasteOne(page, field, state, signal).then(
    () => {
      opSettled = true;
      return { failure: undefined as unknown };
    },
    (failure: unknown) => {
      opSettled = true;
      return { failure };
    },
  );

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), AUTH_PASTE_FIELD_TIMEOUT_MS);
  });
  let settled: { failure: unknown } | 'timeout';
  try {
    settled = await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
  if (settled === 'timeout' && opSettled) settled = await operation;

  if (settled === 'timeout') {
    signal.cancelled = true;
    let terminated = false;
    if (inspector) {
      try {
        await withTimeout(
          inspector.terminateExecution(),
          AUTH_PASTE_STEP_TIMEOUT_MS,
        );
        terminated = true;
      } catch {
        terminated = false;
      }
    }
    state.error = terminated ? 'timeout' : 'timeout-unrecoverable';
    return { paste: state, stop: true };
  }

  const { failure } = settled;
  const message = failure === undefined ? null : describeError(failure);
  if (
    page.url() !== urlBefore ||
    (message !== null && NAVIGATION_ERROR_PATTERN.test(message))
  ) {
    return {
      paste: {
        result: null,
        valueAfterPaste: null,
        pasteEventPrevented: null,
        navigated: true,
        error: null,
      },
      stop: true,
    };
  }
  state.error = message ?? state.error;
  return { paste: state, stop: false };
}

type PasteTest = AccessibleAuthenticationCheckDetails['pasteTest'];

/**
 * Writes the probe to the clipboard from a secure-context helper page, checks
 * that a keyboard paste works there (control experiment), then pastes into
 * each target. Fills `field.paste` / `field.pasteListenerCount` in place.
 */
async function runPasteTest(
  page: Page,
  targets: AuthField[],
  urlBefore: string,
): Promise<PasteTest> {
  const unavailable = (
    reason: NonNullable<PasteTest['reason']>,
    probe: string | null,
  ): PasteTest => ({ status: 'unavailable', reason, probe });

  try {
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);
  } catch {
    return unavailable('clipboard-permission', null);
  }

  let wroteProbe = false;
  let helper: Page | undefined;
  try {
    helper = await page.context().newPage();
    await helper.route(AUTH_PASTE_HELPER_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<input id="probe">' }),
    );
    await helper.goto(AUTH_PASTE_HELPER_URL, {
      timeout: AUTH_PASTE_STEP_TIMEOUT_MS,
    });
    const opened = helper;
    await withTimeout(
      opened.evaluate(
        (text) => navigator.clipboard.writeText(text),
        AUTH_PASTE_PROBE,
      ),
      AUTH_PASTE_STEP_TIMEOUT_MS,
    );
    wroteProbe = true;
    await opened
      .locator('#probe')
      .focus({ timeout: AUTH_PASTE_STEP_TIMEOUT_MS });
    await withTimeout(
      opened.keyboard.press('ControlOrMeta+V'),
      AUTH_PASTE_STEP_TIMEOUT_MS,
    );
    const pasted = await opened
      .locator('#probe')
      .inputValue({ timeout: AUTH_PASTE_STEP_TIMEOUT_MS });
    if (pasted !== AUTH_PASTE_PROBE) {
      return unavailable('paste-shortcut', AUTH_PASTE_PROBE);
    }
  } catch {
    return unavailable('helper-page', wroteProbe ? AUTH_PASTE_PROBE : null);
  } finally {
    if (helper) {
      await withTimeout(helper.close(), AUTH_PASTE_STEP_TIMEOUT_MS).catch(
        () => {},
      );
    }
  }

  let inspector: EventListenerInspector | null = null;
  try {
    inspector = await openEventListenerInspector(page);
  } catch {
    inspector = null;
  }

  try {
    // Evidence only (delegated listeners on document are not seen). Taken
    // before any paste, while the page's scripts have not been triggered.
    if (inspector) {
      try {
        const counts = await withTimeout(
          (async () => {
            await page.evaluate(
              (selectors) => {
                (
                  window as unknown as Record<string, unknown>
                ).__a11yAuthFields = selectors.map((selector) =>
                  document.querySelector(selector),
                );
              },
              targets.map((t) => t.selector),
            );
            try {
              return await inspector.forEach('window.__a11yAuthFields', [
                'paste',
                'beforeinput',
                'input',
              ]);
            } finally {
              await page.evaluate(() => {
                delete (window as unknown as Record<string, unknown>)
                  .__a11yAuthFields;
              });
            }
          })(),
          AUTH_PASTE_STEP_TIMEOUT_MS,
        );
        if (counts.length === targets.length) {
          targets.forEach((target, i) => {
            target.pasteListenerCount = counts[i]?.length ?? null;
          });
        }
      } catch {
        // Leave the counts null and go on with the measurement.
      }
    }

    await withTimeout(page.bringToFront(), AUTH_PASTE_STEP_TIMEOUT_MS).catch(
      () => {},
    );
    for (const target of targets) {
      const { paste, stop } = await pasteField(
        page,
        inspector,
        target,
        urlBefore,
      );
      target.paste = paste;
      if (stop) break;
    }
  } finally {
    if (inspector) {
      await withTimeout(inspector.close(), AUTH_PASTE_STEP_TIMEOUT_MS).catch(
        () => {},
      );
    }
  }

  return { status: 'ran', reason: null, probe: AUTH_PASTE_PROBE };
}

// =============================================================================
// Runner
// =============================================================================

/**
 * Run the accessible authentication check against the current page, write the
 * result JSON, and return the parsed result.
 */
export async function runAccessibleAuthenticationCheck(
  options: RunAccessibleAuthenticationCheckOptions,
): Promise<AccessibleAuthenticationCheckResult> {
  const { page, paste, ...location } = options;
  const out = createAuditOutput({
    ...location,
    defaultFile: DEFAULT_ACCESSIBLE_AUTHENTICATION_RESULT_FILE,
  });

  // The paste test may navigate; the result describes the page as inspected.
  const url = page.url();
  const scan = await page.evaluate(scanAuthentication, {
    htmlSnippetMaxLength: HTML_SNIPPET_MAX_LENGTH,
    otpSource: AUTH_OTP_NAME_PATTERN.source,
    otpFlags: AUTH_OTP_NAME_PATTERN.flags,
    otpWords: AUTH_OTP_NAME_WORDS,
    captchaSelector: AUTH_CAPTCHA_SELECTOR,
  });

  const details: AccessibleAuthenticationCheckDetails = {
    fields: scan.fields.map((raw) => ({
      ...raw,
      autocompleteStatus: autocompleteStatusOf(
        raw.kind,
        raw.autocomplete,
        raw.formAutocomplete,
      ),
      paste: null,
      pasteListenerCount: null,
    })),
    captchas: scan.captchas,
    pasteTest: { status: 'skipped-no-targets', reason: null, probe: null },
  };

  const targets = details.fields.filter(
    (f) =>
      (f.kind === 'password' || f.kind === 'one-time-code') &&
      f.editable &&
      f.visible,
  );
  if (targets.length > 0) {
    details.pasteTest =
      paste === false
        ? { status: 'disabled', reason: null, probe: null }
        : await runPasteTest(page, targets, url);
  }

  const result: AccessibleAuthenticationCheckResult = buildAuditResult({
    source: 'accessible-authentication-check',
    url,
    details,
    buckets: normalizeAccessibleAuthenticationCheck(details),
  });

  out.header('Accessible Authentication Results', 'WCAG 3.3.8', result.url);

  out.summary({
    'Authentication fields': details.fields.length,
    'CAPTCHA candidates': details.captchas.length,
    'Paste test': details.pasteTest.status,
  });

  out.save(result);

  out.outputPaths();

  return result;
}
