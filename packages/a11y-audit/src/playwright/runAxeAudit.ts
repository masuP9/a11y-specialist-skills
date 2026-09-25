/**
 * Axe-core Accessibility Audit (broad WCAG coverage)
 *
 * Runs axe-core automated accessibility testing on the *current* page. The
 * caller is responsible for navigating the page (e.g. `await page.goto(url)`)
 * before calling this function.
 *
 * The normalized buckets are built from the RAW axe results (violations and
 * incomplete keep their nodes; passes/inapplicable keep rule metadata only),
 * and `details` records the execution configuration.
 *
 * Axe-core cannot detect all accessibility issues — manual testing and the
 * other checks in this package are still needed for complete coverage.
 */

import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { AxeAuditResult, AxeAuditDetails } from '../types.js';
import { DEFAULT_AXE_TAGS, DEFAULT_AXE_RESULT_FILE } from '../constants.js';
import { buildAuditResult, normalizeAxeResults } from '../utils/axe-format.js';
import {
  createAuditOutput,
  type AuditOutputOptions,
} from '../utils/test-harness.js';

export interface RunAxeAuditOptions extends AuditOutputOptions {
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
  options: RunAxeAuditOptions,
): Promise<AxeAuditResult> {
  const { page, tags = DEFAULT_AXE_TAGS, rules, ...location } = options;
  const out = createAuditOutput({
    ...location,
    defaultFile: DEFAULT_AXE_RESULT_FILE,
  });

  let builder = new AxeBuilder({ page }).withTags([...tags]);
  if (rules) {
    builder = builder.options({ rules });
  }
  const axeResults = await builder.analyze();

  const buckets = normalizeAxeResults(axeResults);
  const details: AxeAuditDetails = {
    tagsRun: [...tags],
    rulesOverride: rules ?? null,
    violationRuleCount: axeResults.violations.length,
    passRuleCount: axeResults.passes.length,
    incompleteRuleCount: axeResults.incomplete.length,
    inapplicableRuleCount: axeResults.inapplicable.length,
  };

  const result = buildAuditResult({
    source: 'axe-audit',
    url: page.url(),
    details,
    buckets,
  });

  // Output results
  out.header('Axe-core Accessibility Audit Results', 'axe-core', result.url);

  out.summary({
    Timestamp: result.timestamp,
    Violations: result.summary.violationCount,
    Passes: result.summary.passCount,
    'Incomplete (needs review)': result.summary.incompleteCount,
    Inapplicable: result.inapplicable.length,
  });

  if (result.violations.length > 0) {
    out.log('\n--- Violations ---');
    result.violations.forEach((v, i) => {
      out.log(
        `\n  ${i + 1}. [${v.impact?.toUpperCase() || 'UNKNOWN'}] ${v.id}`,
      );
      out.log(`     ${v.help}`);
      out.log(`     Affected: ${v.nodes.length} element(s)`);
      out.log(
        `     Tags: ${v.tags.filter((t) => t.startsWith('wcag')).join(', ')}`,
      );

      // Show first 3 affected elements
      v.nodes.slice(0, 3).forEach((n, j) => {
        const htmlPreview =
          n.html.length > 80 ? n.html.substring(0, 80) + '...' : n.html;
        out.log(`       ${j + 1}. ${htmlPreview}`);
      });
      if (v.nodes.length > 3) {
        out.log(`       ... and ${v.nodes.length - 3} more`);
      }
    });
  }

  out.log(`\n--- Summary ---`);
  if (result.summary.violationCount === 0) {
    out.log('No violations detected by axe-core');
  } else {
    const totalElements = result.violations.reduce(
      (sum, v) => sum + v.nodes.length,
      0,
    );
    out.log(
      `Found ${result.summary.violationCount} violation type(s) affecting ${totalElements} element(s)`,
    );
  }

  out.save(result);
  out.outputPaths();

  return result;
}
