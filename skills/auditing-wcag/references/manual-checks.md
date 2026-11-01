[日本語版 (Japanese)](./manual-checks.ja.md)

# Manual Checks

Items requiring human judgment. Use screenshots/video/notes as evidence for visual or contextual decisions. When the "Fail rule" column says **Judgment lines**, judge with a11y-knowledge `criteria/<number>.md`.

## Color/Contrast

> **Note:** The material for 1.4.1 (Use of Color), 1.4.3 (Text Contrast), and 1.4.11 (Non-text Contrast) is in [automated-checks.md](./automated-checks.md). 1.4.1 is judged by looking at screenshots, so inspect charts and graphs visually as well.

## Text/Layout
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 1.4.4 | No information/functionality loss at the standard 200% test point; no exhaustive intermediate-scale testing | screenshot | [Judgment lines](../../a11y-knowledge/references/criteria/1.4.4.md) |
| 1.4.5 | Avoid text in images | screenshot | [Judgment lines](../../a11y-knowledge/references/criteria/1.4.5.md) |
| 1.4.10 | Read each non-excepted section in one direction; retain information/functionality | screenshot | [Judgment lines](../../a11y-knowledge/references/criteria/1.4.10.md) |
| 1.4.12 | Content/functionality remains available after appropriate spacing changes | screenshot | [Judgment lines](../../a11y-knowledge/references/criteria/1.4.12.md) |

> **CLI Checks:**
> - `zoom-200-check` - Detects clipping and other candidates with CSS zoom 200% (distinct from actual browser zoom) (1.4.4)
> - `reflow-check` - Detects horizontal scroll at 320px viewport (1.4.10)
> - `text-spacing-check` - Detects clipping after spacing overrides; verify override conditions and full-text access before judging (1.4.12)
>
> Run via: `npx -y @a11y-skills/audit --url "<url>" --checks zoom-200-check,reflow-check,text-spacing-check`

## Timing
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 2.2.1 | Time-limit turn-off, prior adjustment, extension, and exceptions | logs | [Judgment lines](../../a11y-knowledge/references/criteria/2.2.1.md) |
| 2.2.2 | Pause/stop or other controls for automatic updates/animation (no five-second condition for updates) | logs | [Judgment lines](../../a11y-knowledge/references/criteria/2.2.2.md) |

> **CLI Checks:**
> - `time-limit-detector` - Detects meta refresh, setTimeout/setInterval, countdown indicators (2.2.1)
> - `auto-play-detection` - Detects auto-playing content via screenshot comparison (2.2.2). See [interactive-checks.md](./interactive-checks.md#auto-play-detection) for details.
>
> Run via: `npx -y @a11y-skills/audit --url "<url>" --checks time-limit-detector,auto-play-detection`

## Flashing
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 2.3.1 | No flashes above threshold | video | Flashing exceeds threshold |

## Orientation
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 1.3.4 | Works in both portrait/landscape | screenshots | [Judgment lines](../../a11y-knowledge/references/criteria/1.3.4.md) |

> **CLI Check:** `orientation-check` - Detects orientation lock messages and content visibility differences between portrait/landscape. These are viewport-based inferences; verify actual restrictions, switching controls, and essentiality. Distinguish OS locks and layout differences alone.
>
> Run via: `npx -y @a11y-skills/audit --url "<url>" --checks orientation-check`

## Redundant Entry
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 3.3.7 | No required re-entry of known information | logs | Re-entry required without valid reason |

> **CLI Check:** `redundant-entry-check` - Reports fields in the same form that ask for the same information (the `autocomplete` purpose, or a purpose inferred from the name/label), plus controls that probably copy or select the earlier entry ("same as ..."), as candidates (incomplete). It only finds overlaps **within a single page**. Forms whose steps span several pages are out of scope and must be checked manually. It does not verify that the value is actually copied.
>
> Run via: `npx -y @a11y-skills/audit --url "<url>" --checks redundant-entry-check`
