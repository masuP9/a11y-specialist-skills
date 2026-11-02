[日本語版 (Japanese)](./checks-axe.ja.md)

# How to read axe results

How to map axe-core results (`violations` / `passes` / `incomplete` / `inapplicable`) onto verdicts for success criteria.

## Principles

- **Violations are evidence of failure within their applicability conditions.** Check "Rules that stay as needs review even when violated" below and the conditions and exceptions in each criterion file.
- **Passes are evidence within a rule’s scope.** The table below does not establish criterion-wide conformance. See each criterion file for remaining checks.
- **Incomplete stays as needs review.** Do not mark it non-conformant or conformant. Add what would need to be confirmed to decide.
- **Inapplicable only means there was nothing for that rule to apply to.** It does not mean the success criterion is NA.

## Evidence from passes and remaining checks

| axe rule | Criterion | Evidence scope / remaining checks |
| --- | --- | --- |
| `button-name` / `link-name` / `input-button-name` | 4.1.2 | Naming checks. They do not settle role, required states, values, or notification of changes ([4.1.2-E01–E04](./criteria/4.1.2.md)) |
| `image-alt` / `input-image-alt` / `role-img-alt` | 1.1.1 | Implementation checks for alternatives, names, and similar information. Adequacy, decorative treatment, and out-of-scope content remain ([1.1.1-E01–E04](./criteria/1.1.1.md)) |
| `target-size` | 2.5.8 | Read within the measured targets and states. Check undetected targets, exceptions, and shape limitations ([2.5.8-E01–E04](./criteria/2.5.8.md)) |

Use ACT evidence to understand check scope. Do not assume axe completely implements identical rules.

**Examples of passes not to count as conformant** (common mistakes):

- A pass on `html-has-lang` does not make 3.1.1 conformant. Having a lang and the lang matching the language of the body text are different things ([3.1.1](./criteria/3.1.1.md)).
- A pass on `document-title` does not make 2.4.2 conformant. Having a title and the title describing the topic are different things ([2.4.2](./criteria/2.4.2.md)).
- A pass on `video-caption` (a captions track exists) does not make 1.2.2 conformant. It does not check whether the caption content matches the audio ([1.2.2](./criteria/1.2.2.md)).
- Do not transfer `label` passes or violations directly to 3.3.2. In axe-core 4.14.0 this is a 4.1.2 name check, and a placeholder alone can pass. Separately inspect labels and instructions presented to all users ([3.3.2-E01 and judgment lines](./criteria/3.3.2.md)).
- Do not transfer `label` results directly to 1.3.1 either; compare visible-label and structural relationships. `autocomplete-valid` passes do not establish user-information scope or actual purpose correspondence ([1.3.1](./criteria/1.3.1.md), [1.3.5](./criteria/1.3.5.md)).

- A `bypass` pass only supplies evidence of internal links, headings, main, or similar structures; check whether repeated blocks can actually be bypassed. A `link-name` pass does not settle descriptive link purpose ([2.4.1](./criteria/2.4.1.md), [2.4.4](./criteria/2.4.4.md)).

## Examples of rules whose violation may be settled

| axe rule             | Criterion | What is settled                                                                       |
| -------------------- | --------- | ------------------------------------------------------------------------------------- |
| `document-title`     | 2.4.2     | `<title>` is missing or empty                                                         |
| `html-has-lang`      | 3.1.1     | `html` has no lang or it is empty                                                     |
| `html-lang-valid`    | 3.1.1     | Primary language is invalid (not full-tag syntax validation)                                                           |
| `image-alt`          | 1.1.1     | Confirmed absence of a valid alternative or ignorable implementation for the target image, not merely missing alt ([1.1.1-E02–E04](./criteria/1.1.1.md))          |
| `link-in-text-block` | 1.4.1 | Treat violations within the detected scope as failures and incomplete as needs review. Distinguish 3:1 against surrounding text / style cues from contrast against the background. [1.4.1](./criteria/1.4.1.md) |

## Rules treated as best practice

- `region`: best practice in axe-core 4.14.0, outside audit's default WCAG tags. This violation alone does not fail 2.4.1 ([2.4.1](./criteria/2.4.1.md)).
- `landmark-*`: best practice in axe-core 4.14.0. Do not uniformly transfer violations to 1.3.1 ([1.3.1](./criteria/1.3.1.md)).

- `aria-dialog-name`: report a missing name on dialog / alertdialog itself as an improvement candidate without assigning a success criterion. Do not mark 4.1.2 Fail or NT solely from this result. [Our interpretation: author’s audit policy. See [4.1.2-E05 and judgment lines](./criteria/4.1.2.md)]

## Rules that stay as needs review even when violated

| axe rule            | Criterion | Reason                                                                                                                                        |
| ------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-autoplay-audio` | 1.4.2 | Checks controls, playback duration, loop, and related conditions, but does not verify external stop or independent volume controls; review required |
| `meta-refresh` | 2.2.1 | Delay checks do not verify turn-off, adjustment, extension, or exceptions; review required. Do not automatically fail delays within 20 seconds |

## Common incomplete results

- `bypass` (2.4.1): axe-core 4.14.0 sets `reviewOnFail: true`. Keep incomplete as needs review and inspect repeated blocks and alternative bypass mechanisms.

- `color-contrast` (1.4.3): the background is an image or gradient and the ratio cannot be computed. Decide by visual inspection or measurement.
- `video-caption` (1.2.2): there is no captions track. Burned-in captions are possible, so do not mark it non-conformant.
