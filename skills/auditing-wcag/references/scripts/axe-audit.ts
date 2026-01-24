/**
 * Axe-core Accessibility Audit
 *
 * Runs axe-core automated accessibility testing on the target page.
 * Axe-core detects many WCAG 2.x violations automatically.
 *
 * This complements the custom WCAG scripts by providing:
 * - Broad coverage of WCAG success criteria
 * - Industry-standard violation detection
 * - Detailed remediation guidance
 *
 * Note: Axe-core cannot detect all accessibility issues.
 * Manual testing and custom scripts are still needed for complete coverage.
 */

import { test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { AUDIT_DISCLAIMER } from './constants';
import {
  getTargetUrl,
  logAuditHeader,
  logSummary,
  saveAuditResult,
  logOutputPaths,
} from './utils/test-harness';

interface AxeAuditResult {
  url: string;
  timestamp: string;
  violations: {
    id: string;
    impact: string | null;
    description: string;
    help: string;
    helpUrl: string;
    tags: string[];
    nodes: {
      html: string;
      target: string[];
      failureSummary: string | undefined;
    }[];
  }[];
  passes: number;
  incomplete: number;
  inapplicable: number;
  violationCount: number;
  disclaimer: typeof AUDIT_DISCLAIMER;
}

test('axe-core accessibility audit', async ({ page }) => {
  const targetUrl = getTargetUrl('?preset=ng-terrible1&wcagver=22');
  await page.goto(targetUrl, { waitUntil: 'networkidle' });

  // Run axe-core analysis
  const axeResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  // Format results
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

  const outputPath = 'axe-result.json';

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
      console.log(`\n  ${i + 1}. [${v.impact?.toUpperCase() || 'UNKNOWN'}] ${v.id}`);
      console.log(`     ${v.help}`);
      console.log(`     Affected: ${v.nodes.length} element(s)`);
      console.log(`     Tags: ${v.tags.filter((t) => t.startsWith('wcag')).join(', ')}`);

      // Show first 3 affected elements
      v.nodes.slice(0, 3).forEach((n, j) => {
        const htmlPreview = n.html.length > 80 ? n.html.substring(0, 80) + '...' : n.html;
        console.log(`       ${j + 1}. ${htmlPreview}`);
      });
      if (v.nodes.length > 3) {
        console.log(`       ... and ${v.nodes.length - 3} more`);
      }
    });
  }

  // Summary
  console.log(`\n--- Summary ---`);
  if (result.violationCount === 0) {
    console.log('No violations detected by axe-core');
  } else {
    const totalElements = result.violations.reduce((sum, v) => sum + v.nodes.length, 0);
    console.log(`Found ${result.violationCount} violation type(s) affecting ${totalElements} element(s)`);
  }

  saveAuditResult(result, { outputPath, includeDisclaimer: false });
  logOutputPaths(outputPath);
});
