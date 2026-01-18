[日本語版 (Japanese)](./scenario-playbooks.ja.md)

# Scenario Playbooks

This document provides strategy development guidance for each usage scenario.

## Scenario 1: New Introduction Phase

### Situation
- Just starting to work on accessibility
- Little systematic knowledge or processes
- Executive understanding varies (from top-down mandate to grassroots initiative)

### Priorities

1. **Establish Baseline**
   - Run current state automated scan
   - Visualize major issues
   - Conduct maturity assessment

2. **Foundational Training**
   - Basic training for dev team
   - Basic training for design team
   - Promote understanding of "why it matters"

3. **Seed Design System**
   - Check a11y status of existing components
   - Establish guidelines for new component creation
   - Plan accessible pattern library

4. **Small Wins**
   - Identify and execute quick wins
   - Share results internally
   - Boost motivation

### What to Avoid

- Trying to make everything perfect at once
- Starting with difficult problems
- Rushing external certification
- Aiming for company-wide rollout without dedicated team

### Typical Roadmap

| Phase | Duration | Focus |
|-------|----------|-------|
| Immediate | 0-1 months | Current state assessment, policy draft, quick wins |
| Near-term | 2-3 months | Foundational training, fix critical issues |
| Mid-term | 4-6 months | Process setup, CI integration |
| Long-term | 7-12 months | Culture building, systematize continuous improvement |

### Additional Items to Confirm

- Budget expectations and executive commitment level
- Reference cases from other companies
- Existing a11y knowledge holders in company
- Consideration of external support (consulting, training)

---

## Scenario 2: Acceleration Phase

### Situation
- Already have some track record
- Responses are ad-hoc and person-dependent
- Want to proceed more efficiently and systematically

### Priorities

1. **Strengthen Governance**
   - Establish formal policy
   - Clarify responsible parties and budget
   - Establish decision-making process

2. **Establish QA Gates**
   - A11y checklist in design reviews
   - Automated checks before PR merge
   - Pre-release verification process

3. **Automate Toolchain**
   - Integrate a11y tests into CI/CD
   - Build reporting dashboard
   - Systematize issue tracking

4. **Formalize Knowledge**
   - Document internal guidelines
   - Create best practices collection
   - Document past response cases

### What to Avoid

- Negating existing efforts
- Making processes too heavy at once
- Trying to solve everything with tools alone
- Continuing to rely on individual effort

### Typical Roadmap

| Phase | Duration | Focus |
|-------|----------|-------|
| Immediate | 0-1 months | Inventory current state, identify bottlenecks |
| Near-term | 2-3 months | Establish governance, set up QA gates |
| Mid-term | 4-6 months | Automation, build dashboard |
| Long-term | 7-12 months | Scale, consider external certification |

### Additional Items to Confirm

- What are current bottlenecks?
- What existing tools/processes are in place?
- Cross-team coordination status
- What worked and didn't work in past efforts

---

## Scenario 3: External Audit Response Phase

### Situation
- Urgent response to regulations or audits required
- Fixed deadline
- High compliance risk

### Priorities

1. **Rapid Triage**
   - Clarify target scope
   - Run both automated and manual scans
   - Classify by severity and fix cost

2. **Legal/Compliance Alignment**
   - Share information with legal team
   - Agree on response scope and priorities
   - Confirm risk tolerance

3. **Fix Plan Execution**
   - Prioritize critical issue fixes
   - Consider alternatives if fix not possible
   - Visualize and report progress

4. **Communication Plan**
   - Response policy for auditors/regulators
   - Reporting to internal stakeholders
   - External commitment statements

### What to Avoid

- Panicking and sacrificing quality
- Trying to fix everything ignoring severity
- Proceeding without involving legal team
- Ending with only temporary fixes

### Typical Roadmap

| Phase | Duration | Focus |
|-------|----------|-------|
| Immediate | 0-2 weeks | Scan, triage, legal alignment |
| Near-term | 2-6 weeks | Fix critical issues, progress reporting |
| Mid-term | 6-12 weeks | Address remaining issues, process setup |
| Long-term | 3-6 months | Prevent recurrence, build ongoing response structure |

**Note**: Durations need significant adjustment based on audit/deadline.

### Additional Items to Confirm

- Specific deadline
- Target regulations/standards
- Target scope (all services or specific features)
- Legal/compliance team involvement status
- Past audit results or findings

---

## Scenario Decision Flowchart

```
                    ┌──────────────────────┐
                    │ User's situation?     │
                    └──────────┬───────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Little systematic│  │ Some track record│  │ Deadline/audit  │
│ effort          │  │ Want efficiency  │  │ Urgent response │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  New Introduction│  │  Acceleration    │  │  External Audit │
│  Phase          │  │  Phase           │  │  Response Phase │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## Market-Specific Considerations

Consider regulations and standards for target markets:

| Market | Key Regulations | Recommended Standard |
|--------|-----------------|----------------------|
| US | ADA, Section 508 | WCAG 2.1 AA |
| Europe | EAA (effective June 2025) | EN 301 549 |
| Japan | Act on Elimination of Discrimination Against Persons with Disabilities | JIS X 8341-3 |
| Global | Check each market | WCAG 2.1 AA |

**Note**: Check detailed regulatory information and litigation risk for each target market.

---

## B2B-Specific Considerations

### Approach to Decision Makers

For B2B products, appealing to purchasing decision makers (procurement, IT, legal departments) is as important as end users.

#### Procurement Requirements

| Requirement Type | Response |
|------------------|----------|
| VPAT Request | Create document in VPAT 2.4 format |
| Security Questionnaire | Prepare answers for a11y-related items |
| RFP/RFI | Clearly state a11y compliance status |

#### Talking Points by Stakeholder

| Stakeholder | Interests | Talking Points |
|-------------|-----------|----------------|
| Procurement | Compliance | Regulatory compliance status, certifications |
| IT | Technical Implementation | Integration ease, API support |
| Legal | Risk | Litigation risk reduction, contract terms |
| Executive | ROI | Market expansion, brand value |
| End User Dept | Usability | Productivity improvement, inclusion |

---

## Strategy Differences Based on Design System

### With Design System

**Approach**: Scale from design system as starting point

1. Make design system components a11y-compliant
2. Automatically deploy across all products
3. Achieve consistent user experience

**Benefits**:
- Once addressed, propagates to entire system
- Easier to maintain quality consistency
- Reduces developer burden

**Example Initiatives**:
- Define a11y specs per component
- Add a11y addon to Storybook
- Per-component automated tests

### Without Design System

**Approach**: Gradually extract and standardize patterns

1. Start with main screens/features
2. Identify common patterns and create guidelines
3. Build foundation for future design system

**Benefits**:
- Can start where needed
- Becomes catalyst for design system creation

**Example Initiatives**:
- Page-by-page a11y improvements
- Create common UI pattern guidelines
- Consider design system creation long-term
