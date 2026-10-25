# Plan 033: `mergeNormalizedResults` で、別のバケットの node を勝ったバケットに混ぜない

> **実行者への指示**: このプランを上から順に実行する。各検証コマンドを実行し、
> 期待どおりの結果を確かめてから次へ進む。「STOP 条件」に当たったら止まって報告し、
> 自分で工夫して先へ進めない。`plans/README.md` は更新しない。
>
> **差分確認（最初に実行）**:
> `git diff --stat 3b7d8e1..HEAD -- packages/a11y-audit/src/utils/axe-format.ts packages/a11y-audit/test/normalize.spec.ts`
> 差分があれば「現状」の抜粋と実コードを見比べ、食い違えば STOP 条件として扱う。

## ステータス

- **Codex plan review**: 通過（1 巡目、2026-10-25、見送った low 0 件、指摘なし）

- **優先度**: P2
- **工数**: S
- **リスク**: LOW（公開関数 `mergeNormalizedResults` の出力だけが変わる。CLI も検査も使っていない）
- **依存**: なし
- **カテゴリ**: bug
- **計画時点**: commit `3b7d8e1`, 2026-10-25

## なぜ重要か

`mergeNormalizedResults`（`src/index.ts:60` で公開）は、同じ URL の複数の検査結果を 1 つにまとめる。ルール id だけをキーにしているので、同じルールが `violations` と `incomplete` の両方に出ていると、incomplete 側の node が violations 側のルールの `nodes` に足され、そのルールは incomplete から消える。利用側は「違反の要素」として、本当は手で確かめる段階の要素まで受け取る。

axe は同じルール id を `violations` と `passes` の両方に返すのが普通（`color-contrast` が 3 件落ちて 200 件通る、など）。`normalizeAxeResults` は passes / inapplicable の node を落とす（`axe-format.ts:2070-2083` のコメント: "passes/inapplicable carry rule metadata only"）ので、passes の node が混ざることはないが、ルール自体は passes から消える（「通った」情報が失われる）。violations と incomplete の混在は、カスタム検査でも axe でも起こりうる。

## 現状

`packages/a11y-audit/src/utils/axe-format.ts:2096-2168`（抜粋）:

```ts
/**
 * Merge several check results for the same URL into one normalized view.
 *
 * - Results with differing URLs are rejected (throws).
 * - The same rule id is merged into one entry; nodes are deduplicated by
 *   `target` + `failureSummary`. Identical selectors inside different frames
 *   or shadow roots are NOT distinguished.
 * - A rule appearing in several buckets is placed in the highest-priority one:
 *   violations > incomplete > passes > inapplicable.
 */
export function mergeNormalizedResults(
  results: Array<AuditCheckResult<unknown>>,
): MergedAuditResult {
  …
  interface MergedEntry {
    bucketIndex: number;
    rule: NormalizedRuleResult;
    nodeKeys: Set<string>;
  }
  const byId = new Map<string, MergedEntry>();
  const nodeKey = (n: NormalizedNode): string =>
    `${JSON.stringify(n.target)}|${n.failureSummary}`;

  for (const result of results) {
    BUCKETS.forEach((bucket: BucketName, bucketIndex) => {
      for (const rule of result[bucket]) {
        let entry = byId.get(rule.id);
        if (!entry) {
          entry = { bucketIndex, rule: { ...rule, nodes: [] }, nodeKeys: new Set() };
          byId.set(rule.id, entry);
        }
        entry.bucketIndex = Math.min(entry.bucketIndex, bucketIndex);
        for (const node of rule.nodes) {
          const key = nodeKey(node);
          if (!entry.nodeKeys.has(key)) {
            entry.nodeKeys.add(key);
            entry.rule.nodes.push(node);
          }
        }
      }
    });
  }

  const merged: Record<BucketName, NormalizedRuleResult[]> = { violations: [], incomplete: [], passes: [], inapplicable: [] };
  for (const entry of byId.values()) {
    merged[BUCKETS[entry.bucketIndex]!].push(entry.rule);
  }
```

`BUCKETS` は `['violations', 'incomplete', 'passes', 'inapplicable'] as const`（`:2088` 付近）。

唯一のテスト `test/normalize.spec.ts:1144-1201` は、1 つのルールを「1 つ目の結果の incomplete」と「2 つ目の結果の violations」に置き、**違反側に全 node が集まる**ことを期待している（`.a` が両方にある重複と `.b`）。この期待自体が今のバグを固定している。

## 方針

キーを `ルール id` から `(バケット, ルール id)` にする。

- 同じバケット内では今までどおり id で 1 つにまとめ、node は `target + failureSummary` で重複を除く。
- 違うバケットの同じルールは、**それぞれのバケットに残す**（violations にも incomplete にも、node はそれぞれ自分のもの）。ただし passes / inapplicable は「上位のバケットに同じルールがあれば落とす」（通った・対象外は、落ちた・要確認があるときは意味を持たないため）。つまり優先順位は violations と incomplete の間では適用せず、passes / inapplicable に対してだけ適用する。
- doc コメント（`:2098-2106`）を新しい振る舞いに書き直す。

## 範囲

変更可:

- `packages/a11y-audit/src/utils/axe-format.ts`（`mergeNormalizedResults` と、その doc コメントだけ）
- `packages/a11y-audit/test/normalize.spec.ts`
- `packages/a11y-audit/README.ja.md` / `README.md` の `mergeNormalizedResults` の説明（「複数バケットにあるルールは最優先のバケットに置く」と書いてあれば直す。`grep -n mergeNormalizedResults` で探す）
- `packages/a11y-audit/CHANGELOG.md`

範囲外:

- `normalizeAxeResults` が passes の node を落とす仕様
- `summary` の集計、`MergedAuditResult` の形
- CLI（まとめファイルを書く機能は別件）

## 使うコマンド

| 目的 | コマンド | 期待 |
|---|---|---|
| 1 spec だけ | `npm test --workspace @a11y-skills/audit -- test/normalize.spec.ts` | 全部 pass |
| 全検証 | `npm run lint && npm run format:check && npm run typecheck && npm test && npm run validate:skills` | すべて exit 0 |

## 手順

1. **テストを先に直す・足す**（`test/normalize.spec.ts`、既存テスト `:1144` の `mkRule` / `base` を使い回してよい）。実装前に走らせ、新しいテストが落ちることを確かめる。
   - 既存テスト「dedupes nodes and applies bucket priority」の期待を新仕様に変える: `merged.violations` は 1 件で node は `['.a', '.b']`、`merged.incomplete` も 1 件で node は `['.a']`（incomplete に残る）。テスト名を「同じルールが incomplete と violations にあると、それぞれのバケットに自分の node だけで残る」に変える。
   - 新テスト「同じルールが violations と passes にあると、passes からは消え、violations の node は増えない」: 1 つ目の結果は `violations: [mkRule([{ sel: '.a', summary: 's1' }])]`、2 つ目は `passes: [mkRule([])]`（node なし、axe の passes と同じ）。→ `merged.passes` は `[]`、`merged.violations[0].nodes` は `.a` の 1 件。
   - 新テスト「同じバケットの同じルールは id で 1 つにまとまり、node の重複は除かれる」: 両方 `violations` に `.a/s1` と `.a/s1 + .b/s2`。→ `merged.violations` 1 件、node `['.a', '.b']`。
   - 新テスト「inapplicable のルールは、他のバケットに同じルールが無ければ残る」: 1 つ目 `inapplicable: [mkRule([])]` だけ。→ `merged.inapplicable` 1 件。
2. **実装**: `byId` のキーを `` `${bucket}|${rule.id}` `` にし、`MergedEntry.bucketIndex` を Math.min で更新する処理をやめる。集計の段で、passes / inapplicable のエントリは「同じ id が violations か incomplete のエントリにある」なら捨てる。（`inapplicable` と `passes` の両方に同じルールがあるときは passes を残す。）
3. **doc コメントと README** を直す。README は日本語版を先に、英語版をそろえる。
4. **CHANGELOG**（Unreleased、Fixed）: 「`mergeNormalizedResults` no longer folds a rule's `incomplete` nodes into its `violations` entry; a rule found in both buckets now stays in both with its own nodes. `passes` / `inapplicable` entries are still dropped when the same rule has findings.」の調子で。
5. **検証**: 全検証コマンドがすべて exit 0。

## 完了条件

- [ ] `test/normalize.spec.ts` の merge のテスト 4 本が pass。
- [ ] `mergeNormalizedResults` の doc コメントが新しい振る舞いを説明している。
- [ ] 全検証コマンドが exit 0。

## STOP 条件

- `mergeNormalizedResults` を `src/` の他の場所や `skills/` の文書が「最優先バケットに集約する」前提で使っている（`git grep -n mergeNormalizedResults` で確かめる。`src/index.ts` の再公開と README 以外に使用があれば報告）。
- 差分確認で「現状」と食い違う。

## 保守メモ

- 将来 CLI が達成基準ごとのまとめファイルを書くようになったら（候補として記録あり）、この関数を土台にする。そのとき「同じ要素が violations と incomplete の両方にいる」ケースをどう見せるかはこの関数ではなく表示側で決める。
