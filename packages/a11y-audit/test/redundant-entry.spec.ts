/**
 * redundant-entry-check (WCAG 3.3.7): fields in the same form that ask for the
 * same information are reported as candidates (`incomplete`).
 *
 * Each case builds a tiny page with `page.setContent`, so the input and the
 * expected result are visible in the test itself.
 */

import { test, expect } from '@playwright/test';
import Ajv2020 from 'ajv/dist/2020.js';
import { runRedundantEntryCheck } from '../dist/playwright/index.js';
import { RESULT_SCHEMAS } from '../dist/schemas/index.js';

const ajv = new Ajv2020({ strict: false, allowUnionTypes: true });
const validateEnvelope = ajv.compile(RESULT_SCHEMAS['redundant-entry-check']);

const html = (body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>${body}</body></html>`;

test('autocomplete が shipping と billing に分かれた同じ目的の欄は scoped のグループになる', async ({
  page,
}, testInfo) => {
  await page.setContent(
    html(`<form id="f">
      <label for="a">Shipping address</label>
      <input id="a" autocomplete="shipping street-address">
      <label for="b">Billing address</label>
      <input id="b" autocomplete="billing street-address">
    </form>`),
  );

  const result = await runRedundantEntryCheck({
    page,
    outputDir: testInfo.outputDir,
  });

  expect(result.details.groups).toHaveLength(1);
  expect(result.details.groups[0]?.purpose).toBe('street-address');
  expect(result.details.groups[0]?.kind).toBe('scoped');
  expect(result.details.groups[0]?.fields.map((f) => f.scope)).toEqual([
    'shipping',
    'billing',
  ]);
  expect(result.incomplete.map((r) => r.id)).toEqual([
    'a11y-skills/redundant-entry',
  ]);
  expect(result.incomplete[0]?.nodes.map((n) => n.target)).toEqual([['#b']]);
  expect(
    validateEnvelope(result),
    JSON.stringify(validateEnvelope.errors),
  ).toBe(true);
});

test('「お届け先と同じ」チェックボックスがあると copyControls に入る', async ({
  page,
}, testInfo) => {
  await page.setContent(
    html(`<form id="f">
      <input id="a" autocomplete="shipping email" aria-label="Shipping email">
      <label><input type="checkbox" id="same"> お届け先と同じ</label>
      <input id="b" autocomplete="billing email" aria-label="Billing email">
    </form>`),
  );

  const result = await runRedundantEntryCheck({
    page,
    outputDir: testInfo.outputDir,
  });

  expect(result.details.groups[0]?.copyControls).toEqual([
    { selector: '#same', tagName: 'input', text: 'お届け先と同じ' },
  ]);
  expect(result.incomplete).toHaveLength(1);
  expect(
    validateEnvelope(result),
    JSON.stringify(validateEnvelope.errors),
  ).toBe(true);
});

test('fieldset の見出しだけで範囲が分かる欄（autocomplete なし）も scoped のグループになる', async ({
  page,
}, testInfo) => {
  await page.setContent(
    html(`<form id="f">
      <fieldset><legend>お届け先</legend>
        <label for="a">住所</label><input id="a" name="address">
      </fieldset>
      <fieldset><legend>ご請求先</legend>
        <label for="b">住所</label><input id="b" name="address">
      </fieldset>
    </form>`),
  );

  const result = await runRedundantEntryCheck({
    page,
    outputDir: testInfo.outputDir,
  });

  expect(result.details.groups).toHaveLength(1);
  expect(result.details.groups[0]?.purpose).toBe('street-address');
  expect(result.details.groups[0]?.kind).toBe('scoped');
  expect(result.details.groups[0]?.fields.map((f) => f.scope)).toEqual([
    'shipping',
    'billing',
  ]);
  expect(
    validateEnvelope(result),
    JSON.stringify(validateEnvelope.errors),
  ).toBe(true);
});

test('メールアドレスと name が email_confirm の確認用欄は repeated のグループになる', async ({
  page,
}, testInfo) => {
  await page.setContent(
    html(`<form id="f">
      <label for="a">Email</label><input id="a" name="email" autocomplete="email">
      <label for="b">Confirm</label><input id="b" name="email_confirm">
    </form>`),
  );

  const result = await runRedundantEntryCheck({
    page,
    outputDir: testInfo.outputDir,
  });

  expect(result.details.groups).toHaveLength(1);
  expect(result.details.groups[0]?.purpose).toBe('email');
  expect(result.details.groups[0]?.kind).toBe('repeated');
  expect(result.details.groups[0]?.fields.map((f) => f.selector)).toEqual([
    '#a',
    '#b',
  ]);
  expect(
    validateEnvelope(result),
    JSON.stringify(validateEnvelope.errors),
  ).toBe(true);
});

test('メールアドレスと、ラベルが「メールアドレス（確認）」の欄は repeated のグループになる', async ({
  page,
}, testInfo) => {
  await page.setContent(
    html(`<form id="f">
      <label for="a">メールアドレス</label><input id="a" name="m1">
      <label for="b">メールアドレス（確認）</label><input id="b" name="m2">
    </form>`),
  );

  const result = await runRedundantEntryCheck({
    page,
    outputDir: testInfo.outputDir,
  });

  expect(result.details.groups).toHaveLength(1);
  expect(result.details.groups[0]?.purpose).toBe('email');
  expect(result.details.groups[0]?.kind).toBe('repeated');
  expect(result.details.groups[0]?.fields.map((f) => f.purposeSource)).toEqual([
    'label',
    'label',
  ]);
  expect(
    validateEnvelope(result),
    JSON.stringify(validateEnvelope.errors),
  ).toBe(true);
});

test('new-password が 2 つあってもグループにならない', async ({
  page,
}, testInfo) => {
  await page.setContent(
    html(`<form id="f">
      <input id="a" type="password" autocomplete="new-password" aria-label="Password">
      <input id="b" type="password" autocomplete="new-password" aria-label="Password (confirm)">
    </form>`),
  );

  const result = await runRedundantEntryCheck({
    page,
    outputDir: testInfo.outputDir,
  });

  expect(result.details.groups).toEqual([]);
  expect(result.passes.map((r) => r.id)).toEqual([
    'a11y-skills/redundant-entry',
  ]);
  expect(
    validateEnvelope(result),
    JSON.stringify(validateEnvelope.errors),
  ).toBe(true);
});

test('別の section-* の同じ目的の欄はグループにならない', async ({
  page,
}, testInfo) => {
  await page.setContent(
    html(`<form id="f">
      <input id="a" autocomplete="section-guest1 name" aria-label="Guest 1">
      <input id="b" autocomplete="section-guest2 name" aria-label="Guest 2">
    </form>`),
  );

  const result = await runRedundantEntryCheck({
    page,
    outputDir: testInfo.outputDir,
  });

  expect(result.details.groups).toEqual([]);
  expect(
    validateEnvelope(result),
    JSON.stringify(validateEnvelope.errors),
  ).toBe(true);
});

test('別の form の同じ目的の欄はグループにならない', async ({
  page,
}, testInfo) => {
  await page.setContent(
    html(`<form id="login"><input id="a" autocomplete="email" aria-label="Email"></form>
    <form id="news"><input id="b" autocomplete="email" aria-label="Email"></form>`),
  );

  const result = await runRedundantEntryCheck({
    page,
    outputDir: testInfo.outputDir,
  });

  expect(result.details.groups).toEqual([]);
  expect(result.details.fieldsWithPurpose).toBe(2);
  expect(
    validateEnvelope(result),
    JSON.stringify(validateEnvelope.errors),
  ).toBe(true);
});

test('欄が 1 つもないページは inapplicable になる', async ({
  page,
}, testInfo) => {
  await page.setContent(html('<p>No form here.</p>'));

  const result = await runRedundantEntryCheck({
    page,
    outputDir: testInfo.outputDir,
  });

  expect(result.inapplicable.map((r) => r.id)).toEqual([
    'a11y-skills/redundant-entry',
  ]);
  expect(result.details.totalFieldsChecked).toBe(0);
  expect(
    validateEnvelope(result),
    JSON.stringify(validateEnvelope.errors),
  ).toBe(true);
});

for (const formId of ['checkout.form', '1-step']) {
  test(`id が ${formId} の form の中で同じ目的の欄が重なっても、例外にならず form 内のコピー手段を拾う`, async ({
    page,
  }, testInfo) => {
    await page.setContent(
      html(`<form id="${formId}">
        <input id="a" autocomplete="shipping email" aria-label="Shipping email">
        <label><input type="checkbox" id="same"> Same as shipping</label>
        <input id="b" autocomplete="billing email" aria-label="Billing email">
      </form>`),
    );

    const result = await runRedundantEntryCheck({
      page,
      outputDir: testInfo.outputDir,
    });

    expect(result.details.groups).toHaveLength(1);
    expect(
      result.details.groups[0]?.copyControls.map((c) => c.selector),
    ).toEqual(['#same']);
  });
}
