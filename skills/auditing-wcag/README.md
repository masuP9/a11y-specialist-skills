# auditing-wcag

[日本語版 (Japanese)](./README.ja.md)

A skill for systematically auditing WCAG 2.2 AA conformance with Pass/Fail/NT/NA judgments per success criterion.

## Architecture

This skill uses a **hybrid pattern** with test-method-based reference guides:

```
┌─────────────────────────────────────┐
│   auditing-wcag                     │
│   - Accepts input (URL/files)       │
│   - Establishes scope contract      │
│   - Executes checks systematically  │
│   - Generates conformance report    │
└──────────┬──────────────────────────┘
           │
    ┌──────┴────────┬─────────────┬──────────────┐
    │               │             │              │
    ▼               ▼             ▼              ▼
┌──────────┐  ┌───────────┐  ┌────────┐  ┌─────────┐
│Automated │  │Interactive│  │ Manual │  │ Content │
│ Checks   │  │  Checks   │  │ Checks │  │ Checks  │
└──────────┘  └───────────┘  └────────┘  └─────────┘
```

## When to Use This vs reviewing-a11y

| Perspective | reviewing-a11y | auditing-wcag |
|-------------|----------------|---------------|
| **Goal** | Find issues and propose fixes | Systematic conformance verification |
| **Output** | Severity-based issues list | Pass/Fail/NT/NA per criterion |
| **Scope** | Practical issues focus | Full WCAG 2.2 A/AA coverage |
| **Use Case** | Development feedback | Audit, compliance, certification |

### Routing Rules
- **auditing-wcag**: "audit", "compliance", "conformance", formal reporting
- **reviewing-a11y**: "review", "check", "find issues", dev feedback

## Workflow (6 Steps)

1. **Input Acceptance**: URL or file path identification
2. **Scope Contract**: Get agreement on level, pages, and limitations
3. **Automated Checks**: Playwright accessibility tree analysis
4. **Interactive Checks**: Keyboard and focus verification
5. **Manual Check Items**: Present NT items to user
6. **Report Generation**: Pass/Fail/NT/NA per criterion

## Automation Scope and Limits

Playwright provides computed accessibility tree (role/name/state) only:
- ❌ Screen reader verification (NVDA/JAWS/VoiceOver)
- ❌ AT × browser compatibility testing
- ❌ Cognitive accessibility judgment

Items that cannot be automated are marked as **NT (Not Tested)**.

## Report Status Values

| Status | Meaning |
|--------|---------|
| **Pass** | Criterion is satisfied |
| **Fail** | Violation detected |
| **NT** | Not Tested - requires AT/human verification |
| **NA** | Not Applicable - target content doesn't exist |

## File Structure

```
skills/auditing-wcag/
├── SKILL.md                        # Main skill (English)
├── SKILL.ja.md                     # Main skill (Japanese)
├── README.md                       # This file
├── README.ja.md                    # Japanese README
└── references/
    ├── automated-checks.md         # Auto-testable criteria
    ├── automated-checks.ja.md
    ├── interactive-checks.md       # Interaction-based checks
    ├── interactive-checks.ja.md
    ├── manual-checks.md            # Human judgment required
    ├── manual-checks.ja.md
    ├── content-checks.md           # Content quality checks
    ├── content-checks.ja.md
    ├── output-format.md            # Report template
    ├── output-format.ja.md
    ├── coverage-matrix.md          # Full A/AA coverage matrix
    └── coverage-matrix.ja.md
```

## Usage Examples

```
Audit WCAG conformance for https://example.com
Run WCAG 2.2 AA compliance check on https://mysite.com
```

## References

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WCAG Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)
- [Understanding WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/)
