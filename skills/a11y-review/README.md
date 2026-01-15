# a11y-review

[日本語版 (Japanese)](./README.ja.md)

A skill for reviewing web pages, component implementations, design mockups, and specifications from WCAG 2.2 and WAI-ARIA APG perspectives.

## Architecture

This skill uses an **orchestrator pattern** with specialized sub-agents:

```
┌─────────────────────────────────────┐
│   a11y-review (Orchestrator)       │
│   - Identifies review target        │
│   - Delegates to specialist         │
└──────────┬──────────────────────────┘
           │
    ┌──────┴────────┬─────────────┐
    │               │             │
    ▼               ▼             ▼
┌───────┐    ┌──────────┐   ┌────────────┐
│ Page  │    │   Code   │   │   Design   │
│Review │    │  Review  │   │   Review   │
└───────┘    └──────────┘   └────────────┘
```

### Specialists

1. **Page Review** (`guides/page-review.md`)
   - Target: Live web pages (URLs)
   - Method: Playwright browser snapshots
   - Focus: Rendered output, runtime behavior

2. **Code Review** (`guides/code-review.md`)
   - Target: Source files (.jsx, .tsx, .vue, .html)
   - Method: Static code analysis
   - Focus: Implementation patterns, semantic structure

3. **Design Review** (`guides/design-review.md`)
   - Target: Design files (Figma, images, PDFs)
   - Method: Visual inspection, spec analysis
   - Focus: Design decisions, visual accessibility

## Prerequisites (Claude's Existing Knowledge)

This skill assumes Claude already knows:
- **WCAG 2.2** success criteria, levels (A, AA, AAA), and their meanings
- **WAI-ARIA** authoring practices, roles, states, and properties
- **Standard accessibility patterns**: Semantic HTML, form accessibility, keyboard navigation
- **Common issues and fixes**: Missing alt text, improper ARIA usage, keyboard traps, etc.

The guides focus on **how to review** using specific tools, not **what to check** (which Claude already understands).

For human reference, detailed WCAG checklists are available in `references/wcag-checklist.md`.

## Features

- **Automatic delegation**: Identifies review target and routes to appropriate specialist
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

The orchestrator detects the URL and launches the **Page Review** specialist with Playwright tools.

### Code Review
```
Check accessibility of src/components/Modal.tsx
Review a11y in src/pages/Login.vue
```

The orchestrator detects file paths and launches the **Code Review** specialist with file reading tools.

### Design Review
```
Review this Figma design: https://figma.com/file/abc123
Check accessibility of this design mockup (with attached image)
```

The orchestrator detects design artifacts and launches the **Design Review** specialist.

## Output Format

All specialists produce consistent output:

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
skills/a11y-review/
├── SKILL.md                      # Main orchestrator (English)
├── SKILL.ja.md                   # Main orchestrator (Japanese)
├── README.md                     # This file
├── README.ja.md                  # Japanese README
└── guides/                       # Specialist guides
    ├── page-review.md            # Page review specialist
    ├── page-review.ja.md         # (Japanese)
    ├── code-review.md            # Code review specialist
    ├── code-review.ja.md         # (Japanese)
    ├── design-review.md          # Design review specialist
    └── design-review.ja.md       # (Japanese)
```

## References

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/)
- [WCAG Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)
