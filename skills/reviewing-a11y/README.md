# reviewing-a11y

[日本語版 (Japanese)](./README.ja.md)

A skill for reviewing web pages, component implementations, design mockups, and specifications from WCAG 2.2 and WAI-ARIA APG perspectives.

## Architecture

This skill uses a **routing pattern** that selects a target-specific reference guide. The main agent reads the guide and performs the review directly:

```
┌─────────────────────────────────────┐
│   reviewing-a11y                    │
│   - Identifies review target        │
│   - Reads guide and reviews target  │
└──────────┬──────────────────────────┘
           │
    ┌──────┴────────┬─────────────┐
    │               │             │
    ▼               ▼             ▼
┌───────┐    ┌──────────┐   ┌────────────┐
│ Page  │    │   Code   │   │   Design   │
│ Guide │    │  Guide   │   │   Guide    │
└───────┘    └──────────┘   └────────────┘
```

### Reference Guides

1. **Page Review** (`references/page-review.md`)
   - Target: Live web pages (URLs)
   - Method: Playwright browser snapshots
   - Focus: Rendered output, runtime behavior

2. **Code Review** (`references/code-review.md`)
   - Target: Source files (.jsx, .tsx, .vue, .html)
   - Method: Static code analysis
   - Focus: Implementation patterns, semantic structure

3. **Design Review** (`references/design-review.md`)
   - Target: Design files (Figma, images, PDFs)
   - Method: Visual inspection, spec analysis
   - Focus: Design decisions, visual accessibility

## Prerequisites (Agent's Existing Knowledge)

This skill assumes Claude Code and Codex already know:
- **WCAG 2.2** success criteria, levels (A, AA, AAA), and their meanings
- **WAI-ARIA** authoring practices, roles, states, and properties
- **Standard accessibility patterns**: Semantic HTML, form accessibility, keyboard navigation
- **Common issues and fixes**: Missing alt text, improper ARIA usage, keyboard traps, etc.

The guides focus on **how to review** with available capabilities and workflows, building on the agent's existing accessibility knowledge.

For human reference, detailed WCAG checklists are available in `references/wcag-checklist.md`.

## Features

- **Automatic routing**: Identifies the review target and selects the appropriate guide
- **Optional parallelism**: Delegates to sub-agents only when the user explicitly requests it
- **Comprehensive coverage**: Pages, code, and designs all supported
- **WCAG compliant**: Each issue linked to WCAG success criteria
- **Structured output**: Positive findings, issues by severity, manual check recommendations
- **Bilingual**: English and Japanese guides available

## Check Items

### Automated Checks

| Category | Items |
|----------|-------|
| Semantics | Heading structure (h1-h6), landmarks, appropriate HTML elements |
| Alt text | img, svg, icon alt/aria-label |
| Forms | label association, required fields, fieldset/legend |
| ARIA | role validity, aria-* attributes, avoiding redundant ARIA |
| Interactive | Accessible names, keyboard focusability, tabindex |
| Links/Buttons | Clear purpose text, avoiding empty links |

### Manual Check Recommendations

| Category | Reason |
|----------|--------|
| Consistent navigation | Requires multi-page comparison |
| Error handling | Requires form interaction |
| Color contrast | Requires measurement tools |
| Keyboard operability | Requires full operation path testing |
| Dynamic content | Requires state change observation |
| Focus management | Requires modal/SPA transition testing |

## Usage Examples

### Web Page Review
```
Review a11y for https://example.com
Check accessibility of https://mysite.com/dashboard
```

The skill detects the URL and follows the page review guide with available browser interaction or web retrieval.

### Code Review
```
Check accessibility of src/components/Modal.tsx
Review a11y in src/pages/Login.vue
```

The skill detects file paths and follows the code review guide across the target and related code.

### Design Review
```
Review this Figma design: https://figma.com/file/abc123
Check accessibility of this design mockup (with attached image)
```

The skill detects design artifacts and follows the design review guide.

## Output Format

All reference guides produce consistent output:

```markdown
### Good Practices
- [Specific implementation] is well done because [reason]

### Issues

**Critical** - Blocks access completely
- **Location**: [element/code/design area]
- **Issue**: [description]
- **WCAG**: [success criterion]
- **Impact**: [who is affected and how]
- **Fix**: [suggestion]

**Major** - Accessible but difficult
...

**Minor** - Accessible with room for improvement
...

### Manual Checks Recommended
- [ ] Check color contrast with tools
- [ ] Test keyboard navigation
...
```

## File Structure

```
skills/reviewing-a11y/
├── SKILL.md                      # Main workflow (English)
├── SKILL.ja.md                   # Main workflow (Japanese)
├── agents/openai.yaml            # Codex UI metadata
├── README.md                     # This file
├── README.ja.md                  # Japanese README
└── references/                       # Reference documents
    ├── page-review.md            # Page review guide
    ├── page-review.ja.md         # (Japanese)
    ├── code-review.md            # Code review guide
    ├── code-review.ja.md         # (Japanese)
    ├── design-review.md          # Design review guide
    ├── design-review.ja.md       # (Japanese)
    ├── wcag-checklist.md         # WCAG checklist
    └── wcag-checklist.ja.md      # (Japanese)
```

## References

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/)
- [WCAG Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)
