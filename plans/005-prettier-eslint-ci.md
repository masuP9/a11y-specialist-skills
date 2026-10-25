# Plan 005: Add Prettier + ESLint (flat config) with a CI gate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8000421..HEAD -- package.json .github/workflows/ci.yml packages/a11y-audit/src packages/a11y-audit/test`
> Your base MUST include commit `8000421` (merge of Plan 004) — verify with
> `git merge-base --is-ancestor 8000421 HEAD`; if not, fetch and reset your
> isolated branch to `origin/main` first. Treat structural mismatches with the
> "Current state" excerpts as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW (formatting-only diff is large but mechanical; lint findings are gated to zero before merge)
- **Depends on**: 004 (execute 004 FIRST — this plan reformats files 004 edits)
- **Category**: dx
- **Planned at**: commit `f86de93`, 2026-06-11; reconciled against `8000421` same day (package.json gained `devDependencies: { yaml }` + `validate:skills`/`test:validator` scripts and a root `scripts/` dir with `.mjs` files from the Codex-validator work; ci.yml gained the `skill-compatibility` job and Playwright cache steps — all reflected below)

## Why this matters

The monorepo has strict TypeScript (`tsconfig.base.json`: `strict`,
`noUncheckedIndexedAccess`) but no linter, no formatter, and no CI style gate
— CI runs typecheck/build/test only. Style is currently consistent by
discipline, not tooling; contributors (and AI agents executing plans) get no
automated feedback, and review time goes to nits. Adding Prettier + ESLint
with a CI step makes the convention machine-enforced.

## Current state

- No eslint/prettier/biome config exists anywhere in the repo (verified at
  planning time: no `.prettierrc*`, `eslint.config.*`, `.eslintrc*`,
  `biome.json` outside node_modules).
- Root `package.json` (the npm-workspaces root, `"private": true`) has scripts
  `build` / `test` / `test:validator` / `typecheck` / `validate:skills` /
  `clean`, and an existing `devDependencies` key containing exactly
  `"yaml": "^2.8.1"` (used by `scripts/validate-skills.mjs`). **Preserve it**
  — merge the new dev deps into this key; do not replace it.
- Root `scripts/` dir contains plain-Node ESM files
  (`validate-skills.mjs`, `validate-skills.test.mjs`) that use `console` /
  `process` — these are lint targets and need Node globals (see Step 3).
- Observed code style in `packages/a11y-audit/src/**`: single quotes,
  semicolons, 2-space indent, trailing commas in multiline literals, ESM with
  `.js` import specifiers. Prettier defaults match except `singleQuote`.
- TypeScript code lives in: `packages/a11y-audit/src/**`,
  `packages/a11y-audit/test/*.spec.ts`,
  `skills/auditing-wcag/references/scripts/*.ts` (wrappers; a separate npm
  project NOT in the workspace), plus `skills/auditing-wcag/references/scripts/run-test.cjs`.
- `.github/workflows/ci.yml` job `a11y-audit-package` steps (excerpt):

  ```yaml
      - name: Install dependencies
        run: npm ci

      - name: Type-check & build
        run: npm run build --workspace @a11y-skills/audit
  ```

  Its `paths:` filters: `skills/auditing-wcag/references/scripts/**`,
  `packages/**`, `package.json`, `tsconfig.base.json`,
  `.github/workflows/ci.yml`.
- **Markdown is content, not code, in this repo**: `skills/**/*.md` are
  prompt files (EN/JA pairs where Japanese is the source of truth — see
  `AGENTS.md`). Prettier must NOT touch them; reflowing Japanese prose is a
  real risk. Format only `ts/js/cjs/mjs/json/yml/yaml`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install (after editing package.json) | `npm install` at repo root | exit 0, lockfile updated |
| Format check | `npm run format:check` | exit 0 once Step 4 done |
| Lint | `npm run lint` | exit 0, no errors |
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | `npm test --workspace @a11y-skills/audit` | all pass (needs `npx playwright install chromium` once in `packages/a11y-audit`) |
| Workflow YAML | `npx --yes js-yaml .github/workflows/ci.yml > /dev/null` | exit 0 |

## Scope

**In scope** (the only files you should modify/create):
- `package.json`, `package-lock.json` (root — devDeps + scripts)
- `prettier.config.js`, `.prettierignore` (create)
- `eslint.config.js` (create)
- `.github/workflows/ci.yml` (one new step + paths additions)
- Formatting-only changes to `**/*.{ts,js,cjs,mjs,json}` produced by
  `prettier --write` and mechanical lint fixes in `packages/a11y-audit/{src,test}`
  and `skills/auditing-wcag/references/scripts/*.ts`

**Out of scope** (do NOT touch):
- All `*.md` / `*.ja.md` files — content, excluded from formatting.
- `.claude-plugin/*.json` and `.codex-plugin/*.json` — tiny hand-maintained
  files; exclude to keep diffs away from release-sensitive metadata that the
  version-sync CI checks (add both to `.prettierignore`).
- `packages/a11y-audit/dist/`, any `node_modules/`, `tmp/`, `.playwright-mcp/`.
- Behavioral code changes. If a lint rule demands a refactor (not a mechanical
  fix), disable the rule for that line with an inline comment instead, and list
  every such suppression in your report.

## Git workflow

- Branch: `chore/prettier-eslint-ci`
- Commits (separate, in this order — keeps review tractable):
  1. `chore: add prettier + eslint flat config and scripts`
  2. `style: apply prettier across the repo` (the mechanical diff, no manual edits)
  3. `chore(ci): run lint and format check in CI`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add devDependencies and scripts to root package.json

Add to root `package.json`:

```json
"devDependencies": {
  "@eslint/js": "^9.0.0",
  "eslint": "^9.0.0",
  "eslint-config-prettier": "^9.1.0",
  "globals": "^15.0.0",
  "prettier": "^3.3.0",
  "typescript-eslint": "^8.0.0",
  "yaml": "^2.8.1"
},
```

(`yaml` is the pre-existing entry — keep it. `globals` provides the Node
global sets for plain-JS files in Step 3.)

and add scripts (keep existing ones):

```json
"lint": "eslint .",
"format": "prettier --write .",
"format:check": "prettier --check ."
```

Run `npm install` at the root.

**Verify**: `npx prettier --version` → prints a 3.x version;
`npx eslint --version` → prints a 9.x version.

### Step 2: Create prettier.config.js and .prettierignore

`prettier.config.js`:

```js
/** @type {import("prettier").Config} */
export default {
  singleQuote: true,
};
```

(Defaults already match the codebase: semicolons on, 2-space indent, es5
trailing commas, 80 print width.)

`.prettierignore`:

```
# Content, not code — EN/JA prompt markdown must not be reflowed
*.md

# Build/vendor/output
dist/
node_modules/
test-results/
playwright-report/
package-lock.json
.playwright-mcp/
tmp/
.agents/
.claude/
plans/

# Release-sensitive hand-maintained metadata (version-sync CI checks these)
.claude-plugin/
.codex-plugin/
```

**Verify**: `npx prettier --check packages/a11y-audit/src/types.ts` runs (exit
0 or 1, but no config error), and `npx prettier --check README.md` reports the
file is ignored (no output, exit 0).

### Step 3: Create eslint.config.js (flat config)

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/test-results/**',
      '.playwright-mcp/**',
      'tmp/**',
      '.agents/**',
      '.claude/**',
      'plans/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    // Plain-JS files run under Node (validator scripts, config files, run-test.cjs).
    // TS files don't need this: typescript-eslint disables no-undef for them.
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  }
);
```

Intentionally the non-type-checked preset — fast, zero tsconfig wiring across
the two separate TS projects; type-aware linting is deferred (Maintenance
notes).

**Verify**: `npm run lint` → runs to completion. Expect findings; do not fix
yet, just confirm the config loads without "config not found / parserOptions"
errors.

### Step 4: Apply formatting, then resolve lint findings

1. `npm run format` (this is the one mechanical commit — no hand edits mixed in).
2. `npm run format:check` → exit 0.
3. `npm run lint` and resolve what remains. Expected findings class:
   `@typescript-eslint/no-explicit-any` / `no-unused-vars` are usually absent
   here (strict TS), but `@typescript-eslint/no-unused-expressions` or
   browser-context globals inside `page.evaluate` callbacks may fire. For
   browser-context code (functions serialized into the page), prefer
   `/* eslint-disable-next-line */` with a `-- browser context` note over
   refactoring. **Cap**: if more than ~25 findings require manual judgment,
   STOP and report the list instead of churning through it.

**Verify**: `npm run lint` → exit 0. `npm run format:check` → exit 0.
`npm run typecheck` → exit 0. `npm test --workspace @a11y-skills/audit` → all
pass (formatting must not have changed behavior). Also
`cd skills/auditing-wcag/references/scripts && npm run typecheck` → exit 0
(only if its node_modules already exists; otherwise note it for CI).

### Step 5: Add the CI gate

In `.github/workflows/ci.yml` job `a11y-audit-package`, after the
`Install dependencies` step and before `Type-check & build`, insert:

```yaml
      - name: Lint & format check
        run: |
          npm run lint
          npm run format:check
```

And extend BOTH `paths:` lists (push and pull_request) with:

```yaml
      - 'eslint.config.js'
      - 'prettier.config.js'
      - '.prettierignore'
```

**Verify**: `npx --yes js-yaml .github/workflows/ci.yml > /dev/null` → exit 0.

## Test plan

No new tests. The gate is: full existing suite green after the reformat
(`npm test --workspace @a11y-skills/audit`), proving format-only neutrality,
plus the lint/format commands themselves at exit 0.

## Done criteria

ALL must hold:

- [ ] `npm run lint` exits 0
- [ ] `npm run format:check` exits 0
- [ ] `npm run typecheck` exits 0 and `npm test --workspace @a11y-skills/audit` exits 0
- [ ] `git diff --stat` shows NO changes to any `*.md` or `.claude-plugin/` file
- [ ] The prettier-apply commit contains no manual edits (it is reproducible: re-running `npm run format` on its parent produces the same tree)
- [ ] CI workflow parses and contains the lint step
- [ ] All inline eslint-disable suppressions are listed in the final report
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- More than ~25 lint findings need case-by-case judgment (Step 4 cap).
- Any test fails after formatting — never "fix" a test to make a format diff
  pass; that means a non-mechanical change slipped in.
- `eslint.config.js` cannot lint `skills/auditing-wcag/references/scripts/*.ts`
  without that project's own tsconfig wiring — in that case, scope lint to
  `packages/**` + root configs, note the exclusion in the report, and continue.
- Root `package.json` already has eslint/prettier among its devDependencies,
  or a `lint`/`format` script (someone else started this). The pre-existing
  `yaml` devDependency is expected and NOT a stop condition.

## Maintenance notes

- Deferred deliberately: type-aware lint presets (`recommended-type-checked`)
  — needs per-project `parserOptions.project` wiring across two tsconfigs;
  revisit if rule misses become visible. Also deferred: pre-commit hooks
  (husky/lint-staged) — CI is the gate for now, keeping contributor setup
  zero-config.
- Markdown stays unformatted by design (JA prose). If markdown formatting is
  ever wanted, it needs a JA-aware review, not a blanket prettier run.
- Reviewer should scrutinize: the `style:` commit being purely mechanical, and
  each eslint-disable suppression's justification.
