# Accessibility Page Review Guide

[日本語版 (Japanese)](./page-review.ja.md)

A guide for reviewing the accessibility of **web pages**.

## Tool Selection

Choose your approach based on available tools:

| Tool Available | Capability | Limitation |
|----------------|------------|------------|
| Shell (`@a11y-skills/audit` CLI) | axe-core findings, accessibility tree / title / lang (`page-snapshot`), other measured checks | Needs Node 18+ and Chromium. Checks that operate the page have side effects |
| Browser interaction | Full accessibility tree, computed roles, visual rendering | Requires supported browser tooling or MCP |
| Web retrieval | HTML source, DOM structure | No accessibility tree, no JS-rendered content |
| None | Cannot fetch page | Ask user to paste HTML |

### Priority Order

1. **Shell (CLI)**: Run it first. It gives measurements and the settled / needs-review sorting
2. **Browser interaction**: Verify the CLI's needs-review candidates and do what the CLI does not see (error display, multi-step forms, etc.). If the CLI cannot run, capture the accessibility tree in its place
3. **Web retrieval**: Fallback for HTML analysis when browser interaction is also unavailable
4. **User-provided HTML**: Last resort when no fetch tools available

### Running the CLI

Default to `npx -y @a11y-skills/audit --url "<url>" --checks axe-audit,page-snapshot --output-dir <dir>`. Add checks according to the page (`autocomplete-audit` if there are forms, `target-size-check` if there are many small controls, etc.).

- When a check you add is not on the "allowlist of checks that do not operate the page" in the [auditing-wcag SKILL](../../auditing-wcag/SKILL.md) ("Automated Checks"), confirm with the user that side effects are acceptable before running it. If that cannot be confirmed, do not run it.
- Sort the results into settled and needs-review with the rules in a11y-knowledge's [checks-axe](../../a11y-knowledge/references/checks-axe.md) and [checks-audit](../../a11y-knowledge/references/checks-audit.md). Do not report `incomplete` as a violation; send it to manual verification.

## Review Process

### With Browser Interaction

```
1. Navigate to the URL with the available browser capability
2. Capture the page state, including:
   - Accessibility tree (primary data source)
   - Visual rendering
   - Complete DOM structure
3. Analyze the accessibility tree - it shows computed roles, names, and states
```

The accessibility tree is your most reliable data source - it shows what screen readers actually announce.

### With Web Retrieval Only

```
1. Retrieve the HTML source with the available web capability
2. Analyze HTML structure directly:
   - Semantic elements (headings, landmarks, lists)
   - ARIA attributes in source
   - Image alt attributes
   - Form label associations
```

**Limitations when using web retrieval:**
- Cannot detect JavaScript-rendered content
- Cannot verify computed accessible names
- Cannot see actual accessibility tree
- Cannot detect CSS-hidden content issues

Note these limitations in your report and recommend browser-based testing.

### Without Fetch Tools

If none of the shell, browser interaction or web retrieval is available:
1. Inform the user that you cannot fetch the page directly
2. Ask them to paste the HTML source or provide a screenshot
3. Proceed with static analysis of provided content

## Systematic Analysis

Analyze for these issues (tools determine what you can detect):

| Category | Browser interaction | Web retrieval |
|----------|------------|----------|
| Heading structure | ✅ Computed levels | ✅ HTML elements |
| Landmarks | ✅ Computed roles | ✅ HTML5/ARIA |
| Image alt text | ✅ Accessible names | ✅ alt attributes |
| Form labels | ✅ Computed labels | ⚠️ Association only |
| ARIA validity | ✅ Full validation | ⚠️ Attribute presence |
| Keyboard access | ✅ Focusable elements | ⚠️ tabindex only |
| Dynamic content | ✅ Current state | ❌ Not visible |

Assign severity with the table in [SKILL "Severity"](../SKILL.md#severity).

## Flag Manual Verification Needs

Some issues always require human testing:
- Color contrast (note colors, recommend verification with tools)
- Complete keyboard navigation flows
- Focus management in dynamic interactions
- ARIA live region announcements
- Multi-page consistency checks

## Output Format

### Good Practices

List what's done well:
```
- **Good**: Clear heading hierarchy with single h1 ("Page Title")
- **Good**: Navigation menu uses <nav> landmark with aria-label
- **Good**: All form fields have visible, associated labels
```

### Issues by Severity

**Critical** - Blocks access completely

Format:
```
- **Location**: [CSS selector or description]
- **Issue**: [Specific problem]
- **WCAG**: [Criterion] (e.g., 1.1.1 Non-text Content (A))
- **Impact**: [Who is affected and how]
- **Fix**: [Recommended solution]
```

**Major** - Accessible but causes significant difficulty

**Minor** - Accessible with room for improvement

### Manual Verification Recommendations

```
The following items require manual testing:

1. **Color Contrast**
   - Check contrast ratio for body text (#666 on #fff)
   - Verify button states meet 3:1 minimum

2. **Keyboard Navigation**
   - Test all interactive elements with Tab/Enter/Space
   - Verify dropdown menu keyboard accessibility

3. **Focus Management**
   - Verify focus moves to modal on open
   - Check focus returns to trigger on close
```

## Key Principles

- **Use the best available capability**: shell (CLI) > browser interaction > web retrieval > user-provided content
- **Be transparent about limitations**: Note what you couldn't check
- **Be specific**: Reference actual elements (selectors, text content, roles)
- **Prioritize impact**: Critical issues first
- **Actionable recommendations**: Provide specific fixes

**Remember**: Adapt your approach to available tools. When in doubt about what you can detect, be conservative and recommend manual verification.
