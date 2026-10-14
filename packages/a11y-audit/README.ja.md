# @a11y-skills/audit

Playwright + axe-core ベースの WCAG 2.2 アクセシビリティ検査関数。

本パッケージは [`auditing-wcag`](https://github.com/masuP9/a11y-specialist-skills)
Claude Code skill から機能本体を切り出したものです。21 個の検査を関数として提供し、
すぐ実行できる Playwright 用の互換 test entry も同梱します。

> **English: see [README.md](./README.md).**

> **スコープ.** 自動テストで検出できるのは WCAG 違反の約 30〜40% です。完全な準拠確認には
> 手動テストが必須です。本パッケージはその一部を自動化します。

## 検査一覧

| 関数 | WCAG |
| --- | --- |
| `runAxeAudit` | axe-core による広範な検出 (2.0/2.1/2.2 A & AA) |
| `runFocusIndicatorCheck` | 2.4.7 フォーカスの可視化 / 2.4.11 フォーカスの非遮蔽（最低限） / 2.4.12 フォーカスの非遮蔽（強化） / 3.2.1 オンフォーカス |
| `runReflowCheck` | 1.4.10 リフロー |
| `runTargetSizeCheck` | 2.5.5 / 2.5.8 ターゲットのサイズ |
| `runTextSpacingCheck` | 1.4.12 テキストの間隔 |
| `runZoomCheck` | 1.4.4 テキストのサイズ変更（200% ズーム） |
| `runOrientationCheck` | 1.3.4 表示の向き |
| `runAutocompleteAudit` | 1.3.5 入力目的の特定 |
| `runTimeLimitDetector` | 2.2.1 タイミング調整可能 |
| `runAutoPlayDetection` | 2.2.2 一時停止、停止、非表示（画面の変化）／ 1.4.2 音声の制御（`<audio>`・`<video>` の再生状態。実際に音が聞こえるかは手で確かめる） |
| `runKeyboardReachabilityCheck` | 2.1.1 キーボード（Tab・複合部品内の矢印キー・activedescendant） |
| `runRedundantEntryCheck` | 3.3.7 冗長な入力（同じ form の中で同じ情報を求める欄の重なり。候補として報告） |
| `runMotionActuationCheck` | 2.5.4 動きによる起動（`devicemotion` / `deviceorientation` の listener。候補として報告） |
| `runChangeOnInputCheck` | 3.2.2 入力時（値を変えただけで起きる移動・新しいウィンドウ・フォーカス移動・ダイアログ。候補として報告） |
| `runAccessibleAuthenticationCheck` | 3.3.8 アクセシブルな認証（貼り付けの禁止・autocomplete の off・CAPTCHA らしき要素。候補として報告） |
| `runPointerGestureCheck` | 2.5.1 ポインタのジェスチャ / 2.5.7 ドラッグ動作（ドラッグ・スワイプ・複数の指で動きそうな部品。候補として報告） |
| `runFocusOrderCheck` | 2.4.3 フォーカス順序（Tab の順と見た目の並びのずれ・モーダルのフォーカス。候補として報告） |
| `runPointerCancellationCheck` | 2.5.2 ポインタのキャンセル（押し下げだけで動く部品。候補として報告） |
| `runNonTextContrastCheck` | 1.4.11 非テキストのコントラスト（入力欄などの枠・塗り、アイコンだけのボタンのアイコン。候補として報告） |
| `runCharacterKeyShortcutCheck` | 2.1.4 文字キーのショートカット（本文にフォーカスを置いて 1 文字ずつ押し、反応したキー。候補として報告） |

多くの検査は遷移済みの `page` を受けます。一部は navigation を所有し `targetUrl`
（または `TEST_PAGE`）を受けます: `runOrientationCheck` と `runTimeLimitDetector`
（`runZoomCheck` は URL 指定時）。`runFocusIndicatorCheck`・
`runKeyboardReachabilityCheck`・`runChangeOnInputCheck`・`runFocusOrderCheck`・`runPointerCancellationCheck`・`runCharacterKeyShortcutCheck` は `browser` を受けます。
`runAutoPlayDetection` は optional 依存 `pixelmatch` + `pngjs` が必要です（インストール参照）。

`runRedundantEntryCheck`（3.3.7、`a11y-skills/redundant-entry`）は遷移済みの `page` を受けます。
同じ form（form に属さない欄はページ全体）の中で、同じ目的の欄が 2 つ以上ある場合に、その
2 つ目以降を `incomplete` の候補にします。目的は `autocomplete` の欄名トークンで決め、無ければ
名前・id・ラベル・placeholder から推定します（「shipping」「お届け先」などの範囲の語と「確認」
などの確認用の語は取り除いてから照合します）。範囲（`shipping` / `billing`）が異なる組は
`kind: 'scoped'`、同じ範囲の繰り返しは `kind: 'repeated'` です。同じ form の中の「〜と同じ」
のようなチェックボックス・ボタン・選択肢は `copyControls` に載せますが、値が実際に写るかは
確かめません。disabled / readonly の欄は既出の情報として数えますが、再入力として報告する
（node にする）のは 1 つ目より後ろにある編集できる欄だけです（`fields[].editable`）。
パスワード・ワンタイムコードの欄、別の `section-*`、別の form は対象外です。
**手順が複数ページに分かれるフォームは範囲外**です（前のページの入力を知り得ないため）。

`runMotionActuationCheck`（2.5.4、`a11y-skills/motion-actuation`）は遷移済みの `page` を受けます。
Chrome DevTools Protocol（CDP）で、主フレームの `window` / `document` に付いた `devicemotion` /
`deviceorientation` / `deviceorientationabsolute` の listener を取り出し、1 件ごとに `incomplete` の
候補にします。画面の部品での代替と、動きでの起動を止める手段があるかは人が確かめます。
`window` に listener がある型には合成イベントを送り、DOM が変わるか（`details.simulation.results[].domMutations`。
送らずに同じ長さ待ったときの変化数 `baselineDomMutations` と比べ、ページが自分で更新している分は差し引いて判断）
と遷移を証跡にします。`window` に listener が無く `document` だけにある場合は `simulation.status` が
`skipped-document-only`（listener が 0 件なら `skipped-no-listeners`）です（`simulate: false` で送らない。送るとページの状態が変わるので、同じ page を使い回す
ときは `false`）。戻らない handler は CDP で打ち切ります。**CDP は Chromium のみ**で、それ以外では
`listenerInspection: 'unsupported'` の `incomplete` です。iframe の中と、利用者の操作の後に付く
listener は見つかりません。

`runChangeOnInputCheck`（3.2.2、`a11y-skills/no-context-change-on-input`）は `browser` を受け、
自分で context を作って開きます。主フレームの欄（`select` / radio のグループ / checkbox /
テキスト系の `input` と `textarea`。disabled・readonly・見えない欄は除く）を 1 つずつ変え
（select は別の option、radio は未選択の 1 つ、checkbox は反転、テキスト系は固定の値を入れて
blur して `change` を起こす）、主フレームの移動・新しいウィンドウ・フォーカスの移動・ダイアログが
起きたかを記録して `incomplete` の候補にします。前もって説明があれば適合なので、説明の有無は
人が確かめます。移動したら新しい context でやり直し、試した欄は飛ばして残りを続けます
（`details.restarts`）。値はイベントを起こさずに戻しますが、handler がページに加えた変更は
戻りません。**実ページで値を変え `change` を起こすので、自動保存・自動送信のあるページでは
実際に通信が起きえます。** iframe・shadow root の中の欄、ARIA だけの独自部品、1 種類の値でしか
試さないこと、`settleMs` を過ぎてから起きる変化は見落とします。操作できなかった欄（他の要素に
覆われているなど）は `details.untested` に入り、要確認（`incomplete`）になります。`date` / `time` / `range` /
`color` / `file` などの type は集めません。id が読み込みごとに変わるページでは、やり直しのたびに
同じ欄を再び試し、同じ finding が重複しえます（やり直しは `CHANGE_ON_INPUT_MAX_RESTARTS` 回まで）。
`runAccessibleAuthenticationCheck`（3.3.8）は遷移済みの `page` を受けます。メイン文書の
`input` のうち、パスワード欄、確認コード欄（`autocomplete="one-time-code"`、または名前・id・
ラベル・placeholder が OTP らしいもの）、ユーザー名欄（`autocomplete="username"`、または同じ
form で最初のパスワード欄の直前にある文字入力欄）を集め、CAPTCHA らしき要素（名前に
`captcha` を含む要素、`.g-recaptcha`・`.h-captcha`・`.cf-turnstile`・`[data-sitekey]`、
CAPTCHA の iframe。入れ子は外側の 1 件だけ）と合わせて、3 つのルールで `incomplete` の候補にします:
`a11y-skills/auth-paste-blocked`（貼り付けが効かない欄）、`a11y-skills/auth-autocomplete`
（認証の欄が `autocomplete="off"`、または欄の種類に合わない値）、`a11y-skills/auth-captcha`。
どれも、認知機能テストを使わない別の手段（パスキー・SSO など）や自動入力の支援があれば満たせるため、
`violation` にはせず人が確かめます。属性が無い欄（`autocompleteStatus: 'missing'`）は `details` に
残しますが報告しません（パスワード管理ソフトは欄の種類から推定して動くことが多く、`off` のように
明示的に止めてはいないため。`on` だけの欄も同じ扱いです。名前が 1.3.5 のパターンに当たる欄なら
`autocomplete-audit` の `autocomplete-missing` が報告しうるので、当たらない欄はどちらも報告しません）。貼り付けは、
パスワード・確認コードの見える編集できる欄に短いテキスト（`details.pasteTest.probe`）をキーボードで
貼って実測します。欄の値は結果に残さず（ページが本物のパスワードを戻すことがあるため）、貼った後の値が
貼ったテキストと一致したか（`valueAfterPaste`）だけを記録します。**実測は呼び出し側の context に
クリップボードの権限を付け、クリップボードを上書きし、補助ページを一時的に開きます**（欄の値は元に戻し
ますが、期限切れ（timeout）の欄は戻しません。`input` などでページが変えた状態も戻りません。同じ page を使い回すなら `paste: false` で、
CLI はチェックごとに新しい context を使うので影響しません）。実測は Chromium で確かめた方式で、
権限や貼り付けが効かない環境では `pasteTest.status` が `unavailable` になり、対象欄は未計測として
`incomplete` です。欄に autocomplete が無いときは所属する form の `autocomplete="off"` を引き継ぎ
ます（`details.fields[].formAutocomplete`。欄自身の値が優先）。フォーカスを移す処理があって対象の
欄にフォーカスが残らないときは貼り付けず、未計測（`error: 'focus-moved'`）として `incomplete` にします。戻らない handler は CDP で打ち切ります。見えない・編集できない欄は実測せず
`incomplete` です。iframe と shadow root の中の欄、ログインボタンを押してから出るフォーム、名前に
`captcha` を含まない独自の CAPTCHA は見つかりません。

`runPointerGestureCheck`（2.5.1・2.5.7、`a11y-skills/pointer-gestures`・`a11y-skills/dragging-movements`）は遷移済みの `page` を受けます。ドラッグやスワイプ、複数の指の操作で動く可能性がある要素を、1 つの検査で 2 つのルールに振り分けて `incomplete` の候補にします。拾うのは、`draggable="true"`、`dragstart` / `drop` の listener、同じ要素に「押す」と「動かす」の両方の listener があるもの、複数の指を見る listener（`touches.length` など）、`role="slider"` の自作スライダー、並べ替え・カルーセル・地図の部品のしるしで、文書と open shadow root の中を見ます（`shadowHosts` + `selector`）。動かす listener だけの要素と、20 種類以上の listener を持つ委譲先の要素は候補にせず、後者は `details.delegationRoots` に記録し、ルールごとに 1 つのページ単位の「手で確かめて」node として報告します。`window` / `document` の複数の指・ドラッグの listener はページ単位の node になります。1 点の操作で同じことができるか、必須の操作かは人が確かめます。listener は CDP で取り出すので **Chromium のみ**で、それ以外では属性と部品のしるしだけから候補を出し、手で確かめる node を付けます。イベントは送らずページの状態は変えません。委譲で作られたドラッグ、あとから `document` に付く move listener、iframe の中は見つからず、実際にドラッグして動くかは確かめません。候補は基準ごとに 200 件、listener のある要素は 1000 個までです。

`runAutoPlayDetection` の 1.4.2（`a11y-skills/auto-play-audio`）は、ページと iframe（入れ子・
shadow root の中も含む）の `<audio>`・`<video>` について、「再生中・消音でない・音量が 0 より大きい・
再生速度が 0 より大きい」かを、検査の開始時とスクリーンショットのたび（約 2 秒ごと）に測り、
あわせて play / pause / ended / volumechange / ratechange の発生時刻も記録します。検査中に
追加されたメディアは、文書と開いている shadow root の変化を見て、追加された時点から記録します。
記録した状態は次の記録まで続くものとして、音ありだった時間を足して `audibleSeconds`（音ありで
鳴った秒数）とします。測定の間に止めたり消音したりしても、それまでの時間は数えます。検査中に
DOM から消えたメディアも `removed: true` の印付きで結果に残します（その `target` は属していた文書の
`html` です）。iframe ごと消えたり中身が置き換わったりしたときは、消える前の最後の測定の記録を
`documentRemoved: true` の印付きで残し、`target` は残っている親の文書の `html`、説明には元の frame の
URL を書きます。最後の測定から消えるまでの音は数えませんが、最後の記録で音ありの再生中だったものは、その後どれだけ鳴ったか分からないので、鳴った秒数に関係なく `incomplete` にします。これが 3 秒を超えるもの、または最後の測定で音ありで再生中で、この先も 3 秒を超えて
鳴るもの（`loop`、終わりのない配信、残りの再生時間を再生速度で割った実時間が 3 秒超）のうち、
見えている `controls` が無いものを `incomplete` にします。見えているかは、要素とその上の iframe 要素の
大きさ・`display`・`visibility`・`opacity` と、表示上の祖先（slot に割り当てられた要素は slot 側）で
判断します。`overflow` が `hidden`・`clip` の祖先の枠線より内側の領域と重ならなければ見えないとし、
`clip-path`（`none` 以外）や `clip`（`auto` 以外）があるとき、重ならない祖先がスクロールできるとき、
`fixed`・`absolute` の箱が祖先からはみ出しうるとき、`transform` などで領域の位置が決まらないときは
決めきれないとして `incomplete` にします。
一部だけの切り取りや画面外の位置までは見ません。測るのは検査を始めてから（ページを開いた後）
なので、それより前に鳴った音は数えません。同じ page で検査を繰り返しても、記録は検査ごとに
作り直します。同じ frame で名前から見つけた止める・消音の部品は記録しますが、クリックして
確かめはしません。結果の `target` は、外側の iframe・shadow host・要素の順に並び、それぞれ
一つ前の要素が開く文書（または shadow root）の中で探します。

Chromium は利用者の操作が無いと音ありの自動再生を止めるので、自分でブラウザを起動する
場合は次の引数を付けてください。付けないと音ありのメディアは再生が始まらず、
「再生が始まらなかった」という `incomplete` になります（CLI は付けて起動します）。

```ts
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
});
```

`runFocusOrderCheck`（2.4.3、`a11y-skills/focus-order-visual` と `a11y-skills/focus-order-dialog`）は
`browser` を受けます。メイン文書で Tab を押して一巡し、各要素の位置を記録して、見た目の並びから
外れた移動（上へ戻る `backward-block`・同じ行で逆向き `backward-inline`・遠くへ跳んで戻る detour）を
`incomplete` の候補にします（段組みの次の列への移動 `column-wrap` は報告しません）。見た目の順は
「上から下、行の中は読む向き（`rtl` は右から左）、上へ戻るなら次の列」という単純な規則で推定するので、
カード型の格子・横スクロール・縦書きは誤りえます。`position: fixed` / `sticky` の要素（とその中）と
大きさの無い要素は比べません（`details.skippedTransitions`）。iframe にフォーカスがある間は iframe の箱を
位置とし、中の順は見ません。shadow root は開いているものだけです。一巡を最後まで見られなかったとき
（上限・時間切れ・遷移）は、残りを比べていないと伝える node を足し、passes にしません。
ダイアログは、`aria-haspopup="dialog"`・`aria-controls` の先が dialog・`commandfor` + `command="show-modal"`・
よく使われるライブラリの `data-*` を持つ開くボタンだけを試します。**ページを読み直し、開くボタンで Enter、
閉じるために Escape（効かなければ閉じるボタン）を押す**ので、送信や遷移を兼ねるボタンはリクエストを
飛ばしえます（CLI は常に最大 10 件を試します。関数 API なら `maxDialogTriggers: 0` でどの開くボタンも押さなくなりますが、候補の収集と件数の記録は行います）。モーダルを開いてもフォーカスが中へ
移らない、閉じても開いたボタンへ戻らない場合を候補にします（戻す先が別でよい場合があるので `incomplete`）。
モーダルの中の Tab の巡回は見ません。`timeBudgetMs`（既定 60 秒）と `maxTabPresses`（既定 300）を受け取ります。
位置の分析は純粋関数 `analyzeFocusOrder(points, { viewport, direction })` として公開しています。
`runFocusIndicatorCheck` の `details.allElements` を持っているなら、
`allElements.filter(r => r.tabStep !== null && r.frame === null)` を `tabStep` 順に並べ、各要素に
`positioning: 'flow'` を補って渡せます（fixed / sticky を区別できないぶん、誤検出が増えます）。

`runPointerCancellationCheck`（2.5.2、`a11y-skills/pointer-cancellation`）は `browser` を受けて自前の
context を作り、ページが移動したら新しい context でやり直して試した要素を飛ばします。操作できる要素
（押す listener を持つもの・インラインの `onpointerdown` などを持つもの・ボタンやリンクなど。文書と open
shadow root の中）に、押し下げのイベント（`pointerdown` と `mousedown`）だけを**合成して送り**、離しません。
ページの移動・新しいウィンドウ・ダイアログ・フォーカスの移動（押した要素自身へのものを除く）・DOM の変化
（`style` 属性を除く）が起きた要素を `activated-on-press`、押す listener だけを持ち（離す・クリックの
listener が要素自身に無く）変化も見えなかった要素を `press-only-listener` として、どちらも `incomplete` の
候補にします。離したときに実行されるか、途中でやめられるか、取り消せるか、押し下げでの実行が必須かは人が
確かめます。何もしなくても DOM が変わるページでは DOM の変化を根拠にせず（`details.domObservation`）、
戻らない handler は 1 ステップ 5 秒で打ち切って context ごと閉じ、その要素を未検査として `incomplete` に
します。**合成イベントなのでページのスクリプトが動きます**——押し下げで送信や保存をするページでは実際に
実行されえます（`isTrusted` を確かめる処理には反応されません。`touchstart` は送りません）。listener は CDP で
取り出すので **Chromium のみ**で、それ以外では listener の根拠が付かず、手で確かめる node を付けます。
20 種類以上の listener を持つ委譲先の要素があるとき、`window` / `document` に押す listener があるときも、
要素に帰属できず、役割やインラインの属性を持たない要素は押していないので、ページ単位の「手で確かめて」node を
付けて `incomplete` にします（`details.delegationRootCount`・`details.pageListeners`）。
iframe の中・closed shadow root は見ません。押すのは 100 要素まで、予算は 60 秒（`timeBudgetMs`）です。

`runNonTextContrastCheck`（1.4.11、`a11y-skills/non-text-contrast-boundary` と
`a11y-skills/non-text-contrast-icon`）は遷移済みの `page` を受けます。計算済みスタイルから、
入力欄・`textarea`・`select`・チェックボックス・ラジオ・スイッチの**枠と塗り**が外側の色と持つ比と、
文字のないボタン（アイコンだけのボタン）の**アイコンの色**（インライン SVG の `fill` / `stroke`、
`::before` / `::after` の文字色）が背景と持つ比を測り、3:1 未満と、測れないものを `incomplete` の
候補にします（`details.components[].status`: `low` / `no-boundary` / `undetermined`）。枠か塗りの
どれか 1 つが 3:1 あれば `pass` です。色は Chromium で 1×1 の canvas に塗って sRGB に直すので、
`oklch()` や `color-mix()` も測れます。判定は丸める前の比で行い、表示は切り捨てです（2.996 は 2.99）。
ブラウザが描く既定のチェックボックス・ラジオ（`appearance` が `none` でなく `accent-color` が `auto`）は、
著者が見た目を変えていない UA の部品として 1.4.11 の例外になるので測らず、報告もしません
（`status: 'user-agent'`）。`accent-color` を変えたものは `undetermined` です。色が決まらないときは
`pass` にせず `undetermined` にし、理由を `undeterminedReason` に残します: `background-image`（画像・
グラデーション）・`opacity`・`filter`（`filter` / `backdrop-filter` / `mix-blend-mode`）・`out-of-flow`
（背景なしの絶対・固定配置の下）・`color-scheme`（背景のない dark。`light dark` はブラウザの設定に従う）・`accent-color`・`svg-paint-server`・
`image-icon`（画像・CSS の背景画像）・`mixed-icon-colors`（3:1 以上と未満の部分が混ざるアイコン）・`too-many-icon-parts`（20 要素超）・
`svg-overlap`（塗りのある図形の上に別の図形が重なる SVG）・`svg-use`（参照先の図形が自分で色を決める `<use>`、または外部ファイル）・
`visually-hidden`（opacity や sr-only で隠したネイティブ部品。代わりに描いた部品を確かめる）・`no-icon-color`（読める色が無いアイコン）。
描かれていない部分（`display: none` など）はアイコンの元として数えず、sr-only の文字は「見える文字」に数えません。読み込んだときの見た目だけを見て、
ホバー・フォーカス・選択済みなどの状態は見ません。外側の色は祖先の背景から決め、祖先でない要素との
重なり（`z-index` など）は見ません。`box-shadow` / `outline` で描いた枠は測らず `otherVisuals` に
有無だけ残します。部品の中の部分（チェックの印・つまみ）、グラフ・図、iframe・shadow root の中は
見ません。部品は 300 個まで測り、超えた分は `componentCounts` に数えて手動確認の node を足します。
色の純粋関数 `contrastRatio`・`compositeOver`・`compositeLayers`・`relativeLuminance`・`floorRatio`・
`toHexColor`（引数は 0〜255 の `{ r, g, b }`）も export しています。

`runCharacterKeyShortcutCheck`（2.1.4、`a11y-skills/character-key-shortcut`）は `browser` を受けて自前の
context を作ります。`<body>` にフォーカスを置き、印字できる ASCII の 94 文字（空白を除く）を 1 文字ずつ
（US 配列で Shift が要る `A`-`Z` と記号は Shift を押しながら）**実際に押して**、ページの移動・新しいウィンドウ・ダイアログ・フォーカスの移動・DOM の変化・スクロール・
`preventDefault()` が起きたキーを `incomplete` の候補にします（`details.reacted`）。DOM の変化は、何も押さずに
同じ時間（`settleMs`）を 10 回測った最大の量（`baselineDomMutations`、約 1 秒）の 2 倍に 3 を足した数以上のときだけ反応とみなします。
止める・変える設定があるか、フォーカスがある部品の中だけで効くかは人が確かめます。キー入力が届く
`window` / `document` / `<html>` / `<body>` の `keydown` / `keypress` / `keyup` の listener を CDP で先に取り出し
（`details.listeners`）、1 つも無ければキーを送らずに inapplicable にします（`keyProbe: 'skipped-no-listeners'`）。
CDP は **Chromium のみ**で、それ以外では listener の根拠が付かず、全部のキーを押します。反応したキーのあとは
新しい context で読み込み直して続きのキーを押します。`settleMs` のあとに確定した遷移は、次のキーを押す前に気づいて直前のキーの反応に記録します。同じ URL での `history.replaceState()` などは遷移とみなしません。`blur()` してもフォーカスを戻すページのキーは `focus-not-on-body` の未検査になります。`preventDefault()` は keydown・keypress・keyup のどれでも見ます（読み込み直しは `maxReloads`、既定 30 回まで。`preventDefault()`
だけのときは読み込み直しません）。`keys` で押すキーを絞れ、`timeBudgetMs`（既定 60 秒）と `settleMs`（既定 100ms）を
受け取ります。既知の制限: フォーカスが `<body>` にあるときだけ押すので、部品にフォーカスがあるときだけ効くショートカット
（2.1.4 の例外）と、アプリ全体を包む要素に付けた keydown（React 17 以降の `#root` など）は見落とします。
開き直すのは目に見える反応があったときだけなので、画面に出ない内部の状態だけを変えるキー（黙ってショートカットを無効にするなど）の後は、その状態のまま次のキーを押し、後のキーの反応を見落とすことがあります。2 回押すショートカット（`g` → `i`）の 2 つ目が単独のショートカットとして報告されること（人が確かめる候補が余分に出る）もあります。疑わしいときは `keys` を 1 文字にして個別に確かめられます。キーごとに開き直さないのは、1 回 0.6 秒以上かかり、94 キーで時間の上限を超えるためです。
最初の操作のあとで付く listener は取り出せません。ページが自分で DOM を書き換え続けると小さな変化を見落とします。
**実際にキーを押す**ので、ショートカットが削除・送信などをするページでは副作用があります。

## インストール

```sh
npm install -D @a11y-skills/audit @playwright/test @axe-core/playwright
```

`@playwright/test` と `@axe-core/playwright` は **peer dependencies** です。

`runAutoPlayDetection` は追加で `pixelmatch` と `pngjs` を必要とします（**optional
dependencies** として宣言、既定でインストールされます）。遅延ロードされるため、
`--omit=optional` でインストールしても他の9検査は動作します:

```sh
npm install -D pixelmatch pngjs   # runAutoPlayDetection を使う場合のみ
```

> ESM 専用です。CommonJS ビルドは同梱しません。ESM（または ESM 出力の TypeScript）から
> import してください。

## CLI

テストランナー不要で、コマンド 1 本で 10 検査すべてを実行できます。

```sh
npx -y @a11y-skills/audit --url https://example.com
```

npm 7 以降では peer dependencies（`@playwright/test`、`@axe-core/playwright`）が
自動でインストールされます。初回は Chromium のインストールが必要です:

```sh
npx playwright install chromium
```

### フラグ

| フラグ | デフォルト | 説明 |
| --- | --- | --- |
| `--url <url>` | `TEST_PAGE` 環境変数 | 対象 URL。`--url` が環境変数より優先されます。どちらも未設定の場合は usage を表示して exit 2。 |
| `--checks <list>` | `all` | カンマ区切りのチェック名（下記一覧参照）。 |
| `--output-dir <dir>` | `./a11y-audit-results` | 結果 JSON の出力ディレクトリ。 |
| `--screenshot` | off | focus-indicator のスクリーンショットを有効化。 |
| `--list-checks` | — | チェック名一覧を出力して exit 0。 |
| `--version` | — | バージョンを出力して exit 0。 |
| `--help` | — | usage を出力して exit 0。 |

### チェック名一覧

```
axe-audit
focus-indicator-check
reflow-check
text-spacing-check
zoom-200-check
orientation-check
autocomplete-audit
time-limit-detector
auto-play-detection
target-size-check
keyboard-reachability-check
redundant-entry-check
motion-actuation-check
change-on-input-check
accessible-authentication-check
pointer-gesture-check
focus-order-check
pointer-cancellation-check
non-text-contrast-check
character-key-shortcut-check
```

### 終了コード

| コード | 意味 |
| --- | --- |
| `0` | すべてのチェックが完了し、違反なし。 |
| `1` | すべてのチェックが完了し、1 件以上の違反あり。 |
| `2` | 実行時エラー — 引数不正・peer 欠落・ナビゲーション失敗・チェックのクラッシュ。 |

exit コードが非 0 でも、完了したチェックの JSON は必ず書き出されます。

### peer 要件

`@playwright/test >=1.50.0` および `@axe-core/playwright >=4.10.0` が必要です。
見つからない場合は exit 2 でインストール手順を案内します。
`--list-checks`、`--help`、`--version` は peer なしでも動作します。

### `auto-play-detection` と optional deps

`auto-play-detection` は `pixelmatch` と `pngjs` が必要です。
未インストールの場合はそのチェックだけ `SKIPPED` となり、終了コードには影響しません。
他の 9 検査は通常通り実行されます。

### GitHub Actions

手動トリガーで監査を実行するコピー&ペースト用ワークフロー。violations があるとジョブは fail する（終了コード 1）。結果を情報提供のみにしたい場合は監査ステップに `continue-on-error: true` を付ける。

```yaml
# .github/workflows/a11y-audit.yml
name: A11y Audit

on:
  workflow_dispatch:
    inputs:
      target_url:
        description: 'Audit target URL'
        required: true
        default: 'https://example.com'

jobs:
  a11y-audit:
    runs-on: ubuntu-latest
    steps:
      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: '24'

      - name: Install audit package
        run: npm install --no-save @a11y-skills/audit @playwright/test @axe-core/playwright

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run a11y audit
        run: npx a11y-audit --url "$TARGET_URL" --output-dir a11y-audit-results
        env:
          TARGET_URL: ${{ inputs.target_url }}

      - name: Upload audit results
        uses: actions/upload-artifact@v7
        if: always()
        with:
          name: a11y-audit-results
          path: a11y-audit-results/
          retention-days: 30
```

Notes:

- `push` / `schedule` トリガー（URL はハードコード）を追加すると、定期的なゲートとして実行できる。
- 結果 JSON ファイル（`--screenshot` 指定時はフォーカスインジケーターのスクリーンショットも含む）はビルドアーティファクトとしてアップロードされる。
- 繰り返し実行を高速化するには、インストール済みの `@playwright/test` バージョンをキーに `~/.cache/ms-playwright` をキャッシュする — パターンはこのリポジトリの `ci.yml` を参照。

## 使い方 — 関数 API（推奨）

ページの遷移は呼び出し側で行い、関数は検査の実行・結果 JSON の書き出し・結果オブジェクトの
return を担います。

```ts
import { test } from "@playwright/test";
import { runAxeAudit } from "@a11y-skills/audit/playwright";

test("axe audit", async ({ page }, testInfo) => {
  await page.goto("https://example.com");
  const result = await runAxeAudit({
    page,
    outputDir: testInfo.outputDir,   // axe-result.json の出力先
    // outputFile: "axe-result.json", // 任意で上書き
    // tags: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
  });
  expect(result.summary.violationCount).toBe(0);
});
```

フォーカス表示検査は、フォーカスで遷移が起きた際に新しい context で再試行するため、
自身の browser context を所有します。そのため `page` ではなく `browser` と `targetUrl`
を受け取ります。

```ts
import { runFocusIndicatorCheck } from "@a11y-skills/audit/playwright";

test("focus indicators", async ({ browser }, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: "https://example.com", // または TEST_PAGE 環境変数
    outputDir: testInfo.outputDir,
    screenshot: true,                 // 既定: false
    // contextOptions: { locale: "ja-JP" }, // browser.newContext() に転送
  });
  expect(result.details.elementsWithoutFocusStyle).toBe(0);
});
```

`runFocusIndicatorCheck` / `runKeyboardReachabilityCheck` / `runKeyboardTrapCheck` / `runChangeOnInputCheck` / `runCharacterKeyShortcutCheck` は、
`browser` の代わりに `createContext` を渡せます。`context.route` による URL 検査のような
呼び出し側の守りを、検査が使うすべての context に付けたいときに使います。

```ts
const result = await runKeyboardTrapCheck({
  createContext: async () => {
    const context = await browser.newContext({ locale: "ja-JP" });
    await context.route("**/*", guardRequest); // 呼び出し側の検査
    return context;
  },
  targetUrl: "https://example.com",
});
```

- `createContext` と `browser` の両方を渡すと `createContext` が使われます。どちらも無いとエラーになります。
- `createContext` を使うとき `contextOptions` は使われません。必要なオプションは関数の中で指定してください。
- 呼ばれるたびに**新しい** context を返してください（検査が使い終わると閉じます。フォーカス表示検査はやり直しのたびに呼びます）。

結果を呼び出し側の要素に結びつけたいときは、`runFocusIndicatorCheck` の `echoAttribute` に属性名（例: `data-test-id`）を
渡します。要素を指す記録（`allElements`、`issues`、`focusObscuredIssues` の `element` と
`obscuredBy`、`onFocusViolations` の `element`）すべてに `echo` として属性の値が付きます
（属性が無い要素は `null`、オプションを渡さなければ `echo` は付きません）。検査は新しい
context でページを開くため、属性はページの読み込み時点で要素に付いている必要があります
（ページのマークアップ、または `createContext` で作る context に `addInitScript` で付ける）。
属性名は文字列としてそのまま `getAttribute` に渡され、不正な名前は `Error` になります。

フォーカス表示検査の要素の記録（`allElements`、`issues`、`focusObscuredIssues` と
`onFocusViolations` の `element`）には、要素がどの文書にあるかを示す `frame` と
`shadowHosts` が付きます。

- `frame`: 主フレームの要素は `null`。iframe の中の要素は `{ url, selector }`（その文書の URL と、
  親文書での iframe 要素の selector。親から辿れない別オリジンでは `selector` が `null`）。
  入れ子の iframe は一番内側の iframe だけを表します。
- `shadowHosts`: open な shadow root の中の要素は、外側から順に host の selector。外の要素は `[]`。
  `selector` はその shadow root の中での selector です（host ではなく、中の要素そのものを記録します）。
- iframe の中の要素の `rect` は、主ページではなくその iframe の文書の左上が原点です。
- closed な shadow root の中は見えず、host として記録されます。iframe の外の固定要素が iframe の
  中の要素を隠す場合は検出しません（隠れ判定は文書ごと）。

**フォーカス前後の画像の差（`screenshotDiff`）:**

`runFocusIndicatorCheck` に `screenshotDiff: true` を渡すと、各要素について「フォーカスしていないとき」と
「フォーカスしたとき」の、要素の周り（8px 広げた範囲）の画像を比べ、`allElements` の各記録と `issues` に
`visualDiff: { diffRatio, rect }` を付けます。`diffRatio` は比べた範囲のうち変わった画素の割合（0〜1）、
`rect` は変わった範囲（ページ座標。変化なしなら `null`）です。計算済みスタイルでは見えない印
（`::before` / `::after`、親の `:focus-within`、別の要素）を拾うためのオプションです。

- 既定は `false`（オプションを渡さなければ `visualDiff` は付かず、挙動は変わりません）。Tab のたびに画像を撮るので遅くなります。この時間も `timeBudgetMs` に含まれます。
- 基準の画像は、Tab で回り始める前に何もフォーカスしていない状態で 1 回撮ったページ全体です。注釈の枠と、前の要素に残した見た目は撮影中だけ隠します。
- 分類は変わりません。スタイルの差が無い要素は `focus-visible` の `incomplete` のままで、画像に差があればメッセージに「画像では周りが変わっている。印がある可能性」と出ます。差が無ければ「画像にも変化なし」と出ます。
- `pixelmatch` と `pngjs`（optionalDependencies）が入っていない環境では、エラーにせず警告を出して比較を飛ばし、`visualDiff` は `null` になります。画像を撮れなかった要素も `null` です。
- **限界:** fixed / sticky の要素、アニメーション・動画、スクロール位置や時間で変わる内容は、印ではない差として出ることがあります。読み込み時点でフォーカスされている要素（autofocus）は、基準の画像との差がありません。差があっても「印がある可能性」であり、目視で確かめてください。iframe の中の要素は比べず、`visualDiff` は `null` です。

### 出力先の解決順

各検査共通:

1. `outputPath` — フルパス（`outputDir`/`outputFile` とは排他）。
2. それ以外は `outputDir` → `A11Y_OUTPUT_DIR` 環境変数 → `process.cwd()` に、
   `outputFile` → 各検査の既定ファイル名を結合。

スクリーンショット（有効時）は結果ファイルの隣に書き出します。`outputFile` はファイル名のみ
指定可能です。絶対パスを使う場合は `outputPath` を使ってください。

### サーバー内で呼ぶ場合

すべての検査は副作用を止めるオプションを受け付けます。既定値は従来どおりの挙動です。

| オプション | 既定 | 内容 |
|---|---|---|
| `writeResult` | `true` | `false` のとき結果 JSON を書き出さず、返り値だけにする。`screenshot: true` なら画像は出力先の解決順どおりに書く。 |
| `quiet` | `false` | `true` のときコンソールに何も出さない。 |

出力先の指定が不正な場合（`outputPath` と `outputDir` の併用など）は、`writeResult: false` でも検査を始める前にエラーになります。

`runTargetSizeCheck` はさらに次のオプションを受け付けます。

| オプション | 既定 | 内容 |
|---|---|---|
| `resolveAccessibleNames` | `true` | `false` のときターゲットごとの `locator.ariaSnapshot()` を省き、`accessibleName` をすべて `null` にする。リンク 300 件のページで約 1.1 秒 → 約 0.06 秒。 |

```ts
const result = await runTargetSizeCheck({
  page,
  writeResult: false,
  quiet: true,
  resolveAccessibleNames: false,
});
```

`quiet` で消える警告のうち、結果の信頼性に関わるものは結果 JSON に残ります。

- keyboard-trap: Tab の押下回数が上限に達して打ち切った場合は `details.tabWalkCapped: true`
- focus-indicator: フォーカスによる遷移でリトライが上限に達し、未検査の要素が残った場合は `details.interrupted: true`
- focus-indicator: フォーカスで遷移したが原因の要素を特定できず、その後のやり直しでも特定できなかった場合（やり直しの使い切りや上限での打ち切りを含む）は `details.unidentifiedNavigation: true`。`onFocusViolations` が空なら `a11y-skills/no-context-change-on-focus` は `passes` ではなく `incomplete` になる
- focus-indicator / keyboard-reachability: 上限で打ち切った場合の挙動は下の「時間と Tab 回数の上限」を参照

**時間と Tab 回数の上限:**

`runFocusIndicatorCheck`・`runKeyboardReachabilityCheck`・`runFocusOrderCheck` は `timeBudgetMs`（ミリ秒、正の有限数）と `maxTabPresses`（正の整数）を受け取ります。0 以下や数でない値はエラーになります。

| チェック | `timeBudgetMs` の既定 | `maxTabPresses` の既定 | 上限に達したとき |
|---|---|---|---|
| focus-indicator | 上限なし | 上限なし | `details.aborted: { reason: 'timeout' \| 'tab-limit', url, recordedCount, focusableCount }`。`recordedCount` 件までを検査し、フォーカスできる要素は `focusableCount` 件あった。時間と回数は 3.2.1 のやり直しを含めた全体で数える。`interrupted`（やり直しの使い切り）とは別 |
| keyboard-reachability | 60 秒 | 600 回 | 時間は `details.aborted.reason: 'timeout'`、回数は `details.tabWalkCapped: true` |
| focus-order | 60 秒 | 300 回 | 時間は `details.aborted.reason: 'timeout'` と `tabWalk.ended: 'timeout'`、回数は `details.tabWalk.ended: 'tab-limit'`（`capped: true`）。どちらも順序の残りは比べていないので `incomplete` |

**同時に実行する場合の前提:**

- リクエストごとに専用の `outputDir` を渡す。スクリーンショットは「出力先ディレクトリ＋固定のファイル名」で書くため、`outputFile` だけを変えても衝突する。
- リクエストごとに専用の page（と browser context）を使う。検査は viewport の変更や遷移など、page の状態を変える。
- `runAutoPlayDetection` は判定のためにフレームのスクリーンショットと差分画像を必ず `outputDir` に書き、読み直す。`writeResult: false` で止まるのは `detection-result.json` だけ。

> **リフローの注意.** `runReflowCheck` は自身で狭い viewport を設定するため、遷移済みの
> page でも動作します。load 時にのみ viewport を読むページでは、legacy スクリプトと完全に
> 同じ結果を得るために `page.goto(...)` の**前**に viewport を設定してください（互換 entry
> はこれを行っています）。

## 使い方 — 互換 test entry

テスト本体を書きたくない場合は、同梱 entry を 1 行のローカル spec から re-export します。
entry は import 時に `test(...)` を呼び、`TEST_PAGE`（対象 URL）と `A11Y_OUTPUT_DIR`
（出力先）を読み、スクリーンショットも撮ります（従来スクリプトと同等の挙動）。

```ts
// tests/a11y/axe.spec.ts
import "@a11y-skills/audit/test-entries/axe-audit";
// tests/a11y/focus.spec.ts
import "@a11y-skills/audit/test-entries/focus-indicator-check";
// tests/a11y/reflow.spec.ts
import "@a11y-skills/audit/test-entries/reflow-check";
// tests/a11y/target-size.spec.ts
import "@a11y-skills/audit/test-entries/target-size-check";
// 他にも: text-spacing-check, zoom-200-check, orientation-check,
// autocomplete-audit, time-limit-detector, auto-play-detection,
// redundant-entry-check, motion-actuation-check, change-on-input-check,
// accessible-authentication-check, pointer-gesture-check, focus-order-check,
// pointer-cancellation-check, non-text-contrast-check,
// character-key-shortcut-check
import "@a11y-skills/audit/test-entries/text-spacing-check";
```

```sh
TEST_PAGE=https://example.com A11Y_OUTPUT_DIR=./a11y-results npx playwright test
```

> **`node_modules` への `testMatch` が使えない理由.** Playwright はテスト収集から
> `node_modules` を除外するため、`**/node_modules/@a11y-skills/audit/dist/test-entries/*.js`
> を `testMatch` に指定してもテストは見つかりません。上記の 1 行 re-export spec が
> entry を実行する正式な方法です。

## 結果形式

すべての検査は同じ axe 風の envelope を返し、同じ形式で JSON に保存します:

```ts
interface AuditCheckResult<TDetails> {
  source: CheckSource;            // 例: "reflow-check"
  url: string;
  timestamp: string;
  violations: NormalizedRuleResult[];   // 確定した違反
  incomplete: NormalizedRuleResult[];   // 要手動確認
  passes: NormalizedRuleResult[];       // 実行して問題が見つからなかったルール
  inapplicable: NormalizedRuleResult[]; // 検査対象がなかったルール
  summary: { violationCount; incompleteCount; passCount; checkedNodes? };
  details: TDetails;              // 検査固有の証跡（測定値・スクリーンショット等）
  disclaimer: { ... };
}
```

各ルール結果は axe と同じ形（`id` / `impact` / `description` / `help` /
`helpUrl` / `tags` / `nodes[]`、`nodes[].target` / `html` / `htmlTruncated` /
`failureSummary`）です。独自ルールは名前空間付き
（`a11y-skills/focus-visible`、`a11y-skills/target-size-minimum` など）で、
SC ごとに正確な WCAG バージョン・レベルタグ（`wcag2aa`、`wcag21aa`、
`wcag22aa`、`wcag247` 形式の SC タグ）が付きます。

**分類は保守的です。** 検出に死角がなく WCAG の例外が適用され得ない場合のみ
`violations` に入ります（フォーカスによる文脈変化、テキストスペーシングの
クリップ、autocomplete の不正トークン）。それ以外の検出 — reflow/zoom の
オーバーフロー、meta refresh、画面方向ロック、フォーカススタイル欠如、
小さすぎるターゲット — は `incomplete` に入ります。`incomplete` はノイズでは
なく「要手動確認キュー」として扱ってください。

同一ページに対する複数検査の結果を 1 つにまとめるには:

```ts
import { mergeNormalizedResults } from "@a11y-skills/audit";

const merged = mergeNormalizedResults([axeResult, reflowResult, targetResult]);
```

`mergeNormalizedResults` は URL 不一致で例外を投げ、ノードを
`target` + `failureSummary` で重複排除し、複数バケツに現れるルールは
`violations > incomplete > passes > inapplicable` の優先順位で統合します。
frame / shadow root 内の同一セレクタは区別しません。

## 結果型とスキーマ

```ts
import type { AxeAuditResult, FocusCheckResult } from "@a11y-skills/audit/schemas";
import { RESULT_SCHEMAS } from "@a11y-skills/audit/schemas";
```

`RESULT_SCHEMAS` は各検査 id に手書きの JSON Schema（draft 2020-12）を
対応付けており、`*-result.json` を実行時に検証できます。正規化マッパー
（`normalize*`）と `buildAuditResult` はパッケージルートから export されて
いるため、保存済み結果の `details` から 4 区分をいつでも再導出できます。

## ライセンス

MIT
