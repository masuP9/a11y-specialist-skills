[日本語版 (Japanese)](./maturity-proof-points.ja.md)

# Maturity Model Proof Points

This document defines detailed proof points for the accessibility maturity model used in planning-a11y-improvement. The model is based on the [W3C Accessibility Maturity Model](https://www.w3.org/TR/maturity-model/) ICT Development Lifecycle dimension, supplemented with insights from the [Microsoft Accessibility Evolution Model (AEM)](https://blogs.microsoft.com/accessibility/accessibility-evolution-model/) and [Level Access Digital Accessibility Maturity Model (DAMM)](https://www.levelaccess.com/blog/the-digital-accessibility-maturity-model-introduction-to-damm/).

## Maturity Levels

| Level | Name | Characteristics |
|-------|------|-----------------|
| L0 | Inactive | No initiatives. Baseline for assessment |
| L1 | Ad hoc | Sporadic efforts driven by individual goodwill or interest. No organizational support or structure |
| L2 | Launch | Organization recognizes the need for accessibility and has started. Efforts are underway but inconsistent. New development only |
| L3 | Integrate | Organizational approach defined and deployed. Processes embedded across the development lifecycle. Remediation of existing products begins |
| L4 | Optimize | Standardized approach permeates the entire organization. A11y tests integrated into CI/CD. Continuous evaluation and improvement cycle operational |

## Assessment Axes

8 axes based on W3C ICT Development Lifecycle (7 sub-dimensions) + Governance:

| # | Axis | Source | Overview |
|---|------|--------|----------|
| 1 | User Research | W3C | Including people with disabilities in research, participant accommodations, accessible research materials |
| 2 | Planning and Design | W3C | Integrating a11y standards into design phase, checklists, design reviews, design system |
| 3 | Development | W3C | Developer resources, checklists, issue management, acceptance criteria |
| 4 | User Experience | W3C | UX testing with people with disabilities, accessible test materials |
| 5 | Quality Review Through Release | W3C | Manual/automated testing, bug tracking, release gates, ACR creation |
| 6 | ICT Development Training | W3C | Role-specific a11y training |
| 7 | Goals and Metrics | W3C | Goal setting, metric definition, progress tracking |
| 8 | Governance | DAMM + W3C Oversight | Executive sponsor, policy, budget, accountability |

## Proof Points by Axis

### 1. User Research

#### L1 Ad hoc
- Individual researchers occasionally consider accessibility in studies
- No formal process for recruiting participants with disabilities
- Research materials (surveys, consent forms) not reviewed for accessibility

#### L2 Launch
- Guidelines exist for including people with disabilities in user research
- Participant recruitment considers diversity of abilities for some studies
- Research tools and materials are reviewed for basic accessibility (e.g., screen reader compatible surveys)
- Accommodations offered to participants upon request

#### L3 Integrate
- People with disabilities are systematically included in user research across projects
- Participant recruitment process has defined targets for including people with disabilities
- All research materials meet accessibility standards
- Accommodations are proactively offered and budgeted
- Research findings related to accessibility are documented and shared with teams

#### L4 Optimize
- Accessibility is a standard dimension in all user research studies
- Diverse disability representation is tracked and measured across research programs
- Research insights systematically feed into design system and product requirements
- Community relationships with disability organizations established for ongoing research
- Research methods continuously refined based on participant feedback

---

### 2. Planning and Design

#### L1 Ad hoc
- Individual designers occasionally consider accessibility
- No formal a11y requirements in design specs
- Design reviews do not include accessibility criteria

#### L2 Launch
- Accessibility requirements are defined for new projects
- Design checklists include basic a11y items (color contrast, text sizing, touch targets)
- Some designers use a11y-focused design tools or plugins (e.g., contrast checkers)
- Design system, if it exists, has started incorporating a11y guidance for key components

#### L3 Integrate
- A11y requirements are standard in all design specifications
- Design reviews include accessibility criteria with defined reviewers
- Design system has comprehensive a11y guidelines and patterns
- Annotation practices for a11y (focus order, alt text, ARIA) are standard
- Design-to-development handoff includes a11y specifications

#### L4 Optimize
- A11y is integral to the design process, not a separate checklist
- Design system components are built a11y-first with automated a11y checks
- Design patterns are validated with assistive technology users
- Cross-team design consistency for a11y is monitored and measured
- Design innovation incorporates inclusive design principles

---

### 3. Development

#### L1 Ad hoc
- Individual developers fix a11y issues when noticed
- No coding standards or guidelines for accessibility
- A11y is not part of code review criteria

#### L2 Launch
- Basic a11y coding guidelines documented (semantic HTML, ARIA usage)
- A11y is included in code review checklists for new development
- Developer tools (linters, IDE plugins) for a11y are recommended or available
- Some components have a11y-specific acceptance criteria

#### L3 Integrate
- Comprehensive a11y coding standards enforced across teams
- Code reviews systematically include a11y evaluation
- A11y acceptance criteria are standard for all user-facing stories/tickets
- Automated a11y linting integrated into development workflow
- Issue tracking includes a11y-specific categorization and priority levels
- Remediation of existing products is planned and in progress

#### L4 Optimize
- A11y best practices are embedded in development culture
- Automated a11y checks run in CI/CD pipeline with defined pass/fail thresholds
- A11y technical debt is tracked and systematically addressed
- Developers contribute back to a11y tooling and shared component libraries
- Cross-product a11y consistency is monitored

---

### 4. User Experience

#### L1 Ad hoc
- Usability testing rarely includes people with disabilities
- No assistive technology testing in QA process
- UX feedback from users with disabilities is handled reactively

#### L2 Launch
- Some usability tests include participants with disabilities
- Basic assistive technology testing (screen reader, keyboard) performed for key flows
- UX test materials are reviewed for accessibility
- Feedback channels are available for reporting accessibility issues

#### L3 Integrate
- People with disabilities are systematically included in usability testing
- Assistive technology testing covers major AT categories (screen readers, magnification, voice control, switch access)
- UX test plans include a11y-specific scenarios and tasks
- Feedback from a11y-related UX testing is tracked and fed into product backlog
- All test materials and environments meet accessibility standards

#### L4 Optimize
- Continuous UX research with diverse disability representation
- Assistive technology compatibility is a standard quality dimension
- UX metrics include a11y-specific measures (task completion with AT, satisfaction scores)
- UX patterns are validated across assistive technologies before release
- User feedback loop for accessibility is integrated into product improvement cycle

---

### 5. Quality Review Through Release

#### L1 Ad hoc
- A11y testing is performed only when someone raises a concern
- No formal a11y test process or tools
- Release criteria do not include accessibility

#### L2 Launch
- Automated a11y scanning tools are used on key pages/flows
- Basic manual testing (keyboard navigation, screen reader spot-checks) is performed
- A11y bugs are logged and tracked in the issue tracker
- A11y is considered in release decisions for new features

#### L3 Integrate
- A11y test plans cover automated, manual, and assistive technology testing
- Defined a11y release gates (e.g., no critical a11y violations at release)
- Bug tracking includes a11y severity classification aligned with WCAG levels
- Accessibility Conformance Reports (ACR/VPAT) are created and maintained
- Regression testing includes a11y test cases
- Test coverage metrics for a11y are tracked

#### L4 Optimize
- A11y testing is fully integrated into CI/CD with automated pass/fail gates
- Comprehensive test coverage across WCAG success criteria
- ACRs are updated on a regular cadence and published
- A11y test results are visible on dashboards and inform release decisions
- Testing processes are continuously improved based on audit findings and user feedback
- Third-party a11y audits are conducted periodically

---

### 6. ICT Development Training

#### L1 Ad hoc
- Individual team members self-study accessibility
- No formal a11y training program
- Knowledge is concentrated in a few individuals

#### L2 Launch
- Basic a11y awareness training is available for development teams
- Role-specific introductory training exists (designers, developers, QA)
- Training materials are curated or developed
- Participation is encouraged but not required

#### L3 Integrate
- Role-specific a11y training is required for all ICT development roles
- Training program covers WCAG requirements, assistive technology, and testing techniques
- New hires receive a11y onboarding training
- Training effectiveness is measured (assessments, practical exercises)
- Training content is kept current with standards updates

#### L4 Optimize
- Continuous learning program with advanced and specialized courses
- A11y skills are part of performance evaluation and career development
- Internal a11y champions or experts program is established
- Training program is regularly updated based on audit findings and industry developments
- Knowledge sharing (internal talks, blog posts, communities of practice) is active

---

### 7. Goals and Metrics

#### L1 Ad hoc
- No formal accessibility goals or metrics defined
- Progress is not measured or tracked
- Success is anecdotal

#### L2 Launch
- Basic a11y goals are set (e.g., "achieve WCAG 2.x AA for new features")
- Some metrics are collected (e.g., automated scan violation counts)
- Reporting is manual and periodic

#### L3 Integrate
- Clear, measurable a11y goals are set at organizational and product levels
- Leading and lagging indicators are defined and tracked
- A11y metrics are included in product/engineering dashboards
- Progress is reported to leadership regularly
- Goals are reviewed and updated annually

#### L4 Optimize
- A11y goals are integrated into overall business/product OKRs
- Real-time metrics dashboards are available
- Trend analysis informs strategy adjustments
- Benchmarking against industry standards and peers
- Metrics drive continuous improvement and investment decisions

---

### 8. Governance

#### L1 Ad hoc
- No formal a11y policy or executive sponsorship
- Accessibility efforts depend on individual advocates
- No dedicated budget for accessibility

#### L2 Launch
- Executive sponsor identified for accessibility initiatives
- A11y policy is drafted or approved
- Initial budget allocated for a11y activities (training, tools, audits)
- A point of contact or coordinator for a11y is designated
- A11y is referenced in some procurement or development standards

#### L3 Integrate
- Formal a11y policy published and communicated across the organization
- Dedicated a11y team or defined roles with clear accountability
- Recurring budget for a11y activities
- A11y is included in procurement requirements
- Regular reporting to executive leadership on a11y progress
- A11y considerations are part of risk management processes

#### L4 Optimize
- A11y is embedded in organizational strategy and values
- Cross-functional a11y governance board or council is operational
- A11y investment is based on data-driven business cases
- Accountability for a11y extends to product/engineering leadership
- External commitments (public statements, conformance claims) are maintained
- Governance model is reviewed and refined periodically
