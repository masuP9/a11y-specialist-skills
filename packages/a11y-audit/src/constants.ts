/**
 * Constants for the WCAG audit checks shipped in @a11y-skills/audit.
 *
 * Only the constants used by the four checks (axe / focus indicator / reflow /
 * target size) are included here. Constants for the Phase 2 checks remain in the
 * skill repository until those checks are ported.
 */

import type {
  PointerGestureCriterion,
  PointerGestureSignalKind,
} from './types.js';

// =============================================================================
// Common Disclaimer
// =============================================================================

/** Disclaimer to include in all audit results */
export const AUDIT_DISCLAIMER = {
  message:
    '自動テストで検出できるのはWCAG違反の一部です。完全な準拠確認には手動テストが必須です。',
  messageEn:
    'Automated testing can only detect a subset of WCAG violations. Manual testing is required for full compliance.',
  coverage: 'approximately 30-40%',
  moreInfo: 'https://www.w3.org/WAI/test-evaluate/preliminary/',
} as const;

/** Console disclaimer message */
export const DISCLAIMER_CONSOLE = `
Note: Automated testing detects only ~30-40% of WCAG issues.
      Manual testing is required for complete accessibility evaluation.
`;

// =============================================================================
// Normalized result format
// =============================================================================

/** Maximum length of `NormalizedNode.html` / detail `html` snippets. */
export const HTML_SNIPPET_MAX_LENGTH = 300;

// =============================================================================
// Axe Audit defaults (broad WCAG coverage)
// =============================================================================

/** Default axe-core tag set (WCAG 2.0/2.1/2.2 A & AA) */
export const DEFAULT_AXE_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
] as const;

// =============================================================================
// Focus Indicator Detection Constants (WCAG 2.4.7)
// =============================================================================

/** CSS properties to check for focus style changes */
export const FOCUS_STYLE_PROPERTIES = [
  'outline',
  'outlineStyle',
  'outlineColor',
  'outlineWidth',
  'outlineOffset',
  'boxShadow',
  'backgroundColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderTopStyle',
  'borderRightStyle',
  'borderBottomStyle',
  'borderLeftStyle',
  'textDecorationLine',
  'textDecorationColor',
  'textDecorationThickness',
  'textDecorationStyle',
] as const;

/** Selector for focusable elements */
export const FOCUSABLE_SELECTOR = `
  input:not([type="hidden"]):not([disabled]),
  select:not([disabled]),
  textarea:not([disabled]),
  button:not([disabled]),
  a[href],
  [tabindex]:not([tabindex="-1"])
`.trim();

/** Extra tab iterations for safety margin */
export const EXTRA_TAB_ITERATIONS = 10;

/** Default ms to wait after each Tab press for a focus-triggered navigation to surface. */
export const DEFAULT_NAVIGATION_SETTLE_MS = 50;

// =============================================================================
// Focus Obscured Detection Constants (WCAG 2.4.11 / 2.4.12)
// =============================================================================

/**
 * Obscured ratio (0-1) from which the element counts as fully obscured
 * (2.4.11). Slightly below 1 so sub-pixel layout rounding does not leave a
 * fully covered element looking "almost" covered.
 */
export const FOCUS_OBSCURED_FULL_RATIO = 0.99;

/**
 * Minimum overlap area in pixels to report. Any visible overlap counts for
 * 2.4.12, so this is not a severity threshold: it only drops sub-pixel
 * slivers from fractional layout (e.g., a 1px border touching a fixed bar).
 */
export const FOCUS_OBSCURED_MIN_OVERLAP_PX = 8;

/**
 * How far (CSS px) around an element's rect the `screenshotDiff` option
 * compares. Focus indicators often sit outside the element (outline-offset,
 * pseudo-element underlines, box-shadow rings).
 */
export const FOCUS_VISUAL_DIFF_MARGIN_PX = 8;

/**
 * Selectors to exclude from obscurer detection
 * These elements should not be considered as obscurers
 */
export const FOCUS_OBSCURED_EXCLUDE_SELECTORS = [
  '#focus-audit-overlay',
  '.focus-audit-box',
  '[data-focus-visited]',
] as const;

// =============================================================================
// Output filename defaults
// =============================================================================

/** Default screenshot filename for the focus indicator check */
export const DEFAULT_FOCUS_SCREENSHOT_FILE = 'focus-indicators.png';
/** Default result filename for the focus indicator check */
export const DEFAULT_FOCUS_RESULT_FILE = 'focus-indicator-result.json';
/** Default result filename for the axe audit */
export const DEFAULT_AXE_RESULT_FILE = 'axe-result.json';
/** Default result filename for the reflow check */
export const DEFAULT_REFLOW_RESULT_FILE = 'reflow-result.json';
/** Default screenshot filename for the reflow check */
export const DEFAULT_REFLOW_SCREENSHOT_FILE = 'reflow-screenshot.png';
/** Default result filename for the target size check */
export const DEFAULT_TARGET_SIZE_RESULT_FILE = 'target-size-result.json';
/** Default screenshot filename for the target size check */
export const DEFAULT_TARGET_SIZE_SCREENSHOT_FILE = 'target-size-screenshot.png';

// =============================================================================
// Reflow Check Constants (WCAG 1.4.10)
// =============================================================================

/** Viewport size for reflow test (320 CSS px width at 400% zoom equivalent) */
export const REFLOW_VIEWPORT = { width: 320, height: 256 } as const;

/** Tolerance for overflow detection in pixels */
export const REFLOW_OVERFLOW_TOLERANCE = 5;

/** Selector for elements to check for overflow */
export const REFLOW_CHECK_SELECTOR = `
  p, h1, h2, h3, h4, h5, h6, li, td, th, span, div, section, article,
  a, button, input, select, textarea, label,
  img, svg, table, nav, header, footer, main, aside
`.trim();

/** Elements that are allowed to have horizontal scroll */
export const REFLOW_ALLOWED_OVERFLOW_SELECTORS = [
  'pre',
  'code',
  'table[role="presentation"]',
  '.data-table',
  '[data-allow-scroll]',
] as const;

// =============================================================================
// Target Size Check Constants (WCAG 2.5.5 / 2.5.8)
// =============================================================================

/**
 * Target Size thresholds in CSS pixels
 * - AA (2.5.8 Minimum): 24x24 px
 * - AAA (2.5.5 Enhanced): 44x44 px
 */
export const TARGET_SIZE_AA = 24;
export const TARGET_SIZE_AAA = 44;

/**
 * Selector for interactive elements (tap/click targets)
 * Includes all elements that users may tap/click to perform actions
 */
export const INTERACTIVE_SELECTOR = `
  a[href],
  button:not([disabled]),
  input:not([type="hidden"]):not([disabled]),
  select:not([disabled]),
  textarea:not([disabled]),
  [role="button"]:not([aria-disabled="true"]),
  [role="link"]:not([aria-disabled="true"]),
  [role="checkbox"]:not([aria-disabled="true"]),
  [role="radio"]:not([aria-disabled="true"]),
  [role="switch"]:not([aria-disabled="true"]),
  [role="menuitem"]:not([aria-disabled="true"]),
  [role="tab"]:not([aria-disabled="true"]),
  [role="slider"]:not([aria-disabled="true"]),
  [role="option"]:not([aria-disabled="true"]),
  [tabindex]:not([tabindex="-1"]):not([disabled]),
  summary,
  label[for],
  label:has(input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])),
  [onclick]:not([disabled])
`.trim();

/**
 * Tags that indicate inline context (for inline exception)
 */
export const INLINE_CONTEXT_TAGS = [
  'p',
  'li',
  'dd',
  'td',
  'th',
  'span',
  'blockquote',
  'cite',
  'figcaption',
] as const;

/**
 * Native input types controlled by user agent (for ua-control exception)
 */
export const UA_CONTROLLED_INPUT_TYPES = [
  'checkbox',
  'radio',
  'range',
  'color',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
  'file',
] as const;

/**
 * Minimum text length around inline link to qualify for inline exception
 */
export const INLINE_CONTEXT_MIN_TEXT = 10;

// =============================================================================
// Text Spacing Check Constants (WCAG 1.4.12)
// =============================================================================

/**
 * CSS overrides for text spacing test per WCAG 1.4.12
 * - Line height: at least 1.5 times the font size
 * - Letter spacing: at least 0.12 times the font size
 * - Word spacing: at least 0.16 times the font size
 * - Paragraph spacing: at least 2 times the font size
 */
export const TEXT_SPACING_CSS = `
  * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p, div, span, li, td, th, dd, dt, label, blockquote {
    margin-bottom: 2em !important;
  }
`;

/** Tolerance for detecting clipping after text spacing changes */
export const TEXT_SPACING_CLIP_TOLERANCE = 2;

/** Selector for text-containing elements to check */
export const TEXT_SPACING_CHECK_SELECTOR = `
  p, h1, h2, h3, h4, h5, h6, li, td, th, span, div,
  a, button, label, dd, dt, blockquote, figcaption
`.trim();

export const DEFAULT_TEXT_SPACING_RESULT_FILE = 'text-spacing-result.json';
export const DEFAULT_TEXT_SPACING_SCREENSHOT_FILE =
  'text-spacing-screenshot.png';

// =============================================================================
// Zoom 200% Check Constants (WCAG 1.4.4)
// =============================================================================

/** Zoom factor for resize text test */
export const ZOOM_FACTOR = 2;

/** Base viewport size before zoom (standard desktop) */
export const ZOOM_BASE_VIEWPORT = { width: 1280, height: 720 } as const;

/** Tolerance for detecting clipping at zoom */
export const ZOOM_CLIP_TOLERANCE = 5;

export const DEFAULT_ZOOM_RESULT_FILE = 'zoom-200-result.json';
export const DEFAULT_ZOOM_SCREENSHOT_FILE = 'zoom-200-screenshot.png';

// =============================================================================
// Orientation Check Constants (WCAG 1.3.4)
// =============================================================================

/** Viewport sizes for orientation tests */
export const ORIENTATION_VIEWPORTS = {
  portrait: { width: 375, height: 667 },
  landscape: { width: 667, height: 375 },
} as const;

/** Keywords indicating orientation lock messages (EN/JP) */
export const ORIENTATION_LOCK_KEYWORDS = [
  // English
  'rotate device',
  'rotate your device',
  'rotate your phone',
  'turn your device',
  'landscape only',
  'portrait only',
  'please rotate',
  'best viewed in',
  'for best experience',
  // Japanese
  '画面を回転',
  '端末を回転',
  'デバイスを回転',
  '横向きにして',
  '縦向きにして',
  '横画面でご覧',
  '縦画面でご覧',
  '回転してください',
] as const;

/** Main content selectors to check visibility */
export const MAIN_CONTENT_SELECTORS = [
  'main',
  '[role="main"]',
  '#main',
  '#content',
  '.main-content',
  'article',
] as const;

export const DEFAULT_ORIENTATION_RESULT_FILE = 'orientation-result.json';
export const DEFAULT_ORIENTATION_PORTRAIT_SCREENSHOT_FILE =
  'orientation-screenshot-portrait.png';
export const DEFAULT_ORIENTATION_LANDSCAPE_SCREENSHOT_FILE =
  'orientation-screenshot-landscape.png';

// =============================================================================
// Autocomplete Audit Constants (WCAG 1.3.5)
// =============================================================================

/**
 * Mapping of field patterns to expected autocomplete tokens
 * Based on HTML autocomplete attribute values
 */
export const AUTOCOMPLETE_FIELD_PATTERNS: Record<string, RegExp> = {
  // Name fields
  name: /^(full.?name|your.?name|氏名|お名前|名前)$/i,
  'given-name': /^(first.?name|given.?name|名|ファーストネーム|名前)$/i,
  'family-name': /^(last.?name|family.?name|surname|姓|ラストネーム|苗字)$/i,
  'honorific-prefix': /^(prefix|title|敬称)$/i,
  'honorific-suffix': /^(suffix|様|さん)$/i,

  // Contact fields
  email: /^(e.?mail|メール|メールアドレス)$/i,
  tel: /^(phone|tel|telephone|電話|電話番号|携帯)$/i,
  'tel-national': /^(phone.?national|国内電話)$/i,

  // Address fields
  'street-address': /^(address|street|住所|番地)$/i,
  'address-line1': /^(address.?1|address.?line.?1|住所1)$/i,
  'address-line2': /^(address.?2|address.?line.?2|住所2)$/i,
  'postal-code': /^(zip|postal|郵便番号|〒)$/i,
  country: /^(country|国|国名)$/i,
  'country-name': /^(country.?name|国名)$/i,

  // Organization fields
  organization: /^(company|org|organization|会社|組織|会社名)$/i,
  'organization-title': /^(title|position|役職|肩書き)$/i,

  // Username/password
  username: /^(user.?name|login|ユーザー名|ログインID)$/i,
  'current-password':
    /^(password|pass|current.?password|パスワード|現在のパスワード)$/i,
  'new-password': /^(new.?password|新しいパスワード)$/i,

  // Payment
  'cc-name': /^(card.?name|cc.?name|カード名義)$/i,
  'cc-number': /^(card.?number|cc.?number|カード番号)$/i,
  'cc-exp': /^(expir|cc.?exp|有効期限)$/i,
  'cc-exp-month': /^(exp.?month|有効期限.?月)$/i,
  'cc-exp-year': /^(exp.?year|有効期限.?年)$/i,
  'cc-csc': /^(cvc|cvv|csc|security.?code|セキュリティコード)$/i,

  // Dates
  bday: /^(birth.?day|birthday|dob|生年月日|誕生日)$/i,
  'bday-day': /^(birth.?day.?day|日)$/i,
  'bday-month': /^(birth.?day.?month|月)$/i,
  'bday-year': /^(birth.?day.?year|年)$/i,
  sex: /^(sex|gender|性別)$/i,

  // Other
  url: /^(url|website|homepage|ウェブサイト|ホームページ)$/i,
  photo: /^(photo|avatar|写真|アバター)$/i,
} as const;

/**
 * Autofill field names that may follow a contact type token
 * (home/work/mobile/fax/pager).
 * https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill-detail-tokens
 */
export const AUTOCOMPLETE_CONTACT_FIELD_NAMES = [
  'tel',
  'tel-country-code',
  'tel-national',
  'tel-area-code',
  'tel-local',
  'tel-local-prefix',
  'tel-local-suffix',
  'tel-extension',
  'email',
  'impp',
] as const;

export const AUTOCOMPLETE_CONTACT_TYPES = [
  'home',
  'work',
  'mobile',
  'fax',
  'pager',
] as const;

/** Autofill field names that may not take a contact type token. */
export const AUTOCOMPLETE_NORMAL_FIELD_NAMES = [
  'name',
  'honorific-prefix',
  'given-name',
  'additional-name',
  'family-name',
  'honorific-suffix',
  'nickname',
  'username',
  'new-password',
  'current-password',
  'one-time-code',
  'organization-title',
  'organization',
  'street-address',
  'address-line1',
  'address-line2',
  'address-line3',
  'address-level1',
  'address-level2',
  'address-level3',
  'address-level4',
  'country',
  'country-name',
  'postal-code',
  'cc-name',
  'cc-given-name',
  'cc-additional-name',
  'cc-family-name',
  'cc-number',
  'cc-exp',
  'cc-exp-month',
  'cc-exp-year',
  'cc-csc',
  'cc-type',
  'transaction-currency',
  'transaction-amount',
  'language',
  'bday',
  'bday-day',
  'bday-month',
  'bday-year',
  'sex',
  'url',
  'photo',
] as const;

export const DEFAULT_AUTOCOMPLETE_RESULT_FILE = 'autocomplete-result.json';

// =============================================================================
// Redundant Entry Check Constants (WCAG 3.3.7)
// =============================================================================

/**
 * Words marking a field as shipping- or billing-specific (stripped before
 * purpose matching). The `g` flag is for `replace`; do not use these with
 * `.test()` (it keeps `lastIndex`).
 */
export const REDUNDANT_ENTRY_SCOPE_PATTERNS = {
  shipping:
    /(shipping|ship[-_ ]?to|deliver(?:y|[-_ ]?to)|お届け先?|配送先?|送付先?|お送り先)/gi,
  billing: /(billing|bill[-_ ]?to|invoice|ご?請求先?)/gi,
} as const;
/** Words marking a confirmation field (stripped before purpose matching). `g` flag: `replace` only. */
export const REDUNDANT_ENTRY_CONFIRM_PATTERN =
  /(confirm(?:ation)?|re-?(?:enter|type)|verify|again|確認用?|再入力|もう一度)/gi;
/** Visible text of a control that probably copies or selects an earlier entry. */
export const REDUNDANT_ENTRY_COPY_CONTROL_PATTERN =
  /(same as|same address|use (the )?(shipping|billing)|copy|identical|autofill|saved address|同じ|同一|同上|コピー|転記|自動入力|保存済み)/i;
/** Purposes whose repeated entry is allowed (security exception). */
export const REDUNDANT_ENTRY_EXEMPT_PURPOSES = [
  'new-password',
  'current-password',
  'one-time-code',
] as const;
export const DEFAULT_REDUNDANT_ENTRY_RESULT_FILE =
  'redundant-entry-result.json';

// =============================================================================
// Time Limit Detector Constants (WCAG 2.2.1)
// =============================================================================

/** Keywords indicating countdown or time limit in visible text (EN/JP) */
export const TIME_LIMIT_KEYWORDS = [
  // English
  'session expires',
  'session timeout',
  'time remaining',
  'time left',
  'countdown',
  'expires in',
  'will timeout',
  'auto logout',
  'automatic logout',
  // Japanese
  'セッション終了',
  'セッションタイムアウト',
  '残り時間',
  'タイムアウト',
  '自動ログアウト',
  '有効期限',
  '制限時間',
  'カウントダウン',
] as const;

/** Timer threshold for reporting (10 minutes in ms) */
export const TIME_LIMIT_THRESHOLD_MS = 600000;

/** Minimum timer to report (10 seconds in ms, to filter out UI animations) */
export const TIME_LIMIT_MIN_MS = 10000;

export const DEFAULT_TIME_LIMIT_RESULT_FILE = 'time-limit-result.json';

// =============================================================================
// Auto-play Detection Constants (WCAG 2.2.2)
// =============================================================================

/** Screenshot intervals in milliseconds (0s, 2s, 4s, 6s) */
export const SCREENSHOT_INTERVALS = [0, 2000, 4000, 6000] as const;

/** Pixel change threshold (0.1% = significant change) */
export const CHANGE_THRESHOLD = 0.1;

/** Pixelmatch color difference threshold (0-1) */
export const PIXELMATCH_THRESHOLD = 0.1;

/** Wait time after clicking pause control (ms) */
export const PAUSE_CLICK_WAIT = 500;

/** Wait time between screenshots for comparison (ms) */
export const SCREENSHOT_COMPARISON_WAIT = 2000;

export const DEFAULT_AUTO_PLAY_OUTPUT_DIR = './auto-play-screenshots';
export const DETECTION_RESULT_FILENAME = 'detection-result.json';

// =============================================================================
// Pause Control Detection Patterns (WCAG 2.2.2)
// =============================================================================

/** Keywords for pause/stop controls (EN/JP) */
export const PAUSE_KEYWORDS = [
  // English
  'pause',
  'stop',
  'halt',
  'freeze',
  'play',
  // Japanese
  '一時停止',
  '停止',
  'ポーズ',
  '止める',
  '再生',
] as const;

/**
 * Keywords for controls that stop audio or change its volume (WCAG 1.4.2):
 * the pause keywords plus mute/volume wording. 'mute' also matches 'unmute'.
 */
export const AUDIO_CONTROL_KEYWORDS = [
  ...PAUSE_KEYWORDS,
  // English
  'mute',
  'volume',
  'sound',
  // Japanese
  'ミュート',
  '消音',
  '音量',
] as const;

/** Class name patterns indicating pause/play controls */
export const CONTROL_CLASS_PATTERNS = [
  'pause',
  'play',
  'stop',
  'toggle',
  'switch',
  'control',
  'btn-pause',
  'btn-play',
  'btn-stop',
] as const;

/** Carousel-related class patterns */
export const CAROUSEL_PATTERNS = [
  'carousel',
  'slider',
  'slide',
  'swiper',
  'slick',
  'hero',
  'banner',
  'gallery',
  'rotator',
] as const;

/** Navigation control keywords */
export const NAV_KEYWORDS = [
  'prev',
  'next',
  '前',
  '次',
  'arrow',
  'dot',
  'indicator',
] as const;

/** SVG metadata patterns to exclude from accessible names */
export const SVG_METADATA_PATTERNS = [
  'created with',
  'made with',
  'generated by',
  'svg',
  'icon',
  'symbol',
] as const;

/** Maximum parent levels to check for carousel context */
export const MAX_PARENT_LEVELS = 5;

// =============================================================================
// Keyboard Trap Check Constants (WCAG 2.1.2)
// =============================================================================

/** Tab walk: extra Tab presses beyond `count` focusable elements. */
export const KEYBOARD_TRAP_SLACK = 10;
/** Upper bound on Tab presses per walk (large-page guard). Exceeded count is logged. */
export const KEYBOARD_TRAP_MAX_TAB_PRESSES = 600;
/** Wait (ms) after each escape attempt before re-reading activeElement. */
export const KEYBOARD_TRAP_ESCAPE_SETTLE_MS = 200;
/** Maximum escape attempts per trap candidate. */
export const KEYBOARD_TRAP_MAX_ESCAPE_ATTEMPTS = 3;
export const DEFAULT_KEYBOARD_TRAP_RESULT_FILE = 'keyboard-trap-result.json';
export const DEFAULT_KEYBOARD_TRAP_SCREENSHOT_FILE = 'keyboard-trap.png';

// =============================================================================
// Keyboard Reachability Check Constants (WCAG 2.1.1)
// =============================================================================

/** Composite widgets whose items are explored with arrow keys. */
export const KEYBOARD_REACHABILITY_COMPOSITE_ROLES = [
  'tablist',
  'menu',
  'menubar',
  'listbox',
  'radiogroup',
  'toolbar',
  'tree',
] as const;
/** Composite roles that are enumerated but not explored (2-D navigation deferred). */
export const KEYBOARD_REACHABILITY_UNSUPPORTED_COMPOSITE_ROLES = [
  'grid',
  'treegrid',
] as const;
/**
 * Natively operable elements for the 2.1.1 reachability check. Deliberately
 * separate from FOCUSABLE_SELECTOR / INTERACTIVE_SELECTOR (shared by other
 * checks): includes tabindex="-1" and disabled elements (filtered in-page
 * with a reason).
 */
export const KEYBOARD_REACHABILITY_NATIVE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[contenteditable=""]',
  '[contenteditable="true"]',
].join(', ');
/** Roles that make an element operable for the reachability check. */
export const KEYBOARD_REACHABILITY_OPERABLE_ROLES = [
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'option',
  'treeitem',
  'slider',
  'spinbutton',
  'combobox',
  'textbox',
  'searchbox',
] as const;
/** aria-haspopup values whose popup is opened with ArrowDown (dialog/grid excluded). */
export const KEYBOARD_REACHABILITY_POPUP_HASPOPUP_VALUES = [
  'true',
  'menu',
  'listbox',
  'tree',
] as const;
/** Only these roles count as popup contents (not dialog controls or tooltips). */
export const KEYBOARD_REACHABILITY_POPUP_ITEM_ROLES = [
  'option',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'treeitem',
] as const;
/**
 * Popups with more items than this are sampled (enter, ArrowDown moves on,
 * ArrowUp comes back) instead of swept item by item.
 */
export const KEYBOARD_REACHABILITY_POPUP_SAMPLE_THRESHOLD = 10;
/** Tab walk: extra Tab presses beyond the focusable count. */
export const KEYBOARD_REACHABILITY_TAB_SLACK = 10;
export const KEYBOARD_REACHABILITY_MAX_TAB_PRESSES = 600;
export const KEYBOARD_REACHABILITY_MAX_ARROW_PRESSES_PER_COMPOSITE = 100;
export const KEYBOARD_REACHABILITY_MAX_ARROW_PRESSES_TOTAL = 1000;
/** Added+removed nodes during one composite's exploration before it is stopped. */
export const KEYBOARD_REACHABILITY_MAX_DOM_MUTATIONS = 200;
/** Wall-clock budget for the whole check; checked before each key press. */
export const KEYBOARD_REACHABILITY_TIMEOUT_MS = 60_000;
export const DEFAULT_KEYBOARD_REACHABILITY_RESULT_FILE =
  'keyboard-reachability-result.json';
export const DEFAULT_KEYBOARD_REACHABILITY_SCREENSHOT_FILE =
  'keyboard-reachability.png';

// =============================================================================
// CDP Event Listener Inspector
// =============================================================================

/** Handler source text kept as `handlerPreview` (characters). */
export const EVENT_LISTENER_HANDLER_PREVIEW_MAX = 200;

// =============================================================================
// Motion Actuation Check Constants (WCAG 2.5.4)
// =============================================================================

/** Event types fired by device motion / orientation sensors. */
export const MOTION_EVENT_TYPES = [
  'devicemotion',
  'deviceorientation',
  'deviceorientationabsolute',
] as const;
export const MOTION_SIMULATION_EVENT_COUNT = 10;
export const MOTION_SIMULATION_INTERVAL_MS = 50;
export const MOTION_SIMULATION_SETTLE_MS = 500;
/** Extra mutations over twice the baseline before the events are credited with a DOM change. */
export const MOTION_MUTATION_MARGIN = 3;
/** Per event type; the page script is terminated via CDP when exceeded. */
export const MOTION_SIMULATION_TIMEOUT_MS = 10_000;
export const DEFAULT_MOTION_ACTUATION_RESULT_FILE =
  'motion-actuation-result.json';

// =============================================================================
// Change on Input Check Constants (WCAG 3.2.2)
// =============================================================================

/** Wait after each value change for a context change to surface. */
export const CHANGE_ON_INPUT_SETTLE_MS = 500;
export const CHANGE_ON_INPUT_TIMEOUT_MS = 60_000;
export const CHANGE_ON_INPUT_MAX_CONTROLS = 100;
/** Fresh-context restarts after a value change navigated the page. */
export const CHANGE_ON_INPUT_MAX_RESTARTS = 20;
/** Two test values per input type, so one differs from any current value. */
export const CHANGE_ON_INPUT_TEXT_VALUES = {
  email: ['a11y@example.com', 'a11y2@example.com'],
  tel: ['0123456789', '0987654321'],
  url: ['https://example.com/', 'https://example.org/'],
  number: ['1', '2'],
  default: ['a11y-test', 'a11y-test2'],
} as const;
/** Dialog message characters kept in a finding. */
export const DIALOG_MESSAGE_MAX = 200;
export const DEFAULT_CHANGE_ON_INPUT_RESULT_FILE =
  'change-on-input-result.json';

// =============================================================================
// Accessible Authentication Check Constants (WCAG 3.3.8)
// =============================================================================

/** WCAG 3.3.8: phrases in a name/label that suggest a one-time verification code. */
export const AUTH_OTP_NAME_PATTERN =
  /(one.?time|verification.?code|verify.?code|auth(entication)?.?code|security.?code.?(sms|email)|確認コード|認証コード|ワンタイム|検証コード)/i;
/**
 * Short words that suggest a verification code only as whole words (split on
 * non-alphanumerics and camelCase): `otpCode` / `otp_code` match, `footprint`
 * does not.
 */
export const AUTH_OTP_NAME_WORDS = ['otp', 'totp', '2fa', 'mfa'] as const;
/** WCAG 3.3.8: elements that look like a CAPTCHA (outermost match only). */
export const AUTH_CAPTCHA_SELECTOR = [
  'iframe[src*="captcha" i]',
  'iframe[src*="challenges.cloudflare.com" i]',
  'iframe[src*="arkoselabs" i]',
  'iframe[src*="funcaptcha" i]',
  '.g-recaptcha',
  '.h-captcha',
  '.cf-turnstile',
  '[data-sitekey]',
  '[id*="captcha" i]',
  '[class*="captcha" i]',
  '[name*="captcha" i]',
  'img[src*="captcha" i]',
  'img[alt*="captcha" i]',
].join(', ');
/** autocomplete field names accepted for each kind of authentication field. */
export const AUTH_EXPECTED_AUTOCOMPLETE: Record<
  'password' | 'one-time-code' | 'username',
  readonly string[]
> = {
  password: ['current-password', 'new-password'],
  'one-time-code': ['one-time-code'],
  username: ['username', 'email', 'tel'],
};
/** Secure-context page used to write the clipboard; never leaves the browser (route-fulfilled). */
export const AUTH_PASTE_HELPER_URL = 'https://a11y-audit.invalid/paste-probe';
/** Two digits: accepted by one-time-code fields, yet never a full code (4 digits or more), so no auto-submit. */
export const AUTH_PASTE_PROBE = '12';
export const AUTH_PASTE_SETTLE_MS = 300;
/** Per page operation. */
export const AUTH_PASTE_STEP_TIMEOUT_MS = 1_500;
/**
 * Per field; the page script is terminated via CDP when exceeded. It must be
 * larger than the worst case of the steps of one field (7 steps of
 * AUTH_PASTE_STEP_TIMEOUT_MS plus AUTH_PASTE_SETTLE_MS = 10.8s), so that a slow
 * page is not mistaken for a hang.
 */
export const AUTH_PASTE_FIELD_TIMEOUT_MS = 12_000;
export const DEFAULT_ACCESSIBLE_AUTHENTICATION_RESULT_FILE =
  'accessible-authentication-result.json';

/** WCAG 2.5.1 / 2.5.7: listener types the pointer gesture check reads. */
export const POINTER_GESTURE_PRESS_TYPES = [
  'pointerdown',
  'mousedown',
  'touchstart',
] as const;
export const POINTER_GESTURE_MOVE_TYPES = [
  'pointermove',
  'mousemove',
  'touchmove',
] as const;
export const POINTER_GESTURE_DRAG_TYPES = ['dragstart', 'drop'] as const;
/** Safari gesture events; other browsers never fire them, but listeners still show intent. */
export const POINTER_GESTURE_MULTIPOINT_TYPES = [
  'gesturestart',
  'gesturechange',
] as const;
/** Matched against handlerPreview of touchstart / touchmove (first 200 chars only). */
export const POINTER_GESTURE_MULTIPOINT_PATTERN =
  /\btouches\s*\.\s*length|\btouches\s*\[\s*1\s*\]|\btargetTouches\b|\b(?:e|ev|evt|event)\.scale\b/;
/** Which criteria each pointer gesture signal kind is reported under. */
export const POINTER_GESTURE_CRITERIA_BY_SIGNAL: Record<
  PointerGestureSignalKind,
  readonly PointerGestureCriterion[]
> = {
  'draggable-attribute': ['2.5.7'],
  'drag-listener': ['2.5.7'],
  'move-listener': ['2.5.1', '2.5.7'],
  'multipoint-listener': ['2.5.1'],
  'widget-slider': ['2.5.7'],
  'widget-sortable': ['2.5.7'],
  'widget-carousel': ['2.5.1'],
  'widget-map': ['2.5.1', '2.5.7'],
};
/** A node with listeners for at least this many event types is treated as a framework delegation root. */
export const POINTER_GESTURE_DELEGATION_MIN_TYPES = 20;
export const POINTER_GESTURE_MAX_CANDIDATES = 200;
/** Upper bound on nodes resolved through CDP (listener nodes + delegation roots). */
export const POINTER_GESTURE_MAX_LISTENER_NODES = 1_000;
/** Whole listener inspection (window, document, subtree, node collection). */
export const POINTER_GESTURE_INSPECTION_TIMEOUT_MS = 15_000;
/** After a timeout: how long to wait for the in-flight CDP call to finish once cancelled. */
export const POINTER_GESTURE_CANCEL_GRACE_MS = 3_000;
export const POINTER_GESTURE_WIDGET_HINTS = [
  { kind: 'widget-slider', selector: '[role="slider"]:not(input)' },
  {
    kind: 'widget-sortable',
    selector:
      '[aria-roledescription="sortable" i], [aria-roledescription="draggable" i], [data-rbd-drag-handle-draggable-id], [data-rfd-drag-handle-draggable-id], .ui-sortable, [data-sortable]',
  },
  {
    kind: 'widget-carousel',
    selector:
      '[aria-roledescription="carousel" i], .swiper, .slick-slider, .splide, .flickity-enabled, .glide, .keen-slider, .embla',
  },
  {
    kind: 'widget-map',
    selector:
      '.leaflet-container, .mapboxgl-map, .maplibregl-map, .gm-style, .ol-viewport, iframe[src*="google.com/maps"], iframe[src*="maps.google."], iframe[src*="openstreetmap.org"]',
  },
] as const;
export const DEFAULT_POINTER_GESTURE_RESULT_FILE =
  'pointer-gesture-result.json';

// ---------------------------------------------------------------------------
// focus-order-check (WCAG 2.4.3)
// ---------------------------------------------------------------------------

/** Tab presses beyond the focusable-element count, for elements the selector misses. */
export const FOCUS_ORDER_TAB_SLACK = 10;
/** Extra Tab presses per iframe, whose contents cannot be counted from the main document. */
export const FOCUS_ORDER_FRAME_SLACK = 20;
export const FOCUS_ORDER_MAX_TAB_PRESSES = 300;
export const FOCUS_ORDER_TIMEOUT_MS = 60_000;
/** Slack for sub-pixel and baseline differences when comparing positions. */
export const FOCUS_ORDER_TOLERANCE_PX = 8;
/** A move up smaller than this (and not on the same row) is not reported. */
export const FOCUS_ORDER_MIN_BACKWARD_PX = 16;
/** Detour: both legs at least this share of the viewport diagonal ... */
export const FOCUS_ORDER_DETOUR_FAR_RATIO = 0.5;
/** ... and the elements before and after it this close. */
export const FOCUS_ORDER_DETOUR_NEAR_RATIO = 0.25;
export const FOCUS_ORDER_MAX_DIALOG_TRIGGERS = 10;
/** Wait after opening / closing a dialog, for transitions and focus scripts. */
export const FOCUS_ORDER_DIALOG_SETTLE_MS = 300;
export const FOCUS_ORDER_DIALOG_SELECTOR =
  'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]';
/**
 * What an `aria-controls` target may be: unlike FOCUS_ORDER_DIALOG_SELECTOR it
 * also matches a closed native <dialog>, which has no `open` attribute yet.
 */
export const FOCUS_ORDER_DIALOG_TARGET_SELECTOR =
  'dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"]';
export const FOCUS_ORDER_DIALOG_TRIGGER_SELECTOR = [
  '[aria-haspopup="dialog"]',
  '[data-bs-toggle="modal"]',
  '[data-toggle="modal"]',
  '[data-micromodal-trigger]',
  '[data-a11y-dialog-show]',
].join(', ');
export const FOCUS_ORDER_DIALOG_CLOSE_SELECTOR =
  '[data-bs-dismiss="modal"], [data-dismiss="modal"], [data-micromodal-close], [data-a11y-dialog-hide], form[method="dialog"] button';
export const FOCUS_ORDER_DIALOG_CLOSE_NAME_PATTERN =
  /^(close|dismiss|cancel|×|✕|x|閉じる|キャンセル)$/i;
export const DEFAULT_FOCUS_ORDER_RESULT_FILE = 'focus-order-result.json';

// =============================================================================
// pointer-cancellation-check (WCAG 2.5.2)
// =============================================================================

/** WCAG 2.5.2: wait after a press for a change to surface. */
export const POINTER_CANCELLATION_SETTLE_MS = 300;
/** Wall-clock budget for the whole check. */
export const POINTER_CANCELLATION_TIMEOUT_MS = 60_000;
/** Minimum time to watch the page for changes of its own before the first press. */
export const POINTER_CANCELLATION_BACKGROUND_MS = 1_000;
export const POINTER_CANCELLATION_MAX_TARGETS = 100;
export const POINTER_CANCELLATION_MAX_RESTARTS = 10;
/** Listener inspection (window, document, subtree, node collection) per page load. */
export const POINTER_CANCELLATION_INSPECTION_TIMEOUT_MS = 15_000;
/**
 * Upper bound for each in-page step (startPress / endPress / collectTargets)
 * and for closing a context: a page handler that never returns must not stall
 * the check.
 */
export const POINTER_CANCELLATION_STEP_TIMEOUT_MS = 5_000;
/** A listener of one of these types on the element means the press may complete on release. */
export const POINTER_CANCELLATION_RELEASE_TYPES = [
  'pointerup',
  'mouseup',
  'touchend',
  'click',
] as const;
/** Elements that are pressed even without a press listener of their own (delegated handlers). */
export const POINTER_CANCELLATION_TARGET_SELECTOR =
  'a[href], area[href], button, summary, input[type="button"], input[type="submit"], input[type="reset"], input[type="image"], input[type="checkbox"], input[type="radio"], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [role="treeitem"], [onclick], [onmousedown], [onpointerdown], [ontouchstart]';
export const POINTER_CANCELLATION_MAX_ATTRIBUTES = 10;
export const DEFAULT_POINTER_CANCELLATION_RESULT_FILE =
  'pointer-cancellation-result.json';
