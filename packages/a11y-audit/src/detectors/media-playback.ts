/**
 * Media playback measurement for auto-playing audio.
 * WCAG 1.4.2 (Audio Control)
 *
 * `sampleMediaPlayback` records, in each frame, whether every <audio>/<video>
 * is playing with sound; the runner calls it with each screenshot (every
 * ~2s). `measureMediaPlayback` takes a last sample and reads each element's
 * state, location and the seconds it was heard between samples.
 *
 * Limits:
 * - Sampling starts when the check starts. The caller navigates the page
 *   before that, so sound heard before the first sample is not counted.
 *   Sound that starts near the last sample is heard for less than 3 seconds;
 *   the normalizer also flags media still audible at the last sample with
 *   more than 3 seconds left (or loop / endless) to cover it.
 * - Controls are matched by name only and are not clicked; controls in a
 *   parent frame or elsewhere on the page are not searched.
 * - Visibility does not consider clipping, overflow or off-screen position.
 */

import type { Frame, Page } from '@playwright/test';
import type { MediaPlaybackRecord } from '../types.js';
import {
  AUDIO_CONTROL_KEYWORDS,
  HTML_SNIPPET_MAX_LENGTH,
} from '../constants.js';
import { detectPauseControls } from './pause-control.js';

/** Window property holding each media element's samples. */
const SAMPLES_KEY = '__a11yAuditMediaSamples';

/**
 * Runs in the browser: append one sample per media element. Self-contained so
 * Playwright can serialize it.
 */
function recordSamples(elements: Element[], key: string): void {
  type Sample = { time: number; audible: boolean };
  const store = ((window as unknown as Record<string, unknown>)[key] ??=
    new WeakMap<Element, Sample[]>()) as WeakMap<Element, Sample[]>;
  const time = performance.now();
  for (const el of elements) {
    if (!(el instanceof HTMLMediaElement)) continue;
    const samples = store.get(el) ?? [];
    samples.push({
      time,
      audible: !el.paused && !el.ended && !el.muted && el.volume > 0,
    });
    store.set(el, samples);
  }
}

/**
 * Runs in the browser: where an element is, whether it is visible, and its
 * playback state when it is a media element. Self-contained so Playwright can
 * serialize it.
 */
function inspectElement(
  el: Element,
  args: { htmlMaxLength: number; samplesKey: string },
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

  const rect = el.getBoundingClientRect();
  const visible =
    typeof el.checkVisibility === 'function'
      ? rect.width > 0 &&
        rect.height > 0 &&
        el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      : null;

  const outerHtml = el.outerHTML;
  const location = {
    selector: getSelector(el),
    shadowHosts,
    visible,
    html: outerHtml.slice(0, args.htmlMaxLength),
    htmlTruncated: outerHtml.length > args.htmlMaxLength,
  };
  if (!(el instanceof HTMLMediaElement)) return { ...location, media: null };

  const store = (window as unknown as Record<string, unknown>)[
    args.samplesKey
  ] as WeakMap<Element, Array<{ time: number; audible: boolean }>> | undefined;
  const samples = store?.get(el) ?? [];
  let audibleSeconds = 0;
  for (let i = 1; i < samples.length; i++) {
    const before = samples[i - 1];
    const after = samples[i];
    if (before?.audible && after?.audible) {
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
        samplesKey: SAMPLES_KEY,
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
 * Record one sample for every media element in the page and its frames
 * (open shadow roots included). Frames that cannot be read are skipped here;
 * `measureMediaPlayback` reports them.
 */
export async function sampleMediaPlayback(page: Page): Promise<void> {
  await Promise.all(
    page.frames().map((frame) =>
      frame
        .locator('audio, video')
        .evaluateAll(recordSamples, SAMPLES_KEY)
        .catch(() => undefined),
    ),
  );
}

async function measureFrame(
  page: Page,
  frame: Frame,
): Promise<MediaPlaybackRecord[]> {
  const handles = await frame.locator('audio, video').elementHandles();
  if (handles.length === 0) return [];

  const isMain = frame === page.mainFrame();
  const chain = isMain ? { path: [], visible: true } : await framePathOf(frame);
  const location = isMain
    ? null
    : { url: frame.url(), selector: chain?.path.at(-1) ?? null };
  // Controls in a parent frame or elsewhere in the page are not searched.
  const { controls } = await detectPauseControls(frame, AUDIO_CONTROL_KEYWORDS);

  const records: MediaPlaybackRecord[] = [];
  for (const handle of handles) {
    const { media, visible, ...element } = await handle.evaluate(
      inspectElement,
      { htmlMaxLength: HTML_SNIPPET_MAX_LENGTH, samplesKey: SAMPLES_KEY },
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

/**
 * Take a last sample, then read the playback state of every media element in
 * the page and its frames. A child frame that cannot be read (detached or
 * navigating) is counted in `unmeasuredFrames`; a main-frame failure is
 * thrown.
 */
export async function measureMediaPlayback(page: Page): Promise<{
  mediaElements: MediaPlaybackRecord[];
  unmeasuredFrames: number;
}> {
  await sampleMediaPlayback(page);
  const mediaElements: MediaPlaybackRecord[] = [];
  let unmeasuredFrames = 0;
  for (const frame of page.frames()) {
    try {
      mediaElements.push(...(await measureFrame(page, frame)));
    } catch (err) {
      if (frame === page.mainFrame()) throw err;
      unmeasuredFrames++;
    }
  }
  return { mediaElements, unmeasuredFrames };
}
