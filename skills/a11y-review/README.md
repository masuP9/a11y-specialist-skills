# a11y-review

Webページ、コンポーネント実装、デザイン案、仕様書をWCAG 2.2・WAI-ARIA APG観点でレビューするスキル。

## Features

- **複数の対象に対応**: Webページ（URL）、ローカルファイル、デザイン案、仕様書
- **自動チェック**: セマンティクス、代替テキスト、フォーム、ARIA属性など
- **構造化された出力**: 良い点、問題点（重要度別）、手動確認推奨項目
- **WCAG準拠**: 各問題にWCAG達成基準を紐付け

## Check Items

### Automated Checks

| Category | Items |
|----------|-------|
| Semantics | Heading structure (h1-h6), landmarks, appropriate HTML elements |
| Alt text | img, svg, icon alt/aria-label |
| Forms | label association, required fields, fieldset/legend |
| ARIA | role validity, aria-* attributes, avoiding redundant ARIA |
| Interactive | Accessible names, keyboard focusability, tabindex |
| Links/Buttons | Clear purpose text, avoiding empty links |

### Manual Check Recommendations

| Category | Reason |
|----------|--------|
| Consistent navigation | Requires multi-page comparison |
| Error handling | Requires form interaction |
| Color contrast | Requires measurement tools |
| Keyboard operability | Requires full operation path testing |
| Dynamic content | Requires state change observation |
| Focus management | Requires modal/SPA transition testing |

## Usage Examples

```
# Web page
https://example.com のa11yレビューして

# Local component
src/components/Modal.tsx のアクセシビリティを確認

# Design
このデザイン案をa11y観点でレビュー

# Specification
この仕様書のアクセシビリティ要件をチェック
```

## Output Format

```markdown
### Good Points
- [Specific implementation] is well done because [reason]

### Issues

**Critical**
- **Location**: [element/code]
- **Issue**: [description]
- **WCAG**: [success criterion]
- **Fix**: [suggestion]

**Major**
...

**Minor**
...

### Manual Checks Recommended
- [ ] Check color contrast with tools
- [ ] Test keyboard navigation
...
```

## References

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/)
