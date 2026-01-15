# Development Guidelines

## Writing Skills and Guides

### Assume Claude's Prior Knowledge

Claude already knows accessibility standards thoroughly. Do not include:

- WCAG 2.x success criteria definitions
- WAI-ARIA roles, states, and properties
- Basic HTML semantics
- General accessibility principles

Instead, focus on:

- **How** to apply the knowledge (review process, tool usage)
- **What** to output (report format, severity criteria)
- **When** to flag issues for manual verification
- Project-specific conventions

### Keep It Actionable

- Write instructions, not tutorials
- Use tables and lists for quick reference
- Include concrete examples of expected output

## Localization

This project maintains documentation in both English and Japanese.

### File Naming Convention

| English (default) | Japanese |
|-------------------|----------|
| `SKILL.md` | `SKILL.ja.md` |
| `README.md` | `README.ja.md` |
| `references/*.md` | `references/*.ja.md` |

### Sync Rules

- **Always keep English and Japanese versions in sync**
- Japanese (`.ja.md`) files are the source of truth for content
- English files are translations of the Japanese source
- When updating content, update the Japanese version first, then sync to English
- When adding a new file, create both language versions

### Language Links

Each file should include a link to its counterpart at the top:

```markdown
# English file
[日本語版 (Japanese)](./FILENAME.ja.md)

# Japanese file
[English](./FILENAME.md)
```
