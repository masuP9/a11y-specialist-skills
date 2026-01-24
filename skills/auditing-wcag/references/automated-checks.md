[日本語版 (Japanese)](./automated-checks.ja.md)

# Automated Checks (Playwright a11y tree)

Only machine-verifiable items from the Playwright accessibility tree are covered. Each result must be labeled Pass/Fail/NT/NA and include evidence from the a11y tree or DOM fragment.

> **Script:** `scripts/axe-audit.ts` provides comprehensive automated checks via axe-core, covering many of the criteria below plus additional rules. Run it first for broad coverage, then supplement with manual checks.

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

## Time-based Media
| Criterion | Automated check | Evidence | Fail rule |
|---|---|---|---|
| 1.2.1 | Audio/video-only has text alternative | DOM + a11y tree | Media element without transcript link nearby |
| 1.2.2 | Video has captions | axe video-caption + DOM | `<video>` without `<track kind="captions">` |
| 1.2.3 | Video has audio description or media alternative | DOM | `<video>` without `<track kind="descriptions">` and no transcript link |
| 1.2.5 | Video has audio description | DOM | `<video>` without `<track kind="descriptions">` |

> **1.2.x Checks:** Detect media elements and verify alternatives:
>
> 1. **Find media:** Detect `<video>`, `<audio>`, and embedded players (`<iframe>` with YouTube/Vimeo)
> 2. **Check for tracks:**
>    - `<track kind="captions">` for 1.2.2
>    - `<track kind="descriptions">` for 1.2.3, 1.2.5
> 3. **Check for alternatives:**
>    - Nearby links with "transcript", "text version", "代替テキスト", "文字起こし" etc.
>    - `aria-describedby` pointing to text alternative
>
> **Limitations:**
> - Cannot verify caption/description quality or accuracy
> - Cannot detect audio-only content that should have transcript
> - Embedded players (YouTube/Vimeo) may have their own caption system — flag for manual review
>
> **Pass if:** Media has appropriate track elements or nearby alternative links.
> **Fail if:** Media element found with no track and no alternative detected.

## ARIA
| Criterion | Automated check | Evidence | Fail rule |
|---|---|---|---|
| 4.1.2 | Role/name/value are computable | a11y tree | Interactive element is unnamed/role missing |
| 4.1.3 | Status messages exposed via proper role | a11y tree | State changes not exposed via role="status", etc. |
| 2.5.3 | Visible label text included in accessible name | DOM text + a11y name | Label text missing from name |

## Color/Contrast
| Criterion | Automated check | Evidence | Fail rule |
|---|---|---|---|
| 1.4.1 | Text references to color for UI identification | a11y tree text | Color name used to identify UI elements or convey information |
| 1.4.3 | Text contrast ratio meets AA | axe color-contrast | Ratio below 4.5:1 (normal) or 3:1 (large) |
| 1.4.11 | Non-text contrast meets AA | axe non-text color contrast rules | Ratio below 3:1 |

> **1.4.1 Check A - Text references:** Scan accessible text for color references (red, blue, green, etc. in any language/variation) that indicate reliance on color alone:
> - Instructions: "Required fields are red", "Click the green button"
> - Status: "Errors shown in red", "Available in green"
> - Data labels: "Red = Mary, Blue = Tom"
>
> **Pass if:** Color is used together with shape/symbol (e.g., "red circle", "green triangle icon", "blue square button").
>
> **Fail if:** Color alone identifies the element with no shape/symbol reference.
>
> Use judgment to distinguish actual color-reliance from idioms ("in the red" = financial loss).
>
> **1.4.1 Check B - Links in text (F73):** Links within text blocks must be visually distinguishable without relying on color alone:
> - **Pass if:** Link has underline, or other non-color indicator (border, icon, bold, etc.)
> - **Pass if:** Link color has ≥3:1 contrast ratio against surrounding text AND has additional visual cue on hover/focus
> - **Fail if:** Link has no underline AND contrast ratio against surrounding text is <3:1
>
> axe-core's `link-in-text-block` rule covers this. Check axe results for this specific rule.
>
> **1.4.1 Check C - Visual state differentiation:** When screenshot shows elements of the same shape distinguished only by color, verify the a11y tree exposes the state programmatically:
>
> | Visual pattern | Required semantics |
> |----------------|-------------------|
> | Selected tab (different color) | `aria-selected="true"` |
> | Current nav item (different color) | `aria-current="page"` |
> | Today in calendar (different color) | `aria-current="date"` |
> | Error field (red border) | `aria-invalid="true"` |
> | Required field (different color) | `aria-required="true"` or `required` |
> | Disabled button (grayed out) | `aria-disabled="true"` or `disabled` |
>
> **Pass if:** State is exposed in a11y tree. **Fail if:** Color is the only differentiator.

> **Note:** axe-core cannot check contrast against complex background images or gradients. Manual verification may still be needed in some cases.

## Sensory Characteristics
| Criterion | Automated check | Evidence | Fail rule |
|---|---|---|---|
| 1.3.3 | Instructions not relying solely on sensory cues | a11y tree text | Sensory-only instructions without programmatic alternative |

> **1.3.3 Check:** Scan accessible text for sensory characteristic references that may indicate reliance on sensory cues alone:
>
> | Sensory type | Example phrases |
> |--------------|-----------------|
> | Position | "right side", "left menu", "above", "below", "next to" |
> | Shape | "round button", "square icon", "triangle" |
> | Size | "large button", "small link", "big icon" |
> | Sound | "when you hear a beep", "after the chime" |
> | Visual | "see the image", "as shown", "the highlighted area" |
>
> **Pass if:** Sensory cue is combined with programmatic identifier (e.g., "the Submit button on the right", "the round Search icon").
>
> **Fail if:** Sensory cue is the only way to identify the element (e.g., "click the button on the right" with no other identifier).
>
> Note: More abstract than 1.4.1 color checks; use judgment for context.

## Input Purpose
| Criterion | Automated check | Evidence | Fail rule |
|---|---|---|---|
| 1.3.5 | Input fields have appropriate autocomplete attribute | autocomplete-audit.ts | autocomplete missing/incorrect for user data fields |

> **Script:** `scripts/autocomplete-audit.ts` - Matches field names/labels to expected autocomplete tokens and reports missing or invalid values.

## Language
| Criterion | Automated check | Evidence | Fail rule |
|---|---|---|---|
| 3.1.1 | `<html lang>` is present and valid | DOM attribute | lang missing/invalid |
| 3.1.2 | Language of parts is identified | DOM + a11y tree text | Foreign language text without lang attribute |

> **3.1.2 Check:** Two-part check:
>
> 1. **axe-core `valid-lang` rule:** Detects invalid lang attribute values on elements
>
> 2. **Foreign text detection:** Scan page text for foreign language content (relative to page's primary language):
>    - Detect text in different scripts (e.g., Japanese on English page, Latin on Japanese page)
>    - Detect common foreign phrases/words
>    - Check if containing element has appropriate `lang` attribute
>
> **Pass if:** Foreign language text is wrapped with correct `lang` attribute (e.g., `<span lang="ja">日本語</span>`).
> **Fail if:** Foreign language text has no `lang` attribute on containing element.
>
> Note: Short borrowed words (e.g., "café", "sushi") may not need lang attribute; use judgment.

## Links/Buttons
| Criterion | Automated check | Evidence | Fail rule |
|---|---|---|---|
| 2.4.4 | Link accessible name is not empty and not ambiguous | a11y tree | Empty/unnamed or ambiguous links without context |
| 3.2.1 | No unexpected context change on focus (DOM diff) | DOM diff log | Focus triggers navigation or major update |
| 3.2.2 | No automatic submit/navigation on input (DOM diff) | DOM diff log | Input alone triggers submit/navigation |

> **2.4.4 Check:** Two-part automated check:
>
> 1. **Empty links:** axe-core `link-name` rule detects links with no accessible name
>
> 2. **Ambiguous links without context:** Detect links with generic text that are the only child (no surrounding context):
>    - Generic terms: "click here", "here", "more", "read more", "learn more", "details", "continue", "こちら", "詳細", "もっと見る", "続きを読む"
>    - Check if link is only-child in its parent (no sibling text providing context)
>    - Check if link has no `aria-describedby` or `aria-labelledby` providing context
>
> **Pass if:** Link has descriptive text, OR generic text but surrounded by contextual text/siblings.
>
> **Fail if:** Generic link text AND only-child AND no programmatic context.

## Cross-Page Checks

These checks require comparing data across all audit target pages. Run after collecting a11y tree snapshots and link data from all pages.

| Criterion | Automated check | Evidence | Fail rule |
|---|---|---|---|
| 2.4.5 | Multiple ways to locate pages | link graph + search/sitemap detection | Pages reachable only by single path with no search/sitemap |
| 3.2.3 | Primary navigation structure consistent across pages | a11y tree comparison | Navigation structure differs materially |
| 3.2.4 | Same function uses same role/name | a11y tree comparison | Name/role mismatch for same function |
| 3.2.6 | Help mechanisms appear consistently | a11y tree comparison | Help present on some pages only |

> **2.4.5 Check:** After collecting links from all audit target pages:
>
> 1. Build link graph: Extract all `<a href>` from each page
> 2. Check for multiple ways:
>    - **Search:** Detect search form (`role="search"`, `input[type="search"]`, or form with search-related labels)
>    - **Sitemap:** Detect sitemap page (link with "sitemap" in text/href) — recommend including sitemap in audit target pages
>    - **Cross-linking:** Each page should be linked from multiple other pages
> 3. Analyze reachability:
>    - Pages linked from only one source AND no search AND no sitemap → potential issue
>
> **Pass if:** Site has search OR sitemap OR pages are cross-linked from multiple sources.
> **Fail if:** Pages reachable only via single navigation path with no alternative way.

> **3.2.3 Check:** Compare the structure of repeated navigation components:
>
> 1. Extract landmark regions: `banner` (header), `navigation`, `contentinfo` (footer)
> 2. Compare child structure within each landmark across pages:
>    - Same relative order of nav items (by accessible name)
>    - Same roles for corresponding items
> 3. Allow for:
>    - Current page indicator differences (e.g., `aria-current="page"` on different items)
>    - Items omitted on some pages, as long as remaining items keep **same relative order**
>
> **Same relative order exception:** If Page 1 has "A, B, C, D" and Page 2 has "A, C, D" (B omitted), this is **Pass** because A→C→D order is preserved. But "A, D, C" would be **Fail**.
>
> **Pass if:** Relative order of shared navigation items is consistent across all pages.
> **Fail if:** Navigation items appear in different relative order across pages.
