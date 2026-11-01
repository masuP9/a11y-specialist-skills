[日本語版 (Japanese)](./cross-page.ja.md)

# Shared rules for success criteria that compare multiple pages

Judgment rules shared by 3.2.3 (Consistent Navigation), 3.2.4 (Consistent Identification), 3.2.6 (Consistent Help), and the comparison of "pages with the same title" for 2.4.2. Read this before the file for each success criterion.

## Rationale

- WCAG conformance is decided per page ([Conformance Requirements](https://www.w3.org/TR/WCAG22/#conformance-reqs)). Whether something is "consistent" cannot be known without comparing with other pages, but non-conformance is attached to individual pages.
- The "set of web pages" in 3.2.3 / 3.2.4 / 3.2.6 is a collection of related web pages that share a common purpose and are created by the same author, group, or organization (WCAG's definition of the term).

Sources checked: 2026-11-02. Majority and candidate extraction below are author inspection/reporting policies, not WCAG conformance conditions. See evidence in [3.2.3](./criteria/3.2.3.md), [3.2.4](./criteria/3.2.4.md), and [3.2.6](./criteria/3.2.6.md).

For 2.4.2, use only the procedure for collecting duplicate titles as comparison candidates. Compare each title with its own page topic or purpose; do not apply majority/tie assignment below. [2.4.2-E01–E03](./criteria/2.4.2.md)

## Judgment rules

- **Establish set boundaries first, then compare tested pages within the set.** A shared domain alone does not define a set. Record purpose, authorship, and functional grouping; do not extend results to untested pages. [Our interpretation: inspection scope policy. See each criterion for official scope]
- **Assign page results by following the majority and failing the differing pages; ties are needs review.** Retain this assignment policy, but preserve confirmed inconsistencies in a tie and state that page assignment is unresolved. A conformant result for majority pages is a comparison result, not a guarantee of WCAG conformance for the set. [Our interpretation: deciding where to report page results]
- **Count the majority by number of pages.** Counting by number of elements can flip the result when one page has several of the same component. [Our interpretation]
- **Do not compare mechanisms confirmed to exist on only one page under 3.2.3 / 3.2.6.** Merely having obtained one page means needs review. Under 3.2.4, also inspect repetition within one page in the set. Do not apply page-count majorities to components within one page; record identification inconsistencies with the components. [Evidence: E01 in each criterion. Insufficient-material handling and reporting are author policy]
- **Compare pages under matching presentation conditions.** Record width, zoom, orientation, and menu state. For 3.2.6, follow normative Note 2. For 3.2.4, go beyond initial matching-condition comparisons to check recognition of the same function in responsive presentations. [Our interpretation: comparison procedure. Evidence: 3.2.6-E02 / 3.2.4-E03]
- **Use the accessibility tree for the initial order comparison.** Do not equate tree order with raw DOM order. Separately check visual order for 3.2.3 and visual identification for 3.2.4, retaining untested scope. Under 3.2.6, visual position differences alone do not fail if serial order matches. [Our interpretation: initial inspection policy. Evidence: 3.2.3-E01 / 3.2.4-E03 / 3.2.6-E02]
- **Groups that could not be judged are needs review.** Do not mark non-conformant by guesswork. [Our interpretation]

## Division of roles (separating judgment from mechanical comparison)

The division that gave good accuracy is these three steps.

1. **Build the input (mechanical)**: from each page's aria snapshot (`details.snapshot` from `page-snapshot`), pick up candidates for navigation mechanisms, components, and help.
2. **Group them (judgment)**: group "the same thing across pages" into groups. Do not judge order or majority here.
3. **Compare and report**: compare relative order and identification per group. Do not equate mechanical string differences with failures; check criterion exceptions and author policies, then apply majority assignment across pages.

Do not silently drop candidates at the judgment step. Each candidate passed in goes into exactly one group or "not applicable", exactly once. Dropping one can flip the majority and produce a false non-conformance.

## Common misjudgments

- **Items with different names**: whether items with different names and different link targets ("Print" and "Printing") are a rewording of the same item or different items cannot be decided from the wording alone. Excluding them as different items misses a 3.2.3 issue. The Understanding document also allows items to be added or removed, so this is ambiguity itself. When in doubt, needs review.
- **Needs review from an even split**: an identification inconsistency in the same repeated function, appearing once on each of two pages, leaves page assignment tied and needing review. Still report the inconsistency evidence. A third page does not always establish a majority.
- **Excluding a whole mechanism leaves nothing evaluated**: in 3.2.3, excluding an entire mechanism as "only on this page" or "a section's sub-navigation" leaves that mechanism unevaluated. Check that nothing was excluded that should not have been.
- **Skip link candidates are coarse**: picking "in-page links near the top" also picks up table-of-contents links. A link to within the page (href starting with `#`) becomes each page's URL to itself, so do not treat them as the same by link target.
- **Buttons and unnamed inputs**: excluding checkboxes and similar controls from initial extraction does not make them outside 3.2.4. Supplement with screens, DOM, and action results to establish repetition; leave needs review if material is unavailable.

## How to gather the input

- Run `page-snapshot` from `@a11y-skills/audit` on each page (use a separate `--output-dir` per page).
- Pick up landmarks (banner / navigation / contentinfo / search / main) and the link / button / input fields inside them from the snapshot hierarchy.
- For the 2.4.2 comparison, use `details.title`.
- `page-snapshot` leaves every result bucket empty and provides no verdict. Empty arrays do not mean Pass/NA. `details.viewport` contains width and height; record zoom, orientation, and menu state separately. Unreadable frames retain `snapshot: null` and an error, so leave them unverified. [Implementation: runPageSnapshot.ts](../../../packages/a11y-audit/src/playwright/runPageSnapshot.ts)
