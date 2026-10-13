/**
 * non-text-contrast-check (WCAG 1.4.11): the contrast of form control
 * boundaries and of icons in icon-only buttons is measured from computed
 * styles. Everything below 3:1, and everything whose color cannot be decided,
 * is `incomplete`.
 */

import Ajv2020 from 'ajv/dist/2020.js';
import { test, expect, runFixtureCheck } from './helpers/fixtures.js';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';
import { normalizeNonTextContrastCheck } from '../dist/index.js';
import { runNonTextContrastCheck } from '../dist/playwright/index.js';
import type {
  NonTextContrastCheckDetails,
  NonTextContrastCheckResult,
  NonTextContrastComponent,
} from '../dist/index.js';

const ajv = new Ajv2020({ strict: false, allowUnionTypes: true });
const validateEnvelope = ajv.compile(RESULT_SCHEMAS['non-text-contrast-check']);

const BOUNDARY_ID = 'a11y-skills/non-text-contrast-boundary';
const ICON_ID = 'a11y-skills/non-text-contrast-icon';

async function runNonTextContrast(
  fixture: string,
  context: Parameters<typeof runFixtureCheck>[3],
  baseUrl: string,
): Promise<NonTextContrastCheckResult> {
  return (await runFixtureCheck(
    'non-text-contrast-check',
    `non-text-contrast/${fixture}`,
    baseUrl,
    context,
  )) as NonTextContrastCheckResult;
}

// ---------------------------------------------------------------------------
// normalizer (no browser)
// ---------------------------------------------------------------------------

function component(
  overrides: Partial<NonTextContrastComponent>,
): NonTextContrastComponent {
  return {
    selector: '#target',
    html: '<input id="target">',
    htmlTruncated: false,
    kind: 'text-input',
    status: 'pass',
    undeterminedReason: null,
    bestRatio: 4.54,
    indicators: [],
    otherVisuals: [],
    ...overrides,
  };
}

function detailsOf(
  overrides: Partial<NonTextContrastCheckDetails> = {},
): NonTextContrastCheckDetails {
  return {
    threshold: 3,
    components: [],
    componentCounts: {
      boundary: { found: 0, kept: 0 },
      icon: { found: 0, kept: 0 },
    },
    ...overrides,
  };
}

test('低コントラストの部品があるとき、説明文に比と below 3:1 が入る', () => {
  const buckets = normalizeNonTextContrastCheck(
    detailsOf({
      components: [
        component({
          status: 'low',
          bestRatio: 1.6,
          indicators: [
            {
              part: 'border-bottom',
              color: '#cccccc',
              against: '#ffffff',
              ratio: 1.6,
            },
          ],
        }),
      ],
      componentCounts: {
        boundary: { found: 1, kept: 1 },
        icon: { found: 0, kept: 0 },
      },
    }),
  );

  const summary = buckets.incomplete[0]?.nodes[0]?.failureSummary ?? '';
  expect(summary).toContain('1.6:1');
  expect(summary).toContain('below 3:1');
  expect(summary).toContain('border-bottom #cccccc vs #ffffff 1.6:1');
});

test('box-shadow がある低コントラストの部品のとき、説明文に box-shadow が入る', () => {
  const buckets = normalizeNonTextContrastCheck(
    detailsOf({
      components: [
        component({
          status: 'low',
          bestRatio: 1.2,
          otherVisuals: ['box-shadow'],
        }),
      ],
      componentCounts: {
        boundary: { found: 1, kept: 1 },
        icon: { found: 0, kept: 0 },
      },
    }),
  );

  expect(buckets.incomplete[0]?.nodes[0]?.failureSummary).toContain(
    'box-shadow',
  );
});

test('部品が 0 件のとき、2 ルールとも inapplicable になる', () => {
  const buckets = normalizeNonTextContrastCheck(detailsOf());

  expect(buckets.inapplicable.map((r) => r.id).sort()).toEqual([
    BOUNDARY_ID,
    ICON_ID,
  ]);
  expect(buckets.passes).toEqual([]);
  expect(buckets.incomplete).toEqual([]);
});

test('すべて pass でも icon が 301 件中 300 件しか測っていないとき、icon は page node 付きで incomplete になる', () => {
  const buckets = normalizeNonTextContrastCheck(
    detailsOf({
      components: [
        component({
          kind: 'icon-button',
          status: 'pass',
          selector: '#icon',
        }),
      ],
      componentCounts: {
        boundary: { found: 0, kept: 0 },
        icon: { found: 301, kept: 300 },
      },
    }),
  );

  const icon = buckets.incomplete.find((r) => r.id === ICON_ID);
  expect(icon?.nodes).toHaveLength(1);
  expect(icon?.nodes[0]?.target).toEqual(['html']);
});

// ---------------------------------------------------------------------------
// fixtures (Chromium)
// ---------------------------------------------------------------------------

test('境界が薄い入力欄のとき、low になり boundary が incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'low-border.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components).toHaveLength(1);
  expect(result.details.components[0]?.status).toBe('low');
  expect(result.details.components[0]?.bestRatio).toBe(1.6);
  expect(result.incomplete.map((r) => r.id)).toEqual([BOUNDARY_ID]);
  expect(result.inapplicable.map((r) => r.id)).toEqual([ICON_ID]);
});

test('枠が 3:1 以上の入力欄とカスタムチェックボックスのとき、両方 pass になり boundary が passes になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'good-border.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components.map((c) => [c.kind, c.status])).toEqual([
    ['text-input', 'pass'],
    ['checkbox', 'pass'],
  ]);
  expect(result.passes.map((r) => r.id)).toEqual([BOUNDARY_ID]);
});

test('下線だけの入力欄のとき、pass になり指標は border-bottom の 1 つだけになる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'underline.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [field] = result.details.components;
  expect(field?.status).toBe('pass');
  expect(field?.indicators.map((i) => i.part)).toEqual(['border-bottom']);
});

test('塗りだけの入力欄のとき、薄い塗りは low、濃い塗りは background の指標で pass になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'fill-only.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [light, dark] = result.details.components;
  expect(light?.status).toBe('low');
  expect(dark?.status).toBe('pass');
  expect(dark?.indicators.map((i) => i.part)).toEqual(['background']);
});

test('枠も塗りも無い入力欄のとき、no-boundary になり bestRatio は null で boundary が incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'no-boundary.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [field] = result.details.components;
  expect(field?.status).toBe('no-boundary');
  expect(field?.bestRatio).toBeNull();
  expect(result.incomplete.map((r) => r.id)).toEqual([BOUNDARY_ID]);
});

test('半透明の背景と半透明の枠のとき、合成した色で比を出して両方 low になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'translucent.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [onDark, faint] = result.details.components;
  expect(onDark?.status).toBe('low');
  // 50% black over white is about #808080, so the border #808080 is invisible.
  expect(
    onDark?.indicators.find((i) => i.part === 'border-top')?.against,
  ).toMatch(/^#7f7f7f$|^#808080$/);
  expect(faint?.status).toBe('low');
  // 20% black over white is #cccccc.
  expect(faint?.indicators.find((i) => i.part === 'border-top')?.color).toBe(
    '#cccccc',
  );
});

test('枠の色が oklch() で書かれているとき、canvas で変換して測り pass になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'oklch.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components[0]?.status).toBe('pass');
  expect(result.details.components[0]?.bestRatio).toBeGreaterThan(3);
});

for (const [fixture, reason] of [
  ['gradient.html', 'background-image'],
  ['opacity.html', 'opacity'],
  ['opacity-outer.html', 'opacity'],
  ['out-of-flow.html', 'out-of-flow'],
  ['dark-scheme.html', 'color-scheme'],
] as const) {
  test(`${fixture} の入力欄は ${reason} で undetermined になる`, async ({
    page,
    browser,
    baseUrl,
  }, testInfo) => {
    const result = await runNonTextContrast(
      fixture,
      { page, browser, testInfo },
      baseUrl,
    );

    const [field] = result.details.components;
    expect(field?.status).toBe('undetermined');
    expect(field?.undeterminedReason).toBe(reason);
    expect(result.incomplete.map((r) => r.id)).toEqual([BOUNDARY_ID]);
  });
}

test('既定のチェックボックスとラジオと accent-color 付きのチェックボックスのとき、前の 2 つは user-agent で accent の 1 つは undetermined になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'native-controls.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(
    result.details.components.map((c) => [c.status, c.undeterminedReason]),
  ).toEqual([
    ['user-agent', null],
    ['user-agent', null],
    ['undetermined', 'accent-color'],
  ]);
  expect(result.incomplete[0]?.nodes).toHaveLength(1);
});

test('既定のチェックボックスとラジオだけのとき、boundary は inapplicable になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'native-only.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components.map((c) => c.status)).toEqual([
    'user-agent',
    'user-agent',
  ]);
  expect(result.inapplicable.map((r) => r.id)).toContain(BOUNDARY_ID);
});

test('アイコンの線が薄いボタンのとき、low になり icon が incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-low.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components[0]?.kind).toBe('icon-button');
  expect(result.details.components[0]?.status).toBe('low');
  expect(result.incomplete.map((r) => r.id)).toEqual([ICON_ID]);
});

test('アイコンが currentColor の濃い線のとき、pass になり icon が passes になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-good.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components[0]?.status).toBe('pass');
  expect(result.passes.map((r) => r.id)).toEqual([ICON_ID]);
});

test('濃い円と重ならない薄い線のアイコンのとき、mixed-icon-colors で undetermined になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-mixed.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [button] = result.details.components;
  expect(button?.status).toBe('undetermined');
  expect(button?.undeterminedReason).toBe('mixed-icon-colors');
});

test('白い背景の rect の上に白い線があるアイコンのとき、黒と 21:1 でも svg-overlap で undetermined になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-svg-overlap.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [button] = result.details.components;
  expect(button?.status).toBe('undetermined');
  expect(button?.undeterminedReason).toBe('svg-overlap');
});

test('白い rect の上の水平線と垂直線のとき、幅や高さが 0 の矩形でも svg-overlap で undetermined になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-svg-overlap-line.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(
    result.details.components.map((c) => [c.status, c.undeterminedReason]),
  ).toEqual([
    ['undetermined', 'svg-overlap'],
    ['undetermined', 'svg-overlap'],
  ]);
});

test('塗りの無い 2 本の線が交差するアイコンのとき、svg-overlap にならず pass になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-stroke-only.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components[0]?.status).toBe('pass');
});

test('fill-opacity が低い円と opacity が低い g の中の円のとき、前者は low で後者は opacity で undetermined になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-svg-opacity.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [fillOpacity, groupOpacity] = result.details.components;
  expect(fillOpacity?.status).toBe('low');
  expect(groupOpacity?.status).toBe('undetermined');
  expect(groupOpacity?.undeterminedReason).toBe('opacity');
});

test('img と黒い円の SVG があるボタンのとき、SVG が 21:1 でも image-icon で undetermined になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-image-mixed.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [button] = result.details.components;
  expect(button?.status).toBe('undetermined');
  expect(button?.undeterminedReason).toBe('image-icon');
});

test('SVG の要素が 21 個あるアイコンのとき、too-many-icon-parts で undetermined になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-many-parts.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components[0]?.undeterminedReason).toBe(
    'too-many-icon-parts',
  );
});

test('::before の文字が薄いアイコンフォントのボタンのとき、疑似要素の色で測って low になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-font.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components[0]?.status).toBe('low');
});

test('::before が自分の背景 #222 を持つとき、白ではなく #222 と比べて low になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-font-bg.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [button] = result.details.components;
  expect(button?.status).toBe('low');
  expect(button?.indicators[0]?.against).toBe('#222222');
});

test('アイコンが img だけのボタンのとき、image-icon で undetermined になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-image.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [button] = result.details.components;
  expect(button?.status).toBe('undetermined');
  expect(button?.undeterminedReason).toBe('image-icon');
});

test('無効・非表示・aria-disabled の部品と文字付きボタンだけのとき、部品は 0 件で 2 ルールとも inapplicable になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'excluded.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components).toHaveLength(0);
  expect(result.inapplicable.map((r) => r.id).sort()).toEqual([
    BOUNDARY_ID,
    ICON_ID,
  ]);
});

test('見出しと段落だけのとき、2 ルールとも inapplicable で件数は 0 になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'none.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.inapplicable.map((r) => r.id).sort()).toEqual([
    BOUNDARY_ID,
    ICON_ID,
  ]);
  expect(result.details.componentCounts).toEqual({
    boundary: { found: 0, kept: 0 },
    icon: { found: 0, kept: 0 },
  });
});

test('入力欄が 310 個あるとき、300 個だけ測り、打ち切りの page node で boundary が incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'many.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.componentCounts.boundary).toEqual({
    found: 310,
    kept: 300,
  });
  expect(result.details.components).toHaveLength(300);
  const boundary = result.incomplete.find((r) => r.id === BOUNDARY_ID);
  expect(boundary?.nodes).toHaveLength(1);
  expect(boundary?.nodes[0]?.target).toEqual(['html']);
  expect(result.passes.map((r) => r.id)).not.toContain(BOUNDARY_ID);
});

test('role=button の svg 要素があるとき、チェックが例外を投げず icon-button として測って low になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-svg-role-button.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [svgButton] = result.details.components;
  expect(svgButton?.kind).toBe('icon-button');
  expect(svgButton?.status).toBe('low');
});

test('display:none の SVG に薄い線があるとき、描かれない部品は測らず可視の黒いアイコンで pass になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-hidden-part.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components[0]?.status).toBe('pass');
});

test('sr-only の文字と薄い SVG があるボタンのとき、見える文字が無いので icon-button として low になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-sr-only-text.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components).toHaveLength(1);
  expect(result.details.components[0]?.kind).toBe('icon-button');
  expect(result.details.components[0]?.status).toBe('low');
});

test('symbol の path が自分で fill を指定する use のとき、svg-use で undetermined になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-use-own-fill.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [button] = result.details.components;
  expect(button?.status).toBe('undetermined');
  expect(button?.undeterminedReason).toBe('svg-use');
});

test('symbol の path が色を指定せず use が currentColor を継承するとき、pass になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-use-inherit.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components[0]?.status).toBe('pass');
});

test('opacity:0 のネイティブチェックボックスのとき、user-agent にせず opacity で undetermined になり boundary が incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'hidden-native-opacity.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [checkbox] = result.details.components;
  expect(checkbox?.status).toBe('undetermined');
  expect(checkbox?.undeterminedReason).toBe('opacity');
  expect(result.incomplete.map((r) => r.id)).toContain(BOUNDARY_ID);
});

test('sr-only で隠したネイティブチェックボックスのとき、visually-hidden で undetermined になり boundary が incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'hidden-native-sr-only.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [checkbox] = result.details.components;
  expect(checkbox?.status).toBe('undetermined');
  expect(checkbox?.undeterminedReason).toBe('visually-hidden');
  expect(result.incomplete.map((r) => r.id)).toContain(BOUNDARY_ID);
});

test('color-scheme が light dark で明るい設定のとき、白い土台として測って pass になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'color-scheme-light-dark.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components[0]?.status).toBe('pass');
});

test('color-scheme が light dark で暗い設定のとき、color-scheme で undetermined になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const result = await runNonTextContrast(
    'color-scheme-light-dark.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [field] = result.details.components;
  expect(field?.status).toBe('undetermined');
  expect(field?.undeterminedReason).toBe('color-scheme');
});

test('不透明な白の外側に backdrop-filter があるとき、filter にせず pass になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'backdrop-filter.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components[0]?.status).toBe('pass');
});

test('SVG の path が透明な fill だけのとき、image-icon ではなく no-icon-color で undetermined になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-no-color.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [button] = result.details.components;
  expect(button?.status).toBe('undetermined');
  expect(button?.undeterminedReason).toBe('no-icon-color');
});

test('symbol の path が stylesheet で fill を指定されている use のとき、svg-use で undetermined になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-use-stylesheet.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [button] = result.details.components;
  expect(button?.status).toBe('undetermined');
  expect(button?.undeterminedReason).toBe('svg-use');
});

test('symbol の path が親と同じ値の fill を明示し use が別の fill を持つとき、svg-use で undetermined になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-use-explicit-same-paint.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [button] = result.details.components;
  expect(button?.status).toBe('undetermined');
  expect(button?.undeterminedReason).toBe('svg-use');
});

test('visibility:hidden の ::before がある薄い SVG のボタンのとき、描かれない疑似要素は測らず low になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-pseudo-visibility-hidden.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components[0]?.status).toBe('low');
});

test('自身が position:absolute で兄弟の黒い要素の上にある透明な入力欄のとき、out-of-flow で undetermined になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'positioned-input.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [field] = result.details.components;
  expect(field?.status).toBe('undetermined');
  expect(field?.undeterminedReason).toBe('out-of-flow');
});

test('opacity:0 のラベルと薄い SVG があるボタンのとき、見える文字が無いので icon-button として low になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-opacity-zero-label.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components[0]?.kind).toBe('icon-button');
  expect(result.details.components[0]?.status).toBe('low');
});

test('文字色が transparent のラベルと薄い SVG があるボタンのとき、見える文字が無いので icon-button として low になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-transparent-text-label.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components[0]?.kind).toBe('icon-button');
  expect(result.details.components[0]?.status).toBe('low');
});

test('display:contents の span に見える文字があるボタンのとき、文字は見えるので icon-button にならず icon は inapplicable になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-display-contents-label.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components).toHaveLength(0);
  expect(result.inapplicable.map((r) => r.id)).toContain(ICON_ID);
});

test('position:absolute の ::before に白い文字があるボタンのとき、背景が分からないので out-of-flow で undetermined になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-pseudo-absolute.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [button] = result.details.components;
  expect(button?.status).toBe('undetermined');
  expect(button?.undeterminedReason).toBe('out-of-flow');
});

test('position:absolute の svg に白い線があるボタンのとき、背景が分からないので out-of-flow で undetermined になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-svg-absolute.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [button] = result.details.components;
  expect(button?.status).toBe('undetermined');
  expect(button?.undeterminedReason).toBe('out-of-flow');
});

test('content が空の ::before に background-image だけのアイコンのとき、icon-button として image-icon で undetermined になり icon が incomplete になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'icon-pseudo-background-image.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [button] = result.details.components;
  expect(button?.kind).toBe('icon-button');
  expect(button?.undeterminedReason).toBe('image-icon');
  expect(result.incomplete.map((r) => r.id)).toContain(ICON_ID);
});

test('opacity が低い祖先の中の既定のチェックボックスのとき、user-agent にせず opacity で undetermined になる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'native-in-opacity.html',
    { page, browser, testInfo },
    baseUrl,
  );

  const [checkbox] = result.details.components;
  expect(checkbox?.status).toBe('undetermined');
  expect(checkbox?.undeterminedReason).toBe('opacity');
});

test('グラデーション背景の中の既定のチェックボックスのとき、外側の色に依らず user-agent のままになる', async ({
  page,
  browser,
  baseUrl,
}, testInfo) => {
  const result = await runNonTextContrast(
    'native-in-gradient.html',
    { page, browser, testInfo },
    baseUrl,
  );

  expect(result.details.components[0]?.status).toBe('user-agent');
});

for (const [reason, text] of [
  ['svg-use', 'icon drawn with SVG <use> whose shapes set their own colors'],
  [
    'visually-hidden',
    'the control is visually hidden; check the custom control drawn in its place',
  ],
  ['no-icon-color', 'no icon color could be read'],
  ['image-icon', 'icon is an image or a CSS background image'],
] as const) {
  test(`undeterminedReason が ${reason} のとき、説明文に「${text}」が入る`, () => {
    const buckets = normalizeNonTextContrastCheck(
      detailsOf({
        components: [
          component({
            kind: 'icon-button',
            status: 'undetermined',
            undeterminedReason: reason,
            bestRatio: null,
          }),
        ],
        componentCounts: {
          boundary: { found: 0, kept: 0 },
          icon: { found: 1, kept: 1 },
        },
      }),
    );

    expect(buckets.incomplete[0]?.nodes[0]?.failureSummary).toContain(text);
  });
}

// ---------------------------------------------------------------------------
// schema and page integrity
// ---------------------------------------------------------------------------

for (const fixture of [
  'low-border.html',
  'good-border.html',
  'underline.html',
  'fill-only.html',
  'no-boundary.html',
  'translucent.html',
  'oklch.html',
  'gradient.html',
  'opacity.html',
  'opacity-outer.html',
  'out-of-flow.html',
  'dark-scheme.html',
  'native-controls.html',
  'native-only.html',
  'icon-low.html',
  'icon-good.html',
  'icon-mixed.html',
  'icon-svg-overlap.html',
  'icon-svg-overlap-line.html',
  'icon-stroke-only.html',
  'icon-svg-opacity.html',
  'icon-image-mixed.html',
  'icon-many-parts.html',
  'icon-font.html',
  'icon-font-bg.html',
  'icon-image.html',
  'excluded.html',
  'none.html',
  'many.html',
  'icon-svg-role-button.html',
  'icon-hidden-part.html',
  'icon-sr-only-text.html',
  'icon-use-own-fill.html',
  'icon-use-inherit.html',
  'hidden-native-opacity.html',
  'hidden-native-sr-only.html',
  'color-scheme-light-dark.html',
  'backdrop-filter.html',
  'icon-no-color.html',
  'icon-use-stylesheet.html',
  'icon-use-explicit-same-paint.html',
  'positioned-input.html',
  'icon-opacity-zero-label.html',
  'icon-transparent-text-label.html',
  'icon-display-contents-label.html',
  'icon-pseudo-absolute.html',
  'icon-svg-absolute.html',
  'icon-pseudo-visibility-hidden.html',
  'icon-pseudo-background-image.html',
  'native-in-opacity.html',
  'native-in-gradient.html',
]) {
  test(`${fixture} の結果は JSON Schema に適合する`, async ({
    page,
    browser,
    baseUrl,
  }, testInfo) => {
    const result = await runNonTextContrast(
      fixture,
      { page, browser, testInfo },
      baseUrl,
    );

    expect(
      validateEnvelope(result),
      JSON.stringify(validateEnvelope.errors),
    ).toBe(true);
  });
}

test('チェックの前後で document.body.innerHTML が変わらない', async ({
  page,
  baseUrl,
}, testInfo) => {
  await page.goto(`${baseUrl}/non-text-contrast/low-border.html`);
  const before = await page.evaluate(() => document.body.innerHTML);

  await runNonTextContrastCheck({
    page,
    outputDir: testInfo.outputDir,
    quiet: true,
  });

  const after = await page.evaluate(() => document.body.innerHTML);
  expect(after).toBe(before);
});
