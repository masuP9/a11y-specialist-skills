[日本語版 (Japanese)](./automated-checks.ja.md)

# Automated Checks (Playwright a11y tree)

Only machine-verifiable items from the Playwright accessibility tree are covered. Each result must be labeled Pass/Fail/NT/NA and include evidence from the a11y tree or DOM fragment.

## Common Judgment Rules
- Source: `page.accessibility.snapshot()` / DOM attributes
- Evidence: role, name, relevant attributes, XPath/CSS selector
- Fail rule: any element violating the rule

## Structure/Semantics
| Criterion | Automated check | Evidence | Fail rule |
|---|---|---|---|
| 1.3.1 | Headings/landmarks/lists/tables expressed with correct roles | a11y tree snippet | Required semantic elements collapse to plain text |
| 1.3.2 | a11y tree order matches DOM order | a11y tree + DOM order | Reading order conflicts with DOM order |
| 2.4.1 | Bypass mechanism present (skip link / main landmark / headings within main content) | a11y tree (link names, landmarks, heading structure) | No skip link, main landmark, or proper headings |
| 2.4.2 | Page title is non-empty | `document.title` | Title missing/empty |
| 2.4.6 | Headings/labels have accessible names | a11y tree name | Heading/label is unnamed |

## Alt Text
| Criterion | Automated check | Evidence | Fail rule |
|---|---|---|---|
| 1.1.1 | Image has accessible name (`alt`/`aria-label`, etc.) | a11y tree | Informative image is unnamed |
| 3.3.2 | Form inputs have labels or descriptions | a11y tree + DOM | Input is unnamed/undocumented |

## ARIA
| Criterion | Automated check | Evidence | Fail rule |
|---|---|---|---|
| 4.1.2 | Role/name/value are computable | a11y tree | Interactive element is unnamed/role missing |
| 4.1.3 | Status messages exposed via proper role | a11y tree | State changes not exposed via role="status", etc. |
| 2.5.3 | Visible label text included in accessible name | DOM text + a11y name | Label text missing from name |

## Language
| Criterion | Automated check | Evidence | Fail rule |
|---|---|---|---|
| 3.1.1 | `<html lang>` is present and valid | DOM attribute | lang missing/invalid |

## Links/Buttons
| Criterion | Automated check | Evidence | Fail rule |
|---|---|---|---|
| 2.4.4 | Link accessible name is not empty | a11y tree | Empty/unnamed links |
| 3.2.1 | No unexpected context change on focus (DOM diff) | DOM diff log | Focus triggers navigation or major update |
| 3.2.2 | No automatic submit/navigation on input (DOM diff) | DOM diff log | Input alone triggers submit/navigation |

## Consistency
| Criterion | Automated check | Evidence | Fail rule |
|---|---|---|---|
| 3.2.3 | Primary navigation structure consistent across pages | a11y tree comparison | Navigation structure differs materially |
| 3.2.4 | Same function uses same role/name | a11y tree comparison | Name/role mismatch for same function |
| 3.2.6 | Help mechanisms appear consistently | a11y tree comparison | Help present on some pages only |
