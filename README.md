# a11y-specialist-skills

Accessibility specialist skills plugin for [Claude Code](https://claude.ai/claude-code).

WCAG 2.2 & WAI-ARIA APG に基づいたアクセシビリティレビューを行うスキルを提供します。

## Skills

| Skill | Description |
|-------|-------------|
| [a11y-review](./skills/a11y-review/) | Webページ、コンポーネント実装、デザイン案、仕様書のアクセシビリティレビュー |

## Installation

### As a Plugin (Recommended)

```bash
# Add marketplace (if not already added)
claude marketplace add https://raw.githubusercontent.com/masuP9/a11y-specialist-skills/main/marketplace.json

# Install plugin
claude plugin install a11y-specialist-skills
```

### As a Standalone Skill (Symlink)

```bash
# Clone the repository
git clone https://github.com/masuP9/a11y-specialist-skills.git

# Create symlink to your skills directory
ln -s /path/to/a11y-specialist-skills/skills/a11y-review ~/.claude/skills/a11y-review
```

### For Development

```bash
# Test locally with --plugin-dir
claude --plugin-dir /path/to/a11y-specialist-skills
```

## Usage

Claude will automatically detect when to use the skill based on your request:

```
# Examples
a11yレビューして
アクセシビリティ確認して
このページのアクセシビリティをチェックして
Review accessibility of this component
```

You can also provide specific targets:

```
# URL
https://example.com のa11yレビューして

# Local file
src/components/Button.tsx のアクセシビリティを確認して

# Design spec
このデザイン案のa11y観点でレビューして
```

## Review Output

The skill provides structured feedback including:

- **Good Points**: What's done well from an accessibility perspective
- **Issues**: Problems categorized by severity (Critical / Major / Minor)
  - Location in code/page
  - Description of the issue
  - Related WCAG success criterion
  - Suggested fix
- **Manual Checks**: Items that require human verification

## References

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WCAG 2.2 日本語訳](https://waic.jp/translations/WCAG22/)
- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)

## License

[MIT](./LICENSE)
