/**
 * Element-level behavior of keyboard-reachability-check (WCAG 2.1.1).
 *
 * Each test runs the check against one fixture under
 * test/fixtures/pages/keyboard-reachability/ and asserts on `details`.
 * Bucket placement for clear/finding is also covered by fixture-gallery.
 */

import Ajv2020 from 'ajv/dist/2020.js';
import { test, expect, runFixtureCheck } from './helpers/fixtures.js';
import type {
  KeyboardReachabilityCheckDetails,
  KeyboardReachabilityElement,
} from '../dist/index.js';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';

const ajv = new Ajv2020({ strict: false, allowUnionTypes: true });
const validate = ajv.compile(RESULT_SCHEMAS['keyboard-reachability-check']);

function byId(
  details: KeyboardReachabilityCheckDetails,
  id: string,
): KeyboardReachabilityElement {
  const el = details.elements.find((e) => e.selector.endsWith(`#${id}`));
  if (!el) throw new Error(`element #${id} not in details.elements`);
  return el;
}

test('clear page: roving tabs are reached by arrow keys', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/clear.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  expect(byId(details, 'tab1').reachedBy).toBe('tab');
  expect(byId(details, 'tab2').reachedBy).toBe('arrow');
  expect(byId(details, 'tab3').reachedBy).toBe('arrow');
});

test('clear page: activedescendant options are reached via aria-activedescendant', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/clear.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  expect(byId(details, 'opt1').reachedBy).toBe('activedescendant');
  expect(byId(details, 'opt2').reachedBy).toBe('activedescendant');
  expect(byId(details, 'opt3').reachedBy).toBe('activedescendant');
  expect(byId(details, 'opt4').reachedBy).toBe('activedescendant');
  const listbox = details.composites.find((c) =>
    c.selector.endsWith('#fruits'),
  );
  expect(listbox?.status).toBe('explored');
});

test('clear page: toolbar entered in the middle is swept in both directions', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/clear.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  expect(byId(details, 'tb2').reachedBy).toBe('tab');
  expect(byId(details, 'tb1').reachedBy).toBe('arrow');
  expect(byId(details, 'tb3').reachedBy).toBe('arrow');
});

test('clear page: unchecked native radios are reached by arrow keys', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/clear.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  expect(byId(details, 'size-s').reachedBy).toBe('tab');
  expect(byId(details, 'size-m').reachedBy).toBe('arrow');
  expect(byId(details, 'size-l').reachedBy).toBe('arrow');
});

test('clear page: disabled, display:none and inert controls are excluded but aria-hidden ones are not', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/clear.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  expect(details.excluded.disabled).toBe(1);
  expect(details.excluded.hidden).toBe(1);
  expect(details.excluded.inert).toBe(1);
  expect(
    details.elements.some((e) => e.selector.endsWith('#disabled-button')),
  ).toBe(false);
  expect(byId(details, 'hidden-from-at').reachedBy).toBe('tab');
});

test('clear page: nothing is unreachable or untested and the envelope is schema-valid', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/clear.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  expect(details.unreachableCount).toBe(0);
  expect(details.notEvaluatedCount).toBe(0);
  expect(details.aborted).toBeNull();
  expect(validate(result), JSON.stringify(validate.errors)).toBe(true);
});

test('finding page: a tabindex=-1 button outside composites is a high-confidence candidate', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/finding.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  const negative = byId(details, 'negative');
  expect(negative.reachedBy).toBe('unreachable');
  expect(negative.reason).toBe('tabindex-negative-outside-composite');
  expect(negative.confidence).toBe('high');
});

test('finding page: an unfocusable div with onclick is a high-confidence candidate', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/finding.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  const onclickDiv = byId(details, 'onclick-div');
  expect(onclickDiv.evidence).toBe('onclick');
  expect(onclickDiv.reason).toBe('onclick-not-focusable');
  expect(onclickDiv.confidence).toBe('high');
});

test('finding page: a pointer-cursor div with a click listener is a medium-confidence candidate', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/finding.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  const listenerDiv = byId(details, 'listener-div');
  expect(listenerDiv.evidence).toBe('click-listener');
  expect(listenerDiv.reason).toBe('click-listener-not-focusable');
  expect(listenerDiv.confidence).toBe('medium');
});

test('finding page: the ordinary button is reached by Tab and exactly 3 nodes are reported', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/finding.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  expect(byId(details, 'reachable').reachedBy).toBe('tab');
  const rule = result.incomplete.find(
    (r) => r.id === 'a11y-skills/keyboard-unreachable',
  );
  expect(rule?.nodes).toHaveLength(3);
  expect(validate(result), JSON.stringify(validate.errors)).toBe(true);
});

test('side-effects page: exploration stops on the slider without changing its value', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/side-effects.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  // A changed slider value navigates the fixture → would show up as aborted.
  expect(details.aborted).toBeNull();
  const toolbar = details.composites.find((c) =>
    c.selector.endsWith('#toolbar'),
  );
  expect(toolbar?.status).toBe('stopped');
  expect(toolbar?.stopReason).toBe('value-control');
  expect(byId(details, 'slider').reachedBy).toBe('arrow');
});

test('side-effects page: the item past the slider is a low-confidence candidate', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/side-effects.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  const tb3 = byId(details, 'tb3');
  expect(tb3.reason).toBe('composite-exploration-stopped');
  expect(tb3.confidence).toBe('low');
  const rule = result.incomplete.find(
    (r) => r.id === 'a11y-skills/keyboard-unreachable',
  );
  expect(rule?.nodes).toHaveLength(1);
});

test('navigation page: a navigating arrow key aborts the check with an incomplete result', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/navigation.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  expect(details.aborted?.reason).toBe('navigation');
  expect(result.url).toBe(`${baseUrl}/keyboard-reachability/navigation.html`);
  expect(byId(details, 'mi1').reachedBy).toBe('tab');
  expect(byId(details, 'mi3').reachedBy).toBe('not-evaluated');
  expect(byId(details, 'mi3').reason).toBe('exploration-aborted');
  const rule = result.incomplete.find(
    (r) => r.id === 'a11y-skills/keyboard-unreachable',
  );
  expect(rule?.nodes.map((n) => n.target)).toEqual([['html']]);
  expect(validate(result), JSON.stringify(validate.errors)).toBe(true);
});

test('reload page: a same-URL reload aborts the check with an incomplete result', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/reload.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  expect(details.aborted?.reason).toBe('navigation');
  expect(byId(details, 'mi3').reachedBy).toBe('not-evaluated');
  const rule = result.incomplete.find(
    (r) => r.id === 'a11y-skills/keyboard-unreachable',
  );
  expect(rule?.nodes.map((n) => n.target)).toEqual([['html']]);
});
