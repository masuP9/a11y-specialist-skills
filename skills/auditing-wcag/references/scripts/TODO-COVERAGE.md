# 未カバー達成基準の実装メモ

現在のスクリプトでカバーされていない WCAG 2.2 AA 達成基準のうち、自動化の可能性があるもの。

## 比較的自動化しやすい

### 2.4.12 Focus Not Obscured (Minimum) - **実装済み** ✅
**概要**: フォーカスを受けた要素がビューポート内で完全に隠れていないこと

**実装**: `focus-indicator-check.ts` に統合
- Tab でフォーカス移動し、各要素で遮蔽チェック
- `getBoundingClientRect()` + `elementFromPoint()` でスタッキング順序を検証
- fixed/sticky 要素による遮蔽を検出
- z-index フォールバックで `pointer-events: none` 要素も対応
- 遮蔽率 20% 以上で報告（閾値は調整可能）

**検出可能な問題**:
- sticky ヘッダー/フッターに隠れるフォーカス要素
- fixed 位置のバナー/広告による遮蔽

**制限**:
- 部分的な遮蔽の閾値判定（20%がデフォルト）
- 複数 obscurer の重複領域は近似計算

---

### 3.2.1 On Focus - **実装済み** ✅
**概要**: フォーカスを受けたときにコンテキスト変更が発生しない

**実装**: `focus-indicator-check.ts` に統合
- Tab でフォーカス移動中に URL 変更を検出
- 問題のある要素をスキップして自動再開
- 違反要素と遷移先 URL を報告

**検出可能な問題**:
- フォーカス時に自動的にページ遷移するリンク/ボタン
- JavaScript の focus イベントで navigate() を呼ぶケース

---

### 2.5.3 Label in Name
**概要**: アクセシブル名に可視ラベルのテキストが含まれること

**備考**: `automated-checks.md` でカバー済み（DOM text と a11y name の比較）

**スクリプト化する場合の追加価値**:
- 全要素の網羅的スキャン
- JSON形式での詳細レポート出力

---

### 2.5.8 Target Size (Minimum) - **実装済み** ✅
**概要**: タップターゲットが 24x24 CSS ピクセル以上

**実装**: `target-size-check.ts`
- WCAG 2.5.8 (AA: 24px) と 2.5.5 (AAA: 44px) の両方を検証
- 例外処理: inline, redundant, ua-control, spacing
- ariaSnapshot() によるアクセシブル名取得

**検出可能な問題**:
- 小さすぎるボタン/リンク
- 密集したナビゲーションリンク

**制限**:
- essential 例外は手動レビューが必要
- CSS疑似要素によるクリック領域拡張は完全に検出できない

---

### 1.4.13 Content on Hover or Focus
**概要**: ホバー/フォーカスで表示されるコンテンツが dismissible、hoverable、persistent であること

**実装アイデア**:
- ホバー/フォーカス前後の DOM 差分を検出
- 新規表示要素の特定
- Escape キーで非表示になるか検証
- ホバーを維持したままポインタ移動可能か検証

**検出可能な問題**:
- Escape で閉じないツールチップ
- ホバーアウトで即座に消えるポップオーバー

**制限**:
- 動的コンテンツの検出タイミング
- 「persistent」の時間判定

---

## 部分的に自動化可能

### 2.1.1 Keyboard
**概要**: 全機能がキーボードで操作可能

**実装アイデア**:
- Tab キーで全インタラクティブ要素にフォーカス移動
- フォーカス可能だが `tabindex="-1"` の要素を報告
- クリックハンドラがあるが非インタラクティブな要素を検出

**検出可能な問題**:
- `div[onclick]` でフォーカス不可の要素
- `tabindex="-1"` の操作可能要素

**制限**:
- カスタムキーボード操作（矢印キーなど）の検証は困難
- 機能の完全性は手動確認が必要

---

### 2.1.2 No Keyboard Trap
**概要**: フォーカスがキーボードトラップに陥らない

**実装アイデア**:
- Tab/Shift+Tab でフォーカス移動をシミュレート
- 一定回数以内に全要素を巡回できるか確認
- 同じ要素にフォーカスがループする場合を検出

**検出可能な問題**:
- 閉じられないモーダル
- 無限ループするフォーカス

**制限**:
- 意図的なフォーカストラップ（モーダル内）との区別
- Escape キーでの脱出パスの検証

---

### 2.4.1 Bypass Blocks
**概要**: 繰り返しコンテンツをスキップする仕組み

**備考**: `automated-checks.md` でカバー済み（スキップリンク、main landmark、heading 構造の確認）

---

### 3.1.1 Language of Page
**概要**: ページのデフォルト言語が指定されている

**備考**:
- axe-core の `html-has-lang`, `html-lang-valid` でカバー済み
- `automated-checks.md` でもカバー済み

---

## 実装優先度（案）

**新規スクリプト作成が必要なもの:**

| 優先度 | 達成基準 | 理由 |
|-------|---------|------|
| 中 | 2.1.2 No Keyboard Trap | モーダル問題の検出 |
| 低 | 1.4.13 Content on Hover | 実装複雑、エッジケース多い |
| 低 | 2.1.1 Keyboard | 部分的にしか検出できない |

**既存でカバー済み:**

| 達成基準 | カバー元 |
|---------|---------|
| 2.4.1 Bypass Blocks | `automated-checks.md` |
| 2.4.12 Focus Not Obscured | `focus-indicator-check.ts` ✅ |
| 2.5.3 Label in Name | `automated-checks.md` |
| 2.5.8 Target Size (Minimum) | `target-size-check.ts` ✅ |
| 3.1.1 Language of Page | axe-core + `automated-checks.md` |
| 3.2.1 On Focus | `focus-indicator-check.ts` ✅ |

---

## 参考リンク

- [WCAG 2.2 Understanding Docs](https://www.w3.org/WAI/WCAG22/Understanding/)
- [ACT Rules Community](https://www.w3.org/WAI/standards-guidelines/act/rules/)
- [axe-core Rules](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
