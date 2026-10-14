[日本語版 (Japanese)](./checks-axe.ja.md)

# How to read axe results

How to map axe-core results (`violations` / `passes` / `incomplete` / `inapplicable`) onto verdicts for success criteria.

## Principles

- **Violations may be settled as non-conformant.** The exceptions are in "Rules that stay as needs review even when violated" below.
- **A pass may be counted as conformant only for the rules in the table below.** Any other pass means no more than "there was no problem within the range that rule looks at". Few rules look at the whole of a success criterion.
- **Incomplete stays as needs review.** Do not mark it non-conformant or conformant. Add what would need to be confirmed to decide.
- **Inapplicable only means there was nothing for that rule to apply to.** It does not mean the success criterion is NA.

## Rules whose pass may be counted as conformant

| axe rule            | Criterion | Reason                                                                                                  |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| `button-name`       | 4.1.2     | Checks that the button has a name; for a standard HTML button, the browser conveys the role and state   |
| `link-name`         | 4.1.2     | Same as above (links)                                                                                   |
| `input-button-name` | 4.1.2     | Same as above (`<input type="button/submit/reset">`)                                                    |
| `image-alt`         | 1.1.1     | Checks that alt is present. It does not check whether the content is adequate ([1.1.1](./criteria/1.1.1.md)) |
| `input-image-alt`   | 1.1.1     | Same as above (`<input type="image">`)                                                                  |
| `role-img-alt`      | 1.1.1     | Same as above (`role="img"`)                                                                            |
| `target-size`       | 2.5.8     | Runs only when the WCAG 2.2 tag is enabled. Checks the 24px threshold                                   |

**Examples of passes not to count as conformant** (common mistakes):

- A pass on `html-has-lang` does not make 3.1.1 conformant. Having a lang and the lang matching the language of the body text are different things ([3.1.1](./criteria/3.1.1.md)).
- A pass on `document-title` does not make 2.4.2 conformant. Having a title and the title describing the topic are different things ([2.4.2](./criteria/2.4.2.md)).
- A pass on `video-caption` (a captions track exists) does not make 1.2.2 conformant. It does not check whether the caption content matches the audio ([1.2.2](./criteria/1.2.2.md)).
- A pass on `label` does not make 3.3.2 conformant. A name is still computed even when the label is only a placeholder.

## Examples of rules whose violation may be settled

| axe rule             | Criterion | What is settled                                                                       |
| -------------------- | --------- | ------------------------------------------------------------------------------------- |
| `document-title`     | 2.4.2     | `<title>` is missing or empty                                                         |
| `html-has-lang`      | 3.1.1     | `html` has no lang or it is empty                                                     |
| `html-lang-valid`    | 3.1.1     | The lang value is malformed                                                           |
| `image-alt`          | 1.1.1     | `<img>` has no alt attribute at all (decorative `alt=""` is not a violation)          |
| `link-in-text-block` | 1.4.1     | A link in running text is distinguished from the surrounding text by color alone      |

## Rules that stay as needs review even when violated

| axe rule            | Criterion | Reason                                                                                                                                        |
| ------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-autoplay-audio` | 1.4.2     | Only looks at the `controls` attribute. It reports a violation even when there is a mechanism elsewhere on the page to stop or change the volume, so non-conformance cannot be asserted |

## Common incomplete results

- `color-contrast` (1.4.3): the background is an image or gradient and the ratio cannot be computed. Decide by visual inspection or measurement.
- `video-caption` (1.2.2): there is no captions track. Burned-in captions are possible, so do not mark it non-conformant.
