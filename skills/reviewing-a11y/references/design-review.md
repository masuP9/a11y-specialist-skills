# Accessibility Design Review Guide

[日本語版 (Japanese)](./design-review.ja.md)

A guide for finding accessibility issues in designs before implementation (mockups, wireframes, UI specifications).

## Required Capabilities

- Retrieve Figma URLs, design specifications, and documentation
- Read design documents and supported visual artifacts such as images or PDFs
- If a way to read Figma is available (MCP, etc.), use it to get fills, variables (color tokens), dimensions, and text styles. It is more accurate than estimating from images

## Review Process

### Step 1: Understand the Design

```
1. Identify artifact type: Figma, image, PDF, spec document
2. Understand purpose: Component/page function and user flows
3. Map interactive elements: Buttons, forms, navigation, modals
4. Note states: Default, hover, focus, active, disabled, error
```

### Step 2: Visual Analysis

Look for issues from these angles:

**Examine visuals for:**
- **Color & Contrast**: Text/background contrast, UI component contrast, color-only indicators
- **Typography**: Font sizes, line heights, line lengths, text in images
- **Touch Targets**: Size (AA 2.5.8 requires 24×24px or the spacing exception; 44×44px is AAA 2.5.5), spacing between interactive elements
- **Visual Hierarchy**: Heading clarity, information grouping, icon-only elements
- **Focus States**: Visible focus indicators, contrast requirements
- **Form Design**: Visible labels (not just placeholders), error indication patterns
- **Responsive**: Mobile touch targets, font scaling, layout

Assign severity with the table in [SKILL "Severity"](../SKILL.md#severity).

### Step 3: Flag Questions and Manual Checks

- **Contrast ratios**: When color values (hex, etc.) are known, compute the ratio and put the result in the finding. Only when you can only estimate from an image, note the color pair and mark it for verification

Designs do not decide these, so collect them as questions:
- **Focus management**: Ask about keyboard navigation flow
- **Dynamic behavior**: Ask about state changes, announcements
- **Alternative content**: Ask about alt text specifications

## Output Format

### Design Overview
```
Design: Homepage Redesign (Figma)
Scope: Desktop and mobile views
Components reviewed: Header, hero, feature cards, footer
```

### Positive Aspects
```
- **Good**: Clear visual hierarchy with large headings and generous spacing
- **Good**: Consistent focus indicator design specified (blue outline, 3px)
- **Good**: All form fields have visible labels above inputs
- **Good**: Touch targets in mobile design are at least 44×44px (meets 2.5.8's 24px and AAA 2.5.5)
```

### Issues by Severity

**Critical** - Will create access barriers

```
- **Location**: Form error states (Frame 7)
- **Issue**: Error indication uses only red border, no icon or text
- **WCAG**: 1.4.1 Use of Color (A)
- **Impact**: Users with color vision deficiencies or who are not looking at the screen cannot tell which field has the error
- **Recommendation**: Add an error icon and a per-field message starting with "Error:"
```

**Major** - May create difficulties

```
- **Location**: Primary button (Frame 2, 16px regular weight)
- **Issue**: #FFFFFF text on #0088FF has a contrast ratio of 3.52:1 (below 4.5:1)
- **WCAG**: 1.4.3 Contrast (Minimum) (AA)
- **Impact**: Users with low vision may struggle to read the button label
- **Recommendation**: Darken the background to around #0066CC (5.57:1)
```

**Minor** - Best practice improvements

```
- **Location**: Body text (Typography spec)
- **Issue**: Line height 1.3. Not a WCAG AA requirement (1.4.12 requires that content survives when users change line height; it does not constrain the authored value)
- **WCAG**: None (best practice; AAA 1.4.8 asks for at least 1.5)
- **Impact**: May reduce readability for users with dyslexia
- **Recommendation**: Increase line-height to 1.5 for improved readability
```

### Questions for Design Team

```
1. **Focus management**: How should focus move when the modal opens/closes?
2. **Colors per state**: What are the button colors on hover, press, and disabled? (to compute contrast ratios)
3. **Alt text**: What should the alt text be for the hero image?
4. **Loading states**: How are loading states indicated for the "Load More" button?
5. **Keyboard navigation**: How do users navigate through the image carousel with keyboard?
```

### Recommendations for Implementation

```
1. **Document ARIA specifications**
   - Custom dropdown: role="combobox", aria-expanded states
   - Modal dialog: role="dialog", aria-labelledby
   - Tabs: role="tablist", aria-selected states

2. **Create accessibility annotation layer**
   - Mark heading levels (H1, H2, H3)
   - Label landmark regions (nav, main, aside)
   - Specify tab order for complex interactions

3. **Contrast verification checklist**
   - Provide color pairs for developer testing
   - Flag any borderline contrast ratios
   - Specify focus indicator contrast requirements

4. **Alternative content specifications**
   - Alt text for all informative images
   - Transcript plan for video content
   - Data table alternative for charts
```

## Key Principles

- **Compute colors from values**: When color values are available, compute contrast ratios. Keep estimates from images as needs-verification
- **Ask questions**: Designs don't show dynamic behavior - ask how it works
- **Annotate needs**: Specify what developers need to implement (ARIA roles, alt text)
- **Prevent issues**: Catch accessibility problems before code is written
- **Be specific**: Reference actual frames, colors, measurements from the design

**Note**: You are reviewing design intent, not implementation. Report what the visuals decide, and write out what implementation decides (ARIA, focus movement, announcements) as specifications for developers.
