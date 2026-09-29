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

test('edge-cases page: a toolbar after many summary Tab stops is still entered and explored', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/edge-cases.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  expect(byId(details, 'tb1').reachedBy).toBe('tab');
  expect(byId(details, 'tb2').reachedBy).toBe('arrow');
  expect(byId(details, 'tb3').reachedBy).toBe('arrow');
});

test('edge-cases page: a click-delegating container around a listener-only control is not a candidate', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/edge-cases.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  expect(details.elements.some((e) => e.selector.endsWith('#delegator'))).toBe(
    false,
  );
  expect(byId(details, 'inner-listener').reachedBy).toBe('tab');
});

test('edge-cases page: nested onclick spans inside a button are both excluded as insideOperable', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/edge-cases.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  expect(details.elements.some((e) => e.selector.endsWith('#inner-span'))).toBe(
    false,
  );
  expect(details.excluded.insideOperable).toBe(2);
  expect(details.unreachableCount).toBe(0);
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

test('popups page: combobox options are reached via activedescendant after ArrowDown opens the list', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/popups.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  expect(byId(details, 'fruit-apple').reachedBy).toBe('activedescendant');
  expect(byId(details, 'fruit-banana').reachedBy).toBe('activedescendant');
  expect(byId(details, 'fruit-cherry').reachedBy).toBe('activedescendant');
  expect(byId(details, 'fruit-cherry').foundIn).toBe('popup');
  const popup = details.popups.find((p) =>
    p.triggerSelector.endsWith('#fruit'),
  );
  expect(popup?.status).toBe('explored');
  expect(popup?.popupSelector).toBe('ul#fruit-list');
});

test('popups page: a portal menu without aria-controls is found and its items are reached by arrow keys', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/popups.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  expect(byId(details, 'act-copy').reachedBy).toBe('arrow');
  expect(byId(details, 'act-paste').reachedBy).toBe('arrow');
  expect(byId(details, 'act-delete').reachedBy).toBe('arrow');
  const popup = details.popups.find((p) =>
    p.triggerSelector.endsWith('#actions'),
  );
  expect(popup?.status).toBe('explored');
  expect(popup?.itemsFound).toBe(3);
});

test('popups page: a menu item the roving focus skips is a medium-confidence candidate', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/popups.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  const skipped = byId(details, 'broken-skipped');
  expect(skipped.reachedBy).toBe('unreachable');
  expect(skipped.reason).toBe('popup-item-not-reached');
  expect(skipped.confidence).toBe('medium');
  expect(details.unreachableCount).toBe(1);
});

test('popups page: a popup shown without moving focus is recorded as opened-not-entered and not judged', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/popups.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  const popup = details.popups.find((p) => p.triggerSelector.endsWith('#hint'));
  expect(popup?.status).toBe('opened-not-entered');
  expect(details.elements.some((e) => e.selector.endsWith('#hint-item'))).toBe(
    false,
  );
});

test('popups page: an aria-haspopup="dialog" button is not a popup trigger and the envelope is schema-valid', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/popups.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  expect(
    details.popups.some((p) => p.triggerSelector.endsWith('#dialog-trigger')),
  ).toBe(false);
  expect(details.popups).toHaveLength(4);
  expect(validate(result), JSON.stringify(validate.errors)).toBe(true);
});

test('popups-edge page: a menu shared by two triggers is still judged when only the second one gets inside', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/popups-edge.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  const a = details.popups.find((p) => p.triggerSelector.endsWith('#shared-a'));
  const b = details.popups.find((p) => p.triggerSelector.endsWith('#shared-b'));
  expect(a?.status).toBe('opened-not-entered');
  expect(b?.status).toBe('explored');
  expect(byId(details, 'shared-one').reachedBy).toBe('arrow');
  expect(byId(details, 'shared-two').reachedBy).toBe('arrow');
});

test('popups-edge page: an aria-controls pointing to a missing id collects no unrelated items', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/popups-edge.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  const bad = details.popups.find((p) =>
    p.triggerSelector.endsWith('#bad-ref'),
  );
  expect(bad?.status).toBe('not-opened');
  expect(
    details.elements.some((e) => e.selector.endsWith('#unrelated-two')),
  ).toBe(false);
  expect(details.unreachableCount).toBe(0);
});

test('popup-reload page: a reload while opening a popup aborts instead of throwing', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/popup-reload.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  expect(details.aborted?.reason).toBe('navigation');
  expect(details.popups[0]?.stopReason).toBe('aborted');
});

test('popups-large page: a 12-option combobox is sampled and only visited options are judged', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/popups-large.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  const popup = details.popups.find((p) =>
    p.triggerSelector.endsWith('#country'),
  );
  expect(popup?.status).toBe('sampled');
  expect(popup?.itemsFound).toBe(12);
  expect(byId(details, 'c1').reachedBy).toBe('activedescendant');
  expect(byId(details, 'c2').reachedBy).toBe('activedescendant');
  expect(details.elements.some((e) => e.selector.endsWith('#c12'))).toBe(false);
});

test('popups-large page: a large menu that ignores ArrowDown yields one sample-next-failed candidate', async ({
  baseUrl,
  page,
  browser,
}, testInfo) => {
  const result = await runFixtureCheck(
    'keyboard-reachability-check',
    'keyboard-reachability/popups-large.html',
    baseUrl,
    { page, browser, testInfo },
    { quiet: true },
  );
  const details = result.details as KeyboardReachabilityCheckDetails;

  const popup = details.popups.find((p) =>
    p.triggerSelector.endsWith('#stuck'),
  );
  expect(popup?.status).toBe('stopped');
  expect(popup?.stopReason).toBe('sample-next-failed');
  const s2 = byId(details, 's2');
  expect(s2.reason).toBe('popup-sample-next-failed');
  expect(s2.confidence).toBe('medium');
  expect(details.unreachableCount).toBe(1);
  expect(validate(result), JSON.stringify(validate.errors)).toBe(true);
});
