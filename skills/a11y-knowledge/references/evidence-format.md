[日本語版 (Japanese)](./evidence-format.ja.md)

# Editing and checking judgment evidence

Read when adding or updating criterion references. The pilots are [2.5.8](./criteria/2.5.8.md), [1.1.1](./criteria/1.1.1.md), and [4.1.2](./criteria/4.1.2.md). Also verified: [2.4.3](./criteria/2.4.3.md), [2.4.7](./criteria/2.4.7.md), and [2.4.11](./criteria/2.4.11.md). Newly added and verified: [1.4.11](./criteria/1.4.11.md), [2.4.12](./criteria/2.4.12.md), [2.4.13](./criteria/2.4.13.md). Resizing/layout criteria verified: [1.4.4](./criteria/1.4.4.md), [1.4.10](./criteria/1.4.10.md), [1.4.12](./criteria/1.4.12.md). Pointer interaction criteria verified: [2.5.1](./criteria/2.5.1.md), [2.5.7](./criteria/2.5.7.md), [2.5.5](./criteria/2.5.5.md). Input safeguard criteria newly added and verified: [2.1.4](./criteria/2.1.4.md), [2.5.2](./criteria/2.5.2.md), [2.5.4](./criteria/2.5.4.md). Sensory instructions, orientation, and color criteria verified: [1.3.3](./criteria/1.3.3.md), [1.3.4](./criteria/1.3.4.md), [1.4.1](./criteria/1.4.1.md). Timing, automatic updates, and audio control verified: [2.2.1](./criteria/2.2.1.md), [2.2.2](./criteria/2.2.2.md), [1.4.2](./criteria/1.4.2.md). Other criteria retain the existing format; do not treat their evidence as reverified.

## Unit of extraction

Make each item a condition that changes the verdict rather than restating definitions or general principles. Do not overgeneralize examples. Keep exceptions, scope, and required combinations with the summary.

| Field | Content |
| --- | --- |
| ID / issue | `<criterion>-E<sequence>` and a judgment question. Use identical IDs in both languages; do not reuse deleted IDs for different issues |
| Type / source | Normative / Understanding / Technique (Sufficient or Advisory, required combinations) / Failure / ACT / technical specification. Document title, section title, section URL |
| Summary | Conditions supported by the source. Distinguish from quotations and our interpretations |
| Conditions / limits | Targets, exceptions, further checks, and unsupported conclusions |
| Verification | Date checked and version; shared information can go at the top of the file. Also record ACT approval status and rule version |

Reference evidence IDs from each judgment line. Mark operational decisions as `[Our interpretation: reason. Evidence: …]`. Retain deliberately adopted author policies as [Our interpretation], with reasons, scope, and reporting treatment; do not present them as official interpretations. For source claims, if a source cannot be retrieved or supporting text cannot be found, mark `[Unverified: missing evidence]` and do not use it to settle a verdict.

## Write to support decisions

- State the default judgment for ordinary cases first, followed by concrete conditions that change it and the evidence to check. Do not stop at “it depends” or “needs review.”
- Do not turn a source’s examples of conformance or exceptions into exhaustive necessary conditions. When adopting a broader operational policy, distinguish it as [Our interpretation] with its rationale and scope.
- Do not return cases covered by an adopted default to review merely because of abstract uncertainty. Tie further review to concrete signs that the default does not apply or to specific missing information.

## Handling sources

- Use WCAG itself as the normative reference; distinguish Understanding, Techniques, and ACT as supporting material.
- Not using a technique or failing its test alone does not establish WCAG failure. Match Failure techniques to their targets and conditions too. [Understanding Techniques](https://www.w3.org/WAI/WCAG22/Understanding/understanding-techniques)
- Check ACT applicability, assumptions, and outcome mapping to WCAG. Do not extend passes to criterion-wide conformance. Keep Proposed / Deprecated rules distinct from current approved rules. [About ACT Rules](https://www.w3.org/WAI/standards-guidelines/act/rules/about/)
- Check published W3C originals. Identify editor's drafts or Japanese translations used as supplements. Edit Japanese as the repository's source of truth before translating to English, while verifying the evidence against the W3C original.
- Identify pages updated in place and record the date checked. Use fixed-version URLs when available. A date alone cannot reconstruct earlier text; record a source-repository commit or equivalent when strict reproducibility is needed. Do not invent versions or hashes.

## Completion checks per criterion

1. Open the relevant source sections and verify document IDs, criterion mappings, and conditions. Do not select evidence merely to justify existing judgment lines.
2. Match each judgment line to evidence. Correct, remove, or mark as unverified any unsupported assertion presented as an official judgment. If adopting an author policy, label it [Our interpretation] and state the reason.
3. Check interpretation against a failure case, a case covered by an exception, and a case needing more evidence. Do not label locally created examples as W3C examples.
4. Check consistency with automated-check mappings, component indexes, and callers. Verify tool-specific behavior in implementation and distinguish it from W3C requirements.
5. Synchronize English IDs, sources, and conditions; check links and run `npm run validate:skills`.

After reviewing the pilot format, process related criteria in batches of three to five, then review cross-criterion inconsistencies and unverified items. Review whether the source supports the judgment, not only whether the summary reads well.
