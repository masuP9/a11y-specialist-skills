[日本語版 (Japanese)](./cross-page.ja.md)

# Shared rules for success criteria that compare multiple pages

Judgment rules shared by 3.2.3 (Consistent Navigation), 3.2.4 (Consistent Identification), 3.2.6 (Consistent Help), and the comparison of "pages with the same title" for 2.4.2. Read this before the file for each success criterion.

## Rationale

- WCAG conformance is decided per page ([Conformance Requirements](https://www.w3.org/TR/WCAG22/#conformance-reqs)). Whether something is "consistent" cannot be known without comparing with other pages, but non-conformance is attached to individual pages.
- The "set of web pages" in 3.2.3 / 3.2.4 / 3.2.6 is a collection of related web pages that share a common purpose and are created by the same author, group, or organization (WCAG's definition of the term).

## Judgment rules

- **The range to compare is only the pages that were tested.** Do not consider pages that were not tested. [Our interpretation]
- **When pages disagree, follow the majority and mark the differing ones non-conformant. If split evenly, needs review.** Also record conformant (conformant when there is no disagreement). [Our interpretation]
- **Count the majority by number of pages.** Counting by number of elements can flip the result when one page has several of the same component. [Our interpretation]
- **Do not evaluate something that exists on only one page.** There is nothing to compare it with. [Understanding] (only repeated things are in scope)
- **Do not compare across different viewports (screen widths).** [Our interpretation]
- **Do not use visual order; judge only by source order (the order of the accessibility tree).** Reordering navigation with CSS is rare. [Our interpretation]
- **Groups that could not be judged are needs review.** Do not mark non-conformant by guesswork. [Our interpretation]

## Division of roles (separating judgment from mechanical comparison)

The division that gave good accuracy is these three steps.

1. **Build the input (mechanical)**: from each page's aria snapshot (`details.snapshot` from `page-snapshot`), pick up candidates for navigation mechanisms, components, and help.
2. **Group them (judgment)**: group "the same thing across pages" into groups. Do not judge order or majority here.
3. **Judge (mechanical)**: for each group, compare relative order and consistency of names, and apply the majority rule.

Do not silently drop candidates at the judgment step. Each candidate passed in goes into exactly one group or "not applicable", exactly once. Dropping one can flip the majority and produce a false non-conformance.

## Common misjudgments

- **Items with different names**: whether items with different names and different link targets ("Print" and "Printing") are a rewording of the same item or different items cannot be decided from the wording alone. Excluding them as different items misses a 3.2.3 issue. The Understanding document also allows items to be added or removed, so this is ambiguity itself. When in doubt, needs review.
- **Needs review from an even split**: when things with different names for the same destination appear exactly once each on two separate pages, the result is always an even split (needs review). With three or more pages, a majority can be decided.
- **Excluding a whole mechanism leaves nothing evaluated**: in 3.2.3, excluding an entire mechanism as "only on this page" or "a section's sub-navigation" leaves that mechanism unevaluated. Check that nothing was excluded that should not have been.
- **Skip link candidates are coarse**: picking "in-page links near the top" also picks up table-of-contents links. A link to within the page (href starting with `#`) becomes each page's URL to itself, so do not treat them as the same by link target.
- **Buttons and unnamed input fields tend to become "cannot judge"**: an unnamed checkbox can only be identified as the same component by appearance, so exclude it from 3.2.4.

## How to gather the input

- Run `page-snapshot` from `@a11y-skills/audit` on each page (use a separate `--output-dir` per page).
- Pick up landmarks (banner / navigation / contentinfo / search / main) and the link / button / input fields inside them from the snapshot hierarchy.
- For the 2.4.2 comparison, use `details.title`.
