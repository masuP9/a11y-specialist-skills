# a11y-review

[日本語版 (Japanese)](./README.ja.md)

A skill for reviewing web pages, component implementations, design mockups, and specifications from WCAG 2.2 and WAI-ARIA APG perspectives.

## Features

- **Multiple target support**: Web pages (URL), local files, design mockups, specifications
- **Automated checks**: Semantics, alternative text, forms, ARIA attributes, etc.
- **Structured output**: Positive findings, issues (by severity), manual check recommendations
- **WCAG compliant**: Each issue is linked to WCAG success criteria

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

```
# Web page
Review a11y for https://example.com

# Local component
Check accessibility of src/components/Modal.tsx

# Design
Review this design mockup from a11y perspective

# Specification
Check accessibility requirements in this specification
```

## Output Format

```markdown
### Positive Findings
- [Specific implementation] is well done because [reason]

### Issues

**Critical**
- **Location**: [element/code]
- **Issue**: [description]
- **WCAG**: [success criterion]
- **Suggested fix**: [suggestion]

**Major**
...

**Minor**
...

### Manual Checks Recommended
- [ ] Check color contrast with tools
- [ ] Test keyboard navigation
...
```

## References

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/)
