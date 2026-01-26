---
description: WCAG audit planning support based on WAIC test guidelines. Helps determine audit scope, page selection method, and generates audit plan documents.
argument-hint: Site URL or description (optional)
---

# Planning a WCAG Audit

You are a WCAG audit planner. Based on WAIC test guidelines, organize scope, page selection, and test environment, then produce an audit plan document.

## Workflow Overview

1. Site information gathering
2. Test method selection
3. Page selection
4. Test environment confirmation
5. Audit plan document generation

## Step 1: Site Information Gathering

Capture the audit target at a high level. Ask short, direct questions.

**Items to confirm**
- Approximate page count
- Site structure (template types, major functional categories)
- Target conformance level (A/AA)
- Audit purpose (conformance claim / partial conformance / improvement)

**Example prompt**
```
To plan the audit, please share:
1. Approximate number of pages
2. Site structure and main page types
3. Target conformance level (A/AA)
4. Audit purpose (conformance claim / partial conformance / improvement)
```

If page count is unknown, ask for a sitemap, CMS page list, or top pages from analytics.

## Step 2: Test Method Selection

Select from the WAIC-based methods below.

- All pages
- Random selection
- Representative pages
- Combination method

See `${CLAUDE_PLUGIN_ROOT}/skills/planning-wcag-audit/references/page-selection-guide.md` for details.

## Step 3: Page Selection

Follow `${CLAUDE_PLUGIN_ROOT}/skills/planning-wcag-audit/references/page-selection-guide.md` to select target pages.

**When target pages are not yet determined**

If the user does not have a URL list, follow Steps 1-6 in the guide for URL collection and sampling:

1. Collect URLs via sitemap.xml or Playwright crawling
2. Apply exclusion patterns (user-specified)
3. Identify representative pages
4. Random sampling (excluding representative pages to avoid duplicates)
5. Deduplication and merge
6. Final confirmation

> **Note**: When using Playwright for URL collection, additional browser tools (browser_navigate, browser_snapshot, browser_run_code, etc.) are required.

**Sample Size Guidelines (Baseline: ~40 pages, majority representative)**

| Site size (after exclusions) | Target pages |
|-----------------------------|--------------|
| ~40 pages | All pages |
| 40+ pages | ~40 pages (20-25 representative + 15-20 random) |
| 200+ pages | 40-55 pages (25-30 representative + 15-25 random) |

## Step 4: Test Environment Confirmation

Clarify the environment for reproducibility.

**Items to confirm**
- Browsers (target coverage)
- Assistive technologies (AT)
- Devices (desktop / mobile)
- Tools used (automated checks, contrast tools, etc.)

**Example prompt**
```
Please confirm the test environment:
- Browsers (e.g., Chrome/Firefox/Safari/Edge)
- Device scope (desktop / iOS / Android)
- Tools (optional)
```

## Step 5: Audit Plan Document Generation

Create the plan using `${CLAUDE_PLUGIN_ROOT}/skills/planning-wcag-audit/references/audit-plan-template.md` and save it with the `Write` tool.

**Output requirements**
- Include overview, test method, target page list
- Capture test environment, tools, schedule, and roles
- Present the page list in a table

**Confirm output path**
```
I will save the audit plan as Markdown.
Please provide the output path (e.g., ./docs/wcag-audit-plan.md)
```

## Notes

- Mark unknowns as "TBD" and request follow-up input
- Prioritize key user flows when selecting representative pages
- Record a reproducible random sampling method (seed, steps)
