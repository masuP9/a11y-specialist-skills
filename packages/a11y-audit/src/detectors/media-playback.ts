/**
 * Media playback measurement for auto-playing audio.
 * WCAG 1.4.2 (Audio Control)
 *
 * Reads the playback state of every <audio>/<video> in the page and its
 * frames (open shadow roots included) and looks for pause/stop/mute/volume
 * controls in the same frame. Controls are matched by name only: they are
 * not clicked, so whether they actually stop the audio is left to review.
 */

import type { Frame, Page } from '@playwright/test';
import type { MediaPlaybackRecord } from '../types.js';
import {
  AUDIO_CONTROL_KEYWORDS,
  HTML_SNIPPET_MAX_LENGTH,
} from '../constants.js';
import { detectPauseControls } from './pause-control.js';

/**
 * Runs in the browser: where an element is, plus its playback state when it
 * is a media element. Self-contained so Playwright can serialize it.
 */
function inspectElement(el: Element, htmlMaxLength: number) {
  const cssPath = (node: Element): string => {
    const parts: string[] = [];
    let current: Element | null = node;
    while (current) {
      if (current.id) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      const tag = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      const sameTag = Array.from(parent.children).filter(
        (child) => child.tagName === current?.tagName,
      );
      parts.unshift(
        sameTag.length > 1
          ? `${tag}:nth-of-type(${sameTag.indexOf(current) + 1})`
          : tag,
      );
      current = parent;
    }
    return parts.join(' > ');
  };

  const shadowHosts: string[] = [];
  let root = el.getRootNode();
  while (root instanceof ShadowRoot) {
    shadowHosts.unshift(cssPath(root.host));
    root = root.host.getRootNode();
  }
  const outerHtml = el.outerHTML;
  const location = {
    selector: cssPath(el),
    shadowHosts,
    html: outerHtml.slice(0, htmlMaxLength),
    htmlTruncated: outerHtml.length > htmlMaxLength,
  };
  if (!(el instanceof HTMLMediaElement)) return { ...location, media: null };

  const rect = el.getBoundingClientRect();
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
      autoplay: el.autoplay,
      loop: el.loop,
      controls: el.controls,
      visible:
        rect.width > 0 &&
        rect.height > 0 &&
        getComputedStyle(el).visibility !== 'hidden',
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

/**
 * The iframe element's selector in its parent document. Read from the parent
 * side, so it works for cross-origin frames too. Only the innermost iframe is
 * recorded; for nested frames the outer iframes are not part of the target.
 */
async function frameSelector(frame: Frame): Promise<string | null> {
  try {
    const handle = await frame.frameElement();
    return (await handle.evaluate(inspectElement, 0)).selector;
  } catch {
    return null;
  }
}

async function measureFrame(
  page: Page,
  frame: Frame,
): Promise<MediaPlaybackRecord[]> {
  const handles = await frame.locator('audio, video').elementHandles();
  if (handles.length === 0) return [];

  const location =
    frame === page.mainFrame()
      ? null
      : { url: frame.url(), selector: await frameSelector(frame) };
  // Controls in a parent frame or elsewhere in the page are not searched.
  const { controls } = await detectPauseControls(frame, AUDIO_CONTROL_KEYWORDS);

  const records: MediaPlaybackRecord[] = [];
  for (const handle of handles) {
    const { media, ...element } = await handle.evaluate(
      inspectElement,
      HTML_SNIPPET_MAX_LENGTH,
    );
    if (!media) continue;
    records.push({
      ...element,
      ...media,
      frame: location,
      controlsInFrame: controls,
    });
  }
  return records;
}

/**
 * Read the playback state of every media element in the page and its frames.
 * A child frame that cannot be read (detached or navigating) is counted in
 * `unmeasuredFrames`; a main-frame failure is thrown.
 */
export async function measureMediaPlayback(page: Page): Promise<{
  mediaElements: MediaPlaybackRecord[];
  unmeasuredFrames: number;
}> {
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
