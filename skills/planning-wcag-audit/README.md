# planning-wcag-audit

[日本語版 (Japanese)](./README.ja.md)

A skill for planning WCAG conformance audits based on WAIC (Web Accessibility Infrastructure Committee) test implementation guidelines.

## Architecture

This skill uses an **integrated pattern** with interactive information gathering:

```
┌─────────────────────────────────────┐
│   planning-wcag-audit               │
│   - Gathers site information        │
│   - Selects test method             │
│   - Determines page selection       │
│   - Generates audit plan document   │
└─────────────────────────────────────┘
           │
    ┌──────┴────────┐
    │               │
    ▼               ▼
┌────────────┐  ┌─────────────┐
│Page Select │  │Audit Plan   │
│Guide       │  │Template     │
└────────────┘  └─────────────┘
```

## When to Use This vs planning-a11y-improvement

| Perspective | planning-a11y-improvement | planning-wcag-audit |
|-------------|---------------------------|---------------------|
| **Goal** | Organizational a11y roadmap | Audit execution planning |
| **Scope** | Organization-wide, long-term | Specific site, short-term |
| **Output** | Maturity assessment, KPIs, strategy | Page list, environment, schedule |
| **Reference** | Custom framework | WAIC test guidelines |

## Workflow (5 Steps)

1. **Site Information Gathering**
   - Total page count (approximate)
   - Site structure (template types)
   - Target conformance level (A/AA)
   - Purpose (conformance claim, partial conformance, consideration)

2. **Test Method Selection** (based on WAIC guidelines)
   - **All pages test**: Sites with ~100 pages or less
   - **Random selection**: Statistical sampling
   - **Representative pages**: Key pages only
   - **Combination**: Recommended for 100+ page sites

3. **Page Selection**
   - Random selection sample size:
     - 10 or fewer: Trial test
     - 11-24: Minimum judgment criteria
     - 25-39: Standard level
     - 40+: Sufficient judgment criteria
   - Representative page identification
   - Page type classification

4. **Test Environment Confirmation**
   - Browser/AT combinations
   - Mobile/Desktop
   - Test tools (optional, with alternatives)

5. **Audit Plan Document Generation**
   - Test overview (purpose, scope, method)
   - Target page list
   - Test environment
   - Schedule estimate
   - Roles/responsibilities

## File Structure

```
skills/planning-wcag-audit/
├── SKILL.md                           # Main skill (English)
├── SKILL.ja.md                        # Main skill (Japanese)
├── README.md                          # This file
├── README.ja.md                       # Japanese README
└── references/
    ├── page-selection-guide.md        # Page selection guide
    ├── page-selection-guide.ja.md
    ├── audit-plan-template.md         # Audit plan template
    └── audit-plan-template.ja.md
```

## Usage Examples

```
Help me plan a WCAG audit for our website
Create an audit plan for https://example.com
I need to prepare for a WCAG compliance audit
```

## References

- [JIS X 8341-3:2016 Test Implementation Guidelines](https://waic.jp/docs/jis2016/test-guidelines/202012/)
- [WAIC Conformance Expression Guidelines](https://waic.jp/docs/jis2016/compliance-guidelines/202104/)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
