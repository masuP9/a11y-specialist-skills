[日本語版 (Japanese)](./automated-checks.ja.md)

# Automated Checks

The material collected from the page as loaded (accessibility tree, DOM, screenshots, axe results) and what each judgment rests on. Label each result Pass/Fail/NT/NA and keep evidence (tree snippet, DOM fragment, selector).

> **CLI Check:** Start by running `axe-audit` and `page-snapshot` to collect material.
> Run via: `npx -y @a11y-skills/audit --url "<url>" --checks axe-audit,page-snapshot`

## Where judgments come from

- When the "Judgment" column says **Judgment lines**, judge with the "Judgment lines" and "When checking" sections of a11y-knowledge `criteria/<number>.md`. This document does not repeat those rules.
- The rules for sorting axe and CLI results into confirmed and needs-review are in a11y-knowledge [checks-axe.md](../../a11y-knowledge/references/checks-axe.md) and [checks-audit.md](../../a11y-knowledge/references/checks-audit.md).
- Only criteria without a knowledge base file use the "Judgment" column of this document.

## Common Rules

- Source: `locator.ariaSnapshot()` (e.g. `page.locator('body').ariaSnapshot()`, `details.snapshot` of `page-snapshot`) / DOM attributes / screenshots
- Evidence: role, name, relevant attributes, CSS selector

## Material per criterion

| Criterion | Material | Judgment |
|---|---|---|
| 1.1.1 | Image names in the tree, axe `image-alt` and related rules | [Judgment lines](../../a11y-knowledge/references/criteria/1.1.1.md) |
| 1.2.1 / 1.2.3 / 1.2.5 | `<video>` / `<audio>` / embedded players, `<track kind="descriptions">`, links to nearby alternatives | [1.2.1](../../a11y-knowledge/references/criteria/1.2.1.md) / [1.2.3](../../a11y-knowledge/references/criteria/1.2.3.md) / [1.2.5](../../a11y-knowledge/references/criteria/1.2.5.md) |
| 1.2.2 | `<track kind="captions">`, axe `video-caption` | [Judgment lines](../../a11y-knowledge/references/criteria/1.2.2.md) |
| 1.3.1 | Compare visual/auditory presentation with DOM/tree relationships | [Judgment lines](../../a11y-knowledge/references/criteria/1.3.1.md) |
| 1.3.2 | Tree and DOM order vs. on-screen order, white space inside words | [Judgment lines](../../a11y-knowledge/references/criteria/1.3.2.md) |
| 1.3.3 | Instructions, target labels/functions, symbol alternatives, and reading order; check ambiguity even for “below” | [Judgment lines](../../a11y-knowledge/references/criteria/1.3.3.md) |
| 1.3.5 | `autocomplete-audit` **[CLI]** plus user-information scope, actual purpose, and exceptions | [Judgment lines](../../a11y-knowledge/references/criteria/1.3.5.md) |
| 1.4.1 | Screenshots, tree text, axe `link-in-text-block` | [Judgment lines](../../a11y-knowledge/references/criteria/1.4.1.md). Measure uncertain lightness distinctions; check visible cues conveying the same information and visited-link treatment |
| 1.4.3 | axe `color-contrast` | Fail below 4.5:1 (3:1 for large text). Where axe could not compute (image or gradient backgrounds), NT until measured |
| 1.4.11 | `non-text-contrast-check` **[CLI]** (component boundaries, icon-only buttons) | [Judgment lines](../../a11y-knowledge/references/criteria/1.4.11.md); verify required cues, adjacent colors, and exceptions |
| 2.4.1 | Repeated blocks and bypass destination structure; check arrival after activation when relying on links | [Judgment lines](../../a11y-knowledge/references/criteria/2.4.1.md) |
| 2.4.2 | Current `document.title` and topic/purpose; axe `document-title` (non-empty) | [Judgment lines](../../a11y-knowledge/references/criteria/2.4.2.md) |
| 2.4.4 | Link names and DOM sentences, paragraphs, list items, table headers, and ARIA references; preceding headings follow author policy | [Judgment lines](../../a11y-knowledge/references/criteria/2.4.4.md) |
| 2.4.6 | Headings/labels and actual content/functions, including image labels | [2.4.6](../../a11y-knowledge/references/criteria/2.4.6.md) |
| 2.5.3 | Individual visible labels/images of text and computed names (selected by default in axe 4.14.0, with partial coverage) | [2.5.3](../../a11y-knowledge/references/criteria/2.5.3.md) |
| 3.1.1 | lang / xml:lang, axe, and representative content language | [Judgment lines](../../a11y-knowledge/references/criteria/3.1.1.md) |
| 3.1.2 | Phrases and attribute values in a language different from their surroundings, DOM `lang`, axe `valid-lang` | [Judgment lines](../../a11y-knowledge/references/criteria/3.1.2.md) |
| 3.3.2 | Visible labels, instructions, and input requirements (name checks alone do not settle this) | [Judgment lines](../../a11y-knowledge/references/criteria/3.3.2.md) |
| 4.1.2 | Role, name, and state of operable elements | [Judgment lines](../../a11y-knowledge/references/criteria/4.1.2.md) |
| 4.1.3 | Status-message applicability, before/after states, focus, notification mechanisms, and AT output | [4.1.3](../../a11y-knowledge/references/criteria/4.1.3.md) |

## Time-based media (1.2.1 / 1.2.3 / 1.2.5)

1. Collect `<video>`, `<audio>`, and embedded players, then classify actual audio, video, and time-based interaction. `muted` alone does not establish video-only content.
2. Collect transcripts, audio alternatives, described versions, static descriptions, and access routes. Do not convert track or link presence into an SC Pass.
3. Apply [1.2.1](../../a11y-knowledge/references/criteria/1.2.1.md), [1.2.3](../../a11y-knowledge/references/criteria/1.2.3.md), and [1.2.5](../../a11y-knowledge/references/criteria/1.2.5.md) to compare exceptions, content, sequence, interaction, and actual playback. Inspect selection menus in embedded players too.
4. Leave unavailable content as NT with the evidence needed; settle the verdict once manual checks establish the conditions. Record media/alternative URLs, timestamps, and missing information.

## Cross-Page Checks

Judge after collecting material (`page-snapshot`) from all audit target pages. For 3.2.3 / 3.2.4 / 3.2.6, read [cross-page.md](../../a11y-knowledge/references/cross-page.md) first and judge with each criterion's judgment lines. `page-snapshot` itself provides no verdict. Supplement material for visual order under 3.2.3; visible labels, icons, and same-page repetition under 3.2.4; and expanded help routes under 3.2.6.

| Criterion | Material | Judgment |
|---|---|---|
| 2.4.5 | Search forms, links to a site map, links between pages, and where they actually lead | [Judgment lines](../../a11y-knowledge/references/criteria/2.4.5.md) |
| 3.2.3 | Contents of `banner` / `navigation` / `contentinfo` on each page | [Judgment lines](../../a11y-knowledge/references/criteria/3.2.3.md) |
| 3.2.4 | Roles, names, visible labels, and icons of the same repeated function | [Judgment lines](../../a11y-knowledge/references/criteria/3.2.4.md) |
| 3.2.6 | Help mechanisms and routes, serial order relative to shared content, matching presentation conditions | [Judgment lines](../../a11y-knowledge/references/criteria/3.2.6.md) |
