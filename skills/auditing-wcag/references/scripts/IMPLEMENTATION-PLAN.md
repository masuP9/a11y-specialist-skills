# WCAG Automated Test Scripts - Implementation Plan

## Overview

6つの自動テストスクリプトの実装計画。既存の `focus-indicator-check.ts` と `auto-play-detection.ts` のパターンに従う。

## Scripts to Implement (Priority Order)

### 1. reflow-check.ts (WCAG 1.4.10)

**Purpose**: 320px幅での水平スクロール・レイアウト崩れ検出

**Files to Create/Modify**:
- New: `reflow-check.ts` - メインテストファイル
- New: `detectors/reflow.ts` - DOM評価ロジック
- New: `utils/layout.ts` - 共通レイアウトヘルパー
- Modify: `detectors/index.ts` - export追加
- Modify: `types.ts` - `ReflowIssue`, `ReflowCheckResult`
- Modify: `constants.ts` - `REFLOW_VIEWPORT`, `REFLOW_OVERFLOW_TOLERANCE`

**Detection Algorithm**:
1. `page.setViewportSize({ width: 320, height: 256 })`
2. `document.scrollingElement.scrollWidth > clientWidth` で水平スクロール検出
3. 各要素の `getBoundingClientRect()` でビューポートはみ出し検出
4. `scrollHeight > clientHeight` + `overflow: hidden` でテキストクリップ検出

**Output Format**:
```json
{
  "url": "https://example.com",
  "viewport": { "width": 320, "height": 256 },
  "hasHorizontalScroll": true,
  "overflowingElements": [...],
  "clippedTextElements": [...]
}
```

**Limitations**:
- データテーブル等の許容される水平スクロールは区別不可
- 複雑なウィジェットの機能的リフローは手動確認必要

---

### 2. text-spacing-check.ts (WCAG 1.4.12)

**Purpose**: テキスト間隔変更時のクリッピング検出

**Files to Create/Modify**:
- New: `text-spacing-check.ts`
- New: `utils/text-spacing.ts` - CSS注入・評価ヘルパー
- Modify: `types.ts` - `TextSpacingIssue`, `TextSpacingResult`
- Modify: `constants.ts` - `TEXT_SPACING_CSS`, `CLIP_TOLERANCE_PX`

**Detection Algorithm**:
1. ベースラインメトリクス取得（オプション）
2. CSS注入: line-height 1.5, letter-spacing 0.12em, word-spacing 0.16em, paragraph spacing 2em
3. `scrollHeight > clientHeight` + `overflow: hidden` でクリップ検出

**Output Format**:
```json
{
  "url": "https://example.com",
  "clippedElements": [
    { "selector": ".cta", "scrollHeight": 72, "clientHeight": 48, "overflow": "hidden" }
  ]
}
```

**Limitations**:
- 位置指定要素間のオーバーラップは完全検出不可
- 非テキストコンテンツのクリップは意図的な場合あり

---

### 3. zoom-200-check.ts (WCAG 1.4.4)

**Purpose**: 200%ズーム時のレイアウト問題検出

**Files to Create/Modify**:
- New: `zoom-200-check.ts`
- New: `utils/zoom.ts`
- Modify: `types.ts` - `ZoomIssue`, `ZoomCheckResult`
- Modify: `constants.ts` - `ZOOM_FACTOR`, `ZOOM_VIEWPORT`

**Detection Algorithm**:
1. ベースビューポート設定 (1280x720)
2. `document.documentElement.style.zoom = '200%'` 適用
3. 水平スクロール + クリップ要素検出（layout.ts再利用）

**Output Format**:
```json
{
  "url": "https://example.com",
  "zoomFactor": 2,
  "hasHorizontalScroll": true,
  "clippedElements": [...]
}
```

**Limitations**:
- CSS `zoom` はエンジン固有、実ブラウザズームで確認必要
- レスポンシブブレークポイント動作は手動確認

---

### 4. orientation-check.ts (WCAG 1.3.4)

**Purpose**: 画面回転制限・ロックメッセージの検出

**Files to Create/Modify**:
- New: `orientation-check.ts`
- New: `detectors/orientation.ts`
- Modify: `types.ts` - `OrientationResult`, `OrientationIssue`
- Modify: `constants.ts` - `ORIENTATION_VIEWPORTS`, `ORIENTATION_LOCK_KEYWORDS`

**Detection Algorithm**:
1. Portrait (375x667) でレンダリング、状態収集
2. Landscape (667x375) でレンダリング、状態収集
3. 「画面を回転」等のキーワード検索
4. メインコンテンツの `display:none` 検出

**Output Format**:
```json
{
  "url": "https://example.com",
  "portrait": { "lockMessage": false, "mainContentHidden": false },
  "landscape": { "lockMessage": true, "mainContentHidden": true, "messageSnippet": "Rotate your device" }
}
```

**Limitations**:
- CSS-onlyの画面制限は検出漏れの可能性
- カメラアプリ等の例外は手動確認必要

---

### 5. autocomplete-audit.ts (WCAG 1.3.5)

**Purpose**: フォームフィールドのautocomplete属性監査

**Files to Create/Modify**:
- New: `autocomplete-audit.ts`
- New: `utils/autocomplete.ts`
- Modify: `types.ts` - `AutocompleteIssue`, `AutocompleteAuditResult`
- Modify: `constants.ts` - `AUTOCOMPLETE_FIELD_PATTERNS`, `AUTOCOMPLETE_TOKENS`

**Detection Algorithm**:
1. input/select/textareaフィールド収集
2. name/id/labelTextを期待トークンにマッチング
3. autocomplete属性の欠落・不正値をフラグ

**Output Format**:
```json
{
  "url": "https://example.com",
  "missingAutocomplete": [
    { "selector": "#email", "label": "Email", "expectedToken": "email" }
  ],
  "invalidAutocomplete": [
    { "selector": "#tel", "autocomplete": "phone", "expectedToken": "tel" }
  ]
}
```

**Limitations**:
- フィールドの実際の用途は推測のみ
- カスタムUIのラベルは検出漏れの可能性

---

### 6. time-limit-detector.ts (WCAG 2.2.1)

**Purpose**: 時間制限（meta refresh、JSタイマー、カウントダウンUI）の検出

**Files to Create/Modify**:
- New: `time-limit-detector.ts`
- New: `detectors/time-limit.ts`
- Modify: `types.ts` - `TimeLimitResult`, `TimerRecord`, `MetaRefreshRecord`
- Modify: `constants.ts` - `TIME_LIMIT_KEYWORDS`, `TIME_LIMIT_THRESHOLD_MS`

**Detection Algorithm**:
1. init scriptで `setTimeout`/`setInterval` をフック
2. `<meta http-equiv="refresh">` 検出
3. カウントダウンテキスト（「セッション終了まで」等）の可視要素検索

**Output Format**:
```json
{
  "url": "https://example.com",
  "metaRefresh": [{ "content": "300;url=/logout" }],
  "timers": [{ "delayMs": 300000, "type": "setTimeout" }],
  "countdownIndicators": [{ "text": "Session expires in 5 minutes" }]
}
```

**Limitations**:
- 時間制限の延長・無効化可否は確認不可
- 分析用タイマー等は要トリアージ

---

## Shared Infrastructure

### types.ts への追加

```typescript
// Reflow Check
export interface ReflowIssue {
  selector: string;
  rect: { right: number };
  reason: 'overflow-right' | 'clipped-text';
}
export interface ReflowCheckResult {
  url: string;
  viewport: { width: number; height: number };
  hasHorizontalScroll: boolean;
  overflowingElements: ReflowIssue[];
  clippedTextElements: ReflowIssue[];
}

// Text Spacing
export interface TextSpacingIssue {
  selector: string;
  scrollHeight: number;
  clientHeight: number;
  overflow: string;
}
export interface TextSpacingResult {
  url: string;
  clippedElements: TextSpacingIssue[];
}

// Zoom
export interface ZoomIssue {
  selector: string;
  scrollWidth: number;
  clientWidth: number;
}
export interface ZoomCheckResult {
  url: string;
  zoomFactor: number;
  hasHorizontalScroll: boolean;
  clippedElements: ZoomIssue[];
}

// Orientation
export interface OrientationState {
  lockMessage: boolean;
  mainContentHidden: boolean;
  messageSnippet?: string;
}
export interface OrientationResult {
  url: string;
  portrait: OrientationState;
  landscape: OrientationState;
}

// Autocomplete
export interface AutocompleteIssue {
  selector: string;
  label: string;
  expectedToken: string;
  currentAutocomplete?: string;
}
export interface AutocompleteAuditResult {
  url: string;
  missingAutocomplete: AutocompleteIssue[];
  invalidAutocomplete: AutocompleteIssue[];
}

// Time Limit
export interface TimerRecord {
  delayMs: number;
  type: 'setTimeout' | 'setInterval';
}
export interface MetaRefreshRecord {
  content: string;
}
export interface CountdownIndicator {
  text: string;
  selector?: string;
}
export interface TimeLimitResult {
  url: string;
  metaRefresh: MetaRefreshRecord[];
  timers: TimerRecord[];
  countdownIndicators: CountdownIndicator[];
}
```

### constants.ts への追加

```typescript
// Reflow Check
export const REFLOW_VIEWPORT = { width: 320, height: 256 } as const;
export const REFLOW_OVERFLOW_TOLERANCE = 5; // px

// Text Spacing
export const TEXT_SPACING_CSS = `
  * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p {
    margin-bottom: 2em !important;
  }
`;
export const CLIP_TOLERANCE_PX = 2;

// Zoom
export const ZOOM_FACTOR = 2;
export const ZOOM_VIEWPORT = { width: 1280, height: 720 } as const;

// Orientation
export const ORIENTATION_VIEWPORTS = {
  portrait: { width: 375, height: 667 },
  landscape: { width: 667, height: 375 },
} as const;
export const ORIENTATION_LOCK_KEYWORDS = [
  'rotate device',
  'rotate your device',
  'landscape only',
  'portrait only',
  '画面を回転',
  '横向きにして',
  '縦向きにして',
];

// Autocomplete
export const AUTOCOMPLETE_FIELD_PATTERNS: Record<string, RegExp> = {
  'given-name': /first.?name|given.?name|名前|姓名/i,
  'family-name': /last.?name|family.?name|苗字|氏名/i,
  'email': /e.?mail|メール/i,
  'tel': /phone|tel|電話/i,
  'postal-code': /zip|postal|郵便番号/i,
  'street-address': /address|住所/i,
  'cc-number': /card.?number|カード番号/i,
};

// Time Limit
export const TIME_LIMIT_KEYWORDS = [
  'session expires',
  'time remaining',
  'countdown',
  'セッション終了',
  '残り時間',
  'タイムアウト',
];
export const TIME_LIMIT_THRESHOLD_MS = 600000; // 10 minutes
```

---

## Dependencies

既存の依存関係のみ使用（新規追加なし）:
- `@playwright/test`
- `pixelmatch` (screenshot比較が必要な場合のみ)
- `pngjs`

---

## Implementation Order

1. **utils/layout.ts** - 共通レイアウトヘルパー（reflow, zoom, text-spacingで再利用）
2. **reflow-check.ts** - 最優先、他の基盤となる
3. **text-spacing-check.ts**
4. **zoom-200-check.ts** - layout.tsを再利用
5. **orientation-check.ts**
6. **autocomplete-audit.ts**
7. **time-limit-detector.ts**
