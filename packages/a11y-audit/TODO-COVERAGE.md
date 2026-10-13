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

### 2.5.1 Pointer Gestures / 2.5.7 Dragging Movements - **部分実装** ✅
**概要**: 複数の指や軌跡に沿った操作（2.5.1）、ドラッグ（2.5.7）で動く機能に、1 点の操作での代わりがある

**実装**: `pointer-gesture-check`（`runPointerGestureCheck.ts`、`cdpEventListeners.ts` の `forSubtree` / `collectNodes`）
- 1 つのチェックで 2 つのルール（`a11y-skills/pointer-gestures`、`a11y-skills/dragging-movements`）に振り分け、候補はすべて `incomplete`
- CDP の `DOMDebugger.getEventListeners`（`depth: -1, pierce: true`）で文書全体の listener を 1 回で取り出し、`dragstart` / `drop`、同じ要素の「押す」+「動かす」、複数の指を見る handler（先頭 200 文字の文字列照合）を拾う。`draggable="true"` と部品のしるし（自作スライダー・並べ替え・カルーセル・地図）は文書と open shadow root の中を属性・selector で拾う
- 動かす listener だけの要素（hover 効果）と、20 種類以上の listener を持つ委譲先の要素は候補にしない（`details.delegationRoots` に記録し、ルールごとに 1 つのページ単位の「手で確かめて」node として報告）。`window` / `document` の複数の指・ドラッグの listener はページ単位の node
- 候補は基準ごとに 200 件、listener のある要素は 1000 個まで（超えた分は `candidateCounts` / `listenerNodesTruncated` で伝える）

**残る制限**:
- CDP は Chromium のみ。ほかのブラウザでは属性と部品のしるしだけで候補を出し、手で確かめる node を付ける
- 委譲で作られたドラッグ・ジェスチャ、押した後に `document` へ付ける move listener、iframe の中は見つからない
- `pointerId` を数えるなど、先頭 200 文字に現れない複数の指の判定は見分けられない
- 実際にドラッグ・スワイプして何かが動くかは確かめない（follow-up 候補）
- 1 点の操作での代わり・必須の操作という例外は人手で確認する
- listener の取り出しが止まらないページでは検査を飛ばして `incomplete` にし、一時プロパティ `window.__a11yPointerGesture_*` が残りうる

---

### 2.5.2 Pointer Cancellation - **部分実装** ✅
**概要**: 単一ポインタで操作する機能が、押し下げだけで実行されない（離したときに実行する・途中でやめられる・取り消せる、のいずれか。押し下げでの実行が必須なら例外）

**実装**: `pointer-cancellation-check`（`runPointerCancellationCheck.ts`、`cdpEventListeners.ts` の `forSubtree` / `collectNodes`）
- 操作できる要素（押す listener を持つもの・インラインの `onpointerdown` などを持つもの・ボタンやリンクなど）に、押し下げの合成イベント（`pointerdown`、続けて `mousedown`）だけを送って離さず、ページの移動・新しいウィンドウ・ダイアログ・フォーカスの移動・DOM の変化（`style` 属性を除く）を `activated-on-press` の候補にする。確認のあとは `pointercancel` を送る
- 押す listener だけを持ち、離す・クリックの listener が要素自身に無く、変化も見えなかった要素は `press-only-listener` の候補（見えない処理をしている可能性）。候補はすべて `incomplete`（`a11y-skills/pointer-cancellation`）
- 自前の BrowserContext を使い、移動したら作り直して試した要素を飛ばす。戻らない handler は 1 ステップ 5 秒で打ち切り、context ごと閉じてやり直し、その要素は未検査として `incomplete`
- 何もしなくても DOM が変わるページでは DOM の変化を根拠にしない（`details.domObservation`）
- 20 種類以上の listener を持つ委譲先の要素（`details.delegationRootCount`）と、`window` / `document` の押す listener（`details.pageListeners`）は、要素に帰属できないのでページ単位の「手で確かめて」node として報告し、`incomplete` にする

**残る制限**:
- 押し下げは合成イベント（`isTrusted === false`）で、`isTrusted` を確かめる処理には反応されない。`touchstart` は送らない
- 押した後は `pointercancel` を送るだけで、ハンドラが始めた処理は元に戻さない（前の要素の影響が後に出ることがある）
- `settleMs`（300ms）より後に表れる変化は見逃す。送信・保存を押し下げで行うページでは実際に送られる
- press-only の判定は要素自身の listener だけ（祖先の `click` は見ない）。CDP は Chromium のみ
- iframe の中・closed shadow root は見ない。押すのは 100 要素まで、予算 60 秒、やり直し 10 回
- 離したときの実行・中止・取り消しの手段と、押し下げでの実行が必須という例外は人手で確認する
- follow-up 候補: 実マウス（CDP `Input.dispatchMouseEvent`）で押して離す前にポインタを外へ動かし、途中でやめられるかまで確かめる。`touchstart` の合成

---

### 2.5.4 Motion Actuation - **部分実装** ✅
**概要**: 端末を振る・傾ける操作で動く機能に、画面の部品での代替があり、動きでの起動を止められる

**実装**: `motion-actuation-check`（`runMotionActuationCheck.ts`、`cdpEventListeners.ts`）
- CDP の `DOMDebugger.getEventListeners` で、主フレームの `window` / `document` に付いた
  `devicemotion` / `deviceorientation` / `deviceorientationabsolute` の listener を取り出し、
  1 件ごとに `incomplete` の候補として報告
- `window` に listener がある型には合成イベントを 10 回送り、DOM の変化数
  （`MutationObserver`）と遷移を証跡に添える。戻らない handler は
  `Runtime.terminateExecution` で打ち切る（`simulate: false` で送信しない）
- `document` にだけ付いた listener は、ブラウザが `window` にしか送らないため動かない可能性を注記

**残る制限**:
- CDP は Chromium のみ。ほかのブラウザでは取り出せず `incomplete`
- iframe の中の listener は見ない。利用者の操作の後に付く listener
  （iOS の許可ダイアログの後など）は見つからない
- Generic Sensor API（`Accelerometer` など）、カメラ・マイクでの動き検知は見ない
- 合成イベントは `isTrusted: false`。信頼されたイベントだけ受ける処理や canvas だけに描く
  処理では「変化なし」になる（listener がある限り候補には出る）
- 画面の部品による代替・動きでの起動を止める手段・例外の判断は人手で確認する

---

### 3.2.2 On Input - **部分実装** ✅
**概要**: 欄の値を変えただけで、利用者が前もって知らされないまま文脈が変わらない

**実装**: `change-on-input-check`（`runChangeOnInputCheck.ts`）
- 主フレームの `select` / radio（グループごと）/ checkbox / テキスト系の `input` と
  `textarea` の値を 1 つずつ変え（テキスト系は固定の値を入れて blur して `change` を起こす）、
  主フレームの移動・新しいウィンドウ・フォーカスの移動・ダイアログを記録して
  `incomplete` の候補として報告
- 移動したら新しい context でやり直し、試した欄を飛ばして残りを続ける
- 値はイベントを起こさずにプロパティで戻す

**残る制限**:
- iframe・shadow root の中の欄、`contenteditable`、`type="range" / "color" / "file"`、
  ARIA だけの独自部品は見ない
- 値は 1 種類（select は別の option 1 つ、テキストは固定値 1 つ）だけ試す。特定の値でだけ
  起きる変化は見落とす
- 戻すのは欄の値だけで、handler がページに加えた変更は戻らない。前の欄の変更が後の欄の
  結果に影響しうる
- `settleMs` を過ぎてから起きる変化（通信の後の移動など）と、内容の大きな変化は記録しない
- 実ページで値を変え `change` を起こすため、自動保存・自動送信のあるページでは通信が起きうる
- `date` / `time` / `range` / `color` / `file` などの type は集めない
- id が読み込みごとに変わるページでは、やり直しのたびに同じ欄を再び試し、同じ finding が
  重複しうる（やり直しは `CHANGE_ON_INPUT_MAX_RESTARTS` 回まで）
- 前もっての説明があるかは判断できず、人手で確認する
### 3.3.8 Accessible Authentication (Minimum) - **部分実装** ✅
**概要**: 認証で、記憶・書き写し・パズルの解決などの認知機能テストを、別の手段や支援の仕組みなしに要求しない

**実装**: `accessible-authentication-check`（`runAccessibleAuthenticationCheck.ts`）
- メイン文書のパスワード欄・確認コード欄・ユーザー名欄と、CAPTCHA らしき要素を集める
- パスワード・確認コード欄に短いテキストをキーボードで貼り付け、入らなければ
  `a11y-skills/auth-paste-blocked`（`incomplete`）。値そのものは記録せず、貼ったテキストとの比較だけを残す
- 認証の欄の `autocomplete="off"`・欄の種類に合わない値を `a11y-skills/auth-autocomplete`
  （`incomplete`）。属性が無い欄と `on` だけの欄は報告しない（名前が 1.3.5 のパターンに当たる欄は `autocomplete-audit` が報告しうる）
- CAPTCHA らしき要素（名前の一致。入れ子は外側の 1 件）を `a11y-skills/auth-captcha`（`incomplete`）
- 貼り付けの実測は呼び出し側の context にクリップボードの権限を付け、クリップボードを上書きし、
  補助ページを一時的に開く（`paste: false` で止める）。戻らない handler は CDP で打ち切る

**残る制限**:
- iframe・shadow root の中の欄は見ない。ログインボタンを押してから出るフォームは、開いた状態の page を渡す必要がある
- 貼り付けの実測は Chromium で確かめた方式。見えない・編集できない欄は実測しない
- 確認コード欄の見つけ方は名前の推定を含み、1 桁ずつに分かれた欄は 1 つ目だけが当たることが多い
- CAPTCHA は名前の一致で探すため、名前に `captcha` を含まない独自実装は見つからない
- 別の手段（パスキー・SSO・メールのリンク）の有無、自動入力などの支援の仕組みが使えるか、
  CAPTCHA が物の認識・本人が用意した内容の識別にとどまるかは人手で確認する

### 2.4.3 Focus Order - **部分実装** ✅
**概要**: フォーカス順序が意味と操作性を損なわない

**実装**: `focus-order-check`（`runFocusOrderCheck.ts`、純粋関数 `analyzeFocusOrder`）
- メイン文書で Tab を押して一巡し、要素の位置を並べて、上へ戻る・同じ行で逆向き・遠くへ跳んで戻る移動を
  `a11y-skills/focus-order-visual`（`incomplete`）で報告
- 開くボタン（`aria-haspopup="dialog"` など）で Enter・Escape を押し、モーダルを開いたときにフォーカスが
  中へ移らない・閉じたときに開いたボタンへ戻らない場合を `a11y-skills/focus-order-dialog`（`incomplete`）で報告

**残る制限**:
- 見た目の順は単純な規則での推定。カード型の格子・横スクロール・縦書きは誤りうる
- fixed / sticky の要素と iframe の中の順は比べない。shadow root は開いているものだけ
- 属性の無いボタンで開くダイアログは見ない。モーダルの中の Tab の巡回（2.1.2 と重なる）も見ない
- ダイアログの確認はページを読み直して Enter・Escape を押すため、送信や遷移を兼ねるボタンはリクエストを飛ばしうる（関数 API の `maxDialogTriggers: 0` でどの開くボタンも押さなくなる。CLI は常に最大 10 件を試す）
- 見た目の順から外れても意味が保たれていれば満たすので、すべて人手で確認する

---

### 1.4.11 Non-text Contrast - **部分実装** ✅
**概要**: 部品の境界とグラフィカルオブジェクトが隣り合う色と 3:1 以上のコントラストを持つ

**実装**: `non-text-contrast-check`（`runNonTextContrastCheck.ts`、色の純粋関数 `utils/color.ts`）
- 入力欄・`textarea`・`select`・チェックボックス・ラジオ・スイッチの枠と塗りを、祖先の背景から合成した外側の色と比べ、
  3:1 未満・枠も塗りも無いものを `a11y-skills/non-text-contrast-boundary`（`incomplete`）で報告
- 文字のないボタンのアイコン（インライン SVG の `fill` / `stroke`、`::before` / `::after` の文字色）を背景と比べ、
  3:1 未満を `a11y-skills/non-text-contrast-icon`（`incomplete`）で報告
- 背景画像・グラデーション・opacity・filter・背景なしの絶対配置・画像のアイコンなど色が決まらないものは
  `undetermined` として人手に回す

**残る制限**:
- 読み込んだときの見た目だけ。ホバー・フォーカス・選択済みなどの状態ごとの見た目は見ない
- 外側の色は祖先の背景から決める。`z-index` や負のマージンによる重なりは見ない
- `box-shadow` / `outline` / `border-image` / 疑似要素で描いた枠は測らない。UA が描く既定のチェックボックス・ラジオは例外として測らない
- 部品の中の部分（チェックの印・つまみ）、グラフ・図、iframe・shadow root の中は見ない。部品は 300 個まで
- 部品の範囲が別の手がかり（配置・文字）で分かる場合は満たすので、すべて人手で確認する

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
| 1.4.11 Non-text Contrast | `non-text-contrast-check`（部分） ✅ |
| 2.4.3 Focus Order | `focus-order-check`（部分） ✅ |
| 2.4.1 Bypass Blocks | `automated-checks.md` |
| 2.4.11 Focus Not Obscured (Minimum) / 2.4.12 (Enhanced) | `focus-indicator-check.ts` ✅ |
| 2.5.1 Pointer Gestures | `pointer-gesture-check`（部分） ✅ |
| 2.5.2 Pointer Cancellation | `pointer-cancellation-check`（部分） ✅ |
| 2.5.7 Dragging Movements | `pointer-gesture-check`（部分） ✅ |
| 2.5.3 Label in Name | `automated-checks.md` |
| 2.5.4 Motion Actuation | `motion-actuation-check`（部分） ✅ |
| 2.5.8 Target Size (Minimum) | `target-size-check.ts` ✅ |
| 3.1.1 Language of Page | axe-core + `automated-checks.md` |
| 3.2.1 On Focus | `focus-indicator-check.ts` ✅ |
| 3.2.2 On Input | `change-on-input-check`（部分） ✅ |
| 3.3.7 Redundant Entry | `redundant-entry-check`（部分） ✅ |
| 3.3.8 Accessible Authentication (Minimum) | `accessible-authentication-check`（部分） ✅ |

---

## 参考リンク

- [WCAG 2.2 Understanding Docs](https://www.w3.org/WAI/WCAG22/Understanding/)
- [ACT Rules Community](https://www.w3.org/WAI/standards-guidelines/act/rules/)
- [axe-core Rules](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
