# a11y-specialist-skills

[日本語版 (Japanese)](./README.ja.md)

Accessibility specialist skills plugin for [Claude Code](https://claude.ai/claude-code).

Provides accessibility review skills based on WCAG 2.2 & WAI-ARIA APG.

## Skills

| Skill | Description |
|-------|-------------|
| [reviewing-a11y](./skills/reviewing-a11y/) | Accessibility review for web pages, component implementations, design mockups, and specifications |
| [auditing-wcag](./skills/auditing-wcag/) | Systematic WCAG 2.2 AA conformance auditing with automated test scripts |
| [planning-wcag-audit](./skills/planning-wcag-audit/) | WCAG audit planning based on WAIC guidelines (page selection, test methods) |
| [planning-a11y-improvement](./skills/planning-a11y-improvement/) | Accessibility improvement planning with maturity assessment, roadmap, KPI design |

## Installation

### As a Plugin (Recommended)

```bash
# Add marketplace
/plugin marketplace add masuP9/a11y-specialist-skills

# Install plugin
/plugin install a11y-specialist-skills@a11y-specialist-skills
```

### As a Standalone Skill (Symlink)

```bash
# Clone the repository
git clone https://github.com/masuP9/a11y-specialist-skills.git

# Create symlink to your skills directory
ln -s /path/to/a11y-specialist-skills/skills/reviewing-a11y ~/.claude/skills/reviewing-a11y
```

### For Development

```bash
# Test locally with --plugin-dir
claude --plugin-dir /path/to/a11y-specialist-skills
```

## Usage

### reviewing-a11y (Accessibility Review)

Claude will automatically detect when to use the skill based on your request:

```
# Examples
Review accessibility
Check a11y
Accessibility review please
```

You can also provide specific targets:

```
# URL
Review a11y for https://example.com

# Local file
Check accessibility of src/components/Button.tsx

# Design spec
Review this design mockup from a11y perspective
```

You can also invoke directly with slash command:

```
/reviewing-a11y
```

#### Review Output

The skill provides structured feedback including:

- **Positive Findings**: What's done well from an accessibility perspective
- **Issues**: Problems categorized by severity (Critical / Major / Minor)
  - Location in code/page
  - Description of the issue
  - Related WCAG success criterion
  - Suggested fix
- **Manual Checks**: Items that require human verification

### auditing-wcag (WCAG Conformance Audit)

Perform systematic WCAG 2.2 AA conformance audits:

```
# Examples
Audit this page for WCAG compliance
Run WCAG audit on https://example.com
Check WCAG 2.2 AA conformance
```

You can also invoke directly with slash command:

```
/auditing-wcag
```

#### Audit Process

The skill guides through a 4-phase audit:

1. **Automated Checks**: axe-core + custom Playwright scripts
2. **Interactive Checks**: Keyboard, focus, pointer operations
3. **Manual Checks**: Human verification items
4. **Content Review**: Alt text, labels, headings quality

Includes automated test scripts for:
- Focus indicators (2.4.7, 2.4.12, 3.2.1)
- Reflow at 320px (1.4.10)
- Text spacing (1.4.12)
- Target size (2.5.5, 2.5.8)
- And more...

### planning-wcag-audit (Audit Planning)

Plan WCAG audits based on WAIC guidelines:

```
# Examples
Help me plan a WCAG audit
Create audit plan for our website
Select pages for accessibility testing
```

You can also invoke directly with slash command:

```
/planning-wcag-audit
```

#### Planning Output

- **Page Selection**: Representative pages based on WAIC methodology
- **Test Methods**: Automated vs manual test allocation
- **Audit Plan Document**: Formal audit plan template

### planning-a11y-improvement (Improvement Planning)

Create organizational accessibility improvement plans:

```
# Examples
Help me plan accessibility improvements
Create an a11y strategy
Assess our organization's a11y maturity
```

You can also invoke directly with slash command:

```
/planning-a11y-improvement
```

#### Planning Output

Collects information through interview format and generates:

- **Maturity Assessment**: Current level (L1-L4) with rationale
- **Roadmap**: Phased initiatives with owners
- **KPI Design**: Leading and lagging indicators
- **Stakeholder Materials**: Business impact and ROI

You can also load documents such as accessibility test results or initiative history for more accurate planning.

## References

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)

## License

[MIT](./LICENSE)
