[日本語版 (Japanese)](./README.ja.md)

# a11y-knowledge

A knowledge base that collects, per WCAG 2.2 success criterion, "what the judgment is based on". It makes the same knowledge available in three situations: implementing, reviewing, and examining the results of automated checks.

## What is in it

One file per success criterion (`references/criteria/<number>.md`). Each has four sections.

1. **Rationale**: which parts of the Understanding document to hold onto. Links and key points.
2. **Judgment lines**: how to read this criterion. What it does not apply to, exceptions, common misjudgments. Separates those based on the Understanding document ([Understanding]) from operational interpretations ([Our interpretation]).
3. **When building**: how to build so the judgment lines are met, and what to avoid.
4. **When checking**: what automated checks (axe, `@a11y-skills/audit`) decide, what remains, and what must not be asserted.

It does not restate the definitions of success criteria, the ARIA specification, or HTML basics (the agent is assumed to know them; see "Assume the Agent's Prior Knowledge" in `AGENTS.md`).

## Indexes and shared pages

| File                                                                   | Purpose                                                                                   |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [references/index-by-criterion.md](./references/index-by-criterion.md) | Look up by success criterion number. Also lists the nature of each criterion (what inputs it needs) |
| [references/index-by-component.md](./references/index-by-component.md) | Look up, from the component type (button, link, image, and so on), the success criteria that apply |
| [references/checks-axe.md](./references/checks-axe.md)                 | Which axe results may be counted as conformant and which must stay as needs review        |
| [references/checks-audit.md](./references/checks-audit.md)             | What each `@a11y-skills/audit` check decides and what remains                             |
| [references/cross-page.md](./references/cross-page.md)                 | Shared judgment rules for success criteria that compare multiple pages                    |

## Relationship to other skills

| Skill                              | How it uses this knowledge base                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| reviewing-a11y                     | From the components in the diff or on screen, look up success criteria in `index-by-component` and read "Judgment lines" and "When building" |
| auditing-wcag                      | Sort automated check results with `checks-*`, then read "Judgment lines" and "When checking" for the criteria that need review |
| implementing-a11y                  | From the component about to be written, look it up in `index-by-component` and read "Judgment lines" and "When building" |

## Where it comes from

Many of the judgment lines and "When checking" sections were decided in [a11y-guild](https://github.com/masuP9/a11y-guild) (a management tool for AI-driven accessibility testing) while measuring verdicts against practice pages with known answers and against real sites. The measurement numbers are not included; only the patterns of misjudgment are.

## File structure

```
skills/a11y-knowledge/
├── SKILL.md / SKILL.ja.md            # How to look things up and rules for use
├── README.md / README.ja.md          # This file
├── agents/openai.yaml                # Codex UI metadata
└── references/
    ├── index-by-criterion(.ja).md    # Index by success criterion
    ├── index-by-component(.ja).md    # Index by component
    ├── checks-axe(.ja).md            # How to read axe results
    ├── checks-audit(.ja).md          # How to read @a11y-skills/audit results
    ├── cross-page(.ja).md            # Shared rules for comparing multiple pages
    └── criteria/
        ├── 1.1.1(.ja).md
        ├── 1.2.2(.ja).md
        └── ...
```
