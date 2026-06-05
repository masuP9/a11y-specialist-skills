/**
 * @a11y-skills/audit
 *
 * Playwright + axe-core based WCAG 2.2 accessibility audit functions.
 *
 * - Main subpath (`@a11y-skills/audit`): shared types & constants.
 * - `@a11y-skills/audit/playwright`: the `runXxx()` function API.
 * - `@a11y-skills/audit/test-entries/*`: ready-to-run compatibility entries,
 *   run via a one-line local re-export spec (`import "...test-entries/axe-audit"`).
 * - `@a11y-skills/audit/schemas`: result types & JSON Schemas.
 */

export * from './types.js';
export {
  AUDIT_DISCLAIMER,
  DEFAULT_AXE_TAGS,
  REFLOW_VIEWPORT,
  TARGET_SIZE_AA,
  TARGET_SIZE_AAA,
} from './constants.js';
