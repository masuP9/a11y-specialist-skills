# 未カバー達成基準の実装メモ

<!-- (2026-06-12 に `skills/auditing-wcag/references/scripts/` から移動。チェック実装は本パッケージに集約されたため) -->

現在のスクリプトでカバーされていない WCAG 2.2 AA 達成基準のうち、自動化の可能性があるもの。

## 比較的自動化しやすい

### 2.4.11 Focus Not Obscured (Minimum) / 2.4.12 Focus Not Obscured (Enhanced) - **実装済み** ✅
**概要**: 2.4.11 は、フォーカスを受けた要素がビューポート内で完全には隠れていないこと。2.4.12（AAA）は、一部でも隠れていないこと

**実装**: `focus-indicator-check.ts` に統合
- Tab でフォーカス移動し、各要素で遮蔽チェック
- `getBoundingClientRect()` + `elementFromPoint()` でスタッキング順序を検証
- fixed/sticky 要素による遮蔽を検出
- z-index フォールバックで `pointer-events: none` 要素も対応
- 一部でも遮蔽されていれば 2.4.12 として報告（`focus-not-obscured-enhanced`）。ほぼ全部（99% 以上）が遮蔽されていれば `fullyObscured: true` で 2.4.11 としても報告（`focus-not-obscured`）。8px² 未満の端数の重なりだけは無視

**検出可能な問題**:
- sticky ヘッダー/フッターに隠れるフォーカス要素
- fixed 位置のバナー/広告による遮蔽

**制限**:
- 見ているのは要素の矩形で、フォーカスの印そのものではない。利用者がフォーカスを動かさずに隠れたものをどけられる場合（2.4.11 の対象外）も判別できないため、どちらも `incomplete`
- 複数の遮蔽要素が重なる部分は 1 回だけ数える（重なりの合計ではなく和集合の面積）

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
- 例外処理: inline, redundant, ua-control, spacing（spacing は WCAG 定義どおりの 24px 円判定で幾何的に検証）
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

### 2.1.1 Keyboard - **部分実装** ✅
**概要**: 全機能がキーボードで操作可能

**実装**: `keyboard-reachability-check`（`runKeyboardReachabilityCheck.ts`）
- 読み込み直後に操作可能要素を列挙し、Tab で 1 周、Tab で入れた複合部品
  （tablist / menu / menubar / listbox / radiogroup / toolbar / tree、ネイティブ
  ラジオ群）の中を矢印キーで両方向に巡回、`aria-activedescendant` の参照先も記録
- 届かなかった要素を reason / confidence 付きで incomplete 報告
  （`tabindex="-1"`、フォーカス不可の `onclick` / role 要素、クリックリスナー付き要素など）
- 遷移・再読み込み・時間切れで中断したときは、試せなかった要素を
  `not-evaluated` にして結果を incomplete にする
- コンボボックス・`aria-haspopup` の要素は ArrowDown で 1 段だけ開き、中の
  option / menuitem / treeitem も判定（キーボードで中に入れたときだけ）

**残る制限**:
- 機能の完全性（同じ機能を別の要素や独自ショートカットで操作できるか）は手動確認
- `document` / `window` への委譲リスナー、`el.onclick = fn` の代入は検出できない
- Shadow DOM / iframe の中、2 段目以降のサブメニュー、Enter / Space で開く
  ポップアップ、その他の読み込み後に表示される要素、grid / treegrid は対象外
- 独自ショートカット（F6 など）で入る部品は候補として出る

---

### 3.3.7 Redundant Entry - **部分実装** ✅
**概要**: 同じ手順の中で一度入力した情報を再入力させない

**実装**: `redundant-entry-check`（`runRedundantEntryCheck.ts`）
- 同じ form（form に属さない欄はページ全体）・同じ `section-*` の中で、同じ目的の欄が
  2 つ以上ある組を `incomplete` の候補として報告（2 つ目以降が node）
- 目的は `autocomplete` の欄名トークン、無ければ名前・id・ラベル・placeholder から推定
  （範囲の語「shipping」「お届け先」「請求先」と確認用の語「確認」「confirm」は取り除いて照合）
- 範囲が違う組は `scoped`、同じ範囲の繰り返しは `repeated`
- 同じ form の中の「〜と同じ」などのチェックボックス・ボタン・選択肢を `copyControls` に添える
- パスワード・ワンタイムコードの欄は対象外（3.3.7 のセキュリティ例外）

**残る制限**:
- **手順が複数ページに分かれるフォームは範囲外**（前のページの入力を知り得ない）
- 別の form にまたがる重なりは拾わない。目的の推定は語の一致による推測
- `copyControls` は文字の一致による推測で、値が実際に写るかは確かめない
- 読み込み時に非表示の欄も数える。Shadow DOM / iframe の中は見ない
- 例外（再入力が必須、以前の情報が無効）は判断できず、人手で確認する

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

**既存でカバー済み:**

| 達成基準 | カバー元 |
|---------|---------|
| 2.1.1 Keyboard | `keyboard-reachability-check`（部分） ✅ |
| 2.4.1 Bypass Blocks | `automated-checks.md` |
| 2.4.11 Focus Not Obscured (Minimum) / 2.4.12 (Enhanced) | `focus-indicator-check.ts` ✅ |
| 2.5.3 Label in Name | `automated-checks.md` |
| 2.5.8 Target Size (Minimum) | `target-size-check.ts` ✅ |
| 3.1.1 Language of Page | axe-core + `automated-checks.md` |
| 3.2.1 On Focus | `focus-indicator-check.ts` ✅ |
| 3.3.7 Redundant Entry | `redundant-entry-check`（部分） ✅ |

---

## 参考リンク

- [WCAG 2.2 Understanding Docs](https://www.w3.org/WAI/WCAG22/Understanding/)
- [ACT Rules Community](https://www.w3.org/WAI/standards-guidelines/act/rules/)
- [axe-core Rules](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
