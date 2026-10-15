# Plan 021 結果: 遅い検査の時間内訳と、検査ごとの縮め方の判断

- **対応プラン**: `plans/021-spike-slow-check-timing.md`
- **性質**: 計測スパイク。`packages/a11y-audit/src/` と `test/` は変更していない。
- **計測日**: 2026-10-16
- **索引**: `plans/README.md` は git 追跡外のため、この commit では更新していない（レビュアーが管理）。

## 要約

- 8 検査中 7 検査で、時間の大半は「決まった秒数を待つ固定待ち」だった（5 ページ合計で 62〜89%。うち auto-play-detection の 76% は定義上の 6 秒）。change-on-input-check だけは 28% で、残りはページ遷移などの実処理。Tab 系 4 検査の時間は「Tab ごとの `evaluate`」ではなく、Tab ごとの 50 ms の待ちが 62〜78% を占める（プランの仮説は外れ）。
- 待ちを半分（×0.5）にしても、5 ページ × 7 検査 と、リポジトリの fixture 約 75 件で `nodes` / `targets` / `untested` は変わらなかった。×0.25 では content-on-hover-check と change-on-input-check が公開ページ（Wikipedia）で検出を変えた。
- したがって「待ちを ×0.5 に短くする」は、7 検査のうち 6 検査で根拠がある（5 ページ合計で 36〜44% 短縮）。change-on-input-check は根拠はあるが効果が小さい。auto-play-detection は変えない。
- 全検査で試した対象の全集合を復元できた。「判定不能」の検査はない。

## 1. 計測条件

| 項目 | 内容 |
|---|---|
| commit | `4358e7f`（main）+ プラン文書のみの 4 コミット（`32d7b62`）。`src/` と `test/` は `4358e7f` から差分なし（`git diff --stat 4358e7f..HEAD -- packages/a11y-audit/src packages/a11y-audit/test` が空） |
| マシン | AMD Ryzen AI MAX+ 395（32 スレッド）、メモリ 38 GB、WSL2（Linux 6.18.54）、Node.js v24.12.0 |
| ブラウザ | Playwright 1.60.0 の Chromium 148.0.7778.96（headless、`--autoplay-policy=no-user-gesture-required`。CLI と同じ起動引数） |
| 日付 | 2026-10-16 |
| 実行方法 | 検査は 1 つずつ順に実行（並列にしない）。`writeResult: false, quiet: true`。検査ごとに新しい context（`createContext`）。auto-play-detection だけは page を渡す検査なので、スクリプトが context と page を作り `gotoAndSettle` で遷移してから渡す |
| タイムアウト | 1 検査 180 秒。超えたら `"error":"timeout"` の行を出し、その検査の context を閉じ、**browser ごと閉じて起動し直してから次の検査へ進む**（タイムアウトした検査の Promise は裏で走り続けるため、同じ browser を共有すると後続を汚染する）。今回のタイムアウトは 0 件 |
| 時間の測り方 | `performance.now()`（単調時計）。**`Date.now()` は使わない**（下の注意を参照） |
| スクリプトの置き場所 | `packages/a11y-audit/test-results/spike-021/`（gitignore 済み、コミットしない）。全文は付録 |

対象ページ（すべて公開・ログイン不要。2026-10-16 に `curl -sIL` で最終ステータス 200 を確認）:

| 名前 | URL |
|---|---|
| w3c-bad | `https://www.w3.org/WAI/demos/bad/before/home.html` |
| w3c-good | `https://www.w3.org/WAI/demos/bad/after/home.html` |
| w3c-wai | `https://www.w3.org/WAI/` |
| mdn | `https://developer.mozilla.org/en-US/` |
| wikipedia | `https://en.wikipedia.org/wiki/Main_Page` |

どのページでもフォーム送信や購入などの副作用が疑われる挙動（送信後の URL への遷移など）は見ていない。ページ本文・入力値・スクリーンショットはこの文書に載せていない（件数・秒数・ルール ID・セレクタのみ）。

### 注意: この環境では `Date.now()` が約 9% 遅れる

240 秒間 `Date.now()` と `performance.now()` を 500 ms ごとに比べると、`Date.now()` は約 30 秒ごとに 2.7〜3.9 秒ほど巻き戻り、240 秒で合計 21.8 秒遅れた（WSL2 の時計補正と思われる）。影響は次のとおり。

- CLI の `[name] DONE in …` は `Date.now()` で測るため、実際より短く出ることがある。実際、待ち時間の合計より短い値（物理的にありえない値）が 4 件あった（下の CLI 照合）。
- 検査内部の時間予算（`timeBudgetMs`）も `Date.now()` を使うので、この環境では予算が 1 割ほど甘くなる。今回の計測では時間予算で打ち切られた検査は 1 つもなかったので結果には影響していない。
- このスクリプトの `durationMs` は `performance.now()` なので影響を受けない（全行で `waitMs <= durationMs`）。

### `--settle-scale k` で変えた値

| 検査 | 変えた引数（既定値 × k） | k に連動しない待ち |
|---|---|---|
| content-on-hover-check | `settleMs`（400）、`persistMs`（3000） | スクロール後の `min(settleMs, 100)` は k=0.5 / 0.25 でも 100 ms のまま |
| pointer-cancellation-check | `settleMs`（300） | context ごとの `max(settleMs, 1000)` は 1000 ms のまま |
| change-on-input-check | `settleMs`（500） | なし |
| keyboard-trap-check | `walkSettleMs`（50） | Escape 後 200 ms |
| focus-indicator-check | `navigationSettleMs`（50） | なし |
| focus-order-check | `settleMs`（50） | ダイアログ後 300 ms |
| keyboard-reachability-check | `walkSettleMs`（50） | なし |

auto-play-detection は待ちを引数で変えられないので感度実験の対象外。

### 試した対象の全集合（`targets`）の復元方法

| 検査 | `targets` の元 | 判定不能か |
|---|---|---|
| content-on-hover-check | 戻り値から導出: `details.triggers[]` × method（hover は常に、focus は `focusTarget` があるとき。`runContentOnHoverCheck.ts:1051-1056`）から `untested` を引き、`results[]` にあれば `persistent/dismissible/hoverable`、無ければ `no-content` | いいえ |
| pointer-cancellation-check | 記録方法 B（`EventTarget.prototype.dispatchEvent` の包み。`isTrusted === false` かつ `pointerdown` / `mousedown` / `touchstart` の対象を記録）。5 ページすべてで「記録した押下対象の数」が `details.targetsTested` と一致した | いいえ |
| change-on-input-check | 記録方法 A（`focusin` の exposeBinding）。記録は「フォーカスが当たった要素」なので、検査が試した欄の上位集合になる（Wikipedia は試した 6 + 試せなかった 1 に対し 9 件。検査が欄の操作後に別要素へフォーカスを動かした分が入る） | いいえ |
| keyboard-trap-check | 記録方法 A。Tab が止まった要素の集合（`totalFocusableElements` とは一致しない: 到達できない要素や 600 回の上限で打ち切られた分がある） | いいえ |
| focus-indicator-check | 戻り値の `details.allElements[]` | いいえ |
| focus-order-check | 戻り値の `details.stops[]` と `dialogs[]` | いいえ |
| keyboard-reachability-check | 戻り値の `details.elements[]` | いいえ |
| auto-play-detection | 戻り値の `details.mediaElements[]`（基準計測のみ） | 対象外 |

pointer-cancellation-check と change-on-input-check は `findings[]` のセレクタを、計測とは別に開いた同じ URL のページで `querySelector` し、記録側の簡易セレクタ（tag + `:nth-child` の連鎖）に直して突き合わせた。解決できなかったセレクタは `raw:` を付けてそのまま使う。

### 記録あり / なしで検査が歪まないことの確認

記録方法 A / B を使う 3 検査と、記録を使わない content-on-hover-check（念のため）について、`git ls-files` で見つかる対象 fixture すべて（`pages/pointer-cancellation/` 23 件、`pages/change-on-input/` 24 件、`pages/content-on-hover/` 23 件、`pages/keyboard-trap/` 5 件、`keyboard-trap-*.html` 3 件、`index.html` 2 検査分。計 80 ケース）で `--record` と `--no-record` を 1 回ずつ走らせ、`nodes` と件数項目を比べた。

| fixture | 検査 | 記録した対象数 | nodes | 件数項目 | 件数項目の値（記録あり） |
|---|---|---|---|---|---|
| index.html | keyboard-trap-check | 51 | 一致 | 一致 | totalFocusableElements=51, trapCandidates=0, confirmedTraps=0, needsReview=0 |
| index.html | pointer-cancellation-check | 51 | 一致 | 一致 | targetsFound=51, targetsTested=51, delegationRootCount=0, pageListeners.length=0, findings=0, untested=0, restarts=0 |
| keyboard-trap-modal.html | keyboard-trap-check | 2 | 一致 | 一致 | totalFocusableElements=2, trapCandidates=0, confirmedTraps=0, needsReview=0 |
| keyboard-trap-none.html | keyboard-trap-check | 5 | 一致 | 一致 | totalFocusableElements=5, trapCandidates=0, confirmedTraps=0, needsReview=0 |
| keyboard-trap-true.html | keyboard-trap-check | 3 | 一致 | 一致 | totalFocusableElements=3, trapCandidates=1, confirmedTraps=1, needsReview=0 |
| change-on-input/checkbox-popup.html | change-on-input-check | 1 | 一致 | 一致 | controlsFound=1, controlsTested=1, findings=1, skipped=0, untested=0, restarts=0 |
| change-on-input/clear.html | change-on-input-check | 4 | 一致 | 一致 | controlsFound=4, controlsTested=4, findings=0, skipped=0, untested=0, restarts=0 |
| change-on-input/covered.html | change-on-input-check | 1 | 一致 | 一致 | controlsFound=1, controlsTested=0, findings=0, skipped=0, untested=1, restarts=0 |
| change-on-input/duplicate-id.html | change-on-input-check | 2 | 一致 | 一致 | controlsFound=2, controlsTested=2, findings=0, skipped=0, untested=0, restarts=0 |
| change-on-input/focus-delayed.html | change-on-input-check | 1 | 一致 | 一致 | controlsFound=1, controlsTested=0, findings=0, skipped=1, untested=0, restarts=0 |
| change-on-input/focus-dialog.html | change-on-input-check | 1 | 一致 | 一致 | controlsFound=1, controlsTested=0, findings=0, skipped=1, untested=0, restarts=0 |
| change-on-input/focus-navigates.html | change-on-input-check | 2 | 一致 | 一致 | controlsFound=2, controlsTested=1, findings=0, skipped=1, untested=0, restarts=1 |
| change-on-input/focus-on-focus.html | change-on-input-check | 2 | 一致 | 一致 | controlsFound=2, controlsTested=1, findings=0, skipped=1, untested=0, restarts=0 |
| change-on-input/initial-value.html | change-on-input-check | 3 | 一致 | 一致 | controlsFound=3, controlsTested=3, findings=0, skipped=0, untested=0, restarts=0 |
| change-on-input/landing.html | change-on-input-check | 0 | 一致 | 一致 | controlsFound=0, controlsTested=0, findings=0, skipped=0, untested=0, restarts=0 |
| change-on-input/last-navigates.html | change-on-input-check | 2 | 一致 | 一致 | controlsFound=2, controlsTested=2, findings=1, skipped=0, untested=0, restarts=0 |
| change-on-input/none.html | change-on-input-check | 0 | 一致 | 一致 | controlsFound=0, controlsTested=0, findings=0, skipped=0, untested=0, restarts=0 |
| change-on-input/radio-focus.html | change-on-input-check | 3 | 一致 | 一致 | controlsFound=2, controlsTested=2, findings=1, skipped=0, untested=0, restarts=0 |
| change-on-input/replace-and-focus.html | change-on-input-check | 2 | 一致 | 一致 | controlsFound=2, controlsTested=2, findings=1, skipped=0, untested=0, restarts=0 |
| change-on-input/restore-silent.html | change-on-input-check | 1 | 一致 | 一致 | controlsFound=1, controlsTested=1, findings=0, skipped=0, untested=0, restarts=0 |
| change-on-input/select-alert.html | change-on-input-check | 1 | 一致 | 一致 | controlsFound=1, controlsTested=1, findings=1, skipped=0, untested=0, restarts=0 |
| change-on-input/select-async-focus.html | change-on-input-check | 2 | 一致 | 一致 | controlsFound=2, controlsTested=2, findings=1, skipped=0, untested=0, restarts=0 |
| change-on-input/select-navigates.html | change-on-input-check | 2 | 一致 | 一致 | controlsFound=2, controlsTested=2, findings=1, skipped=0, untested=0, restarts=1 |
| change-on-input/skips.html | change-on-input-check | 1 | 一致 | 一致 | controlsFound=1, controlsTested=0, findings=0, skipped=1, untested=0, restarts=0 |
| change-on-input/text-autoadvance.html | change-on-input-check | 2 | 一致 | 一致 | controlsFound=2, controlsTested=2, findings=1, skipped=0, untested=0, restarts=0 |
| change-on-input/text-change-focus.html | change-on-input-check | 2 | 一致 | 一致 | controlsFound=2, controlsTested=2, findings=1, skipped=0, untested=0, restarts=0 |
| change-on-input/text-navigates-on-input.html | change-on-input-check | 2 | 一致 | 一致 | controlsFound=2, controlsTested=2, findings=1, skipped=0, untested=0, restarts=1 |
| change-on-input/text-submit-on-change.html | change-on-input-check | 1 | 一致 | 一致 | controlsFound=1, controlsTested=1, findings=1, skipped=0, untested=0, restarts=0 |
| change-on-input/value-reverted.html | change-on-input-check | 1 | 一致 | 一致 | controlsFound=1, controlsTested=0, findings=0, skipped=1, untested=0, restarts=0 |
| content-on-hover/aria-hidden-tooltip.html | content-on-hover-check | 2 | 一致 | 一致 | triggers.length=1, delegationRoots.length=0, triggersTruncated=0, noContent=0, results=2, untested=0, reloads=0 |
| content-on-hover/attributes-only.html | content-on-hover-check | 0 | 一致 | 一致 | triggers.length=0, delegationRoots.length=0, triggersTruncated=0, noContent=0, results=0, untested=0, reloads=0 |
| content-on-hover/auto-hide.html | content-on-hover-check | 2 | 一致 | 一致 | triggers.length=1, delegationRoots.length=0, triggersTruncated=0, noContent=1, results=1, untested=0, reloads=0 |
| content-on-hover/compliant-tooltip.html | content-on-hover-check | 2 | 一致 | 一致 | triggers.length=1, delegationRoots.length=0, triggersTruncated=0, noContent=0, results=2, untested=0, reloads=0 |
| content-on-hover/css-hover-menu.html | content-on-hover-check | 1 | 一致 | 一致 | triggers.length=1, delegationRoots.length=0, triggersTruncated=0, noContent=0, results=1, untested=0, reloads=0 |
| content-on-hover/css-nested-menu.html | content-on-hover-check | 1 | 一致 | 一致 | triggers.length=1, delegationRoots.length=0, triggersTruncated=0, noContent=0, results=1, untested=0, reloads=0 |
| content-on-hover/css-self-only.html | content-on-hover-check | 0 | 一致 | 一致 | triggers.length=0, delegationRoots.length=0, triggersTruncated=0, noContent=0, results=0, untested=0, reloads=0 |
| content-on-hover/document-delegation.html | content-on-hover-check | 0 | 一致 | 一致 | triggers.length=0, delegationRoots.length=1, triggersTruncated=0, noContent=0, results=0, untested=0, reloads=0 |
| content-on-hover/escape-blurs.html | content-on-hover-check | 2 | 一致 | 一致 | triggers.length=1, delegationRoots.length=0, triggersTruncated=0, noContent=1, results=1, untested=0, reloads=0 |
| content-on-hover/focus-navigates.html | content-on-hover-check | 1 | 一致 | 一致 | triggers.length=1, delegationRoots.length=0, triggersTruncated=0, noContent=1, results=0, untested=1, reloads=0 |
| content-on-hover/focus-only.html | content-on-hover-check | 2 | 一致 | 一致 | triggers.length=1, delegationRoots.length=0, triggersTruncated=0, noContent=1, results=1, untested=0, reloads=0 |
| content-on-hover/focus-within.html | content-on-hover-check | 2 | 一致 | 一致 | triggers.length=1, delegationRoots.length=0, triggersTruncated=0, noContent=1, results=1, untested=0, reloads=0 |
| content-on-hover/hidden-trigger.html | content-on-hover-check | 0 | 一致 | 一致 | triggers.length=0, delegationRoots.length=0, triggersTruncated=0, noContent=0, results=0, untested=0, reloads=0 |
| content-on-hover/inserts-sibling.html | content-on-hover-check | 4 | 一致 | 一致 | triggers.length=2, delegationRoots.length=0, triggersTruncated=0, noContent=1, results=3, untested=0, reloads=0 |
| content-on-hover/no-escape.html | content-on-hover-check | 2 | 一致 | 一致 | triggers.length=1, delegationRoots.length=0, triggersTruncated=0, noContent=0, results=2, untested=0, reloads=0 |
| content-on-hover/none.html | content-on-hover-check | 0 | 一致 | 一致 | triggers.length=0, delegationRoots.length=0, triggersTruncated=0, noContent=0, results=0, untested=0, reloads=0 |
| content-on-hover/not-hoverable.html | content-on-hover-check | 2 | 一致 | 一致 | triggers.length=1, delegationRoots.length=0, triggersTruncated=0, noContent=0, results=2, untested=0, reloads=0 |
| content-on-hover/root-delegation.html | content-on-hover-check | 0 | 一致 | 一致 | triggers.length=0, delegationRoots.length=1, triggersTruncated=0, noContent=0, results=0, untested=0, reloads=0 |
| content-on-hover/scroll-reveal.html | content-on-hover-check | 2 | 一致 | 一致 | triggers.length=1, delegationRoots.length=0, triggersTruncated=0, noContent=0, results=2, untested=0, reloads=0 |
| content-on-hover/shadow-button.html | content-on-hover-check | 0 | 一致 | 一致 | triggers.length=0, delegationRoots.length=0, triggersTruncated=0, noContent=0, results=0, untested=0, reloads=0 |
| content-on-hover/stuck.html | content-on-hover-check | 4 | 一致 | 一致 | triggers.length=2, delegationRoots.length=0, triggersTruncated=0, noContent=1, results=3, untested=0, reloads=1 |
| content-on-hover/tabindex-minus-one.html | content-on-hover-check | 1 | 一致 | 一致 | triggers.length=1, delegationRoots.length=0, triggersTruncated=0, noContent=1, results=0, untested=0, reloads=0 |
| content-on-hover/window-focus.html | content-on-hover-check | 2 | 一致 | 一致 | triggers.length=1, delegationRoots.length=0, triggersTruncated=0, noContent=0, results=2, untested=0, reloads=0 |
| keyboard-trap/capped.html | keyboard-trap-check | 300 | 一致 | 一致 | totalFocusableElements=300, trapCandidates=0, confirmedTraps=0, needsReview=0 |
| keyboard-trap/clear.html | keyboard-trap-check | 5 | 一致 | 一致 | totalFocusableElements=5, trapCandidates=0, confirmedTraps=0, needsReview=0 |
| keyboard-trap/clear-modal.html | keyboard-trap-check | 2 | 一致 | 一致 | totalFocusableElements=2, trapCandidates=0, confirmedTraps=0, needsReview=0 |
| keyboard-trap/finding.html | keyboard-trap-check | 3 | 一致 | 一致 | totalFocusableElements=3, trapCandidates=1, confirmedTraps=1, needsReview=0 |
| keyboard-trap/needs-review.html | keyboard-trap-check | 3 | 一致 | 一致 | totalFocusableElements=3, trapCandidates=1, confirmedTraps=0, needsReview=1 |
| pointer-cancellation/background-ticker.html | pointer-cancellation-check | 1 | 一致 | 一致 | targetsFound=1, targetsTested=1, delegationRootCount=0, pageListeners.length=0, findings=0, untested=0, restarts=0 |
| pointer-cancellation/cancel-dialog.html | pointer-cancellation-check | 2 | 一致 | 一致 | targetsFound=2, targetsTested=2, delegationRootCount=0, pageListeners.length=0, findings=0, untested=0, restarts=0 |
| pointer-cancellation/click-only.html | pointer-cancellation-check | 2 | 一致 | 一致 | targetsFound=2, targetsTested=2, delegationRootCount=0, pageListeners.length=0, findings=0, untested=0, restarts=0 |
| pointer-cancellation/delegated.html | pointer-cancellation-check | 1 | 一致 | 一致 | targetsFound=1, targetsTested=1, delegationRootCount=1, pageListeners.length=0, findings=1, untested=0, restarts=0 |
| pointer-cancellation/focus-self.html | pointer-cancellation-check | 1 | 一致 | 一致 | targetsFound=1, targetsTested=1, delegationRootCount=0, pageListeners.length=0, findings=0, untested=0, restarts=0 |
| pointer-cancellation/hang-pointercancel.html | pointer-cancellation-check | 1 | 一致 | 一致 | targetsFound=1, targetsTested=1, delegationRootCount=0, pageListeners.length=0, findings=0, untested=0, restarts=0 |
| pointer-cancellation/hang-pointerdown.html | pointer-cancellation-check | 2 | 一致 | 一致 | targetsFound=2, targetsTested=1, delegationRootCount=0, pageListeners.length=0, findings=1, untested=1, restarts=1 |
| pointer-cancellation/landing.html | pointer-cancellation-check | 0 | 一致 | 一致 | targetsFound=0, targetsTested=0, delegationRootCount=0, pageListeners.length=0, findings=0, untested=0, restarts=0 |
| pointer-cancellation/many.html | pointer-cancellation-check | 100 | 一致 | 一致 | targetsFound=150, targetsTested=100, delegationRootCount=0, pageListeners.length=0, findings=0, untested=0, restarts=0 |
| pointer-cancellation/many-listeners.html | pointer-cancellation-check | 100 | 一致 | 一致 | targetsFound=1001, targetsTested=100, delegationRootCount=0, pageListeners.length=0, findings=100, untested=0, restarts=0 |
| pointer-cancellation/mousedown-alert.html | pointer-cancellation-check | 1 | 一致 | 一致 | targetsFound=1, targetsTested=1, delegationRootCount=0, pageListeners.length=0, findings=1, untested=0, restarts=0 |
| pointer-cancellation/mousedown-navigates.html | pointer-cancellation-check | 2 | 一致 | 一致 | targetsFound=2, targetsTested=2, delegationRootCount=0, pageListeners.length=0, findings=1, untested=0, restarts=1 |
| pointer-cancellation/mousedown-window-open.html | pointer-cancellation-check | 1 | 一致 | 一致 | targetsFound=1, targetsTested=1, delegationRootCount=0, pageListeners.length=0, findings=1, untested=0, restarts=0 |
| pointer-cancellation/none.html | pointer-cancellation-check | 0 | 一致 | 一致 | targetsFound=0, targetsTested=0, delegationRootCount=0, pageListeners.length=0, findings=0, untested=0, restarts=0 |
| pointer-cancellation/pointerdown-opens-menu.html | pointer-cancellation-check | 1 | 一致 | 一致 | targetsFound=1, targetsTested=1, delegationRootCount=0, pageListeners.length=0, findings=1, untested=0, restarts=0 |
| pointer-cancellation/pointerdown-prevented.html | pointer-cancellation-check | 1 | 一致 | 一致 | targetsFound=1, targetsTested=1, delegationRootCount=0, pageListeners.length=0, findings=1, untested=0, restarts=0 |
| pointer-cancellation/press-and-click.html | pointer-cancellation-check | 1 | 一致 | 一致 | targetsFound=1, targetsTested=1, delegationRootCount=0, pageListeners.length=0, findings=0, untested=0, restarts=0 |
| pointer-cancellation/press-only-silent.html | pointer-cancellation-check | 1 | 一致 | 一致 | targetsFound=1, targetsTested=1, delegationRootCount=0, pageListeners.length=0, findings=1, untested=0, restarts=0 |
| pointer-cancellation/removes-next.html | pointer-cancellation-check | 1 | 一致 | 一致 | targetsFound=2, targetsTested=1, delegationRootCount=0, pageListeners.length=0, findings=1, untested=1, restarts=0 |
| pointer-cancellation/shadow.html | pointer-cancellation-check | 1 | 一致 | 一致 | targetsFound=1, targetsTested=1, delegationRootCount=0, pageListeners.length=0, findings=1, untested=0, restarts=0 |
| pointer-cancellation/slow-navigation.html | pointer-cancellation-check | 2 | 一致 | 一致 | targetsFound=2, targetsTested=2, delegationRootCount=0, pageListeners.length=0, findings=1, untested=0, restarts=1（初回 restarts 1 vs 0。再実行 4 組は一致。restarts はプランの比較対象外の内部カウンタで、scale を変えただけでも揺れる時間依存 fixture） |
| pointer-cancellation/slow-ticker.html | pointer-cancellation-check | 1 | 一致 | 一致 | targetsFound=1, targetsTested=1, delegationRootCount=0, pageListeners.length=0, findings=0, untested=0, restarts=0 |
| pointer-cancellation/style-feedback.html | pointer-cancellation-check | 1 | 一致 | 一致 | targetsFound=1, targetsTested=1, delegationRootCount=0, pageListeners.length=0, findings=0, untested=0, restarts=0 |

**結果**: プランが挙げた件数項目（`targetsFound` / `targetsTested` / `controlsFound` / `controlsTested` / `triggers.length` / `delegationRoots.length` / `delegationRootCount` / `pageListeners.length` / `totalFocusableElements`。検査に存在する項目のみ）と `nodes` は、80 ケースすべてで一致した。表には検査が持つ他の件数（`findings` / `untested` / `restarts` など）も載せてあり、不一致だったのは次の 1 回だけ。

`pointer-cancellation/slow-navigation.html` は、初回の記録あり / なしで `restarts` が 1 vs 0 だった（`nodes` と他の件数は一致）。`restarts` はプランの比較対象外の内部カウンタで、この fixture は scale を変えただけでも `restarts` が揺れる時間依存のものである（第 4 節の補足実験で ×1 は 1、×0.5 / ×0.25 は 0）。同じ記録あり / なしの組を追加で 4 組走らせたところ全 4 組で一致し、合計 5 組中 4 組一致・1 組のみ `restarts` が不一致（`nodes` と対象集合は 5 組すべて一致）。記録による歪みではなく fixture の時間依存の揺れと判断し、STOP 条件には該当しないと扱った。表の `slow-navigation` の行は最後の組の値。`pointer-cancellation-check` の `index.html` と `many-listeners.html`（1001 件中 100 件を押下）でも、記録した押下対象の数は `targetsTested` と一致した。

## 2. 時間内訳

基準計測（scale 1）。5 ページ × 8 検査 × 2 回。表の数値は 1 回目、括弧内は 2 回目の所要時間。`待ち` は `page.waitForTimeout` に渡した ms の合計（呼び出しの実際の所要は、これに RPC のオーバーヘッドが加わるので、待ち割合はやや小さめに出る）。`秒/要素` は `durationMs / 要素数`。要素数は、content-on-hover-check がトリガー数、pointer-cancellation-check が押した要素数、change-on-input-check が試した欄数、keyboard-trap-check が `totalFocusableElements`、focus-indicator-check が記録した要素数、focus-order-check が Tab 停止先の数、keyboard-reachability-check が操作可能要素数、auto-play-detection がメディア要素数。

| ページ | 検査 | 所要 s（2 回目） | 待ち s | 待ち割合 | waits | 要素数 | 秒/要素 | aborted |
|---|---|---|---|---|---|---|---|---|
| w3c-bad | content-on-hover-check | 37.1（36.7） | 34.7 | 93% | 116 | 21 | 1.77 | - |
| w3c-bad | pointer-cancellation-check | 19.7（19.1） | 17.5 | 89% | 56 | 55 | 0.36 | - |
| w3c-bad | auto-play-detection | 7.5（7.5） | 6.0 | 80% | 3 | 0 | - | - |
| w3c-bad | change-on-input-check | 6.6（6.5） | 0.5 | 8% | 1 | 1 | 6.57 | - |
| w3c-bad | keyboard-trap-check | 8.0（7.9） | 6.1 | 76% | 122 | 56 | 0.14 | - |
| w3c-bad | focus-indicator-check | 4.8（4.8） | 3.3 | 69% | 66 | 42 | 0.11 | - |
| w3c-bad | focus-order-check | 4.9（4.9） | 2.9 | 59% | 58 | 42 | 0.12 | - |
| w3c-bad | keyboard-reachability-check | 4.3（5.1） | 2.9 | 67% | 58 | 56 | 0.08 | - |
| w3c-good | content-on-hover-check | 2.7（2.2） | 1.4 | 53% | 5 | 1 | 2.66 | - |
| w3c-good | pointer-cancellation-check | 20.1（19.2） | 17.8 | 89% | 57 | 56 | 0.36 | - |
| w3c-good | auto-play-detection | 7.4（7.4） | 6.0 | 81% | 3 | 0 | - | - |
| w3c-good | change-on-input-check | 1.9（1.8） | 1.0 | 52% | 2 | 1 | 1.93 | - |
| w3c-good | keyboard-trap-check | 8.1（8.0） | 6.2 | 77% | 124 | 57 | 0.14 | - |
| w3c-good | focus-indicator-check | 4.8（4.7） | 3.4 | 70% | 67 | 57 | 0.08 | - |
| w3c-good | focus-order-check | 4.8（4.7） | 3.0 | 62% | 59 | 57 | 0.08 | - |
| w3c-good | keyboard-reachability-check | 4.3（4.2） | 3.0 | 69% | 59 | 57 | 0.07 | - |
| w3c-wai | content-on-hover-check | 16.1（15.8） | 14.0 | 87% | 47 | 8 | 2.02 | - |
| w3c-wai | pointer-cancellation-check | 28.0（27.7） | 24.7 | 88% | 80 | 79 | 0.36 | - |
| w3c-wai | auto-play-detection | 8.2（8.2） | 6.0 | 73% | 3 | 1 | 8.17 | - |
| w3c-wai | change-on-input-check | 2.5（2.5） | 1.0 | 40% | 2 | 1 | 2.52 | - |
| w3c-wai | keyboard-trap-check | 12.5（11.9） | 9.0 | 72% | 174 | 81 | 0.15 | - |
| w3c-wai | focus-indicator-check | 7.5（7.4） | 4.9 | 66% | 98 | 86 | 0.09 | - |
| w3c-wai | focus-order-check | 7.7（8.0） | 4.5 | 58% | 89 | 81 | 0.10 | - |
| w3c-wai | keyboard-reachability-check | 6.7（6.7） | 4.5 | 67% | 89 | 80 | 0.08 | - |
| mdn | content-on-hover-check | 1.6（1.6） | 0.0 | 0% | 0 | 0 | - | - |
| mdn | pointer-cancellation-check | 31.6（32.1） | 28.9 | 91% | 94 | 93 | 0.34 | - |
| mdn | auto-play-detection | 7.9（8.1） | 6.0 | 76% | 3 | 0 | - | - |
| mdn | change-on-input-check | 2.0（1.6） | 0.0 | 0% | 0 | 0 | - | - |
| mdn | keyboard-trap-check | 21.6（22.0） | 17.4 | 80% | 348 | 169 | 0.13 | - |
| mdn | focus-indicator-check | 13.8（14.5） | 10.3 | 75% | 207 | 93 | 0.15 | - |
| mdn | focus-order-check | 9.0（9.0） | 4.8 | 53% | 95 | 93 | 0.10 | - |
| mdn | keyboard-reachability-check | 7.0（7.2） | 4.8 | 68% | 95 | 85 | 0.08 | - |
| wikipedia | content-on-hover-check | 39.6（39.7） | 34.5 | 87% | 106 | 18 | 2.20 | - |
| wikipedia | pointer-cancellation-check | 35.3（34.6） | 31.0 | 88% | 101 | 100 | 0.35 | target-limit |
| wikipedia | auto-play-detection | 8.4（8.3） | 6.0 | 71% | 3 | 0 | - | - |
| wikipedia | change-on-input-check | 19.1（18.7） | 6.5 | 34% | 13 | 6 | 3.18 | - |
| wikipedia | keyboard-trap-check | 37.0（36.4） | 30.0 | 81% | 600 | 674 | 0.05 | tab-walk-capped |
| wikipedia | focus-indicator-check | 19.9（19.9） | 13.9 | 70% | 279 | 252 | 0.08 | - |
| wikipedia | focus-order-check | 17.9（19.2） | 12.6 | 71% | 252 | 250 | 0.07 | - |
| wikipedia | keyboard-reachability-check | 18.6（18.6） | 13.7 | 74% | 274 | 252 | 0.07 | - |

- 2 回の差は多くの検査で 1 秒未満。最大でも keyboard-reachability-check（w3c-bad）の 0.8 秒と focus-order-check（wikipedia）の 1.4 秒。
- `error` の行、時間予算（`timeBudgetMs`）による打ち切りは 0 件。`aborted` が出たのは Wikipedia の 2 検査だけで、どちらも待ちとは別の上限による（pointer-cancellation-check は `target-limit` = 100 件、keyboard-trap-check は `tab-walk-capped` = 600 回）。上限なので待ちを縮めても対象は増えない。
- change-on-input-check の w3c-bad（6.6 秒、待ちは 0.5 秒だけ）は、`<select>` の値を変えるとページ遷移（`navigation`）が起きる欄に当たり（別に走らせて `findings` の `changes.kind` を確認した）、遷移の待ちに約 6 秒かかっている。待ちの設定で縮まる時間ではない。

### CLI との照合（スクリプトの包みが検査を遅くしていないことの確認）

CLI（`--checks all --concurrency 1`）の `[name] DONE in` と、スクリプトの基準 2 回の平均 `durationMs` を比べた 48 件のうち 43 件が ±20% に収まった。範囲外の 5 件:

| CLI の実行 | 検査 | CLI s | スクリプト平均 s | 比 | 備考 |
|---|---|---|---|---|---|
| w3c-bad | auto-play-detection | 4.9 | 7.5 | 66% | CLI 値が待ち合計 6.0 s を下回る（物理的にありえない） |
| w3c-bad-b | keyboard-trap-check | 5.1 | 8.0 | 64% | CLI 値が待ち合計 6.1 s を下回る（物理的にありえない） |
| w3c-good | keyboard-trap-check | 5.2 | 8.0 | 65% | CLI 値が待ち合計 6.2 s を下回る（物理的にありえない） |
| w3c-wai | keyboard-reachability-check | 4.0 | 6.7 | 60% | CLI 値が待ち合計 4.5 s を下回る（物理的にありえない） |
| mdn | change-on-input-check | 2.4 | 1.8 | 133% | 待ち合計は上回る |

CLI の値はスクリプトより平均で 1 割ほど短く（88〜96% の件が多い）、上の `Date.now()` の遅れと整合する。スクリプトの包み（`waitForTimeout` の差し替えと `createContext`）が検査を遅くしている兆候はない。範囲外の 5 件のうち 4 件は CLI 側が待ち合計を下回る値で、`Date.now()` の巻き戻りが 1 回入った大きさ（約 3 秒）と一致する。残りの 1 件（mdn の change-on-input-check）は 2.4 秒と 1.8 秒で絶対差が 0.6 秒。

### 基準 2 回の一致（ばらつき）

40 組（5 ページ × 8 検査）のうち 39 組で `nodes` / `targets` / `untested` がすべて一致した。一致しなかったもの: w3c-wai の keyboard-trap-check（nodes 一致 / targets 不一致 -5/+5 / untested 一致）。

唯一の不一致は、w3c-wai に埋め込まれた iframe（動画プレイヤー）内の 5 要素で、セレクタの `:nth-child` の番号が 5 と 4 で入れ替わったもの（プレイヤー内の DOM の揺れ）。この検査・ページは「元々揺れる」と印を付け、揺れた対象は上の 5 件に限る。8 検査中 4 つ以上が不一致という STOP 条件には該当しない（1 組だけ）。

## 3. どの待ちが支配的か

5 ページの基準 1 回目の合計。「所要に対する %」は、その待ちの合計が検査の所要時間の何 % かを表す。

| 検査 | 5 ページ合計 s | 待ち合計 s（割合） | 待ちの内訳（回数 × ms = 秒、所要に対する %） | 待ち以外 s |
|---|---|---|---|---|
| content-on-hover-check | 97.2 | 84.6（87%） | スクロール後 `min(settleMs,100)`: 92 × 100 = 9.2 s（9%）<br>`CONTENT_ON_HOVER_SETTLE_MS`: 181 × 400 = 72.4 s（75%）<br>`CONTENT_ON_HOVER_PERSIST_MS`: 1 × 3000 = 3.0 s（3%） | 12.6 |
| pointer-cancellation-check | 134.8 | 119.9（89%） | `POINTER_CANCELLATION_SETTLE_MS`（要素ごと）: 383 × 300 = 114.9 s（85%）<br>`POINTER_CANCELLATION_BACKGROUND_MS`（context ごと）: 5 × 1000 = 5.0 s（4%） | 14.9 |
| auto-play-detection | 39.4 | 30.0（76%） | スクリーンショット間隔（2 秒 × 3）: 15 × 2000 = 30.0 s（76%） | 9.4 |
| change-on-input-check | 32.1 | 9.0（28%） | `CHANGE_ON_INPUT_SETTLE_MS`: 18 × 500 = 9.0 s（28%） | 23.1 |
| keyboard-trap-check | 87.3 | 68.7（79%） | `DEFAULT_NAVIGATION_SETTLE_MS`（Tab ごと）: 1366 × 50 = 68.3 s（78%）<br>Escape 後 200 ms: 2 × 200 = 0.4 s（0%） | 18.6 |
| focus-indicator-check | 50.8 | 35.9（71%） | `DEFAULT_NAVIGATION_SETTLE_MS`（Tab ごと）: 717 × 50 = 35.9 s（71%） | 15.0 |
| focus-order-check | 44.3 | 27.6（62%） | `DEFAULT_NAVIGATION_SETTLE_MS`（Tab ごと）: 553 × 50 = 27.6 s（62%） | 16.6 |
| keyboard-reachability-check | 40.9 | 28.8（70%） | `DEFAULT_NAVIGATION_SETTLE_MS`（Tab ごと）: 575 × 50 = 28.8 s（70%） | 12.1 |

- **content-on-hover-check**: 支配的なのは `settleMs`（400 ms）で 75%。トリガー 1 つにつき hover と（focus できるなら）focus で、押下前後の後始末・hover 後・スクロール後に待つため、内容が出ない組でも 1 組あたり約 1 秒かかる（w3c-bad 0.95 秒、Wikipedia 1.13 秒）。`persistMs`（3 秒）は「内容が出た組」だけで、5 ページでは Wikipedia の検索欄の focus の 1 組だけだった（全体の 3%）。内容が出る fixture（content-on-hover の `css-hover-menu` / `auto-hide`、5〜6 秒）では、内容が出た 1 組あたりの所要のうち約 3 秒（50〜60%）が `persistMs`。つまり `persistMs` の支配度はページ次第で、「hover メニューが多い実サイト」でも今回の公開ページでは効いていない。
- **pointer-cancellation-check**: 要素ごとの `settleMs`（300 ms）が 85%。context ごとの 1 秒は 4%。要素数に比例し、1 要素あたり約 0.35 秒。
- **auto-play-detection**: 6 秒の固定待ちが 71〜81%。残りはページ遷移（`gotoAndSettle`）とスクリーンショットの比較。`detectors/pause-control.ts` の待ち（`SCREENSHOT_COMPARISON_WAIT` 2000 ms / `PAUSE_CLICK_WAIT` 500 ms。停止ボタンがあるときだけ発生）は、基準 10 回（5 ページ × 2 回）の `byMs` がすべて `{"2000": 3}` で 500 ms の待ちが 1 回も無く、2000 ms も 3 回（= スクリーンショット間隔）だけだったので、**1 回も発生しなかった**。w3c-wai にはメディア要素が 1 件あったが、停止ボタンの経路は走らなかった。停止ボタンがあるページでは、この内訳の上に少なくとも +2.5 秒（2000 + 500 ms）が乗る。
- **change-on-input-check**: `settleMs`（500 ms）は欄ごとに 2 回で、5 ページ合計の 28%。残りは遷移後の回復など。
- **Tab 系 4 検査**: Tab ごとの 50 ms が 62〜78%（keyboard-trap-check は 2 周するので最も大きい）。残りが `evaluate` などの実処理。プランの「時間の大半は `evaluate` である可能性が高い」という仮説は、待ちのほうが大きいという結果になった。

## 4. 感度実験

基準 1 回目との比較（`compare.mjs`、要素単位の集合差分）。5 ページ × 7 検査 × 2 スケール。`nodes 一致` などの分数は、5 ページのうち集合が完全に一致したページ数。件数だけの一致は「一致」と見なしていない。

| 検査 | 待ちの倍率 | 5 ページ合計 s（基準 1 回目 → 感度） | nodes 一致 | targets 一致 | untested 一致 | aborted 一致 | 不一致の内容 |
|---|---|---|---|---|---|---|---|
| content-on-hover-check | ×0.5 | 97.2 → 60.2（−38%） | 5/5 | 5/5 | 5/5 | 5/5 | - |
| content-on-hover-check | ×0.25 | 97.2 → 38.7（−60%） | 4/5 | 4/5 | 5/5 | 5/5 | wikipedia: nodes -1/+0, targets -0/+0/~1 |
| pointer-cancellation-check | ×0.5 | 134.8 → 74.9（−44%） | 5/5 | 5/5 | 5/5 | 5/5 | - |
| pointer-cancellation-check | ×0.25 | 134.8 → 45.8（−66%） | 5/5 | 5/5 | 5/5 | 5/5 | - |
| change-on-input-check | ×0.5 | 32.1 → 27.5（−14%） | 5/5 | 5/5 | 5/5 | 5/5 | - |
| change-on-input-check | ×0.25 | 32.1 → 24.6（−23%） | 5/5 | 4/5 | 4/5 | 5/5 | wikipedia: targets -0/+0/~1, untested -1/+0/~0 |
| keyboard-trap-check | ×0.5 | 87.3 → 49.3（−44%） | 5/5 | 4/5 | 5/5 | 5/5 | w3c-wai: targets -5/+5/~0（基準 2 回の間でも揺れた対象のみ） |
| keyboard-trap-check | ×0.25 | 87.3 → 30.2（−65%） | 5/5 | 4/5 | 5/5 | 5/5 | w3c-wai: targets -5/+5/~0（基準 2 回の間でも揺れた対象のみ） |
| focus-indicator-check | ×0.5 | 50.8 → 31.6（−38%） | 5/5 | 5/5 | 5/5 | 5/5 | - |
| focus-indicator-check | ×0.25 | 50.8 → 20.3（−60%） | 5/5 | 5/5 | 5/5 | 5/5 | - |
| focus-order-check | ×0.5 | 44.3 → 28.3（−36%） | 5/5 | 5/5 | 5/5 | 5/5 | - |
| focus-order-check | ×0.25 | 44.3 → 21.5（−52%） | 5/5 | 5/5 | 5/5 | 5/5 | - |
| keyboard-reachability-check | ×0.5 | 40.9 → 25.5（−38%） | 5/5 | 5/5 | 5/5 | 5/5 | - |
| keyboard-reachability-check | ×0.25 | 40.9 → 17.3（−58%） | 5/5 | 5/5 | 5/5 | 5/5 | - |

不一致の中身（`build-doc.mjs` の `T4D` が出力した、種類（nodes / targets / untested）ごとの先頭 2 件まで。全件は `compare.mjs <基準.jsonl> <感度.jsonl>` の出力）:

- content-on-hover-check / wikipedia / ×0.25: nodes 消えた `incomplete|a11y-skills/content-on-hover-dismissible|#searchInput`
- content-on-hover-check / wikipedia / ×0.25: targets 判定が変わった `#searchInput|focus` stayed/stayed/not-applicable → no-content
- change-on-input-check / wikipedia / ×0.25: targets 判定が変わった `html:nth-child(1)>body:nth-child(2)>div:nth-child(3)>header:nth-child(1)>div:nth-child(...` no-change → focus-moved
- change-on-input-check / wikipedia / ×0.25: untested 消えた `#searchInput`
- keyboard-trap-check / w3c-wai / ×0.5: targets 消えた `[frame /embed/iWO5N3n1DXU] html:nth-child(1)>body:nth-child(2)>div:nth-child(12)>ytm-cu...`（iframe 内セレクタの揺れ）
- keyboard-trap-check / w3c-wai / ×0.5: targets 消えた `[frame /embed/iWO5N3n1DXU] html:nth-child(1)>body:nth-child(2)>div:nth-child(12)>ytm-cu...`（iframe 内セレクタの揺れ）
- keyboard-trap-check / w3c-wai / ×0.5: targets 増えた `[frame /embed/iWO5N3n1DXU] html:nth-child(1)>body:nth-child(2)>div:nth-child(12)>ytm-cu...`
- keyboard-trap-check / w3c-wai / ×0.5: targets 増えた `[frame /embed/iWO5N3n1DXU] html:nth-child(1)>body:nth-child(2)>div:nth-child(12)>ytm-cu...`
- keyboard-trap-check / w3c-wai / ×0.25: targets 消えた `[frame /embed/iWO5N3n1DXU] html:nth-child(1)>body:nth-child(2)>div:nth-child(12)>ytm-cu...`（iframe 内セレクタの揺れ）
- keyboard-trap-check / w3c-wai / ×0.25: targets 消えた `[frame /embed/iWO5N3n1DXU] html:nth-child(1)>body:nth-child(2)>div:nth-child(12)>ytm-cu...`（iframe 内セレクタの揺れ）
- keyboard-trap-check / w3c-wai / ×0.25: targets 増えた `[frame /embed/iWO5N3n1DXU] html:nth-child(1)>body:nth-child(2)>div:nth-child(12)>ytm-cu...`
- keyboard-trap-check / w3c-wai / ×0.25: targets 増えた `[frame /embed/iWO5N3n1DXU] html:nth-child(1)>body:nth-child(2)>div:nth-child(12)>ytm-cu...`

### 読み取り

- **×0.5 は、7 検査・5 ページのすべてで `nodes` / `targets` / `untested` / `aborted` が一致**した（w3c-wai の keyboard-trap-check の `targets` を除く）。その不一致は、基準 2 回の間でも揺れた 5 要素（iframe 内の `:nth-child` の入れ替わり）と同じ要素・同じ入れ替わりで、縮めたせいではない。基準 1↔2 の差分 ID 集合と、基準 1↔感度の差分 ID 集合を全件出して比べた結果（`compare.mjs --flake <基準1> <基準2> <感度>` の出力。`sameSet` が真なら同一集合、`outsideFlakeCount` は基準 2 回の揺れに含まれない差分の数）:

| ページ | 検査 | 感度 | 基準 1↔2 の差分 ID 数 | 基準 1↔感度の差分 ID 数 | ID 集合 | 揺れに含まれない差分数 |
|---|---|---|---|---|---|---|
| w3c-wai | keyboard-trap-check | ×0.5 | 10 | 10 | 同一 | 0 |
| w3c-wai | keyboard-trap-check | ×0.25 | 10 | 10 | 同一 | 0 |
| wikipedia | content-on-hover-check | ×0.25 | 0 | 1 | **異なる** | 1 |
| wikipedia | change-on-input-check | ×0.25 | 0 | 1 | **異なる** | 1 |

- **×0.25 で検出が変わったのは 2 検査（どちらも Wikipedia）**:
  - content-on-hover-check: 検索欄（`#searchInput`）の focus で出る候補表示が見つからなくなった（`incomplete` の `content-on-hover-dismissible` が 1 件消え、`targets` の判定が `stayed/stayed/not-applicable` から `no-content` に変わった）。`settleMs` だけを ×0.25（100 ms）にして `persistMs` を据え置いた追加実験でも同じ後退が起き、`persistMs` だけを ×0.5 にした実験と `settleMs` だけを ×0.5（200 ms）にした実験では変わらなかった（追加実験の生データ: `settleonly-*`, `persistonly-*`）。後退の原因は `settleMs` が短すぎて、内容の表示が間に合わないこと。
  - change-on-input-check: 試せなかった欄 1 つ（`#searchInput`）が試せるようになり、別の欄の判定が `no-change` から `focus-moved` に変わった。待ちが短いと、検査が欄の操作の直後に別のイベントを拾うため、結果が変わる。縮めて検出が変わるので不可。
- **Tab 系 4 検査と pointer-cancellation-check は ×0.25 まで 5 ページで変化なし**。ただし変化がなかったことは「実ページ 5 つの範囲で」という意味で、フォーカス時に遅れて動くハンドラ（`focus` 後に非同期で遷移する、など）を持つページは標本にない。
- 公開ページでは pointer-cancellation-check は 5 ページとも指摘 0 件（`targets` はすべて `no-change`）で、content-on-hover-check も内容が出たのは Wikipedia の 1 組だけだった。実ページだけでは「指摘が出るケース」の感度が測れないため、次の補足実験で fixture を使った。

### 補足: 指摘が出る fixture での感度（scale 1 / 0.5 / 0.25 を同じ fixture で比較）

リポジトリの `test/fixtures/pages/` の fixture（指摘が出るものを含む）で、`fixsens.mjs` により scale 1 を基準に ×0.5 と ×0.25 を比べた。`nodes` / `targets` / `untested` / `aborted` はすべて一致した（件数だけ違ったのは下の 1 件のみ）。

| 検査 | fixture 数 | ×0.5 | ×0.25 |
|---|---|---|---|
| pointer-cancellation-check | 17 | 全件一致 | 全件一致（`slow-navigation` だけ `restarts` が 1 → 0。結果は同じ） |
| change-on-input-check | 12 | 全件一致 | 全件一致 |
| content-on-hover-check | 13 | 全件一致 | 全件一致 |
| keyboard-trap-check | 5 | 全件一致 | 全件一致 |
| focus-indicator-check | 8 | 全件一致 | 全件一致 |
| focus-order-check | 13 | 全件一致 | 全件一致 |
| keyboard-reachability-check | 7 | 全件一致 | 全件一致 |

`slow-navigation` で `restarts` が変わるのは、押下後の遷移を見つける経路が変わった（待ちが短いと、その要素では遷移を見つけられず、後で見つける）ことを示す。結果は同じだが、`settleMs` の下限に近づくと内部の経路が変わりうるという境界の証拠なので、×0.25 より ×0.5 を推奨する根拠のひとつにした。

## 5. 検査ごとの判断

「縮む見込み」は 5 ページ合計の基準 1 回目 → ×0.5 の実測（秒）。「検出への影響」は第 4 節で確かめた範囲。

| 検査 | 判断 | 縮む見込み（5 ページ合計） | 検出への影響（確かめた範囲） |
|---|---|---|---|
| content-on-hover-check | **待ちを短くする**（`settleMs` 400 → 200 ms。`persistMs` は据え置き） | 97.2 → 60.2 秒（−38%、`persistMs` も ×0.5 にした場合）。`settleMs` だけ ×0.5 の追加実験（Wikipedia）: 39.6 → 26.1 秒 | ×0.5 で 5 ページ + fixture 13 件が一致。×0.25 は Wikipedia で後退（`settleMs` 100 ms が原因）なので不可 |
| pointer-cancellation-check | **待ちを短くする**（`settleMs` 300 → 150 ms） | 134.8 → 74.9 秒（−44%） | ×0.5 と ×0.25 の両方で 5 ページ + fixture 17 件が一致。×0.25 は `slow-navigation` で内部経路が変わるので、まず ×0.5 |
| auto-play-detection | **変えない** | 0 | 6 秒の固定待ちが「5 秒を超えて動き続けるか」の判定そのもの（`SCREENSHOT_INTERVALS`） |
| change-on-input-check | **待ちを短くする**（`settleMs` 500 → 250 ms。効果が小さいので優先度は低い） | 32.1 → 27.5 秒（−14%）。最大でも Wikipedia の 3.3 秒 | ×0.5 で 5 ページ + fixture 12 件が一致。×0.25 は Wikipedia で検出が変わるので不可 |
| keyboard-trap-check | **待ちを短くする**（`walkSettleMs` 50 → 25 ms） | 87.3 → 49.3 秒（−44%） | ×0.5 / ×0.25 とも 5 ページ + fixture 5 件で変化なし（w3c-wai の iframe 内セレクタの揺れは元々揺れる要素）。推奨は ×0.5 |
| focus-indicator-check | **待ちを短くする**（`navigationSettleMs` 50 → 25 ms） | 50.8 → 31.6 秒（−38%） | ×0.5 / ×0.25 とも 5 ページ + fixture 8 件が一致。推奨は ×0.5 |
| focus-order-check | **待ちを短くする**（`settleMs` 50 → 25 ms） | 44.3 → 28.3 秒（−36%） | ×0.5 / ×0.25 とも 5 ページ + fixture 13 件が一致。ダイアログ後の 300 ms は今回動かしていない |
| keyboard-reachability-check | **待ちを短くする**（`walkSettleMs` 50 → 25 ms） | 40.9 → 25.5 秒（−38%） | ×0.5 / ×0.25 とも 5 ページ + fixture 7 件が一致。推奨は ×0.5 |

「対象を絞る」を勧める検査はない。理由は検査ごとに次のとおり。

### content-on-hover-check

- 時間の 87% が待ち。内訳は `settleMs` 75%、スクロール後の 100 ms 9%、`persistMs` 3%（5 ページの合計。内容が出る fixture では `persistMs` が 1 組あたり 50〜60%）。
- 内容が出ない組（今回の公開ページでは試した 92 組中 91 組）で時間を食うのは `settleMs`。ここは「新しい内容が出るか」を見る窓なので、出ないことを確かめるには窓を最後まで待つ必要があり、早く打ち切る余地がない。縮められるのは窓の長さだけ。×0.5（200 ms）で一致、×0.25（100 ms）で後退（Wikipedia の検索欄の候補表示が間に合わない）。したがって 200 ms が実測で確かめた下限に近い値。
- `persistMs` は「内容が出たあと消えずに残るか」の判定窓。現在の実装（`runContentOnHoverCheck.ts:1167-1173`）は `persistMs` が経過した時点の可視判定 1 回で `stayed` / `disappeared` を決める。そのため、途中で一度消えて再表示される内容（フェード → 再表示、再マウントなど）は今は `stayed` になるが、途中で消えた時点で打ち切る「早く打ち切る」にすると `disappeared` になり、**判定が変わりうる**。この変更は本スパイクのデータでは裏付けられていないので勧めず、やるなら判定の定義を含めて別途判断する。今回の公開ページでは `persistMs` が効いたのは 1 組だけなので、`persistMs` 自体の短縮も勧めない（標本が少なく、×0.5 で一致したのは 1 組と fixture だけ）。
- `targets` は戻り値から導出できる（判定不能ではない）。

### pointer-cancellation-check

- 時間の 89% が待ちで、要素ごとの 300 ms が 85%。要素数に比例する（約 0.35 秒/要素）。
- 押下後の `settleMs` は「押した直後の変化（遷移・ダイアログ・DOM 変化）」を見る窓。×0.5 と ×0.25 の両方で 5 ページ + fixture 17 件が一致したので、短縮の根拠はある。×0.25 は `slow-navigation` で `restarts` が変わった（内部経路の変化）ので、最初は ×0.5（150 ms）を勧める。
- Wikipedia では `target-limit`（100 件）に達して打ち切られる。これは待ちの設定と無関係な網羅性の問題で、「対象を絞る」でも「待ちを短くする」でも変わらない。この検査の別の課題として残す。
- `targets` は記録方法 B で復元できた（5 ページで押下数が `targetsTested` と一致）。

### auto-play-detection

- 6 秒の固定待ち（2 秒 × 3 回のスクリーンショット間隔）が検出の定義そのもの（5 秒を超えて動き続けるかの判定）。縮めると判定が変わる。**変えない**。
- 感度実験の対象外（引数で変えられない）。

### change-on-input-check

- 欄ごとに `settleMs` を 2 回（欄にフォーカス後と値変更後）。5 ページ合計で待ちは 28%、残りは遷移後の回復など。待ちを縮めても縮むのは最大 3.3 秒（Wikipedia）で、効果が小さい。
- ×0.5（250 ms）は一致、×0.25（125 ms）は Wikipedia で検出が変わった。短縮するなら ×0.5 まで。
- `targets` は記録方法 A で復元できた（試した欄の上位集合）。

### Tab 系 4 検査（keyboard-trap-check / focus-indicator-check / focus-order-check / keyboard-reachability-check）

- Tab ごとの 50 ms が時間の 62〜78%（keyboard-trap-check は Tab を 2 周するので最大）。×0.5 で 36〜44% 短縮、×0.25 でも 5 ページ + fixture で変化なし。×0.5（25 ms）を勧める。
- 4 検査は既定値を同じ定数（`DEFAULT_NAVIGATION_SETTLE_MS`）から取っている。1 検査ずつ変えるなら検査別の定数が必要になる。
- 限界: 今回の標本には「フォーカス後に遅れて動くハンドラ」を持つ実ページがない。focus-indicator-check の `navigationSettleMs` の説明は「フォーカス時に遅れて動くハンドラのあるページでは上げる」とあり、短くするほどそうしたページで 3.2.1（フォーカス時の遷移）を見落とす余地が増える。×0.5 で止めるのはその余裕のため。
- focus-order-check の「ダイアログ後 300 ms」と keyboard-trap-check の「Escape 後 200 ms」は今回の対象外。
- `targets` はいずれも戻り値（focus-indicator-check / focus-order-check / keyboard-reachability-check）か記録方法 A（keyboard-trap-check）で復元できた。

## 6. 次に書くプラン

価値があると判断した順（1 プラン 1 検査）。

1. **pointer-cancellation-check の `settleMs` を 300 → 150 ms に**: 5 ページ合計 −44%（Wikipedia 35.3 → 19.3 秒）。最も効果が大きく、根拠も固い（×0.5 と ×0.25 の両方で一致）。
2. **content-on-hover-check の `settleMs` を 400 → 200 ms に**（`persistMs` は据え置き）: 最も遅い検査（最長 39.6 秒）で、Wikipedia 39.6 → 26.1 秒。×0.25 は不可（100 ms は Wikipedia で後退）。`persistMs` の待ちを途中で打ち切る変更は、判定が変わりうる（第 5 節）ので、このプランには含めない。
3. **Tab 系 4 検査の待ちを 50 → 25 ms に**: 各 −36〜−44%。定数を共有しているので、1 プランで 4 検査を同時に変えるか、検査別の定数を足してから 1 検査ずつにするかを先に決める（優先順位は keyboard-trap-check > focus-indicator-check > focus-order-check ≈ keyboard-reachability-check。Wikipedia で keyboard-trap-check が 37 秒かかる）。
4. **change-on-input-check の `settleMs` を 500 → 250 ms に**: 効果が小さい（最大 3.3 秒）。他の変更のついでなら。

やらない:

- **auto-play-detection の 6 秒を縮める**: 待ちが検出の定義そのもの。
- **content-on-hover-check の `persistMs` を縮める**: 今回の標本では効果がほぼなく（内容が出た組が 1 つ）、「残るか」の判定窓を縮めるリスクに見合わない。
- **「対象を絞る」**: 今回の計測では、代表させてよい条件を裏付けるデータが取れていない。pointer-cancellation-check の `target-limit` や keyboard-trap-check の `tab-walk-capped`（Wikipedia）は網羅性の問題で、時間の問題と別に扱う。
- **×0.25 以下**: content-on-hover-check と change-on-input-check で後退した。Tab 系と pointer-cancellation-check は変化なしだが、遅れて動くハンドラの標本がないので、×0.5 より先には進めない。

### 気づき（スパイクの範囲外。直していない）

- この環境（WSL2）では `Date.now()` が約 30 秒ごとに 3 秒前後巻き戻る。CLI の所要時間表示と検査内部の `timeBudgetMs` は `Date.now()` を使うので、どちらも実際より甘くなる。時間予算や所要時間の回帰テストを書くときは `performance.now()` に寄せるか、この影響を前提にする。
- Wikipedia の keyboard-trap-check は 600 回の Tab で打ち切られ（`tab-walk-capped`）、フォーカス可能 674 要素のうち 252 件にしか止まれていない。待ちを縮めても網羅性は変わらない。
- プランは w3c-wai を「ナビに hover メニューがある実サイト」としていたが、content-on-hover-check は w3c-wai の 16 組、w3c-bad の 39 組のどちらでも内容を 1 組も検出しなかった（すべて `no-content`）。原因は調べていない（検出漏れか、そもそも headless で内容が出ないのか）。
- `slow: true` の印: change-on-input-check は 3 ページ（w3c-good / w3c-wai / mdn）で 1.9〜2.5 秒しかかからない（w3c-bad と Wikipedia は欄を操作して遷移が起きるので 6.6 / 19 秒）。印を見直すかは別の判断。

## 7. 付録

### 生データ

`packages/a11y-audit/test-results/spike-021/`（gitignore 済み）: `baseline-mdn-1.jsonl`, `baseline-mdn-2.jsonl`, `baseline-w3c-bad-1.jsonl`, `baseline-w3c-bad-2.jsonl`, `baseline-w3c-good-1.jsonl`, `baseline-w3c-good-2.jsonl`, `baseline-w3c-wai-1.jsonl`, `baseline-w3c-wai-2.jsonl`, `baseline-wikipedia-1.jsonl`, `baseline-wikipedia-2.jsonl`, `cli-mdn.txt`, `cli-w3c-bad-b.txt`, `cli-w3c-bad.txt`, `cli-w3c-good.txt`, `cli-w3c-wai.txt`, `cli-wikipedia.txt`, `fixture-cohover.jsonl`, `fx-index-2.jsonl`, `fx-index-rec.jsonl`, `persistonly-wikipedia-0.5.jsonl`, `sensitivity-mdn-0.25.jsonl`, `sensitivity-mdn-0.5.jsonl`, `sensitivity-w3c-bad-0.25.jsonl`, `sensitivity-w3c-bad-0.5.jsonl`, `sensitivity-w3c-good-0.25.jsonl`, `sensitivity-w3c-good-0.5.jsonl`, `sensitivity-w3c-wai-0.25.jsonl`, `sensitivity-w3c-wai-0.5.jsonl`, `sensitivity-wikipedia-0.25.jsonl`, `sensitivity-wikipedia-0.5.jsonl`, `settleonly-wikipedia-0.25.jsonl`, `settleonly-wikipedia-0.5.jsonl`。補足の fixture 実験の出力は `out/` 配下。

- `baseline-<page>-<n>.jsonl`: 基準計測（5 ページ × 2 回、各 8 行）
- `sensitivity-<page>-<scale>.jsonl`: 感度実験（5 ページ × 2 スケール、各 7 行）
- `settleonly-*` / `persistonly-*`: content-on-hover-check の `settleMs` だけ、または `persistMs` だけを縮めた追加実験
- `cli-<name>.txt`: CLI（`--checks all --concurrency 1`）の `DONE in` 行（8 検査分）。`w3c-bad-b` は w3c-bad の 2 回目
- `fixture-cohover.jsonl`: content-on-hover の fixture 3 件の scale 1 計測

### 再現手順

```
npm ci
npm run build --workspace @a11y-skills/audit
node packages/a11y-audit/test-results/spike-021/measure.mjs <url> --page <name> --out <file.jsonl> [--settle-scale 0.5] [--persist-scale 1] [--no-record] [--checks a,b]
node packages/a11y-audit/test-results/spike-021/compare.mjs <基準.jsonl> <比較.jsonl>
node packages/a11y-audit/test-results/spike-021/compare.mjs --self-test <file.jsonl>
node packages/a11y-audit/test-results/spike-021/distortion.mjs
node packages/a11y-audit/test-results/spike-021/fixsens.mjs <check>
```

`compare.mjs --self-test` は、同じ JSONL を 2 つ渡すとすべて一致すること、`targets` の 1 要素の `id` を書き換えた複製では `removed` と `added` が 1 件ずつ出て不一致になることを確かめる（作成直後に実行して両方とも PASS）。

### スクリプト全文

#### `measure.mjs`

```js
// Plan 021 spike: time breakdown of the slow checks, without touching src/.
// Usage:
//   node measure.mjs <url> --page <name> --out <file.jsonl>
//        [--settle-scale 0.5] [--record|--no-record] [--checks a,b,...] [--timeout-ms 180000]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../../dist');
const load = (p) => import(pathToFileURL(path.join(dist, p)).href);
const pw = await load('playwright/index.js');
const { gotoAndSettle } = await load('playwright/gotoAndSettle.js');

// ---- args ----
const argv = process.argv.slice(2);
const url = argv[0];
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const pageName = opt('--page', 'page');
const outFile = opt('--out', null);
const scale = Number(opt('--settle-scale', '1'));
const record = !argv.includes('--no-record');
// Optional: scale persistMs separately from the other waits (content-on-hover only).
const persistScale = Number(opt('--persist-scale', opt('--settle-scale', '1')));
const timeoutMs = Number(opt('--timeout-ms', '180000'));
const ALL = [
  'content-on-hover-check',
  'pointer-cancellation-check',
  'auto-play-detection',
  'change-on-input-check',
  'keyboard-trap-check',
  'focus-indicator-check',
  'focus-order-check',
  'keyboard-reachability-check',
];
const selected = opt('--checks', ALL.join(',')).split(',');
if (!url) throw new Error('url required');

// ---- in-page simple selector (tag + :nth-child chain, shadow roots joined by " >> ") ----
function simpleSel(el) {
  const seg = (n) => {
    const p = n.parentNode;
    if (!p || !p.children) return n.localName;
    return n.localName + ':nth-child(' + (Array.prototype.indexOf.call(p.children, n) + 1) + ')';
  };
  const parts = [];
  let n = el;
  while (n) {
    const chain = [];
    while (n && n.nodeType === 1) {
      chain.unshift(seg(n));
      n = n.parentNode;
    }
    parts.unshift(chain.join('>'));
    if (n && n.host) n = n.host;
    else break;
  }
  const f = window.top !== window ? '[frame ' + location.pathname + '] ' : '';
  return f + parts.join(' >> ');
}
const SIMPLE_SRC = simpleSel.toString();

// ---- instrumentation ----
function instrument(page, stats) {
  const wait = page.waitForTimeout.bind(page);
  page.waitForTimeout = async (ms) => {
    stats.waits += 1;
    stats.waitMs += ms;
    stats.byMs[ms] = (stats.byMs[ms] ?? 0) + 1;
    return wait(ms);
  };
  return page;
}

const launch = () => chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
let browser = await launch();
const chromiumVersion = browser.version();

async function newInstrumentedContext(stats, rec, recordMethod) {
  const context = await browser.newContext();
  stats.contexts.push(context);
  const newPage = context.newPage.bind(context);
  context.newPage = async () => instrument(await newPage(), stats);
  if (recordMethod === 'A') {
    await context.exposeBinding('__spike021Focus', (_src, sel) => rec.focus.add(sel));
    await context.addInitScript({
      content: `(() => { const simple = ${SIMPLE_SRC};
        window.addEventListener('focusin', (e) => { try { const t = e.composedPath()[0];
          if (t && t.nodeType === 1 && window.__spike021Focus) window.__spike021Focus(simple(t)); } catch {} }, true); })();`,
    });
  } else if (recordMethod === 'B') {
    await context.exposeBinding('__spike021Press', (_src, sel) => rec.press.add(sel));
    await context.addInitScript({
      content: `(() => { const simple = ${SIMPLE_SRC};
        const orig = EventTarget.prototype.dispatchEvent;
        EventTarget.prototype.dispatchEvent = function (ev) { try {
          if (ev && ev.isTrusted === false && /^(pointerdown|mousedown|touchstart)$/.test(ev.type) &&
              this && this.nodeType === 1 && window.__spike021Press) window.__spike021Press(simple(this));
        } catch {} return orig.call(this, ev); }; })();`,
    });
  }
  return context;
}

/** Resolve check-side selectors to the simple ids in a fresh page (not timed). */
async function resolveIds(items) {
  const out = new Map();
  if (items.length === 0) return out;
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await gotoAndSettle(page, url);
    const res = await page.evaluate(`(() => {
      const simple = ${SIMPLE_SRC};
      return ${JSON.stringify(items)}.map(({ shadowHosts, selector }) => {
        try {
          let root = document;
          for (const h of shadowHosts) { const el = root.querySelector(h); root = el && el.shadowRoot; if (!root) return null; }
          const el = root.querySelector(selector);
          return el ? simple(el) : null;
        } catch { return null; }
      });
    })()`);
    items.forEach((it, i) => out.set(it.shadowHosts.join(' >> ') + '\u0000' + it.selector, res[i]));
  } finally {
    await context.close();
  }
  return out;
}
const keyOf = (hosts, sel) => hosts.join(' >> ') + '\u0000' + sel;
const rawId = (hosts, sel) => (hosts.length ? hosts.join(' >> ') + ' >> ' : '') + sel;

// ---- per-check definitions ----
const k = scale;
const S = (v) => v * k;
const DEFS = {
  'content-on-hover-check': {
    fn: 'runContentOnHoverCheck',
    opts: () => (k === 1 && persistScale === 1 ? {} : { settleMs: S(400), persistMs: 3000 * persistScale }),
  },
  'pointer-cancellation-check': {
    fn: 'runPointerCancellationCheck',
    opts: () => (k === 1 ? {} : { settleMs: S(300) }),
    method: 'B',
  },
  'auto-play-detection': { fn: 'runAutoPlayDetection', kind: 'page', opts: () => ({}) },
  'change-on-input-check': {
    fn: 'runChangeOnInputCheck',
    opts: () => (k === 1 ? {} : { settleMs: S(500) }),
    method: 'A',
  },
  'keyboard-trap-check': {
    fn: 'runKeyboardTrapCheck',
    opts: () => (k === 1 ? {} : { walkSettleMs: S(50) }),
    method: 'A',
  },
  'focus-indicator-check': {
    fn: 'runFocusIndicatorCheck',
    opts: () => (k === 1 ? {} : { navigationSettleMs: S(50) }),
  },
  'focus-order-check': {
    fn: 'runFocusOrderCheck',
    opts: () => (k === 1 ? {} : { settleMs: S(50) }),
  },
  'keyboard-reachability-check': {
    fn: 'runKeyboardReachabilityCheck',
    opts: () => (k === 1 ? {} : { walkSettleMs: S(50) }),
  },
};

// ---- envelope -> nodes / rules ----
function envelope(result) {
  const nodes = new Set();
  const rules = {};
  for (const bucket of ['violations', 'incomplete', 'passes']) {
    for (const r of result[bucket] ?? []) {
      const b = bucket === 'violations' ? 'violation' : bucket === 'passes' ? 'pass' : 'incomplete';
      rules[r.id] = (rules[r.id] ? rules[r.id] + ',' : '') + `${b}:${r.nodes.length}`;
      if (r.nodes.length === 0) nodes.add(`${b}|${r.id}|`);
      for (const n of r.nodes) nodes.add(`${b}|${r.id}|${n.target.join(' >> ')}`);
    }
  }
  return { nodes: [...nodes].sort(), rules };
}

const uniq = (a) => [...new Set(a)].sort();
const focusId = (r) =>
  (r.frame ? `[frame ${r.frame.selector ?? r.frame.url}] ` : '') + rawId(r.shadowHosts ?? [], r.selector);

// ---- per-check extraction ----
async function extract(name, result, rec) {
  const d = result.details;
  const x = { elements: null, aborted: null, extra: {}, targets: null, untested: [], counts: {} };
  switch (name) {
    case 'content-on-hover-check': {
      const untested = d.untested.map((u) => ({ id: `${u.trigger}|${u.method}`, reason: u.reason }));
      const skip = new Set(untested.map((u) => u.id));
      const resMap = new Map(d.results.map((r) => [`${r.trigger}|${r.method}`, r]));
      const targets = [];
      // Pair rule (runContentOnHoverCheck.ts:1051-1056): hover always, focus when focusTarget !== null.
      for (const t of d.triggers) {
        for (const method of t.focusTarget !== null ? ['hover', 'focus'] : ['hover']) {
          const id = `${t.selector}|${method}`;
          if (skip.has(id)) continue;
          const r = resMap.get(id);
          targets.push({
            id,
            outcome: r
              ? `${r.persistent}/${r.dismissible}/${r.hoverable}${r.escapeMovedFocus ? '/escapeMovedFocus' : ''}`
              : 'no-content',
          });
        }
      }
      x.elements = d.triggers.length;
      x.aborted = d.aborted;
      x.targets = targets;
      x.untested = untested;
      x.extra = { pairsTried: targets.length, contentShown: d.results.length };
      x.counts = {
        'triggers.length': d.triggers.length,
        'delegationRoots.length': d.delegationRoots.length,
        triggersTruncated: d.triggersTruncated,
        noContent: d.noContent,
        results: d.results.length,
        untested: d.untested.length,
        reloads: d.reloads,
      };
      break;
    }
    case 'pointer-cancellation-check': {
      const items = [
        ...d.findings.map((f) => ({ shadowHosts: f.target.shadowHosts, selector: f.target.selector })),
      ];
      const resolved = rec ? await resolveIds(items) : new Map();
      const idOf = (hosts, sel) => resolved.get(keyOf(hosts, sel)) ?? 'raw:' + rawId(hosts, sel);
      const outcomes = new Map();
      for (const f of d.findings) {
        const kinds = uniq(f.changes.map((c) => c.kind)).join('+');
        outcomes.set(idOf(f.target.shadowHosts, f.target.selector), `${f.kind}:${kinds}`);
      }
      if (rec) {
        const ids = new Set([...rec.press, ...outcomes.keys()]);
        x.targets = [...ids].sort().map((id) => ({ id, outcome: outcomes.get(id) ?? 'no-change' }));
      }
      x.elements = d.targetsTested;
      x.aborted = d.aborted;
      x.untested = d.untested.map((u) => ({ id: rawId(u.target.shadowHosts, u.target.selector), reason: u.reason }));
      x.extra = { targetsFound: d.targetsFound, pressedRecorded: rec ? rec.press.size : null };
      x.counts = {
        targetsFound: d.targetsFound,
        targetsTested: d.targetsTested,
        delegationRootCount: d.delegationRootCount,
        'pageListeners.length': d.pageListeners.length,
        findings: d.findings.length,
        untested: d.untested.length,
        restarts: d.restarts,
      };
      break;
    }
    case 'change-on-input-check': {
      const items = [
        ...d.findings.map((f) => f.control.selector),
        ...d.skipped.map((s) => s.selector),
        ...d.untested.map((u) => u.control.selector),
      ].map((selector) => ({ shadowHosts: [], selector }));
      const resolved = rec ? await resolveIds(items) : new Map();
      const idOf = (sel) => resolved.get(keyOf([], sel)) ?? 'raw:' + sel;
      const outcomes = new Map();
      for (const s of d.skipped) outcomes.set(idOf(s.selector), `skipped:${s.reason}`);
      for (const f of d.findings) outcomes.set(idOf(f.control.selector), uniq(f.changes.map((c) => c.kind)).join('+'));
      if (rec) {
        const ids = new Set([...rec.focus, ...outcomes.keys()]);
        x.targets = [...ids].sort().map((id) => ({ id, outcome: outcomes.get(id) ?? 'no-change' }));
      }
      x.elements = d.controlsTested;
      x.aborted = d.aborted;
      x.untested = [
        ...d.untested.map((u) => ({ id: u.control.selector, reason: u.reason })),
        ...d.skipped.map((s) => ({ id: s.selector, reason: 'skipped:' + s.reason })),
      ];
      x.extra = { controlsFound: d.controlsFound, focusRecorded: rec ? rec.focus.size : null };
      x.counts = {
        controlsFound: d.controlsFound,
        controlsTested: d.controlsTested,
        findings: d.findings.length,
        skipped: d.skipped.length,
        untested: d.untested.length,
        restarts: d.restarts,
      };
      break;
    }
    case 'keyboard-trap-check': {
      const items = [...d.confirmedTraps, ...d.needsReview].map((e) => ({ shadowHosts: [], selector: e.selector }));
      const resolved = rec ? await resolveIds(items) : new Map();
      const idOf = (sel) => resolved.get(keyOf([], sel)) ?? 'raw:' + sel;
      const outcomes = new Map();
      for (const e of d.needsReview) outcomes.set(idOf(e.selector), 'needs-review');
      for (const e of d.confirmedTraps) outcomes.set(idOf(e.selector), 'confirmed');
      if (rec) {
        const ids = new Set([...rec.focus, ...outcomes.keys()]);
        x.targets = [...ids].sort().map((id) => ({ id, outcome: outcomes.get(id) ?? 'passed' }));
      }
      x.elements = d.totalFocusableElements;
      x.aborted = d.tabWalkCapped ? { reason: 'tab-walk-capped' } : null;
      x.untested = d.tabWalkCapped ? [{ id: 'tabWalkCapped', reason: 'true' }] : [];
      x.extra = { focusRecorded: rec ? rec.focus.size : null };
      x.counts = {
        totalFocusableElements: d.totalFocusableElements,
        trapCandidates: d.trapCandidates,
        confirmedTraps: d.confirmedTraps.length,
        needsReview: d.needsReview.length,
      };
      break;
    }
    case 'focus-indicator-check': {
      const tag = new Map();
      const add = (r, v) => tag.set(focusId(r), [...(tag.get(focusId(r)) ?? []), v]);
      for (const i of d.issues) add(i, 'no-focus-style');
      for (const i of d.onFocusViolations) add(i.element, 'on-focus-violation');
      for (const i of d.focusObscuredIssues) add(i.element, i.fullyObscured ? 'obscured-full' : 'obscured-part');
      x.targets = uniq(d.allElements.map(focusId)).map((id) => ({
        id,
        outcome: tag.has(id) ? uniq(tag.get(id)).join('+') : 'passed',
      }));
      x.elements = d.allElements.length;
      x.aborted = d.aborted ?? null;
      x.untested = [];
      if (d.aborted) x.untested.push({ id: 'notRecorded', reason: String(d.aborted.focusableCount - d.aborted.recordedCount) });
      if (d.interrupted) x.untested.push({ id: 'interrupted', reason: 'true' });
      if (d.unidentifiedNavigation) x.untested.push({ id: 'unidentifiedNavigation', reason: 'true' });
      x.extra = { totalFocusableElements: d.totalFocusableElements };
      x.counts = {
        totalFocusableElements: d.totalFocusableElements,
        allElements: d.allElements.length,
        issues: d.issues.length,
        onFocusViolations: d.onFocusViolations.length,
        focusObscuredIssues: d.focusObscuredIssues.length,
      };
      break;
    }
    case 'focus-order-check': {
      x.targets = [
        ...d.stops.map((s) => ({
          id: `${s.step}|${rawId(s.shadowHosts, s.selector)}`,
          outcome: [s.positioning, s.revisit ? 'revisit' : null, s.afterWrap ? 'afterWrap' : null, s.inFrame ? 'inFrame' : null]
            .filter(Boolean)
            .join('/'),
        })),
        ...d.dialogs.map((p) => ({
          id: `dialog:${p.trigger.selector}`,
          outcome: `${p.status}/${p.focusAfterOpen}/${p.focusAfterClose}`,
        })),
      ];
      x.elements = d.stops.length;
      x.aborted = d.aborted;
      x.untested = [];
      if (d.dialogsNotTried) x.untested.push({ id: 'dialogsNotTried', reason: String(d.dialogsNotTried) });
      if (d.dialogSearch !== 'ran') x.untested.push({ id: 'dialogSearch', reason: d.dialogSearch });
      if (d.tabWalk.capped) x.untested.push({ id: 'tabWalk.capped', reason: d.tabWalk.ended });
      x.extra = { focusableCount: d.tabWalk.focusableCount, presses: d.tabWalk.presses, ended: d.tabWalk.ended, dialogTriggersFound: d.dialogTriggersFound };
      x.counts = {
        stops: d.stops.length,
        focusableCount: d.tabWalk.focusableCount,
        presses: d.tabWalk.presses,
        dialogs: d.dialogs.length,
        dialogTriggersFound: d.dialogTriggersFound,
      };
      break;
    }
    case 'keyboard-reachability-check': {
      x.targets = d.elements.map((e) => ({
        id: rawId([], e.selector),
        outcome: e.reachedBy + (e.foundIn === 'popup' ? '/popup' : ''),
      }));
      x.elements = d.totalOperableElements;
      x.aborted = d.aborted;
      x.untested = [];
      if (d.notEvaluatedCount) x.untested.push({ id: 'notEvaluatedCount', reason: String(d.notEvaluatedCount) });
      if (d.tabWalkCapped) x.untested.push({ id: 'tabWalkCapped', reason: 'true' });
      x.extra = { reached: d.reachedCount, unreachable: d.unreachableCount };
      x.counts = {
        totalOperableElements: d.totalOperableElements,
        reachedCount: d.reachedCount,
        unreachableCount: d.unreachableCount,
        notEvaluatedCount: d.notEvaluatedCount,
        elements: d.elements.length,
        popups: d.popups.length,
      };
      break;
    }
    case 'auto-play-detection': {
      x.targets = d.mediaElements.map((m) => ({
        id: focusId({ frame: m.frame, shadowHosts: m.shadowHosts, selector: m.selector }),
        outcome: `autoplay=${m.autoplay}/paused=${m.paused}/muted=${m.muted}`,
      }));
      x.elements = d.mediaElements.length;
      x.extra = { hasAutoPlayContent: d.hasAutoPlayContent, stopsWithin5Seconds: d.stopsWithin5Seconds };
      x.counts = { mediaElements: d.mediaElements.length, unmeasuredFrames: d.unmeasuredFrames };
      break;
    }
  }
  return x;
}

// ---- run one check ----
async function runOne(name) {
  const def = DEFS[name];
  const stats = { waits: 0, waitMs: 0, byMs: {}, contexts: [] };
  const rec = record && def.method ? { focus: new Set(), press: new Set() } : null;
  const outputDir = path.join(here, 'out', name);
  fs.mkdirSync(outputDir, { recursive: true });
  const base = { writeResult: false, quiet: true, outputDir };
  const t0 = performance.now();
  let timer;
  const run = (async () => {
    if (def.kind === 'page') {
      const context = await newInstrumentedContext(stats, rec, null);
      const page = await context.newPage();
      await gotoAndSettle(page, url);
      try {
        return await pw[def.fn]({ ...base, page, ...def.opts() });
      } finally {
        await context.close().catch(() => {});
      }
    }
    return pw[def.fn]({
      ...base,
      targetUrl: url,
      createContext: () => newInstrumentedContext(stats, rec, rec ? def.method : null),
      ...def.opts(),
    });
  })();
  run.catch(() => {});
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error('timeout')), timeoutMs);
  });
  const row = { page: pageName, check: name, scale, record: !!rec, chromium: chromiumVersion };
  try {
    const result = await Promise.race([run, timeout]);
    row.durationMs = Math.round(performance.now() - t0);
    Object.assign(row, { waits: stats.waits, waitMs: stats.waitMs, byMs: stats.byMs });
    const env = envelope(result);
    const x = await extract(name, result, rec);
    row.elements = x.elements;
    row.aborted = x.aborted;
    row.summary = result.summary;
    row.rules = env.rules;
    row.nodes = env.nodes;
    row.targets = x.targets;
    row.untested = x.untested;
    row.counts = x.counts;
    row.extra = x.extra;
  } catch (e) {
    row.durationMs = Math.round(performance.now() - t0);
    Object.assign(row, { waits: stats.waits, waitMs: stats.waitMs, byMs: stats.byMs });
    row.error = e.message === 'timeout' ? 'timeout' : String(e.message).split('\n')[0];
    for (const c of stats.contexts) await c.close().catch(() => {});
    if (row.error === 'timeout') {
      // The timed-out check keeps running in the background; drop the whole browser so it cannot disturb the next check.
      await browser.close().catch(() => {});
      browser = await launch();
    }
  } finally {
    clearTimeout(timer);
  }
  const line = JSON.stringify(row);
  console.log(line);
  if (outFile) fs.appendFileSync(outFile, line + '\n');
}

for (const name of selected) await runOne(name);
await browser.close();
```

#### `compare.mjs`

```js
// Plan 021 spike: compare two measure.mjs outputs as sets.
// Usage: node compare.mjs <base.jsonl> <other.jsonl>
//        node compare.mjs --self-test <file.jsonl>
import fs from 'node:fs';

const readRows = (f) =>
  fs
    .readFileSync(f, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

function setDiff(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  const removed = [...A].filter((x) => !B.has(x)).sort();
  const added = [...B].filter((x) => !A.has(x)).sort();
  return { same: removed.length === 0 && added.length === 0, removed, added };
}

/** items: [{id, <field>}] -> id -> field. null on either side means "could not be judged". */
function mapDiff(a, b, field) {
  if (a == null || b == null) return { same: null, note: 'undetermined (targets not recovered)' };
  const A = new Map(a.map((x) => [x.id, x[field]]));
  const B = new Map(b.map((x) => [x.id, x[field]]));
  const removed = [...A.keys()].filter((k) => !B.has(k)).sort();
  const added = [...B.keys()].filter((k) => !A.has(k)).sort();
  const changed = [...A.keys()]
    .filter((k) => B.has(k) && A.get(k) !== B.get(k))
    .sort()
    .map((id) => ({ id, from: A.get(id), to: B.get(id) }));
  return { same: !removed.length && !added.length && !changed.length, removed, added, changed };
}

export function compare(baseRows, otherRows) {
  const out = [];
  for (const base of baseRows) {
    const other = otherRows.find((r) => r.check === base.check);
    if (!other) continue;
    if (base.error || other.error) {
      out.push({ check: base.check, error: { base: base.error ?? null, other: other.error ?? null } });
      continue;
    }
    const counts = {};
    for (const key of new Set([...Object.keys(base.counts ?? {}), ...Object.keys(other.counts ?? {})])) {
      if (base.counts?.[key] !== other.counts?.[key]) counts[key] = { base: base.counts?.[key], other: other.counts?.[key] };
    }
    out.push({
      check: base.check,
      nodes: setDiff(base.nodes, other.nodes),
      targets: mapDiff(base.targets, other.targets, 'outcome'),
      untested: mapDiff(base.untested, other.untested, 'reason'),
      aborted: {
        same: JSON.stringify(base.aborted) === JSON.stringify(other.aborted),
        base: base.aborted,
        other: other.aborted,
      },
      counts: { same: Object.keys(counts).length === 0, diff: counts },
      durationMs: { base: base.durationMs, other: other.durationMs },
    });
  }
  return out;
}

/**
 * Flake attribution: are the differences between base run 1 and a sensitivity run
 * exactly (or only) the differences already seen between base run 1 and base run 2?
 * Compares the full id sets of removed / added targets (no truncation).
 */
export function flakeAttribution(base1Row, base2Row, otherRow) {
  const [flake] = compare([base1Row], [base2Row]);
  const [sens] = compare([base1Row], [otherRow]);
  const ids = (r) => [...r.targets.removed.map((x) => '-' + x), ...r.targets.added.map((x) => '+' + x), ...r.targets.changed.map((c) => '~' + c.id)];
  const f = new Set(ids(flake));
  const s = ids(sens);
  const outside = s.filter((x) => !f.has(x));
  return {
    flakeDiffCount: f.size,
    sensDiffCount: s.length,
    sameSet: s.length === f.size && outside.length === 0,
    outsideFlakeCount: outside.length,
    outsideFlake: outside,
  };
}

const isMain =import.meta.url === new URL('file://' + process.argv[1]).href;
if (!isMain) {
  // imported as a module (analyze.mjs): export only
} else if (process.argv[2] === '--flake') {
  // node compare.mjs --flake <base1.jsonl> <base2.jsonl> <sens.jsonl> : per check, is the sens diff the same id set as the base1<->base2 diff?
  const [b1, b2, so] = process.argv.slice(3).map(readRows);
  for (const row of b1) {
    const r2 = b2.find((x) => x.check === row.check);
    const ro = so.find((x) => x.check === row.check);
    if (!r2 || !ro || row.error || r2.error || ro.error || !row.targets || !r2.targets || !ro.targets) continue;
    const a = flakeAttribution(row, r2, ro);
    if (a.flakeDiffCount || a.sensDiffCount) console.log(JSON.stringify({ check: row.check, ...a }));
  }
} else if (process.argv[2] === '--self-test') {
  const rows = readRows(process.argv[3]);
  let ok = true;
  const same = compare(rows, rows);
  for (const r of same) {
    if (r.error) continue;
    const pass = r.nodes.same && r.targets.same !== false && r.untested.same !== false && r.aborted.same && r.counts.same;
    if (!pass) ok = false;
  }
  console.log(`identical-input: ${ok ? 'PASS' : 'FAIL'} (${same.length} checks)`);
  const row = rows.find((r) => r.targets && r.targets.length > 0);
  if (!row) {
    console.log('rename-test: SKIP (no row with targets)');
    process.exit(ok ? 0 : 1);
  }
  const clone = JSON.parse(JSON.stringify(row));
  const orig = clone.targets[0].id;
  clone.targets[0].id = orig + '#renamed';
  const [r] = compare([row], [clone]);
  const pass = r.targets.same === false && r.targets.removed.length === 1 && r.targets.added.length === 1 && r.targets.changed.length === 0;
  console.log(`rename-test(${row.check}): ${pass ? 'PASS' : 'FAIL'} removed=${JSON.stringify(r.targets.removed.length)} added=${JSON.stringify(r.targets.added.length)}`);
  process.exit(ok && pass ? 0 : 1);
} else {
  for (const line of compare(readRows(process.argv[2]), readRows(process.argv[3]))) console.log(JSON.stringify(line));
}
```

#### `distortion.mjs`

```js
// Record-on vs record-off distortion check on fixtures (Plan 021 step 2).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = path.resolve(here, '../../test/fixtures');
// All fixtures of the three checks that use / are close to the recording methods, plus the trap fixtures and index.html.
const dirCases = (dir, check) => fs.readdirSync(path.join(fx, 'pages', dir)).filter((f) => f.endsWith('.html')).sort().map((f) => ['pages/' + dir + '/' + f, check]);
const cases = [
  ...dirCases('pointer-cancellation', 'pointer-cancellation-check'),
  ...dirCases('change-on-input', 'change-on-input-check'),
  ...dirCases('content-on-hover', 'content-on-hover-check'),
  ...dirCases('keyboard-trap', 'keyboard-trap-check'),
  ['keyboard-trap-modal.html', 'keyboard-trap-check'],
  ['keyboard-trap-true.html', 'keyboard-trap-check'],
  ['keyboard-trap-none.html', 'keyboard-trap-check'],
  ['index.html', 'keyboard-trap-check'],
  ['index.html', 'pointer-cancellation-check'],
];
const only = process.argv[2];
let bad = 0;
for (const [file, check] of cases) {
  if (only && !file.includes(only)) continue;
  const rows = {};
  for (const mode of ['--record', '--no-record']) {
    const out = path.join(here, 'out', `distortion-${file.replace(/\W+/g, '_')}-${check}${mode}.jsonl`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, '');
    execFileSync('node', [path.join(here, 'measure.mjs'), 'file://' + path.join(fx, file), '--page', file, '--checks', check, mode, '--out', out], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    rows[mode] = JSON.parse(fs.readFileSync(out, 'utf8').trim().split('\n')[0]);
  }
  const a = rows['--record'];
  const b = rows['--no-record'];
  const nodesSame = JSON.stringify(a.nodes) === JSON.stringify(b.nodes);
  const countsSame = JSON.stringify(a.counts) === JSON.stringify(b.counts);
  const errSame = a.error === b.error;
  if (!nodesSame || !countsSame || !errSame) bad += 1;
  console.log(
    JSON.stringify({
      file,
      check,
      nodesSame,
      countsSame,
      errSame,
      error: a.error ?? null,
      targetsRecorded: a.targets ? a.targets.length : null,
      counts: a.counts,
      countsNoRecord: countsSame ? undefined : b.counts,
    }),
  );
}
console.log(bad === 0 ? 'DISTORTION-CHECK: ALL MATCH' : `DISTORTION-CHECK: ${bad} MISMATCH`);
```

#### `fixsens.mjs`

```js
// Supplementary: positive-case sensitivity on repo fixtures (real pages showed almost no findings).
// Usage: node fixsens.mjs <check> -> prints nodes/targets/untested diff of scale 0.5 / 0.25 against scale 1.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare } from './compare.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = path.resolve(here, '../../test/fixtures/pages');
const SETS = {
  'pointer-cancellation-check': ['background-ticker', 'cancel-dialog', 'click-only', 'delegated', 'focus-self', 'mousedown-alert', 'mousedown-navigates', 'mousedown-window-open', 'pointerdown-opens-menu', 'pointerdown-prevented', 'press-and-click', 'press-only-silent', 'removes-next', 'shadow', 'slow-navigation', 'slow-ticker', 'style-feedback'].map((n) => 'pointer-cancellation/' + n),
  'change-on-input-check': ['checkbox-popup', 'focus-delayed', 'focus-dialog', 'focus-navigates', 'focus-on-focus', 'select-alert', 'select-async-focus', 'select-navigates', 'text-autoadvance', 'text-change-focus', 'text-navigates-on-input', 'text-submit-on-change'].map((n) => 'change-on-input/' + n),
  'content-on-hover-check': ['aria-hidden-tooltip', 'auto-hide', 'compliant-tooltip', 'css-hover-menu', 'css-nested-menu', 'escape-blurs', 'focus-only', 'focus-within', 'inserts-sibling', 'no-escape', 'not-hoverable', 'scroll-reveal', 'stuck'].map((n) => 'content-on-hover/' + n),
  'keyboard-trap-check': ['capped', 'clear-modal', 'clear', 'finding', 'needs-review'].map((n) => 'keyboard-trap/' + n),
  'focus-indicator-check': ['autofocus-then-tab', 'finding-context-change', 'finding-focus-obscured', 'finding-focus-visible', 'focus-obscured-with-retry', 'frames-and-shadow', 'interrupted', 'tab-order-positions'].map((n) => 'focus-indicator/' + n),
  'focus-order-check': ['autofocus', 'backward-block', 'columns', 'detour', 'dialog-good', 'dialog-mixed', 'dialog-no-return', 'dialog-focus-outside', 'dialog-navigates', 'first-focus-navigates', 'hash-dialog', 'redirect-after-load', 'shadow'].map((n) => 'focus-order/' + n),
  'keyboard-reachability-check': ['finding', 'popups', 'popup-reload', 'reload', 'navigation', 'side-effects', 'edge-cases'].map((n) => 'keyboard-reachability/' + n),
};
const check = process.argv[2];
const short = (s) => (s.length > 100 ? s.slice(0, 97) + '...' : s);
for (const name of SETS[check]) {
  const rows = {};
  for (const k of ['1', '0.5', '0.25']) {
    const out = path.join(here, 'out', `fixsens-${name.replace('/', '_')}-${k}.jsonl`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, '');
    execFileSync('node', [path.join(here, 'measure.mjs'), 'file://' + path.join(fx, name + '.html'), '--page', name, '--checks', check, '--settle-scale', k, '--out', out], { stdio: ['ignore', 'ignore', 'inherit'] });
    rows[k] = JSON.parse(fs.readFileSync(out, 'utf8').trim().split('\n')[0]);
  }
  for (const k of ['0.5', '0.25']) {
    const [r] = compare([rows['1']], [rows[k]]);
    if (r.error) {
      console.log(name, k, 'ERROR', JSON.stringify(r.error));
      continue;
    }
    const f = (x) => (x.same === null ? 'N/A' : x.same ? 'same' : `DIFF(-${x.removed.length}/+${x.added.length}/~${(x.changed ?? []).length})`);
    console.log(name.padEnd(42), k.padEnd(4), `dur ${(r.durationMs.base / 1000).toFixed(1)}->${(r.durationMs.other / 1000).toFixed(1)}s`, `nodes=${f(r.nodes)} targets=${f(r.targets)} untested=${f(r.untested)} aborted=${r.aborted.same ? 'same' : 'DIFF'} counts=${r.counts.same ? 'same' : JSON.stringify(r.counts.diff)}`, `baseNodes=${rows['1'].nodes.length}`);
    for (const key of ['nodes', 'targets', 'untested']) {
      const x = r[key];
      if (x.same === false) {
        for (const id of x.removed.slice(0, 2)) console.log('     ', key, '-', short(id));
        for (const id of x.added.slice(0, 2)) console.log('     ', key, '+', short(id));
        for (const c of (x.changed ?? []).slice(0, 2)) console.log('     ', key, '~', short(c.id), c.from, '=>', c.to);
      }
    }
  }
}
```

#### `cli.mjs`

```js
// Run the real CLI sequentially (--concurrency 1) and keep only the "[name] DONE in" lines of the 8 target checks.
// Usage: node cli.mjs <url> <name> -> writes cli-<name>.txt next to this script
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const [url, name] = process.argv.slice(2);
const cli = path.resolve(here, '../../dist/cli.js');
const r = spawnSync('node', [cli, '--url', url, '--checks', 'all', '--concurrency', '1', '--output-dir', path.join(here, 'cli-' + name)], {
  encoding: 'utf8',
  maxBuffer: 1 << 28,
});
const targets = ['content-on-hover-check', 'pointer-cancellation-check', 'auto-play-detection', 'change-on-input-check', 'keyboard-trap-check', 'focus-indicator-check', 'focus-order-check', 'keyboard-reachability-check'];
const lines = (r.stdout + '\n' + r.stderr).split('\n').filter((l) => /DONE in/.test(l) && targets.some((t) => l.includes('[' + t + ']')));
fs.writeFileSync(path.join(here, `cli-${name}.txt`), lines.join('\n') + '\n');
console.log(name, 'exit', r.status);
console.log(lines.join('\n'));
```

#### `summarize.mjs`

```js
// Print a compact table for one or more jsonl files (no page content).
import fs from 'node:fs';
for (const f of process.argv.slice(2)) {
  console.log('# ' + f.split('/').pop());
  for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(l);
    console.log(
      [
        r.check.padEnd(28),
        String(r.durationMs).padStart(7),
        'waits=' + r.waits,
        'waitMs=' + r.waitMs,
        'ok=' + (r.waitMs <= r.durationMs),
        'el=' + r.elements,
        'abort=' + (r.aborted ? r.aborted.reason : '-'),
        'tg=' + (r.targets ? r.targets.length : 'null'),
        'nodes=' + (r.nodes ? r.nodes.length : '-'),
        'unt=' + (r.untested ? r.untested.length : '-'),
        r.error ? 'ERROR=' + r.error : '',
        'by=' + JSON.stringify(r.byMs),
      ].join(' '),
    );
  }
}
```

#### `report.mjs`

```js
// Summarize compare.mjs output compactly. Usage: node report.mjs <base.jsonl> <other.jsonl> [--detail]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const detail = process.argv.includes('--detail');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const out = execFileSync('node', [path.join(here, 'compare.mjs'), args[0], args[1]], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const f = (x) => (x.same === null ? 'N/A' : x.same ? 'same' : `DIFF(-${x.removed.length}/+${x.added.length}${x.changed ? '/~' + x.changed.length : ''})`);
for (const r of out) {
  if (r.error) {
    console.log(r.check, 'ERROR', JSON.stringify(r.error));
    continue;
  }
  console.log(
    r.check.padEnd(28),
    'nodes=' + f(r.nodes),
    'targets=' + f(r.targets),
    'untested=' + f(r.untested),
    'aborted=' + (r.aborted.same ? 'same' : 'DIFF ' + JSON.stringify([r.aborted.base, r.aborted.other])),
    'counts=' + (r.counts.same ? 'same' : 'DIFF ' + JSON.stringify(r.counts.diff)),
    `dur ${r.durationMs.base}->${r.durationMs.other}`,
  );
  if (detail) {
    for (const k of ['nodes', 'targets', 'untested']) {
      const x = r[k];
      if (x.same === false) console.log('   ', k, JSON.stringify({ removed: x.removed.slice(0, 8), added: x.added.slice(0, 8), changed: (x.changed ?? []).slice(0, 8) }));
    }
  }
}
```

#### `analyze.mjs`

```js
// Aggregate views for the result document. Usage: node analyze.mjs <breakdown|waits|sens|cli>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare } from './compare.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const pages = ['w3c-bad', 'w3c-good', 'w3c-wai', 'mdn', 'wikipedia'];
const rd = (f) => fs.readFileSync(path.join(here, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const short = (s) => (s.length > 110 ? s.slice(0, 107) + '...' : s);
const mode = process.argv[2];
const sec = (ms) => (ms / 1000).toFixed(1);

if (mode === 'breakdown') {
  for (const p of pages) {
    const a = rd(`baseline-${p}-1.jsonl`);
    const b = rd(`baseline-${p}-2.jsonl`);
    for (const r of a) {
      const r2 = b.find((x) => x.check === r.check);
      const per = r.elements ? (r.durationMs / 1000 / r.elements).toFixed(2) : '-';
      console.log(
        [p, r.check, `dur=${sec(r.durationMs)}s(run2 ${sec(r2.durationMs)}s)`, `wait=${sec(r.waitMs)}s`, `ratio=${((r.waitMs / r.durationMs) * 100).toFixed(0)}%`, `waits=${r.waits}`, `el=${r.elements}`, `s/el=${per}`, `abort=${r.aborted ? r.aborted.reason : '-'}`, `err=${r.error ?? '-'}`].join(' | '),
      );
    }
  }
} else if (mode === 'waits') {
  const byCheck = {};
  for (const p of pages) {
    for (const r of rd(`baseline-${p}-1.jsonl`)) {
      const c = (byCheck[r.check] ??= { dur: 0, wait: 0, byMs: {}, perPage: {} });
      c.dur += r.durationMs;
      c.wait += r.waitMs;
      for (const [ms, n] of Object.entries(r.byMs)) c.byMs[ms] = (c.byMs[ms] ?? 0) + n;
      c.perPage[p] = r.byMs;
    }
  }
  for (const [check, c] of Object.entries(byCheck)) {
    const parts = Object.entries(c.byMs).map(([ms, n]) => `${ms}msx${n}=${sec(ms * n)}s(${((ms * n * 100) / c.dur).toFixed(0)}% of dur)`);
    console.log(check, `totalDur=${sec(c.dur)}s totalWait=${sec(c.wait)}s (${((c.wait * 100) / c.dur).toFixed(0)}%)`, parts.join(' '));
  }
} else if (mode === 'sens') {
  for (const p of pages) {
    const base = rd(`baseline-${p}-1.jsonl`);
    const base2 = rd(`baseline-${p}-2.jsonl`);
    const flaky = compare(base, base2).filter((r) => !r.error && (!r.nodes.same || r.targets.same === false || r.untested.same === false));
    for (const scale of ['0.5', '0.25']) {
      const other = rd(`sensitivity-${p}-${scale}.jsonl`);
      for (const r of compare(base, other)) {
        const fl = flaky.some((f) => f.check === r.check) ? ' FLAKY' : '';
        if (r.error) {
          console.log(p, scale, r.check, 'ERROR', JSON.stringify(r.error));
          continue;
        }
        const f = (x) => (x.same === null ? 'N/A' : x.same ? 'same' : `DIFF(-${x.removed.length}/+${x.added.length}${x.changed ? '/~' + x.changed.length : ''})`);
        console.log(p, scale, r.check, `dur ${sec(r.durationMs.base)}->${sec(r.durationMs.other)}s`, `nodes=${f(r.nodes)} targets=${f(r.targets)} untested=${f(r.untested)}`, `aborted=${r.aborted.same ? 'same' : JSON.stringify([r.aborted.base?.reason, r.aborted.other?.reason])}`, `counts=${r.counts.same ? 'same' : JSON.stringify(r.counts.diff)}${fl}`);
        for (const k of ['nodes', 'targets', 'untested']) {
          const x = r[k];
          if (x.same === false) {
            for (const id of x.removed.slice(0, 3)) console.log('      ', k, '-', short(id));
            for (const id of x.added.slice(0, 3)) console.log('      ', k, '+', short(id));
            for (const c of (x.changed ?? []).slice(0, 3)) console.log('      ', k, '~', short(c.id), c.from, '=>', c.to);
          }
        }
      }
    }
  }
}
```

#### `coi-probe.mjs`

```js
// Probe: what context change does change-on-input find on a page (kinds only, no page text).
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const pw = await import(pathToFileURL(path.resolve(here, '../../dist/playwright/index.js')).href);
const browser = await chromium.launch();
const t0 = performance.now();
const r = await pw.runChangeOnInputCheck({ browser, targetUrl: process.argv[2], writeResult: false, quiet: true, outputDir: path.join(here, 'out', 'coi-probe') });
console.log(Math.round(performance.now() - t0), 'ms', JSON.stringify(r.details.findings.map((f) => ({ kind: f.control.controlKind, changes: f.changes.map((c) => c.kind) }))), 'restarts', r.details.restarts);
await browser.close();
```
