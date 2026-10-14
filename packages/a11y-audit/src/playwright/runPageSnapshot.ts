/**
 * Page Snapshot — material only, no verdict
 *
 * Writes what an agent needs to judge criteria that the other checks do not:
 * the body's aria snapshot (landmarks and headings for 2.4.1), the document
 * title (2.4.2), the `lang` of `<html>` (3.1.1), and the URLs — one file per
 * page, so several pages can be compared for 3.2.3 / 3.2.4 / 3.2.6.
 *
 * The snapshot strings are Playwright's `ariaSnapshot()` output, unmodified
 * and never truncated (cutting one would break the last line for parsers).
 * Open shadow roots are included by Playwright; iframes appear only as a
 * `- iframe` line, so each frame's own snapshot is listed in `frames` (see
 * `PageSnapshotFrame` for how the two line up).
 *
 * Every bucket stays empty and the summary counts are 0, so this check never
 * changes the CLI exit code.
 */

import type { Frame, Page } from '@playwright/test';
import type {
  PageSnapshotDetails,
  PageSnapshotFrame,
  PageSnapshotResult,
} from '../types.js';
import {
  DEFAULT_PAGE_SNAPSHOT_RESULT_FILE,
  PAGE_SNAPSHOT_FRAME_TIMEOUT_MS,
} from '../constants.js';
import { buildAuditResult } from '../utils/axe-format.js';
import {
  createAuditOutput,
  type AuditOutputOptions,
} from '../utils/test-harness.js';
import { gotoAndSettle } from './gotoAndSettle.js';

export interface RunPageSnapshotOptions extends AuditOutputOptions {
  /** The page to snapshot. Navigated to `targetUrl` first when it is given. */
  page: Page;
  /**
   * URL to open before taking the snapshot; recorded as `requestedUrl`. Omit
   * it to snapshot the page as it is (`requestedUrl` is then null).
   */
  targetUrl?: string;
}

/**
 * Take the page snapshot, write the result JSON, and return the result.
 */
export async function runPageSnapshot(
  options: RunPageSnapshotOptions,
): Promise<PageSnapshotResult> {
  const { page, targetUrl, ...location } = options;
  const out = createAuditOutput({
    ...location,
    defaultFile: DEFAULT_PAGE_SNAPSHOT_RESULT_FILE,
  });

  if (targetUrl !== undefined) {
    await gotoAndSettle(page, targetUrl);
  }

  const snapshot = await page.locator('body').ariaSnapshot();
  const { lang, viewport } = await page.evaluate(() => ({
    lang: document.documentElement.getAttribute('lang'),
    viewport: { width: window.innerWidth, height: window.innerHeight },
  }));
  const frames: PageSnapshotFrame[] = [];
  await collectFrames(page.mainFrame(), null, frames);

  const details: PageSnapshotDetails = {
    requestedUrl: targetUrl ?? null,
    finalUrl: page.url(),
    title: await page.title(),
    lang,
    viewport,
    snapshot,
    snapshotLength: snapshot.length,
    frames,
  };

  const result: PageSnapshotResult = buildAuditResult({
    source: 'page-snapshot',
    url: details.finalUrl,
    details,
    buckets: { violations: [], incomplete: [], passes: [], inapplicable: [] },
  });

  out.header('Page Snapshot', 'material only, no verdict', result.url);
  out.summary({
    Title: details.title,
    Lang: details.lang === null ? '(none)' : JSON.stringify(details.lang),
    Viewport: `${viewport.width}x${viewport.height}`,
    'Snapshot length': details.snapshotLength,
    Frames: frames.length,
    'Unreadable frames': frames.filter((f) => f.snapshot === null).length,
  });
  out.save(result);
  out.outputPaths();

  return result;
}

/**
 * Append the iframes of `frame` that its snapshot shows as `- iframe` lines,
 * in the snapshot's order, each followed by its own iframes (depth first).
 */
async function collectFrames(
  frame: Frame,
  parentIndex: number | null,
  out: PageSnapshotFrame[],
): Promise<void> {
  const iframes = frame.locator('iframe');
  // A CSS locator lists the light DOM before open shadow roots, but the
  // snapshot walks the composed tree. Rank each iframe by that walk instead.
  const ranks = await iframes.evaluateAll((elements) => {
    const order: Element[] = [];
    const walk = (node: Node): void => {
      let children: ArrayLike<Node> = node.childNodes;
      if (node instanceof Element && node.shadowRoot) {
        children = node.shadowRoot.childNodes;
      } else if (node instanceof HTMLSlotElement) {
        const assigned = node.assignedNodes();
        if (assigned.length > 0) children = assigned;
      }
      for (const child of Array.from(children)) {
        if (!(child instanceof Element)) continue;
        if (child.localName === 'iframe') order.push(child);
        walk(child);
      }
    };
    walk(document);
    return elements.map((el) => order.indexOf(el));
  });
  const inOrder = ranks
    .map((rank, nth) => ({ rank, nth }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank);

  for (const { nth } of inOrder) {
    const iframe = iframes.nth(nth);
    const timeout = PAGE_SNAPSHOT_FRAME_TIMEOUT_MS;
    // Playwright's own visibility rules decide whether the iframe is a
    // `- iframe` line (display:none and aria-hidden are not; size 0 is).
    // An iframe removed meanwhile counts as not shown.
    const line = await iframe.ariaSnapshot({ timeout }).catch(() => '');
    if (line === '') continue;

    const title = await iframe
      .getAttribute('title', { timeout })
      .catch(() => null);
    const handle = await iframe.elementHandle({ timeout }).catch(() => null);
    const child = handle ? await handle.contentFrame() : null;
    const src = handle
      ? await handle.evaluate((el) => (el as HTMLIFrameElement).src)
      : '';
    await handle?.dispose();

    const entry: PageSnapshotFrame = {
      index: out.length,
      parentIndex,
      title,
      url: child ? child.url() : src,
      snapshot: null,
      error: null,
    };
    out.push(entry);
    if (!child) {
      entry.error = 'The iframe has no frame to read.';
      continue;
    }
    try {
      entry.snapshot = await child.locator('body').ariaSnapshot({ timeout });
    } catch (err) {
      entry.error = err instanceof Error ? err.message : String(err);
      continue;
    }
    await collectFrames(child, entry.index, out);
  }
}
