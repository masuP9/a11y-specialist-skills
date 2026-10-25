# Plan 006: スパイク — 2.1.2 キーボードトラップなし(No Keyboard Trap)自動チェックの設計

> **実行者への指示**: これはビルドプランではなく「設計スパイク」である。
> 成果物は設計ドキュメントと使い捨てプロトタイプの観察結果であり、
> `src/` にマージするプロダクションコードではない。各ステップを順守し、
> STOP 条件に従い、完了後は `plans/README.md` のこのプランのステータス行を更新すること。
>
> **差分確認(最初に実行)**: `git diff --stat f86de93..HEAD -- packages/a11y-audit/src skills/auditing-wcag/references/scripts/TODO-COVERAGE.md`
> Plans 004/005 による src/ の差分は想定内。フォーカスインジケーターチェックや
> ルールレジストリへの構造的変更のみが STOP 条件となる。

## ステータス

- **優先度**: P3
- **工数**: M (スパイク本体。実際のチェック実装は別の将来プランで対応)
- **リスク**: LOW (プロダクションコードへの変更なし)
- **依存**: なし (src/ に対しては読み取りのみ)
- **カテゴリ**: 方向性決定 (設計スパイク)
- **計画時点**: commit `f86de93`, 2026-06-11

## なぜ重要か

リポジトリ自身のバックログにおいて、未自動化基準の中で最優先に位置付けられている。
`skills/auditing-wcag/references/scripts/TODO-COVERAGE.md:147-149` では
「優先度: 中 | 2.1.2 No Keyboard Trap | モーダル問題の検出」が中優先度の未実装チェックとして唯一挙げられており
(1.4.13 と 2.1.1 はいずれも低)、キーボードトラップはユーザーをブロックする致命的な失敗
(キーボードユーザーがウィジェットから物理的に抜け出せなくなる) である。
カバレッジマトリクス (`references/coverage-matrix.md:37`) では 2.1.2 が依然として
Interactive (手動) と記されている。既存のフォーカスインジケーターチェックはすでに
困難な部分を担っており — コンテキスト管理、Tab ループ駆動、フォーカス可能要素の列挙、
リトライ・スキップ機構 — 構造的には安価にトラップ検出器を追加できる。
安価でないのは誤検知の設計 (意図的なモーダルフォーカストラップは Escape が機能する場合に
*正しいパターン* である) であり、まさにそこをスパイクで確認すべきである。

## 現状 (設計が踏まえるべき基盤)

- `packages/a11y-audit/src/playwright/runFocusIndicatorCheck.ts` —
  アーキテクチャのテンプレート: `{ browser, targetUrl?, contextOptions?,
  ...OutputLocationOptions }` を受け取り、独自のコンテキストを生成・クローズし、
  `page.keyboard.press('Tab')` を `count + EXTRA_TAB_ITERATIONS` 要素分駆動し、
  `page.exposeFunction` + `page.addInitScript` でページ内トラッキングを行い、
  `MAX_RETRIES` によるリスタートループと `skipSelectors` を持つ。
- `packages/a11y-audit/src/constants.ts` — `FOCUSABLE_SELECTOR` (フォーカス可能要素の列挙)、
  `EXTRA_TAB_ITERATIONS = 10` (75 行目)。
- `packages/a11y-audit/src/utils/rule-registry.ts` — 各チェックのルールは
  名前空間付き ID (`a11y-skills/focus-visible`:44,
  `a11y-skills/no-context-change-on-focus`:58, ...) で登録され、
  WCAG 参照・影響度・ヘルプテキストを持つ。新規チェックはここにエントリを追加する。
- `packages/a11y-audit/src/utils/axe-format.ts` — `normalize*` 関数が
  チェック出力を axe スタイルのエンベロープ (`violations` / `incomplete` /
  `passes` バケット) にマッピングし、`buildAuditResult()` がそれを組み立てる。
- `packages/a11y-audit/src/test-entries/*.ts` — 各チェックは 13〜23 行の
  Playwright テストラッパーを持つ。`package.json` の `exports` が
  `./test-entries/<name>` にマッピングされる。
- TODO-COVERAGE.md の実装スケッチ (109〜124 行目): Tab/Shift+Tab シミュレーション、
  サイクル検出、および 2 つの名指しされた難問:
  「意図的なフォーカストラップ（モーダル内）との区別」「Escape キーでの脱出パスの検証」。

## 必要なコマンド

| 目的 | コマンド | 成功時の期待動作 |
|---------|---------|---------------------|
| ビルド (プロトタイプのインポート用) | `npm run build --workspace @a11y-skills/audit` | exit 0 |
| スクラッチ Playwright スペックの実行 | `packages/a11y-audit` 内で `npx playwright test <file>` | 実行される |

## スコープ

**スコープ内** (成果物 — 作成する唯一の非使い捨てファイル):
- `plans/006-result-keyboard-trap-design.md` (設計ドキュメント)

**使い捨て** (自由に作成し、完了前に削除すること。コミットしないこと):
- プロトタイプスペック (例: `packages/a11y-audit/test/_spike-keyboard-trap.spec.ts`)

**スコープ外** (触れないこと):
- `packages/a11y-audit/src/` 以下のすべて — スパイクにプロダクションコードを含めない。
- `rule-registry.ts`、`schemas/`、`package.json` の exports — これらの変更は
  本スパイクが仕様化する将来のビルドプランに属する。

## Git ワークフロー

- ブランチ: `spike/keyboard-trap-design`
- 単一コミット: `docs(plans): keyboard trap (2.1.2) check design spike`
- 指示がない限り、push や PR は開かないこと。

## ステップ

### ステップ 1: 「トラップ」を操作的に定義する

設計ドキュメントに候補検出アルゴリズムを記述する。
以下は出発点であり (プロトタイプの知見を踏まえて調整すること。確定済みとして扱わないこと)、

- フォーカス可能要素を列挙する (`FOCUSABLE_SELECTOR` のセマンティクスを再利用)。
- `N = focusableCount + slack` 回まで Tab を前進させ、フォーカスの順序を記録する。
  **トラップ候補**とは、フォーカスが S に入ると、`k` 回連続した Tab 操作
  (k ≥ |S| + slack) でも S の外にフォーカスが移動せず、かつ S の外にも
  フォーカス可能要素が存在する、要素の連続部分集合 S のことである。
- 各トラップ候補について、脱出パスを順番に試行し、どれ (もしあれば) が機能するかを記録する:
  `Escape` キー; 入口エッジを超えた `Shift+Tab`; S 内で到達可能な可視のクローズアフォーダンス
  (ヒューリスティック: アクセシブル名が /close|閉じる|dismiss/i にマッチするボタン)。
- 分類: 機能する脱出パスがない → `violations`
  (2.1.2 の失敗)。非文書化・非慣用的なパスのみで脱出可能 → `incomplete`
  (人間の判断が必要)。Escape が機能する `role=dialog`+`aria-modal=true` コンテナ →
  `passes` (正しいモーダルパターン)。

**確認**: 設計ドキュメントのセクションが存在し、各分類について
WCAG 2.1.2 の規範的根拠を記述していること (基準は「ユーザーが抜け出す方法を告知されている場合」に
トラップを許容する — その文言を引用し、`incomplete` バケットの根拠にマッピングすること)。

### ステップ 2: リスクの高い 20% をプロトタイプで検証する

使い捨てスペックにおいて、3 つのインラインフィクスチャ (Plan 004 と異なりナビゲーションは
不要なので `data:` URL か `page.setContent` を使用) に対して:

1. 正真正銘のトラップ: `focusout` ハンドラが最初の子要素に再フォーカスするコンテナ。Escape 処理なし。
2. 正しいモーダル: `role=dialog aria-modal=true`、keydown ハンドラでフォーカスをラップ、Escape で閉じる。
3. トラップなしのページ: 普通のボタンとリンク。

生の Playwright (Tab キー操作 + `document.activeElement` 読み取り) で駆動し、
設計ドキュメントに記録する: ステップ 1 のアルゴリズムは 3 つすべてを正しく分類したか?
何が壊れたか? 完璧なコードに向けてではなく、検証済みの主張に向けてアルゴリズムのテキストを反復すること。

**確認**: 設計ドキュメントに「プロトタイプの知見」セクションがあり、
3 つのフィクスチャの実際に観察された分類を記録していること。
使い捨てスペックを削除すること (`git status` でクリーンなこと)。

### ステップ 3: 統合インターフェースを仕様化する

設計ドキュメントに、将来のビルドプランを機械的に書けるよう、以下を正確に仕様化する:

- API: `runKeyboardTrapCheck({ browser | page?, targetUrl?, contextOptions?,
  ...OutputLocationOptions })` — browser 対 page のオーナーシップを決定する
  (トラップされたフォーカスがコンテキストのリスタートを必要とする可能性があるため、
  フォーカスチェックと同様に `browser` 所有が有力。理由を明示すること)。
- 新しいルールレジストリエントリ: `a11y-skills/no-keyboard-trap`
  (violations) と `a11y-skills/keyboard-trap-needs-review` (incomplete) を提案し、
  WCAG 参照 `wcag212`、影響度 `critical` を付与する。
- `runFocusIndicatorCheck` との関係: Tab 駆動を共有することは、共通の tab-walk ヘルパーを
  抽出するか重複を許容するかを示唆する — どちらか一方を推奨し、コストを明記すること。
  またトラップされたページは現在のフォーカスチェックのループも壊すことに注意
  (トラップ内で `count + 10` 回 Tab する)。設計ではトラップチェックがフォーカスチェックを
  supersede するか、フィードするか、独立して実行するかを明記すること。
- デフォルトの閾値 (slack イテレーション、最大脱出試行回数) を `constants.ts` の
  名前付き定数として定義する。
- 未解決問題リスト — プロトタイプで確認できなかった事項
  (例: `inert` ベースのトラップ、shadow DOM のフォーカス委譲、iframe)。

**確認**: 設計ドキュメントに上記 5 つのサブセクションがすべて含まれていること。

### ステップ 4: 見積もりと推奨

ドキュメントを以下で締めくくる: 実際のチェックの工数見積もり (プロトタイプを根拠とした S/M/L)、
実際に観察した誤検知の範囲、および Go/No-go 推奨。プロトタイプで incomplete バケットが
支配的になることが示された場合 (大半が「人間のレビューが必要」と言うチェックは、
`skills/auditing-wcag/references/interactive-checks.md` の既存の手動インタラクティブ
チェックフローに対してコストを回収できないかもしれない)、「現時点では No-go」は許容される結論である。

## テストプラン

該当なし (スパイク)。ステップ 2 のプロトタイプ観察が根拠となる。

## 完了基準

以下をすべて満たすこと:

- [ ] `plans/006-result-keyboard-trap-design.md` が存在し、以下を含む: 操作的なトラップ定義、2.1.2 の規範的マッピング、3 つのフィクスチャすべてのプロトタイプ知見、統合インターフェース (5 サブセクション)、工数見積もりと Go/No-go
- [ ] `packages/a11y-audit/src/` 以下に変更なし (`git status`)
- [ ] 使い捨てスペックを削除済み
- [ ] `plans/README.md` のステータス行を更新済み

## STOP 条件

以下の場合は中断して報告すること:

- 2 回試みた後もプロトタイプがフィクスチャ間でフォーカス位置を確実に読み取れない
  (`document.activeElement` の読み取りが不安定) — アプローチ全体の再考が必要であり、
  フィクスチャをいじり続けることが解決策ではない。
- src/ にプロダクション品質のコードを書いていることに気づいた場合 — 誤った成果物であり、
  スパイクの出力はドキュメントである。

## メンテナンスメモ

- 設計ドキュメントは将来の「runKeyboardTrapCheck 実装」プランのインプットとなる。
  そのプランを書く者は、ここで引用したルールレジストリと constants のファイル行番号を
  再確認すること (Plans 004/005 によって移動している可能性がある)。
- 推奨が「Go」の場合、2.1.2 のカバレッジマトリクス行
  (`references/coverage-matrix.md:37`) と TODO-COVERAGE.md は
  ビルドプランによって EN・JA 両ファイルで更新されなければならない (AGENTS.md 同期ルール)。
