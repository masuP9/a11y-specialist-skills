/**
 * Event listener inspector built on the Chrome DevTools Protocol
 * (`DOMDebugger.getEventListeners`).
 *
 * Page scripts cannot list the listeners attached to an object, but CDP can,
 * even after the page has loaded. Chromium only: `openEventListenerInspector`
 * returns null elsewhere.
 *
 * Internal module (not exported from the package entry points) until a second
 * check uses it and the shape settles.
 *
 * Notes:
 * - `Debugger.enable` is deliberately not called: it would make a `debugger;`
 *   statement in the page pause the inspection. Locations are therefore only
 *   `scriptId` + line/column.
 * - `DOM.enable` is not needed; objects are addressed through `objectId`.
 */

import type { CDPSession, Page } from '@playwright/test';
import { EVENT_LISTENER_HANDLER_PREVIEW_MAX } from '../constants.js';

/** One listener as reported by DOMDebugger.getEventListeners. */
export interface EventListenerRecord {
  type: string;
  useCapture: boolean;
  passive: boolean;
  once: boolean;
  /** V8 script id; meaningful only within the inspected page's lifetime. */
  scriptId: string;
  /** 0-based, as CDP reports them. */
  lineNumber: number;
  columnNumber: number;
  /** Start of the handler's source text (EVENT_LISTENER_HANDLER_PREVIEW_MAX chars), or null. */
  handlerPreview: string | null;
}

export interface EventListenerInspector {
  /**
   * Listeners on the object `expression` evaluates to in the main frame's main
   * world (e.g. 'window', 'document'). `types` filters by event type; omit for all.
   * Throws when the expression throws or does not evaluate to an object.
   */
  forExpression(
    expression: string,
    types?: readonly string[],
  ): Promise<EventListenerRecord[]>;
  /**
   * Same, for each item of an array-like expression (e.g. a NodeList), in index
   * order. For per-element checks.
   */
  forEach(
    expression: string,
    types?: readonly string[],
  ): Promise<EventListenerRecord[][]>;
  /**
   * Stops the script currently running on the page's main thread
   * (Runtime.terminateExecution). For checks that dispatch events into the
   * page and must recover when a handler never returns.
   */
  terminateExecution(): Promise<void>;
  /** Releases remote objects and detaches the CDP session. Safe to call twice. */
  close(): Promise<void>;
}

const GROUP = 'a11y-audit-event-listeners';

interface RemoteObject {
  objectId?: string;
  description?: string;
}

async function listenersOf(
  session: CDPSession,
  objectId: string,
  types: readonly string[] | undefined,
): Promise<EventListenerRecord[]> {
  // `objectGroup` (makes `handler` a RemoteObject) is in the protocol but
  // missing from Playwright's generated parameter type.
  const params = { objectId, objectGroup: GROUP } as { objectId: string };
  const { listeners } = await session.send(
    'DOMDebugger.getEventListeners',
    params,
  );
  return listeners
    .filter((l) => !types || types.includes(l.type))
    .map((l) => {
      const description = (l.handler as RemoteObject | undefined)?.description;
      return {
        type: l.type,
        useCapture: l.useCapture,
        passive: l.passive,
        once: l.once,
        scriptId: l.scriptId,
        lineNumber: l.lineNumber,
        columnNumber: l.columnNumber,
        handlerPreview: description
          ? description.slice(0, EVENT_LISTENER_HANDLER_PREVIEW_MAX)
          : null,
      };
    });
}

async function evaluateToObject(
  session: CDPSession,
  expression: string,
): Promise<string> {
  const { result, exceptionDetails } = await session.send('Runtime.evaluate', {
    expression,
    objectGroup: GROUP,
  });
  if (exceptionDetails) {
    throw new Error(
      `Expression threw: ${expression} (${exceptionDetails.text})`,
    );
  }
  if (!result.objectId) {
    throw new Error(`Expression did not evaluate to an object: ${expression}`);
  }
  return result.objectId;
}

/** Returns null when the browser has no CDP (Firefox / WebKit). */
export async function openEventListenerInspector(
  page: Page,
): Promise<EventListenerInspector | null> {
  let session: CDPSession;
  try {
    session = await page.context().newCDPSession(page);
  } catch {
    return null;
  }

  let closed = false;

  return {
    async forExpression(expression, types) {
      const objectId = await evaluateToObject(session, expression);
      return listenersOf(session, objectId, types);
    },

    async forEach(expression, types) {
      const objectId = await evaluateToObject(session, expression);
      const { result } = await session.send('Runtime.getProperties', {
        objectId,
        ownProperties: true,
      });
      const items = result
        .filter((p) => /^\d+$/.test(p.name) && p.value?.objectId)
        .sort((a, b) => Number(a.name) - Number(b.name));
      const records: EventListenerRecord[][] = [];
      for (const item of items) {
        records.push(
          await listenersOf(session, item.value?.objectId as string, types),
        );
      }
      return records;
    },

    async terminateExecution() {
      await session.send('Runtime.terminateExecution');
    },

    async close() {
      if (closed) return;
      closed = true;
      try {
        await session.send('Runtime.releaseObjectGroup', {
          objectGroup: GROUP,
        });
      } catch {
        // The page may already be closed.
      }
      try {
        await session.detach();
      } catch {
        // Same.
      }
    },
  };
}
