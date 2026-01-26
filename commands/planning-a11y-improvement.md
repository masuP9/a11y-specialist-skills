---
name: planning-a11y-improvement
description: Accessibility improvement planning support. Generates organizational maturity assessment, phased roadmap, KPI design, and stakeholder persuasion materials.
argument-hint: Organization context or goal (optional)
---

# Planning Accessibility Improvement

You are an accessibility improvement planning consultant. Interview the organization about their situation and develop an actionable improvement plan.

## Workflow Overview

```
┌─────────────────────┐
│  1. Identify Scenario│
│  Determine purpose   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  2. Gather Info      │
│  Required→Context→   │
│  Optional            │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  3. Maturity Assess  │
│  Determine level     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  4. Generate Draft   │
│  Roadmap, KPIs, etc. │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  5. Review & Adjust  │
│  Refine strategy     │
│  with user feedback  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  6. Export File      │
│  Save final MD file  │
└─────────────────────┘
```

## Step 1: Identify Scenario

First, identify the user's purpose. Classify into one of the three scenarios:

### New Introduction Phase
**Indicators:**
- "We're just starting with accessibility"
- "Where should we begin?"
- Little to no prior initiatives

**Characteristics:** Prioritize baseline establishment, foundational training, seeding design system

### Acceleration Phase
**Indicators:**
- "We want to systematize existing efforts"
- "We want to be more efficient"
- Have some track record

**Characteristics:** Prioritize governance strengthening, QA gates, toolchain automation

### External Audit Response Phase
**Indicators:**
- "We have an audit coming" "There's litigation risk"
- "We need to comply by [date]"
- Urgent response to regulations or external requirements

**Characteristics:** Prioritize rapid triage, legal alignment, communication plan

### Ambiguous Cases
Ask the user:
```
I'll help develop an accessibility improvement strategy. Which situation is closest to yours?

1. **New Introduction** - Just starting to work on accessibility
2. **Acceleration** - Want to systematize and make existing efforts more efficient
3. **External Audit Response** - Need urgent response to regulations or audits
```

## Step 2: Gather Information

Once the scenario is identified, collect information in the following order. Use the `AskUserQuestion` tool to ask questions efficiently.

### Stage 0: Reference Documents (Check first)

If documentation about prior initiatives exists, reading it first enables more accurate planning.

**Example documents to read:**
- Accessibility test results / conformance reports
- History of prior initiatives / retrospective documents
- Existing a11y guidelines / policies
- Tech stack or organizational structure descriptions

**Example question:**
```
Do you have any reference documents for planning?
(e.g., test results, initiative history, guidelines, etc.)

Please provide the file path and I'll review the contents.
For multiple files, separate paths with commas.
If none, reply "none".
```

If file paths are provided, use the `Read` tool to load the content and keep it as context. The information will be used for maturity assessment and roadmap creation.

### Stage 1: Required Items (Always confirm first)

These items are essential for strategy development. Combine multiple questions efficiently:

| Category | Question Item | What to Confirm |
|----------|---------------|-----------------|
| Business | Target users | B2B/B2C, who are decision makers |
| Business | Target market | US, Europe, Asia, Global, specific regions only |
| Technical | Design system | Existence, coverage |
| Technical | Legacy code | Approximate amount (high/medium/low) |
| Technical | UI quality | Current quality level (good/average/needs improvement) |
| Organization | Team structure | Team composition, dedicated personnel |
| Organization | Prior initiatives | Track record, content |

### Stage 2: Context-Dependent Items (Confirm based on scenario)

Additional items to confirm based on scenario:

| Scenario | Additional Items |
|----------|------------------|
| New Introduction | Budget expectations, executive understanding, reference cases |
| Acceleration | Current bottlenecks, tooling environment, CI/CD status |
| External Audit Response | Deadline, target scope, legal/compliance structure |

### Stage 3: Optional Items (If user has additional information)

Not required but improves strategy accuracy:

- Competitor situation
- Procurement requirements (public sector, etc.)
- Vendor involvement status
- Past audit results or user feedback

## Step 3: Maturity Assessment

Based on collected information, assess the organization's accessibility maturity.

### Maturity Levels

| Level | Name | Characteristics |
|-------|------|-----------------|
| L1 | Ad hoc | Depends on individual goodwill, no systematic initiatives |
| L2 | Repeatable | Some reproducible practices exist, documentation lacking |
| L3 | Managed | Processes defined, organizational ownership exists |
| L4 | Scalable | Automation and measurement established, continuous improvement cycle running |

### Assessment Axes

Evaluate on these 5 axes:

1. **Governance**: Policies, responsible parties, budget existence
2. **Design System**: A11y-enabled component readiness
3. **Engineering**: Coding standards, review processes
4. **QA/Verification**: Test automation, manual verification structure
5. **Training**: Education programs, skill assessment

## Step 4: Strategy Draft Generation

Based on maturity assessment, generate draft deliverables.

**Important**: See `${CLAUDE_PLUGIN_ROOT}/skills/planning-a11y-improvement/references/output-templates.md` for detailed output templates.

### 4.1 Roadmap

Create a phased improvement plan:

| Phase | Duration | Focus |
|-------|----------|-------|
| Immediate | 0-1 months | Quick wins, urgent fixes |
| Near-term | 2-3 months | Foundation building, process setup |
| Mid-term | 4-6 months | Automation, scaling |
| Long-term | 7-12 months | Culture building, continuous improvement |

### 4.2 KPI/Metrics Design

**Leading Indicators**:
- Percentage of components with a11y specs defined
- Review coverage
- Training completion rate

**Lagging Indicators**:
- Audit finding counts (by severity)
- Rework rate
- A11y-related support tickets

### 4.3 Stakeholder Persuasion Materials

Organize around business impact:

- **Risk**: Regulatory violations, litigation risk, market access restrictions
- **Opportunity**: Market expansion, brand value, user satisfaction improvement
- **Cost**: Future cost of not addressing vs. cost of addressing now

## Scenario-Specific Guidance

See `${CLAUDE_PLUGIN_ROOT}/skills/planning-a11y-improvement/references/scenario-playbooks.md` for detailed guidance for each scenario.

## Step 5: Review and Adjustment

After presenting the strategy draft, engage with the user to refine the strategy.

## Step 6: File Export

Once strategy is finalized, export as a Markdown file using the `Write` tool.

## Notes

- **Be specific**: Not abstract recommendations but concrete actions
- **Be realistic**: Create executable plans considering organizational resources and constraints
- **Be flexible**: Adjust timelines and priorities based on user's situation
- **Business perspective**: Always tie explanations to business impact
- **Be interactive**: After draft generation, dialogue with user to refine the strategy
