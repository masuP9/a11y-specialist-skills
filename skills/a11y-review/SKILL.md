---
name: a11y-review
description: Accessibility review. Reviews web pages, component implementations, design mockups, and specifications from WCAG and WAI-ARIA APG perspectives. Trigger with "a11y review", "accessibility check", "accessibility review", etc.
allowed-tools: Read, Grep, Glob, WebFetch, mcp__playwright__browser_snapshot, mcp__playwright__browser_navigate, mcp__playwright__browser_click
---

# Accessibility Review

Review web pages, component implementations, design mockups, and specifications from WCAG 2.2 and WAI-ARIA APG perspectives.

## Identifying Review Targets and Methods

| Target | Identification | Method |
|--------|----------------|--------|
| Web page | URL | Capture snapshot with Playwright, verify DOM structure |
| Local implementation | File path | Read code, static analysis |
| Design mockup | Image/Figma URL | Visual verification |
| Specification | Document | Check specification content |

## Check Points

### Automated Check Items

| Category | Check Content |
|----------|---------------|
| Semantics | Heading structure (h1-h6 order), landmarks (main, nav, header, etc.), appropriate HTML element selection |
| Alternative text | Presence and appropriateness of alt/aria-label for img, svg, icons |
| Forms | Label association, required field indication, grouping (fieldset/legend) |
| ARIA | Correct role attributes, appropriate use of aria-* attributes, avoiding redundant ARIA |
| Interactive elements | Accessible name, keyboard focusability, tabindex |
| Links & buttons | Clear purpose text, avoiding empty links |
| Headings & structure | Skip links, logical content order |

### Items Requiring Manual Verification (Note Only)

| Category | Reason |
|----------|--------|
| Consistent navigation | Requires comparison across multiple pages |
| Error display & explanation | Requires form interaction |
| Color contrast | Requires measurement tools (recommend verification when flagged) |
| Complete keyboard operability | Requires testing all operation paths |
| Dynamic content updates | Requires observing state changes |
| Focus management | Requires actual operation verification for modals, SPA transitions, etc. |

## Output Format

### Positive Findings

List what is done well from an accessibility perspective. Explain why it's good while pointing to specific implementation locations.

### Issues

Categorize and list by severity.

**Critical** - Access to information or functionality is completely blocked

| Pattern | Examples |
|---------|----------|
| Missing alternative text | Informative image without alt, icon button without label |
| Missing form labels | input/select without associated label |
| Keyboard inaccessible | Click-only elements, unfocusable interactive elements |
| Fatal ARIA misuse | aria-labelledby pointing to non-existent ID, role="presentation" hiding important info |
| Hidden content | Important information hidden with display:none or aria-hidden="true" |

**Major** - Accessible but causes significant difficulty or confusion

| Pattern | Examples |
|---------|----------|
| Missing/broken heading structure | Section heading not using heading element, level skipping like h1→h4 |
| Missing landmarks | No main/nav/header, duplicate landmarks |
| Inappropriate ARIA | Wrong role, invalid aria-* values, contradictory ARIA states |
| Focus order issues | tabindex drastically different from visual order, positive tabindex values |
| Unclear links/buttons | Only "click here" or "details", ambiguous text without context |
| Table structure issues | Missing th/scope, complex tables without headers/id |

**Minor** - Accessible with room for improvement

| Pattern | Examples |
|---------|----------|
| Better element choice | button instead of div with onclick, strong/em instead of span |
| Redundant ARIA | role duplicating native semantics, unnecessary aria-label |
| Best practice deviation | Missing lang attribute, no skip link |
| Minor heading hierarchy issues | Using h3 where only one h2 exists, minor level issues |

Describe each issue in the following format:

```
- **Location**: Relevant element, code, line number
- **Issue**: Specific content
- **WCAG**: Related success criterion (e.g., 1.1.1 Non-text Content)
- **Suggested fix**: Recommended action
```

### Recommendations for Manual Verification

Provide a list of items that could not be automatically checked and hints for verification methods.

## WCAG Success Criteria Reference Format

When reporting issues, reference WCAG success criteria in the following format:

- 1.1.1 Non-text Content (A)
- 1.3.1 Info and Relationships (A)
- 1.4.3 Contrast (Minimum) (AA)
- 2.1.1 Keyboard (A)
- 2.4.6 Headings and Labels (AA)
- 4.1.2 Name, Role, Value (A)

## Reference Resources

- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- WAI-ARIA APG: https://www.w3.org/WAI/ARIA/apg/
- WCAG Quick Reference: https://www.w3.org/WAI/WCAG22/quickref/
