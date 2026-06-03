/**
 * @masup9/a11y-audit
 *
 * Playwright + axe-core based WCAG 2.2 accessibility audit functions.
 *
 * - Main subpath (`@masup9/a11y-audit`): shared types & constants.
 * - `@masup9/a11y-audit/playwright`: the `runXxx()` function API.
 * - `@masup9/a11y-audit/test-entries/*`: ready-to-run compatibility entries
 *   for use with Playwright `testMatch`.
 * - `@masup9/a11y-audit/schemas`: result types & JSON Schemas.
 */

export * from './types.js';
export {
  AUDIT_DISCLAIMER,
  DEFAULT_AXE_TAGS,
  REFLOW_VIEWPORT,
  TARGET_SIZE_AA,
  TARGET_SIZE_AAA,
} from './constants.js';
