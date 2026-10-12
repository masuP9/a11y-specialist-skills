# Changelog

All notable changes to `@a11y-skills/audit` are documented here. This project
adheres to [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- `change-on-input-check` (WCAG 3.2.2): new check, `runChangeOnInputCheck`
  (takes a `browser` or `createContext`, owns its contexts) and the CLI check
  name `change-on-input-check`. Rule `a11y-skills/no-context-change-on-input`
  (tags `wcag2a`, `wcag322`; always `incomplete`, because advice given
  beforehand makes the behavior conform and only a human can judge it). Changes
  each `select`, radio group, checkbox and text-like `input` / `textarea` in the
  main frame one at a time and records main-frame navigation, a new window,
  focus moving elsewhere (including auto-advance and a `change` handler moving
  focus) and dialogs in `details.findings`, one node each. After a navigation
  it restarts in a fresh context and skips the controls already tried
  (`details.restarts`); `settleMs`, `timeBudgetMs` and `maxControls` bound the
  walk (`details.aborted`). Values are put back through properties without
  events. Known limitations: only controls in the main frame's light DOM (no
  iframes, shadow roots, ARIA-only widgets); one value per control; changes
  made by handlers are not undone, so an earlier control can affect a later
  one; changes surfacing after `settleMs` and large content changes are not
  recorded; it really changes values and fires `change`, so pages that
  autosave or submit on change may send requests.
- `motion-actuation-check` (WCAG 2.5.4): new check, `runMotionActuationCheck`
  (takes a `page`; `simulate: false` skips the synthetic events) and the CLI
  check name `motion-actuation-check`. Rule `a11y-skills/motion-actuation`
  (tags `wcag21a`, `wcag254`; always `incomplete`, because a UI alternative and
  an off switch cannot be judged). `devicemotion` / `deviceorientation` /
  `deviceorientationabsolute` listeners on the main frame's `window` and
  `document` are listed through CDP (`DOMDebugger.getEventListeners`) in
  `details.listeners`, one node each. For event types with a `window`
  listener, synthetic events are dispatched and `details.simulation.results`
  records the DOM mutation count (plus `baselineDomMutations`, measured over
  an equally long window without events) and any navigation;
  `simulation.status` is `skipped-document-only` when listeners exist only on
  `document`; a handler that never
  returns is stopped with `Runtime.terminateExecution` (`error: 'timeout'`).
  Known limitations: Chromium only (elsewhere `listenerInspection:
  'unsupported'` and `incomplete`); iframes are not inspected; listeners added
  after a user action are not found; Generic Sensor API and camera / microphone
  motion detection are not inspected; synthetic events are `isTrusted: false`,
  so the page may show "no DOM change"; the simulation changes the state of the
  given page.
- `redundant-entry-check` (WCAG 3.3.7): new check, `runRedundantEntryCheck`
  (takes a `page`) and the CLI check name `redundant-entry-check`. Rule
  `a11y-skills/redundant-entry` (tags `wcag22a`, `wcag337`; always
  `incomplete`, because the 3.3.7 exceptions cannot be judged). Within the
  same form (the whole page for fields outside any form) and `section-*`, two
  or more fields with the same purpose (the `autocomplete` field name, or a
  purpose inferred from name / id / label / placeholder after removing scope
  words such as "shipping" / "billing" and confirmation words) form a group in
  `details.groups`; the second and later fields are the nodes. `kind` is
  `scoped` when the shipping / billing scope differs and `repeated`
  otherwise. Controls whose text suggests copying or selecting the earlier
  entry ("same as ...") are listed in the group's `copyControls`. Known
  limitations: multi-page flows (steps split across several pages) are out of
  scope; only fields in the same form are compared; the purpose is inferred by
  word matching and checkboxes / radios are not candidate fields;
  `copyControls` are matched by text and whether the value is actually copied
  is not verified; disabled / readonly fields count as earlier information
  (`fields[].editable` is `false`) but only editable fields after the first
  one are reported as re-entry; fields hidden at load time are counted; the exceptions
  (essential, security, no longer valid) cannot be judged, only password and
  one-time-code fields are excluded; shadow DOM and iframes are not inspected.
- `a11y-skills/auto-play-audio` (WCAG 1.4.2; tags `wcag2a`, `wcag142`;
  `incomplete`): `auto-play-detection` now records every `<audio>` /
  `<video>` in the page and its iframes (nested frames and open shadow roots
  included) when the check starts, with each screenshot, and on every play /
  pause / ended / volumechange / ratechange event, and from the moment media
  is added during the check (MutationObserver), into the new required
  `details.mediaElements` (with `frame` / `shadowHosts` like focus-indicator,
  plus `framePath`, `audibleSeconds`, `playbackRate`, `removed` for media
  removed during the check, and `documentRemoved` for media whose iframe was
  removed or whose frame was replaced, reported from its last record and
  flagged whenever that record was playing with sound, since how long it
  kept playing is unknown) and `details.unmeasuredFrames`. `audibleSeconds`
  adds up the time the media was playing, unmuted, with volume and playback
  rate above 0 (each record lasts until the next), so sound muted or stopped
  between screenshots, or a short loop, still counts. Media heard for more
  than 3 seconds, or playing with sound at the last sample and lasting more
  than 3 more seconds of real time (`loop`, endless, or remaining duration
  divided by the playback rate), whose `controls` are not visible (size,
  display, visibility and opacity of the element and its iframe elements;
  hidden when an overflow `hidden` / `clip` rendered ancestor's padding box
  does not overlap it, slots included; undetermined under `clip-path` /
  `clip`, a non-overlapping scroll container, an escaping fixed / absolute
  box or a transform; partial clipping and off-screen position not checked),
  or that requests autoplay but did not start, is a finding; pause/mute
  controls found by name in the same frame are listed in its message but are
  not clicked. Its `target` is the full path (outer iframes, shadow hosts,
  element; the document's `html` for removed media, or the nearest remaining
  parent document's `html` when the document itself went away). Recording
  starts when the check starts, not at page load, and is fresh for each
  check. Inapplicable when the page has no media.

### Changed

- The CLI launches Chromium with `--autoplay-policy=no-user-gesture-required`
  so unmuted autoplay starts and can be measured. Pages that autoplay video
  with sound now play it during every check (before, Chromium kept it paused).
  Library users who launch their own browser need the same flag for
  `auto-play-audio` to measure audio (see README).
- `a11y-skills/auto-play`: the message no longer asks to verify audio manually;
  audio is covered by `a11y-skills/auto-play-audio`.

### Fixed

- focus-indicator: `tabStep` is no longer `null` for an element in an iframe
  reached by Tab (or the main-page element reached from it), and `id` no
  longer repeats between the main page and its iframes. Both are now numbered
  on the Node side (the side that presses Tab), across all documents; `id` is
  the order in which records arrived (0-based), as before for single-document
  pages.

## 0.11.0 — 2026-10-13

**Heads-up** — `a11y-skills/focus-not-obscured` now reports only elements that
are fully hidden, and a new rule covers partly hidden ones. If you filtered on
the old rule, check both. focus-indicator records gain new required schema
fields (`frame`, `shadowHosts`, `fullyObscured`), and
`a11y-skills/no-context-change-on-focus` can now be `incomplete` when the
element that navigated the page could not be identified (see Fixed).

### Added

- focus-indicator: `screenshotDiff: true` compares screenshots of the area
  around each element before and after focus and adds
  `visualDiff: { diffRatio, rect } | null` to `allElements` and `issues`
  (absent when the option is off; `null` when the comparison could not be made,
  e.g. without the optional `pixelmatch` / `pngjs`, which only prints a
  warning). An element with no computed-style change but a screenshot
  difference stays in `focus-visible` `incomplete`, with a message that says a
  cue may exist. Off by default because it takes screenshots on every Tab press
  (counted toward `timeBudgetMs`). Fixed / sticky content and animations can
  cause differences that are not focus indicators.
- `a11y-skills/focus-not-obscured-enhanced` (WCAG 2.4.12, AAA; tags `wcag22aaa`,
  `wcag2412`; `incomplete`): reports every focused element that fixed/sticky
  content hides in part or in full.
- focus-indicator: each `details.focusObscuredIssues` record has
  `fullyObscured: boolean` (true when 99% or more of the element is covered).
  The JSON schema now requires it.
- focus-indicator: every record that points at an element (`allElements`,
  `issues`, `focusObscuredIssues[].element`, `onFocusViolations[].element`) has
  `frame` and `shadowHosts` (new required schema fields). `frame` is `null` for
  the main frame, otherwise `{ url, selector }`: the iframe document's URL and
  the iframe element's selector in its parent (`null` when the parent is
  cross-origin). `shadowHosts` lists the shadow hosts' selectors, outermost
  first (`[]` outside shadow DOM). `rect` of an element in an iframe is
  relative to that iframe's document.

### Changed

- focus-indicator now records the element inside an open shadow root instead of
  its shadow host, and `selector` is relative to that shadow root. Results for
  pages with shadow DOM change: the host record (usually `hasFocusStyle:
  false`) is gone, and the inner elements are recorded with their own focus
  style comparison.
- focus-indicator now compares focus styles for elements inside iframes and
  shadow roots. Before, they always had `hasFocusStyle: false` (no base style
  was captured), so they could be reported as missing a focus indicator.
  Elements in iframes also count toward the Tab walk now.

- `a11y-skills/focus-not-obscured` is now WCAG 2.4.11 only (`sc: ['2.4.11']`) and
  reports only records with `fullyObscured: true`.
- focus-indicator now records an element hidden by less than 20% too, so such
  elements appear in `focusObscuredIssues`, in `elementsWithObscuredFocus` and
  as 2.4.12 findings. Only overlaps under 8px² are still ignored.
- `obscuredRatio` counts the area covered by overlapping fixed/sticky elements
  once, instead of adding each element's overlap.

### Fixed

- focus-indicator: when focus on an element navigates the page and that
  element's focus report is lost in the navigation (seen on busy CI machines),
  the element focused before it is no longer recorded in `onFocusViolations`
  and skipped from later attempts (which also left it out of the 2.4.7
  check). Neither is a focus report from the page the navigation leads to
  (e.g. its autofocus field). The attempt now restarts without recording
  anything (#84).
- focus-indicator: new `details.unidentifiedNavigation` (optional boolean) is
  true when such a navigation's element was never identified, because retries
  ran out or `maxTabPresses` / `timeBudgetMs` stopped the restart. With no
  `onFocusViolations` (or with `interrupted: true` and none),
  `a11y-skills/no-context-change-on-focus` is now `incomplete` (one page-level
  node) instead of `passes` or `inapplicable`.

## 0.10.0 — 2026-10-12

**Heads-up** — `a11y-skills/auto-play` no longer carries `wcag142`, and its
recommendation texts no longer cite 1.4.2 (see Changed). New options are
additive; existing calls keep working.

### Added

- `focus-indicator-check`, `keyboard-reachability-check`, `keyboard-trap-check`:
  new `createContext` option (`() => Promise<BrowserContext>`) to create audit
  contexts yourself, e.g. to attach `context.route` guards. `browser` is now
  optional; one of the two is required. `contextOptions` is ignored with
  `createContext`.
- focus-indicator: each `FocusRecord` in `details.allElements` now has `tabStep`
  (which Tab press moved focus to it, 1-based; `null` for autofocus or scripted
  focus) and `rect` (`{ x, y, width, height }` in page coordinates at focus
  time), so the Tab order can be compared with the visual order (WCAG 2.4.3).
- `runFocusIndicatorCheck` and `runKeyboardReachabilityCheck` accept
  `timeBudgetMs` and `maxTabPresses` (invalid values throw). On
  focus-indicator, which has no limit by default, hitting one sets the new
  `details.aborted` (`reason: 'timeout' | 'tab-limit'`, `recordedCount`,
  `focusableCount`); `interrupted` keeps its meaning. On keyboard-reachability
  they override the previous fixed 60 s / 600-press limits.
- `runFocusIndicatorCheck`: new `echoAttribute` option. Every record that points
  at an element carries the value of that attribute as `echo` (`null` when the
  element lacks it), so results can be matched to the caller's own elements.

### Changed

- `focus-indicator-check` now also compares border color/width/style (per
  side) and text-decoration line/color/thickness/style before and after focus,
  so a focus cue made only of a border or an underline is no longer reported
  as "no computed-style change".
- Rule `a11y-skills/auto-play` no longer claims WCAG 1.4.2: its `sc` is now
  `['2.2.2']` and its `tags` no longer include `wcag142`. The detection only
  diffs screenshots and never inspects audio, so 1.4.2 is left to axe-core's
  `no-autoplay-audio` and manual review. Consumers that filter or count
  findings by `wcag142` will no longer see this rule there.
- `auto-play-detection`: the recommendation texts no longer cite 1.4.2.
  `(WCAG 1.4.2, 2.2.2)` is now `(WCAG 2.2.2)` and `(WCAG 1.4.2, 2.2.2, 4.1.2)`
  is now `(WCAG 2.2.2, 4.1.2)`. Consumers that match these strings need to
  update them.

### Fixed

- `focus-indicator-check`: an element whose focus is obscured is no longer
  reported once per retry when a 3.2.1 violation later in the Tab order
  restarts the check; only the last attempt's records are kept.

## 0.9.0 — 2026-10-11

**Breaking** — `AutocompleteIssue.expectedToken` and `matchedBy` can now be
`null`, and disabled / readonly fields are no longer checked. The public API is not yet stable in `0.x`, so this lands as a minor
release.

### Changed (breaking)

- `autocomplete-audit`: `AutocompleteIssue.expectedToken` is `string | null`
  and `matchedBy` is `'name' | 'id' | 'label' | 'placeholder' | null`. Both
  are `null` on an invalid issue whose field purpose could not be inferred
  from name / id / label / placeholder. Missing issues always have both.
- `autocomplete-audit`: disabled fields (including those in a disabled
  `fieldset`) and readonly fields are no longer checked, so they are reported
  neither as missing nor as invalid and are not counted in
  `totalFieldsChecked`.

### Added

- Rule `a11y-skills/autocomplete-invalid-unverified` (incomplete): an invalid
  autocomplete value on a field whose purpose could not be inferred. 1.3.5
  applies only when the field collects information about the user, so this
  needs a human to confirm. `a11y-skills/autocomplete-invalid` (violation)
  now covers only fields whose purpose was inferred. Both come from
  `details.invalidAutocomplete`; `expectedToken === null` tells them apart.

### Fixed

- `autocomplete-audit`: the autocomplete value is now checked on every field
  that has one, not only on fields whose purpose was inferred. A misspelled
  value such as `autocomplete="emial"` on a field labelled "連絡先メール" was
  not reported before (it is now reported under
  `autocomplete-invalid-unverified`).
- `autocomplete-audit`: the whole value is checked against the HTML autofill
  grammar instead of only its last token: an optional `section-*`, an
  optional `shipping` / `billing`, a field name (a contact field name — `tel*`,
  `email`, `impp` — may be preceded by `home` / `work` / `mobile` / `fax` /
  `pager`), an optional `webauthn`, in that order and each at most once;
  `on` / `off` only alone. Values such as `email name` or `mobile name` are
  now reported as invalid. Tokens are compared ASCII case-insensitively, so
  `OFF` now counts as `off` for the missing check. Only ASCII whitespace
  separates tokens, so a non-breaking space (e.g. `work&nbsp;email`) makes
  the value invalid. A whitespace-only value (e.g. `autocomplete=" "`) on a
  field whose purpose was inferred is now reported as missing instead of
  invalid.
- The invalid message and the CLI output omit the "Expected" part when the
  purpose was not inferred.
- Known limitation: whether a field name suits the control type (e.g. `email`
  on a checkbox) and whether `webauthn` is used on `input` / `textarea` only
  are not checked.

## 0.8.2 — 2026-10-08

### Fixed

- No navigation waits for `networkidle` any more, which never comes on pages
  with constant analytics traffic (navigation timed out after 30s). The CLI's
  pre-navigation, every check that navigates itself (`time-limit`,
  `orientation`, `focus-indicator`, `keyboard-trap`, `keyboard-reachability`,
  `zoom` with a target URL) and the `test-entries/*` wrappers now wait for
  `load` and give network idle at most 5s, like the capture service.

## 0.8.1 — 2026-10-06

### Fixed

- `target-size-check`: a small target that only passes under a
  `position: fixed` element while scrolling (e.g. a footer link under a fixed
  header) no longer fails the spacing exception. A fixed and a normal-flow
  target are now compared at the scroll position where they are farthest
  apart: scroll position 0 when the fixed target is above (a link just below a
  fixed header still fails), the maximum scroll when it is below (a footer
  link still close to a back-to-top button at the bottom of the page, or on a
  page that cannot scroll, still fails). Fixed targets are still compared
  with each other.

## 0.8.0 — 2026-09-29

### Added

- **`keyboard-reachability-check` (WCAG 2.1.1)** — `runKeyboardReachabilityCheck`
  (takes a `browser`) and the CLI check name `keyboard-reachability-check`.
  It presses Tab through the page, arrow keys inside each composite widget it
  could enter (tablist, menu, menubar, listbox, radiogroup, toolbar, tree,
  native radio groups), and follows `aria-activedescendant`. Operable elements
  that no path reaches are reported under the new rule
  `a11y-skills/keyboard-unreachable` (always incomplete) with a `reason` and a
  `confidence`.
- `details.elements` lists every operable element with how it was reached
  (`tab` / `arrow` / `activedescendant` / `unreachable` / `not-evaluated`),
  for consumers that import results per element.
- One level of popups is opened with ArrowDown from an explicit
  `role="combobox"` or an `aria-haspopup` (`true` / `menu` / `listbox` /
  `tree`) trigger. Items that appear (`option`, `menuitem*`, `treeitem`) are
  added with `foundIn: "popup"` and judged only when focus or
  `aria-activedescendant` got inside; otherwise `details.popups[]` records
  `opened-not-entered` (so dialogs or tooltips that misuse `aria-haspopup`
  produce no candidates). Popups rendered elsewhere in the DOM (portals) are
  found by comparing visible items before and after the key press. Popups
  with more than 10 items are sampled like a manual check (enter, ArrowDown
  moves on, ArrowUp comes back; `status: "sampled"`) and only the visited
  items are listed.
- Navigation, reload or the 60 s time budget stop the check early; untested
  elements are `not-evaluated` and the rule is reported as incomplete.
- Known limitations: listeners delegated to `document` / `window` are not
  attributed to elements; Shadow DOM, iframes, nested submenus, popups opened
  by Enter / Space / Alt+ArrowDown, other content shown after load and
  grid / treegrid are not explored; arrow keys may change the selection of
  radios, single-select listboxes and auto-activated tabs (in the check's own
  browser context).

## 0.7.0 — 2026-09-25

### Added

- **`writeResult` and `quiet` options on every check** (`AuditOutputOptions`),
  for callers that run checks inside a server. Both default to the previous
  behavior.
  - `writeResult?: boolean` (default `true`): `false` skips writing the result
    JSON (for auto-play: `detection-result.json`); the result is only
    returned. Enabled screenshots are still written.
  - `quiet?: boolean` (default `false`): `true` suppresses all console output.
- **`runTargetSizeCheck`: `resolveAccessibleNames?: boolean`** (default
  `true`): `false` skips the sequential per-target `locator.ariaSnapshot()`
  calls and leaves `accessibleName` `null`. On a 300-link page this cut the
  check from ~1.1 s to ~0.06 s.
- **`keyboard-trap-check`: `details.tabWalkCapped`** (always set; optional
  in the type and JSON Schema so results from earlier versions still
  validate — absent means unknown): `true` when the Tab walk hit `KEYBOARD_TRAP_MAX_TAB_PRESSES`, so
  traps late in the tab order may be missed. Previously only a console
  warning.

### Changed

- Invalid output location options now throw before a check starts (they used
  to throw only when the result was saved, after the check had run).

### Fixed

- `keyboard-trap-check`: the saved result JSON now includes
  `details.screenshotPath` (it was set only on the returned object, after the
  file had been written).
- `focus-indicator-check`: `details.interrupted` is now `true` when navigation
  on focus exhausts the retries (it was always `false`).

## 0.6.0 — 2026-09-15

### Added

- **`target-size-check`: geometric spacing exception (SC 2.5.8).** The
  `spacing` exception is now evaluated per the WCAG definition: a 24px-diameter
  circle centered on each undersized target's bounding box must not intersect
  another target, nor the circle of another undersized target. Neighbors are
  measured by their line boxes (`getClientRects()`), so a wrapped inline link
  no longer counts as a solid block. A `<label>` (explicit `for` or
  implicitly wrapping its control — `INTERACTIVE_SELECTOR` now matches
  wrapping labels too), its control, and every other label of that control
  are treated as one target; nested interactive elements are separate
  targets, so an undersized control inside a larger clickable ancestor does
  not get the exception. Viewport-fixed targets (`position: fixed` with no
  ancestor establishing a containing block via `transform`, the individual
  `translate`/`rotate`/`scale` properties, `perspective`, `filter`,
  `backdrop-filter`, `will-change` of those, `contain` or `container-type`)
  are evaluated over the whole scroll range in which the subject
  target is visible (the fixed element's rects and circle center are swept,
  so the result does not depend on the scroll position at call time); their
  reported `spacing.center` is converted to document coordinates. A fixed
  element under such an ancestor scrolls with the page and is treated as
  normal flow, as is `position: sticky`. Targets covered by another element
  are dropped (hit-tested at
  their painted center while scrolling the page with `behavior: 'instant'`;
  the original scroll position is restored) and counted in
  `details.occludedTargets`. Targets above or left of the caller's scroll
  position are now collected too (the off-document filter uses document
  coordinates), so they still count as neighbors. Touching (distance exactly
  12px / 24px, within 0.01px) does not count as intersecting.
- `TargetSizeIssue.spacing` (`TargetSpacingResult`): circle diameter, center
  (document CSS px), `applies`, and `intersections[]` naming each offending
  neighbor (`selector`, `kind: 'target' | 'circle'`, `distance`, `required`).
  Set for every undersized (`fail-aa`) target; `null` otherwise. JSON Schema
  updated accordingly.
- `TargetSizeExceptionAssessment` gains `'verified'`: the spacing exception
  was confirmed geometrically. It takes precedence over the heuristic
  (`possible`) exceptions. Such targets conform to SC 2.5.8 and are no
  longer listed under `target-size-minimum` (the rule passes when nothing else
  needs review); because SC 2.5.5 has no spacing exception, they are reported
  under `target-size-enhanced` as incomplete instead.
  `summary.verifiedCount` reports how many of `exceptedCount` are verified.
- Screenshot: undersized targets get a `Spacing OK` label when verified, and
  every undersized target is drawn with its 24px circle (green = clear,
  red = intersects). `addPageAnnotations()` accepts an optional third
  `circles` argument (`CircleAnnotationConfig[]`).
- Pure geometry helpers exported from the main entry:
  `evaluateTargetSpacing`, `circleIntersectsRect`, `circlesIntersect`,
  `distancePointToRect`, `distanceBetweenPoints`, `rectCenter`,
  `describeTargetSpacing`, `roundPx`, `DEFAULT_SPACING_EPSILON`; `Point` and
  `Rect` types live in `types.ts`.

### Changed

- `target-size-check` no longer uses the previous edge-gap heuristic
  ("no adjacent targets within 24px"), which was stricter than the WCAG
  definition (e.g. 20px icons 10px apart never qualified) and could only ever
  mark the exception as `possible`. Failure summaries for undersized targets
  now name the nearest intersecting neighbor and distance.
- Fixture `target-size/finding.html` packs its tiny buttons edge to edge so it
  still fails the spacing exception; new fixture `target-size/spacing.html`
  (verified spacing) and `target-size/spacing-cases.html` (geometry cases,
  linked from the gallery index but not part of the manifest).

### Maintenance

- **Test infrastructure**: added fixture-gallery test suite with 29 HTML
  fixture pages served over HTTP (no `file://` — required for `ownsNavigation`
  checks), a worker-scoped static server helper, and a 28-entry manifest-driven
  spec (`test/fixture-gallery.spec.ts`) that verifies every custom rule lands in
  its expected bucket and validates each envelope with Ajv.
- **New spec files**: `test/auto-play.spec.ts` (CSS-animation finding, 60s
  timeout), `test/rule-classification.spec.ts` (manifest ↔ rule-registry
  cross-check for all 18 custom rules).
- **Demo gallery**: `test/fixtures/index.html` links all fixture pages.
- **Migrated inline fixtures**: removed `file://`-based keyboard-trap tests
  from `smoke.spec.ts` (now covered by fixture-gallery over HTTP); removed
  auto-play static test from `phase2.spec.ts` (now covered by
  `auto-play.spec.ts`). Detail-level API contract assertions are retained.
- No changes to check implementations, normalizers, schemas, or public API.

## 0.5.0 — 2026-06-13

### Added

- **`keyboard-trap-check`** (WCAG 2.1.2 No Keyboard Trap): 11th check in the
  package. Tabs through every focusable element on the page, detects regions
  where focus cannot escape via a `count+1` window algorithm, and attempts three
  escape paths (Escape key, Shift+Tab, visible close affordance). Results are
  classified as:
  - `violation` (`a11y-skills/no-keyboard-trap`): focus confined with no working
    exit.
  - `incomplete` (`a11y-skills/keyboard-trap-needs-review`): an escape path exists
    but may not be discoverable without documentation (WCAG 2.1.2 exception).
  - `pass`: proper `role=dialog` + `aria-modal=true` modal with Escape working.
  - `inapplicable`: page has no focusable elements.

  **Limitations** (see runner source for details): Shadow DOM interiors, iframe
  contents, `inert`-based traps, and SPA pages that change focusable element
  counts during the walk are not detected.

  Available via:
  - CLI: `npx @a11y-skills/audit --checks keyboard-trap-check --url <url>`
  - Function API: `runKeyboardTrapCheck` from `@a11y-skills/audit/playwright`
  - Test entry: `@a11y-skills/audit/test-entries/keyboard-trap-check`
  - Normalizer: `normalizeKeyboardTrapCheck` from `@a11y-skills/audit`
  - Schema: `RESULT_SCHEMAS['keyboard-trap-check']` from `@a11y-skills/audit/schemas`

## 0.4.1 — 2026-06-12

### Fixed

- CLI: `orientation-check` and `time-limit-detector` were failing with
  "No target URL provided" because the registry entries did not pass `targetUrl`
  to the underlying check functions. Both checks own their own navigation, so the
  CLI's redundant pre-navigation step is now skipped for these two entries via the
  new `ownsNavigation: true` flag on `CheckEntry`.

## 0.4.0 — 2026-06-12

### Added

- `bin` CLI (`a11y-audit`): run all ten WCAG checks against a URL without a
  Playwright test runner — `npx -y @a11y-skills/audit --url <url>`. Flags:
  `--checks <list>`, `--output-dir`, `--screenshot`, `--list-checks`,
  `--version`, `--help`. Exit codes: `0` = no violations, `1` = violations
  found, `2` = runtime error. JSON output uses the same envelope as the
  function API regardless of exit code.
- `test/fixtures/cli-smoke.html`: network-independent smoke fixture (a page
  with intentional axe violations) for the CI CLI smoke test.

## 0.3.1

### Fixed

- `runFocusIndicatorCheck`: focus-triggered navigations slower than the
  per-Tab settle window are no longer silently missed. The settle window is
  now configurable via the new `navigationSettleMs` option (default: 50), and
  a `framenavigated` listener additionally catches URL changes that commit and
  revert within a single window. (#26)

## 0.3.0

**Breaking** — every check now returns (and saves) a single axe-style envelope
instead of its own ad-hoc shape. The public API is not yet stable in `0.x`, so
this lands as a minor release.

### Changed (breaking)

- All `runXxx()` functions return `AuditCheckResult<TDetails>`: findings are
  normalized into `violations` / `incomplete` / `passes` / `inapplicable`
  rule arrays (axe-style `id` / `impact` / `tags` / `helpUrl` / `nodes`), with
  rule-level counts in `summary`. The former top-level fields (`issues`,
  `failAA`, `overflowingElements`, `clippedElements`, ...) moved unchanged
  under `details`.
- Classification is conservative: only findings whose detection has no blind
  spot and where no WCAG exception can apply are `violations`
  (on-focus context change, text-spacing clipping, invalid autocomplete
  tokens). Everything else — reflow/zoom overflow, meta refresh, orientation
  lock, missing focus styles, undersized targets — lands in `incomplete`, the
  manual-review queue.
- Saved JSON files use the same envelope; the JSON Schemas were rewritten
  accordingly (`$defs`-based shared envelope + per-check `details` schemas).
  Pre-0.3.0 result files no longer validate.
- `saveAuditResult()` no longer appends a disclaimer (the envelope carries it).
- `runAxeAudit` builds the buckets from the raw axe results: violations and
  incomplete keep their nodes, passes/inapplicable keep rule metadata only;
  `details` records the execution configuration.

### Added

- `rule-registry.ts`: per-rule metadata (`sc`, accurate per-SC `wcag*` tags,
  `impact`, `scope`, classification) — target size split into
  `a11y-skills/target-size-minimum` (2.5.8 AA) and
  `a11y-skills/target-size-enhanced` (2.5.5 AAA).
- Pure normalization mappers (`normalize*`), `buildAuditResult()`, and the
  opt-in `mergeNormalizedResults()` exported from the package root. The
  buckets are re-derivable from a saved result's `details`.
- Element-level evidence: detail records now carry `html` (outerHTML, capped
  at `HTML_SNIPPET_MAX_LENGTH`) and `htmlTruncated`; focus issues gained
  `selector`. `TargetSizeIssue.exceptionAssessment`
  (`ruled-out`/`possible`/`not-assessed`) drives the violation promotion.
- Tests: mapper unit tests, merge invariants, and ajv (draft 2020-12) schema
  validation of the produced envelopes.

## 0.2.0

Phase 2 checks added (additive). Still a `0.x` preview — the function API may
change before `1.0.0` based on downstream feedback.

### Added

- `runTextSpacingCheck` — WCAG 1.4.12.
- `runZoomCheck` — WCAG 1.4.4.
- `runOrientationCheck` — WCAG 1.3.4 (owns navigation: takes `page` + `targetUrl`,
  loads the page at portrait and landscape viewports).
- `runAutocompleteAudit` — WCAG 1.3.5.
- `runTimeLimitDetector` — WCAG 2.2.1 (owns navigation: installs a timer hook
  before `goto`, so takes `page` + `targetUrl`).
- `runAutoPlayDetection` — WCAG 1.4.2 / 2.2.2. Requires the **optional**
  dependencies `pixelmatch` + `pngjs` (for pixel-diffing screenshot frames);
  they are loaded lazily, so importing the package without them keeps the other
  nine checks working. Throws a clear error if invoked without them.
- `test-entries/*` and JSON Schemas (`RESULT_SCHEMAS`) for all six new checks.
- `getTargetUrl(defaultPath)` exported from `@a11y-skills/audit/playwright`.

## 0.1.0

Initial preview release. The function API may change before `1.0.0` based on
downstream feedback.

### Added

- `runAxeAudit` — axe-core broad WCAG coverage (2.0/2.1/2.2 A & AA).
- `runFocusIndicatorCheck` — WCAG 2.4.7 / 2.4.12 / 3.2.1 (owns its browser
  context; supports `contextOptions`).
- `runReflowCheck` — WCAG 1.4.10.
- `runTargetSizeCheck` — WCAG 2.5.5 / 2.5.8.
- Compatibility `test-entries/*`, run via a one-line local re-export spec
  (`TEST_PAGE` / `A11Y_OUTPUT_DIR`). Note: Playwright excludes `node_modules`
  from test collection, so a `testMatch` glob into `node_modules` finds no
  tests — use the re-export spec instead.
- `schemas` subpath: result types + hand-written JSON Schemas.
- Output path resolution: `outputDir` option → `A11Y_OUTPUT_DIR` env →
  `process.cwd()`, with `outputPath`/`outputDir` exclusivity (promoted from
  the downstream `resolveOutputPath` improvement).

### Notes

- Ported from the `auditing-wcag` skill's vendor scripts, including the
  downstream strict-TS fix in the focus check.
- Screenshots default to `false` in the function API; the compatibility entries
  enable them to preserve legacy behavior.
- Phase 2 checks (text-spacing / zoom-200 / orientation / autocomplete /
  time-limit / auto-play) are out of scope for this release.
