/**
 * Axe-core Accessibility Audit (broad WCAG coverage)
 *
 * Runs axe-core automated accessibility testing on the *current* page. The
 * caller is responsible for navigating the page (e.g. `await page.goto(url)`)
 * before calling this function.
 *
 * Axe-core cannot detect all accessibility issues — manual testing and the
 * other checks in this package are still needed for complete coverage.
 */

import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { AxeAuditResult } from '../types.js';
import {
  AUDIT_DISCLAIMER,
  DEFAULT_AXE_TAGS,
  DEFAULT_AXE_RESULT_FILE,
} from '../constants.js';
import {
  saveAuditResult,
  logAuditHeader,
  logSummary,
  logOutputPaths,
  type OutputLocationOptions,
} from '../utils/test-harness.js';

export interface RunAxeAuditOptions extends OutputLocationOptions {
  /** A page already navigated to the target URL. */
  page: Page;
  /** axe-core tags to run with (default: WCAG 2.0/2.1/2.2 A & AA). */
  tags?: readonly string[];
  /** axe rule overrides, forwarded to `AxeBuilder.options({ rules })`. */
  rules?: Record<string, { enabled: boolean }>;
}

/**
 * Run an axe-core audit against the current page, write the result JSON, and
 * return the parsed result.
 */
export async function runAxeAudit(
  options: RunAxeAuditOptions
): Promise<AxeAuditResult> {
  const { page, tags = DEFAULT_AXE_TAGS, rules, ...location } = options;

  let builder = new AxeBuilder({ page }).withTags([...tags]);
  if (rules) {
    builder = builder.options({ rules });
  }
  const axeResults = await builder.analyze();

  const result: AxeAuditResult = {
    url: page.url(),
    timestamp: new Date().toISOString(),
    violations: axeResults.violations.map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      tags: v.tags,
      nodes: v.nodes.map((n) => ({
        html: n.html,
        target: n.target as string[],
        failureSummary: n.failureSummary,
      })),
    })),
    passes: axeResults.passes.length,
    incomplete: axeResults.incomplete.length,
    inapplicable: axeResults.inapplicable.length,
    violationCount: axeResults.violations.length,
    disclaimer: AUDIT_DISCLAIMER,
  };

  // Output results
  logAuditHeader('Axe-core Accessibility Audit Results', 'axe-core', result.url);

  logSummary({
    Timestamp: result.timestamp,
    Violations: result.violationCount,
    Passes: result.passes,
    'Incomplete (needs review)': result.incomplete,
    Inapplicable: result.inapplicable,
  });

  if (result.violations.length > 0) {
    console.log('\n--- Violations ---');
    result.violations.forEach((v, i) => {
      console.log(
        `\n  ${i + 1}. [${v.impact?.toUpperCase() || 'UNKNOWN'}] ${v.id}`
      );
      console.log(`     ${v.help}`);
      console.log(`     Affected: ${v.nodes.length} element(s)`);
      console.log(
        `     Tags: ${v.tags.filter((t) => t.startsWith('wcag')).join(', ')}`
      );

      // Show first 3 affected elements
      v.nodes.slice(0, 3).forEach((n, j) => {
        const htmlPreview =
          n.html.length > 80 ? n.html.substring(0, 80) + '...' : n.html;
        console.log(`       ${j + 1}. ${htmlPreview}`);
      });
      if (v.nodes.length > 3) {
        console.log(`       ... and ${v.nodes.length - 3} more`);
      }
    });
  }

  console.log(`\n--- Summary ---`);
  if (result.violationCount === 0) {
    console.log('No violations detected by axe-core');
  } else {
    const totalElements = result.violations.reduce(
      (sum, v) => sum + v.nodes.length,
      0
    );
    console.log(
      `Found ${result.violationCount} violation type(s) affecting ${totalElements} element(s)`
    );
  }

  // axe results already carry the disclaimer field; don't append it again.
  const resolvedPath = saveAuditResult(result, {
    ...location,
    defaultFile: DEFAULT_AXE_RESULT_FILE,
    includeDisclaimer: false,
  });
  logOutputPaths(resolvedPath);

  return result;
}
