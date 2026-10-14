---
name: a11y-knowledge
description: A knowledge base of the rationale, judgment lines, how to build, and how to read automated checks for each WCAG 2.2 success criterion. Used in implementation, review, and auditing to look up the relevant file by success criterion or component.
argument-hint: 達成基準の番号（例 1.1.1）か部品の種類（例 button）
allowed-tools: Read Grep Glob
---

[日本語版 (Japanese)](./SKILL.ja.md)

# Accessibility Knowledge Base

A reference knowledge base that collects, per success criterion, "what the judgment is based on". It does not restate the definitions of WCAG success criteria or the ARIA specification (the agent is assumed to know them). What it does write down is: which parts of the Understanding documents to hold onto, the judgment lines for interpretation, how to build so the judgment lines are met, and what automated checks can and cannot decide.

This skill does not do work on its own. The implementation, review, and audit skills use it to read only the files for the success criteria they need.

## How to look things up

1. **When you know the success criterion number**: read `references/criteria/<number>.md` (for example `references/criteria/1.1.1.md`). The list is in [references/index-by-criterion.md](./references/index-by-criterion.md).
2. **When searching by component type** (when writing or reviewing code): use [references/index-by-component.md](./references/index-by-component.md) to find, from the component (button, link, image, dialog, and so on), the success criteria that apply to it, then read each file.
3. **When reading the results of automated checks (axe, `@a11y-skills/audit`)**: use [references/checks-axe.md](./references/checks-axe.md) and [references/checks-audit.md](./references/checks-audit.md) to confirm which results are settled and which need review, then read "When checking" in each success criterion's file.
4. **Success criteria that compare multiple pages** (3.2.3 / 3.2.4 / 3.2.6, and the comparison for 2.4.2): first read the shared judgment rules in [references/cross-page.md](./references/cross-page.md).

Do not read everything at once. Read only the success criteria being asked about.

## The four sections of each file

| Section        | Who reads it                          | Contents                                                                                                                                              |
| -------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rationale      | All situations                        | Which parts of the Understanding document to hold onto. Links and the key points the judgment rests on (definitions of terms, intent, where exceptions come from) |
| Judgment lines | All situations                        | How to read this criterion. What it does not apply to, exceptions, common misjudgments. Each item is marked **[Understanding]** (based on the Understanding document) or **[Our interpretation]** (operational interpretation) |
| When building  | Implementation and review             | How to build so the judgment lines are met, and what to avoid                                                                                          |
| When checking  | Auditing and reviewing automated checks | What automated checks decide, what remains, and what must not be asserted (conditions for leaving it as needs review)                                 |

## Rules for use

- **[Our interpretation] judgment lines are not the only way to read WCAG.** A project may override them by its own decision. If you override one, record the reason on the project side.
- **Do not re-judge results that an automated check has already settled.** Judge only what is not settled (needs review).
- **When you cannot decide, leave it as "needs review".** Do not mark it non-conformant or conformant by guesswork. Write down what would need to be confirmed to decide.
- **Write the reason first, then attach the verdict that fits the reason.** Do not write only the verdict and add the reason afterwards.

## Rules for what to include

- Include only "what the judgment is based on". Do not copy the text of the success criteria or the full Understanding documents.
- Limit the key points from the Understanding documents to the parts the judgment rests on (definitions of terms, intent, where exceptions come from).
- Write judgment lines separately as those based on the Understanding document ([Understanding]) and operational interpretations ([Our interpretation]).
- Write down the patterns of misjudgment learned from measurement. Do not write the measurement numbers.
