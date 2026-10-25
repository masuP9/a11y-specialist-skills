# Plan 003: Automate the post-release bump of the wrapper scripts' @a11y-skills/audit dependency

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f86de93..HEAD -- .github/workflows/release.yml skills/auditing-wcag/references/scripts/package.json`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live files before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW (additive CI job; cannot break the publish itself if ordered correctly)
- **Depends on**: none
- **Category**: dx / dependencies
- **PR**: https://github.com/masuP9/a11y-specialist-skills/pull/25 (end-to-end validation deferred to next release)
- **Planned at**: commit `f86de93`, 2026-06-11

## Why this matters

The `auditing-wcag` skill's scripts are thin wrappers that depend on the
**published** npm package, not the workspace:
`skills/auditing-wcag/references/scripts/package.json` pins
`"@a11y-skills/audit": "^0.3.0"`. Every release of `packages/a11y-audit`
therefore requires a manual follow-up PR to bump the wrapper. This friction is
not hypothetical — git history shows it: commit `47263e3` "fix(ci): keep
wcag-audit scripts on @a11y-skills/audit ^0.2.0 until 0.3.0 is published",
followed later by `938b955` "chore(auditing-wcag): bump scripts to
@a11y-skills/audit ^0.3.0". This plan adds a job to the release workflow that
opens that bump PR automatically after a successful publish.

## Current state

- `skills/auditing-wcag/references/scripts/package.json` — relevant excerpt:

  ```json
  "dependencies": {
    "@a11y-skills/audit": "^0.3.0",
    "@playwright/test": "^1.58.0"
  }
  ```

  It has its own `package-lock.json` in the same directory (NOT part of the
  root npm workspace).

- `.github/workflows/release.yml` — triggered by tags `a11y-audit-v*`, single
  job `publish` with `permissions: { contents: read, id-token: write }`. Its
  final steps: a "Check if version already published" step (id `published`,
  outputs `exists`) and:

  ```yaml
      - name: Publish to npm
        if: github.event_name == 'push' && steps.published.outputs.exists != 'true'
        run: npm publish --workspace @a11y-skills/audit --access public --provenance
  ```

- On the tag-push event, `GITHUB_REF_NAME` is e.g. `a11y-audit-v0.3.0`; the
  existing workflow already derives the version with
  `${GITHUB_REF_NAME#a11y-audit-v}`. Reuse that pattern.
- Repo conventions: official actions only so far; conventional commits (the
  bump commit message to mimic: `chore(auditing-wcag): bump scripts to
  @a11y-skills/audit ^X.Y.Z`); branch names like `chore/scripts-bump-audit-0.3.0`.
- `gh` CLI is preinstalled on `ubuntu-latest` runners and authenticates via
  `GH_TOKEN` env.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Validate workflow YAML | `npx --yes js-yaml .github/workflows/release.yml > /dev/null` | exit 0 |
| Wrapper typecheck (CI does this; locally only if node_modules already present) | `npm run typecheck` in `skills/auditing-wcag/references/scripts` | exit 0 |

Do NOT run `npm install` anywhere locally — lockfile mutation happens only
inside the CI job this plan adds.

## Scope

**In scope** (the only file you should modify):
- `.github/workflows/release.yml`

**Out of scope** (do NOT touch):
- `skills/auditing-wcag/references/scripts/package.json` / `package-lock.json`
  — the new CI job edits these at release time; you do not edit them now.
- `.github/workflows/ci.yml` — Plan 002's territory.
- The existing `publish` job's steps — the new job is appended, nothing in
  `publish` changes.

## Git workflow

- Branch: `ci/auto-bump-wrapper-after-release`
- Commit: `ci(release): open wrapper bump PR automatically after publish`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Append a `bump-wrapper` job to release.yml

Add this job at the end of `.github/workflows/release.yml` (top-level `jobs:`
sibling of `publish`):

```yaml
  # After a successful tag-push publish, open a PR bumping the auditing-wcag
  # wrapper scripts to the just-released version. Idempotent: skips when the
  # wrapper is already on that version.
  bump-wrapper:
    needs: publish
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - name: Wait for npm registry propagation
        run: |
          VERSION="${GITHUB_REF_NAME#a11y-audit-v}"
          for i in $(seq 1 10); do
            if [ "$(npm view "@a11y-skills/audit@$VERSION" version 2>/dev/null)" = "$VERSION" ]; then
              echo "@a11y-skills/audit@$VERSION is visible on npm."
              exit 0
            fi
            echo "Not visible yet, retry $i/10..."
            sleep 15
          done
          echo "::error::@a11y-skills/audit@$VERSION not visible on npm after 150s"
          exit 1

      - name: Bump wrapper dependency and lockfile
        working-directory: skills/auditing-wcag/references/scripts
        run: |
          VERSION="${GITHUB_REF_NAME#a11y-audit-v}"
          CURRENT=$(node -p "require('./package.json').dependencies['@a11y-skills/audit']")
          if [ "$CURRENT" = "^$VERSION" ]; then
            echo "Wrapper already on ^$VERSION; nothing to do."
            echo "SKIP_PR=true" >> "$GITHUB_ENV"
            exit 0
          fi
          npm pkg set "dependencies.@a11y-skills/audit=^$VERSION"
          npm install --package-lock-only

      - name: Open bump PR
        if: env.SKIP_PR != 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          VERSION="${GITHUB_REF_NAME#a11y-audit-v}"
          BRANCH="chore/scripts-bump-audit-$VERSION"
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git checkout -b "$BRANCH"
          git add skills/auditing-wcag/references/scripts/package.json \
                  skills/auditing-wcag/references/scripts/package-lock.json
          git commit -m "chore(auditing-wcag): bump scripts to @a11y-skills/audit ^$VERSION"
          git push origin "$BRANCH"
          gh pr create \
            --title "chore(auditing-wcag): bump scripts to @a11y-skills/audit ^$VERSION" \
            --body "Automated follow-up to the \`a11y-audit-v$VERSION\` release: points the auditing-wcag wrapper scripts at the just-published package version.

Note: PRs created with GITHUB_TOKEN do not trigger CI automatically — close/reopen this PR (or push an empty commit) to run CI before merging." \
            --base main \
            --head "$BRANCH"
```

**Verify**: `npx --yes js-yaml .github/workflows/release.yml > /dev/null` →
exit 0. Then `grep -n "bump-wrapper" .github/workflows/release.yml` → the job
exists once.

### Step 2: Sanity-review the interaction with the existing publish job

Read the existing `publish` job and confirm (no edits — this is a review gate):

- `bump-wrapper` has `needs: publish` so it only runs after publish succeeds.
- The "already published" path: when `publish` skips the final npm-publish step
  because the version exists, `bump-wrapper` still runs — that is correct
  behavior (the wrapper may still be behind), and the idempotency guard
  (`CURRENT = ^$VERSION` → skip) prevents a no-op PR.
- `workflow_dispatch` runs never reach `bump-wrapper` (`if: github.event_name
  == 'push'`), matching the publish job's dry-run-on-dispatch behavior.

**Verify**: state these three confirmations in your report.

## Test plan

Full end-to-end verification requires an actual release tag, which the
executor must NOT push. Verification is:

1. YAML parses (Step 1).
2. Shell-logic dry test: in a scratch dir outside the repo, run the
   version-extraction line with `GITHUB_REF_NAME=a11y-audit-v0.9.9` and confirm
   `VERSION=0.9.9`.
3. Hand off to the operator: the next real release exercises the job. Record
   in `plans/README.md` status as `DONE (pending first-release validation)`.

## Done criteria

ALL must hold:

- [ ] `npx --yes js-yaml .github/workflows/release.yml` exits 0
- [ ] `release.yml` contains a `bump-wrapper` job with `needs: publish`, registry-propagation polling, idempotency guard, and `gh pr create`
- [ ] The existing `publish` job is byte-for-byte unchanged (`git diff` shows additions only at the end of the file)
- [ ] No files outside `.github/workflows/release.yml` modified (plus `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `release.yml` no longer matches the Current state excerpt (e.g. the publish
  job was restructured, or the `published` step id changed).
- The wrapper `package.json` dependency line is no longer `"^0.3.0"`-style
  (e.g. switched to a workspace/file reference) — the whole premise changes.
- You are tempted to push a tag to test — do not; report instead.

## Maintenance notes

- **Known limitation (deliberate)**: PRs created with `GITHUB_TOKEN` do not
  trigger `ci.yml`. The PR body tells the maintainer to close/reopen to run
  CI. If this becomes annoying, the upgrade path is a fine-grained PAT or a
  GitHub App token stored as a secret — deferred until the friction is felt.
- If branch protection on `main` ever forbids the default token from pushing
  branches, the `git push` step will fail; the fix is repo settings (allow
  GitHub Actions to create branches/PRs), not workflow code.
- Reviewer should scrutinize: the propagation-poll exit path (a failure there
  leaves the release published but the PR unopened — rerunning just the
  `bump-wrapper` job from the Actions UI recovers).
