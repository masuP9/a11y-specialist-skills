---
name: reviewing-a11y
description: Review accessibility of web pages, code implementations, design mockups, and specifications, then report severity-ranked issues and fixes. Use auditing-wcag instead for formal conformance decisions across all success criteria.
argument-hint: URL, file path, or Figma URL to review
allowed-tools: Read Grep Glob WebFetch Agent Bash(npx -y @a11y-skills/audit:*) Bash(npx playwright install:*) mcp__playwright__browser_snapshot mcp__plugin_playwright_playwright__browser_snapshot mcp__playwright__browser_navigate mcp__plugin_playwright_playwright__browser_navigate mcp__playwright__browser_click mcp__plugin_playwright_playwright__browser_click mcp__playwright__browser_press_key mcp__plugin_playwright_playwright__browser_press_key mcp__playwright__browser_take_screenshot mcp__plugin_playwright_playwright__browser_take_screenshot
---

[日本語版 (Japanese)](./SKILL.ja.md)

# Accessibility Review

Identify the review target, find accessibility issues by following the matching reference guide, and report them by severity.

## Step 1: Identify Review Target

| Target | Indicators | Guide |
|---|---|---|
| Web page | A `http://` / `https://` URL, a deployed page | `references/page-review.md` |
| Code | File paths or directories (`.tsx`, `.vue`, `.html`, etc.), component names | `references/code-review.md` |
| Design | A Figma URL (`figma.com/design/`, `/file/`, `/proto/`, `/board/`), design images or PDFs, specifications | `references/design-review.md` |

If you cannot decide, ask in one line whether to review a URL, file paths, or a design.

## Step 2: Look Up the Judgment Lines in the Knowledge Base

Once you identify the target, and before looking at the code or page, align your findings with [a11y-knowledge](../a11y-knowledge/SKILL.md).

1. List the components that appear in the target by ARIA role (button, dialog, combobox, and so on).
2. Use [index-by-component.md](../a11y-knowledge/references/index-by-component.md) to find the success criteria that apply to each role. When reviewing a layout or a whole page, also pick the "Whole page" and "Multiple pages" criteria from [index-by-criterion.md](../a11y-knowledge/references/index-by-criterion.md).
3. For each criterion found, read "Judgment lines" and "When building" in `../a11y-knowledge/references/criteria/<number>.md` before writing a finding. Do not report what the "Judgment lines" say does not apply.
4. When a finding is based on an **[Our interpretation]** judgment line (an operational interpretation), say so in the finding (for example, "[Our interpretation] judgment line; the project may override it"). **[Understanding]** judgment lines need no such note.

The knowledge base is referenced by the relative path `../a11y-knowledge/`. It resolves when installed as a plugin. When installed by symlinking individual skill directories, link `a11y-knowledge` as well. If it does not resolve, skip this step and write "knowledge base not consulted" in the report.

## Step 3: Load the Guide and Review

Read the guide from the Step 1 table in the user's language (`.ja.md` for Japanese, `.md` for English) and execute its process in this agent. Use one guide per target type; do not mix them.

Use sub-agents only when the user explicitly requests parallel review, delegation, or division across multiple targets. Give each agent one target type with its guide and target, wait for every result, remove duplicates, and return one report. If sub-agents are unavailable, review the targets sequentially.

## Severity

All guides assign severity with this table. Severity reflects the impact on users and is independent of the WCAG level (A/AA).

| Severity | Definition | Example patterns |
|---|---|---|
| **Critical** | Users cannot operate or get the information at all | Informative image without an alternative, icon-only button without a name, input without an associated label, click-only or unfocusable controls, keyboard trap, `aria-labelledby` pointing to a non-existent ID, important information hidden with `display:none` or `aria-hidden="true"`, errors shown by color alone |
| **Major** | Possible but with significant difficulty | Missing or broken heading structure, missing or duplicate landmarks, wrong role or invalid `aria-*` values, focus order far from visual order, links or buttons that only say "click here" or "details", tables missing `th` / `scope`, missing page language (3.1.1), insufficient contrast |
| **Minor** | Possible with room for improvement | ARIA-built part that could be a native element (name, role, and keyboard operation already met), redundant ARIA duplicating native semantics, no skip link (when headings or landmarks let users bypass blocks), minor heading level inconsistencies, best practices that are not WCAG requirements |

Mark findings that are not WCAG requirements as "best practice" and do not attach a success criterion.

## Step 4: Return Results

1. Present the findings in the guide's output format. Separate what was verified from what could not be verified (sent to manual verification). Do not turn missing evidence into a conclusive finding.
2. If useful, offer to review another target type (e.g., "Would you like me to review the code implementation next?").
