/**
 * Autocomplete Audit
 *
 * WCAG 1.3.5 (Identify Input Purpose)
 *
 * This script:
 * 1. Finds all form fields (input, select, textarea)
 * 2. Uses ariaSnapshot() to get accessible names (follows ARIA naming algorithm)
 * 3. Matches field names/ids/labels to expected autocomplete tokens
 * 4. Reports fields missing autocomplete attribute
 * 5. Reports fields with invalid autocomplete values
 *
 * WCAG 1.3.5 requires that the purpose of input fields can be programmatically
 * determined when the field collects information about the user.
 *
 * Key technique:
 * - Uses Playwright's ariaSnapshot() API to compute accessible names
 *   instead of manually traversing label/aria-label/aria-labelledby
 *
 * Limitations:
 * - Cannot confirm actual field purpose; pattern matching is heuristic
 * - Manual verification needed for edge cases
 */

import { test } from '@playwright/test';
import type { AutocompleteIssue } from './types';
import {
  AUTOCOMPLETE_FIELD_PATTERNS,
  VALID_AUTOCOMPLETE_TOKENS,
} from './constants';
import {
  getTargetUrl,
  logAuditHeader,
  logSummary,
  logIssueList,
  saveAuditResult,
  logOutputPaths,
} from './utils/test-harness';

interface FieldInfo {
  selector: string;
  tagName: string;
  inputType: string;
  name: string | null;
  id: string | null;
  labelText: string | null;
  placeholder: string | null;
  autocomplete: string | null;
}

/** Basic field info collected from DOM (without accessible name) */
interface BasicFieldInfo {
  selector: string;
  tagName: string;
  inputType: string;
  name: string | null;
  id: string | null;
  placeholder: string | null;
  autocomplete: string | null;
}

/**
 * Collect basic form field information in browser context
 * Accessible names are retrieved separately via ariaSnapshot()
 */
function collectBasicFieldInfo(): BasicFieldInfo[] {
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
    return path.length > 0 ? path.join(' > ') : `[data-index="${elementIndex}"]`;
  }

  const skipTypes = ['hidden', 'submit', 'reset', 'button', 'image', 'file'];
  const fields: BasicFieldInfo[] = [];
  const elements = document.querySelectorAll('input, select, textarea');

  elements.forEach((element, index) => {
    const el = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

    if (el instanceof HTMLInputElement && skipTypes.includes(el.type)) {
      return;
    }

    const inputType = el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase();
    const autocompleteAttr = el.getAttribute('autocomplete');

    fields.push({
      selector: getUniqueSelector(element, index),
      tagName: el.tagName.toLowerCase(),
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
 * Extract accessible name from ariaSnapshot output
 * ariaSnapshot returns YAML-like format: "- role \"accessible name\""
 */
function parseAccessibleName(snapshot: string): string | null {
  // ariaSnapshot format: "- textbox \"Email address\"" or "- textbox \"Email address\" [focused]"
  const match = snapshot.match(/^- \w+(?:\s+"([^"]*)")?/);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

/**
 * Find pattern match for a field across name, id, label, and placeholder
 */
function findPatternMatch(
  field: FieldInfo,
  patterns: [string, RegExp][]
): { token: string; matchedBy: 'name' | 'id' | 'label' | 'placeholder' } | null {
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
 * Analyze fields for autocomplete issues
 */
function analyzeFields(
  fields: FieldInfo[],
  patterns: [string, RegExp][],
  validTokens: readonly string[]
): { missing: AutocompleteIssue[]; invalid: AutocompleteIssue[] } {
  const missing: AutocompleteIssue[] = [];
  const invalid: AutocompleteIssue[] = [];

  for (const field of fields) {
    const match = findPatternMatch(field, patterns);

    if (!match) {
      continue;
    }

    const { token: expectedToken, matchedBy } = match;

    if (!field.autocomplete || field.autocomplete === 'off') {
      missing.push({
        selector: field.selector,
        tagName: field.tagName,
        inputType: field.inputType,
        name: field.name,
        id: field.id,
        labelText: field.labelText,
        currentAutocomplete: field.autocomplete,
        expectedToken,
        matchedBy,
        issueType: 'missing',
      });
      continue;
    }

    const autocompleteTokens = field.autocomplete.toLowerCase().split(/\s+/);
    const mainToken = autocompleteTokens[autocompleteTokens.length - 1];

    if (!validTokens.includes(mainToken as typeof validTokens[number])) {
      invalid.push({
        selector: field.selector,
        tagName: field.tagName,
        inputType: field.inputType,
        name: field.name,
        id: field.id,
        labelText: field.labelText,
        currentAutocomplete: field.autocomplete,
        expectedToken,
        matchedBy,
        issueType: 'invalid',
      });
    }
  }

  return { missing, invalid };
}

test('autocomplete audit (WCAG 1.3.5)', async ({ page }) => {
  const targetUrl = getTargetUrl('?preset=3.3-input-assist');
  await page.goto(targetUrl, { waitUntil: 'networkidle' });

  // Collect basic field info from DOM
  const basicFields = await page.evaluate(collectBasicFieldInfo);

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

  const patterns = Object.entries(AUTOCOMPLETE_FIELD_PATTERNS) as [string, RegExp][];
  const { missing, invalid } = analyzeFields(fields, patterns, VALID_AUTOCOMPLETE_TOKENS);

  const result = {
    url: page.url(),
    totalFieldsChecked: fields.length,
    missingAutocomplete: missing,
    invalidAutocomplete: invalid,
  };

  const outputPath = 'autocomplete-result.json';

  // Output results
  logAuditHeader('Autocomplete Audit Results', 'WCAG 1.3.5', result.url);

  logSummary({
    'Total form fields': result.totalFieldsChecked,
    'Fields missing autocomplete': result.missingAutocomplete.length,
    'Fields with invalid autocomplete': result.invalidAutocomplete.length,
  });

  logIssueList<AutocompleteIssue>(
    'Missing Autocomplete',
    result.missingAutocomplete,
    (el, i) => [
      `${i + 1}. <${el.tagName}> "${el.selector}"`,
      `   name: ${el.name || 'none'}, id: ${el.id || 'none'}`,
      `   label: "${el.labelText || 'none'}"`,
      `   Expected: autocomplete="${el.expectedToken}" (matched by ${el.matchedBy})`,
    ]
  );

  logIssueList<AutocompleteIssue>(
    'Invalid Autocomplete',
    result.invalidAutocomplete,
    (el, i) => [
      `${i + 1}. <${el.tagName}> "${el.selector}"`,
      `   Current: autocomplete="${el.currentAutocomplete}"`,
      `   Expected: autocomplete="${el.expectedToken}"`,
    ]
  );

  saveAuditResult(result, { outputPath });
  logOutputPaths(outputPath);
});
