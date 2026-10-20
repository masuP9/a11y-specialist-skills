# Plan 030: focus-indicator-check で、フォーカスした要素が画面に出ているかを記録する

> **実行者への指示**: このプランを上から順に実行する。各検証コマンドを実行し、
> 期待どおりの結果を確かめてから次へ進む。「STOP 条件」に当たったら止まって報告し、
> 自分で工夫して先へ進めない。`plans/README.md` は更新しない。
>
> **差分確認（最初に実行）**:
> `git diff --stat 5e00f24..HEAD -- packages/a11y-audit/src/playwright/runFocusIndicatorCheck.ts packages/a11y-audit/src/detectors/media-playback.ts packages/a11y-audit/src/types.ts`
> 差分があれば「現状」の抜粋と実コードを見比べ、食い違えば STOP 条件として扱う。

## ステータス

- **Codex plan review**: 通過（2 巡目、2026-10-20、見送った low 0 件）
- **優先度**: P2
- **工数**: M
- **リスク**: MED（`media-playback` の切り取りの判定を共通にするので、その結果が変わりうる）
- **依存**: なし
- **カテゴリ**: feature
- **計画時点**: commit `5e00f24`, 2026-10-20
- **使う側**: 下流の利用側からの依頼（この repo に issue は立てない）。利用側はこの記録を 2.4.7 の根拠にし、そのあとで「完全に隠れた要素」を評価対象から外す。

## なぜ重要か

閉じたハンバーガーメニューのリンクに Tab で入れてしまうサイトがある。フォーカスは当たるが画面には何も出ない（2.4.7）。今の focus-indicator-check は、フォーカスの前後でスタイルが変わったか（`issues`）と、fixed / sticky の要素に覆われたか（`focusObscuredIssues`）は記録するが、**要素そのものが画面に出ているか**は記録しない。

実例（ある実在サイト、幅 393px、日本語・日本時間）:

- `header#gHeader`（`position: fixed`、`transform: matrix(1, 0, 0, 1, 0, 0)`）→ `nav.mainMenu`（`position: absolute`、高さ 86px、`overflow: hidden`）→ … → リンク（y=134〜542）。リンクは **祖先の枠の外にはみ出して切り取られている**。リンク自身は大きさがあり、`checkVisibility()` も真。
- ハンバーガーボタン（`button.hamburger-button`）を押すと `nav.mainMenu` が高さ 852px に広がり、リンクが見える。

## 現状

- `packages/a11y-audit/src/playwright/runFocusIndicatorCheck.ts`: 要素の記録は、ページに入れたスクリプト（`createFocusTrackerScript`）の `focusin` の処理 `onFocusIn`（1535 行目付近）の中で**同期的に**取り、`reportFocus` で Node 側へ送る。覆われた判定 `checkFocusObscured`（1288 行目〜、結果は `focusObscuredIssues`）も同じ処理の最後で同期的に呼ぶ。Node 側の `navigationSettleMs`（既定 50ms、`constants.ts`）は遷移を待つためのもので、記録の時点とは関係しない。要素ごとの記録は `details.allElements`。
- `packages/a11y-audit/src/detectors/media-playback.ts:215-286`: 祖先の `overflow` による切り取りを確かめる先例。
  - 祖先をたどる（`assignedSlot` → 親 → shadow root の host）。`overflow` が `visible` 以外の祖先の padding box（`getBoundingClientRect` + `clientLeft/Top` + `clientWidth/Height`）と要素の矩形が重ならなければ切り取られている。
  - 決めない（`null`）とき: 切り取る祖先がスクロールできる（`auto` / `scroll`）、要素と祖先の間に `position: fixed / absolute` の要素がある、祖先のどれかに `transform` / `scale` / `rotate` / `translate` がある、`clip-path` / `clip` がある。
  - **上の実例では、ヘッダーの `transform: matrix(1, 0, 0, 1, 0, 0)`（位置を変えない）のせいで「決めない」になる。** `clientLeft` などが `transform` を無視して困るのは拡大・回転のときで、平行移動だけなら `getBoundingClientRect` どうしの比較で位置は合う。

## 範囲

変更可:

- `packages/a11y-audit/src/playwright/runFocusIndicatorCheck.ts`、型（`types.ts` など、`FocusCheckDetails` の定義のある場所）
- 切り取りの判定を共通の関数に出す先（`packages/a11y-audit/src/utils/` など）と `media-playback.ts`
- テスト・fixture（`packages/a11y-audit/test/`、`test/fixtures/pages/focus-indicator/`）
- `packages/a11y-audit/README.md` / `README.ja.md`（出力の項目を説明している箇所があれば）、`packages/a11y-audit/CHANGELOG.md`

範囲外:

- 見えない要素を 2.4.7 の違反（`issues`）として数えること・レポートの文言（記録だけ足す。判定は使う側が決める）
- 版を上げるリリース（マージ後に別 PR で行う）

## 手順

1. `allElements` の各要素に `visibility: { visible: boolean | null; reason: "ancestor-overflow" | "ancestor-opacity" | "own-opacity" | "outside-viewport" | null }` を足す（名前は合わせて決めてよい。`reason` は `visible === false` のときだけ値を持つ）。
2. **測る時点**: 今の記録と同じく `onFocusIn` の中で同期的に測る（`checkFocusObscured` と同じ時点）。待ちは足さず、非同期の報告も作らない。フォーカスで始まる見た目の変化（`:focus-within` で 200ms の `transition` で開くメニューなど）を「見えない」と取り違えないため、次の判定の最初で「動いている途中」を `null` にする。
3. 判定（上から順に、最初に当たったもの）:
   - 要素自身か表示上の祖先（下の祖先のたどり方と同じ）に、`playState` が `running` の `Animation`（CSS transition / CSS animation / Web Animations。`el.getAnimations()` で取る）がある → `null`。測るのは矩形などを読んでスタイルを確定させた後にする（`focusin` の時点ではまだ transition が始まっておらず、`getAnimations()` が空になりうるため）。終わりのないアニメーションが祖先にあるページはいつも `null` になるが、それは許容する
   - 自身の `opacity` が 0 → `false` / `own-opacity`
   - `checkVisibility({ opacityProperty: true })` が偽（祖先が透明）→ `false` / `ancestor-opacity`
   - 祖先の `overflow` の切り取り: `media-playback.ts` の判定を共通の関数に出して使う（重複させない）。**平行移動だけの `transform`（`matrix(1, 0, 0, 1, x, y)`、`translate` だけ）は決めない理由にしない。** 拡大・回転・`scale` / `rotate`・3D は今までどおり決めない。確かに切り取られていれば `false` / `ancestor-overflow`、決められなければ `null`
   - 記録の時点の矩形が、ビューポートの左か上の外に完全に出ている（スクロールでも届かない）→ `false` / `outside-viewport`。右・下の外は、ブラウザがフォーカスでスクロールするので、記録の時点でビューポートと重ならなければ `false` としてよいかを fixture で確かめて決める
   - `clip-path` / `clip` がある → `null`
   - それ以外 → `true`
   - iframe の中の要素は、その文書の中だけで決める（外の iframe が見えるかは見ない）。shadow DOM は `assignedSlot` と host をまたいでたどる（先例と同じ）。
4. `media-playback.ts` を共通の関数に置き換え、平行移動だけの `transform` で結果が変わることを、そちらのテストにも 1 つ足す。
5. テスト（fixture を足し、1 つずつ。ページはテストの意図が読めるよう小さく書く）:
   - 実例の形（`position: fixed` で `transform: matrix(1, 0, 0, 1, 0, 0)` のヘッダー → `position: absolute`・`overflow: hidden`・高さ 86px の nav → はみ出したリンク）→ `false` / `ancestor-overflow`
   - 祖先が `opacity: 0` のボタン → `false` / `ancestor-opacity`
   - `opacity: 0` の checkbox を label の上に重ねた作り → `false` / `own-opacity`
   - `left: -9999px` で、`:focus` で `left: 0` に戻るスキップリンク → `true`
   - `left: -9999px` のままのリンク → `false` / `outside-viewport`
   - `:focus-within` で 200ms の `transition`（`height` / `opacity`）をかけて開くメニューのリンク → `null`（`false` にならないこと）
   - `transition: height 200ms` を指定してあるが、フォーカスでは開かない（閉じたまま）メニューのリンク → `false` / `ancestor-overflow`（transition の指定があるだけでは `null` にしないこと）
   - `overflow: auto` の祖先の外のリンク → `null`
   - `transform: scale(0.5)` の祖先の中で切り取られたリンク → `null`
   - ふつうのボタン → `true`
   - 実装の前に、新しいテストが「`visibility` が無い」理由で落ちることを確かめる。
6. CHANGELOG（Unreleased）に足す。README に `allElements` の項目の説明があれば足す（日本語版を先に、英語版をそろえる）。
7. 検証: `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` → すべて exit 0。CLI のスモーク（`--checks all`）が fixture でハングやエラーを起こさないこと。

## 完了条件

- [ ] `allElements` の全要素に `visibility` があり、手順 5 のテストが通る。
- [ ] 平行移動だけの `transform` の下でも切り取りを決められ、拡大・回転の下は `null` のまま。
- [ ] `media-playback` が共通の関数を使い、既存のテストと足したテストが通る。
- [ ] CHANGELOG を書き、検証コマンドがすべて通る。

## STOP 条件

- 手順 3 の「動いている途中」の判定を入れても、フォーカスで開くメニューのリンクが `false` になる（`getAnimations()` で transition が取れない）。
- `onFocusIn` で `visibility` を測ると、既存のテスト（`focusObscuredIssues`・`issues`・3.2.1 など）の期待を変えないと通らない。
- 共通にしたことで、`media-playback` の既存のテストの期待を変えないと通らない（平行移動だけの `transform` の分は除く）。
- 差分確認で「現状」と食い違う。

## 実施結果

2026-10-20 実装。主な判断と、プランからずれた点:

- **実例の前提は再現しなかった**: Chromium で Tab すると、ブラウザは `overflow: hidden` の nav の中をスクロールしてリンクを枠の中に入れる（`scrollTop` が 103 になり、リンクはヘッダーに重なって見える。一部はロゴに覆われる）。このため実例のメニューのリンクは `true` になる。同じページの、`opacity: 0` で隠した同意ダイアログのボタンは `false` / `ancestor-opacity` になる。切り取りの fixture は、スクロールでは届かない形（`overflow: clip`、高さ 0、上へのはみ出し）にした。
- **動いている途中の判定**: outline・影・色だけを動かす transition は無視する（フォーカス枠を transition で出すサイトで、全要素が `null` になったため）。
- **右・下の外**は判定しない（フォーカスでスクロールされる）。ルート / body の `overflow: clip` もビューポートでは `hidden` として扱われるので同じ。
- コードレビューと Codex 実装レビューを受けて、次も扱うようにした。ルート / body の overflow、`position: fixed`、rtl、縦書き（`null`）、向きごとの切り取り、拡大・回転の下での重なり（`null`）、`overflow-clip-margin`（`null`）、大きさ 0（`null`）、`display: contents` と inline の祖先は飛ばす。
- 直さなかったもの: ページの JS が `focusin` の後で開くメニューは閉じたまま測られうる、iframe 自身が見えるかは見ない（どちらも README に限界として記載）。祖先を何度もたどる処理はまとめていない（効果が小さいため）。
