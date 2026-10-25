# Plan 002: Cache Playwright browsers in CI to cut redundant downloads

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 6e090c7..HEAD -- .github/workflows/ci.yml`
> If `ci.yml` changed since this plan was written, compare the "Current state"
> excerpts against the live file before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf (CI)
- **PR**: https://github.com/masuP9/a11y-specialist-skills/pull/24 (CI-verified miss→hit, 2026-06-11)
- **Planned at**: commit `f86de93`, 2026-06-11 (re-verified against `6e090c7` same day: ci.yml gained a `skill-compatibility` job + path filters since f86de93, but both in-scope install-step regions still match the Current state excerpts exactly)

## Why this matters

Both CI jobs download Chromium from scratch on every run (`npx playwright
install --with-deps chromium`, ~150–250 MB each plus apt system deps). That is
two cold downloads per push/PR, several minutes of wasted wall-clock per run,
on a repo where the Playwright version changes rarely. Caching
`~/.cache/ms-playwright` keyed by the resolved `@playwright/test` version makes
warm runs skip the browser download entirely; only the (fast) system-deps
install still runs.

## Current state

`.github/workflows/ci.yml` has two jobs. Job 1 `a11y-audit-package` contains:

```yaml
      - name: Install dependencies
        run: npm ci

      - name: Type-check & build
        run: npm run build --workspace @a11y-skills/audit

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
        working-directory: packages/a11y-audit
```

Job 2 `wcag-audit-tests` has `defaults.run.working-directory:
skills/auditing-wcag/references/scripts` and contains:

```yaml
      - name: Install dependencies
        run: npm ci

      - name: Type-check (wrappers resolve @a11y-skills/audit)
        run: npm run typecheck

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
```

Notes the executor needs:

- The two jobs resolve `@playwright/test` from **different** node_modules
  trees: job 1 from the root workspace install (`npm ci` at repo root, package
  declared in `packages/a11y-audit/package.json` as `^1.50.0`), job 2 from
  `skills/auditing-wcag/references/scripts/package.json` (`^1.58.0`). The cache
  key must use each job's own resolved version — do not share one hardcoded key.
- Playwright system dependencies (apt packages) are NOT covered by the
  browser cache; on a cache hit you must still run `npx playwright
  install-deps chromium`.
- Repo workflow conventions: official actions only (`actions/checkout@v4`,
  `actions/setup-node@v4`), `ubuntu-latest`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Validate workflow YAML | `npx --yes js-yaml .github/workflows/ci.yml > /dev/null` | exit 0 |
| Resolve PW version (job-1 tree) | `node -p "require('@playwright/test/package.json').version"` run in `packages/a11y-audit` | prints a version like `1.5x.x` |
| Resolve PW version (job-2 tree) | same command run in `skills/auditing-wcag/references/scripts` | prints a version |

(The version commands require node_modules to exist; in CI they run after
`npm ci`. Locally, only run them if node_modules is already present — do NOT
run `npm install` to create it; this advisor repo rule forbids tree mutation,
and CI is the real verification environment.)

## Scope

**In scope** (the only file you should modify):
- `.github/workflows/ci.yml`

**Out of scope** (do NOT touch):
- `.github/workflows/release.yml` — Plan 003's territory; it also doesn't run
  browsers.
- Any `package.json` / lockfile — no dependency changes are needed.
- Merging the two CI jobs into one — they intentionally test two different
  consumer setups (workspace build vs. published-package wrappers).

## Git workflow

- Branch: `ci/playwright-browser-cache`
- Commit: `ci: cache Playwright browsers keyed by @playwright/test version`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add caching to job `a11y-audit-package`

Replace the single "Install Playwright browsers" step (shown in Current state)
with these four steps, in this order, keeping surrounding steps untouched:

```yaml
      - name: Get Playwright version
        id: playwright-version
        run: echo "version=$(node -p "require('@playwright/test/package.json').version")" >> "$GITHUB_OUTPUT"
        working-directory: packages/a11y-audit

      - name: Cache Playwright browsers
        id: playwright-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ steps.playwright-version.outputs.version }}

      - name: Install Playwright browsers
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: npx playwright install --with-deps chromium
        working-directory: packages/a11y-audit

      - name: Install Playwright system deps
        if: steps.playwright-cache.outputs.cache-hit == 'true'
        run: npx playwright install-deps chromium
        working-directory: packages/a11y-audit
```

**Verify**: `npx --yes js-yaml .github/workflows/ci.yml > /dev/null` → exit 0.

### Step 2: Add caching to job `wcag-audit-tests`

Same transformation in job 2. Because this job already has
`defaults.run.working-directory: skills/auditing-wcag/references/scripts`,
do NOT add `working-directory:` to the `run:` steps; the `actions/cache` step
is unaffected by run defaults. Use distinct step ids are fine to keep the same
(`playwright-version` / `playwright-cache`) since ids are job-scoped:

```yaml
      - name: Get Playwright version
        id: playwright-version
        run: echo "version=$(node -p "require('@playwright/test/package.json').version")" >> "$GITHUB_OUTPUT"

      - name: Cache Playwright browsers
        id: playwright-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ steps.playwright-version.outputs.version }}

      - name: Install Playwright browsers
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: npx playwright install --with-deps chromium

      - name: Install Playwright system deps
        if: steps.playwright-cache.outputs.cache-hit == 'true'
        run: npx playwright install-deps chromium
```

**Verify**: `npx --yes js-yaml .github/workflows/ci.yml > /dev/null` → exit 0,
and `grep -c "actions/cache@v4" .github/workflows/ci.yml` → `2`.

### Step 3: CI verification (requires operator approval to push)

Workflow changes can only be fully verified by running them. Ask the operator
for permission to push the branch and open a draft PR. If granted:

- First run: both jobs log a cache miss and `Install Playwright browsers` runs;
  jobs end green.
- Re-run the workflow (`gh run rerun <id>` or push a trivial commit): both jobs
  log `Cache restored from key: playwright-Linux-...`, the install step is
  skipped, `Install Playwright system deps` runs, jobs end green.

If push permission is not granted, report the plan as complete-pending-CI and
note it in the status row (`IN PROGRESS — awaiting CI verification`).

## Test plan

No code tests; the workflow runs in Step 3 are the test. Expected observable:
warm-cache runs skip the ~1–3 minute browser download in both jobs.

## Done criteria

ALL must hold:

- [ ] `npx --yes js-yaml .github/workflows/ci.yml` exits 0
- [ ] `grep -c "actions/cache@v4" .github/workflows/ci.yml` prints `2`
- [ ] Both jobs gate browser install on `cache-hit != 'true'` and run `install-deps` on hit
- [ ] No files outside `.github/workflows/ci.yml` modified (`git status`, plus `plans/README.md`)
- [ ] CI verified green per Step 3, or explicitly recorded as awaiting CI
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `ci.yml` no longer matches the Current state excerpts (drifted).
- A CI run on the branch fails in a Playwright-launch step after the cache is
  introduced (e.g. `browserType.launch: Executable doesn't exist`) — that means
  the cache key/path assumption is wrong for this runner image; do not iterate
  more than twice.
- You find yourself wanting to change anything other than the two install-step
  regions of `ci.yml`.

## Maintenance notes

- When either tree bumps `@playwright/test`, the key changes automatically and
  the first run repopulates the cache — no manual invalidation needed.
- Reviewer should check: the `if:` conditions use string comparison
  (`!= 'true'`), which is the documented actions/cache contract.
- Deferred: caching apt system deps (`install-deps`) — not worth the
  complexity; it is fast relative to the browser download.
