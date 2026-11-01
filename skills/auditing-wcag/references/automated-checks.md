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
| 1.2.1 / 1.2.3 / 1.2.5 | `<video>` / `<audio>` / embedded players, `<track kind="descriptions">`, links to nearby alternatives | "Time-based media" below |
| 1.2.2 | `<track kind="captions">`, axe `video-caption` | [Judgment lines](../../a11y-knowledge/references/criteria/1.2.2.md) |
| 1.3.1 | Whether headings, landmarks, lists, tables, and form relationships appear in the tree | [Judgment lines](../../a11y-knowledge/references/criteria/1.3.1.md) |
| 1.3.2 | Tree order vs. visual order | Fail where reordering changes meaning and the tree order contradicts the visual meaning |
| 1.3.3 | Instructions, target labels/functions, symbol alternatives, and reading order; check ambiguity even for “below” | [Judgment lines](../../a11y-knowledge/references/criteria/1.3.3.md) |
| 1.3.5 | `autocomplete-audit` **[CLI]** | [Judgment lines](../../a11y-knowledge/references/criteria/1.3.5.md) |
| 1.4.1 | Screenshots, tree text, axe `link-in-text-block` | [Judgment lines](../../a11y-knowledge/references/criteria/1.4.1.md). Measure uncertain lightness distinctions; check visible cues conveying the same information and visited-link treatment |
| 1.4.3 | axe `color-contrast` | Fail below 4.5:1 (3:1 for large text). Where axe could not compute (image or gradient backgrounds), NT until measured |
| 1.4.11 | `non-text-contrast-check` **[CLI]** (component boundaries, icon-only buttons) | [Judgment lines](../../a11y-knowledge/references/criteria/1.4.11.md); verify required cues, adjacent colors, and exceptions |
| 2.4.1 | Skip links, landmarks, and headings in the tree | [Judgment lines](../../a11y-knowledge/references/criteria/2.4.1.md) |
| 2.4.2 | `document.title`, axe `document-title` | [Judgment lines](../../a11y-knowledge/references/criteria/2.4.2.md) |
| 2.4.4 | Link names in the tree and the sentence, paragraph, list item, or table cell containing the link | [Judgment lines](../../a11y-knowledge/references/criteria/2.4.4.md) |
| 2.4.6 | Heading and label text | Fail if a heading or label does not describe its topic or purpose (presence is not judged here; missing ones belong to 1.3.1 / 3.3.2) |
| 2.5.3 | Visible label text vs. accessible name | Fail if the label text is not contained in the name (axe `label-content-name-mismatch` is experimental and not run by default) |
| 3.1.1 | `<html lang>`, axe `html-has-lang` / `html-lang-valid` | [Judgment lines](../../a11y-knowledge/references/criteria/3.1.1.md) |
| 3.1.2 | Passages in a language other than the page's primary language, axe `valid-lang` | "Language of parts" below |
| 3.3.2 | Visible labels, instructions, and input requirements (name checks alone do not settle this) | [Judgment lines](../../a11y-knowledge/references/criteria/3.3.2.md) |
| 4.1.2 | Role, name, and state of operable elements | [Judgment lines](../../a11y-knowledge/references/criteria/4.1.2.md) |
| 4.1.3 | Messages reporting a change of state and their role (`status` / `alert` / `log`, etc.) | Fail if a message reporting the result of a user action or the state of a process does not reach assistive technology without moving focus |

## Time-based media (1.2.1 / 1.2.3 / 1.2.5)

- Find `<video>`, `<audio>`, and embedded players (`<iframe>` with YouTube / Vimeo, etc.) and check from context whether a transcript or other alternative is nearby (a link, `aria-describedby`, the text right after it).
- 1.2.3: Pass with an audio description (`<track kind="descriptions">` or a described version) or a media alternative in text.
- 1.2.5: Fail without an audio description. Not needed when all visual information is already spoken in the audio.
- Embedded players may carry their own captions and descriptions; if none are found, mark NT and send to manual review.
- Whether the alternative matches the media cannot be decided automatically.

## Language of parts (3.1.2)

- Find sentences and phrases in a language other than the page's primary language from context, and check that the element or an ancestor has a correct `lang`.
- Proper names, technical terms, and loanwords established in the primary language are out of scope.
- Fail if a passage in another language has no `lang`.

## Cross-Page Checks

Judge after collecting material (`page-snapshot`) from all audit target pages. For 3.2.3 / 3.2.4 / 3.2.6, read [cross-page.md](../../a11y-knowledge/references/cross-page.md) first and judge with each criterion's judgment lines. `page-snapshot` itself provides no verdict. Supplement material for visual order under 3.2.3; visible labels, icons, and same-page repetition under 3.2.4; and expanded help routes under 3.2.6.

| Criterion | Material | Judgment |
|---|---|---|
| 2.4.5 | Search forms, links to a site map, links between pages | "2.4.5" below |
| 3.2.3 | Contents of `banner` / `navigation` / `contentinfo` on each page | [Judgment lines](../../a11y-knowledge/references/criteria/3.2.3.md) |
| 3.2.4 | Roles, names, visible labels, and icons of the same repeated function | [Judgment lines](../../a11y-knowledge/references/criteria/3.2.4.md) |
| 3.2.6 | Help mechanisms and routes, serial order relative to shared content, matching presentation conditions | [Judgment lines](../../a11y-knowledge/references/criteria/3.2.6.md) |

### 2.4.5

- Pass if pages can be reached in two or more ways among search, site map, cross-links between pages, table of contents, and so on.
- Pages that are a step in a process (e.g. step 2 of checkout) are out of scope.
- Fail if some page can be reached only one way. Including the site map page in the audit targets is recommended.
