[日本語版 (Japanese)](./interactive-checks.ja.md)

# Interactive Checks

Criteria judged by reproducing user interaction through browser interaction: keyboard, pointer and error handling, where state transitions are involved.

## Common Procedure
- Walk the main flows with the keyboard (Tab/Shift+Tab/Enter/Space/arrow keys)
- Simulate pointer actions (click/drag/hover)
- Record state changes with DOM diffs and the a11y tree

## Reading the CLI Checks
- Each section lists only the run command, the side effects and what a person must verify. **Run a check that has side effects only when the scope contract confirmed that side effects are acceptable** (the allowlist is in "Automated Checks" in [SKILL](../SKILL.md)). For criteria whose checks were not run, have a person verify with browser interaction or mark NT.
- How to read the results (what is settled, what stays under review): [checks-audit](../../a11y-knowledge/references/checks-audit.md). How each check measures, the fields of the result JSON and known limits: the [package README](../../../packages/a11y-audit/README.md).
- Common part of the run command: `npx -y @a11y-skills/audit --url "<url>" --output-dir <dir> --checks <name>`

## Keyboard
| Criterion | Action | Evidence | Fail condition |
|---|---|---|---|
| 2.1.1 | Operate all functions with the keyboard only | Action log/video | Click-only operation exists |
| 2.1.2 | Focus can always be moved away | Action log | A focus trap exists |
| 2.1.4 | Disablement, remapping, or focus restriction for character-only shortcuts, including sequences | Action log + `character-key-shortcut-check` | None is satisfied; an actual accidental activation is not required |

### `keyboard-reachability-check` (2.1.1)
- Run: `--checks keyboard-reachability-check`
- Side effects: actually presses Tab, arrow keys and ArrowDown (to open popups).
- Verify by hand: whether an unreachable element has another route (another element, a custom shortcut); whether a reachable element also works with Enter / Space; second-level submenus, popups opened by Enter / Space, elements shown after load, grid / treegrid, Shadow DOM / iframe; popups recorded as `opened-not-entered`.

### `keyboard-trap-check` (2.1.2)
- Run: `--checks keyboard-trap-check`
- Side effects: presses Tab 2 x the element count + 10 times (capped at 600) to walk the page, then Escape and Shift+Tab if a trap is suspected. It also clicks, with the DOM `click()` (a real click), a button inside a parent of the trapped element whose name matches "close / 閉じる / dismiss" (a button that also does something other than closing will run).
- Verify by hand: an Escape that works inside `role="dialog"` + `aria-modal="true"` is not reported; whether the exits other than Escape (`needs-review`) really let you out in the way indicated; the remaining range when `details.tabWalkCapped` cut the walk short; iframes and Shadow DOM.

### `character-key-shortcut-check` (2.1.4)
- Run: `--checks character-key-shortcut-check`
- Side effects: with focus on `<body>`, actually presses the 94 printable characters. On pages with shortcuts that delete or submit, those run.
- Verify by hand: whether a reacting key has a way to turn it off or remap it; whether it works only while a component has focus (exception); keydown handlers on an element wrapping the whole app and shortcuts that work only while a component has focus (not examined); for doubtful keys, narrow the function API's `keys` to one character and retry (the CLI has no setting to limit the keys pressed). Include character sequences and symbols produced with Shift or similar keys; remapping must include a non-printable key. [2.1.4](../../a11y-knowledge/references/criteria/2.1.4.md)

## Focus
| Criterion | Action | Evidence | Fail condition |
|---|---|---|---|
| 2.4.3 | Compare actual order with content relationships | Focus order log + `focus-order-check` | Order harms meaning or operability; visual differences alone are insufficient |
| 2.4.7 | Check that focus is visible | Screenshot/video | Focus is not visible |
| 2.4.11 | Check visible portions of the focused component itself | Screenshot/measurement + covering origin and reveal interaction | Author-created content entirely hides the component and the notes do not apply |
| 2.4.12 (AAA) | Inspect the whole component itself | Screenshot/measurement | Author content hides any component portion; do not reuse 2.4.11 notes ([details](../../a11y-knowledge/references/criteria/2.4.12.md)) |
| 2.4.13 (AAA) | Measure colors at identical positions before/after focus and qualifying area | State colors, geometry, measurements | Insufficient area or change contrast with no applicable exception ([details](../../a11y-knowledge/references/criteria/2.4.13.md)) |

### `focus-indicator-check` (2.4.7 / 2.4.11 / 2.4.12 / 3.2.1)
- Run: `--checks focus-indicator-check` (`--screenshot` adds an annotated full-page screenshot)
- Side effects: moves focus to every element with Tab. On pages where focus causes navigation, the navigation happens (it is detected, the check returns to the original page and records an interruption).
- Verify by hand: visibility and persistence for 2.4.7 (style differences alone cannot establish invisibility); treat 2.4.11 `fullyObscured` as a candidate and check actual complete obscuration of the component, initial positions of movable coverings, and whether user-opened coverings allow revealing it without advancing focus (see [2.4.11](../../a11y-knowledge/references/criteria/2.4.11.md)); navigation that changes only the query / hash; elements skipped because of an interruption or a limit; fixed / sticky elements and the inside of iframes.

### `change-on-input-check` (3.2.2)
- Run: `--checks change-on-input-check`
- Side effects: actually changes field values and fires `change` (text fields get a fixed value and blur). On pages with autosave or auto-submit, requests go out. Values are restored without events, but the page's internal state is not.
- Verify by hand: for each candidate, whether an explanation was given before the change ("selecting moves you immediately", etc.); the fields in `details.untested`; iframes, shadow roots and custom widgets.

### `focus-order-check` (2.4.3)
- Run: `--checks focus-order-check`
- Side effects: presses Tab through the page, Enter on buttons that open dialogs and Escape to close them. If a button also submits or navigates, a request goes out (the CLI always tries up to 10). To avoid pressing them, call the function API with `maxDialogTriggers: 0`, or do not run the check on production pages with side effects.
- Verify by hand: whether meaning and operation are kept even where the order departs from the visual one; the order of fixed / sticky elements and inside iframes, card-style grids and vertical writing, dialogs opened by buttons without attributes, Tab cycling inside a modal.

## Pointer
| Criterion | Action | Evidence | Fail condition |
|---|---|---|---|
| 2.5.1 | Check for a single-pointer alternative without a path to multipoint/path-based operations | Action log + `pointer-gesture-check` | Nonessential operation has no alternative; keyboard support alone is insufficient |
| 2.5.2 | Check completion timing, abort/undo, up reversal, and essentiality | Action log + `pointer-cancellation-check` | None of the normative alternatives is satisfied |
| 2.5.4 | Check equivalent controls, motion disablement, and exceptions | Action log + `motion-actuation-check` | Not excepted and either alternative operation or disablement is missing |
| 2.5.7 | Check that a single pointer operates the same function without dragging | Action log + `pointer-gesture-check` | No alternative and neither essential nor UA exception applies |
| 2.5.8 | Measure target size | Screenshot/measurement + `target-size-check` | Minimum size not met |

### `motion-actuation-check` (2.5.4)
- Run: `--checks motion-actuation-check`
- Side effects: sends synthetic motion events to types whose listener is on `window` (whether the DOM changes is the evidence). The page state may change.
- Verify by hand: for each candidate, whether there is an on-screen alternative and a way to turn off motion activation (including the essential and AT-supported exceptions). Synthetic events have `isTrusted: false`, so a candidate remains even when "no change" is shown. An OS setting can qualify; verify its actual effect. Cameras, Generic Sensor API, and post-permission states are outside automated detection. [2.5.4](../../a11y-knowledge/references/criteria/2.5.4.md)

### `pointer-gesture-check` (2.5.1 / 2.5.7)
- Run: `--checks pointer-gesture-check`
- Side effects: none (it sends no events and does not change the page state).
- Verify by hand: whether a path or dragging is actually required, whether a single pointer performs the same function, and whether an essential or UA exception applies. Keyboard-only alternatives are insufficient, but a value input can qualify. Retain page-level manual-review nodes (delegation, inspection failure, truncation, etc.) even with zero candidates. See [2.5.1](../../a11y-knowledge/references/criteria/2.5.1.md) and [2.5.7](../../a11y-knowledge/references/criteria/2.5.7.md).

### `pointer-cancellation-check` (2.5.2)
- Run: `--checks pointer-cancellation-check`
- Side effects: sends synthetic down-events (`pointerdown` / `mousedown`) to each operable element. On pages that submit or save on the down-event, that runs.
- Verify by hand: for each candidate, whether it runs on release, whether it can be aborted, whether it can be undone, and whether the essential down-event exception applies; the page-level "verify manually" nodes. Focus movement on press alone is not Fail. Check up reversal as well; Undo alone does not remove the need to establish completion timing. [2.5.2](../../a11y-knowledge/references/criteria/2.5.2.md)

### `target-size-check` (2.5.8 / 2.5.5)
- Run: `--checks target-size-check` (also writes a highlighted full-page screenshot)
- Side effects: none (display change only: it scrolls the page to test what is on top and restores the position).
- Verify by hand: whether an `exception: "inline"` candidate is really inside text; the essential exception (map pins, game controls); whether any undetected kind of target (an element with a script-only click handler) is near a target that passed the spacing exception; targets shown only after interaction (dropdowns, modals); Shadow DOM / iframe contents. For 2.5.5, also verify that a same-page equivalent target is at least 44×44 CSS px. Evaluate its sentence/block-of-text exception separately from 2.5.8 and do not apply the spacing exception.

## Hover/Focus Content
| Criterion | Action | Evidence | Fail condition |
|---|---|---|---|
| 1.4.13 | Content shown on hover/focus can be dismissed and persists | Action log/video + `content-on-hover-check` | No way out, or disappears unintentionally |

### `content-on-hover-check` (1.4.13)
- Run: `--checks content-on-hover-check`
- Side effects: actually hovers and focuses candidate elements and presses Escape. On pages where focus causes navigation, the navigation happens (`navigated` in `details.untested`). It does not click.
- Verify by hand: whether a failed condition falls under an exception (content that conveys an input error, content that neither hides nor replaces other content); whether there is a way to dismiss other than Escape; whether content shown longer than `persistMs` (default 3 s) is enough; the pages in `details.delegationRoots` (actually hover and focus buttons and links); elements with only `title` / `aria-describedby` / `aria-haspopup`, content from cross-origin CSS, inside iframes, inside shadow roots.

## Error Handling
| Criterion | Action | Evidence | Fail condition |
|---|---|---|---|
| 3.3.1 | Check the item and nature of automatically detected errors | Screen/text alternatives/validation response | [3.3.1 conditions](../../a11y-knowledge/references/criteria/3.3.1.md) |
| 3.3.3 | Check known corrections, presentation, and exceptions | Screen/accepted values/exception reasons | [3.3.3 conditions](../../a11y-knowledge/references/criteria/3.3.3.md) |
| 3.3.4 | Important actions can be confirmed/cancelled | Action log | No cancel/confirm |

### 3.3.1 Error Identification Check

When an input error is detected automatically, the item in error must be identified in text and the error described to the user.

> **Note:** When testing 3.3.1, also check the following.
> - **3.3.2 Labels or Instructions** — before triggering errors, whether form inputs have labels or instructions presented to all users (do not decide from accessible names alone). See [automated-checks.md](./automated-checks.md).
> - **3.3.3 Error Suggestion** — whether correction suggestions are provided when corrections are known and no exception applies (e.g., "Enter a valid email address such as name@example.com").

**Test procedure:**

1. Detect forms (`<form>`, `input` / `select` / `textarea`, required fields).
2. Trigger errors on purpose (**this submits the form; do it only in an environment confirmed to accept side effects**).

   | Error type | Method |
   |------------|--------|
   | Empty required field | Leave the field empty and submit |
   | Invalid email | Enter "invalid-email" in the email field |
   | Invalid date | Enter "not-a-date" in the date field |
   | Invalid phone number | Enter "abc" in the phone field |
   | Out-of-range value | Enter a value outside min/max |
   | Pattern mismatch | Enter a value that does not match `pattern` |

3. Check the identification.

   | Check | Pass condition | Fail condition |
   |-------|---------------|----------------|
   | Error message exists | Text or a text alternative describes the error | No explanation; color/icons only, without text alternatives |
   | Error location is explicit | The explanation and its presentation identify the field | The field cannot be identified even with the explanation |

4. Also check text alternatives, AT presentation, native validation, and explanations after automatic correction. For implementations using ARIA, inspect post-validation `aria-invalid` and the targets of `aria-describedby` / `aria-errormessage` through attributes. Missing specific attributes alone does not fail 3.3.1. Assess associations, states, and notifications under the conditions of applicable separate criteria.

**Judgment:** Follow [3.3.1-E01–E03](../../a11y-knowledge/references/criteria/3.3.1.md) to assess whether text or a text alternative communicates the item and nature of the detected error. Leave untested states as needs review with the required reproduction steps.

## Authentication
| Criterion | Action | Evidence | Fail condition |
|---|---|---|---|
| 3.3.8 | Authentication does not require a cognitive function test alone | Screen capture + `accessible-authentication-check` | Cognitive test only with no alternative |

### `accessible-authentication-check` (3.3.8)
- Run: `--checks accessible-authentication-check`
- Side effects: pastes a short text into password and one-time-code fields with the keyboard. It grants the clipboard permission, overwrites the clipboard and briefly opens a helper page. Field values are restored, but not for fields that timed out, nor state the page changed through `input` and similar events. The function API can stop it with `paste: false`.
- Verify by hand: whether an alternative that avoids a cognitive function test exists (passkey, SSO, email link); whether assistance such as autofill is available; whether a CAPTCHA stays within object recognition or identifying the user's own content; fields inside iframes and shadow roots, forms shown only after pressing the login button, custom CAPTCHAs without `captcha` in the name.

## Auto-play Detection
| Criterion | Action | Evidence | Fail condition |
|---|---|---|---|
| 1.4.2 | Check intentional initiation and stop/pause or independent volume control | `auto-play-detection` + actual sound/control checks | Automatic sound over three seconds has neither stop/pause nor independent volume control down to zero |
| 2.2.2 | Separate movement and updates; check controls and the essential exception | `auto-play-detection` + control checks | Automatically starts alongside other content, is not essential, and either movement over five seconds lacks pause/stop/hide, or automatic updates lack pause/stop/hide/frequency control (no five-second condition) |

### `auto-play-detection` (1.4.2 / 2.2.2)
- Run: `--checks auto-play-detection` (writes screenshots and diff images to `auto-play-screenshots/`; skipped when `pixelmatch` and `pngjs` are missing)
- Side effects: when moving content lasts 5 seconds or more, clicks the pause control it found to see whether it actually stops.
- Verify by hand: whether the pause / stop control is usable with the keyboard; whether sound is actually audible (listening); whether the control works by hand when the control verification failed; audio that does not use `<audio>` / `<video>` (Web Audio API, etc.); small animations under 0.1%.
- Check that other content remains usable while paused. Under the knowledge base’s own policy, treat ordinary loading indicators that convey an actual wait and disappear on completion, including partial-page loading, as essential by default. Review movement that continues after completion, is unrelated to a wait, or is decorative. Do not extend no detection during about six seconds to slow updates, other states, or unmeasured iframes. See [2.2.2](../../a11y-knowledge/references/criteria/2.2.2.md) and [1.4.2](../../a11y-knowledge/references/criteria/1.4.2.md) for judgment boundaries.
