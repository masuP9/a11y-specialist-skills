/**
 * Autocomplete Audit — WCAG 1.3.5 (Identify Input Purpose)
 *
 * Finds all form fields (input/select/textarea), uses Playwright's
 * `ariaSnapshot()` to compute accessible names (following the ARIA naming
 * algorithm), matches field names/ids/labels/placeholders to expected
 * autocomplete tokens, and reports those fields when autocomplete is missing.
 * Every field's autocomplete value is also checked against the HTML grammar
 * and reported as invalid when it breaks it, whether or not its purpose was
 * inferred. Disabled and readonly fields are skipped.
 *
 * The caller is responsible for navigating the page before calling this.
 *
 * Limitations:
 * - Cannot confirm actual field purpose; pattern matching is heuristic
 * - Manual verification needed for edge cases
 */

import type { Page } from '@playwright/test';
import type {
  AutocompleteAuditResult,
  AutocompleteAuditDetails,
  AutocompleteIssue,
} from '../types.js';
import {
  AUTOCOMPLETE_CONTACT_FIELD_NAMES,
  AUTOCOMPLETE_CONTACT_TYPES,
  AUTOCOMPLETE_FIELD_PATTERNS,
  AUTOCOMPLETE_NORMAL_FIELD_NAMES,
  DEFAULT_AUTOCOMPLETE_RESULT_FILE,
  HTML_SNIPPET_MAX_LENGTH,
} from '../constants.js';
import {
  buildAuditResult,
  normalizeAutocompleteAudit,
} from '../utils/axe-format.js';
import {
  createAuditOutput,
  type AuditOutputOptions,
} from '../utils/test-harness.js';

interface FieldInfo {
  selector: string;
  tagName: string;
  html: string;
  htmlTruncated: boolean;
  inputType: string;
  name: string | null;
  id: string | null;
  labelText: string | null;
  placeholder: string | null;
  autocomplete: string | null;
}

/** Basic field info collected from DOM (without accessible name). */
interface BasicFieldInfo {
  selector: string;
  tagName: string;
  html: string;
  htmlTruncated: boolean;
  inputType: string;
  name: string | null;
  id: string | null;
  placeholder: string | null;
  autocomplete: string | null;
}

/**
 * Collect basic form field information in browser context.
 * Accessible names are retrieved separately via ariaSnapshot().
 */
function collectBasicFieldInfo(args: {
  htmlSnippetMaxLength: number;
}): BasicFieldInfo[] {
  const { htmlSnippetMaxLength } = args;

  function getHtmlSnippet(element: Element): {
    html: string;
    htmlTruncated: boolean;
  } {
    let html = '';
    try {
      html = element.outerHTML || '';
    } catch {
      html = '';
    }
    if (!html) {
      return {
        html: `<${element.tagName.toLowerCase()}>`,
        htmlTruncated: false,
      };
    }
    if (html.length > htmlSnippetMaxLength) {
      return { html: html.slice(0, htmlSnippetMaxLength), htmlTruncated: true };
    }
    return { html, htmlTruncated: false };
  }

  function getUniqueSelector(element: Element, elementIndex: number): string {
    if (element.id) {
      return `#${element.id}`;
    }
    const path: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (parent) {
        const childIndex = Array.from(parent.children).indexOf(current) + 1;
        selector += `:nth-child(${childIndex})`;
      }
      path.unshift(selector);
      current = parent;
    }
    return path.length > 0
      ? path.join(' > ')
      : `[data-index="${elementIndex}"]`;
  }

  const skipTypes = ['hidden', 'submit', 'reset', 'button', 'image', 'file'];
  const fields: BasicFieldInfo[] = [];
  const elements = document.querySelectorAll('input, select, textarea');

  elements.forEach((element, index) => {
    const el = element as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement;

    if (el instanceof HTMLInputElement && skipTypes.includes(el.type)) {
      return;
    }
    // The user cannot fill in disabled (including via a disabled fieldset) or
    // readonly fields, so there is no input purpose to identify.
    if (
      el.matches(':disabled') ||
      (!(el instanceof HTMLSelectElement) && el.readOnly)
    ) {
      return;
    }

    const inputType =
      el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase();
    const autocompleteAttr = el.getAttribute('autocomplete');

    fields.push({
      selector: getUniqueSelector(element, index),
      tagName: el.tagName.toLowerCase(),
      ...getHtmlSnippet(element),
      inputType,
      name: el.name || null,
      id: el.id || null,
      placeholder:
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
          ? el.placeholder || null
          : null,
      autocomplete: autocompleteAttr,
    });
  });

  return fields;
}

/**
 * Extract accessible name from ariaSnapshot output.
 * ariaSnapshot returns YAML-like format: "- role \"accessible name\"".
 */
function parseAccessibleName(snapshot: string): string | null {
  // ariaSnapshot format: "- textbox \"Email address\"" or "- textbox \"Email address\" [focused]"
  const match = snapshot.match(/^- \w+(?:\s+"([^"]*)")?/);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

/** Find pattern match for a field across name, id, label, and placeholder. */
function findPatternMatch(
  field: FieldInfo,
  patterns: [string, RegExp][],
): {
  token: string;
  matchedBy: 'name' | 'id' | 'label' | 'placeholder';
} | null {
  for (const [token, pattern] of patterns) {
    if (field.name && pattern.test(field.name)) {
      return { token, matchedBy: 'name' };
    }
    if (field.id && pattern.test(field.id)) {
      return { token, matchedBy: 'id' };
    }
    if (field.labelText && pattern.test(field.labelText)) {
      return { token, matchedBy: 'label' };
    }
    if (field.placeholder && pattern.test(field.placeholder)) {
      return { token, matchedBy: 'placeholder' };
    }
  }
  return null;
}

/**
 * Lowercased tokens of an autocomplete value. The spec splits on ASCII
 * whitespace only (a non-breaking space stays inside a token) and compares
 * tokens ASCII case-insensitively.
 */
function autocompleteTokens(value: string): string[] {
  return value
    .replace(/[A-Z]/g, (c) => c.toLowerCase())
    .split(/[\t\n\f\r ]+/)
    .filter((token) => token !== '');
}

const includes = (list: readonly string[], token: string | undefined) =>
  token !== undefined && list.includes(token);

/**
 * Whether non-empty autocomplete tokens follow the HTML grammar: "on" or
 * "off" alone, or
 * [section-*] [shipping|billing] (field-name | [contact-type] contact-field-name) [webauthn].
 * https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill-detail-tokens
 *
 * Limitation: does not check whether a field name suits the control type
 * (e.g. "email" on <input type="checkbox">) or that webauthn is used only on
 * input/textarea.
 */
function isValidAutocompleteTokens(tokens: string[]): boolean {
  if (tokens.length === 1 && (tokens[0] === 'on' || tokens[0] === 'off')) {
    return true;
  }

  let i = 0;
  if (tokens[i]?.startsWith('section-')) i++;
  if (tokens[i] === 'shipping' || tokens[i] === 'billing') i++;
  if (includes(AUTOCOMPLETE_CONTACT_TYPES, tokens[i])) {
    i++;
    if (!includes(AUTOCOMPLETE_CONTACT_FIELD_NAMES, tokens[i])) return false;
    i++;
  } else if (
    includes(AUTOCOMPLETE_NORMAL_FIELD_NAMES, tokens[i]) ||
    includes(AUTOCOMPLETE_CONTACT_FIELD_NAMES, tokens[i])
  ) {
    i++;
  } else {
    return false;
  }
  if (tokens[i] === 'webauthn') i++;
  return i === tokens.length;
}

/**
 * Analyze fields for autocomplete issues.
 *
 * - missing: the purpose was inferred from name/id/label/placeholder, and the
 *   field has no autocomplete value (or "off").
 * - invalid: every field with an autocomplete value that breaks the grammar,
 *   whether or not its purpose was inferred (expectedToken/matchedBy are null
 *   when it was not).
 */
function analyzeFields(
  fields: FieldInfo[],
  patterns: [string, RegExp][],
): { missing: AutocompleteIssue[]; invalid: AutocompleteIssue[] } {
  const missing: AutocompleteIssue[] = [];
  const invalid: AutocompleteIssue[] = [];

  for (const field of fields) {
    const match = findPatternMatch(field, patterns);
    const tokens = autocompleteTokens(field.autocomplete ?? '');
    const toIssue = (issueType: 'missing' | 'invalid'): AutocompleteIssue => ({
      selector: field.selector,
      tagName: field.tagName,
      html: field.html,
      htmlTruncated: field.htmlTruncated,
      inputType: field.inputType,
      name: field.name,
      id: field.id,
      labelText: field.labelText,
      currentAutocomplete: field.autocomplete,
      expectedToken: match?.token ?? null,
      matchedBy: match?.matchedBy ?? null,
      issueType,
    });

    const isEmptyOrOff =
      tokens.length === 0 || (tokens.length === 1 && tokens[0] === 'off');
    if (match && isEmptyOrOff) {
      missing.push(toIssue('missing'));
    } else if (tokens.length > 0 && !isValidAutocompleteTokens(tokens)) {
      invalid.push(toIssue('invalid'));
    }
  }

  return { missing, invalid };
}

export interface RunAutocompleteAuditOptions extends AuditOutputOptions {
  /** A page already navigated to the target URL. */
  page: Page;
}

/**
 * Run the autocomplete audit against the current page, write the result JSON,
 * and return the parsed result.
 */
export async function runAutocompleteAudit(
  options: RunAutocompleteAuditOptions,
): Promise<AutocompleteAuditResult> {
  const { page, ...location } = options;
  const out = createAuditOutput({
    ...location,
    defaultFile: DEFAULT_AUTOCOMPLETE_RESULT_FILE,
  });

  // Collect basic field info from DOM
  const basicFields = await page.evaluate(collectBasicFieldInfo, {
    htmlSnippetMaxLength: HTML_SNIPPET_MAX_LENGTH,
  });

  // Enhance with accessible names via ariaSnapshot()
  const fields: FieldInfo[] = [];
  for (const basicField of basicFields) {
    const locator = page.locator(basicField.selector);
    let labelText: string | null = null;

    try {
      const snapshot = await locator.ariaSnapshot();
      labelText = parseAccessibleName(snapshot);
    } catch {
      // If ariaSnapshot fails, labelText remains null
    }

    fields.push({
      ...basicField,
      labelText,
    });
  }

  const patterns = Object.entries(AUTOCOMPLETE_FIELD_PATTERNS) as [
    string,
    RegExp,
  ][];
  const { missing, invalid } = analyzeFields(fields, patterns);

  const details: AutocompleteAuditDetails = {
    totalFieldsChecked: fields.length,
    missingAutocomplete: missing,
    invalidAutocomplete: invalid,
  };

  const result: AutocompleteAuditResult = buildAuditResult({
    source: 'autocomplete-audit',
    url: page.url(),
    details,
    buckets: normalizeAutocompleteAudit(details),
  });

  // Output results
  out.header('Autocomplete Audit Results', 'WCAG 1.3.5', result.url);

  out.summary({
    'Total form fields': details.totalFieldsChecked,
    'Fields missing autocomplete': details.missingAutocomplete.length,
    'Fields with invalid autocomplete': details.invalidAutocomplete.length,
  });

  out.issueList<AutocompleteIssue>(
    'Missing Autocomplete',
    details.missingAutocomplete,
    (el, i) => [
      `${i + 1}. <${el.tagName}> "${el.selector}"`,
      `   name: ${el.name || 'none'}, id: ${el.id || 'none'}`,
      `   label: "${el.labelText || 'none'}"`,
      `   Expected: autocomplete="${el.expectedToken}" (matched by ${el.matchedBy})`,
    ],
  );

  out.issueList<AutocompleteIssue>(
    'Invalid Autocomplete',
    details.invalidAutocomplete,
    (el, i) => [
      `${i + 1}. <${el.tagName}> "${el.selector}"`,
      `   Current: autocomplete="${el.currentAutocomplete}"`,
      ...(el.expectedToken === null
        ? []
        : [
            `   Expected: autocomplete="${el.expectedToken}" (matched by ${el.matchedBy})`,
          ]),
    ],
  );

  out.save(result);

  out.outputPaths();

  return result;
}
