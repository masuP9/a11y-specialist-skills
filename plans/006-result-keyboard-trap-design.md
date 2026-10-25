# Plan 006 結果: キーボードトラップ (WCAG 2.1.2) 自動チェック 設計スパイク

> **ステータス**: 設計スパイク完了 — Go 推奨
> **設計時点**: commit `359289c`, 2026-06-12
> **担当**: スパイク executor (claude-sonnet-4-6)

---

## 1. トラップの操作的定義とアルゴリズム

### 1.1 基本アルゴリズム

1. **フォーカス可能要素の列挙**  
   `FOCUSABLE_SELECTOR` (既存 `constants.ts` のセマンティクスをそのまま流用) を使って
   ページ内のフォーカス可能要素数 `count` を取得する。

2. **Tab ウォーク**  
   `N = count + KEYBOARD_TRAP_SLACK` 回 Tab を前進させ、各ステップで
   `document.activeElement` の `(selector, tagName, name)` タプルを記録する。
   `KEYBOARD_TRAP_SLACK` はデフォルト値を `constants.ts` に定数として定義する (推奨値: `10`)。

3. **トラップ候補の検出**  
   ウォーク列末尾の連続する `KEYBOARD_TRAP_SLACK + 1` ステップがすべて同一の
   要素集合 S に属し、かつページ全体に S 以外のフォーカス可能要素が存在する場合、
   S を「トラップ候補」と判定する。

4. **脱出パスの試行**  
   各トラップ候補に対して以下の脱出パスを順に試行し、効果を記録する:
   - **Escape キー**: 押下後に `document.activeElement` が S 外に移動するか、
     またはトラップコンテナが非表示になるか
   - **Shift+Tab**: 押下後に `document.activeElement` が S 外に移動するか
   - **可視のクローズアフォーダンス**: アクセシブル名が `/close|閉じる|dismiss/i` に
     マッチする `button` または `[role=button]` を `querySelector` で探し、`click()` する

### 1.2 分類とWCAG 2.1.2 規範的根拠

WCAG 2.1.2 Success Criterion の原文:

> "If keyboard focus can be moved to a component of the page using a keyboard interface,
> then focus can be moved away from that component using only a keyboard interface,
> and, if it requires more than unmodified arrow or tab keys, the user is advised
> of the method for moving focus away."

この「方法を告知されている場合」という例外条項が、`incomplete` バケットの根拠となる。

| 分類 | 条件 | WCAG 根拠 |
|------|------|----------|
| `violations` | トラップ候補が検出され、上記のどの脱出パスも機能しない | キーボードのみでフォーカスを移動できない — 例外適用不可 |
| `incomplete` | 脱出パスは存在するが、非慣用的または文書化されていないパスのみ (例: Shift+Tab のみで脱出できるが、`role=dialog+aria-modal=true` でない) | 「方法を告知されている」か人間が判断する必要がある |
| `passes` | `role=dialog` + `aria-modal=true` コンテナで Escape が機能する | 正しいモーダルパターン — ARIA Authoring Practices の推奨実装であり、告知は暗黙的に成立 |

---

## 2. プロトタイプの知見

### 2.1 実行環境

- Playwright v1.60.0 / Chromium 148.0.7778.96
- インラインフィクスチャ (`page.setContent()` による `data:` 相当)
- 生の Tab キー操作 + `document.activeElement` 読み取り

### 2.2 フィクスチャ別の観察結果

#### フィクスチャ 1: 正真正銘のトラップ (violation 期待)

**実装**: `focusout` ハンドラがコンテナ外へのフォーカス移動を検知すると
即座に最初の子要素 (`#trap-a`) に再フォーカスする。Escape 処理なし。

**観察**:
- `total focusable: 5` (コンテナ外に 2 要素、コンテナ内に 3 要素)
- `walk` (15 ステップ): `["#outside-before","#trap-a","#trap-b","#trap-c","#trap-a","#trap-b","#trap-c", ...]`
  — `#outside-before` を通過後、`#trap-a` に入ると以降はコンテナ内を無限ループ
- `stuckInTrap (last 5 steps): true`
- Escape 押下後: `activeElement` は `#trap-b` のまま → `escapeWorked: false`
- Shift+Tab 後: `activeElement` は `#trap-a` (コンテナ内) → `shiftTabWorked: false`
  (**注意点**: `focusout` 再フォーカス機構が Shift+Tab の逆方向移動も捕捉してしまうため、
  Shift+Tab 脱出は機能しない。これは設計アルゴリズムへの重要な示唆)
- **実測分類**: `VIOLATION` ✓ (期待通り)

#### フィクスチャ 2: 正しいモーダル (pass 期待)

**実装**: `role=dialog aria-modal=true`、keydown ハンドラでフォーカスを 3 要素内でラップ、
Escape でモーダルを閉じてオープナーにフォーカスを返す。

**観察**:
- モーダル open 後、`total focusable: 5` (DOM 内のすべての button を含む)
- `walk` (15 ステップ): `["#modal-second","#close-btn","#modal-first","#modal-second", ...]`
  — モーダル内 3 要素を循環 (`stuckInModal: true`)
- `activeBeforeEscape: modal-first`
- Escape 押下後: `modal hidden: true`、`activeAfterEscape: open-modal`
- `role=dialog+aria-modal=true: true`
- **実測分類**: `PASS (correct modal)` ✓ (期待通り)

**設計への示唆**: ウォーク中に `stuckInTrap` が真でも、Escape が機能し、
かつコンテナが `role=dialog+aria-modal=true` を持つ場合は `passes` として処理する。
Escape 後の `document.activeElement` がコンテナ外に移動したこと (または
コンテナが非表示になったこと) を確認することで判定可能。

#### フィクスチャ 3: トラップなし (pass 期待)

**実装**: 普通のボタン、input、a 要素が直列に並んだページ。

**観察**:
- `total focusable: 5`
- `walk` (15 ステップ): 5 要素を 3 周循環 → `uniqueSelectors: 5`
- `all focusable elements visited (no trap): true`
- **実測分類**: `PASS (no trap)` ✓ (期待通り)

### 2.3 アルゴリズム補正点

プロトタイプで判明した当初設計からの修正点:

1. **Shift+Tab 脱出の信頼性**: `focusout` ベースのトラップでは Shift+Tab も捕捉される。
   Shift+Tab が脱出パスとして機能するかどうかは、実際に試行して確認する必要がある
   (期待値ベースの判定では不十分)。

2. **ウォーク開始位置**: `page.setContent` 後、初回 Tab は `document.body` からではなく
   最初のフォーカス可能要素の直前から始まる。`walk[0]` は常に最初の到達可能要素であり、
   ウォーク全体としてカウントは正確だった。

3. **フィクスチャ 2 の `walk[0]` が `#modal-first` ではなく `#modal-second`**:
   モーダルが click で開かれ、`modal-first` に `focus()` した直後に Tab ウォークが開始
   されるため、最初の Tab で `#modal-second` に移動した。実装では `page.click()` 等で
   トリガーしてからウォークを行う場合、開始位置の管理が必要。

4. **修正不要だった点**: スラック値 `5` でフィクスチャ 1 のトラップを正確に検出できた。
   本実装では `KEYBOARD_TRAP_SLACK = 10` (= `EXTRA_TAB_ITERATIONS` と同値) を推奨する。

---

## 3. 統合インターフェース仕様

### 3.1 API

```typescript
runKeyboardTrapCheck(options: RunKeyboardTrapCheckOptions): Promise<KeyboardTrapCheckResult>
```

```typescript
interface RunKeyboardTrapCheckOptions {
  /** Playwright Browser インスタンス (browser 所有モデル — 後述) */
  browser: Browser;
  /** 監査対象 URL */
  targetUrl?: string;
  /** browser.newContext() に転送するオプション */
  contextOptions?: BrowserContextOptions;
  /** OutputLocationOptions (resultFile, screenshotFile など) */
  ...OutputLocationOptions;
  /**
   * トラップ検出のスラック値 (デフォルト: KEYBOARD_TRAP_SLACK)
   * フォーカス可能要素数 N に対して N + slack 回 Tab する
   */
  slack?: number;
  /**
   * 脱出試行ごとの待機 ms (デフォルト: KEYBOARD_TRAP_ESCAPE_SETTLE_MS)
   */
  escapeSettleMs?: number;
}
```

**`browser` 所有モデルを選択する理由**:
トラップされたフォーカスを持つページは、`runFocusIndicatorCheck` と同様に
コンテキストの再起動が必要になる可能性がある。`page` を受け取る API では
トラップ発生時にページを閉じて新しいコンテキストを作ることができない。
`browser` を受け取ることで、ハングしたコンテキストを `context.close()` して
新たに `browser.newContext()` できる。これはフォーカスチェックが採用した
同一の設計判断であり、一貫性の観点からも妥当。

### 3.2 新規ルールレジストリエントリ

```typescript
// packages/a11y-audit/src/utils/rule-registry.ts に追加予定
'no-keyboard-trap': {
  id: 'a11y-skills/no-keyboard-trap',
  sc: ['2.1.2'],
  tags: ['a11y-skills', 'wcag2a', 'wcag212'],
  impact: 'critical',
  scope: 'page',  // トラップはページ全体のコンテキストで報告
  description: 'Ensure keyboard focus can be moved away from all components',
  help: 'Keyboard users must be able to navigate away from any focused component',
  helpUrl: `${UNDERSTANDING}/no-keyboard-trap.html`,
  classification: 'violation',
},
'keyboard-trap-needs-review': {
  id: 'a11y-skills/keyboard-trap-needs-review',
  sc: ['2.1.2'],
  tags: ['a11y-skills', 'wcag2a', 'wcag212'],
  impact: 'critical',
  scope: 'page',
  description:
    'Focus appears confined; verify whether escape path is documented or discoverable',
  help: 'Verify that users can escape focus-confined areas via documented keyboard methods',
  helpUrl: `${UNDERSTANDING}/no-keyboard-trap.html`,
  classification: 'incomplete',
},
```

`impact: 'critical'` の根拠: キーボードトラップはキーボードユーザーがページ操作を
完全に失う致命的な障壁であり、`serious` より重篤。なお axe-core には 2.1.2 の
自動チェックルールは存在しない (自動化不能として扱われている) — だからこそ
本チェックに独自実装の価値がある。

### 3.3 `runFocusIndicatorCheck` との関係

**推奨: 独立した並列実行 (コードの重複を許容)**

理由:
- フォーカスチェックとトラップチェックは実行上の前提条件が異なる。
  フォーカスチェックはナビゲーション発生時にコンテキストをリスタートするが、
  トラップチェックはトラップ発生時にコンテキストを破棄して検出を終了 (またはスキップ) する。
  制御フローが根本的に異なるため、共通ヘルパーの抽出は設計を複雑にする。
- **現状の問題**: トラップされたページでは `runFocusIndicatorCheck` の
  `count + EXTRA_TAB_ITERATIONS` ループがトラップコンテナ内に無限に閉じ込められる。
  フォーカスチェックはナビゲーション発生をトリガーとしてリスタートするが、
  トラップはナビゲーションを発生させないため、リスタートが起きない。
  結果として、フォーカスチェックはトラップコンテナ内の 3 要素しか報告しない誤検知が生じる。
- **推奨する実行順序**: トラップチェックを先に実行し、トラップが検出された場合は
  その要素集合を `skipSelectors` 相当のリストとして返す。後続のフォーカスチェックは
  そのリストを受け取ってトラップ要素をスキップできる (ただしこれは将来の最適化として扱い、
  現時点では独立実行で十分)。
- Tab ウォークの共通化は将来の抽出候補だが、今回のスパイクでは **重複を許容して
  独立実装することを推奨する**。共通化のコストは実装工数 M の 30% 程度と見積もる。

### 3.4 `constants.ts` に定義すべき定数

```typescript
// packages/a11y-audit/src/constants.ts に追加予定

/**
 * キーボードトラップ検出のスラック値
 * フォーカス可能要素数 N に対して N + KEYBOARD_TRAP_SLACK 回 Tab を実行する
 */
export const KEYBOARD_TRAP_SLACK = 10;

/**
 * トラップ候補の判定に使うウィンドウサイズ
 * 末尾 KEYBOARD_TRAP_WINDOW ステップがすべてトラップ内ならトラップ候補と判定
 * KEYBOARD_TRAP_SLACK と同値で問題ないが、意図を明示するため別定数とする
 */
export const KEYBOARD_TRAP_WINDOW = 10;

/**
 * 各脱出パス試行後の待機時間 (ms)
 * Escape キーや Shift+Tab 後のフォーカス移動アニメーション/処理を待つ
 */
export const KEYBOARD_TRAP_ESCAPE_SETTLE_MS = 200;

/**
 * 1 ページあたりの最大脱出試行回数
 * トラップ候補が複数あるページでの上限
 */
export const KEYBOARD_TRAP_MAX_ESCAPE_ATTEMPTS = 3;
```

### 3.5 未解決問題

以下はプロトタイプで確認できず、実装プランで別途調査が必要:

1. **`inert` 属性ベースのトラップ**  
   `inert` を使うとその要素は `FOCUSABLE_SELECTOR` でヒットしないため、
   カウントにも Tab ウォークにも現れない。`inert` の付与/除去で動的にトラップを
   作るパターンへの対応は別途検討が必要。

2. **Shadow DOM のフォーカス委譲**  
   `shadowRoot` 内のフォーカス可能要素は `document.querySelectorAll(FOCUSABLE_SELECTOR)`
   では列挙されない。Shadow DOM を含むコンポーネント内のトラップは検出できない可能性がある。

3. **`<iframe>` 内のトラップ**  
   クロスオリジン iframe 内のフォーカス状態は `document.activeElement` では取得できない。
   同一オリジン iframe の場合でも、フォーカスが iframe に入ると
   ページレベルの `document.activeElement` は `<iframe>` 要素そのものを返す。
   iframe 内トラップの検出には別途アプローチが必要。

4. **動的コンテンツ (SPA)**  
   ルーティングによってフォーカス可能要素数が変化するページでは、
   ウォーク中に `count` が変わる可能性がある。
   `initFocusTracker` 相当の init script でスナップショットを固定する方式を検討すること。

5. **脱出パスの「告知」の自動判定**  
   WCAG 2.1.2 は「方法を告知されていれば」非標準パスも許容する。
   「告知」の有無の自動判定は現在の設計では困難であり、`incomplete` バケットに
   委ねることで対処する。

---

## 4. 工数見積もりと推奨

### 4.1 工数見積もり: **M**

| 作業 | 根拠 |
|------|------|
| Tab ウォーク実装 | フォーカスチェックのループ (約 30 行) を参考に独立実装。複雑さは同等。 |
| トラップ検出ロジック | スラックウィンドウ比較。プロトタイプで 20 行以内に実装可能と確認。 |
| 脱出パス試行 (3 パス) | Escape + Shift+Tab + クローズアフォーダンス click。各 10 行程度。 |
| コンテキスト管理 | `runFocusIndicatorCheck` のパターンをコピーして適合。 |
| axe-format 統合 | `normalizeFocusCheck` 相当の `normalizeKeyboardTrapCheck` を追加。既存パターンで 50 行程度。 |
| ルールレジストリ追加 | 2 エントリ (セクション 3.2 を転記)。 |
| test-entry ラッパー | 既存 13〜23 行のパターンをコピー。 |
| package.json exports 追加 | 1 行。 |
| テスト (smoke) | 3 フィクスチャ (プロトタイプを流用)。 |

**合計**: フォーカスチェック実装の 60〜70% の工数。M (3〜5 日) が妥当。

### 4.2 誤検知の範囲

プロトタイプで実測した誤検知:
- **0/3 フィクスチャで誤検知**: 正しいモーダル (フィクスチャ 2) は `passes` に分類された。
- **`incomplete` バケットへの該当ケース**: 今回のプロトタイプには `incomplete` に
  分類されるフィクスチャを用意しなかったが、設計上 `incomplete` は以下のケースを対象とする:
  - `role=dialog+aria-modal=true` なしでフォーカスを制限するカスタムコンポーネント
    (Escape は機能するが ARIA 属性がない)
  - Shift+Tab のみで脱出できるが Escape は機能しないケース

- **`incomplete` の割合予測**: 実サイトでは `role=dialog+aria-modal=true` を持たない
  カスタムモーダル (日本のウェブサイトではよく見られる) が多く、`incomplete` が
  `violations` より多くなる可能性がある。ただし `violations` (Escape も Shift+Tab も
  クローズアフォーダンスも機能しない真のトラップ) は比較的レアであり、
  チェックの主要価値は `incomplete` での人間レビュー誘導にある。

### 4.3 `interactive-checks.md` の既存手動フローとの比較

`skills/auditing-wcag/references/interactive-checks.md` の Keyboard セクションには:
> 2.1.2 | Escape all focus areas | logs | Keyboard trap exists

とあるだけで、詳細な手順がない。本チェックを実装することで:
- 真のトラップ (`violations`) は自動検出でき、手動レビューを不要にする。
- `incomplete` ケースは従来の手動チェックに集約でき、「疑わしいケースのリスト」として
  手動レビューの優先度付けに使える。

**結論**: `incomplete` が支配的になっても、ゼロから手動で全ページを確認するよりは
コストを回収できる。

### 4.4 Go/No-go 推奨

**推奨: Go**

根拠:
1. プロトタイプで 3/3 フィクスチャを正しく分類できた — アルゴリズムの実現可能性を確認。
2. Escape パスの試行が `violations` と `passes` を明確に分離できることを実証。
3. 既存 `runFocusIndicatorCheck` との構造的類似性が高く、コードの書き方に迷いが少ない。
4. 2.1.2 はキーボードユーザーにとって最も致命的な失敗 (ページを操作できなくなる) であり、
   自動化の優先度が高い。
5. `incomplete` バケットが多くなる場合でも、手動レビューの「絞り込み」として価値がある。

**条件付き注意点**:
- Shadow DOM および iframe 内のトラップは検出できない (未解決問題 2, 3)。
  実装プランでスコープを明示し、制限事項として文書化すること。
- 実サイトでの誤検知率は本スパイクでは未確認。
  実装後に実サイト数件での smoke テストを推奨する。
