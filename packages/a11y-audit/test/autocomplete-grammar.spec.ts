/**
 * autocomplete-audit: the autocomplete value is checked against the HTML
 * autofill detail token grammar on every field, whether or not the field's
 * purpose was inferred.
 * https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill-detail-tokens
 *
 * Each case is a single field labelled "Memo" (matches no
 * AUTOCOMPLETE_FIELD_PATTERNS entry), so only the grammar decides the result.
 */

import { test, expect } from '@playwright/test';
import { runAutocompleteAudit } from '../dist/playwright/index.js';

const memoField = (autocomplete: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head>
  <body><form><label for="memo">Memo</label>
  <input id="memo" type="text" autocomplete="${autocomplete}"></form></body></html>`;

// Parameterized: [autocomplete value, why it is invalid]
const INVALID_VALUES: [string, string][] = [
  ['emial', 'misspelled field name'],
  ['email name', 'two field names'],
  ['mobile name', 'contact type before a non-contact field name'],
  ['work', 'contact type without a field name'],
  ['section-x', 'section without a field name'],
  ['shipping', 'shipping without a field name'],
  ['webauthn', 'webauthn without a field name'],
  ['shipping section-x street-address', 'shipping before section-*'],
  ['billing shipping street-address', 'both billing and shipping'],
  ['section-a section-b email', 'two section-* tokens'],
  ['home work tel', 'two contact types'],
  ['tel work', 'contact type after the field name'],
  ['webauthn username', 'webauthn before the field name'],
  ['username webauthn webauthn', 'webauthn twice'],
  ['on email', 'on combined with other tokens'],
  ['off off', 'off repeated'],
  ['email off', 'off combined with other tokens'],
  ['work\u00a0email', 'non-ASCII whitespace does not separate tokens'],
  ['email\u00a0', 'non-ASCII whitespace is part of the token'],
];

for (const [autocomplete, reason] of INVALID_VALUES) {
  test(`autocomplete="${autocomplete}" on a field whose purpose is not inferred is reported invalid (${reason})`, async ({
    page,
  }, testInfo) => {
    await page.setContent(memoField(autocomplete));

    const result = await runAutocompleteAudit({
      page,
      outputDir: testInfo.outputDir,
    });

    expect(
      result.details.invalidAutocomplete.map((f) => f.currentAutocomplete),
    ).toEqual([autocomplete]);
  });
}

// section- with an empty name is valid: only the first eight characters
// must match "section-".
const VALID_VALUES: string[] = [
  'on',
  'off',
  'OFF',
  'email',
  'section-x shipping street-address',
  'work email',
  'billing mobile tel',
  'home tel-national',
  'fax tel',
  'pager tel',
  'work impp',
  'shipping work email',
  'section-blue billing home tel-extension webauthn',
  'username webauthn',
  'current-password webauthn',
  'Section-X SHIPPING Postal-Code',
  '  work   email  ',
  'section- email',
];

for (const autocomplete of VALID_VALUES) {
  test(`autocomplete="${autocomplete}" on a field whose purpose is not inferred is not reported`, async ({
    page,
  }, testInfo) => {
    await page.setContent(memoField(autocomplete));

    const result = await runAutocompleteAudit({
      page,
      outputDir: testInfo.outputDir,
    });

    expect(result.details.invalidAutocomplete).toEqual([]);
    expect(result.details.missingAutocomplete).toEqual([]);
  });
}

test('an invalid value on a field whose purpose is not inferred has null expectedToken and matchedBy', async ({
  page,
}, testInfo) => {
  await page.setContent(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>t</title></head>
    <body><form><label for="contact-mail">連絡先メール</label>
    <input id="contact-mail" type="email" autocomplete="emial"></form></body></html>`);

  const result = await runAutocompleteAudit({
    page,
    outputDir: testInfo.outputDir,
  });

  expect(result.details.invalidAutocomplete).toHaveLength(1);
  expect(result.details.invalidAutocomplete[0]).toMatchObject({
    selector: '#contact-mail',
    labelText: '連絡先メール',
    currentAutocomplete: 'emial',
    expectedToken: null,
    matchedBy: null,
    issueType: 'invalid',
  });
  const rule = result.incomplete.find(
    (r) => r.id === 'a11y-skills/autocomplete-invalid-unverified',
  );
  expect(rule!.nodes[0].failureSummary).toContain('autocomplete="emial"');
  expect(rule!.nodes[0].failureSummary).not.toContain('null');
});

test('an invalid value on a field whose purpose is not inferred is incomplete, not a violation', async ({
  page,
}, testInfo) => {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head>
    <body><form><label for="q">Search</label>
    <input id="q" type="search" autocomplete="nope"></form></body></html>`);

  const result = await runAutocompleteAudit({
    page,
    outputDir: testInfo.outputDir,
  });

  expect(result.violations.map((r) => r.id)).toEqual([]);
  expect(result.incomplete.map((r) => r.id)).toEqual([
    'a11y-skills/autocomplete-invalid-unverified',
  ]);
});

test('an invalid value on a field whose purpose is inferred is a violation', async ({
  page,
}, testInfo) => {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head>
    <body><form><label for="e">Email</label>
    <input id="e" name="email" type="email" autocomplete="emial"></form></body></html>`);

  const result = await runAutocompleteAudit({
    page,
    outputDir: testInfo.outputDir,
  });

  expect(result.violations.map((r) => r.id)).toEqual([
    'a11y-skills/autocomplete-invalid',
  ]);
  expect(result.incomplete.map((r) => r.id)).toEqual([]);
});

test('a disabled field is not checked, even with an invalid value or a missing autocomplete', async ({
  page,
}, testInfo) => {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head>
    <body><form>
    <label for="memo">Memo</label><input id="memo" type="text" autocomplete="emial" disabled>
    <label for="e">Email</label><input id="e" name="email" type="email" disabled>
    </form></body></html>`);

  const result = await runAutocompleteAudit({
    page,
    outputDir: testInfo.outputDir,
  });

  expect(result.details.totalFieldsChecked).toBe(0);
  expect(result.details.invalidAutocomplete).toEqual([]);
  expect(result.details.missingAutocomplete).toEqual([]);
});

test('a field inside a disabled fieldset is not checked', async ({
  page,
}, testInfo) => {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head>
    <body><form><fieldset disabled>
    <label for="e">Email</label><input id="e" name="email" type="email">
    </fieldset></form></body></html>`);

  const result = await runAutocompleteAudit({
    page,
    outputDir: testInfo.outputDir,
  });

  expect(result.details.totalFieldsChecked).toBe(0);
});

test('a readonly field is not checked, even with an invalid value or a missing autocomplete', async ({
  page,
}, testInfo) => {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head>
    <body><form>
    <label for="memo">Memo</label><textarea id="memo" autocomplete="emial" readonly></textarea>
    <label for="e">Email</label><input id="e" name="email" type="email" readonly>
    </form></body></html>`);

  const result = await runAutocompleteAudit({
    page,
    outputDir: testInfo.outputDir,
  });

  expect(result.details.totalFieldsChecked).toBe(0);
  expect(result.details.invalidAutocomplete).toEqual([]);
  expect(result.details.missingAutocomplete).toEqual([]);
});

test('an invalid combination on a field whose purpose is inferred keeps expectedToken and matchedBy', async ({
  page,
}, testInfo) => {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head>
    <body><form><label for="e">Email</label>
    <input id="e" name="email" type="email" autocomplete="email name"></form></body></html>`);

  const result = await runAutocompleteAudit({
    page,
    outputDir: testInfo.outputDir,
  });

  expect(result.details.invalidAutocomplete).toHaveLength(1);
  expect(result.details.invalidAutocomplete[0]).toMatchObject({
    currentAutocomplete: 'email name',
    expectedToken: 'email',
    matchedBy: 'name',
    issueType: 'invalid',
  });
});
