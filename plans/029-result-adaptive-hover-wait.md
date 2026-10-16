# Plan 029 結果: content-on-hover-check の固定の待ちを「ページが始めた動きを待つ」方式に置き換えられるか

- **計画**: `plans/029-spike-adaptive-hover-wait.md`
- **計測日**: 2026-10-16
- **計測環境**: WSL2 上の Chromium（`measure.mjs` は `plans/021-result-slow-check-timing.md` の付録のもの）。1 組ずつ順番に走らせた（並列にしていない）。

## 1. 結論

**(c) 今回はどちらも実装せず、400 ms のままにすることを勧める。** `skip-reset` (b) は mui で判定を変えることがわかり、安全と言えない。動きを待つ方式 (a) は今の試作では見落としと見逃しが出る。どちらも、そのままでは出せる状態ではない。

| 案 | 速さ（表 B。F400 に対する短縮） | 正しさ |
|---|---|---|
| F200（`settleMs` を 200 ms に縮める。Plan 023） | w3c-bad 41%、w3c-wai 38%、wikipedia 36%、mui 38%、tippy 37% | fixture 29 件中 4 件で判定が狂う（表 A）。2 件は中身なし扱い（見落とし）、2 件は `dismissible: stayed` の誤警報 |
| A100（動きを待つ。最低 100 ms、上限 1000 ms） | w3c-bad 59%、w3c-wai 57%、wikipedia 48%、mui 37%、tippy 37%。F200 より短いのは w3c-bad（6.6 秒）、w3c-wai（3.2 秒）、wikipedia（4.8 秒）だけで、mui（37.7 対 37.4 秒）と tippy（15.4 対 15.3 秒）は F200 と同じ | F200 が狂う 4 件は直る。ただし **`auto-hide`（700 ms 後に自分で消える中身）を見落とし**、`requestAnimationFrame` のフェードは拾えず `hoverable: stayed`（見逃し）になる |
| SKIP（待ちは 400 ms のまま、中身が出なかった組の後のリセットの待ちだけ省く） | w3c-bad 40%、w3c-wai 39%、wikipedia 34%、tippy 33%、mui 24% | fixture 29 件は一致するが、**fixture は SKIP をほとんど試していない**（下記）。mui で 3 回中 2 回、判定が変わった（下記） |

bootstrap-tooltip は上の割合から外した。F400 でも `timeBudgetMs` を使い切って打ち切られる（136 秒）ページで、速い設定ほど先の組まで進むため、秒数が「速さ」を表さない。実際、A100 は F400 より 9 組多く試して 143.4 秒、F200 は 3 組多く試して 126.9 秒かかった（F400 は 136.1 秒）。共通の組の食い違いは 0 だった。

### SKIP が安全でない理由（mui の食い違いの調査）

1. **再現は決まっていない。** mui-tooltip で F400 は 3 回（F400 / F400b / F400c）とも中身が出た組が 0。SKIP は 3 回（SKIP / SKIP2 / SKIP3）のうち 2 回で、`ul > li:nth-child(1) > a:nth-child(1)` の hover が `no-content` から `stayed/stayed/not-tested` に変わった。別に `details.results` を出して見た SKIP の 3 回は、中身が出た組が 0 / 7 / 3 組。固定の待ちの 2 回は 0 / 0 組だった。
2. **出てきた「中身」はツールチップではなく、ページ上部で入れ替わるスポンサー広告の帯だった。** 同じ位置（x=360, y=225, 618×126）に「Premium Themes」「For Figma」「MUI for enterprise」「Help us keep running」などが入れ替わって現れ、きっかけは広告の `a` 要素だった。ページが自分で入れ替えているものを、その時に動いていた組の「新しい中身」と数えている。
3. **仮説: 前の組の操作で予約された遅れた表示を、リセットの待ちを省くと次の組が拾ってしまう。** 確かめるために、実ページではない仮の HTML（`tmp/spike-029/scratch-misattribute.html`、コミットしない）を作った。トリガー A の `mouseenter` で、何も取り消さない `setTimeout(show, 600)` を予約し、トリガー B は何も出さない。指示の 300 ms ではなく 600 ms にしたのは、300 ms だと A の hover 自身の 400 ms の待ちの中で見つかってしまい、「次の組に回る」状況にならないため。
   - 固定の待ち（F400）: 中身が出た組は 4 回とも 0 組。
   - SKIP: 4 回とも A の focus の組に「Late tip」が出た（A の hover で空だったあと、リセットの待ちを省いたので、600 ms 後の表示が次の組の待ちの中に入った）。
   mui の広告が同じ仕組みか（前の組で広告に入った / 出たことで入れ替えの予約が走ったのか）は、確かめていない。仮の HTML で起きることは確かめたが、mui の原因として確定はしていない。
4. **「予約されたタイマー / 動いているアニメーションがあれば待つ」`skip-safe` を試したが、安全とは言えなかった。** 空の組の後、リセット操作のあとに、追跡している 1 秒以下のタイマーと有限のアニメーションが残っていれば 400 ms 待ち、無ければ省く。仮の HTML では 3 回とも 0 組で正しかった。しかし mui では 3 回中 1 回（SAFE2）で同じ種類の食い違いが出た（SAFE と SAFE3 は一致）。bootstrap でも 1 組が食い違った（原因は調べていない）。省ける時間も小さくなった（wikipedia は 41.0 → 36.5 秒。SKIP は 27.0 秒）。広告の入れ替えには、追跡できる短いタイマー以外の仕組みが使われている可能性がある。
5. **fixture は SKIP を試せていない。** 各 fixture は triggers が 1 つで、組は hover と focus の最大 2 組しかないため、「中身が出なかった組の次の組」がほとんど無い。29 件の合計が F400 199.3 秒に対し SKIP 196.9 秒と変わらないのがその印。SKIP を支える証拠は実ページだけで、その実ページ（mui）で食い違いが出た。

### A100（動きを待つ方式）について

- `auto-hide` の見落としは、中身が出た直後に予約された 700 ms のタイマーを待つ間に中身が消えることで起きる。`persistent` の不適合を黙って見落とす。A50 / A150 でも同じ。
- `requestAnimationFrame` のフェードは追えない。最低限の待ち 100 ms では足りず、不適合を見逃して passes になる。
- 「最低限の待ちの後にまず中身を記録してから、残りの動きを待つ」作りにすれば `auto-hide` は直るかもしれないが、試していない。速さの上乗せも、実ページで F200 と同じか 3〜7 秒短い程度。

### 判断

- 今回は (c)。F200 / SKIP / A100 のどれにも、判定を変えずに出せると言える結果がない。
- 次に進めるなら、(a) の作り直し（最低限の待ちで中身を先に記録する）か、SKIP を「ページが静かだと確かめられたときだけ」に限る方法が考えられる。ただし後者は `skip-safe` で確かめた範囲では足りなかった。どちらも測っていないものは勧めない。
- 実ページの標本は、中身が出た組が wikipedia 1、bootstrap 26、tippy 1 だけで少ない。判断の根拠として弱い点は変わらない。

## 2. 表

「○」は F400（今の 400 ms）と同じ `targets` の結果。「×」は食い違いで、`前 → 後` の形に書いた。`stayed/dismissed/stayed` は `persistent/dismissible/hoverable`。太字の 6 件が新しい fixture。F400 の列は、その fixture の hover の結果（新しい 6 件では Plan の「正しい判定」と一致している）。

### 表 A

| fixture | F400 の hover/最初の中身あり組 | F200 | F100 | A100 | A50 | A150 | SKIP |
|---|---|---|---|---|---|---|---|
| **delayed-show** | stayed/dismissed/stayed | × #btn\|hover: stayed/dismissed/stayed → no-content | × #btn\|hover: stayed/dismissed/stayed → no-content | ○ | ○ | ○ | ○ |
| **css-delayed-show** | stayed/stayed/stayed | × #wrap\|hover: stayed/stayed/stayed → no-content; #wrap\|focus: stayed/stayed/not-applicable → no-content | × #wrap\|hover: stayed/stayed/stayed → no-content; #wrap\|focus: stayed/stayed/not-applicable → no-content | ○ | ○ | ○ | ○ |
| **fade-out-escape** | stayed/dismissed/stayed | × #btn\|hover: stayed/dismissed/stayed → stayed/stayed/stayed; #btn\|focus: stayed/dismissed/not-applicable → stayed/stayed/not-applicable | × #btn\|hover: stayed/dismissed/stayed → stayed/stayed/stayed; #btn\|focus: stayed/dismissed/not-applicable → stayed/stayed/not-applicable | ○ | ○ | ○ | ○ |
| **fade-out-leave** | stayed/dismissed/disappeared | × #btn\|hover: stayed/dismissed/disappeared → stayed/stayed/disappeared; #btn\|focus: stayed/dismissed/not-applicable → stayed/stayed/not-applicable | × #btn\|hover: stayed/dismissed/disappeared → stayed/stayed/stayed; #btn\|focus: stayed/dismissed/not-applicable → stayed/stayed/not-applicable | ○ | ○ | ○ | ○ |
| **delayed-hide-leave** | stayed/dismissed/disappeared | ○ | × #btn\|hover: stayed/dismissed/disappeared → stayed/dismissed/stayed | ○ | ○ | ○ | ○ |
| **raf-fade-out-leave** | stayed/dismissed/disappeared | ○ | × #btn\|hover: stayed/dismissed/disappeared → stayed/dismissed/stayed | × #btn\|hover: stayed/dismissed/disappeared → stayed/dismissed/stayed | × #btn\|hover: stayed/dismissed/disappeared → stayed/dismissed/stayed | × #btn\|hover: stayed/dismissed/disappeared → stayed/dismissed/stayed | ○ |
| aria-hidden-tooltip | stayed/stayed/stayed | ○ | ○ | ○ | ○ | ○ | ○ |
| attributes-only | (trigger なし) | ○ | ○ | ○ | ○ | ○ | ○ |
| auto-hide | disappeared/not-tested/not-tested | ○ | ○ | × #btn\|hover: disappeared/not-tested/not-tested → no-content | × #btn\|hover: disappeared/not-tested/not-tested → no-content | × #btn\|hover: disappeared/not-tested/not-tested → no-content | ○ |
| compliant-tooltip | stayed/dismissed/stayed | ○ | ○ | ○ | ○ | ○ | ○ |
| css-hover-menu | stayed/stayed/stayed | ○ | ○ | ○ | ○ | ○ | ○ |
| css-nested-menu | stayed/stayed/stayed | ○ | ○ | ○ | ○ | ○ | ○ |
| css-self-only | (trigger なし) | ○ | ○ | ○ | ○ | ○ | ○ |
| document-delegation | (trigger なし) | ○ | ○ | ○ | ○ | ○ | ○ |
| escape-blurs | no-content | ○ | ○ | ○ | ○ | ○ | ○ |
| focus-navigates | no-content | ○ | ○ | ○ | ○ | ○ | ○ |
| focus-only | no-content | ○ | ○ | ○ | ○ | ○ | ○ |
| focus-within | no-content | ○ | ○ | ○ | ○ | ○ | ○ |
| hidden-trigger | (trigger なし) | ○ | ○ | ○ | ○ | ○ | ○ |
| inserts-sibling | stayed/dismissed/disappeared | ○ | ○ | ○ | ○ | ○ | ○ |
| no-escape | stayed/stayed/stayed | ○ | ○ | ○ | ○ | ○ | ○ |
| none | (trigger なし) | ○ | ○ | ○ | ○ | ○ | ○ |
| not-hoverable | stayed/dismissed/disappeared | ○ | ○ | ○ | ○ | ○ | ○ |
| root-delegation | (trigger なし) | ○ | ○ | ○ | ○ | ○ | ○ |
| scroll-reveal | stayed/dismissed/stayed | ○ | ○ | ○ | ○ | ○ | ○ |
| shadow-button | (trigger なし) | ○ | ○ | ○ | ○ | ○ | ○ |
| stuck | stayed/stayed/not-tested | ○ | ○ | ○ | ○ | ○ | ○ |
| tabindex-minus-one | no-content | ○ | ○ | ○ | ○ | ○ | ○ |
| window-focus | stayed/dismissed/stayed | ○ | ○ | ○ | ○ | ○ | ○ |

29 件の所要秒数の合計: F400 199.3s / F200 156.7s / F100 141.7s / A100 152.4s / A50 145.1s / A150 159.9s / SKIP 196.9s

### 表 B

| ページ | triggers | 中身あり組(F400) | F400 秒 | F400b 秒/一致 | F200 秒/一致 | A100 秒/一致 | SKIP 秒/一致 | A100 の extended/capped/waits |
|---|---|---|---|---|---|---|---|---|
| w3c-bad | 21 | 0 | 36.7 | 36.6s ○ | 21.5s ○ | 14.9s ○ | 22.1s ○ | 0/0/77 |
| w3c-good | 1 | 0 | 2.3 | 2.7s ○ | 1.7s ○ | 1.4s ○ | 2.2s ○ | 0/0/3 |
| w3c-wai | 8 | 0 | 16.5 | 16.9s ○ | 10.3s ○ | 7.1s ○ | 10.1s ○ | 1/0/31 |
| mdn | 0 | 0 | 1.6 | 2.2s ○ | 1.8s ○ | 1.6s ○ | 1.5s ○ | 0/0/0 |
| wikipedia | 19 | 1 | 41.0 | 41.3s ○ | 26.3s ○ | 21.5s ○ | 27.0s ○ | 35/0/74 |
| bootstrap-tooltip | 30 | 26 | 136.1 | 136.1s ○ | 126.9s × F400 が時間切れで未到達の 3 組を追加で試せた(共通の組は一致) | 143.4s × F400 が時間切れで未到達の 9 組を追加で試せた(共通の組は一致) | 135.3s ○ | 94/0/163 |
| mui-tooltip | 30 | 0 | 60.0 | 58.2s ○ | 37.4s ○ | 37.7s ○ | 45.5s × …> a:nth-child(1)\|hover: no-content → stayed/stayed/not-tested | 60/9/113 |
| jqueryui-tooltip | 0 | 0 | 0.8 | 0.8s ○ | 1.0s ○ | 1.0s ○ | 0.8s ○ | 0/0/0 |
| tippy-tooltip | 10 | 1 | 24.3 | 23.2s ○ | 15.3s ○ | 15.4s ○ | 16.3s ○ | 32/0/39 |

補足:

- 表 A の 29 件の所要秒数の合計は、時間の大半が中身の出た組の `persistMs`（3 秒）なので、差が小さく見える。待ちの長さの差を見るには表 B を使う。
- 計画では `fade-out-leave` と `delayed-hide-leave` が F200 で `hoverable: stayed` に狂うと予想した。**実際は F200 では狂わず、F100 で狂った。** ポインタを中身へ 10 ステップで動かす操作と `evaluate` の往復に 100 ms 以上かかり、実質の待ちが 300 ms を超えるため。`dismissible` を見る Escape の後の待ちには余裕がないので、`fade-out-escape` と `fade-out-leave` の focus は F200 でも狂う。
- `bootstrap-tooltip` は F400 でも `timeBudgetMs` を使い切って `timeout`（untested 32 組）で止まる。速い設定ほど先の組まで進めるので、「追加で試せた」組が出る。**共通の組はどの設定でも一致した（食い違い 0）。** F400 を 2 回取った結果も同じ（`timeout` の位置も同じ）。
- 後半の 3 ページ: bootstrap-tooltip は中身が出た組が 26 あり標本になった。mui-tooltip（0 組）と jqueryui-tooltip（triggers 0）は中身が出ず、標本にならなかった。代わりに tippy-tooltip（`https://atomiks.github.io/tippyjs/v6/getting-started/`）を 1 つ足したが、中身が出た組は 1 組だけだった。
- 全ページで `curl -sIL` の最終ステータスは 200 だった。F400 どうしの揺れ（F400b）があったページは 0 件。

## 3. 動きを待つ方式で拾えなかったもの

| もの | 例 | 起きること | 影響の向き |
|---|---|---|---|
| `requestAnimationFrame` で動かす JS のフェードアウト | `raf-fade-out-leave`（jQuery の `fadeOut`） | 最低限の待ち 100 ms が過ぎた時点で中身が残っていて、`hoverable: stayed` になる | **見逃し**（不適合なのに passes。一番重い） |
| 中身を出した直後に予約される「自分で消える」タイマーを待つ作りそのもの | `auto-hide` | 待っている間に中身が消え、`empty`（中身なし）になる | **見落とし**（`persistent` の不適合を黙って報告しない） |
| `setInterval` / `requestAnimationFrame` の繰り返し | （追わない設計。実ページでは未観測） | 動きとして数えない | 上の rAF と同じ向き |
| 1000 ms を超えるタイマー、無限に繰り返すアニメーション | （上限外、`iterations` が有限でないものは除外） | 待たない | 見逃し / 見落とし |
| 別フレーム（iframe）の中のタイマー | （設計上の話で未観測。初期化スクリプトは各フレームに入るが、`evaluate` は主フレームだけを見る） | 待たない | 同上 |

固定の待ち（F200 / F100）で狂うもの（表 A）は、見落とし（`delayed-show`、`css-delayed-show`: 中身なし扱い）、誤警報（`fade-out-escape`、`fade-out-leave` の focus: `dismissible: stayed`）、見逃し（F100 の `fade-out-leave`、`delayed-hide-leave`、`raf-fade-out-leave`: `hoverable: stayed`）の 3 種類すべてだった。

### 計測の偏り

試作の `adaptivePendingMs` は、タイマーは `__hoverWaitMark()` 以降に予約されたものだけを数えるが、**アニメーションは文書全体で動いている有限のものをすべて数える**（操作の後に始まったものに絞っていない）。そのため、操作と関係のない動き（広告の帯、スケルトン、リップルなど）で `adaptiveExtended` と待ち時間が水増しされ、mui の上限到達もこれで起きた可能性がある。

`startTime` が mark 以降のアニメーションだけに絞る版を 2 通り試した（`AF100` と `AG100`）。どちらも fixture の判定が悪化した（css-delayed-show が中身なし、fade-out-escape が `dismissible: stayed` など）ため、絞り込みの実装が正しくない（原因は調べていない）。参考値として AF100 の mui は extended 55 / capped 8（A100 は 60 / 9）、wikipedia は extended 26（A100 は 35）だったが、**判定が壊れた版の数なので根拠にはしない**。絞り込んだ有効な計測はできていない。

## 4. 実ページで上限（1000 ms）に当たった回数

A100 での `adaptiveCapped`（上限で打ち切った `settle()` の回数）。`adaptiveExtended` は最低限の待ちを超えて待った回数、`waits` は `settle()` を呼んだ回数（表 B の最後の列は `extended/capped/waits`）。

| ページ | extended | capped | waits |
|---|---|---|---|
| w3c-bad | 0 | 0 | 77 |
| w3c-good | 0 | 0 | 3 |
| w3c-wai | 1 | 0 | 31 |
| mdn | 0 | 0 | 0 |
| wikipedia | 35 | 0 | 74 |
| bootstrap-tooltip | 94 | 0 | 163 |
| mui-tooltip | 60 | **9** | 113 |
| jqueryui-tooltip | 0 | 0 | 0 |
| tippy-tooltip | 32 | 0 | 39 |

上限に当たったのは mui-tooltip の 9 回だけ。**原因は特定できていない。** 上の「計測の偏り」のとおり、アニメーションを操作後のものに絞っていないため、ページ上部で入れ替わる広告の帯など、操作と関係のない有限のアニメーションを待っている可能性が一番ありそうだと見ている（確かめていない）。本実装に進むなら、`adaptiveCapped` が 0 でない理由（何のタイマー / アニメーションか）を先に特定する。`wikipedia` と `tippy` では `extended` が waits の半分近くあるが、1 回あたりの延長は短く（A100 の待ちの合計が wikipedia 10.1 秒 / 74 回）、上限には達していない。

## 5. 本実装で決めることの一覧

- **初期化スクリプトを入れる場所**: `openPage` の `gotoAndSettle` の前（試作と同じ）が前提。他の検査と共有するか。
- **中身の記録と待ちの順番**: A100 の見落とし（`auto-hide`）を直すため、最低限の待ち後に中身を先に記録してから、消える動きを待つ作りにするか。
- **`requestAnimationFrame` の扱い**: 拾わないのなら、最低限の待ちを何 ms にするか（100 ms では足りなかった）。あるいは `hoverable` だけ固定の待ちを残すか。
- **公開する引数**: 環境変数は試作専用。`settleMs` は残すか、`minSettleMs` / `maxSettleMs` に分けるか。
- **`setTimeout` の差し替え**: 戻り値と `this` を保つこと、例外を出さないこと、`clearTimeout` に文字列や `undefined` が渡ることをテストで確かめる。`runTimeLimitDetector.ts` の前例と二重に差し替えるときの順序。
- **他の検査への流用**: Plan 024〜028 の Tab ごとの待ち、change-on-input の待ち。このスパイクでは試していない。
- **`skip-reset`（今回は勧めない）**: `empty` の後の次の組の `resetState` で、ポインタを隅へ・blur・Escape は行い、待ちだけ省く案。§1 のとおり、前の組が予約した遅れた表示を次の組が拾うことがあり、mui で判定が変わった。fixture は 1 trigger あたり hover と focus の 2 組しかなく、この案をほとんど試せない（29 件の合計が F400 199.3 秒に対し SKIP 196.9 秒）ので、「fixture が全件一致」は根拠にならない。安全にする案として `skip-safe` を試したが足りなかった。「中身が出た組の次」でも同じ問題があるかは見ていない。
- **試作の計測用の数**: `adaptiveWaits` などは試作の間だけ `console.error` に出した。本実装で残すかどうか。

## 6. 試作と計測の補足

- この節は §1 の調査（追加の計測）を含む。試作の差分は付録 A（追加の計測用の `skip-safe` とアニメーション絞り込みは付録に含めていない一時的な変更で、戻した）。`HOVER_WAIT_MODE` なし（`fixed`）で既存の `content-on-hover.spec.ts` を走らせた結果は、1 回目が 37 件成功・1 件失敗（`Escape で blur して消えるツールチップは dismissed でも escapeMovedFocus になり、dismissible が incomplete になる`）。2 回目は先頭 40 行しか見ておらず最終集計は確認していない（見えた範囲に失敗はなかった）。3 回目は 38 件全件成功した。並列（16 ワーカー）の負荷による時間依存の揺れと見ているが、`main` で同じ揺れが出るかは確かめていない。
- **ベースラインの揺れ（main の src に戻した状態で確認）**: 失敗した 1 件だけを `-g "Escape で blur して消えるツールチップ" --repeat-each 10` で走らせると 10 回とも成功した。ファイル全体を `--repeat-each 3`（114 回）走らせると 1 件が失敗したが、それは別のテスト（`スクリプトも CSS もないページは何も操作せず inapplicable になる`、spec 49 行目）だった。つまり main でも並列の負荷で時間依存のテストが 1 件落ちることがあり、この揺れは試作に固有のものではない。ただし、固定モードの試作で落ちた `Escape で blur …` が main でも落ちるかは、この計測では再現できなかった（単独 10/10 成功）。
- WSL2 のシステム時計が計測中に飛ぶことがあり（`Date.now()` の差が負になった）、試作の待ち時間の計測は `performance.now()` に直した。`measure.mjs` の `durationMs` は元から `performance.now()` を使っている。
- 試作の最初の版は `playState === 'pending'` を使ったが、この TypeScript の `lib.dom` には存在しない値だったため、`Animation.pending`（真偽値）に直した。

## 付録 A: 試作の差分（コミットしない。`packages/a11y-audit/src/` は戻した）

```diff
diff --git a/packages/a11y-audit/src/playwright/runContentOnHoverCheck.ts b/packages/a11y-audit/src/playwright/runContentOnHoverCheck.ts
index 472c4ae..47279d2 100644
--- a/packages/a11y-audit/src/playwright/runContentOnHoverCheck.ts
+++ b/packages/a11y-audit/src/playwright/runContentOnHoverCheck.ts
@@ -708,6 +708,72 @@ function readVisibility(args: {
   );
 }
 
+/* ---- SPIKE 029 prototype (not for commit): adaptive settle wait ---- */
+
+/** Page-side: wrap setTimeout/clearTimeout to track short timers. Runs before the page's scripts. */
+function trackShortTimers({ maxMs }: { maxMs: number }): void {
+  const w = window as unknown as Window & Record<string, unknown>;
+  const origSet = window.setTimeout.bind(window);
+  const origClear = window.clearTimeout.bind(window);
+  const pending = new Map<number, { dueAt: number; createdAt: number }>();
+  let markAt = 0;
+  window.setTimeout = ((
+    handler: TimerHandler,
+    delay?: number,
+    ...args: unknown[]
+  ) => {
+    const d = Number(delay) || 0;
+    if (typeof handler !== 'function' || d < 1 || d > maxMs) {
+      return origSet(handler, delay, ...args);
+    }
+    let id = 0;
+    const wrapped = function (this: unknown, ...a: unknown[]): unknown {
+      pending.delete(id);
+      return (handler as (...x: unknown[]) => unknown).apply(this, a);
+    };
+    id = origSet(wrapped, delay, ...args);
+    const now = performance.now();
+    pending.set(id, { dueAt: now + d, createdAt: now });
+    return id;
+  }) as typeof window.setTimeout;
+  window.clearTimeout = ((id?: number) => {
+    if (typeof id === 'number') pending.delete(id);
+    return origClear(id);
+  }) as typeof window.clearTimeout;
+  w.__hoverWaitMark = () => {
+    markAt = performance.now();
+  };
+  w.__hoverWaitPendingMs = () => {
+    const now = performance.now();
+    let max = 0;
+    for (const { dueAt, createdAt } of pending.values()) {
+      if (createdAt >= markAt && dueAt - now > max) max = dueAt - now;
+    }
+    return max;
+  };
+}
+
+/** Page-side: longest remaining time of the page's own pending timers and finite animations. */
+function adaptivePendingMs(): number {
+  const w = window as unknown as Record<string, unknown>;
+  const timers =
+    typeof w.__hoverWaitPendingMs === 'function'
+      ? (w.__hoverWaitPendingMs as () => number)()
+      : 0;
+  let anim = 0;
+  for (const a of document.getAnimations()) {
+    // Newer lib.dom has no 'pending' playState; `pending` is a separate flag.
+    if (a.playState !== 'running' && !a.pending) continue;
+    const timing = a.effect?.getComputedTiming();
+    if (!timing || !Number.isFinite(timing.iterations)) continue;
+    const remaining =
+      (Number(timing.endTime) - Number(a.currentTime ?? 0)) /
+      (a.playbackRate || 1);
+    if (remaining > anim) anim = remaining;
+  }
+  return Math.max(timers, anim);
+}
+
 /** Blur the focused element. */
 function blurActive(): void {
   (document.activeElement as HTMLElement | null)?.blur();
@@ -932,6 +998,10 @@ export async function runContentOnHoverCheck(
     defaultFile: DEFAULT_CONTENT_ON_HOVER_RESULT_FILE,
   });
 
+  // SPIKE 029 prototype switches (env vars; not for production).
+  const mode = process.env.HOVER_WAIT_MODE ?? 'fixed';
+  const waitMin = Number(process.env.HOVER_WAIT_MIN ?? 100);
+  const waitCap = Number(process.env.HOVER_WAIT_CAP ?? 1000);
   const stateKey = `__a11yContentOnHover_${randomUUID()}`;
   const nodesKey = `__a11yContentOnHoverNodes_${randomUUID()}`;
   const startedAt = Date.now();
@@ -954,10 +1024,58 @@ export async function runContentOnHoverCheck(
     opened.on('dialog', (dialog) => {
       dialog.dismiss().catch(() => {});
     });
+    if (mode === 'adaptive') {
+      await opened.addInitScript(trackShortTimers, { maxMs: 1000 });
+    }
     await gotoAndSettle(opened, targetUrl);
     opened.setDefaultTimeout(ACTION_TIMEOUT_MS);
   };
 
+  // SPIKE 029 prototype wait helpers.
+  const stats = {
+    adaptiveWaits: 0,
+    adaptiveExtended: 0,
+    adaptiveCapped: 0,
+    adaptiveWaitMsTotal: 0,
+  };
+  let opStart = performance.now();
+  /** Call right before an operation whose effect `settle` will wait for. */
+  const markOp = async (): Promise<void> => {
+    if (mode !== 'adaptive') return;
+    opStart = performance.now();
+    await page
+      .evaluate(() => {
+        (
+          window as unknown as { __hoverWaitMark?: () => void }
+        ).__hoverWaitMark?.();
+      })
+      .catch(() => {});
+  };
+  const settle = async (): Promise<void> => {
+    if (mode !== 'adaptive') {
+      await page.waitForTimeout(settleMs);
+      return;
+    }
+    stats.adaptiveWaits += 1;
+    const waitStart = performance.now();
+    await page.waitForTimeout(waitMin);
+    let extended = false;
+    for (;;) {
+      const pendingMs = await page.evaluate(adaptivePendingMs).catch(() => 0);
+      if (pendingMs <= 0) break;
+      const elapsed = performance.now() - opStart;
+      if (elapsed >= waitCap) {
+        stats.adaptiveCapped += 1;
+        break;
+      }
+      extended = true;
+      await page.waitForTimeout(Math.min(pendingMs + 16, waitCap - elapsed));
+    }
+    if (extended) stats.adaptiveExtended += 1;
+    stats.adaptiveWaitMsTotal += Math.round(performance.now() - waitStart);
+  };
+  let skipNextResetWait = false;
+
   try {
     await openPage();
     startUrl = page.url();
@@ -1010,6 +1128,7 @@ export async function runContentOnHoverCheck(
     };
 
     await tryTriggers(details);
+    console.error(`HOVERWAIT ${JSON.stringify(stats)}`);
 
     const result = buildAuditResult({
       source: 'content-on-hover-check',
@@ -1094,10 +1213,15 @@ export async function runContentOnHoverCheck(
 
     /** Pointer to a corner, focus off, Escape: put the page back as it was. */
     const resetState = async (): Promise<void> => {
+      await markOp();
       await page.mouse.move(0, 0);
       await page.evaluate(blurActive);
       await page.keyboard.press('Escape');
-      await page.waitForTimeout(settleMs);
+      if (mode === 'skip-reset' && skipNextResetWait) {
+        skipNextResetWait = false;
+        return;
+      }
+      await settle();
     };
 
     // True while nothing of the previous trigger is left to put away.
@@ -1142,12 +1266,13 @@ export async function runContentOnHoverCheck(
       await page.evaluate(markVisible, { stateKey, clearRoots: true });
 
       clean = false;
+      await markOp();
       if (method === 'focus') {
         await page.evaluate(focusElement, { stateKey, index });
       } else {
         await page.mouse.move(point.x, point.y, { steps: 1 });
       }
-      await page.waitForTimeout(settleMs);
+      await settle();
       if (moved()) return 'navigated';
 
       const shown = await page.evaluate(findNewContent, {
@@ -1178,8 +1303,9 @@ export async function runContentOnHoverCheck(
       let escapeMovedFocus = false;
       if (persistent === 'stayed') {
         const focusBefore = await page.evaluate(activeIdentity);
+        await markOp();
         await page.keyboard.press('Escape');
-        await page.waitForTimeout(settleMs);
+        await settle();
         const focusAfter = await page.evaluate(activeIdentity);
         const afterEscape = await page.evaluate(readVisibility, {
           stateKey,
@@ -1199,8 +1325,9 @@ export async function runContentOnHoverCheck(
         const againPoint = await scrollToTrigger();
         if (againPoint) {
           await page.evaluate(markVisible, { stateKey, clearRoots: false });
+          await markOp();
           await page.mouse.move(againPoint.x, againPoint.y, { steps: 1 });
-          await page.waitForTimeout(settleMs);
+          await settle();
           const again = await page.evaluate(findNewContent, {
             stateKey,
             index,
@@ -1227,8 +1354,9 @@ export async function runContentOnHoverCheck(
               x <= again.viewport.width &&
               y <= again.viewport.height
             ) {
+              await markOp();
               await page.mouse.move(x, y, { steps: 10 });
-              await page.waitForTimeout(settleMs);
+              await settle();
               const onContent = await page.evaluate(readVisibility, {
                 stateKey,
                 slot: 'hover' as const,
@@ -1282,6 +1410,7 @@ export async function runContentOnHoverCheck(
         }
         continue;
       }
+      if (outcome === 'empty') skipNextResetWait = true;
       // Nothing new was shown, so nothing needs putting away.
       if (outcome !== 'content' || rest.length === 0) continue;
```

## 付録 B: 計測スクリプトと使ったコマンド

計測の本体 `measure.mjs` と比較の `compare.mjs` は Plan 021 の結果文書の付録のものをそのまま使った（`packages/a11y-audit/test-results/spike-021/` に取り出して使う）。次の 3 つは今回足したスクリプト（`tmp/spike-029/`、gitignore 済み）。

### `run.mjs`（fixture / 実ページを設定ごとに順に測る）

```js
// Plan 029 spike driver. Usage:
//   node run.mjs fx   <variant,variant,...> [fixtureName,...]
//   node run.mjs live <variant,variant,...> [pageName,...]
// Writes tmp/spike-029/{fx|live}-<variant>-<name>.jsonl (+ .stderr for prototype stats).
// An existing output file is skipped (delete by hand to re-run).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const measure = path.join(root, 'packages/a11y-audit/test-results/spike-021/measure.mjs');
const fxDir = path.join(root, 'packages/a11y-audit/test/fixtures/pages/content-on-hover');

const scale = (s) => ['--settle-scale', String(s), '--persist-scale', '1'];
const adaptive = (min) => ({
  env: { HOVER_WAIT_MODE: 'adaptive', HOVER_WAIT_MIN: String(min), HOVER_WAIT_CAP: '1000' },
  args: scale(1),
});
const VARIANTS = {
  F400: { env: {}, args: scale(1) },
  F400b: { env: {}, args: scale(1) },
  F200: { env: {}, args: scale(0.5) },
  F100: { env: {}, args: scale(0.25) },
  A50: adaptive(50),
  A100: adaptive(100),
  AF100: adaptive(100),
  AG100: adaptive(100),
  A150: adaptive(150),
  F400c: { env: {}, args: scale(1) },
  SKIP2: { env: { HOVER_WAIT_MODE: 'skip-reset' }, args: scale(1) },
  SKIP3: { env: { HOVER_WAIT_MODE: 'skip-reset' }, args: scale(1) },
  SAFE: { env: { HOVER_WAIT_MODE: 'skip-safe' }, args: scale(1) },
  SAFE2: { env: { HOVER_WAIT_MODE: 'skip-safe' }, args: scale(1) },
  SAFE3: { env: { HOVER_WAIT_MODE: 'skip-safe' }, args: scale(1) },
  SKIP: { env: { HOVER_WAIT_MODE: 'skip-reset' }, args: scale(1) },
};

const LIVE = {
  'w3c-bad': 'https://www.w3.org/WAI/demos/bad/before/home.html',
  'w3c-good': 'https://www.w3.org/WAI/demos/bad/after/home.html',
  'w3c-wai': 'https://www.w3.org/WAI/',
  mdn: 'https://developer.mozilla.org/en-US/',
  wikipedia: 'https://en.wikipedia.org/wiki/Main_Page',
  'bootstrap-tooltip': 'https://getbootstrap.com/docs/5.3/components/tooltips/',
  'mui-tooltip': 'https://mui.com/material-ui/react-tooltip/',
  'jqueryui-tooltip': 'https://jqueryui.com/resources/demos/tooltip/default.html',
};
// Added in step 6 because mui-tooltip and jqueryui-tooltip produced no content pairs.
// Excluded from the default page list (pass the name explicitly).
const EXTRA = { 'tippy-tooltip': 'https://atomiks.github.io/tippyjs/v6/getting-started/' };
Object.assign(LIVE, EXTRA);

const [kind, variantArg, nameArg] = process.argv.slice(2);
const variants = variantArg.split(',');
const all =
  kind === 'fx'
    ? fs.readdirSync(fxDir).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, ''))
    : Object.keys(LIVE).filter((n) => !(n in EXTRA));
const names = nameArg ? nameArg.split(',') : all;

for (const name of names) {
  const url = kind === 'fx' ? `file://${fxDir}/${name}.html` : LIVE[name];
  if (kind === 'live') {
    const code = execFileSync('curl', ['-sIL', '-o', '/dev/null', '-w', '%{http_code}', url]).toString();
    console.log(`curl ${name} -> ${code}`);
    if (code !== '200') continue;
  }
  for (const v of variants) {
    const out = path.join(here, `${kind}-${v}-${name}.jsonl`);
    if (fs.existsSync(out)) {
      console.log(`skip ${path.basename(out)}`);
      continue;
    }
    const spec = VARIANTS[v];
    const res = spawnSync(
      'node',
      [measure, url, '--page', name, '--checks', 'content-on-hover-check', '--out', out, ...spec.args],
      { env: { ...process.env, ...spec.env }, encoding: 'utf8', maxBuffer: 1 << 26 },
    );
    fs.writeFileSync(out + '.stderr', res.stderr ?? '');
    console.log(`done ${path.basename(out)} status=${res.status}`);
  }
}
```

### `tables.mjs`（設定ごとの比較を端末に出す）

```js
// Plan 029 spike: build tables A (fixtures) and B (live pages) from tmp/spike-029/*.jsonl.
// Usage: node tables.mjs fx <variant,...>        (first variant is the baseline)
//        node tables.mjs live <variant,...>      (first variant is the baseline)
//        node tables.mjs show <file.jsonl>      (print triggers/targets of one run)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [kind, arg] = process.argv.slice(2);

const rowOf = (file) => {
  if (!fs.existsSync(file)) return null;
  const line = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)[0];
  return line ? JSON.parse(line) : null;
};
const statsOf = (file) => {
  const f = file + '.stderr';
  if (!fs.existsSync(f)) return null;
  const hits = fs
    .readFileSync(f, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('HOVERWAIT '))
    .map((l) => JSON.parse(l.slice(10)));
  return hits.length ? hits[hits.length - 1] : null;
};
const targetsOf = (row) => (row?.targets ?? []).map((t) => `${t.id}=${t.outcome}`).sort();
const diff = (base, other) => {
  if (!other) return 'missing';
  if (other.error) return `error:${other.error}`;
  const A = targetsOf(base);
  const B = targetsOf(other);
  const d = [...A.filter((x) => !B.includes(x)).map((x) => `-${x}`), ...B.filter((x) => !A.includes(x)).map((x) => `+${x}`)];
  return d.length ? 'DIFF ' + d.join(' ') : 'same';
};

if (kind === 'show') {
  const r = rowOf(arg);
  console.log(JSON.stringify({ triggers: r.counts?.['triggers.length'], targets: r.targets, error: r.error, ms: r.durationMs }));
} else {
  const variants = arg.split(',');
  const dir = here;
  const names = [...new Set(fs.readdirSync(dir).filter((f) => f.startsWith(`${kind}-${variants[0]}-`) && f.endsWith('.jsonl')).map((f) => f.slice(`${kind}-${variants[0]}-`.length, -'.jsonl'.length)))].sort();
  for (const name of names) {
    const rows = variants.map((v) => rowOf(path.join(dir, `${kind}-${v}-${name}.jsonl`)));
    const base = rows[0];
    const cells = variants.map((v, i) => {
      if (i === 0) {
        const s = ((base?.durationMs ?? 0) / 1000).toFixed(1);
        return `${v}: ${s}s trig=${base?.counts?.['triggers.length']} out=${targetsOf(base).filter((x) => !x.endsWith('=no-content')).length}${base?.error ? ' ERR ' + base.error : ''}`;
      }
      const r = rows[i];
      const st = statsOf(path.join(dir, `${kind}-${v}-${name}.jsonl`));
      const extra = st ? ` [w=${st.adaptiveWaits} ext=${st.adaptiveExtended} cap=${st.adaptiveCapped} ms=${st.adaptiveWaitMsTotal}]` : '';
      return `${v}: ${((r?.durationMs ?? 0) / 1000).toFixed(1)}s ${diff(base, r)}${extra}`;
    });
    console.log(`## ${name}\n  ` + cells.join('\n  '));
  }
}
```

### `mdtables.mjs`（表 A / 表 B の Markdown を出す）

```js
// Plan 029 spike: print Markdown tables A (fixtures) and B (live pages).
// Usage: node mdtables.mjs   (reads tmp/spike-029/*.jsonl and *.stderr)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (kind, v, name) => {
  const f = path.join(here, `${kind}-${v}-${name}.jsonl`);
  if (!fs.existsSync(f)) return null;
  const row = JSON.parse(fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)[0]);
  const e = f + '.stderr';
  const hit = fs.existsSync(e)
    ? fs.readFileSync(e, 'utf8').split('\n').filter((l) => l.startsWith('HOVERWAIT ')).pop()
    : null;
  return { row, stats: hit ? JSON.parse(hit.slice(10)) : null };
};
const tmap = (r) => new Map((r?.row.targets ?? []).map((t) => [t.id, t.outcome]));
const short = (id) => id.replace(/^.*> /, '…> ').replace('|', '\\|');
const cmp = (base, other) => {
  if (!other) return '-';
  if (other.row.error) return `error ${other.row.error}`;
  const A = tmap(base);
  const B = tmap(other);
  const out = [];
  let added = 0;
  for (const id of new Set([...A.keys(), ...B.keys()])) {
    if (A.get(id) === B.get(id)) continue;
    if (!A.has(id)) added += 1; // pair only reached by the other run (time budget)
    else out.push(`${short(id)}: ${A.get(id)} → ${B.get(id) ?? '(none)'}`);
  }
  if (added) out.push(`F400 が時間切れで未到達の ${added} 組を追加で試せた(共通の組は一致)`);
  return out.length ? `× ${out.join('; ')}` : '○';
};
const sec = (x) => (x ? (x.row.durationMs / 1000).toFixed(1) : '-');

const fxDir = path.resolve(here, '../../packages/a11y-audit/test/fixtures/pages/content-on-hover');
const NEW = ['delayed-show', 'css-delayed-show', 'fade-out-escape', 'fade-out-leave', 'delayed-hide-leave', 'raf-fade-out-leave'];
const old = fs.readdirSync(fxDir).map((f) => f.replace(/\.html$/, '')).filter((n) => !NEW.includes(n)).sort();
const A = ['F200', 'F100', 'A100', 'A50', 'A150', 'SKIP'];
console.log('### 表 A\n');
console.log(`| fixture | F400 の hover/最初の中身あり組 | ${A.join(' | ')} |`);
console.log(`|---|---|${A.map(() => '---').join('|')}|`);
for (const name of [...NEW, ...old]) {
  const base = read('fx', 'F400', name);
  const hover = [...tmap(base)].find(([id]) => id.endsWith('|hover'));
  const baseCell = hover ? hover[1] : '(trigger なし)';
  console.log(`| ${NEW.includes(name) ? '**' + name + '**' : name} | ${baseCell} | ${A.map((v) => cmp(base, read('fx', v, name))).join(' | ')} |`);
}
const tot = {};
for (const v of ['F400', ...A]) {
  tot[v] = [...NEW, ...old].reduce((s, n) => s + (read('fx', v, n)?.row.durationMs ?? 0), 0) / 1000;
}
console.log(`\n29 件の所要秒数の合計: ${Object.entries(tot).map(([k, v]) => `${k} ${v.toFixed(1)}s`).join(' / ')}`);

console.log('\n### 表 B\n');
console.log('| ページ | triggers | 中身あり組(F400) | F400 秒 | F400b 秒/一致 | F200 秒/一致 | A100 秒/一致 | SKIP 秒/一致 | A100 の extended/capped/waits |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const name of ['w3c-bad', 'w3c-good', 'w3c-wai', 'mdn', 'wikipedia', 'bootstrap-tooltip', 'mui-tooltip', 'jqueryui-tooltip', 'tippy-tooltip']) {
  const b = read('live', 'F400', name);
  if (!b) continue;
  const content = (b.row.targets ?? []).filter((t) => t.outcome !== 'no-content').length;
  const cell = (v) => {
    const o = read('live', v, name);
    return `${sec(o)}s ${cmp(b, o)}`;
  };
  const a = read('live', 'A100', name)?.stats;
  console.log(
    `| ${name} | ${b.row.counts?.['triggers.length']} | ${content} | ${sec(b)} | ${cell('F400b')} | ${cell('F200')} | ${cell('A100')} | ${cell('SKIP')} | ${a ? `${a.adaptiveExtended}/${a.adaptiveCapped}/${a.adaptiveWaits}` : '-'} |`,
  );
}
```

### `probe.mjs`（組ごとの中身を出す。mui の調査用）

```js
// Plan 029 follow-up: print pair order and content of pairs that showed content (details.results).
// Usage: node probe.mjs <url> [maxPairsToPrintAround]
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../../packages/a11y-audit/dist/playwright/index.js');
const pw = await import(pathToFileURL(dist).href);
const browser = await chromium.launch();
const result = await pw.runContentOnHoverCheck({
  browser,
  targetUrl: process.argv[2],
  writeResult: false,
  quiet: true,
  outputDir: path.join(here, 'probe-out'),
});
const d = result.details;
const short = (s) => s.replace(/^.*> /, '…> ');
console.log('triggers', d.triggers.length);
d.triggers.forEach((t, i) => console.log(i, short(t.selector), t.focusTarget ? 'focus' : ''));
for (const r of d.results) {
  console.log(
    'RESULT',
    short(r.trigger),
    r.method,
    `${r.persistent}/${r.dismissible}/${r.hoverable}`,
    JSON.stringify(r.content.map((c) => ({ html: c.html?.slice(0, 160), text: c.text?.slice(0, 80), rect: c.rect }))),
  );
}
await browser.close();
```

### `scratch-misattribute.html`（遅れた表示が次の組に回ることを確かめる仮の HTML。fixture ではない）

```html
<!doctype html>
<!-- Scratch (not a fixture): trigger A's mouseenter schedules a show 600ms later that nothing cancels;
     trigger B shows nothing. Correct verdict: both A and B have no content from their own interaction
     (the tip is the page's own late timer), but a checker may attribute it to whichever pair is running. -->
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Scratch misattribution</title>
  </head>
  <body>
    <main>
      <button id="a" type="button">A</button>
      <button id="b" type="button">B</button>
      <div id="tip" role="tooltip" hidden>Late tip</div>
    </main>
    <script>
      const tip = document.getElementById('tip');
      document.getElementById('a').addEventListener('mouseenter', () => {
        setTimeout(() => {
          tip.hidden = false;
        }, 600);
      });
      document.getElementById('b').addEventListener('mouseenter', () => {});
    </script>
  </body>
</html>
```

### 使ったコマンド

```bash
# ステップ 2: 新しい fixture 6 件を F400 で測る
node tmp/spike-029/run.mjs fx F400 delayed-show,css-delayed-show,fade-out-escape,fade-out-leave,delayed-hide-leave,raf-fade-out-leave
# ステップ 3: 固定の待ち（試作の前に取った。F400 は既存 23 件を含む 29 件）
node tmp/spike-029/run.mjs fx F400,F200,F100
# ステップ 5: 試作（ビルドし直してから）
node tmp/spike-029/run.mjs fx A100,A50,A150,SKIP
# ステップ 6: 実ページ（先に curl -sIL で 200 を確かめる。run.mjs が行う）
node tmp/spike-029/run.mjs live F400,F400b,F200,A100,SKIP
node tmp/spike-029/run.mjs live F400,F400b,F200,A100,SKIP tippy-tooltip
# mui の調査（追加の計測）
node tmp/spike-029/run.mjs live SKIP2,SKIP3,F400c mui-tooltip
HOVER_WAIT_MODE=skip-reset node tmp/spike-029/probe.mjs https://mui.com/material-ui/react-tooltip/
HOVER_WAIT_MODE=skip-reset node tmp/spike-029/probe.mjs file://.../tmp/spike-029/scratch-misattribute.html   # 固定の待ちは環境変数なし
node tmp/spike-029/run.mjs live SAFE,SAFE2,SAFE3 mui-tooltip   # skip-safe（一時的な変更）
node tmp/spike-029/run.mjs live SAFE w3c-bad,w3c-wai,wikipedia,tippy-tooltip,bootstrap-tooltip,w3c-good,mdn,jqueryui-tooltip
node tmp/spike-029/run.mjs live AF100 mui-tooltip,wikipedia   # アニメーション絞り込み（判定が壊れた版）
# main の src に戻したあとのベースライン確認
npx playwright test -c packages/a11y-audit/playwright.config.ts packages/a11y-audit/test/content-on-hover.spec.ts -g "Escape で blur して消えるツールチップ" --repeat-each 10
npx playwright test -c packages/a11y-audit/playwright.config.ts packages/a11y-audit/test/content-on-hover.spec.ts --repeat-each 3
# 表の生成
node tmp/spike-029/mdtables.mjs
```

`run.mjs` の変種と `measure.mjs` の引数:

| 名前 | 環境変数 | 引数 |
|---|---|---|
| F400 / F400b | なし | `--settle-scale 1 --persist-scale 1` |
| F200 | なし | `--settle-scale 0.5 --persist-scale 1` |
| F100 | なし | `--settle-scale 0.25 --persist-scale 1` |
| A50 / A100 / A150 | `HOVER_WAIT_MODE=adaptive HOVER_WAIT_MIN=50/100/150 HOVER_WAIT_CAP=1000` | `--settle-scale 1 --persist-scale 1` |
| SKIP | `HOVER_WAIT_MODE=skip-reset` | `--settle-scale 1 --persist-scale 1` |

