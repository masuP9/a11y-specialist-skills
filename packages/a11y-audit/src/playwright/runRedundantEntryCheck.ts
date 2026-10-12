/**
 * Redundant Entry Check — WCAG 3.3.7 (Redundant Entry)
 *
 * Finds fields in the same form (or the whole page when a field has no form)
 * that ask for the same information more than once: the same `autocomplete`
 * purpose, or a purpose inferred from name/id/label/placeholder after removing
 * words such as "shipping", "billing" and "confirm". Such groups are reported
 * as candidates (`incomplete`), together with nearby controls whose text
 * suggests they copy or select the earlier entry ("same as shipping" etc.).
 *
 * The caller is responsible for navigating the page before calling this.
 *
 * Limitations:
 * - Multi-step flows that span several pages are out of scope: a single-page
 *   check cannot know what an earlier page asked for.
 * - Only fields within the same form (or the page, for fields outside forms)
 *   are compared; overlaps across different forms are not found.
 * - The purpose is inferred from words in name/id/label/placeholder; checkboxes
 *   and radio buttons are not candidate fields.
 * - `copyControls` are matched by visible text only; whether the value is
 *   actually copied is not verified.
 * - Fields hidden at load time (e.g. revealed by "billing address differs")
 *   are counted too.
 * - The 3.3.7 exceptions (essential, security, no longer valid) cannot be
 *   judged; only password / one-time-code fields are excluded.
 * - Shadow DOM and iframes are not inspected (same as autocomplete-audit).
 */

import type { Page } from '@playwright/test';
import type {
  RedundantEntryCheckDetails,
  RedundantEntryCheckResult,
  RedundantEntryCopyControl,
  RedundantEntryField,
  RedundantEntryGroup,
} from '../types.js';
import {
  AUTOCOMPLETE_CONTACT_TYPES,
  AUTOCOMPLETE_FIELD_PATTERNS,
  DEFAULT_REDUNDANT_ENTRY_RESULT_FILE,
  HTML_SNIPPET_MAX_LENGTH,
  REDUNDANT_ENTRY_CONFIRM_PATTERN,
  REDUNDANT_ENTRY_COPY_CONTROL_PATTERN,
  REDUNDANT_ENTRY_EXEMPT_PURPOSES,
  REDUNDANT_ENTRY_SCOPE_PATTERNS,
} from '../constants.js';
import {
  buildAuditResult,
  normalizeRedundantEntryCheck,
} from '../utils/axe-format.js';
import {
  createAuditOutput,
  type AuditOutputOptions,
} from '../utils/test-harness.js';
import {
  autocompleteTokens,
  collectBasicFieldInfo,
  findPatternMatch,
  isValidAutocompleteTokens,
  parseAccessibleName,
  type BasicFieldInfo,
  type FieldInfo,
} from './runAutocompleteAudit.js';

type Scope = 'shipping' | 'billing';
type PurposeSource = RedundantEntryField['purposeSource'];

const SCOPES = Object.keys(REDUNDANT_ENTRY_SCOPE_PATTERNS) as Scope[];

/**
 * Remove scope and confirmation words (and the brackets around them) so the
 * remainder can be matched against AUTOCOMPLETE_FIELD_PATTERNS.
 * The patterns have the `g` flag, which is safe with `replace` (it resets
 * `lastIndex`); they are never used with `.test()`.
 */
function stripWords(text: string | null): {
  text: string | null;
  scopes: Scope[];
} {
  if (!text) return { text, scopes: [] };
  const scopes: Scope[] = [];
  let stripped = text;
  for (const scope of SCOPES) {
    const replaced = stripped.replace(
      REDUNDANT_ENTRY_SCOPE_PATTERNS[scope],
      ' ',
    );
    if (replaced !== stripped) scopes.push(scope);
    stripped = replaced;
  }
  const withoutConfirm = stripped.replace(REDUNDANT_ENTRY_CONFIRM_PATTERN, ' ');
  const removedAny = scopes.length > 0 || withoutConfirm !== stripped;
  stripped = removedAny
    ? withoutConfirm.replace(/[()（）[\]【】]/g, ' ')
    : withoutConfirm;
  stripped = stripped
    .replace(/\s+/g, ' ')
    .replace(/^[-_ .:：]+|[-_ .:：]+$/g, '');
  return { text: stripped || null, scopes };
}

/** Scope named in a group heading (fieldset legend etc.), if any. */
function scopeFromGroupLabel(groupLabel: string | null): Scope | null {
  if (!groupLabel) return null;
  for (const scope of SCOPES) {
    // Non-global copy: a `g` regex used with `.test()` keeps `lastIndex`.
    const pattern = new RegExp(
      REDUNDANT_ENTRY_SCOPE_PATTERNS[scope].source,
      'i',
    );
    if (pattern.test(groupLabel)) return scope;
  }
  return null;
}

interface Classified {
  purpose: string;
  purposeSource: PurposeSource;
  scope: Scope | null;
  section: string | null;
  /** home / work / mobile / fax / pager from the autocomplete value. */
  contactType: string | null;
}

/** Decide purpose, scope and section of a field, or null when unknown. */
function classifyField(field: FieldInfo & BasicFieldInfo): Classified | null {
  const name = stripWords(field.name);
  const id = stripWords(field.id);
  const label = stripWords(field.labelText);
  const placeholder = stripWords(field.placeholder);
  // Scope words in name/id/label/placeholder, else the group heading. Used when
  // the autocomplete value has no explicit shipping/billing token.
  const inferredScope =
    [...name.scopes, ...id.scopes, ...label.scopes, ...placeholder.scopes][0] ??
    scopeFromGroupLabel(field.groupLabel);

  const tokens = autocompleteTokens(field.autocomplete ?? '');
  const isOnOff =
    tokens.length === 1 && (tokens[0] === 'on' || tokens[0] === 'off');
  if (tokens.length > 0 && !isOnOff && isValidAutocompleteTokens(tokens)) {
    const nameTokens = tokens.filter((token) => token !== 'webauthn');
    const purpose = nameTokens[nameTokens.length - 1];
    if (purpose) {
      return {
        purpose,
        purposeSource: 'autocomplete',
        scope: tokens.includes('shipping')
          ? 'shipping'
          : tokens.includes('billing')
            ? 'billing'
            : inferredScope,
        section: tokens.find((token) => token.startsWith('section-')) ?? null,
        contactType:
          tokens.find((token) =>
            (AUTOCOMPLETE_CONTACT_TYPES as readonly string[]).includes(token),
          ) ?? null,
      };
    }
  }

  const match = findPatternMatch(
    {
      ...field,
      name: name.text,
      id: id.text,
      labelText: label.text,
      placeholder: placeholder.text,
    },
    Object.entries(AUTOCOMPLETE_FIELD_PATTERNS) as [string, RegExp][],
  );
  if (!match) return null;

  return {
    purpose: match.token,
    purposeSource: match.matchedBy,
    scope: inferredScope,
    section: null,
    contactType: null,
  };
}

/**
 * Find controls (in the given form, or the whole page) whose visible text
 * suggests they copy or select an earlier entry. Runs in the browser.
 */
function collectCopyControls(args: {
  formSelectors: (string | null)[];
  patternSource: string;
  patternFlags: string;
}): Record<string, RedundantEntryCopyControl[]> {
  const pattern = new RegExp(args.patternSource, args.patternFlags);
  const clip = (text: string | null | undefined) =>
    (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);

  function getUniqueSelector(element: Element): string {
    if (element.id) return `#${element.id}`;
    const path: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (parent) {
        selector += `:nth-child(${Array.from(parent.children).indexOf(current) + 1})`;
      }
      path.unshift(selector);
      current = parent;
    }
    return path.join(' > ');
  }

  function matchingText(element: Element): string | null {
    const candidates: string[] = [];
    candidates.push(element.getAttribute('aria-label') ?? '');
    const labels = (element as HTMLInputElement).labels;
    if (labels)
      candidates.push(...Array.from(labels).map((l) => l.textContent ?? ''));
    if (element instanceof HTMLInputElement) {
      candidates.push(element.value);
    } else {
      candidates.push(element.textContent ?? '');
    }
    if (element instanceof HTMLSelectElement) {
      candidates.push(...Array.from(element.options).map((o) => o.text));
    }
    for (const candidate of candidates) {
      const text = clip(candidate);
      if (text && pattern.test(text)) return text;
    }
    return null;
  }

  const result: Record<string, RedundantEntryCopyControl[]> = {};
  for (const formSelector of args.formSelectors) {
    // A form selector of the form "#id" is not escaped, so ids such as
    // "checkout.form" or "1-step" are not valid CSS; look those up by id.
    const formElement = !formSelector
      ? null
      : formSelector.startsWith('#')
        ? document.getElementById(formSelector.slice(1))
        : document.querySelector(formSelector);
    const controls: RedundantEntryCopyControl[] = [];
    if (formSelector && !formElement) {
      result[formSelector] = controls;
      continue;
    }
    // Native controls belong to their owner form (`element.form`, which also
    // covers the `form` attribute); other elements belong to the form they
    // are inside, if any.
    const belongsToGroup = (element: Element): boolean => {
      const owner =
        element instanceof HTMLInputElement ||
        element instanceof HTMLButtonElement ||
        element instanceof HTMLSelectElement
          ? element.form
          : element.closest('form');
      return owner === formElement;
    };
    document
      .querySelectorAll(
        'input[type=checkbox], input[type=radio], button, select, [role=button], [role=checkbox], [role=switch]',
      )
      .forEach((element) => {
        if (!belongsToGroup(element)) return;
        const text = matchingText(element);
        if (text) {
          controls.push({
            selector: getUniqueSelector(element),
            tagName: element.tagName.toLowerCase(),
            text,
          });
        }
      });
    result[formSelector ?? ''] = controls;
  }
  return result;
}

export interface RunRedundantEntryCheckOptions extends AuditOutputOptions {
  /** A page already navigated to the target URL. */
  page: Page;
}

/**
 * Run the redundant entry check against the current page, write the result
 * JSON, and return the parsed result.
 */
export async function runRedundantEntryCheck(
  options: RunRedundantEntryCheckOptions,
): Promise<RedundantEntryCheckResult> {
  const { page, ...location } = options;
  const out = createAuditOutput({
    ...location,
    defaultFile: DEFAULT_REDUNDANT_ENTRY_RESULT_FILE,
  });

  const basicFields = (
    await page.evaluate(collectBasicFieldInfo, {
      htmlSnippetMaxLength: HTML_SNIPPET_MAX_LENGTH,
    })
  )
    // Same-name radios repeat by design; checkboxes are looked at as copy controls.
    .filter((f) => f.inputType !== 'checkbox' && f.inputType !== 'radio');

  const exempt: readonly string[] = REDUNDANT_ENTRY_EXEMPT_PURPOSES;
  const classified: RedundantEntryField[] = [];
  for (const basicField of basicFields) {
    let labelText: string | null = null;
    try {
      const snapshot = await page.locator(basicField.selector).ariaSnapshot();
      labelText = parseAccessibleName(snapshot);
    } catch {
      // If ariaSnapshot fails, labelText remains null
    }

    const field = { ...basicField, labelText };
    const info = classifyField(field);
    // Re-entering a password etc. is allowed (security exception).
    if (!info || exempt.includes(info.purpose)) continue;
    classified.push({
      selector: field.selector,
      tagName: field.tagName,
      html: field.html,
      htmlTruncated: field.htmlTruncated,
      inputType: field.inputType,
      name: field.name,
      id: field.id,
      labelText,
      autocomplete: field.autocomplete,
      ...info,
      formSelector: field.formSelector,
    });
  }

  // Group by (form, section, contact type, purpose); fields stay in DOM order.
  const byKey = new Map<string, RedundantEntryField[]>();
  for (const field of classified) {
    const key = JSON.stringify([
      field.formSelector,
      field.section,
      field.contactType,
      field.purpose,
    ]);
    byKey.set(key, [...(byKey.get(key) ?? []), field]);
  }
  const overlapping = [...byKey.values()].filter(
    (fields) => fields.length >= 2,
  );

  const formSelectors = [
    ...new Set(overlapping.map((g) => g[0]?.formSelector ?? null)),
  ];
  const copyControlsByForm =
    overlapping.length > 0
      ? await page.evaluate(collectCopyControls, {
          formSelectors,
          patternSource: REDUNDANT_ENTRY_COPY_CONTROL_PATTERN.source,
          patternFlags: REDUNDANT_ENTRY_COPY_CONTROL_PATTERN.flags,
        })
      : {};

  const groups: RedundantEntryGroup[] = overlapping.map((fields) => {
    const first = fields[0] as RedundantEntryField;
    return {
      purpose: first.purpose,
      formSelector: first.formSelector,
      kind:
        new Set(fields.map((f) => f.scope)).size > 1 ? 'scoped' : 'repeated',
      fields,
      copyControls: copyControlsByForm[first.formSelector ?? ''] ?? [],
    };
  });

  const details: RedundantEntryCheckDetails = {
    totalFieldsChecked: basicFields.length,
    fieldsWithPurpose: classified.length,
    groups,
  };

  const result: RedundantEntryCheckResult = buildAuditResult({
    source: 'redundant-entry-check',
    url: page.url(),
    details,
    buckets: normalizeRedundantEntryCheck(details),
  });

  out.header('Redundant Entry Check Results', 'WCAG 3.3.7', result.url);

  out.summary({
    'Total form fields': details.totalFieldsChecked,
    'Fields with a purpose': details.fieldsWithPurpose,
    'Groups asking for the same information': details.groups.length,
  });

  out.issueList<RedundantEntryGroup>(
    'Repeated Entry Candidates',
    details.groups,
    (group, i) => [
      `${i + 1}. "${group.purpose}" asked ${group.fields.length} times (${group.kind})`,
      ...group.fields.map(
        (f) => `   ${f.selector} (matched by ${f.purposeSource})`,
      ),
      group.copyControls.length > 0
        ? `   Possible copy controls: ${group.copyControls.map((c) => c.selector).join(', ')}`
        : '   No copy/select control found',
    ],
  );

  out.save(result);

  out.outputPaths();

  return result;
}
