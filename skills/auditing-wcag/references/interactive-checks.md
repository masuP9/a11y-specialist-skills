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

### `keyboard-reachability-check` CLI Check

Reports operable elements that were reached neither by Tab, nor by arrow keys inside a composite widget (tablist, toolbar, menu, listbox, radio group, etc.), nor via `aria-activedescendant`, with a reason and a confidence (high / medium / low).

```bash
npx -y @a11y-skills/audit --url "https://example.com" --checks keyboard-reachability-check
```

- Candidates are always incomplete: the criterion is met if the same function is keyboard operable through another element or a custom shortcut, so verify manually.
- `details.elements` in `keyboard-reachability-result.json` records how every element was reached (`tab` / `arrow` / `activedescendant` / `unreachable` / `not-evaluated`).
- Comboboxes (`role="combobox"`) and `aria-haspopup` (`true` / `menu` / `listbox` / `tree`) elements are opened one level with ArrowDown, and their option / menuitem / treeitem items are checked too (`details.popups`). Popups with more than 10 items are only sampled: the first item can be entered, ArrowDown moves on, ArrowUp comes back (`sampled`). Popups the keyboard could not get into are only recorded as `opened-not-entered`; verify them manually.
- Verify manually: completeness of functions, nested submenus, popups opened with Enter / Space, other content shown after load, grid / treegrid, Shadow DOM / iframes, custom shortcuts.

## Focus
| Criterion | Action | Evidence | Fail rule |
|---|---|---|---|
| 2.4.3 | Focus order matches visual order | focus order log + `focus-order-check` | Order deviates materially |
| 2.4.7 | Focus indicator visible | screenshots/video | Focus not visible |
| 2.4.11 | Focus not entirely obscured by other content | screenshots/measurement | Focused element entirely hidden by sticky headers/footers/modals |
| 2.4.12 (AAA) | Focus not obscured at all by other content | screenshots/measurement | Any part of the focused element hidden by sticky headers/footers/modals |

### `focus-indicator-check` CLI Check

Use the `focus-indicator-check` check to automatically detect focus indicator presence, focus obscured issues, and focus-triggered context changes.

**WCAG Coverage:**
- **2.4.7 Focus Visible** - Detects elements without visible focus indicators
- **2.4.11 Focus Not Obscured (Minimum)** - Detects elements fully hidden by fixed/sticky elements when focused (`a11y-skills/focus-not-obscured`)
- **2.4.12 Focus Not Obscured (Enhanced, AAA)** - Detects every element partly hidden, including fully hidden ones (`a11y-skills/focus-not-obscured-enhanced`)
- **3.2.1 On Focus** - Detects navigation/context changes triggered by focus

**Features:**
- Detects all focusable elements on the page
- Tabs through each element and captures style changes on focus
- Checks for outline, box-shadow, background-color changes
- Reports elements without visible focus indicators with warning labels
- **Detects focus obscured by fixed/sticky elements (2.4.11 / 2.4.12)** using `elementFromPoint()` with z-index fallback
- **Detects navigation caused by focus (3.2.1 violation)**
- If navigation occurs, goes back and takes screenshot on original page
- Takes a full-page screenshot highlighting problematic elements

**Usage:**
```bash
npx -y @a11y-skills/audit --url "https://example.com" --checks focus-indicator-check
```

**Output:**
- `focus-indicator-result.json` - Full results including:
  - `issues` - Elements without focus styles (2.4.7)
  - `focusObscuredIssues` - Focus obscured by fixed/sticky elements (every partly obscured element = 2.4.12; those with `fullyObscured: true` = 2.4.11)
  - `onFocusViolations` - Focus-triggered context changes (3.2.1)
  - `interrupted` - Whether test was interrupted by navigation
  - `allElements` - All tested elements with their focus style diffs. Each has `tabStep` (which Tab press focused it; null when focus arrived another way) and `rect` (page coordinates at focus time). `id` is the order focusin events arrived, not necessarily the Tab order
- `focus-indicators.png` - Full-page screenshot with warning labels on problematic elements (use `--screenshot` flag)

**3.2.1 Detection:**
When an element's focus event triggers navigation:
1. Violation is recorded with element selector, from/to URLs
2. Test navigates back to original page
3. Screenshot is taken on the original page
4. Test is marked as interrupted

### `change-on-input-check` CLI Check

`change-on-input-check` changes the value of each form control, one at a time, and records whether that alone changes the context (3.2.2).

- Controls changed: `select`, radio (per group), checkbox, text-like `input` and `textarea` in the main frame. Disabled, readonly and invisible controls are left alone. Text-like controls get a fixed value and are blurred so that `change` fires.
- Recorded: main-frame navigation, a new window, focus moving elsewhere, a dialog. After a navigation it restarts in a fresh context, skips the controls already tried, and continues with the rest.
- Findings are `incomplete` candidates. Advice given beforehand ("choosing an option goes to the page right away") makes the page conform, so a human checks for such advice on each candidate.
- It really changes values on the live page and fires `change`. Values are put back without events, but the page's internal state is not restored. Pages that autosave or submit on change may send requests.
- Run: `npx -y @a11y-skills/audit --url "<url>" --checks change-on-input-check`

### `focus-order-check` CLI Check

Lists elements by the order Tab actually visited them with their positions, and reports moves against the visual order (back up the page, backwards on a row, long jumps that return) with numbers. It also checks whether focus moves into a modal dialog when it opens and returns to the opening control when it closes.

```bash
npx -y @a11y-skills/audit --url "https://example.com" --checks focus-order-check
```

- Candidates are always incomplete: an order that departs from the visual one still meets 2.4.3 when meaning and operability are preserved, so verify manually.
- To test dialogs it reloads the page, presses Enter on likely triggers (`aria-haspopup="dialog"`, etc.) and Escape (or a close button) to close. A trigger that also submits or navigates sends requests; the CLI always tries up to 10 triggers. To press none, call `runFocusOrderCheck` from the function API with `maxDialogTriggers: 0` (triggers are still collected but not pressed), or do not run this check on production pages with side effects.
- `focus-order-result.json` holds the Tab order in `details.stops`, neighbor comparisons in `details.transitions` and per-dialog observations in `details.dialogs`.
- Verify manually: fixed / sticky elements and order inside iframes, card grids and vertical writing, dialogs opened by buttons without such attributes, Tab cycling inside a modal.

## Pointer
| Criterion | Action | Evidence | Fail rule |
|---|---|---|---|
| 2.5.1 | Pinch, swipe and other multipoint / path-based gestures have a single-pointer alternative | logs | Operable only by multipoint or path-based gestures |
| 2.5.4 | Shaking / tilting has a UI-component alternative and motion actuation can be turned off | logs | Operable only by motion, or cannot be turned off |
| 2.5.7 | Provide alternative to dragging | logs | Dragging is required with no alternative |
| 2.5.8 | Measure target size | screenshots/measurement | Minimum target size not met |

### `motion-actuation-check` CLI Check

`motion-actuation-check` lists, through CDP, the listeners that react to device motion or tilt (`devicemotion` / `deviceorientation` / `deviceorientationabsolute` on `window` / `document`) and reports them as `incomplete` candidates (Chromium only; elsewhere the listeners cannot be inspected, so the result is `incomplete`).

- The automation stops at "does the page react to motion". Whether a UI-component alternative exists and motion actuation can be turned off (including the essential / accessibility-supported-interface exceptions) is verified by a human for each candidate.
- For event types that have a `window` listener, synthetic events are dispatched and whether the DOM changes (`domMutations`) is recorded as evidence. Synthetic events are `isTrusted: false`, so handlers that accept only trusted events, or that only draw on a canvas, show "no change". The listener is still reported.
- A listener on `document` only may never run, because browsers dispatch these events to `window` only (nothing is dispatched for it).
- Run: `npx -y @a11y-skills/audit --url "<url>" --checks motion-actuation-check`

### `pointer-gesture-check` CLI Check

`pointer-gesture-check` reports components likely operated by dragging, swiping or multiple fingers as `incomplete` candidates (`a11y-skills/pointer-gestures` for 2.5.1, `a11y-skills/dragging-movements` for 2.5.7).

- Picked up: `draggable="true"`, `dragstart` / `drop` listeners, elements with both a press and a move listener, listeners that look at multiple touches (`touches.length` etc.), custom `role="slider"` widgets, and markup of sortable lists, carousels and maps. Listeners are read through CDP (Chromium only; elsewhere only attributes and widget markup are used and a manual-check note is added).
- Not candidates: elements with only a move listener (hover effects), and delegation roots with listeners for 20 or more event types (e.g. a React root); the latter become one page-level manual-check node per rule. Gestures built on delegation cannot be found from listeners.
- Every candidate is `incomplete`. A human verifies, per candidate, that a single-pointer alternative (buttons or clicks) exists, or that the essential exception applies. Nothing is dragged or swiped to see whether something moves.
- Run: `npx -y @a11y-skills/audit --url "<url>" --checks pointer-gesture-check`

### `target-size-check` CLI Check

Use the `target-size-check` check to automatically measure tap/click target sizes per WCAG 2.5.8 (AA: 24px) and 2.5.5 (AAA: 44px).

**Features:**
- Detects all interactive elements (links, buttons, inputs, ARIA widgets)
- Measures bounding box dimensions via `getBoundingClientRect()`
- Retrieves accessible names via Playwright's `ariaSnapshot()` API
- Checks WCAG 2.5.8 exceptions: inline, redundant, ua-control, spacing
- Evaluates the spacing exception geometrically per the WCAG definition: a 24px-diameter circle centered on each undersized target's bounding box must not intersect another target (nor the circle of another undersized target)
- Treats a `label` (explicit `for` or implicitly wrapping its control), its control, and every other label of that control as one target; nested interactive elements are separate targets, so a small control inside a larger clickable area does not get the spacing exception
- Compares viewport-fixed `position: fixed` targets with each other as they are, and with normal-flow targets at the scroll position where the two are farthest apart (scroll position 0 when the fixed target is above, the bottom of the page when it is below). A link just below a fixed header, or still close to a back-to-top button when scrolled to the bottom, fails; merely passing under a fixed element while scrolling does not (independent of the scroll position at call time); a fixed element under a transform-like ancestor that forms its containing block, and `position: sticky`, scroll with the page and are treated as normal flow
- Does not count the part clipped by an ancestor's `overflow: hidden` / `clip` (per axis), `contain: paint`, `content-visibility: auto`, or an inline `<svg>` as target area: size and spacing are measured on the visible part only (the hidden lower part of a collapsed code block does not intersect a nearby link). An element that escapes an ancestor via `position: absolute` / `fixed` is not clipped by it. `overflow: auto` / `scroll` scroll containers are not treated as clips, because their content is reachable by scrolling (so content overflowing a scroll container still counts at its position). The `overflow-clip-margin` area counts as visible. `<html>`'s overflow, and `<body>`'s when it propagates to the page scroll, are not treated as clips (their paint containment is). `clip-path` and `clip` are not considered. A rotated, skewed, or mirrored ancestor is approximated by its bounding box
- Drops targets covered by another element (hit-tested while scrolling) and records the count, together with targets entirely clipped from view, in `details.occludedTargets`
- Reports issues at both AA (24px) and AAA (44px) levels
- Takes full-page screenshot with color-coded highlights and 24px circles

**Usage:**
```bash
npx -y @a11y-skills/audit --url "https://example.com" --checks target-size-check
```

**Output:**
- `target-size-result.json` - Full results with all targets and issues
- `target-size-screenshot.png` - Full-page screenshot with highlights:
  - **Green (PASS)**: >= 44px (AA Pass, AAA Pass)
  - **Orange (AA Pass)**: 24-43px (AA Pass, AAA Fail)
  - **Red (AA Fail)**: < 24px (AA Fail, AAA Fail)
  - **Blue (Spacing OK)**: < 24px but the spacing exception is verified geometrically (conforms to 2.5.8)
  - **Blue (Exception)**: Possible exception (manual review needed)
  - **Circles**: the 24px circle of each undersized target — green = intersects no other target, red = intersects

**Exceptions Detected:**
| Exception | Detection Method |
|---|---|
| inline | Link within paragraph/list with surrounding text >= 10 chars |
| redundant | Same href exists with another target meeting size requirement |
| ua-control | Native form control (checkbox, radio, select) with default appearance |
| spacing | A 24px circle centered on the target intersects neither another target nor the circle of another undersized target (`exceptionAssessment: "verified"`; when it fails, `spacing.intersections` records each neighbor's selector and distance) |
| essential | Cannot auto-detect (marked for manual review) |

The geometric spacing result takes precedence over the heuristic exceptions. Targets with a verified spacing exception leave the 2.5.8 manual-review list, so `target-size-minimum` passes (count in `summary.verifiedCount`). SC 2.5.5 has no spacing exception, so they are still reported as `target-size-enhanced` incomplete.

**Limitations:**
- Essential exception requires manual judgment
- CSS pseudo-elements expanding click area not fully detectable
- CSS transform effects are included in measurements (getBoundingClientRect returns transformed size)
- Elements whose click handler is attached only by script (no `onclick` attribute, role, or tabindex) are not detected as targets, so they are also missing as spacing neighbors
- Shadow DOM and iframe content are not inspected

**Manual Verification Required:**
- Confirm essential exceptions (e.g., map pins, game controls)
- Targets with a verified spacing exception: confirm no undetected kind of target sits nearby
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

### `accessible-authentication-check` CLI Check

`accessible-authentication-check` inspects password, verification code and username fields and CAPTCHA-like elements in the main document, and reports three kinds of `incomplete` candidates.

- **Paste blocking** (`a11y-skills/auth-paste-blocked`): a short text is pasted into password / verification code fields with the keyboard to see whether it is inserted. A field where it is not is a candidate. Fields that could not be measured (not visible, not editable, navigation, timeout) are listed for review too.
- **autocomplete off** (`a11y-skills/auth-autocomplete`): an authentication field with `autocomplete="off"` or a value that does not suit the field. A field with no attribute, or only `on`, is not reported (password managers usually infer the purpose from the control type; if the field's name matches the 1.3.5 patterns, `autocomplete-audit`'s `autocomplete-missing` may report it, and a field that matches neither is reported by neither check).
- **CAPTCHA-like elements** (`a11y-skills/auth-captcha`): found by name (`captcha`, `g-recaptcha`, `cf-turnstile`, ...). Invisible (score-based) ones are listed too.

The paste measurement has side effects: it grants clipboard permissions to the caller's context, overwrites the clipboard, and opens a helper page for a moment. Field values are put back, except for a field whose paste timed out, and state the page changes in response to `input` events is not. Pass `paste: false` (function API) when reusing the page. The CLI uses a fresh context per check, so it is not affected.

- Only the three items above are checked automatically. Whether another method without a cognitive function test exists (passkey, SSO, e-mail link), whether an assistive mechanism such as autofill works, and whether a CAPTCHA only recognizes objects or user-provided content are for a human to decide for each candidate.
- Blind spots: fields inside iframes and shadow roots, forms that appear only after clicking a sign-in button (pass a page with the form open), and custom CAPTCHAs without "captcha" in their markup.
- Run: `npx -y @a11y-skills/audit --url "<url>" --checks accessible-authentication-check`

## Auto-play Detection

Supports criteria:
- **1.4.2** (Audio Control): Auto-play audio can be stopped/controlled
- **2.2.2** (Pause, Stop, Hide): Auto-updating content can be paused/stopped

### `auto-play-detection` CLI Check

Use the `auto-play-detection` check to detect auto-playing content via pixel-level screenshot comparison (2.2.2) and to measure media playback state (1.4.2).

**Features:**
- Takes screenshots at 2-second intervals (0s, 2s, 4s, 6s)
- Uses pixel-level diff detection (pixelmatch) for accurate comparison
- Detects if content continues beyond 5 seconds (WCAG 2.2.2 threshold)
- Automatically detects pause/stop controls on the page
- Verifies if pause controls actually work by clicking and re-comparing
- Generates visual diff images highlighting changed areas
- Reports findings with accessibility recommendations
- Records every `<audio>` / `<video>` in the page and its iframes (nested frames and shadow roots included) when the check starts, with each screenshot, and on every play / pause / mute / rate change, and reports media without visible `controls` that was heard for more than 3 seconds (`audibleSeconds`), or that is playing with sound at the last sample and will keep playing for more than 3 seconds (`loop`, endless stream, or more than 3 seconds of real time left at the playback rate), as `a11y-skills/auto-play-audio` (incomplete) (1.4.2). Sound muted or stopped partway, short loops, and media added during the check (from when it is added) still count, and media removed from the DOM during the check stays in the result with `removed: true`. When its iframe is removed or its frame's content replaced, its last record stays with `documentRemoved: true` (target: the nearest remaining parent document's `html`; the message names the original frame URL). If that record was playing with sound, the time it kept playing is unknown, so it is incomplete regardless of `audibleSeconds`

**Usage:**
```bash
npx -y @a11y-skills/audit --url "https://example.com" --checks auto-play-detection
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
    - `mediaElements` - Playback state of each media element and the pause/mute controls found in the same frame

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
- Screenshot comparison (2.2.2) detects visual changes only (carousels, animations, video playback)
- Audio (1.4.2) is measured by playback state only; whether sound is actually heard requires manual verification (listening). Audio controls are found by name only, never clicked, and controls in a parent frame or elsewhere on the page are not searched
- Audio is sampled about every 2 seconds from when the check starts, so sound before that is not counted. Sound that starts just before the last sample is flagged if it will keep playing for more than 3 seconds, but not if 3 seconds or less remain
- Whether `controls` are visible is judged by size, `display`, `visibility` and `opacity` (iframe elements above included) and rendered ancestors (an assigned slot before the DOM parent). An ancestor with overflow `hidden` / `clip` whose padding box (inside the border) does not overlap them makes them invisible; `clip-path` / `clip`, a non-overlapping scroll container, a fixed / absolute box that may escape, or a transform that keeps the padding box from being placed makes it undetermined (incomplete). Partial clipping and off-screen position are not checked
- Sound that does not use `<audio>` / `<video>` (e.g. the Web Audio API) is not measured
- Small animations below 0.1% threshold may not be detected

**Manual Verification Required:**
- Verify pause/stop controls are keyboard accessible
- Check for audio auto-play (requires listening)
- If pause control verification fails, manually check control functionality
