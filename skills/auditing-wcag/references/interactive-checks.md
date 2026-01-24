[日本語版 (Japanese)](./interactive-checks.ja.md)

# Interactive Checks

Items verified by simulating user interaction with Playwright. Focus on stateful criteria like keyboard, pointer, and error handling.

## Common Procedure
- Traverse primary flows with keyboard only (Tab/Shift+Tab/Enter/Space/Arrows)
- Simulate pointer actions (click/drag/hover)
- Capture DOM diffs and a11y tree changes

## Keyboard
| Criterion | Action | Evidence | Fail rule |
|---|---|---|---|
| 2.1.1 | Complete all functions with keyboard only | logs/video | Any click-only function exists |
| 2.1.2 | Escape all focus areas | logs | Keyboard trap exists |
| 2.1.4 | Single-key shortcuts can be disabled/remapped or are focus-limited | logs | Shortcut triggers unexpectedly with no escape |

## Focus
| Criterion | Action | Evidence | Fail rule |
|---|---|---|---|
| 2.4.3 | Focus order matches visual order | focus order log | Order deviates materially |
| 2.4.7 | Focus indicator visible | screenshots/video | Focus not visible |
| 2.4.11 | Focus appearance meets minimum requirements | screenshots/measurement | Contrast or thickness insufficient |
| 2.4.12 | Focus not obscured by other content | screenshots | Focus indicator hidden by sticky headers/footers/modals |

### Focus Indicator Check Script

Use `scripts/focus-indicator-check.ts` to automatically detect focus indicator presence, focus obscured issues, and focus-triggered context changes.

**WCAG Coverage:**
- **2.4.7 Focus Visible** - Detects elements without visible focus indicators
- **2.4.12 Focus Not Obscured (Minimum)** - Detects focus indicators hidden by fixed/sticky elements
- **3.2.1 On Focus** - Detects navigation/context changes triggered by focus

**Features:**
- Detects all focusable elements on the page
- Tabs through each element and captures style changes on focus
- Checks for outline, box-shadow, background-color changes
- Reports elements without visible focus indicators with warning labels
- **Detects focus obscured by fixed/sticky elements (2.4.12)** using `elementFromPoint()` with z-index fallback
- **Detects navigation caused by focus (3.2.1 violation)**
- If navigation occurs, goes back and takes screenshot on original page
- Takes a full-page screenshot highlighting problematic elements

**Usage:**
```bash
# Default test page
npx playwright test scripts/focus-indicator-check.ts

# Custom URL
TEST_PAGE="https://example.com" npx playwright test scripts/focus-indicator-check.ts
```

**Output:**
- `focus-indicator-result.json` - Full results including:
  - `issues` - Elements without focus styles (2.4.7)
  - `focusObscuredIssues` - Focus obscured by fixed/sticky elements (2.4.12)
  - `onFocusViolations` - Focus-triggered context changes (3.2.1)
  - `interrupted` - Whether test was interrupted by navigation
  - `allElements` - All tested elements with their focus style diffs
- `focus-indicators.png` - Full-page screenshot with warning labels on problematic elements

**3.2.1 Detection:**
When an element's focus event triggers navigation:
1. Violation is recorded with element selector, from/to URLs
2. Test navigates back to original page
3. Screenshot is taken on the original page
4. Test is marked as interrupted

**Dependencies:**
```bash
npm install @playwright/test
```

## Pointer
| Criterion | Action | Evidence | Fail rule |
|---|---|---|---|
| 2.5.7 | Provide alternative to dragging | logs | Dragging is required with no alternative |
| 2.5.8 | Measure target size | screenshots/measurement | Minimum target size not met |

### Target Size Check Script

Use `scripts/target-size-check.ts` to automatically measure tap/click target sizes per WCAG 2.5.8 (AA: 24px) and 2.5.5 (AAA: 44px).

**Features:**
- Detects all interactive elements (links, buttons, inputs, ARIA widgets)
- Measures bounding box dimensions via `getBoundingClientRect()`
- Retrieves accessible names via Playwright's `ariaSnapshot()` API
- Checks WCAG 2.5.8 exceptions: inline, redundant, ua-control, spacing
- Reports issues at both AA (24px) and AAA (44px) levels
- Takes full-page screenshot with color-coded highlights

**Usage:**
```bash
# Default test page
npx playwright test scripts/target-size-check.ts

# Custom URL
TEST_PAGE="https://example.com" npx playwright test scripts/target-size-check.ts
```

**Output:**
- `target-size-result.json` - Full results with all targets and issues
- `target-size-screenshot.png` - Full-page screenshot with highlights:
  - **Green (PASS)**: >= 44px (AA Pass, AAA Pass)
  - **Orange (AA Pass)**: 24-43px (AA Pass, AAA Fail)
  - **Red (AA Fail)**: < 24px (AA Fail, AAA Fail)
  - **Blue (Exception)**: Possible exception (manual review needed)

**Exceptions Detected:**
| Exception | Detection Method |
|---|---|
| inline | Link within paragraph/list with surrounding text >= 10 chars |
| redundant | Same href exists with another target meeting size requirement |
| ua-control | Native form control (checkbox, radio, select) with default appearance |
| spacing | No adjacent targets within 24px |
| essential | Cannot auto-detect (marked for manual review) |

**Limitations:**
- Essential exception requires manual judgment
- CSS pseudo-elements expanding click area not fully detectable
- CSS transform effects are included in measurements (getBoundingClientRect returns transformed size)

**Manual Verification Required:**
- Confirm essential exceptions (e.g., map pins, game controls)
- Verify spacing exception with actual interaction testing
- Check targets appearing only after interaction (dropdowns, modals)

## Hover/Focus Content
| Criterion | Action | Evidence | Fail rule |
|---|---|---|---|
| 1.4.13 | Hover/focus content can be dismissed/hovered/persistent | logs/video | Cannot dismiss or content disappears unexpectedly |

## Error Handling
| Criterion | Action | Evidence | Fail rule |
|---|---|---|---|
| 3.3.1 | Trigger error and confirm identification | screenshot | Error location not indicated |
| 3.3.3 | Provide correction suggestions | screenshot | No specific suggestions |
| 3.3.4 | Allow confirm/reverse for critical actions | logs | No confirm/reversal mechanism |

### 3.3.1 Error Identification Check

**Overview:** When input errors are automatically detected, the item that is in error must be identified in text and described to the user.

> **Note:** When testing 3.3.1, also verify:
> - **3.3.2 Labels or Instructions** — check that form inputs have accessible names and instructions before triggering errors. See [automated-checks.md](./automated-checks.md) for 3.3.2 details.
> - **3.3.3 Error Suggestion** — check that error messages include suggestions for correcting the error (e.g., "Enter a valid email address like name@example.com").

**Test Procedure:**

1. **Find forms on the page:**
   - Detect `<form>` elements
   - Detect input fields (`input`, `select`, `textarea`)
   - Note required fields (`required` attribute, `aria-required="true"`, or visual indicators)

2. **Trigger errors intentionally:**

   | Error Type | Method |
   |------------|--------|
   | Empty required field | Clear field value and submit form |
   | Invalid email | Enter "invalid-email" in email field |
   | Invalid date | Enter "not-a-date" in date field |
   | Invalid phone | Enter "abc" in phone field |
   | Out of range | Enter value outside min/max limits |
   | Pattern mismatch | Enter value not matching `pattern` attribute |

3. **Check error identification:**

   | Check | Pass Condition | Fail Condition |
   |-------|---------------|----------------|
   | Error message exists | Text message describes the error | No message or message is only visual (color/icon) |
   | Error location indicated | Which field has error is clear from text | Only relies on color or position |
   | Programmatic association | `aria-describedby`, `aria-errormessage`, or `aria-invalid` present | No programmatic link between error and field |

4. **a11y tree verification:**
   - Check `aria-invalid="true"` on error fields
   - Check `aria-describedby` or `aria-errormessage` pointing to error text
   - Verify error message is exposed in a11y tree (not hidden from AT)

**Example Playwright test flow:**
```typescript
// 1. Find form and required input
const form = page.locator('form').first();
const requiredInput = form.locator('input[required], input[aria-required="true"]').first();

// 2. Clear input and submit to trigger error
await requiredInput.fill('');
await form.locator('button[type="submit"], input[type="submit"]').click();

// 3. Check for error indication
const a11ySnapshot = await page.accessibility.snapshot();
// Look for aria-invalid, aria-describedby in snapshot
// Check if error message text is exposed
```

**Pass if:**
- Error message is displayed in text
- Error message identifies which field has the error
- Error is programmatically associated with the field (preferred)

**Fail if:**
- No error message appears
- Error is indicated only by color (red border/text without text explanation)
- Error message doesn't indicate which field is in error
- Error message is not perceivable by AT (e.g., only visual icon)

## Authentication
| Criterion | Action | Evidence | Fail rule |
|---|---|---|---|
| 3.3.8 | Authentication does not rely on cognitive tests alone | captures | Cognitive-only requirement with no alternative |

## Auto-play Detection

Supports criteria:
- **1.4.2** (Audio Control): Auto-play audio can be stopped/controlled
- **2.2.2** (Pause, Stop, Hide): Auto-updating content can be paused/stopped

### Auto-play Detection Script

Use `scripts/auto-play-detection.ts` to detect auto-playing content via pixel-level screenshot comparison.

**Features:**
- Takes screenshots at 2-second intervals (0s, 2s, 4s, 6s)
- Uses pixel-level diff detection (pixelmatch) for accurate comparison
- Detects if content continues beyond 5 seconds (WCAG 2.2.2 threshold)
- Automatically detects pause/stop controls on the page
- Verifies if pause controls actually work by clicking and re-comparing
- Generates visual diff images highlighting changed areas
- Reports findings with accessibility recommendations

**Usage:**
```bash
# Update URL in the script and run
npx playwright test scripts/auto-play-detection.ts
```

**Output:**
- `auto-play-screenshots/` - Directory containing:
  - `screenshot-0s.png` through `screenshot-6s.png` - Comparison screenshots
  - `diff-*-vs-*.png` - Visual diff images showing changed pixels
  - `detection-result.json` - Full detection results including:
    - Change percentages between intervals
    - Whether content stops within 5 seconds
    - Detected pause controls with accessibility info
    - Pause control verification results

**Dependencies:**
```bash
npm install @playwright/test pixelmatch pngjs
npm install -D @types/pngjs
```

**Pause Control Detection:**
The script automatically searches for pause/stop controls by:
- Accessible names containing pause-related keywords (EN/JP)
- Class name patterns (pause, play, stop, toggle, switch, control)
- Context awareness (prioritizes controls near carousel elements)

**Pause Control Verification:**
When auto-play is detected and continues beyond 5 seconds:
1. If pause control found → clicks the control
2. Takes screenshots before and after clicking
3. Compares to verify animation actually stopped
4. Reports whether the control works

**Limitations:**
- Detects visual changes only (carousels, animations, video playback)
- Audio auto-play requires manual verification (listening)
- Small animations below 0.1% threshold may not be detected

**Manual Verification Required:**
- Verify pause/stop controls are keyboard accessible
- Check for audio auto-play (requires listening)
- If pause control verification fails, manually check control functionality
