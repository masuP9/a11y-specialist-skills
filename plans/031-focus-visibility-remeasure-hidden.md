# Plan 031: focus-indicator-check で、見えないと測った要素を待ちの後にもう一度測る

- **Issue**: https://github.com/masuP9/a11y-specialist-skills/issues/117

> **実行者への指示**: このプランを上から順に実行する。各検証コマンドを実行し、
> 期待どおりの結果を確かめてから次へ進む。「STOP 条件」に当たったら止まって報告し、
> 自分で工夫して先へ進めない。`plans/README.md` は更新しない。
>
> **差分確認（最初に実行）**:
> `git diff --stat f43918c..HEAD -- packages/a11y-audit/src/playwright/runFocusIndicatorCheck.ts packages/a11y-audit/src/types.ts`
> 差分があれば「現状」の抜粋と実コードを見比べ、食い違えば STOP 条件として扱う。

## ステータス

- **Codex plan review**: 未
- **優先度**: P1（利用側で 2.4.7 が誤って不適合になる）
- **工数**: S〜M
- **リスク**: LOW〜MED（`visible: false` の要素だけ結果が変わる）
- **依存**: Plan 030（0.16.0 で出た `visibility`）
- **カテゴリ**: bug
- **計画時点**: commit `f43918c`, 2026-10-20

## なぜ重要か

スクロールで節を出す作り（AOS や IntersectionObserver で、祖先を `opacity: 0` から `1` にする）の中のリンクに Tab が当たると、ブラウザがそこまでスクロールし、ページの `scroll` / IntersectionObserver の処理がクラスを付けて節を出す。その処理はフォーカスより後（次のフレーム以降）に動くので、`onFocusIn` の時点では祖先がまだ `opacity: 0` で、transition もまだ始まっていない。そのため「動いている途中なら `null`」にも当たらず、`visible: false` / `reason: "ancestor-opacity"` と記録される。

利用側はこの記録を「フォーカスが当たるのに画面に出ていない」（2.4.7）の根拠にするので、この作りのサイトは誤って不適合になる。

## 現状

- `packages/a11y-audit/src/playwright/runFocusIndicatorCheck.ts`
  - `measureVisibilityUnsafe`（1548 行目付近）: 要素と表示上の祖先に動いている（見た目を変える）アニメーションがあれば `null`、自身の `opacity: 0` → `own-opacity`、祖先の `opacity: 0` → `ancestor-opacity`、以下 overflow・ビューポート外の判定。
  - `onFocusIn`（1664 行目付近）が `visibility: measureVisibility(el)` を同期的に 1 回だけ測り、`reportFocus` で Node 側へ送る。
  - Node 側は Tab のたびに `page.waitForTimeout(navigationSettleMs)`（608 行目付近、既定 50ms）で待つ。この待ちは遷移を見るためのもので、`visibility` には使っていない。
  - `reportFocus` の受け口（391 行目付近）が `focusHistory` と `focusReports`（`documentToken` つき）に積む。
- README（`packages/a11y-audit/README.ja.md:510` / `README.md:622`）に「ページの JS が `focusin` の後（タイマー・次のフレームなど）で開くメニューは、閉じたまま測られることがある」と限界として書いてある。今回これを直す。

## 方針

`visible: false` と測った要素だけ、Tab のあとの既存の待ち（`navigationSettleMs`）が終わった時点でもう一度測り、記録を置き換える。待ちは足さない（見えない要素が多いページでも遅くならない）。

- もう一度測った結果が `true` → `true`、動いている途中 → `null`、まだ `false` → `false`（`reason` は 2 回目のもの）。
- `visible` が `true` / `null` の要素は測り直さない（今の結果を変えない）。

## 範囲

変更可:

- `packages/a11y-audit/src/playwright/runFocusIndicatorCheck.ts`
- テスト・fixture（`packages/a11y-audit/test/`、`test/fixtures/pages/focus-indicator/`）
- `packages/a11y-audit/README.ja.md` / `README.md`（限界の記述）、`packages/a11y-audit/CHANGELOG.md`

範囲外:

- `measureVisibilityUnsafe` の判定そのものの変更
- 待ちを増やすこと、新しいオプション
- 版を上げるリリース（マージ後に別 PR）

## 手順

1. **テストを先に足す**（fixture は小さく、1 つずつ）。実装の前に、1 つ目が `ancestor-opacity` で落ちることを確かめる。
   - `visibility-scroll-reveal.html`: 先頭に `button#first`、高さのある余白（例: `height: 150vh`）の下に節（高さ 200px、`opacity: 0; transform: translateY(40px); transition: opacity 300ms, transform 300ms`、クラスで `opacity: 1; transform: none`）。`scroll` の処理で「`scrollY + innerHeight > 節の top + 100`」ならクラスを付け、そうでなければ外す（AOS の `once: false` を真似る）。中に `a#more`「Read more」。→ `#more` の `visible` が `false` でない（`true` か `null`）。
   - `visibility-reveal-observer.html`: 同じ形を IntersectionObserver で出す版。→ `false` でない。
   - フォーカスしても出ない作り（既存の `visibility-ancestor-opacity.html` が当たるならそれで足りる。祖先が `opacity: 0` のままのポップアップのボタン）→ `false` / `ancestor-opacity` のまま。既存テストが通り続けることで確かめる。
2. **ページ側**（`createFocusTrackerScript`）:
   - `onFocusIn` で `false` と測った要素を、文書ごとの番号（今の `focusId`）をキーにした `Map<number, Element>` に覚える（shadow DOM の要素も持てるよう要素そのものを持つ）。
   - `reportFocus` の送る中身に、その番号（例: `localId`）を足す。Node 側で `documentToken` と同じく取り除き、出力の形は変えない。
   - `window` に「番号を受け取り、覚えた要素を `measureVisibility` で測り直して返す」関数を足す（見つからなければ `null`）。測り直したら Map から消す。
3. **Node 側**: `waitForTimeout(navigationSettleMs)` の後、遷移が無かったとき（3.2.1 の分岐の後）に、この Tab で増えた記録のうち `visibility.visible === false` のものについて、`documentToken` が一致するフレームでその関数を呼び、返った値で `visibility` を置き換える。フレームが無い・`evaluate` が失敗した・`null` が返ったときは元の記録のまま。
   - `screenshotDiff` の比較より前に置き換えるかは、今の処理の順を見て決める（どちらでも `visibility` の値には影響しないはず）。
4. README（日本語版を先に、英語版をそろえる。`visibility` の項の冒頭「フォーカスを受けた瞬間に同期的に測った」も合わせて直す）の限界の記述を直す: 「見えないと測った要素は、Tab のあとの待ち（`navigationSettleMs`）の後にもう一度測る。それより遅れて出す作りは見えないと記録されうるので、そのときは `navigationSettleMs` を上げる」。
5. CHANGELOG（Unreleased、Fixed）に足す。
6. 検証: `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` → すべて exit 0。CLI のスモーク（`--checks all`）が fixture でハングやエラーを起こさないこと。

## 完了条件

- [ ] スクロールで出す節（scroll 版・IntersectionObserver 版）の中のリンクが `false` にならない。
- [ ] フォーカスしても出ない作り（祖先が `opacity: 0` のまま）は `false` / `ancestor-opacity` のまま。
- [ ] 既存の `visibility-*` のテストの期待を変えずに通る。
- [ ] README・CHANGELOG を直し、検証コマンドがすべて通る。

## STOP 条件

- 既定の `navigationSettleMs`（50ms）の後でも、scroll 版の fixture の祖先がまだ `opacity: 0` のまま（transition も始まっていない）。待ちを足すかどうかは決め直す。
- 既存の `visibility-*` や 3.2.1 のテストの期待を変えないと通らない。
- 差分確認で「現状」と食い違う。
