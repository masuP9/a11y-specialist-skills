/**
 * Drift guard between the ported package functions and the original skill
 * vendor scripts.
 *
 * Until Block B replaces the skill scripts with thin wrappers around this
 * package (after 1.0.0), the same check logic lives in two places:
 *   - skills/auditing-wcag/references/scripts/*.ts  (skill, canonical for now)
 *   - packages/a11y-audit/src/**                    (this package)
 *
 * This test runs both against an identical fixture and asserts the written
 * result JSON matches, so the two copies cannot silently diverge. PLAN scopes
 * the minimum parity coverage to axe + reflow.
 *
 * The package side imports the BUILT dist (pretest builds it). The skill side
 * is run as a subprocess via the skill's own Playwright config.
 */

import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAxeAudit, runReflowCheck } from '../dist/playwright/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(here, '..');
const repoRoot = path.resolve(packageDir, '..', '..');
const skillScriptsDir = path.join(
  repoRoot,
  'skills',
  'auditing-wcag',
  'references',
  'scripts'
);

const PARITY_FIXTURE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>parity fixture</title>
<style>
  body { margin: 0; }
  .wide { width: 1200px; height: 80px; background: #c00; }
  .tiny { width: 10px; height: 10px; padding: 0; border: 0; }
</style></head>
<body>
  <img src="missing.png">
  <a href="#"></a>
  <input type="text">
  <div class="wide">A very wide block that cannot fit into a 320px viewport.</div>
  <button id="b1" class="tiny">a</button><button id="b2" class="tiny">b</button>
</body></html>`;

const FIXTURE_URL = 'data:text/html,' + encodeURIComponent(PARITY_FIXTURE);

/** Drop volatile fields so two runs of the same logic compare equal. */
function normalize(result: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(result));
  delete clone.timestamp; // axe stamps wall-clock time
  delete clone.screenshotPath; // absolute path, run-specific (not in axe/reflow)
  return clone;
}

/** Run a single skill check as a subprocess and return its written result JSON. */
function runSkillCheck(testFile: string, resultFile: string): Record<string, unknown> {
  const resultPath = path.join(skillScriptsDir, resultFile);
  if (fs.existsSync(resultPath)) fs.rmSync(resultPath);
  try {
    execFileSync('npx', ['playwright', 'test', testFile], {
      cwd: skillScriptsDir,
      env: { ...process.env, TEST_PAGE: FIXTURE_URL },
      stdio: 'pipe',
    });
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `skill ${testFile} failed:\n${err.stdout?.toString() ?? ''}\n${err.stderr?.toString() ?? ''}`
    );
  }
  const json = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  return json;
}

test.describe('parity: package functions vs skill vendor scripts', () => {
  // The skill side runs as a subprocess using the skill's own Playwright
  // install. Skip locally when those deps aren't present; CI installs them.
  test.skip(
    !fs.existsSync(path.join(skillScriptsDir, 'node_modules')),
    'skill script deps not installed (run `npm ci` in the skill scripts dir)'
  );

  test('axe audit produces identical result JSON', async ({ page }, testInfo) => {
    // Package side: write to a temp dir, then read the written file.
    await page.goto(FIXTURE_URL, { waitUntil: 'networkidle' });
    await runAxeAudit({ page, outputDir: testInfo.outputDir });
    const pkg = JSON.parse(
      fs.readFileSync(path.join(testInfo.outputDir, 'axe-result.json'), 'utf8')
    );

    // Skill side: subprocess.
    const skill = runSkillCheck('axe-audit.ts', 'axe-result.json');

    expect(normalize(pkg)).toEqual(normalize(skill));
  });

  test('reflow check produces identical result JSON', async ({ page }, testInfo) => {
    // Match the skill's ordering (narrow viewport before navigation).
    await page.setViewportSize({ width: 320, height: 256 });
    await page.goto(FIXTURE_URL, { waitUntil: 'networkidle' });
    await runReflowCheck({ page, outputDir: testInfo.outputDir });
    const pkg = JSON.parse(
      fs.readFileSync(path.join(testInfo.outputDir, 'reflow-result.json'), 'utf8')
    );

    const skill = runSkillCheck('reflow-check.ts', 'reflow-result.json');

    expect(normalize(pkg)).toEqual(normalize(skill));
  });
});
