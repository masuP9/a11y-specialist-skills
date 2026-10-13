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
 * - `forSubtree` uses `depth: -1, pierce: true`; `collectNodes` uses
 *   `DOM.resolveNode`, which works without `DOM.enable`.
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

/** A listener found under a node, with the node it is attached to. */
export interface SubtreeEventListenerRecord extends EventListenerRecord {
  /** CDP backendNodeId of the node the listener is on; valid for this inspector only. */
  backendNodeId: number;
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
   * Listeners on the node `expression` evaluates to and all of its descendants,
   * including open shadow roots and same-origin iframes
   * (DOMDebugger.getEventListeners with depth -1 and pierce). One CDP call, so
   * it scales to large documents, unlike forEach. `types` filters as in
   * forExpression. Listeners without a backendNodeId are dropped.
   */
  forSubtree(
    expression: string,
    types?: readonly string[],
  ): Promise<SubtreeEventListenerRecord[]>;
  /**
   * Stores the nodes for `backendNodeIds` in a new array at window[key] of the
   * main frame, and returns, for each id in order, its index in that array, or
   * -1 when the node could not be resolved or belongs to another frame.
   * `shouldStop` is checked before creating the array and before each node;
   * once it returns true no more page writes are issued and the remaining ids
   * are -1. The caller deletes window[key] when done.
   */
  collectNodes(
    backendNodeIds: readonly number[],
    key: string,
    shouldStop?: () => boolean,
  ): Promise<number[]>;
  /**
   * Stops the script currently running on the page's main thread
   * (Runtime.terminateExecution). For checks that dispatch events into the
   * page and must recover when a handler never returns.
   */
  terminateExecution(): Promise<void>;
  /** Releases remote objects and detaches the CDP session. Safe to call twice. */
  close(): Promise<void>;
}

/** Upper bound for each CDP call made while closing. */
const CLOSE_TIMEOUT_MS = 1_000;

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
    .map(toRecord);
}

function toRecord(l: {
  type: string;
  useCapture: boolean;
  passive: boolean;
  once: boolean;
  scriptId: string;
  lineNumber: number;
  columnNumber: number;
  handler?: unknown;
}): EventListenerRecord {
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
  } catch (error) {
    // Only a browser without CDP means "unsupported"; anything else is a real failure.
    const browserName = page.context().browser()?.browserType().name();
    if (browserName !== undefined && browserName !== 'chromium') return null;
    throw error;
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

    async forSubtree(expression, types) {
      const objectId = await evaluateToObject(session, expression);
      // `depth` / `pierce` / `objectGroup` are in the protocol but missing from
      // Playwright's generated parameter type.
      const params = {
        objectId,
        depth: -1,
        pierce: true,
        objectGroup: GROUP,
      } as { objectId: string; depth: number; pierce: boolean };
      const { listeners } = await session.send(
        'DOMDebugger.getEventListeners',
        params,
      );
      const records: SubtreeEventListenerRecord[] = [];
      for (const l of listeners) {
        if (types && !types.includes(l.type)) continue;
        if (l.backendNodeId === undefined) continue;
        records.push({ ...toRecord(l), backendNodeId: l.backendNodeId });
      }
      return records;
    },

    async collectNodes(backendNodeIds, key, shouldStop) {
      const indices = backendNodeIds.map(() => -1);
      if (shouldStop?.()) return indices;
      await session.send('Runtime.evaluate', {
        expression: `window[${JSON.stringify(key)}] = []`,
      });
      for (let i = 0; i < backendNodeIds.length; i++) {
        if (shouldStop?.()) break;
        try {
          const { object } = await session.send('DOM.resolveNode', {
            backendNodeId: backendNodeIds[i] as number,
            objectGroup: GROUP,
          } as { backendNodeId: number });
          if (!object.objectId) continue;
          // Runs in the node's own frame: another frame has no window[key].
          const { result } = await session.send('Runtime.callFunctionOn', {
            objectId: object.objectId,
            functionDeclaration:
              'function (key) { if (window !== window.top) return -1; return window[key].push(this) - 1; }',
            arguments: [{ value: key }],
            returnByValue: true,
          });
          if (typeof result.value === 'number') indices[i] = result.value;
        } catch {
          // Unresolvable node (removed, detached frame): leave -1.
        }
      }
      return indices;
    },

    async terminateExecution() {
      await session.send('Runtime.terminateExecution');
    },

    async close() {
      if (closed) return;
      closed = true;
      try {
        // A page whose main thread is blocked never answers; do not wait for it.
        await Promise.race([
          session.send('Runtime.releaseObjectGroup', { objectGroup: GROUP }),
          new Promise((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS)),
        ]);
      } catch {
        // The page may already be closed.
      }
      try {
        await Promise.race([
          session.detach(),
          new Promise((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS)),
        ]);
      } catch {
        // Same.
      }
    },
  };
}
