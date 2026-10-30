# Accessibility Code Review Guide

[日本語版 (Japanese)](./code-review.ja.md)

A guide for finding accessibility issues by statically reading component code, templates, and markup.

## Required Capabilities

- Read source files
- Search for patterns across the codebase
- Find files by name or extension pattern

## Review Process

### Step 1: Understand the Code Context

```
1. Identify framework/library: React, Vue, Angular, plain HTML, etc.
2. Read target component and template files
3. Map structure: Identify interactive elements, state management, props
4. Search for related implementations (for example, all button components)
```

### Step 2: Systematic Static Analysis

Look for issues in the target codebase from these angles:

**Examine code for:**
- Semantic HTML usage (proper elements, heading hierarchy)
- Alternative text implementation (img alt, aria-label on icons)
- Form accessibility (label associations, required fields, error handling)
- ARIA implementation (roles, states, properties, ID references), pay special attention to misuse
- Keyboard accessibility (event handlers, tabIndex, focus management)
- Interactive elements (proper button/link usage, accessible names)

**Framework-specific considerations:**
- **React**: Check `aria-*` prop syntax, boolean ARIA values, ref usage for focus
- **Vue**: Check `:aria-*` bindings, template refs, watchers for ARIA states
- **Angular**: Check `[attr.aria-*]` bindings, ViewChild for focus management

Assign severity with the table in [SKILL "Severity"](../SKILL.md#severity).

### Step 3: Recommendations

Based on patterns found, suggest:
- Specific code fixes with examples
- Reusable utilities (custom hooks, mixins, directives)
- Testing strategies for accessibility

## Output Format

### File Overview
```
Reviewing: src/components/UserProfile.tsx
Framework: React
Lines reviewed: 1-150
```

### Good Practices
```
- **Good**: Semantic form structure with proper label associations (lines 25-40)
- **Good**: Keyboard event handling for custom dropdown (lines 67-75)
- **Good**: Focus management in modal component (lines 102-115)
```

### Issues by Severity

**Critical** - Will block users

```
- **Location**: src/components/Button.tsx:45
- **Issue**: Interactive div without keyboard support
- **Code**: `<div onClick={handleSubmit}>Submit</div>`
- **WCAG**: 2.1.1 Keyboard (A)
- **Impact**: Keyboard users cannot submit the form
- **Fix**: Use `<button onClick={handleSubmit}>Submit</button>`
```

**Major** - Creates significant barriers

```
- **Location**: src/components/Tabs.tsx:31
- **Issue**: The selected tab is shown only by a CSS class; `aria-selected` is missing
- **Code**: `<button role="tab" className={active ? 'active' : ''}>`
- **WCAG**: 4.1.2 Name, Role, Value (A)
- **Impact**: Screen reader users cannot tell which tab is open
- **Fix**: Pass the state: `<button role="tab" aria-selected={active}>`
```

**Minor** - Best practice improvements

```
- **Location**: src/components/Header.tsx:12
- **Issue**: Redundant ARIA role on semantic element
- **Code**: `<button role="button">Menu</button>`
- **WCAG**: 4.1.2 Name, Role, Value (A) - Best practice
- **Impact**: No functional impact, but adds unnecessary verbosity
- **Fix**: Remove role: `<button>Menu</button>`
```

### Recommendations

```
1. **Add focus management utilities**
   - Create useFocusTrap hook for modals
   - Add useAnnounce hook for dynamic content updates

2. **Component library audit**
   - Review all custom interactive components
   - Add accessibility tests

3. **Code patterns to establish**
   - Create accessible icon button wrapper
   - Standardize form field component with built-in labels
```

## Key Principles

- **Be specific**: Reference exact file paths, line numbers, and code snippets
- **Provide fixes**: Show the corrected code, not just "fix this"
- **Respect standards**: Prioritize standards like HTML Standard, WCAG, and APG Patterns
- **Prioritize**: Critical blocking issues first
- **Consider context**: Framework-specific best practices matter
- **Suggest patterns**: Reusable solutions for common issues
- **No ARIA is better than Bad ARIA**: Incorrect WAI-ARIA is worse than no ARIA at all

**Note**: You are reading source code, not rendered output. Send what only runtime can decide (computed accessible names, focus movement, contrast) to manual verification.
