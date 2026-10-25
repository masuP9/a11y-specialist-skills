# Plan 001: Prevent locally-installed skills from shipping with the plugin, and enforce plugin version sync in CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f86de93..HEAD -- .gitignore .github/workflows/ .claude-plugin/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `f86de93`, 2026-06-11

## Why this matters

This repository IS a published Claude Code plugin: everything under `skills/`
ships to every plugin user. The maintainer recently ran `npx skills add
shadcn/improve`, which dropped a symlink `skills/improve ->
../.agents/skills/improve/` plus `.agents/`, `.claude/skills/`, and
`skills-lock.json` into the working tree — all currently **untracked and not
gitignored**. One careless `git add -A` would commit an unrelated third-party
"improve" skill into the plugin that all users install. Separately, the plugin
version lives in **three** places (`.claude-plugin/plugin.json` `.version`,
`.claude-plugin/marketplace.json` `.metadata.version` and
`.plugins[0].version`) that must be bumped together by convention, but nothing
enforces it. This plan closes both footguns with a `.gitignore` change and a
small CI workflow.

## Current state

- `.gitignore` (repo root) — currently ends like this (verbatim tail):

  ```
  autocomplete-result.json
  time-limit-result.json
  axe-result.json
  ```

  It contains NO entries for `.agents/`, `.claude/skills/`, `skills/improve`,
  or `skills-lock.json`. (It DOES already contain `.claude/settings.local.json`
  — keep that line.)

- `git status --short` currently shows these untracked paths:

  ```
  ?? .agents/
  ?? .claude/
  ?? skills-lock.json
  ?? skills/improve
  ```

  `skills/improve` is a symlink: `skills/improve -> ../.agents/skills/improve/`.
  `.claude/` contains only `.claude/skills/` (installed skill symlinks).

- `.claude-plugin/plugin.json:3` — `"version": "2.8.0"`.
- `.claude-plugin/marketplace.json` — `"metadata": { ... "version": "2.8.0" }`
  AND `"plugins": [ { ... "version": "2.8.0" ... } ]`. Three version fields
  total across the two files.
- `.github/workflows/ci.yml` — existing CI; note its `paths:` filters do NOT
  include `.claude-plugin/**`, which is why this plan adds a **separate**
  workflow file rather than a step in `ci.yml` (a step there would not run on
  plugin-version-only PRs).
- Repo conventions: GitHub Actions workflows use `actions/checkout@v4`,
  `runs-on: ubuntu-latest` (see `.github/workflows/ci.yml`). Commit messages
  are conventional commits, e.g. `ci(release): publish @a11y-skills/audit via
  npm Trusted Publishing (OIDC)`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Check ignore rules | `git check-ignore -v .agents skills-lock.json skills/improve .claude/skills` | prints a matching rule for each path, exit 0 |
| Validate workflow YAML | `npx --yes js-yaml .github/workflows/plugin-version-check.yml > /dev/null` | exit 0, no parse error |
| Run the sync check locally | (the `node -e` script from Step 2) | prints `Versions in sync: 2.8.0`, exit 0 |

## Scope

**In scope** (the only files you should modify):
- `.gitignore`
- `.github/workflows/plugin-version-check.yml` (create)

**Out of scope** (do NOT touch):
- `.agents/`, `.claude/`, `skills-lock.json`, `skills/improve` themselves — do
  NOT delete them; they are the maintainer's local tooling. The fix is to
  ignore them, not remove them.
- `.github/workflows/ci.yml` and `release.yml` — other plans touch these.
- `.claude-plugin/*.json` — do not change versions.

## Git workflow

- Branch: `chore/repo-hygiene-version-sync`
- Commit style: conventional commits, e.g.
  `chore: gitignore locally-installed agent skills` and
  `ci: verify plugin.json/marketplace.json version sync`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add ignore rules for locally-installed skill artifacts

Append to `.gitignore` (keep all existing lines):

```gitignore

# Locally-installed agent skills (`npx skills add ...`) — local tooling only,
# must never ship with the published plugin
.agents/
.claude/skills/
/skills/improve
skills-lock.json
```

Note the leading `/` on `/skills/improve` — it anchors to the repo root so a
hypothetical nested `something/skills/improve` is unaffected.

**Verify**: `git check-ignore -v .agents skills-lock.json skills/improve .claude/skills`
→ four lines, each showing the new `.gitignore` rule; exit 0.
Then `git status --short` → none of `.agents/`, `.claude/`, `skills-lock.json`,
`skills/improve` appear anymore (only `.gitignore` as modified, plus this
plans/ directory).

### Step 2: Create the version-sync workflow

Create `.github/workflows/plugin-version-check.yml` with exactly this content:

```yaml
name: Plugin version sync

on:
  pull_request:
    paths:
      - '.claude-plugin/**'
      - '.github/workflows/plugin-version-check.yml'
  push:
    branches: [main, master]
    paths:
      - '.claude-plugin/**'
      - '.github/workflows/plugin-version-check.yml'

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Verify plugin.json and marketplace.json versions match
        run: |
          node -e '
            const fs = require("fs");
            const plugin = JSON.parse(fs.readFileSync(".claude-plugin/plugin.json", "utf8"));
            const market = JSON.parse(fs.readFileSync(".claude-plugin/marketplace.json", "utf8"));
            const versions = {
              "plugin.json .version": plugin.version,
              "marketplace.json .metadata.version": market.metadata.version,
              "marketplace.json .plugins[0].version": market.plugins[0].version,
            };
            const unique = new Set(Object.values(versions));
            if (unique.size !== 1) {
              console.error("Plugin version mismatch:");
              for (const [k, v] of Object.entries(versions)) console.error(`  ${k}: ${v}`);
              process.exit(1);
            }
            console.log("Versions in sync:", plugin.version);
          '
```

**Verify**:
1. `npx --yes js-yaml .github/workflows/plugin-version-check.yml > /dev/null` → exit 0.
2. Run the embedded `node -e` script directly in the repo root (copy the
   script body) → prints `Versions in sync: 2.8.0`, exit 0.
3. Negative test: temporarily edit `.claude-plugin/plugin.json` version to
   `9.9.9`, re-run the script → exits 1 and prints the mismatch table. **Revert
   the edit** (`git checkout -- .claude-plugin/plugin.json`) and confirm
   `git diff .claude-plugin/` is empty.

## Test plan

No unit tests — this is config. The verification commands above are the test:
the positive run, the negative (mutated-version) run, and YAML parseability.

## Done criteria

ALL must hold:

- [ ] `git check-ignore .agents skills-lock.json skills/improve .claude/skills` exits 0
- [ ] `git status --short` no longer lists `.agents/`, `.claude/`, `skills-lock.json`, `skills/improve`
- [ ] `.github/workflows/plugin-version-check.yml` exists and `npx --yes js-yaml` parses it
- [ ] The `node -e` sync script exits 0 on the current repo and 1 on a mutated version (and the mutation was reverted)
- [ ] `git status` shows no modified files outside `.gitignore` and the new workflow file (plus `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `.gitignore` no longer matches the excerpt above (something else edited it).
- `skills/improve` is no longer a symlink but a real tracked directory
  (`git ls-files skills/improve` returns entries) — ignoring it would then hide
  tracked-file changes; the situation needs a human decision.
- `.claude-plugin/marketplace.json` no longer has exactly one entry in
  `.plugins` — the check script indexes `[0]` and would need rethinking.

## Maintenance notes

- If a release process is ever automated, the version-sync script is the
  natural place to also verify a git tag matches.
- Reviewer should scrutinize: that no currently-tracked file becomes ignored
  (`git ls-files -i -c --exclude-standard` should print nothing).
- Deferred: ignoring all of `.claude/` (not just `.claude/skills/`) — left
  alone because `.claude/settings.local.json` is already individually ignored
  and the maintainer may want to commit shared `.claude/` settings someday.
