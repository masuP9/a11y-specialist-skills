[日本語版 (Japanese)](./coverage-matrix.ja.md)

# WCAG 2.2 A/AA Coverage Matrix

Methods are labeled as Automated/Interactive/Manual/Content and can be combined. Use this as an index of which checks and material each criterion uses.

When the "Judgment Rule" column says **Judgment lines**, judge with the "Judgment lines" and "When checking" sections of a11y-knowledge `criteria/<number>.md`. Otherwise follow the column.

> **Note:** Criteria marked with **[CLI]** can be automatically checked via the `a11y-audit` CLI. See the check names in SKILL.md for reference.

## 1. Perceivable
| Criterion | Test Method | Evidence | Judgment Rule |
|---|---|---|---|
| 1.1.1 | Automated + Content | a11y tree/image list | [Judgment lines](../../a11y-knowledge/references/criteria/1.1.1.md) |
| 1.2.1 | Automated + Content | DOM media detection + transcript links | Fail if no alternative |
| 1.2.2 | Automated + Content | axe video-caption + track elements | [Judgment lines](../../a11y-knowledge/references/criteria/1.2.2.md) |
| 1.2.3 | Automated + Content | track elements + transcript links | Fail if no media alternative |
| 1.2.4 | Content | capture | Fail if live captions missing |
| 1.2.5 | Automated + Content | track elements | Fail if audio description missing |
| 1.3.1 | Automated | a11y tree snippet | [Judgment lines](../../a11y-knowledge/references/criteria/1.3.1.md) |
| 1.3.2 | Automated | a11y tree + DOM order | Fail if meaningful order breaks |
| 1.3.3 | Automated + Content | a11y tree text + excerpts | [Judgment lines](../../a11y-knowledge/references/criteria/1.3.3.md) |
| 1.3.4 | Automated + Manual | `orientation-check` **[CLI]** + captures | [Judgment lines](../../a11y-knowledge/references/criteria/1.3.4.md) |
| 1.3.5 | Automated | `autocomplete-audit` **[CLI]** | [Judgment lines](../../a11y-knowledge/references/criteria/1.3.5.md) |
| 1.4.1 | Automated + Manual | a11y tree text + screenshots | [Judgment lines](../../a11y-knowledge/references/criteria/1.4.1.md) |
| 1.4.2 | Automated + Manual | `auto-play-detection` **[CLI]** (`a11y-skills/auto-play-audio`) + logs | [Judgment lines](../../a11y-knowledge/references/criteria/1.4.2.md) |
| 1.4.3 | Automated | axe color-contrast | Fail below AA |
| 1.4.4 | Automated + Manual | `zoom-200-check` **[CLI]** + screenshots | [Judgment lines](../../a11y-knowledge/references/criteria/1.4.4.md) |
| 1.4.5 | Manual + Content | screenshots | [Judgment lines](../../a11y-knowledge/references/criteria/1.4.5.md) |
| 1.4.10 | Automated + Manual | `reflow-check` **[CLI]** + screenshots | [Judgment lines](../../a11y-knowledge/references/criteria/1.4.10.md) |
| 1.4.11 | Automated candidates + manual | `non-text-contrast-check` **[CLI]** + screenshots | [Judgment lines](../../a11y-knowledge/references/criteria/1.4.11.md); verify required cues, adjacent colors, and exceptions |
| 1.4.12 | Automated + Manual | `text-spacing-check` **[CLI]** + screenshots | [Judgment lines](../../a11y-knowledge/references/criteria/1.4.12.md) |
| 1.4.13 | Interactive + automated candidates | `content-on-hover-check` **[CLI]** + video/logs | Fail if hover/focus content cannot be dismissed/retained |

## 2. Operable
| Criterion | Test Method | Evidence | Judgment Rule |
|---|---|---|---|
| 2.1.1 | Automated + Interactive | `keyboard-reachability-check` **[CLI]** + logs | [Judgment lines](../../a11y-knowledge/references/criteria/2.1.1.md) |
| 2.1.2 | Automated + Interactive | `keyboard-trap-check` **[CLI]** + logs | Fail on keyboard trap |
| 2.1.4 | Interactive + automated candidates | `character-key-shortcut-check` **[CLI]** + logs | [Judgment lines](../../a11y-knowledge/references/criteria/2.1.4.md) |
| 2.2.1 | Automated + Manual | `time-limit-detector` **[CLI]** + logs | [Judgment lines](../../a11y-knowledge/references/criteria/2.2.1.md) |
| 2.2.2 | Automated + Interactive | `auto-play-detection` **[CLI]** + logs | [Judgment lines](../../a11y-knowledge/references/criteria/2.2.2.md) |
| 2.3.1 | Manual | video | Fail if flashing exceeds threshold |
| 2.4.1 | Automated | a11y tree | [Judgment lines](../../a11y-knowledge/references/criteria/2.4.1.md) |
| 2.4.2 | Automated | `document.title` | [Judgment lines](../../a11y-knowledge/references/criteria/2.4.2.md) |
| 2.4.3 | Interactive + automated candidates | `focus-order-check` **[CLI]** + focus order log | [Judgment lines](../../a11y-knowledge/references/criteria/2.4.3.md) |
| 2.4.4 | Automated + Content | a11y tree + excerpts | [Judgment lines](../../a11y-knowledge/references/criteria/2.4.4.md) |
| 2.4.5 | Automated + Content | link graph + search/sitemap detection | Fail if only one way provided |
| 2.4.6 | Automated + Content | a11y tree/excerpts | Fail if headings/labels are unclear |
| 2.4.7 | Interactive | screenshots | [Judgment lines](../../a11y-knowledge/references/criteria/2.4.7.md) |
| 2.4.11 | Automated + Interactive | `focus-indicator-check` **[CLI]** + screenshots | [Judgment lines](../../a11y-knowledge/references/criteria/2.4.11.md) |
| 2.4.12 (AAA) | Automated + Interactive | `focus-indicator-check` **[CLI]** + screenshots | [Judgment lines](../../a11y-knowledge/references/criteria/2.4.12.md) |
| 2.4.13 (AAA) | Measurement + manual | Colors at identical positions before/after focus; qualifying area | [Judgment lines](../../a11y-knowledge/references/criteria/2.4.13.md) |
| 2.5.1 | Interactive + automated candidates | `pointer-gesture-check` **[CLI]** + logs | [Judgment lines](../../a11y-knowledge/references/criteria/2.5.1.md) |
| 2.5.2 | Interactive + automated candidates | `pointer-cancellation-check` **[CLI]** + logs | [Judgment lines](../../a11y-knowledge/references/criteria/2.5.2.md) |
| 2.5.3 | Automated + Manual | a11y name diff (axe `label-content-name-mismatch` is experimental and not run by default) | Fail if label text not in accessible name |
| 2.5.4 | Interactive + automated candidates | `motion-actuation-check` **[CLI]** + logs | [Judgment lines](../../a11y-knowledge/references/criteria/2.5.4.md) |
| 2.5.7 | Interactive + automated candidates | `pointer-gesture-check` **[CLI]** + logs | [Judgment lines](../../a11y-knowledge/references/criteria/2.5.7.md) |
| 2.5.8 | Automated | `target-size-check` **[CLI]** | [Judgment lines](../../a11y-knowledge/references/criteria/2.5.8.md) |

## 3. Understandable
| Criterion | Test Method | Evidence | Judgment Rule |
|---|---|---|---|
| 3.1.1 | Automated | DOM attribute | [Judgment lines](../../a11y-knowledge/references/criteria/3.1.1.md) |
| 3.1.2 | Automated + Content | axe valid-lang + text analysis | Fail if language of parts not identified |
| 3.2.1 | Automated + Interactive | `focus-indicator-check` **[CLI]** + DOM diff | [Judgment lines](../../a11y-knowledge/references/criteria/3.2.1.md) |
| 3.2.2 | Interactive + automated candidates | `change-on-input-check` **[CLI]** + DOM diff | Fail if input triggers submit/navigation without prior advice |
| 3.2.3 | Content comparison (automated material collection) | Cross-page trees, screens, presentation conditions | [Judgment lines](../../a11y-knowledge/references/criteria/3.2.3.md) |
| 3.2.4 | Content comparison (automated material collection) | Repeated functions, names, visual identification | [Judgment lines](../../a11y-knowledge/references/criteria/3.2.4.md) |
| 3.2.6 | Content comparison (automated material collection) | Help routes, serial order relative to shared content, presentation conditions | [Judgment lines](../../a11y-knowledge/references/criteria/3.2.6.md) |
| 3.3.1 | Interactive | screenshots | [Judgment lines](../../a11y-knowledge/references/criteria/3.3.1.md) |
| 3.3.2 | Content (automation supplies name evidence) | Visible labels/instructions, screen during input, accepted values | [Judgment lines](../../a11y-knowledge/references/criteria/3.3.2.md) |
| 3.3.3 | Interactive | screenshots | [Judgment lines](../../a11y-knowledge/references/criteria/3.3.3.md) |
| 3.3.4 | Interactive | logs | [Judgment lines](../../a11y-knowledge/references/criteria/3.3.4.md) |
| 3.3.7 | Manual + automated candidates | `redundant-entry-check` **[CLI]** + logs | Fail if redundant entry required |
| 3.3.8 | Interactive + automated candidates | `accessible-authentication-check` **[CLI]** + captures | Fail if pasting is blocked and no other method exists; CAPTCHAs and alternatives need review |

## 4. Robust
| Criterion | Test Method | Evidence | Judgment Rule |
|---|---|---|---|
| 4.1.1 | — | — | Obsolete and removed in WCAG 2.2. Do not judge it or count it in the summary (for WCAG 2.0 / 2.1 audits, treat it as always satisfied for HTML and XML) |
| 4.1.2 | Automated | a11y tree | [Judgment lines](../../a11y-knowledge/references/criteria/4.1.2.md) |
| 4.1.3 | Automated + Interactive | a11y tree/logs | Fail if status messages not exposed |

## Available CLI Checks

The following criteria can be automatically checked via the `a11y-audit` CLI (see SKILL.md for usage):

| Criterion | Check name | Output |
|---|---|---|
| Multiple | `axe-audit` | `axe-result.json` |
| 1.3.4 | `orientation-check` | `orientation-result.json` |
| 1.3.5 | `autocomplete-audit` | `autocomplete-result.json` |
| 1.4.2, 2.2.2 | `auto-play-detection` | `auto-play-screenshots/` |
| 1.4.4 | `zoom-200-check` | `zoom-200-result.json` |
| 1.4.10 | `reflow-check` | `reflow-result.json` |
| 1.4.11 | `non-text-contrast-check` | `non-text-contrast-result.json` |
| 1.4.12 | `text-spacing-check` | `text-spacing-result.json` |
| 1.4.13 | `content-on-hover-check` | `content-on-hover-result.json` |
| 2.1.1 | `keyboard-reachability-check` | `keyboard-reachability-result.json` |
| 2.1.2 | `keyboard-trap-check` | `keyboard-trap-result.json` |
| 2.1.4 | `character-key-shortcut-check` | `character-key-shortcut-result.json` |
| 2.2.1 | `time-limit-detector` | `time-limit-result.json` |
| 2.4.3 | `focus-order-check` | `focus-order-result.json` |
| 2.4.7, 2.4.11, 2.4.12 (AAA), 3.2.1 | `focus-indicator-check` | `focus-indicator-result.json`, `focus-indicators.png` |
| 2.5.4 | `motion-actuation-check` | `motion-actuation-result.json` |
| 2.5.1, 2.5.7 | `pointer-gesture-check` | `pointer-gesture-result.json` |
| 2.5.2 | `pointer-cancellation-check` | `pointer-cancellation-result.json` |
| 3.2.2 | `change-on-input-check` | `change-on-input-result.json` |
| 2.5.5, 2.5.8 | `target-size-check` | `target-size-result.json`, `target-size-screenshot.png` |
| 3.3.7 | `redundant-entry-check` | `redundant-entry-result.json` |
| 3.3.8 | `accessible-authentication-check` | `accessible-authentication-result.json` |
