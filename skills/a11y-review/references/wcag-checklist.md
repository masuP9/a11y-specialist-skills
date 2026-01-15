# WCAG Accessibility Checklist

This is a reference document for human reviewers. Claude already knows these WCAG criteria - this is maintained for documentation purposes only.

## Automated Check Items

### Semantic Structure
- [ ] Heading hierarchy (h1-h6) is logical and sequential
- [ ] Landmarks (main, nav, header, footer, aside) are present
- [ ] HTML5 semantic elements used appropriately
- [ ] Document language specified (`<html lang="...">`)

### Alternative Text
- [ ] All `<img>` elements have appropriate `alt` attributes
- [ ] Decorative images use `alt=""` or `role="presentation"`
- [ ] Icon buttons have accessible labels (`aria-label` or `aria-labelledby`)
- [ ] SVG graphics have appropriate titles/descriptions

### Forms
- [ ] All `<input>`, `<select>`, `<textarea>` have associated labels
- [ ] Required fields indicated (not just by color)
- [ ] Fieldset/legend used for grouped form controls
- [ ] Error messages programmatically associated

### ARIA Usage
- [ ] Roles are appropriate and not redundant
- [ ] `aria-labelledby` and `aria-describedby` reference existing IDs
- [ ] ARIA states/properties are valid and used correctly
- [ ] No contradictory ARIA (e.g., `aria-hidden="true"` on focusable elements)

### Keyboard & Focus
- [ ] All interactive elements are keyboard focusable
- [ ] Focus order matches visual order
- [ ] No positive `tabindex` values (tabindex > 0)
- [ ] Focus indicator is visible
- [ ] Skip links present (if needed)

### Links & Buttons
- [ ] Link text is descriptive (not just "click here")
- [ ] Buttons use `<button>` element (not `<div onclick>`)
- [ ] Links and buttons have clear accessible names
- [ ] Empty links/buttons flagged

### Tables
- [ ] Data tables use `<th>` for headers
- [ ] Complex tables use `scope` or `headers`/`id` associations
- [ ] `<caption>` or `aria-label` provides table description

## Manual Verification Items

### Color Contrast
- Text contrast meets WCAG AA (4.5:1 for normal text, 3:1 for large)
- UI component contrast meets 3:1
- Links distinguishable without color alone

### Keyboard Operability
- Complete interaction flows work with keyboard only
- No keyboard traps
- All functionality available via keyboard

### Focus Management
- Modal dialogs trap focus appropriately
- Focus returns to trigger on close
- SPA navigation manages focus

### Dynamic Content
- ARIA live regions announce updates
- Loading states communicated
- Error messages announced

## Severity Level Criteria

### Critical - Access Blocked Completely
| Pattern | Examples |
|---------|----------|
| Missing alternative text | Informative image without alt, icon button without label |
| Missing form labels | input/select without associated label |
| Keyboard inaccessible | Click-only elements, unfocusable interactive elements |
| Fatal ARIA misuse | aria-labelledby pointing to non-existent ID |
| Hidden content | Important information with display:none or aria-hidden="true" |

### Major - Accessible but Difficult
| Pattern | Examples |
|---------|----------|
| Missing/broken heading structure | Section heading not using heading element, level skipping |
| Missing landmarks | No main/nav/header, duplicate landmarks |
| Inappropriate ARIA | Wrong role, invalid aria-* values |
| Focus order issues | tabindex drastically different from visual order |
| Unclear links/buttons | Only "click here" or "details" |
| Table structure issues | Missing th/scope |

### Minor - Accessible with Room for Improvement
| Pattern | Examples |
|---------|----------|
| Better element choice | button instead of div with onclick |
| Redundant ARIA | role duplicating native semantics |
| Best practice deviation | Missing lang attribute, no skip link |
| Minor heading hierarchy issues | Minor level inconsistencies |

## WCAG Success Criteria Reference

### Level A
- **1.1.1 Non-text Content**: Alternative text for images
- **1.3.1 Info and Relationships**: Semantic structure
- **1.3.2 Meaningful Sequence**: Reading order
- **2.1.1 Keyboard**: Keyboard accessibility
- **2.4.1 Bypass Blocks**: Skip links
- **2.4.2 Page Titled**: Descriptive page title
- **3.3.1 Error Identification**: Error messages
- **3.3.2 Labels or Instructions**: Form labels
- **4.1.2 Name, Role, Value**: Accessible names

### Level AA
- **1.4.3 Contrast (Minimum)**: Color contrast 4.5:1
- **1.4.11 Non-text Contrast**: UI component contrast 3:1
- **2.4.6 Headings and Labels**: Clear headings/labels
- **2.4.7 Focus Visible**: Visible focus indicator
- **3.2.3 Consistent Navigation**: Navigation consistency

### Level AAA
- **2.5.5 Target Size**: 44×44px touch targets

## Resources

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WCAG 2.2 日本語訳](https://waic.jp/translations/WCAG22/)
- [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/)
- [WCAG Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)
