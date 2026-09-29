/**
 * Keyboard Reachability Check (WCAG 2.1.1 — Keyboard)
 *
 * Presses Tab through the page, then arrow keys inside each composite widget
 * (roving tabindex) it could enter, and follows aria-activedescendant, to
 * record how every operable element is reached. Operable elements that no
 * path reaches are reported as incomplete candidates with a reason and a
 * confidence. Owns its BrowserContext like the keyboard-trap check.
 *
 * Limitations:
 * - 2.1.1 is about functions, not elements: the same function may be keyboard
 *   operable elsewhere (duplicate control, custom shortcut), so candidates are
 *   always incomplete.
 * - Click listeners delegated to document/window (or a framework root) cannot
 *   be attributed to elements; `el.onclick = fn` assignments are not seen.
 *   Listener evidence is registration history (removeEventListener is not
 *   tracked).
 * - Shadow DOM and iframes are not inspected.
 * - Elements are enumerated once, right after load; content shown later
 *   (submenus, other tab panels, combobox popups) is out of scope.
 * - Arrow keys change the selection of native radios, single-select listboxes
 *   and automatically activated tablists (in this check's throwaway context).
 * - grid / treegrid are not explored; their items are 'not-evaluated'.
 * - Widgets entered by keys other than Tab (F6, custom shortcuts) are reported.
 * - An onclick element inside a reachable operable ancestor is excluded even
 *   when its function differs from the ancestor's.
 * - Press and time limits apply before each key press; a page script that
 *   never yields (so a browser call never returns) is not interrupted.
 */

import type { Browser, BrowserContextOptions } from '@playwright/test';
import type {
  KeyboardReachabilityCheckDetails,
  KeyboardReachabilityCheckResult,
  KeyboardReachabilityComposite,
  KeyboardReachabilityElement,
} from '../types.js';
import {
  DEFAULT_KEYBOARD_REACHABILITY_RESULT_FILE,
  DEFAULT_KEYBOARD_REACHABILITY_SCREENSHOT_FILE,
  DEFAULT_NAVIGATION_SETTLE_MS,
  FOCUSABLE_SELECTOR,
  HTML_SNIPPET_MAX_LENGTH,
  KEYBOARD_REACHABILITY_COMPOSITE_ROLES,
  KEYBOARD_REACHABILITY_MAX_ARROW_PRESSES_PER_COMPOSITE,
  KEYBOARD_REACHABILITY_MAX_ARROW_PRESSES_TOTAL,
  KEYBOARD_REACHABILITY_MAX_DOM_MUTATIONS,
  KEYBOARD_REACHABILITY_MAX_TAB_PRESSES,
  KEYBOARD_REACHABILITY_NATIVE_SELECTOR,
  KEYBOARD_REACHABILITY_OPERABLE_ROLES,
  KEYBOARD_REACHABILITY_TAB_SLACK,
  KEYBOARD_REACHABILITY_TIMEOUT_MS,
  KEYBOARD_REACHABILITY_UNSUPPORTED_COMPOSITE_ROLES,
} from '../constants.js';
import {
  buildAuditResult,
  normalizeKeyboardReachabilityCheck,
} from '../utils/axe-format.js';
import {
  takeAuditScreenshot,
  resolveScreenshotPath,
  requireTargetUrl,
  createAuditOutput,
  type AuditOutputOptions,
} from '../utils/test-harness.js';

// =============================================================================
// Options
// =============================================================================

export interface RunKeyboardReachabilityCheckOptions extends AuditOutputOptions {
  /** The browser to create audit contexts in. */
  browser: Browser;
  /** Target URL. Falls back to the `TEST_PAGE` env var; required. */
  targetUrl?: string;
  /** Whether to capture a screenshot (default: false). */
  screenshot?: boolean;
  /** Options forwarded to `browser.newContext()`. */
  contextOptions?: BrowserContextOptions;
  /** Milliseconds to wait after each key press (default: DEFAULT_NAVIGATION_SETTLE_MS). */
  walkSettleMs?: number;
}

// =============================================================================
// In-page tracker (runs before page scripts via addInitScript)
// =============================================================================

type ReachedMethod = 'tab' | 'arrow' | 'activedescendant';
type Orientation = KeyboardReachabilityComposite['orientation'];

interface EnumerateArgs {
  nativeSelector: string;
  operableRoles: string[];
  compositeRoles: string[];
  unsupportedRoles: string[];
  focusableSelector: string;
  maxLen: number;
}

interface EnumeratedElement {
  id: number;
  selector: string;
  tag: string;
  role: string | null;
  name: string;
  html: string;
  htmlTruncated: boolean;
  tabindex: string | null;
  evidence: KeyboardReachabilityElement['evidence'];
  focusable: boolean;
  compositeId: number | null;
}

interface EnumeratedComposite {
  selector: string;
  role: string;
  orientation: Orientation;
  supported: boolean;
}

interface Enumeration {
  docId: string;
  focusableCount: number;
  excluded: KeyboardReachabilityCheckDetails['excluded'];
  elements: EnumeratedElement[];
  composites: EnumeratedComposite[];
}

interface SyncResult {
  docId: string;
  reached: Array<[number, ReachedMethod]>;
  entries: number[];
  active: number;
  mutations: number;
}

interface GuardResult {
  docId: string;
  inside: boolean;
  valueControl: boolean;
  state: string;
}

type InPageMethod = 'enumerate' | 'sync' | 'guard' | 'restore' | 'setPhase';

/**
 * Installed with `page.addInitScript`, so it must be self-contained: it is
 * serialized and cannot reference anything from module scope.
 */
function installReachTracker(): void {
  interface Composite {
    el: Element | null;
    members: Element[] | null;
  }
  const w = window as unknown as { __a11yReach?: unknown };
  if (w.__a11yReach) return;

  let phase: 'idle' | 'tab' | 'arrow' = 'idle';
  let mutations = 0;
  const docId = Math.random().toString(36).slice(2);
  const listenerEls: Element[] = [];
  const listenerSet = new WeakSet<Element>();
  const reached = new Map<Element, 'tab' | 'arrow' | 'activedescendant'>();
  let items: Element[] = [];
  const composites: Composite[] = [];
  const entries = new Map<number, Element>();
  const keys = new WeakMap<object, number>();
  let nextKey = 1;

  // Record elements that get a pointer listener. Arguments are forwarded
  // untouched so the page's own listener registration never changes.
  const CLICK_TYPES = new Set([
    'click',
    'mousedown',
    'mouseup',
    'pointerdown',
    'pointerup',
  ]);
  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (
    this: EventTarget,
    ...args: Parameters<typeof origAdd>
  ): void {
    try {
      if (
        this instanceof Element &&
        CLICK_TYPES.has(args[0]) &&
        !listenerSet.has(this)
      ) {
        listenerSet.add(this);
        listenerEls.push(this);
      }
    } catch {
      // never block the page's listener
    }
    return origAdd.apply(this, args);
  };

  function inComposite(c: Composite, el: Element): boolean {
    return c.members ? c.members.includes(el) : c.el!.contains(el);
  }

  origAdd.call(
    document,
    'focusin',
    (event: Event) => {
      if (phase === 'idle') return;
      const t = event.target;
      if (!(t instanceof Element)) return;
      if (!reached.has(t)) reached.set(t, phase);
      if (phase === 'tab') {
        composites.forEach((c, i) => {
          if (!entries.has(i) && inComposite(c, t)) entries.set(i, t);
        });
      }
    },
    true,
  );

  new MutationObserver((records) => {
    for (const r of records) {
      mutations += r.addedNodes.length + r.removedNodes.length;
    }
  }).observe(document, { childList: true, subtree: true });

  function key(el: object | null): number {
    if (!el) return 0;
    let k = keys.get(el);
    if (k === undefined) {
      k = nextKey++;
      keys.set(el, k);
    }
    return k;
  }

  function getSelector(element: Element): string {
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.documentElement) {
      const tag = current.tagName.toLowerCase();
      const id = current.id ? `#${CSS.escape(current.id)}` : '';
      if (id) {
        parts.unshift(`${tag}${id}`);
        break;
      }
      const p: Element | null = current.parentElement;
      if (p) {
        const siblings = [...p.children].filter(
          (c) => c.tagName === current!.tagName,
        );
        const idx = siblings.indexOf(current) + 1;
        parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${idx})` : tag);
      } else {
        parts.unshift(tag);
      }
      current = p;
    }
    return parts.join(' > ');
  }

  function getRole(el: Element): string | null {
    const explicit = el.getAttribute('role')?.trim().split(/\s+/)[0];
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if ((tag === 'a' || tag === 'area') && el.hasAttribute('href')) {
      return 'link';
    }
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (el instanceof HTMLInputElement) {
      const type = el.type;
      if (type === 'checkbox' || type === 'radio') return type;
      if (type === 'range') return 'slider';
      if (type === 'number') return 'spinbutton';
      if (type === 'search') return 'searchbox';
      if (['button', 'submit', 'reset', 'image'].includes(type)) {
        return 'button';
      }
      return 'textbox';
    }
    if ((el as HTMLElement).isContentEditable) return 'textbox';
    return null;
  }

  function getName(el: Element): string {
    const label = el.getAttribute('aria-label')?.trim();
    if (label) return label;
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const text = labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .join(' ')
        .trim();
      if (text) return text.slice(0, 50);
    }
    const alt = el.getAttribute('alt') ?? el.getAttribute('title');
    if (alt) return alt.trim().slice(0, 50);
    return el.textContent?.trim().slice(0, 50) ?? '';
  }

  const ITEM_ROLES = [
    'treeitem',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'option',
    'tab',
    'radio',
  ];

  function enumerate(args: {
    nativeSelector: string;
    operableRoles: string[];
    compositeRoles: string[];
    unsupportedRoles: string[];
    focusableSelector: string;
    maxLen: number;
  }): unknown {
    const roleSelector = args.operableRoles
      .map((r) => `[role="${r}"]`)
      .join(', ');
    const operableSelector = `${args.nativeSelector}, ${roleSelector}, [onclick]`;

    const candidates = new Set<Element>(
      document.querySelectorAll(operableSelector),
    );
    const listenerCandidates = listenerEls.filter(
      (el) =>
        !candidates.has(el) &&
        el.isConnected &&
        el !== document.body &&
        el !== document.documentElement &&
        getComputedStyle(el).cursor === 'pointer',
    );
    for (const el of listenerCandidates) {
      // A container with operable descendants (including other listener
      // candidates) is likely a delegation root.
      if (el.querySelector(operableSelector)) continue;
      if (
        listenerCandidates.some((other) => other !== el && el.contains(other))
      )
        continue;
      candidates.add(el);
    }
    const ordered = [...candidates].sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );

    const excluded = { disabled: 0, inert: 0, hidden: 0, insideOperable: 0 };
    const kept: Element[] = [];
    for (const el of ordered) {
      if (
        el.matches(':disabled') ||
        el.getAttribute('aria-disabled') === 'true'
      ) {
        excluded.disabled++;
        continue;
      }
      if (el.closest('[inert]')) {
        excluded.inert++;
        continue;
      }
      const checkVisibility = (
        el as Element & { checkVisibility?: (o: object) => boolean }
      ).checkVisibility;
      const invisible =
        typeof checkVisibility === 'function'
          ? !checkVisibility.call(el, { checkVisibilityCSS: true })
          : getComputedStyle(el).visibility === 'hidden';
      if (invisible || el.getClientRects().length === 0) {
        excluded.hidden++;
        continue;
      }
      // Walk every operable ancestor: the Tab stop may sit above another
      // unfocusable operable wrapper (<button><span onclick><span onclick>).
      let tabbableAncestor = false;
      for (
        let a = el.parentElement?.closest(operableSelector);
        a && !tabbableAncestor;
        a = a.parentElement?.closest(operableSelector)
      ) {
        tabbableAncestor =
          (a as HTMLElement).tabIndex >= 0 && !a.matches(':disabled');
      }
      const role = getRole(el) ?? '';
      if (tabbableAncestor && !ITEM_ROLES.includes(role)) {
        excluded.insideOperable++;
        continue;
      }
      kept.push(el);
    }
    items = kept;

    // Composite widgets (explicit roles), then native radio groups.
    const compositeMeta: Array<{
      selector: string;
      role: string;
      orientation: string;
      supported: boolean;
    }> = [];
    const compositeSelector = [...args.compositeRoles, ...args.unsupportedRoles]
      .map((r) => `[role="${r}"]`)
      .join(', ');
    for (const el of document.querySelectorAll(compositeSelector)) {
      const role = getRole(el)!;
      const supported = !args.unsupportedRoles.includes(role);
      const attr = el.getAttribute('aria-orientation');
      let orientation: string;
      if (!supported) orientation = 'none';
      else if (attr === 'horizontal' || attr === 'vertical') {
        orientation = attr;
      } else if (['tablist', 'menubar', 'toolbar'].includes(role)) {
        orientation = 'horizontal';
      } else if (role === 'radiogroup') orientation = 'both';
      else orientation = 'vertical';
      composites.push({ el, members: null });
      compositeMeta.push({
        selector: getSelector(el),
        role,
        orientation,
        supported,
      });
    }
    const groups = new Map<object, Map<string, HTMLInputElement[]>>();
    for (const el of kept) {
      if (!(el instanceof HTMLInputElement) || el.type !== 'radio' || !el.name)
        continue;
      const owner: object = el.form ?? document;
      let byName = groups.get(owner);
      if (!byName) {
        byName = new Map();
        groups.set(owner, byName);
      }
      const list = byName.get(el.name) ?? [];
      list.push(el);
      byName.set(el.name, list);
    }
    for (const [owner, byName] of groups) {
      for (const [name, members] of byName) {
        const prefix =
          owner instanceof HTMLFormElement ? `${getSelector(owner)} ` : '';
        composites.push({ el: null, members });
        compositeMeta.push({
          selector: `${prefix}input[type="radio"][name="${CSS.escape(name)}"]`,
          role: 'radiogroup',
          orientation: 'both',
          supported: true,
        });
      }
    }

    function depth(el: Element): number {
      let d = 0;
      for (let p = el.parentElement; p; p = p.parentElement) d++;
      return d;
    }

    const elements = kept.map((el, id) => {
      let compositeId: number | null = null;
      let bestDepth = -1;
      composites.forEach((c, ci) => {
        if (c.el === el || !inComposite(c, el)) return;
        const d = c.members ? Infinity : depth(c.el!);
        if (d > bestDepth) {
          bestDepth = d;
          compositeId = ci;
        }
      });
      let evidence: string;
      if (el.matches(args.nativeSelector)) evidence = 'native';
      else if (roleSelector && el.matches(roleSelector)) evidence = 'role';
      else if (el.hasAttribute('onclick')) evidence = 'onclick';
      else evidence = 'click-listener';
      const rawHtml = el.outerHTML;
      const htmlTruncated = rawHtml.length > args.maxLen;
      return {
        id,
        selector: getSelector(el),
        tag: el.tagName.toLowerCase(),
        role: getRole(el),
        name: getName(el),
        html: htmlTruncated ? rawHtml.slice(0, args.maxLen) : rawHtml,
        htmlTruncated,
        tabindex: el.getAttribute('tabindex'),
        evidence,
        focusable: (el as HTMLElement).tabIndex >= 0,
        compositeId,
      };
    });

    // Tab budget: the shared FOCUSABLE_SELECTOR misses some Tab stops this
    // check enumerates (summary, contenteditable, tabindex=0 listeners).
    const tabStops = new Set<Element>(
      document.querySelectorAll(args.focusableSelector),
    );
    for (const el of kept) {
      if ((el as HTMLElement).tabIndex >= 0) tabStops.add(el);
    }

    return {
      docId,
      focusableCount: tabStops.size,
      excluded,
      elements,
      composites: compositeMeta,
    };
  }

  function recordActiveDescendant(): void {
    const ref = document.activeElement?.getAttribute('aria-activedescendant');
    if (!ref) return;
    const target = document.getElementById(ref);
    if (target && items.includes(target) && !reached.has(target)) {
      reached.set(target, 'activedescendant');
    }
  }

  function sync(): unknown {
    if (phase !== 'idle') recordActiveDescendant();
    const out: Array<[number, string]> = [];
    items.forEach((el, id) => {
      const m = reached.get(el);
      if (m) out.push([id, m]);
    });
    return {
      docId,
      reached: out,
      entries: [...entries.keys()],
      active: key(document.activeElement),
      mutations,
    };
  }

  function guard(ci: number): unknown {
    const a = document.activeElement;
    const c = composites[ci];
    const inside = !!a && !!c && a !== document.body && inComposite(c, a);
    let valueControl = false;
    if (a) {
      const role = getRole(a);
      const type = a instanceof HTMLInputElement ? a.type : null;
      valueControl =
        ['slider', 'spinbutton', 'textbox', 'searchbox'].includes(role ?? '') ||
        (type !== null &&
          !['checkbox', 'radio', 'button', 'submit', 'reset', 'image'].includes(
            type,
          )) ||
        a instanceof HTMLTextAreaElement ||
        a instanceof HTMLSelectElement ||
        (a as HTMLElement).isContentEditable;
    }
    return {
      docId,
      inside,
      valueControl,
      state: `${key(a)}|${a?.getAttribute('aria-activedescendant') ?? ''}`,
    };
  }

  /** Put focus back on a composite's entry without recording it as reached. */
  function restore(ci: number): unknown {
    phase = 'idle';
    const entry = entries.get(ci);
    if (!(entry instanceof HTMLElement || entry instanceof SVGElement)) {
      return { docId, ok: false };
    }
    entry.focus();
    if (document.activeElement !== entry) return { docId, ok: false };
    mutations = 0;
    phase = 'arrow';
    return { docId, ok: true };
  }

  function setPhase(next: 'idle' | 'tab' | 'arrow'): boolean {
    phase = next;
    return true;
  }

  w.__a11yReach = { enumerate, sync, guard, restore, setPhase };
}

// =============================================================================
// Runner
// =============================================================================

/**
 * Run the keyboard reachability check, write the result JSON (and optionally
 * a screenshot), and return the parsed result.
 */
export async function runKeyboardReachabilityCheck(
  options: RunKeyboardReachabilityCheckOptions,
): Promise<KeyboardReachabilityCheckResult> {
  const {
    browser,
    targetUrl: targetUrlOption,
    screenshot = false,
    contextOptions,
    walkSettleMs = DEFAULT_NAVIGATION_SETTLE_MS,
    ...location
  } = options;

  const targetUrl = requireTargetUrl(targetUrlOption);
  const out = createAuditOutput({
    ...location,
    defaultFile: DEFAULT_KEYBOARD_REACHABILITY_RESULT_FILE,
  });
  const screenshotPath = resolveScreenshotPath(
    out.resultPath,
    DEFAULT_KEYBOARD_REACHABILITY_SCREENSHOT_FILE,
  );

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage().catch(async (err: unknown) => {
    await context.close();
    throw err;
  });

  // The URL the result is reported for — never the page a key navigated to.
  let startUrl = targetUrl;

  const finish = async (
    details: KeyboardReachabilityCheckDetails,
  ): Promise<KeyboardReachabilityCheckResult> => {
    // After an abort the page shows another document; don't photograph it.
    if (screenshot && !details.aborted) {
      details.screenshotPath = await takeAuditScreenshot(page, {
        path: screenshotPath,
      });
    }
    const result = buildAuditResult({
      source: 'keyboard-reachability-check',
      url: startUrl,
      details,
      buckets: normalizeKeyboardReachabilityCheck(details),
    });
    out.save(result);
    out.header('Keyboard Reachability Check', 'WCAG 2.1.1', startUrl);
    out.outputPaths(details.screenshotPath || undefined);
    return result;
  };

  try {
    await page.addInitScript(installReachTracker);
    // Use 'load' for file: URLs — networkidle never resolves for file: protocol.
    const waitUntil = targetUrl.startsWith('file:') ? 'load' : 'networkidle';
    await page.goto(targetUrl, { waitUntil });
    startUrl = page.url();

    const stripHash = (u: string): string => u.split('#')[0] ?? u;
    const run: {
      aborted: KeyboardReachabilityCheckDetails['aborted'];
      navigatedTo: string | null;
    } = { aborted: null, navigatedTo: null };
    page.on('framenavigated', (frame) => {
      if (
        frame === page.mainFrame() &&
        run.navigatedTo === null &&
        stripHash(frame.url()) !== stripHash(startUrl)
      ) {
        run.navigatedTo = frame.url();
      }
    });
    const abortNavigation = (): void => {
      run.aborted ??= {
        reason: 'navigation',
        url: run.navigatedTo ?? page.url(),
      };
    };
    const startedAt = Date.now();
    const timedOut = (): boolean => {
      if (Date.now() - startedAt <= KEYBOARD_REACHABILITY_TIMEOUT_MS) {
        return false;
      }
      run.aborted ??= { reason: 'timeout', url: page.url() };
      return true;
    };

    /**
     * Call a tracker method. A destroyed execution context means a key press
     * replaced the document: record the abort and return null.
     */
    const inPage = async <R>(
      method: InPageMethod,
      arg: unknown = null,
    ): Promise<R | null> => {
      try {
        return (await page.evaluate(
          ({ method, arg }: { method: InPageMethod; arg: unknown }) =>
            (
              window as unknown as {
                __a11yReach: Record<InPageMethod, (a: unknown) => unknown>;
              }
            ).__a11yReach[method](arg),
          { method, arg },
        )) as R;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Only Playwright's document-replacement errors count as navigation;
        // anything else is a real failure and must surface.
        if (
          run.navigatedTo !== null ||
          /Execution context was destroyed|Frame was detached/i.test(message)
        ) {
          abortNavigation();
          return null;
        }
        throw err;
      }
    };

    // ------------------------------------------------------------------
    // 1. Enumerate operable elements (once)
    // ------------------------------------------------------------------
    const enumerateArgs: EnumerateArgs = {
      nativeSelector: KEYBOARD_REACHABILITY_NATIVE_SELECTOR,
      operableRoles: [...KEYBOARD_REACHABILITY_OPERABLE_ROLES],
      compositeRoles: [...KEYBOARD_REACHABILITY_COMPOSITE_ROLES],
      unsupportedRoles: [...KEYBOARD_REACHABILITY_UNSUPPORTED_COMPOSITE_ROLES],
      focusableSelector: FOCUSABLE_SELECTOR,
      maxLen: HTML_SNIPPET_MAX_LENGTH,
    };
    const enumeration = await inPage<Enumeration>('enumerate', enumerateArgs);
    if (!enumeration) {
      throw new Error(
        '[keyboard-reachability-check] page navigated away before elements could be enumerated',
      );
    }
    const { docId, elements } = enumeration;

    const reachedBy = new Map<number, ReachedMethod>();
    const entered = new Set<number>();

    /** Copy in-page records to Node after every key (they die with the document). */
    const sync = async (): Promise<SyncResult | null> => {
      if (run.navigatedTo !== null) {
        abortNavigation();
        return null;
      }
      const r = await inPage<SyncResult>('sync');
      if (!r) return null;
      if (r.docId !== docId || run.navigatedTo !== null) {
        abortNavigation();
        return null;
      }
      for (const [id, method] of r.reached) {
        if (!reachedBy.has(id)) reachedBy.set(id, method);
      }
      for (const ci of r.entries) entered.add(ci);
      return r;
    };
    const settle = async (): Promise<void> => {
      if (walkSettleMs > 0) await page.waitForTimeout(walkSettleMs);
    };

    const composites: KeyboardReachabilityComposite[] =
      enumeration.composites.map((c) => ({
        selector: c.selector,
        role: c.role,
        orientation: c.orientation,
        keysPressed: 0,
        status: 'not-explored',
        stopReason: null,
      }));

    if (elements.length === 0) {
      return await finish({
        totalOperableElements: 0,
        reachedCount: 0,
        unreachableCount: 0,
        notEvaluatedCount: 0,
        excluded: enumeration.excluded,
        elements: [],
        composites,
        tabWalkCapped: false,
        aborted: null,
        screenshotPath: '',
      });
    }

    // ------------------------------------------------------------------
    // 2. Tab walk
    // ------------------------------------------------------------------
    const wanted = enumeration.focusableCount + KEYBOARD_REACHABILITY_TAB_SLACK;
    const pressN = Math.min(wanted, KEYBOARD_REACHABILITY_MAX_TAB_PRESSES);
    const tabWalkCapped = wanted > KEYBOARD_REACHABILITY_MAX_TAB_PRESSES;
    if (tabWalkCapped) {
      out.warn(
        `[keyboard-reachability-check] Tab walk capped at ${KEYBOARD_REACHABILITY_MAX_TAB_PRESSES} ` +
          `presses (page has ${enumeration.focusableCount} focusable elements). ` +
          'Composites late in the tab order are reported as not evaluated.',
      );
    }

    await inPage('setPhase', 'tab');
    let firstActive: number | null = null;
    for (let i = 0; i < pressN && !run.aborted; i++) {
      if (timedOut()) break;
      await page.keyboard.press('Tab');
      await settle();
      const r = await sync();
      if (!r) break;
      if (firstActive === null) firstActive = r.active;
      else if (r.active === firstActive) break; // cycled once
    }
    const abortedDuringTab = run.aborted !== null;

    // ------------------------------------------------------------------
    // 3. Arrow keys inside each entered composite
    // ------------------------------------------------------------------
    let totalArrows = 0;
    for (const [ci, meta] of enumeration.composites.entries()) {
      const comp = composites[ci]!;
      if (!meta.supported) {
        comp.stopReason = 'unsupported-role';
        continue;
      }
      if (!entered.has(ci)) {
        comp.stopReason = tabWalkCapped ? 'tab-walk-capped' : 'no-entry';
        continue;
      }
      if (run.aborted) {
        comp.stopReason = 'aborted';
        continue;
      }
      if (totalArrows >= KEYBOARD_REACHABILITY_MAX_ARROW_PRESSES_TOTAL) {
        comp.stopReason = 'arrow-budget-exhausted';
        continue;
      }

      // A late reload lands a fresh tracker with no entries: check the
      // document before trusting a failed restore.
      const restored = await inPage<{ docId: string; ok: boolean }>(
        'restore',
        ci,
      );
      if (!restored || restored.docId !== docId || run.navigatedTo !== null) {
        abortNavigation();
        comp.stopReason = 'aborted';
        continue;
      }
      if (!restored.ok) {
        comp.status = 'stopped';
        comp.stopReason = 'entry-restore-failed';
        continue;
      }

      const itemCount = elements.filter((e) => e.compositeId === ci).length;
      // Sweep both ways so items before a mid-widget entry are found even
      // when the widget does not wrap.
      const sweepKeys =
        meta.orientation === 'horizontal'
          ? ['ArrowRight', 'ArrowLeft']
          : ['ArrowDown', 'ArrowUp'];
      let stop: string | null = null;
      sweeps: for (const key of sweepKeys) {
        const seen = new Set<string>();
        for (let i = 0; i <= itemCount; i++) {
          // Guards run BEFORE each press: never press arrows on a value control.
          const g = await inPage<GuardResult>('guard', ci);
          if (!g || g.docId !== docId || run.navigatedTo !== null) {
            abortNavigation();
            stop = 'aborted';
            break sweeps;
          }
          if (!g.inside) {
            stop = 'left-composite';
            break sweeps;
          }
          if (g.valueControl) {
            stop = 'value-control';
            break sweeps;
          }
          if (seen.has(g.state)) break; // reached the end (or wrapped)
          seen.add(g.state);
          if (timedOut()) {
            stop = 'aborted';
            break sweeps;
          }
          if (
            totalArrows >= KEYBOARD_REACHABILITY_MAX_ARROW_PRESSES_TOTAL ||
            comp.keysPressed >=
              KEYBOARD_REACHABILITY_MAX_ARROW_PRESSES_PER_COMPOSITE
          ) {
            stop = 'press-cap';
            break sweeps;
          }
          await page.keyboard.press(key);
          comp.keysPressed++;
          totalArrows++;
          await settle();
          const r = await sync();
          if (!r) {
            stop = 'aborted';
            break sweeps;
          }
          if (r.mutations > KEYBOARD_REACHABILITY_MAX_DOM_MUTATIONS) {
            stop = 'dom-churn';
            break sweeps;
          }
        }
      }
      comp.status = stop === null ? 'explored' : 'stopped';
      comp.stopReason = stop;
      if (!run.aborted) await inPage('setPhase', 'idle');
    }

    // ------------------------------------------------------------------
    // 4. Classify
    // ------------------------------------------------------------------
    const notEvaluated = (
      reason: string,
    ): Pick<
      KeyboardReachabilityElement,
      'reachedBy' | 'reason' | 'confidence'
    > => ({
      reachedBy: 'not-evaluated',
      reason,
      confidence: null,
    });
    const unreachable = (
      reason: string,
      confidence: 'high' | 'medium' | 'low',
    ): Pick<
      KeyboardReachabilityElement,
      'reachedBy' | 'reason' | 'confidence'
    > => ({
      reachedBy: 'unreachable',
      reason,
      confidence,
    });

    const classify = (
      el: EnumeratedElement,
    ): Pick<
      KeyboardReachabilityElement,
      'reachedBy' | 'reason' | 'confidence'
    > => {
      const method = reachedBy.get(el.id);
      if (method) return { reachedBy: method, reason: null, confidence: null };
      if (abortedDuringTab) return notEvaluated('exploration-aborted');

      // Inside a composite: activedescendant items are unfocusable by design,
      // so only the exploration outcome decides.
      if (el.compositeId !== null) {
        const meta = enumeration.composites[el.compositeId]!;
        const comp = composites[el.compositeId]!;
        if (!meta.supported) return notEvaluated('composite-not-supported');
        if (!entered.has(el.compositeId)) {
          return tabWalkCapped
            ? notEvaluated('tab-walk-capped')
            : unreachable('composite-without-entry', 'high');
        }
        if (comp.stopReason === 'aborted') {
          return notEvaluated('exploration-aborted');
        }
        if (comp.stopReason === 'arrow-budget-exhausted') {
          return notEvaluated('arrow-budget-exhausted');
        }
        if (comp.status === 'explored') {
          return unreachable('composite-item-not-reached', 'medium');
        }
        return unreachable('composite-exploration-stopped', 'low');
      }

      if (el.evidence === 'onclick' && !el.focusable) {
        return unreachable('onclick-not-focusable', 'high');
      }
      if (el.evidence === 'role' && !el.focusable) {
        return unreachable('role-not-focusable', 'high');
      }
      if (el.tabindex !== null && Number(el.tabindex) < 0) {
        return unreachable('tabindex-negative-outside-composite', 'high');
      }
      if (el.evidence === 'click-listener' && !el.focusable) {
        return unreachable('click-listener-not-focusable', 'medium');
      }
      return unreachable('focusable-but-not-reached', 'low');
    };

    const outElements: KeyboardReachabilityElement[] = elements.map((el) => ({
      selector: el.selector,
      tag: el.tag,
      role: el.role,
      name: el.name,
      html: el.html,
      htmlTruncated: el.htmlTruncated,
      tabindex: el.tabindex,
      evidence: el.evidence,
      compositeSelector:
        el.compositeId === null
          ? null
          : enumeration.composites[el.compositeId]!.selector,
      ...classify(el),
    }));

    const count = (m: KeyboardReachabilityElement['reachedBy']): number =>
      outElements.filter((e) => e.reachedBy === m).length;
    const unreachableCount = count('unreachable');
    const notEvaluatedCount = count('not-evaluated');

    return await finish({
      totalOperableElements: outElements.length,
      reachedCount: outElements.length - unreachableCount - notEvaluatedCount,
      unreachableCount,
      notEvaluatedCount,
      excluded: enumeration.excluded,
      elements: outElements,
      composites,
      tabWalkCapped,
      aborted: run.aborted,
      screenshotPath: '',
    });
  } finally {
    await context.close();
  }
}
