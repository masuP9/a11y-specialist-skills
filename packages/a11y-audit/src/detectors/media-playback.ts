/**
 * Media playback measurement for auto-playing audio.
 * WCAG 1.4.2 (Audio Control)
 *
 * `createMediaTracker(page)` starts one check's recording. Its `sample()`
 * records, in each frame, whether every <audio>/<video> is playing with sound
 * and attaches play / pause / ended / volumechange / ratechange listeners
 * that record each change; the runner calls it with each screenshot (every
 * ~2s). The first sample also starts a MutationObserver on each frame's
 * document and open shadow roots, so media added later is recorded from the
 * moment it is added. `measure()` takes a last sample and reads each
 * element's state, location and the seconds it was heard, including media
 * removed during the check. Each tracker has its own id, so a second check
 * on the same page starts a fresh history.
 *
 * Limits:
 * - Recording starts when the check starts. The caller navigates the page
 *   before that, so sound heard before the first sample is not counted.
 *   Sound that starts near the last sample is heard for less than 3 seconds;
 *   the normalizer also flags media still audible at the last sample that
 *   will keep playing for more than 3 seconds to cover it.
 * - Frames are observed from their first sample; media in a frame created
 *   during the check is recorded from the next sample. A shadow root
 *   attached to an element already in the page is not observed. Media in a
 *   frame (document) removed or replaced during the check is reported from
 *   its last record, so sound after that record is not counted, and media
 *   that appears and goes away between two samples is not seen.
 * - Controls are matched by name only and are not clicked; controls in a
 *   parent frame or elsewhere on the page are not searched.
 * - Visibility follows rendered ancestors (assigned slots first). It is
 *   false when an ancestor with overflow hidden / clip does not overlap the
 *   element within its padding box, and undetermined (null) under
 *   clip-path / clip, or when the non-overlapping ancestor scrolls, a fixed /
 *   absolute box may escape it, or a transform makes the padding box
 *   unplaceable. Partial clipping and off-screen position are not
 *   considered.
 */

import { randomUUID } from 'node:crypto';
import type { Frame, Page } from '@playwright/test';
import type { MediaPlaybackRecord } from '../types.js';
import {
  AUDIO_CONTROL_KEYWORDS,
  HTML_SNIPPET_MAX_LENGTH,
} from '../constants.js';
import { detectPauseControls } from './pause-control.js';

/** Window property holding the current check's playback history. */
const HISTORY_KEY = '__a11yAuditMediaHistory';

interface HistoryArgs {
  key: string;
  runId: string;
}

/**
 * Runs in the browser: record the current state of each media element.
 * The first call of a check (a new `runId`) discards the previous check's
 * history, listeners and observer, and starts a MutationObserver on the
 * document and its open shadow roots so media added later is recorded from
 * the moment it is added. Each recorded element gets play / pause / ended /
 * volumechange / ratechange listeners and stays in `tracked` even if it is
 * removed. Self-contained so Playwright can serialize it.
 */
function recordSamples(elements: Element[], args: HistoryArgs): void {
  type Point = { time: number; audible: boolean };
  type History = {
    runId: string;
    /** Identifies this document, so Node can tell records of a replaced one. */
    docId: string;
    points: WeakMap<Element, Point[]>;
    ids: WeakMap<Element, number>;
    tracked: Set<HTMLMediaElement>;
    cleanups: Array<() => void>;
  };
  const isAudible = (media: HTMLMediaElement) =>
    !media.paused &&
    !media.ended &&
    !media.muted &&
    media.volume > 0 &&
    media.playbackRate > 0;
  const events = ['play', 'pause', 'ended', 'volumechange', 'ratechange'];

  const win = window as unknown as Record<string, History | undefined>;
  const previous = win[args.key];
  let history: History;
  if (previous?.runId === args.runId) {
    history = previous;
  } else {
    previous?.cleanups.forEach((cleanup) => cleanup());
    history = {
      runId: args.runId,
      docId: `${performance.timeOrigin}-${Math.random()}`,
      points: new WeakMap(),
      ids: new WeakMap(),
      tracked: new Set(),
      cleanups: [],
    };
    win[args.key] = history;
  }
  const current = history;

  const track = (el: HTMLMediaElement, time: number) => {
    if (current.points.has(el)) return;
    const list: Point[] = [{ time, audible: isAudible(el) }];
    current.points.set(el, list);
    current.ids.set(el, current.tracked.size);
    current.tracked.add(el);
    const onChange = () =>
      list.push({ time: performance.now(), audible: isAudible(el) });
    for (const type of events) el.addEventListener(type, onChange);
    current.cleanups.push(() => {
      for (const type of events) el.removeEventListener(type, onChange);
    });
  };

  if (previous !== current) {
    // Media and open shadow roots in (and including) a subtree.
    const scan = (
      node: Node,
      media: HTMLMediaElement[],
      roots: ShadowRoot[],
    ): void => {
      if (node instanceof HTMLMediaElement) media.push(node);
      if (node instanceof Element && node.shadowRoot) {
        roots.push(node.shadowRoot);
        scan(node.shadowRoot, media, roots);
      }
      for (const child of node.childNodes) scan(child, media, roots);
    };
    const observer = new MutationObserver((mutations) => {
      const time = performance.now();
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          const media: HTMLMediaElement[] = [];
          const roots: ShadowRoot[] = [];
          scan(node, media, roots);
          for (const el of media) track(el, time);
          for (const root of roots) observe(root);
        }
      }
    });
    const observe = (root: Document | ShadowRoot) =>
      observer.observe(root, { childList: true, subtree: true });
    const roots: ShadowRoot[] = [];
    scan(document, [], roots);
    observe(document);
    for (const root of roots) observe(root);
    current.cleanups.push(() => observer.disconnect());
  }

  const time = performance.now();
  for (const el of elements) {
    if (!(el instanceof HTMLMediaElement)) continue;
    const points = current.points.get(el);
    if (points) points.push({ time, audible: isAudible(el) });
    else track(el, time);
  }
}

/**
 * Runs in the browser: media recorded in this check that is no longer in
 * its document. Self-contained so Playwright can serialize it.
 */
function removedMedia(args: HistoryArgs): HTMLMediaElement[] {
  const history = (
    window as unknown as Record<
      string,
      { runId: string; tracked: Set<HTMLMediaElement> } | undefined
    >
  )[args.key];
  if (history?.runId !== args.runId) return [];
  return [...history.tracked].filter((el) => !el.isConnected);
}

/**
 * Runs in the browser: where an element is, whether it is visible, and its
 * playback state when it is a media element. Self-contained so Playwright can
 * serialize it.
 */
function inspectElement(
  el: Element,
  args: { htmlMaxLength: number; history: HistoryArgs },
) {
  // Same rules as focus-indicator's getSelector: relative to the document or
  // the shadow root that contains the element.
  const getSelector = (node: Element): string => {
    if (node.id) return `#${CSS.escape(node.id)}`;
    const tag = node.tagName.toLowerCase();
    const parent = node.parentElement;
    // A shadow root's top-level children have no parent element
    const container =
      parent ??
      (node.parentNode instanceof ShadowRoot ? node.parentNode : null);
    if (!container) return tag;
    const siblings = [...container.children].filter(
      (c) => c.tagName === node.tagName,
    );
    const own =
      siblings.length === 1
        ? tag
        : `${tag}:nth-of-type(${siblings.indexOf(node) + 1})`;
    return parent ? `${getSelector(parent)} > ${own}` : own;
  };

  const shadowHosts: string[] = [];
  let root = el.getRootNode();
  while (root instanceof ShadowRoot) {
    shadowHosts.unshift(getSelector(root.host));
    root = root.host.getRootNode();
  }

  // Walk the rendered ancestors: a slotted element is drawn inside its slot,
  // so follow assignedSlot before the DOM parent, and cross shadow roots.
  const renderedParent = (node: Element): Element | null =>
    node.assignedSlot ??
    node.parentElement ??
    (node.parentNode instanceof ShadowRoot ? node.parentNode.host : null);

  const rect = el.getBoundingClientRect();
  // clip-path / clip can cut an element away while it still passes
  // checkVisibility. How much is cut is not measured, so any clip on the
  // element or a rendered ancestor leaves it undetermined.
  let clipped = false;
  // An ancestor whose overflow is not visible hides the element when the
  // element does not overlap the ancestor's padding box (overflow clips
  // there, inside the border): certainly for hidden / clip, but a scroll
  // container can be scrolled to it, a fixed / absolute box may escape the
  // ancestor, and under a transform the padding box cannot be placed from
  // clientLeft / clientWidth (they ignore transforms), so those cases stay
  // undetermined.
  let overflowHidden = false;
  let overflowUnknown = false;
  let escapes = false;
  let transformed = false;
  for (let node: Element | null = el; node; node = renderedParent(node)) {
    const style = getComputedStyle(node);
    if (
      [style.transform, style.scale, style.rotate, style.translate].some(
        (v) => v && v !== 'none',
      )
    ) {
      transformed = true;
    }
  }
  for (let node: Element | null = el; node; node = renderedParent(node)) {
    const style = getComputedStyle(node);
    if (style.clipPath !== 'none' || style.clip !== 'auto') clipped = true;
    if (
      node !== el &&
      [style.overflowX, style.overflowY].some((v) => v !== 'visible')
    ) {
      const box = node.getBoundingClientRect();
      const left = box.left + node.clientLeft;
      const top = box.top + node.clientTop;
      const overlaps =
        Math.min(rect.right, left + node.clientWidth) >
          Math.max(rect.left, left) &&
        Math.min(rect.bottom, top + node.clientHeight) >
          Math.max(rect.top, top);
      if (!overlaps) {
        const scrolls = [style.overflowX, style.overflowY].some(
          (v) => v === 'auto' || v === 'scroll',
        );
        if (scrolls || escapes || transformed) overflowUnknown = true;
        else overflowHidden = true;
      }
    }
    if (style.position === 'fixed' || style.position === 'absolute') {
      escapes = true;
    }
  }
  const shown =
    typeof el.checkVisibility === 'function'
      ? rect.width > 0 &&
        rect.height > 0 &&
        el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      : null;
  const visible =
    shown === false || overflowHidden
      ? false
      : clipped || overflowUnknown
        ? null
        : shown;

  const outerHtml = el.outerHTML;
  const location = {
    selector: getSelector(el),
    shadowHosts,
    visible,
    html: outerHtml.slice(0, args.htmlMaxLength),
    htmlTruncated: outerHtml.length > args.htmlMaxLength,
  };
  if (!(el instanceof HTMLMediaElement)) {
    return { ...location, key: null, media: null };
  }

  // Each recorded state lasts until the next record (a sample or a state
  // change event), so sound stopped or muted between samples still counts.
  const history = (
    window as unknown as Record<
      string,
      | {
          runId: string;
          docId: string;
          points: WeakMap<Element, Array<{ time: number; audible: boolean }>>;
          ids: WeakMap<Element, number>;
        }
      | undefined
    >
  )[args.history.key];
  const current = history?.runId === args.history.runId ? history : undefined;
  const points = current?.points.get(el) ?? [];
  const id = current?.ids.get(el);
  // Stable across samples within one document; null if never recorded.
  const key = current && id !== undefined ? `${current.docId}:${id}` : null;
  let audibleSeconds = 0;
  for (let i = 1; i < points.length; i++) {
    const before = points[i - 1];
    const after = points[i];
    if (before?.audible && after) {
      audibleSeconds += (after.time - before.time) / 1000;
    }
  }

  let playedSeconds = 0;
  for (let i = 0; i < el.played.length; i++) {
    playedSeconds += el.played.end(i) - el.played.start(i);
  }
  const decoded = (el as { webkitAudioDecodedByteCount?: number })
    .webkitAudioDecodedByteCount;
  return {
    ...location,
    key,
    media: {
      tag: el.tagName.toLowerCase() as 'audio' | 'video',
      audibleSeconds,
      autoplay: el.autoplay,
      loop: el.loop,
      controls: el.controls,
      paused: el.paused,
      ended: el.ended,
      muted: el.muted,
      volume: el.volume,
      playbackRate: el.playbackRate,
      removed: !el.isConnected,
      documentRemoved: false,
      duration: Number.isFinite(el.duration) ? el.duration : null,
      endless: el.duration === Infinity,
      currentTime: el.currentTime,
      playedSeconds,
      hasError: el.error !== null,
      audioDecodedBytes: typeof decoded === 'number' ? decoded : null,
    },
  };
}

/** Logical AND where null means "unknown" and wins over true. */
function allVisible(values: Array<boolean | null>): boolean | null {
  if (values.includes(false)) return false;
  return values.includes(null) ? null : true;
}

/**
 * The path from the top document to this frame's document, and whether every
 * iframe element on the way is visible in its parent. Read from the parent
 * side, so cross-origin frames work too. null when it could not be read.
 */
async function framePathOf(
  frame: Frame,
  history: HistoryArgs,
): Promise<{ path: string[]; visible: boolean | null } | null> {
  const path: string[] = [];
  const visibility: Array<boolean | null> = [];
  try {
    for (
      let current = frame, parent = frame.parentFrame();
      parent;
      current = parent, parent = parent.parentFrame()
    ) {
      const handle = await current.frameElement();
      const info = await handle.evaluate(inspectElement, {
        htmlMaxLength: 0,
        history,
      });
      path.unshift(...info.shadowHosts, info.selector);
      visibility.push(info.visible);
    }
  } catch {
    return null;
  }
  return { path, visible: allVisible(visibility) };
}

/**
 * Record the state of every media element in the page and its frames (open
 * shadow roots included). Frames that cannot be read are skipped here;
 * `measure` reports them.
 */
async function sampleAll(page: Page, history: HistoryArgs): Promise<void> {
  await Promise.all(
    page.frames().map((frame) =>
      frame
        .locator('audio, video')
        .evaluateAll(recordSamples, history)
        .catch(() => undefined),
    ),
  );
}

interface KeyedRecord {
  /** `<document id>:<element id>`, null for media never recorded. */
  key: string | null;
  record: MediaPlaybackRecord;
}

async function measureFrame(
  page: Page,
  frame: Frame,
  history: HistoryArgs,
): Promise<KeyedRecord[]> {
  const connected = await frame.locator('audio, video').elementHandles();
  // Media recorded during the check but removed since is reported too.
  const removedList = await frame.evaluateHandle(removedMedia, history);
  const removed = [...(await removedList.getProperties()).values()].flatMap(
    (property) => property.asElement() ?? [],
  );
  const handles = [...connected, ...removed];
  if (handles.length === 0) return [];

  const isMain = frame === page.mainFrame();
  const chain = isMain
    ? { path: [], visible: true }
    : await framePathOf(frame, history);
  const location = isMain
    ? null
    : { url: frame.url(), selector: chain?.path.at(-1) ?? null };
  // Controls in a parent frame or elsewhere in the page are not searched.
  const { controls } = await detectPauseControls(frame, AUDIO_CONTROL_KEYWORDS);

  const records: KeyedRecord[] = [];
  for (const handle of handles) {
    const { media, visible, key, ...element } = await handle.evaluate(
      inspectElement,
      { htmlMaxLength: HTML_SNIPPET_MAX_LENGTH, history },
    );
    if (!media) continue;
    records.push({
      key,
      record: {
        ...element,
        ...media,
        visible: allVisible([visible, chain ? chain.visible : null]),
        frame: location,
        framePath: chain?.path ?? null,
        controlsInFrame: controls,
      },
    });
  }
  return records;
}

/** The frames above `frame`, nearest first. */
function ancestorsOf(frame: Frame): Frame[] {
  const ancestors: Frame[] = [];
  for (
    let parent = frame.parentFrame();
    parent;
    parent = parent.parentFrame()
  ) {
    ancestors.push(parent);
  }
  return ancestors;
}

export interface MediaTracker {
  /** Record the current state (and start listening on new elements). */
  sample(): Promise<void>;
  /**
   * Take a last sample, then read the playback state of every media element
   * in the page and its frames. A child frame that cannot be read (detached
   * or navigating) is counted in `unmeasuredFrames`; a main-frame failure is
   * thrown.
   */
  measure(): Promise<{
    mediaElements: MediaPlaybackRecord[];
    unmeasuredFrames: number;
  }>;
}

/**
 * Start one check's playback recording, separate from any earlier check.
 *
 * Each sample also keeps, on the Node side, the latest record of every media
 * element with the frames above it. A document that goes away during the
 * check (its iframe removed, or the frame navigated / replaced) takes its
 * in-page history with it, so `measure()` reports those elements from their
 * last record, marked `documentRemoved`, targeted at the nearest ancestor
 * document that remains. Sound between that last record and the document's
 * removal is not counted.
 */
export function createMediaTracker(page: Page): MediaTracker {
  const history: HistoryArgs = { key: HISTORY_KEY, runId: randomUUID() };
  const lastSeen = new Map<
    string,
    { record: MediaPlaybackRecord; ancestors: Frame[] }
  >();

  const remember = async (): Promise<void> => {
    for (const frame of page.frames()) {
      try {
        for (const { key, record } of await measureFrame(
          page,
          frame,
          history,
        )) {
          if (key) lastSeen.set(key, { record, ancestors: ancestorsOf(frame) });
        }
      } catch {
        // Reported by measure() if it still cannot be read then.
      }
    }
  };

  return {
    async sample() {
      await sampleAll(page, history);
      await remember();
    },
    async measure() {
      await sampleAll(page, history);
      const mediaElements: MediaPlaybackRecord[] = [];
      const measuredKeys = new Set<string>();
      let unmeasuredFrames = 0;
      for (const frame of page.frames()) {
        try {
          for (const { key, record } of await measureFrame(
            page,
            frame,
            history,
          )) {
            mediaElements.push(record);
            if (key) measuredKeys.add(key);
          }
        } catch (err) {
          if (frame === page.mainFrame()) throw err;
          unmeasuredFrames++;
        }
      }

      for (const [key, { record, ancestors }] of lastSeen) {
        if (measuredKeys.has(key)) continue;
        const parent =
          ancestors.find((frame) => !frame.isDetached()) ?? page.mainFrame();
        const framePath =
          parent === page.mainFrame()
            ? []
            : ((await framePathOf(parent, history))?.path ?? null);
        mediaElements.push({
          ...record,
          removed: true,
          documentRemoved: true,
          framePath,
        });
      }
      return { mediaElements, unmeasuredFrames };
    },
  };
}
