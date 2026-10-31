---
name: implementing-a11y
description: Entry point for implementing UI components and pages after looking up "Judgment lines" and "When building" in a11y-knowledge. Use reviewing-a11y to get issues reported on written or existing code, and auditing-wcag for a formal audit that assigns conformance per success criterion.
argument-hint: '実装する部品やファイル（例: dialog、components/Modal.tsx）'
allowed-tools: Read Grep Glob
---

[日本語版 (Japanese)](./SKILL.ja.md)

# Accessible Implementation

Look up the success criteria that apply to the UI component you are about to write in [a11y-knowledge](../a11y-knowledge/SKILL.md), read "Judgment lines" and "When building", then implement. This skill holds only the procedure, not the knowledge.

- You want issues reported on what you wrote → `reviewing-a11y`
- You want a formal audit with Pass/Fail per success criterion → `auditing-wcag`

> The knowledge base is referenced by the relative path `../a11y-knowledge/`. It resolves when installed as a plugin. When installed by symlinking individual skill directories, link `a11y-knowledge` as well.

## Procedure

### 1. List the components to write by role

Break the UI you are about to implement into ARIA roles (for example `dialog`, with `button` and `textbox` inside). List by role, not by visual name (modal, toggle).

### 2. Look up the success criteria for each component

Use [index-by-component.md](../a11y-knowledge/references/index-by-component.md) to find the success criteria that apply to each role you listed.

Whole-page and multi-page success criteria (2.4.1, 2.4.2, 3.1.1, 1.4.1, 1.3.3, 3.2.3, 3.2.4, 3.2.6) are not attached to components. When writing layouts, templates, or page scaffolding, use [index-by-criterion.md](../a11y-knowledge/references/index-by-criterion.md) and pick the criteria whose nature is "whole page" or "multiple pages".

### 3. Read "Judgment lines" and "When building" for each criterion

For each criterion found, open `../a11y-knowledge/references/criteria/<number>.md` and read only the two sections "Judgment lines" and "When building" ("Rationale" and "When checking" are not needed for implementation). Do not read everything at once.

- **[Understanding]** judgment lines are based on the Understanding documents. Follow them.
- **[Our interpretation]** judgment lines are operational interpretations. The project's own decisions (design guidelines, how existing components are built) may override them. If you override one, record the reason in a code comment or the PR description.

### 4. Build

- If a standard HTML element does the job, use it (`<button>`, `<a href>`, `<input>`, `<dialog>`, `<details>`). Add roles with ARIA only when a standard element cannot express it.
- For custom components, follow the [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/) patterns (keyboard interaction, roles, states).
- While writing, check that you are not falling into the "what to avoid" items under "When building".

### 5. Self-check and leave the visual checks on record

Re-read what you wrote against the "When building" sections you read. Then open "When checking" for each criterion and, for anything listed under "what not to assert" (things that can only be decided by looking or operating), leave a note in a code comment or the PR description as "needs visual verification". Do not write "handled" for anything you have not verified yourself.

## Output

Alongside the implementation, add the following.

```markdown
### Success criteria considered for accessibility
- dialog: 2.1.2 (focus containment), 2.4.3 (focus on open/close). Provide a name as best practice under the [knowledge base’s author policy](../a11y-knowledge/references/criteria/4.1.2.md). Controls inside must also meet 4.1.2.
- button: 2.5.8, 4.1.2

### Needs visual verification
- [ ] Focus returns to the opening button after closing (2.4.3)
- [ ] The focus ring is visible against the background (2.4.7)

### [Our interpretation] judgment lines overridden
- (if any: what and why)
```
