---
name: reviewing-a11y
description: Review accessibility of web pages, code implementations, design mockups, and specifications, then report severity-ranked issues and fixes. Use auditing-wcag instead for formal conformance decisions across all success criteria.
argument-hint: URL, file path, or Figma URL to review
allowed-tools: Read Grep Glob WebFetch Task mcp__playwright__browser_snapshot mcp__playwright__browser_navigate mcp__playwright__browser_click
---

[日本語版 (Japanese)](./SKILL.ja.md)

# Accessibility Review

Identify what the user wants reviewed, then perform the accessibility review by following the corresponding reference guide.

## Step 1: Identify Review Target

Analyze the user's request to determine the review target:

### Web Page (Live URL)
**Indicators:**
- User provides a URL starting with `http://` or `https://`
- User says "check this page", "review this site", "test this URL"
- User wants to review a deployed/live website

**Action:** Follow the page review guide

### Code Implementation
**Indicators:**
- User provides file paths (`.jsx`, `.tsx`, `.vue`, `.html`, `.js`, etc.)
- User says "review this component", "check my code", "look at this implementation"
- User mentions specific files or directories in the codebase
- User asks about static code analysis

**Action:** Follow the code review guide

### Design Mockup/Specification
**Indicators:**
- User provides Figma URL (figma.com/file/...)
- User shares image files (.png, .jpg, .pdf of designs)
- User says "review this design", "check this mockup", "look at this wireframe"
- User asks about design specifications or visual accessibility

**Action:** Follow the design review guide

### Ambiguous Cases
If unclear, ask the user:
```
I can review accessibility for:
1. **Live web pages** (provide URL) - I'll test the rendered page
2. **Code implementation** (provide file paths) - I'll analyze the source code
3. **Design mockups** (provide Figma URL or images) - I'll review visual designs

Which would you like me to review?
```

## Step 2: Load the Guide and Review

Once you identify the target, read the reference guide matching the user's language and execute its process directly.

### For Web Pages
```
Read the page review guide:
- English: references/page-review.md
- Japanese: references/page-review.ja.md

Follow the guide using available browser interaction, web retrieval, or user-provided content.
```

### For Code
```
Read the code review guide:
- English: references/code-review.md
- Japanese: references/code-review.ja.md

Follow the guide by inspecting the target files and related implementation.
```

### For Designs
```
Read the design review guide:
- English: references/design-review.md
- Japanese: references/design-review.ja.md

Follow the guide using available image, document, or Figma retrieval capabilities.
```

### When to Use Sub-agents

- Use sub-agents only when the user explicitly requests parallel review, specialist delegation, or division across multiple targets.
- Assign one target type to each agent and provide the relevant guide and target.
- Wait for every result, remove duplicates, and return one consolidated report.
- If sub-agents are unavailable, review the targets sequentially in this agent.

## Step 3: Return Results

When the review completes:
1. Present the findings to the user
2. Offer to review additional targets if needed
3. Suggest next steps (e.g., "Would you like me to review the code implementation next?")

## Important Notes

- **Always read the appropriate guide before starting the review**
- **Choose the language** (English or Japanese) based on the user's language
- **Distinguish evidence from gaps** and state what could not be verified
- **Don't mix review types** - use one guide per target type

## Example Workflows

### Example 1: User provides URL
```
User: "Review https://example.com for accessibility"

1. Identify: This is a web page (URL provided)
2. Read: references/page-review.md
3. Execute: Inspect the page by following the guide
4. Return: Present findings
```

### Example 2: User provides file path
```
User: "Check src/components/Button.tsx for a11y issues"

1. Identify: This is code (file path provided)
2. Read: references/code-review.md
3. Execute: Inspect the target and related code by following the guide
4. Return: Present findings
```

### Example 3: User provides Figma URL
```
User: "Review this design: https://figma.com/file/abc123"

1. Identify: This is a design (Figma URL)
2. Read: references/design-review.md
3. Execute: Inspect the design by following the guide
4. Return: Present findings
```

## WCAG & Standards Reference

All reviews should reference:
- **WCAG 2.2**: https://www.w3.org/TR/WCAG22/
- **WAI-ARIA APG**: https://www.w3.org/WAI/ARIA/apg/
- **WCAG Quick Reference**: https://www.w3.org/WAI/WCAG22/quickref/

Common success criteria to reference:
- 1.1.1 Non-text Content (A)
- 1.3.1 Info and Relationships (A)
- 1.4.3 Contrast (Minimum) (AA)
- 2.1.1 Keyboard (A)
- 2.4.6 Headings and Labels (AA)
- 4.1.2 Name, Role, Value (A)

Do not turn missing evidence into a conclusive finding. List unsupported checks as manual verification.
