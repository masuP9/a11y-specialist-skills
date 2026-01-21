# planning-a11y-improvement

[日本語版 (Japanese)](./README.ja.md)

A skill for developing organizational accessibility improvement plans. Generates maturity assessment, phased roadmap, KPI design, and stakeholder persuasion materials.

## Architecture

This skill uses an **interview-driven** workflow:

```
┌──────────────────────────────────────────┐
│   planning-a11y-improvement                  │
│   1. Identify scenario                   │
│   2. Gather information (interview)      │
│   3. Maturity assessment                 │
│   4. Generate plan draft             │
│   5. Review and adjust (user dialogue)   │
│   6. Export to file                      │
└──────────────────────────────────────────┘
                    │
                    ▼
          ┌─────────────────┐
          │   Deliverables   │
          │   - Maturity     │
          │   - Roadmap      │
          │   - KPI design   │
          │   - Persuasion   │
          │     materials    │
          │   → MD file      │
          └─────────────────┘
```

## Usage Scenarios

### 1. New Introduction Phase
For organizations just starting with accessibility. Prioritizes baseline establishment and foundational training.

### 2. Acceleration Phase
For organizations wanting to systematize existing efforts. Prioritizes governance strengthening and toolchain automation.

### 3. External Audit Response Phase
For organizations needing urgent response to regulations or audits. Prioritizes rapid triage and legal alignment.

## Deliverables

| Deliverable | Content |
|-------------|---------|
| Maturity Assessment | Current level (L1-L4) with rationale, gap analysis |
| Roadmap | Phased initiatives, owners, KPIs |
| KPI/Metrics Design | Leading and lagging indicator proposals |
| Stakeholder Persuasion Materials | Business impact, risks, ROI |

## Reference Document Input

You can load documents about prior initiatives to create more accurate plans.

**Supported documents:**
- Accessibility test results / conformance reports
- History of prior initiatives
- Existing a11y guidelines / policies
- Tech stack or organizational structure descriptions

During the information gathering phase, specify file paths and the content will be used for maturity assessment and roadmap creation.

## Usage

```
/planning-a11y-improvement
```

When the skill starts, it develops plan through:

1. **Scenario Identification**: Confirm purpose
2. **Information Gathering**: Load reference documents + interview about business, technical, organizational situation
3. **Maturity Assessment**: Evaluate current state on 5 axes
4. **Strategy Draft Generation**: Generate roadmap, KPIs, persuasion materials
5. **Review and Adjustment**: Dialogue with user to refine plan
6. **File Export**: Save final version as Markdown file

## File Structure

```
skills/planning-a11y-improvement/
├── SKILL.ja.md          # Main workflow (Japanese)
├── SKILL.md             # Main workflow (English)
├── README.ja.md         # README (Japanese)
├── README.md            # This file
└── references/
    ├── output-templates.ja.md    # Output templates (Japanese)
    ├── output-templates.md       # Output templates (English)
    ├── scenario-playbooks.ja.md  # Scenario guides (Japanese)
    └── scenario-playbooks.md     # Scenario guides (English)
```

## Related Skills

- **reviewing-a11y**: Conduct specific reviews (page, code, design)
