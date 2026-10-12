/**
 * Media playback measurement for auto-playing audio.
 * WCAG 1.4.2 (Audio Control)
 *
 * `createMediaTracker(page)` starts one check's recording. Its `sample()`
 * records, in each frame, whether every <audio>/<video> is playing with sound
 * and attaches play / pause / ended / volumechange / ratechange listeners
 * that record each change; the runner calls it with each screenshot (every
 * ~2s). `measure()` takes a last sample and reads each element's state,
 * location and the seconds it was heard. Each tracker has its own id, so a
 * second check on the same page starts a fresh history.
 *
 * Limits:
 * - Recording starts when the check starts. The caller navigates the page
 *   before that, so sound heard before the first sample is not counted.
 *   Sound that starts near the last sample is heard for less than 3 seconds;
 *   the normalizer also flags media still audible at the last sample that
 *   will keep playing for more than 3 seconds to cover it.
 * - Controls are matched by name only and are not clicked; controls in a
 *   parent frame or elsewhere on the page are not searched.
 * - Visibility is undetermined (null) under clip-path / clip; overflow
 *   clipping and off-screen position are not considered.
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
 * Runs in the browser: record the current state of each media element, and
 * start listening for state changes on elements seen for the first time in
 * this check. A different `runId` discards the previous history and removes
 * its listeners. Self-contained so Playwright can serialize it.
 */
function recordSamples(elements: Element[], args: HistoryArgs): void {
  type Point = { time: number; audible: boolean };
  type History = {
    runId: string;
    points: WeakMap<Element, Point[]>;
    cleanups: Array<() => void>;
  };
  const win = window as unknown as Record<string, History | undefined>;
  let history = win[args.key];
  if (history?.runId !== args.runId) {
    history?.cleanups.forEach((cleanup) => cleanup());
    history = { runId: args.runId, points: new WeakMap(), cleanups: [] };
    win[args.key] = history;
  }

  const isAudible = (media: HTMLMediaElement) =>
    !media.paused &&
    !media.ended &&
    !media.muted &&
    media.volume > 0 &&
    media.playbackRate > 0;
  const events = ['play', 'pause', 'ended', 'volumechange', 'ratechange'];
  const time = performance.now();
  for (const el of elements) {
    if (!(el instanceof HTMLMediaElement)) continue;
    let points = history.points.get(el);
    if (!points) {
      const list: Point[] = [];
      points = list;
      history.points.set(el, list);
      const onChange = () =>
        list.push({ time: performance.now(), audible: isAudible(el) });
      for (const type of events) el.addEventListener(type, onChange);
      history.cleanups.push(() => {
        for (const type of events) el.removeEventListener(type, onChange);
      });
    }
    points.push({ time, audible: isAudible(el) });
  }
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

  // clip-path / clip can cut an element away while it still passes
  // checkVisibility. How much is cut is not measured, so any clip on the
  // element or an ancestor (across shadow boundaries) leaves it undetermined.
  let clipped = false;
  for (
    let node: Element | null = el;
    node && !clipped;
    node =
      node.parentElement ??
      (node.parentNode instanceof ShadowRoot ? node.parentNode.host : null)
  ) {
    const style = getComputedStyle(node);
    clipped = style.clipPath !== 'none' || style.clip !== 'auto';
  }
  const rect = el.getBoundingClientRect();
  const shown =
    typeof el.checkVisibility === 'function'
      ? rect.width > 0 &&
        rect.height > 0 &&
        el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      : null;
  const visible = shown === false ? false : clipped ? null : shown;

  const outerHtml = el.outerHTML;
  const location = {
    selector: getSelector(el),
    shadowHosts,
    visible,
    html: outerHtml.slice(0, args.htmlMaxLength),
    htmlTruncated: outerHtml.length > args.htmlMaxLength,
  };
  if (!(el instanceof HTMLMediaElement)) return { ...location, media: null };

  // Each recorded state lasts until the next record (a sample or a state
  // change event), so sound stopped or muted between samples still counts.
  const history = (
    window as unknown as Record<
      string,
      | {
          runId: string;
          points: WeakMap<Element, Array<{ time: number; audible: boolean }>>;
        }
      | undefined
    >
  )[args.history.key];
  const points =
    history?.runId === args.history.runId ? (history.points.get(el) ?? []) : [];
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

async function measureFrame(
  page: Page,
  frame: Frame,
  history: HistoryArgs,
): Promise<MediaPlaybackRecord[]> {
  const handles = await frame.locator('audio, video').elementHandles();
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

  const records: MediaPlaybackRecord[] = [];
  for (const handle of handles) {
    const { media, visible, ...element } = await handle.evaluate(
      inspectElement,
      { htmlMaxLength: HTML_SNIPPET_MAX_LENGTH, history },
    );
    if (!media) continue;
    records.push({
      ...element,
      ...media,
      visible: allVisible([visible, chain ? chain.visible : null]),
      frame: location,
      framePath: chain?.path ?? null,
      controlsInFrame: controls,
    });
  }
  return records;
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

/** Start one check's playback recording, separate from any earlier check. */
export function createMediaTracker(page: Page): MediaTracker {
  const history: HistoryArgs = { key: HISTORY_KEY, runId: randomUUID() };
  return {
    sample: () => sampleAll(page, history),
    async measure() {
      await sampleAll(page, history);
      const mediaElements: MediaPlaybackRecord[] = [];
      let unmeasuredFrames = 0;
      for (const frame of page.frames()) {
        try {
          mediaElements.push(...(await measureFrame(page, frame, history)));
        } catch (err) {
          if (frame === page.mainFrame()) throw err;
          unmeasuredFrames++;
        }
      }
      return { mediaElements, unmeasuredFrames };
    },
  };
}
