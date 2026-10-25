# @a11y-skills/audit

Playwright + axe-core based WCAG 2.2 accessibility audit functions.

This package is the functional core extracted from the
[`auditing-wcag`](https://github.com/masuP9/a11y-specialist-skills) Claude Code
skill. It ships 22 checks, plus `runPageSnapshot`, which writes material
(the accessibility tree and more) for judging what the checks do not, as plain
functions plus ready-to-run Playwright test entries.

> **日本語版は [README.ja.md](./README.ja.md) を参照してください。**

> **Scope.** Automated testing detects only ~30–40% of WCAG issues. Manual
> testing is required for full conformance. This package automates a subset.

## Checks

| Function | WCAG |
| --- | --- |
| `runAxeAudit` | axe-core broad coverage (2.0/2.1/2.2 A & AA) |
| `runFocusIndicatorCheck` | 2.4.7 Focus Visible / 2.4.11 Focus Not Obscured (Minimum) / 2.4.12 Focus Not Obscured (Enhanced) / 3.2.1 On Focus |
| `runReflowCheck` | 1.4.10 Reflow |
| `runTargetSizeCheck` | 2.5.5 / 2.5.8 Target Size |
| `runTextSpacingCheck` | 1.4.12 Text Spacing |
| `runZoomCheck` | 1.4.4 Resize Text (200% zoom) |
| `runOrientationCheck` | 1.3.4 Orientation |
| `runAutocompleteAudit` | 1.3.5 Identify Input Purpose |
| `runTimeLimitDetector` | 2.2.1 Timing Adjustable |
| `runAutoPlayDetection` | 2.2.2 Pause, Stop, Hide (visual changes) / 1.4.2 Audio Control (playback state of `<audio>` / `<video>`; whether sound is actually heard needs manual review) |
| `runKeyboardTrapCheck` | 2.1.2 No Keyboard Trap (presses Tab twice the number of focusable elements and records the cycle; focus that never returns to `<body>` and stays within a subset is a candidate. A violation when neither Escape, Shift+Tab nor clicking a close button escapes. An `aria-modal` dialog that Escape closes is not reported; any other way out is needs review) |
| `runKeyboardReachabilityCheck` | 2.1.1 Keyboard (Tab, arrow keys in composite widgets, activedescendant) |
| `runRedundantEntryCheck` | 3.3.7 Redundant Entry (fields in the same form asking for the same information, reported as candidates) |
| `runMotionActuationCheck` | 2.5.4 Motion Actuation (`devicemotion` / `deviceorientation` listeners, reported as candidates) |
| `runChangeOnInputCheck` | 3.2.2 On Input (navigation, new windows, focus moves or dialogs caused by just changing a control's value, reported as candidates) |
| `runAccessibleAuthenticationCheck` | 3.3.8 Accessible Authentication (paste blocking, autocomplete="off", CAPTCHA-like elements, reported as candidates) |
| `runPointerGestureCheck` | 2.5.1 Pointer Gestures / 2.5.7 Dragging Movements (components likely operated by dragging, swiping or multiple fingers, reported as candidates) |
| `runFocusOrderCheck` | 2.4.3 Focus Order (Tab order vs. visual order, focus in modal dialogs, reported as candidates) |
| `runPointerCancellationCheck` | 2.5.2 Pointer Cancellation (components that act on the down-event alone, reported as candidates) |
| `runNonTextContrastCheck` | 1.4.11 Non-text Contrast (border / fill of inputs and similar, icons in icon-only buttons, reported as candidates) |
| `runCharacterKeyShortcutCheck` | 2.1.4 Character Key Shortcuts (keys that react when pressed one at a time with focus on the page body, reported as candidates) |
| `runContentOnHoverCheck` | 1.4.13 Content on Hover or Focus (finds elements that may show content from CSS rules and listeners, hovers and focuses them, and reports content that cannot be dismissed, cannot be hovered, or disappears by itself, as candidates) |
| `runPageSnapshot` | No verdict. Material for judging 2.4.1 / 2.4.2 / 3.1.1 / 3.2.3 / 3.2.4 / 3.2.6 (aria snapshot, title, lang, URLs, an aria snapshot per iframe) |

Most checks take an already-navigated `page`. A few own navigation and take a
`targetUrl` instead (or `TEST_PAGE`): `runOrientationCheck` and
`runTimeLimitDetector` (and `runZoomCheck` when a URL is given).
`runFocusIndicatorCheck`, `runKeyboardReachabilityCheck`, `runChangeOnInputCheck`, `runFocusOrderCheck`, `runPointerCancellationCheck`, `runCharacterKeyShortcutCheck` and `runContentOnHoverCheck` take a `browser`. `runAutoPlayDetection` needs the
optional `pixelmatch` + `pngjs` deps (see Install).

`runRedundantEntryCheck` (3.3.7, `a11y-skills/redundant-entry`) takes an
already-navigated `page`. Within the same form (the whole page for fields
outside any form), when two or more fields ask for the same purpose, the second
and later fields are reported as `incomplete` candidates. The purpose comes from
the `autocomplete` field name, or is inferred from the name / id / label /
placeholder (scope words such as "shipping" and confirmation words such as
"confirm" are removed before matching). Groups whose scope differs
(`shipping` / `billing`) have `kind: 'scoped'`; repeats within the same scope
have `kind: 'repeated'`. Checkboxes, buttons and selects in the same form whose
text suggests "same as ..." are listed in `copyControls`; whether the value is
actually copied is not verified. Disabled / readonly fields count as earlier
information, but only an editable field after the first one is reported (made a
node) as a re-entry (`fields[].editable`). Password and one-time-code fields, different
`section-*` tokens and different forms are not compared. **Multi-page flows
(steps split across several pages) are out of scope**, because a single-page
check cannot know what an earlier page asked for.

`runMotionActuationCheck` (2.5.4, `a11y-skills/motion-actuation`) takes an
already-navigated `page`. Through the Chrome DevTools Protocol (CDP) it lists
the `devicemotion` / `deviceorientation` / `deviceorientationabsolute`
listeners on the main frame's `window` / `document` and reports each as an
`incomplete` candidate; whether a UI-component alternative exists and motion
actuation can be turned off is for a human to verify. For event types with a
`window` listener, synthetic events are dispatched and whether the DOM changes
(`details.simulation.results[].domMutations`, compared with `baselineDomMutations`, the
changes over an equally long window without events, so self-updating pages are not
misread) and any navigation are recorded as evidence. When listeners exist only on
`document`, `simulation.status` is `skipped-document-only` (`skipped-no-listeners` when
there are none) (`simulate: false` skips this; the simulation changes the page's
state, so use `false` when reusing the same page). A handler that never returns
is stopped through CDP. **CDP is Chromium only**; elsewhere the result is
`incomplete` with `listenerInspection: 'unsupported'`. Listeners inside iframes
and listeners added after a user action are not found.

`runChangeOnInputCheck` (3.2.2, `a11y-skills/no-context-change-on-input`) takes
a `browser` and creates and opens its own contexts. It changes each control in
the main frame one at a time (`select`, radio groups, checkboxes, text-like
`input` and `textarea`; disabled, readonly and invisible controls are left out):
a select gets another option, a radio group its first unchecked radio, a
checkbox is toggled, and text-like controls get a fixed value and are blurred so
that `change` fires. Main-frame navigation, a new window, focus moving elsewhere
and dialogs are recorded and reported as `incomplete` candidates; advice given
beforehand makes the page conform, so a human checks for it. After a navigation
it restarts in a fresh context and continues with the controls not yet tried
(`details.restarts`). Values are put back without firing events, but changes
that handlers made to the page are not undone. **It really changes values and
fires `change` on the live page, so pages that autosave or submit on change may
send requests.** Controls inside iframes or shadow roots, ARIA-only widgets, a
single value per control, and changes that surface after `settleMs` are not
covered. Controls that could not be operated (for example, covered by another
element) go to `details.untested` and make the result `incomplete`. Types such as `date` / `time` / `range` / `color` / `file` are not
collected. On pages whose ids change on every load, each restart tries the same
control again and the same finding can repeat (restarts are capped at
`CHANGE_ON_INPUT_MAX_RESTARTS`).
`runAccessibleAuthenticationCheck` (3.3.8) takes an already-navigated `page`.
From the `input` elements of the main document it collects password fields,
verification code fields (`autocomplete="one-time-code"`, or a name / id /
label / placeholder that looks like an OTP) and username fields
(`autocomplete="username"`, or the text field just before the first password
field of the same form). Together with CAPTCHA-like elements (elements with
`captcha` in their name, `.g-recaptcha`, `.h-captcha`, `.cf-turnstile`,
`[data-sitekey]`, CAPTCHA iframes; only the outermost of nested matches) it
reports `incomplete` candidates under three rules:
`a11y-skills/auth-paste-blocked` (a field where pasting does not work),
`a11y-skills/auth-autocomplete` (an authentication field with
`autocomplete="off"` or a value that does not suit it) and
`a11y-skills/auth-captcha`. None is a `violation`, because 3.3.8 is met when
another method without a cognitive function test (passkey, SSO, ...) or an
assistive mechanism such as autofill is available, and that needs a human. A
field with no attribute (`autocompleteStatus: 'missing'`) stays in `details` but
is not reported: password managers usually infer the purpose from the control
type, so it does not stop them the way "off" does; a field with only "on" is
treated the same way. If the field's name matches the 1.3.5 patterns,
`autocomplete-audit`'s `autocomplete-missing` may report it; a field that
matches neither is reported by neither check. Pasting is measured by pasting a
short text (`details.pasteTest.probe`) with the keyboard into each visible,
editable password / verification code field. The field's value is never
recorded (a page may put a real password back); only whether the value after
pasting matched the pasted text (`valueAfterPaste`) is kept. **The measurement
grants clipboard permissions to the caller's context, overwrites the clipboard
and briefly opens a helper page** (field values are put back, except for a field
whose paste timed out; state the page changed in response to `input` events is not; use `paste: false` when reusing
the same page. The CLI uses a fresh context per check, so it is not affected).
The method was verified on Chromium; where the permission or the paste does not
work, `pasteTest.status` is `unavailable` and the fields are reported as
untested (`incomplete`). A field with no autocomplete of its own inherits
`autocomplete="off"` from its form (`details.fields[].formAutocomplete`; the
field's own value wins). If a script moves focus away so that the target field
is not focused, nothing is pasted and the field is reported as untested
(`error: 'focus-moved'`, `incomplete`). A handler that never returns is stopped
through CDP. Invisible or non-editable fields are not measured (`incomplete`). Fields inside
iframes and shadow roots, forms that appear only after clicking a sign-in
button, and custom CAPTCHAs without `captcha` in their markup are not found.

`runPointerGestureCheck` (2.5.1 and 2.5.7, `a11y-skills/pointer-gestures` and `a11y-skills/dragging-movements`) takes an already-navigated `page`. One check lists elements that may be operated by dragging, swiping or multiple fingers and reports them as `incomplete` candidates under both rules. It picks up `draggable="true"`, `dragstart` / `drop` listeners, elements with both a press and a move listener, listeners that look at multiple touches (`touches.length` etc.), custom `role="slider"` widgets, and markup of sortable lists, carousels and maps, in the document and in open shadow roots (`shadowHosts` + `selector`). Elements with only a move listener, and delegation roots with listeners for 20 or more event types, are not candidates; the latter are recorded in `details.delegationRoots` and reported as one page-level manual-check node per rule. Multipoint and drag listeners on `window` / `document` become page-level nodes. A human verifies that a single-pointer alternative exists, or that the gesture is essential. Listeners are read through CDP, so this is **Chromium only**; elsewhere candidates come from attributes and widget markup only and a manual-check node is added. No events are sent and the page state is not changed. Gestures built on delegation, move listeners added to `document` after the press, and anything in iframes are not found, and nothing is dragged to see whether something moves. At most 200 candidates per criterion are kept and at most 1000 elements with listeners are examined.

For 1.4.2 (`a11y-skills/auto-play-audio`), `runAutoPlayDetection` records
whether every `<audio>` / `<video>` in the page and its iframes (nested frames
and shadow roots included) is playing, unmuted, with volume above 0 and a
playback rate above 0: when the check starts, with each screenshot (about
every 2 seconds), and on every play / pause / ended / volumechange /
ratechange event. Media added during the check is recorded from the moment
it is added (the document and open shadow roots are observed). Each recorded
state lasts until the next record, and the time with sound is added up as
`audibleSeconds`, so stopping or muting between screenshots does not erase
the time before it. Media removed from the DOM during the check stays in the
result with `removed: true` (its `target` is its document's `html`). When its
iframe is removed or its frame's content is replaced, the last record taken
before that stays with `documentRemoved: true`; its `target` is the nearest
remaining parent document's `html`, and the message names the original
frame's URL. Sound after that last record is not counted, but if the last
record was playing with sound, the time it kept playing is unknown, so it
goes to `incomplete` regardless of `audibleSeconds`. Media without
visible `controls` goes to `incomplete` when it was heard for more
than 3 seconds, or when it is playing with sound at the last check and will
keep playing for more than 3 seconds (`loop`, an endless stream, or more than
3 seconds of real time left at the current playback rate). Visibility uses
the size, `display`, `visibility` and `opacity` of the element and the iframe
elements above it, and its rendered ancestors (an assigned slot before the
DOM parent). An ancestor with overflow `hidden` / `clip` whose padding box
(inside its border) does not overlap the element makes it invisible;
`clip-path` (not `none`) or `clip` (not `auto`), a non-overlapping scroll
container, a fixed / absolute box that may escape the ancestor, or a
scaling, rotating or 3D transform that keeps the padding box from being placed
(a translation alone does not) makes visibility
undetermined (`incomplete`).
Partial clipping and off-screen position are not checked. Recording starts
when the check starts (after the page is opened), so sound before that is not
counted, and each check on the same page starts a fresh record.
Pause/mute controls found by name in the same frame are recorded but not
clicked to verify. A result's `target` lists the outer iframes, shadow hosts
and the element in order; each entry is looked up in the document (or shadow
root) opened by the entry before it.

Chromium blocks unmuted autoplay until the user interacts with the page, so
when you launch the browser yourself, pass the flag below. Without it, unmuted
media never starts and is reported as `incomplete` ("playback did not start").
The CLI launches with it.

```ts
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
});
```

`runFocusOrderCheck` (2.4.3, `a11y-skills/focus-order-visual` and
`a11y-skills/focus-order-dialog`) takes a `browser`. It presses Tab through the
main document once, records where each element sits, and reports moves against
the visual order as `incomplete` candidates: back up the page
(`backward-block`), backwards on one row (`backward-inline`), and long jumps
that return to where they started (detours). A move to the next column
(`column-wrap`) is not reported. The visual order is estimated with a simple
rule (top to bottom, along the reading direction within a row (right to left
for `rtl`), and back up means the next column), so card grids, horizontal
scrolling and vertical writing can be misjudged. Elements that are or sit
inside `position: fixed` / `sticky`, and elements without a size, are not
compared (`details.skippedTransitions`). While focus is inside an iframe the
iframe's box is the position and the order inside is not examined; only open
shadow roots are entered. When the walk could not be finished (limit, timeout,
navigation) a node says the rest was not compared, so the rule is never
`passes`. Dialogs are tried only from triggers with `aria-haspopup="dialog"`,
an `aria-controls` pointing at a dialog, `commandfor` + `command="show-modal"`
or a common library's `data-*` attribute. **It reloads the page, presses Enter
on each trigger and Escape (or a close button) to close**, so a trigger that
also submits or navigates can send requests (the CLI always tries up to 10 triggers;
with the function API, `maxDialogTriggers: 0` presses no trigger, though
triggers are still collected and counted). Candidates are modals that do not move focus inside when
opened, or do not return it to the trigger when closed (`incomplete`, since a
different place can be right). Tab cycling inside the modal is not examined.
It accepts `timeBudgetMs` (default 60 s) and `maxTabPresses` (default 300).
The position analysis is exported as the pure function
`analyzeFocusOrder(points, { viewport, direction })`. With the
`details.allElements` of `runFocusIndicatorCheck`, pass
`allElements.filter(r => r.tabStep !== null && r.frame === null)` sorted by
`tabStep`, each with `positioning: 'flow'` added (fixed / sticky cannot be told
apart, so false positives increase).

`runPointerCancellationCheck` (2.5.2, `a11y-skills/pointer-cancellation`) takes
a `browser`, creates its own contexts, and when a press navigates the page it
restarts in a fresh context and skips the elements already tried. To each
operable element (those with a press listener, those with an inline
`onpointerdown` etc., and buttons, links and the like, in the document and open
shadow roots) it **dispatches synthetic** down-events only (`pointerdown`, then
`mousedown`) and never releases. An element where a navigation, new window,
dialog, focus move (other than to the pressed element itself) or DOM change
(excluding the `style` attribute) follows is an `activated-on-press` candidate;
one that has only a press listener (no release or click listener on the element
itself) and showed no visible change is a `press-only-listener` candidate. Both
are `incomplete`; a human checks whether the function runs on release, can be
aborted or undone, or whether the down-event is essential. On a page that
changes its DOM on its own, DOM changes are not used as evidence
(`details.domObservation`); a handler that never returns is cut off after 5 s
per step, the context is closed and the element is reported as untested
(`incomplete`). **Because the events are dispatched, page scripts run**: a page
that submits or saves on the down-event may really do so (handlers that check
`isTrusted` do not react, and `touchstart` is not sent). Listeners are read
through CDP, so this is **Chromium only**; elsewhere there is no listener
evidence and a manual-check node is added. After each press the check waits
`settleMs` (default 150 ms) for a change; a reaction that comes later is missed
or may be reported on the next pressed element. Delegation roots (listeners for 20
or more event types) and press listeners on `window` / `document` cannot be
attributed to elements, and elements without an interactive role or inline
handler are not pressed, so each adds a page-level manual-check node and makes
the rule `incomplete` (`details.delegationRootCount`, `details.pageListeners`).
Elements in iframes and closed shadow roots are not examined. At most 100 elements are pressed, within a 60 s
budget (`timeBudgetMs`).

`runNonTextContrastCheck` (1.4.11, `a11y-skills/non-text-contrast-boundary` and
`a11y-skills/non-text-contrast-icon`) takes a navigated `page`. From computed
styles it measures the contrast of the **border and fill** of inputs,
`textarea`, `select`, checkboxes, radio buttons and switches against the color
around them, and of the **icon color** of buttons without text (inline SVG
`fill` / `stroke`, text color of `::before` / `::after`) against its background.
Ratios below 3:1, and anything that cannot be measured, are `incomplete`
candidates (`details.components[].status`: `low` / `no-boundary` /
`undetermined`). A component passes when any one of its border or fill reaches
3:1. Colors are painted on a 1x1 canvas in Chromium and read back as sRGB, so
`oklch()` and `color-mix()` work. The threshold is compared on the unrounded
ratio and displayed rounded down (2.996 shows as 2.99). Native checkboxes and
radio buttons drawn by the browser (`appearance` is not `none` and
`accent-color` is `auto`) are an exception of 1.4.11 (a user agent control
whose look the author did not change), so they are neither measured nor
reported (`status: 'user-agent'`); with `accent-color` they are `undetermined`.
When a color cannot be decided the component is `undetermined`, never `pass`,
and `undeterminedReason` says why: `background-image` (image or gradient),
`opacity`, `filter` (`filter` / `backdrop-filter` / `mix-blend-mode`),
`out-of-flow` (below a background-less absolute / fixed element),
`color-scheme` (dark without a background; `light dark` follows the browser
preference), `accent-color`, `svg-paint-server`,
`image-icon` (an image or a CSS background image), `mixed-icon-colors` (an icon with parts above and below 3:1),
`too-many-icon-parts` (more than 20 elements), `svg-use` (an SVG `<use>` whose
target sets its own colors, or an external file), `visually-hidden` (a native
control hidden with opacity or sr-only CSS; check the custom control drawn in
its place), `no-icon-color` (an icon with no readable color) and `svg-overlap` (an SVG where a
shape is drawn over a filled shape). Parts that are not drawn (`display: none`, ...) are not counted as icon
sources, and sr-only text does not count as visible text. Only the look at load time is seen, not
hover, focus or checked states. The outer color comes from ancestor
backgrounds; overlaps by non-ancestors (`z-index`, ...) are not seen. Borders
drawn with `box-shadow` / `outline` are not measured (`otherVisuals` records
that they exist). Parts inside a component (check mark, knob), charts and
graphics, and iframes / shadow roots are not examined. Up to 300 components are
measured; the rest are counted in `componentCounts` and a manual-check node is
added. The color helpers `contrastRatio`, `compositeOver`, `compositeLayers`,
`relativeLuminance`, `floorRatio` and `toHexColor` (arguments are `{ r, g, b }`
with 0-255 channels) are exported too.

`runCharacterKeyShortcutCheck` (2.1.4, `a11y-skills/character-key-shortcut`) takes a `browser` and
creates its own contexts. It puts focus on `<body>`, **actually presses** the 94 printable ASCII characters
(space excluded) one at a time (characters that need Shift on a US layout, `A`-`Z` and the shifted symbols, are sent with Shift held, so `e.code` and `e.shiftKey` match), and reports the keys that cause a navigation, a new window, a dialog, focus
moving, a DOM change, scrolling or `preventDefault()` as `incomplete` candidates (`details.reacted`). A DOM
change counts only when it is at least twice the largest amount counted over ten windows of the same length with no key pressed
(`baselineDomMutations`, about a second) plus 3. Whether the shortcut can be turned off or remapped, or works only while a
component has focus, is for a human to verify. The key listeners on `window` / `document` / `<html>` / `<body>`
(the only objects a key event from `<body>` reaches) are read first through CDP (`details.listeners`); when there
is none, no key is sent and the rule is inapplicable (`keyProbe: 'skipped-no-listeners'`). CDP is
**Chromium only**: elsewhere there is no listener evidence and every key is pressed. After a key that reacted,
the remaining keys are pressed in a fresh context (at most `maxReloads` times, default 30; a navigation that commits after `settleMs` is noticed before the next key and recorded on the previous key; a same-document `history.replaceState()` is not a navigation; a page that takes focus back after `blur()` leaves its keys untested as `focus-not-on-body`; `preventDefault()` is seen on keydown, keypress and keyup; a bare
`preventDefault()` does not reload). `keys` narrows what is pressed; `timeBudgetMs` (default 60 s) and `settleMs`
(default 100 ms) are accepted. Known limitations: keys are pressed only with focus on `<body>`, so shortcuts
that work only while a component has focus (an exception of 2.1.4) and a keydown on a wrapper of the whole app
(React 17+ `#root`, ...) are missed; a reload happens only after a visible reaction, so a key that changes only internal state (silently disabling shortcuts, say) leaves the next keys pressed in that state and their reactions can be missed, and the second key of a two-stroke shortcut (`g` then `i`) can be reported as a shortcut of its own (an extra candidate for a human); pass a single key in `keys` to check a suspect one alone (reloading per key is not done: it costs 0.6 s or more each, and 94 keys exceed the time budget); listeners added after the first action are not found; a page that keeps
rewriting its own DOM can hide small changes. Pages whose shortcuts delete or submit may have side effects
because real keys are pressed.

`runContentOnHoverCheck` (1.4.13, `a11y-skills/content-on-hover-dismissible` / `-hoverable` / `-persistent`)
takes a `browser` and creates its own contexts. It collects the elements that may show content (triggers)
from two sources only: (1) CSS selectors that contain `:hover` / `:focus` / `:focus-within` / `:focus-visible`
followed by a combinator (`.menu:hover > .sub`; a rule such as `.btn:hover` that only restyles the element
is ignored), and (2) elements that have a `mouseenter` / `mouseover` / `pointerenter` / `pointerover` /
`focus` / `focusin` listener **on the element itself** (read through CDP, so **Chromium only**). Elements
with only `title` / `aria-describedby` / `aria-haspopup` are not triggers. Listeners attached to `window` /
`document` / `<html>` / `<body>`, or to an element with 20 or more event types (a framework root such as
React's), serve elements that cannot be told apart, so they are not tried: they are recorded in
`details.delegationRoots` and each of the three rules gets one page node (a human hovers and focuses the
page's controls to check them). With no trigger and no delegation root nothing is operated (inapplicable).
Each trigger is hovered and focused (the trigger itself, or its first focusable descendant), the
visible elements before and after are compared, and the outermost newly visible elements are the content. For
content that appears it measures (1) whether it is still visible after `persistMs` (default 3 s), (2) whether
Escape, pressed without moving the pointer or focus, hides it (hiding it while moving focus counts as a
failure too), and (3) for hover, whether it is still visible after showing it again and moving the pointer to
the center of the content. A failed condition is `incomplete`: content that reports an input error, or that
does not obscure or replace other content, need not be dismissible, so a human checks the exceptions. After
each trigger the pointer goes to a corner, focus is blurred and Escape is pressed; the page is reloaded in a
fresh context (at most `maxReloads` times, default 10) only when the content is still visible. It accepts
`settleMs` (default 400 ms), `persistMs`, `maxTriggers` (default 30) and `timeBudgetMs` (default 120 s).
What could not be examined (cross-origin style sheets, the trigger or listener limits, no CDP outside
Chromium) is reported as a page node on all three rules, even with no trigger. Known limitations:
attribute-only elements are not triggers; content shown by rules of cross-origin style sheets is missed;
elements inside iframes are not looked at, and visible elements inside shadow roots that have hover or focus listeners are counted and reported (`shadowTriggersSkipped`) but not tried; content shown through
delegated listeners is not measured; content that only changes inside an element that was already visible,
is shown with `opacity` or `transform` alone, or is drawn on a canvas is not found; dismissal is tried with
Escape only; when the trigger is not focusable only its first focusable descendant is focused; "stays" is
judged over `persistMs` only; the pointer moves straight from the trigger to the center of the largest new
element, and the pointer is not tried on content that disappeared by itself. It really focuses elements, so a
page that navigates on focus is recorded in `untested` as `navigated`. It does not click.

`runPageSnapshot` (no verdict) takes a `page` and, when given a `targetUrl`, opens it itself (without one,
the page is taken as it is). As material for an agent or a person judging the criteria that need the
page's structure (2.4.1 headings and landmarks, 2.4.2 title, 3.1.1 lang, and 3.2.3 / 3.2.4 / 3.2.6 by
comparing pages), it writes the following to `page-snapshot-result.json`. The four buckets are always
empty and the summary counts are 0, so the CLI exit code does not change.

- `snapshot`: the string from `page.locator('body').ariaSnapshot()`, neither modified nor truncated (its
  length is `snapshotLength`). Open shadow roots are included; an iframe is just a `- iframe` line.
- `title` (`document.title`), `lang` (the `lang` attribute of `<html>`: `null` when absent, `""` for
  `lang=""`), `requestedUrl` (the `targetUrl`, or `null` without one) and `finalUrl` (after redirects),
  and `viewport` (width and height).
- `frames`: `{ index, parentIndex, title, url, snapshot, error }` for each iframe the snapshot shows as a
  `- iframe` line, in document order with shadow roots expanded, each nested iframe right after its
  parent. Frames with `parentIndex: null` match the `- iframe` lines of the page's `snapshot` in order,
  and frames with `parentIndex: k` match those of `frames[k].snapshot`. Cross-origin iframes are read
  too. An iframe whose content cannot be read has `snapshot: null` and the reason in `error`, and its
  own iframes are not followed (each iframe is given 5 s). Iframes the snapshot does not show
  (`display: none`, inside `aria-hidden`, ...) are left out; a zero-size iframe is shown, so it is in.

To compare several pages, use a separate `--output-dir` per page (or `outputFile` / `outputPath` with
the function).

## Install

```sh
npm install -D @a11y-skills/audit @playwright/test @axe-core/playwright
```

`@playwright/test` and `@axe-core/playwright` are **peer dependencies**.

`runAutoPlayDetection` additionally needs `pixelmatch` and `pngjs` (declared as
**optional dependencies**, installed by default). They are loaded lazily, so
the other nine checks work even if you install with `--omit=optional`:

```sh
npm install -D pixelmatch pngjs   # only if you use runAutoPlayDetection
```

> ESM only. This package does not ship a CommonJS build; import it from ESM
> (or a TypeScript project compiled to ESM).

## CLI

Run all 22 checks against a URL with a single command — no test runner needed.

```sh
npx -y @a11y-skills/audit --url https://example.com
```

Peer dependencies (`@playwright/test`, `@axe-core/playwright`) are pulled in
automatically by npm 7+. Install Chromium on first use:

```sh
npx playwright install chromium
```

### Flags

| Flag | Default | Description |
| --- | --- | --- |
| `--url <url>` | `TEST_PAGE` env | Target URL. `--url` takes priority over the env var. If neither is set, usage is printed and the process exits 2. |
| `--checks <list>` | `all` | Comma-separated check names (see list below). |
| `--output-dir <dir>` | `./a11y-audit-results` | Directory for result JSON files. |
| `--screenshot` | off | Enable focus-indicator screenshot. |
| `--concurrency <n>` | `4` (capped at the CPU count) | How many checks run at once in the same browser. `1` runs them one after another and each check also prints its own summary to stdout. With 2 or more, the checks' own summaries are suppressed and only the CLI's `[name] DONE …` lines and the result JSON remain. If a time-sensitive check (time-limit / auto-play / motion-actuation) gives unstable results, reproduce with `--concurrency 1`. |
| `--list-checks` | — | Print check names and exit 0. |
| `--version` | — | Print version and exit 0. |
| `--help` | — | Print usage and exit 0. |

### Available check names

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
keyboard-trap-check
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
content-on-hover-check
page-snapshot
```

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | All checks completed, no violations found. |
| `1` | All checks completed, at least one violation found. |
| `2` | Runtime error — bad arguments, missing peers, navigation failure, or check crash. |

Completed-check JSON is always written even when the exit code is non-zero.

### Peer requirements

`@playwright/test >=1.50.0` and `@axe-core/playwright >=4.10.0` must be
resolvable. If they are not found, the CLI exits 2 with an install hint.
`--list-checks`, `--help`, and `--version` work without peers.

### `auto-play-detection` and optional deps

`auto-play-detection` needs `pixelmatch` and `pngjs`. If they are absent, that
check is skipped with a `SKIPPED` message and does not affect the exit code.
The other nine checks continue normally.

### GitHub Actions

Copy-paste workflow for a manually triggered audit. Violations fail the job
(exit code 1); add `continue-on-error: true` to the audit step if you want the
result to be informational only.

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

- Add `push` / `schedule` triggers (with a hardcoded URL) to run the audit as
  a recurring gate.
- Result JSON files (and the focus-indicator screenshot when `--screenshot`
  is set) are uploaded as a build artifact.
- To speed up repeat runs, cache `~/.cache/ms-playwright` keyed on the
  installed `@playwright/test` version — see this repository's `ci.yml` for
  the pattern.

## Usage — function API (recommended)

You navigate the page; the function runs the check, writes a result JSON, and
returns the parsed result.

```ts
import { test } from "@playwright/test";
import { runAxeAudit } from "@a11y-skills/audit/playwright";

test("axe audit", async ({ page }, testInfo) => {
  await page.goto("https://example.com");
  const result = await runAxeAudit({
    page,
    outputDir: testInfo.outputDir,   // where to write axe-result.json
    // outputFile: "axe-result.json", // optional override
    // tags: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
  });
  expect(result.summary.violationCount).toBe(0);
});
```

The focus indicator check owns its browser context (it restarts in a fresh
context when focus triggers a navigation), so it takes a `browser` and a
`targetUrl` instead of a `page`:

```ts
import { runFocusIndicatorCheck } from "@a11y-skills/audit/playwright";

test("focus indicators", async ({ browser }, testInfo) => {
  const result = await runFocusIndicatorCheck({
    browser,
    targetUrl: "https://example.com", // or set TEST_PAGE env var
    outputDir: testInfo.outputDir,
    screenshot: true,                 // default: false
    // contextOptions: { locale: "ja-JP" }, // forwarded to browser.newContext()
  });
  expect(result.details.elementsWithoutFocusStyle).toBe(0);
});
```

`runFocusIndicatorCheck`, `runKeyboardReachabilityCheck`,
`runKeyboardTrapCheck`, `runChangeOnInputCheck`, `runCharacterKeyShortcutCheck` and `runContentOnHoverCheck` accept `createContext` instead of `browser`. Use it to
attach your own guards (such as a `context.route` URL check) to every context
the check uses:

```ts
const result = await runKeyboardTrapCheck({
  createContext: async () => {
    const context = await browser.newContext({ locale: "ja-JP" });
    await context.route("**/*", guardRequest); // your own check
    return context;
  },
  targetUrl: "https://example.com",
});
```

- If both `createContext` and `browser` are given, `createContext` wins. Passing neither throws.
- `contextOptions` is not applied when `createContext` is used; set options inside the function.
- Return a **new** context on every call (the check closes each one when done; the focus indicator check calls it again on every retry).

To match results to your own elements, pass an attribute name (e.g.
`data-test-id`) as `echoAttribute` to `runFocusIndicatorCheck`. Every record
that points at an element (`allElements`, `issues`, the `element` and
`obscuredBy` in `focusObscuredIssues`, the `element` in `onFocusViolations`)
then carries the attribute's value as `echo` (`null` when the element lacks it;
no `echo` at all when the option is omitted). The check opens the page in fresh
contexts, so the attribute must already be on the element when the page loads
(page markup, or `addInitScript` on the context returned by `createContext`).
The name is passed to `getAttribute` as a plain string; an invalid name throws
an `Error`.

The focus indicator check's element records (`allElements`, `issues`, and the
`element` in `focusObscuredIssues` and `onFocusViolations`) carry `frame` and
`shadowHosts`, which say which document the element is in.

- `frame`: `null` for the main frame. For an element inside an iframe it is
  `{ url, selector }`: the iframe document's URL and the iframe element's
  selector in its parent (`selector` is `null` when the parent is cross-origin).
  For nested iframes it describes the innermost one only.
- `shadowHosts`: for an element inside an open shadow root, the hosts'
  selectors, outermost first; `[]` otherwise. `selector` is relative to that
  shadow root (the inner element is recorded, not the host).
- `rect` of an element in an iframe is relative to that iframe's document, not
  the main page.
- `visibility` (`allElements` only): whether the element is on screen, measured
  at the moment it received focus (an element measured as not visible is
  measured again after the wait that follows each Tab). `{ visible: boolean | null,
  reason }`; `reason` has a value only when `visible` is `false`
  (`ancestor-overflow`: an ancestor's `overflow` cuts it off,
  `ancestor-opacity`: an ancestor has `opacity: 0`, `own-opacity`: the element
  has `opacity: 0`, `outside-viewport`: outside the document's left or top
  edge). It is `null` while the element or a rendered ancestor is
  running an animation or transition on a property that can change how it shows
  (`opacity`, size, position, `transform`; for example a menu that opens on
  focus; transitions of only `outline`, shadows or colors are ignored), when a scroll
  container or a scaling / rotating transform keeps the clipping from being
  decided, when `clip-path` / `clip` is present, when a clipping ancestor has a non-zero
  `overflow-clip-margin`, or when the element's size is 0 (for example under
  `scale(0)`). The right and bottom edges
  are not checked because the browser scrolls there on focus. This is a record
  only; it does not feed the 2.4.7 `issues`. An element in an iframe is judged
  inside its own document only; whether the iframe itself is visible is not
  checked. An element measured as not visible is measured again after the wait
  that follows each Tab (`navigationSettleMs`), only if it still has focus
  then. A page that shows it later than that can still be recorded as not
  visible; raise `navigationSettleMs` in that case. A `position: fixed` element is judged against all four
  viewport edges, and in `dir="rtl"` the right side is the unreachable one.
  With a `writing-mode` other than `horizontal-tb`, being off screen gives
  `null`.
- Closed shadow roots are not seen (the host is recorded). Fixed content outside
  an iframe is not detected as hiding an element inside it (obscuring is judged
  per document).

**Before/after focus screenshot comparison (`screenshotDiff`):**

Pass `screenshotDiff: true` to `runFocusIndicatorCheck` to compare screenshots
of the area around each element (its rect plus an 8px margin) taken before and
after it gets focus. Every record in `allElements` and `issues` then carries
`visualDiff: { diffRatio, rect }`: `diffRatio` is the share (0-1) of pixels in
the compared area that changed, and `rect` is the bounding box of the changed
pixels in page coordinates (`null` when nothing changed). Use it to catch cues
that computed styles cannot show (`::before` / `::after`, a parent's
`:focus-within`, another element).

- Default `false`: without the option no `visualDiff` is added and behavior is unchanged. Screenshots are taken on every Tab press, so the walk is slower, and that time counts toward `timeBudgetMs`.
- The baseline is one full-page capture taken before the Tab walk starts, with nothing focused. Annotation boxes and the styles kept on earlier elements are hidden while capturing.
- Classification does not change. An element with no computed-style change stays `incomplete` under `focus-visible`; the message says the screenshot differs around it (a cue may exist) or that it shows no visual change either.
- Without the optional `pixelmatch` and `pngjs`, a warning is printed instead of an error, the comparison is skipped and `visualDiff` is `null`. It is also `null` for an element that could not be captured.
- **Limits:** fixed / sticky content, animations, video, and anything that changes with scroll position or time can show up as a difference that is not a focus indicator. An element already focused at load (autofocus) has no baseline to differ from. A difference means "a cue may exist"; verify it by eye. Elements inside an iframe are not compared; their `visualDiff` is `null`.

### Output location resolution

For every check:

1. `outputPath` — full path (mutually exclusive with `outputDir`/`outputFile`).
2. otherwise `outputDir` → `A11Y_OUTPUT_DIR` env → `process.cwd()`, joined with
   `outputFile` → the check's default filename.

Screenshots (when enabled) are written next to the result file. `outputFile`
must be a bare filename; use `outputPath` for an absolute location.

### Calling from a server

Every check accepts options that turn off its side effects. The defaults keep
the existing behavior.

| Option | Default | Effect |
|---|---|---|
| `writeResult` | `true` | When `false`, no result JSON is written; the result is only returned. With `screenshot: true` the image is still written per the resolution order above. |
| `quiet` | `false` | When `true`, nothing is printed to the console. |

Invalid output options (e.g. `outputPath` together with `outputDir`) throw
before the check starts, even with `writeResult: false`.

`runTargetSizeCheck` also accepts:

| Option | Default | Effect |
|---|---|---|
| `resolveAccessibleNames` | `true` | When `false`, skips the per-target `locator.ariaSnapshot()` call and sets every `accessibleName` to `null`. On a page with 300 links: ~1.1 s → ~0.06 s. |

```ts
const result = await runTargetSizeCheck({
  page,
  writeResult: false,
  quiet: true,
  resolveAccessibleNames: false,
});
```

Warnings that `quiet` hides but that affect how far the result can be trusted
are kept in the result JSON:

- keyboard-trap: `details.tabWalkCapped: true` when the Tab walk hit the press
  limit.
- focus-indicator: `details.interrupted: true` when navigation on focus
  exhausted the retries and some elements were not tested.
- focus-indicator: `details.unidentifiedNavigation: true` when focus caused a
  navigation whose element could not be identified and no later attempt
  identified it (including when retries ran out or a limit stopped the walk).
  If `onFocusViolations` is empty, `a11y-skills/no-context-change-on-focus` is
  then `incomplete` instead of `passes`. On Chromium, a navigation started
  while an element's `focus` / `focusin` events are being handled is
  attributed through the page's `navigate` event (Navigation API), which
  records the element focused at that moment, so the element is identified
  regardless of `navigationSettleMs` or machine load. A navigation started
  later (e.g. by a timer) is still looked for within the settle window.
- focus-indicator / keyboard-reachability: see "Time and Tab-press limits"
  below for what happens when a limit is hit.

**Time and Tab-press limits:**

`runFocusIndicatorCheck`, `runKeyboardReachabilityCheck` and `runFocusOrderCheck` accept
`timeBudgetMs` (milliseconds, positive finite number) and `maxTabPresses`
(positive integer). Zero, negative or non-numeric values throw.

| Check | `timeBudgetMs` default | `maxTabPresses` default | When a limit is hit |
|---|---|---|---|
| focus-indicator | no limit | no limit | `details.aborted: { reason: 'timeout' \| 'tab-limit', url, recordedCount, focusableCount }`: `recordedCount` elements were tested out of `focusableCount` focusable ones. Time and presses are counted across 3.2.1 restarts. Separate from `interrupted` (retries exhausted) |
| keyboard-reachability | 60 s | 600 | time: `details.aborted.reason: 'timeout'`; presses: `details.tabWalkCapped: true` |
| focus-order | 60 s | 300 | time: `details.aborted.reason: 'timeout'` and `tabWalk.ended: 'timeout'`; presses: `details.tabWalk.ended: 'tab-limit'` (`capped: true`). Either way the rest of the order was not compared, so the rule is `incomplete` |

**Running checks concurrently:**

- Give each request its own `outputDir`. Screenshots are written as the output
  directory plus a fixed file name, so changing only `outputFile` still
  collides.
- Give each request its own page (and browser context). Checks change page
  state such as the viewport and the current URL.
- `runAutoPlayDetection` always writes frame screenshots and diff images to
  `outputDir` and reads them back to decide; `writeResult: false` only skips
  `detection-result.json`.

> **Reflow note.** `runReflowCheck` sets the narrow viewport itself, so it works
> on an already-navigated page. For pages that read the viewport only at load
> time, set the viewport *before* `page.goto(...)` for results identical to the
> legacy script (the compatibility entry does this).

## Usage — compatibility test entries

If you prefer not to write test bodies, re-export the bundled entries from a
one-line local spec. The entries call `test(...)` at import time and read
`TEST_PAGE` (target URL) and `A11Y_OUTPUT_DIR` (output directory), capturing
screenshots — reproducing the legacy script behavior.

```ts
// tests/a11y/axe.spec.ts
import "@a11y-skills/audit/test-entries/axe-audit";
// tests/a11y/focus.spec.ts
import "@a11y-skills/audit/test-entries/focus-indicator-check";
// tests/a11y/reflow.spec.ts
import "@a11y-skills/audit/test-entries/reflow-check";
// tests/a11y/target-size.spec.ts
import "@a11y-skills/audit/test-entries/target-size-check";
// ...also: text-spacing-check, zoom-200-check, orientation-check,
// autocomplete-audit, time-limit-detector, auto-play-detection,
// redundant-entry-check, motion-actuation-check, change-on-input-check,
// accessible-authentication-check, pointer-gesture-check, focus-order-check,
// pointer-cancellation-check, non-text-contrast-check,
// character-key-shortcut-check, content-on-hover-check, page-snapshot
import "@a11y-skills/audit/test-entries/text-spacing-check";
```

```sh
TEST_PAGE=https://example.com A11Y_OUTPUT_DIR=./a11y-results npx playwright test
```

> **Why not `testMatch` into `node_modules`?** Playwright excludes
> `node_modules` from test collection, so pointing `testMatch` at
> `**/node_modules/@a11y-skills/audit/dist/test-entries/*.js` finds no tests.
> The one-line re-export specs above are the supported way to run the entries.

## Result format

Every check returns — and saves as JSON — the same axe-style envelope:

```ts
interface AuditCheckResult<TDetails> {
  source: CheckSource;            // e.g. "reflow-check"
  url: string;
  timestamp: string;
  violations: NormalizedRuleResult[];   // confirmed findings
  incomplete: NormalizedRuleResult[];   // needs manual review
  passes: NormalizedRuleResult[];       // rules that ran and found nothing
  inapplicable: NormalizedRuleResult[]; // nothing to examine
  summary: { violationCount; incompleteCount; passCount; checkedNodes? };
  details: TDetails;              // check-specific evidence (measurements, screenshots, ...)
  disclaimer: { ... };
}
```

Each rule result is axe-shaped (`id` / `impact` / `description` / `help` /
`helpUrl` / `tags` / `nodes[]`, with `nodes[].target` / `html` /
`htmlTruncated` / `failureSummary`). Custom rules are namespaced
(`a11y-skills/focus-visible`, `a11y-skills/target-size-minimum`, ...) and
tagged with accurate WCAG version/level tags (`wcag2aa`, `wcag21aa`,
`wcag22aa`, `wcag247`-style SC tags).

**Classification is conservative.** A finding lands in `violations` only when
the detection has no blind spot and no WCAG exception can apply (on-focus
context change, text-spacing clipping, invalid autocomplete tokens). All other
detections — reflow/zoom overflow, meta refresh, orientation lock, missing
focus styles, undersized targets — are `incomplete`: treat that bucket as the
manual-review queue, not as noise.

To combine several checks for the same page into one view:

```ts
import { mergeNormalizedResults } from "@a11y-skills/audit";

const merged = mergeNormalizedResults([axeResult, reflowResult, targetResult]);
```

`mergeNormalizedResults` throws on URL mismatches, deduplicates nodes by
`target` + `failureSummary`, and resolves a rule appearing in several buckets
by priority (`violations > incomplete > passes > inapplicable`). Identical
selectors inside different frames or shadow roots are not distinguished.

## Result types & schemas

```ts
import type { AxeAuditResult, FocusCheckResult } from "@a11y-skills/audit/schemas";
import { RESULT_SCHEMAS } from "@a11y-skills/audit/schemas";
```

`RESULT_SCHEMAS` maps each check id to a hand-written JSON Schema
(draft 2020-12) for validating the `*-result.json` files at runtime. The
normalization mappers (`normalize*`) and `buildAuditResult` are exported from
the package root, so the buckets can be re-derived from a saved result's
`details` at any time.

## License

MIT
