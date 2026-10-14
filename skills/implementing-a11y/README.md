[日本語版 (Japanese)](./README.ja.md)

# implementing-a11y

A thin entry point for implementing UI components and pages after looking up "Judgment lines" and "When building" in [a11y-knowledge](../a11y-knowledge/README.md). It has no reference material of its own.

## What it does

1. List the components to write by ARIA role
2. Look up the applicable success criteria in `index-by-component` (whole-page and multi-page ones from `index-by-criterion`)
3. Read "Judgment lines" and "When building" for each criterion
4. Prefer standard elements; build custom components on APG patterns
5. Record the "what not to assert" items from "When checking" as "needs visual verification"

## Relationship to the other skills

| Skill             | When to use                                                   |
| ----------------- | ------------------------------------------------------------- |
| implementing-a11y | About to write code; look up judgment lines and how to build  |
| reviewing-a11y    | Want issues reported on written or existing code              |
| auditing-wcag     | Formal audit assigning Pass/Fail/NT/NA per success criterion  |
| a11y-knowledge    | The knowledge base the three above read; not used on its own  |

Installed as a plugin, `../a11y-knowledge/` resolves. When installing by symlinking individual skill directories, link `a11y-knowledge` as well.

## File structure

```
skills/implementing-a11y/
├── SKILL.md / SKILL.ja.md     # Procedure
├── README.md / README.ja.md   # This file
└── agents/openai.yaml         # Codex UI metadata
```
