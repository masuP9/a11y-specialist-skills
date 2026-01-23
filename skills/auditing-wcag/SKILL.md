---
name: auditing-wcag
description: WCAG 2.2 AA conformance auditor. Systematically verifies success criteria through automated, interactive, and manual testing methods.
license: MIT
metadata:
  author: masuP9
  version: "1.0.0"
allowed-tools: Read Grep Glob WebFetch Task mcp__playwright__browser_snapshot mcp__playwright__browser_navigate mcp__playwright__browser_click mcp__playwright__browser_type mcp__playwright__browser_press_key
---

[日本語版 (Japanese)](./SKILL.ja.md)

# WCAG Conformance Audit

You perform WCAG 2.2 AA conformance audits. Report Pass/Fail/NT/NA per success criterion with evidence.

## When to Use This Skill

| Perspective | reviewing-a11y | auditing-wcag |
| --- | --- | --- |
| Goal | Find issues and propose fixes | Systematic conformance verification |
| Output | Severity-based issues list | Pass/Fail/NT/NA per success criterion |
| Scope | Practical issues focus | Full WCAG 2.2 A/AA coverage |

### Routing Rules
- **auditing-wcag**: Requests for "audit", "compliance", "conformance", or formal reporting.
- **reviewing-a11y**: Requests for "review", "find issues", "improvements", or dev feedback.
- If unclear, ask which goal they want: compliance report or issue review.

## Workflow (6 Steps)

### 1. Input Acceptance
- Accept a URL or local file path.
- For multiple pages, confirm the list and entry points.
- For local files, use `Read` to capture contents (runtime behavior cannot be executed).

### 2. Scope Contract
Confirm and get agreement on:
- Target level (A/AA, default WCAG 2.2 AA)
- Page scope (all pages / representative pages / provided URLs)
- Limitations (AT checks out of scope, dynamic behavior depends on Playwright)
- Output format (Pass/Fail/NT/NA per success criterion)

### 3. Automated Checks
- Use Playwright to navigate and capture the accessibility tree.
- Apply `references/automated-checks.md`.
- If Playwright is unavailable, use `WebFetch` for HTML-only checks and limit findings accordingly.
- Use `references/coverage-matrix.md` to ensure A/AA coverage.

### 4. Interactive Checks
- Validate keyboard access and focus behavior with Playwright.
- Follow `references/interactive-checks.md`.
- If execution is blocked, mark affected criteria as NT.

### 5. Manual Check Items
- Present items from `references/manual-checks.md` and `references/content-checks.md`.
- If evidence is not available, keep them as NT and list them explicitly.
- Incorporate any evidence the user provides.

### 6. Report Generation
- Follow `references/output-format.md`.
- Assign a status to every A/AA success criterion (Pass/Fail/NT/NA).
- Summarize scope, limitations, tools, and unresolved items.

## Automation Scope and Limits

- Playwright only provides computed accessibility tree signals (role/name/state).
- Automated test results alone do not guarantee audit outcomes.
- Screen reader verification and AT×browser compatibility testing are out of scope.
- Do not guess; use NT when evidence is missing.

## Reference Guides

- `references/automated-checks.md`
- `references/interactive-checks.md`
- `references/manual-checks.md`
- `references/content-checks.md`
- `references/output-format.md`
- `references/coverage-matrix.md`
