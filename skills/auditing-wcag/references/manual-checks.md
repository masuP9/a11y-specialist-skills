[日本語版 (Japanese)](./manual-checks.ja.md)

# Manual Checks

Items requiring human judgment. Use screenshots/video/notes as evidence for visual or contextual decisions.

## Color/Contrast
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 1.4.1 | Not relying on color alone | screenshot | No non-color cue |
| 1.4.3 | Text contrast ratio | measurement | Below AA |
| 1.4.11 | Non-text contrast | measurement | Below AA |

## Text/Layout
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 1.4.4 | No loss at 200% zoom | screenshot | Loss/overlap |
| 1.4.5 | Avoid text in images | screenshot | Text rendered as image |
| 1.4.10 | Reflow without horizontal scroll | screenshot | Horizontal scroll at 320px equivalent |
| 1.4.12 | Text spacing changes do not break layout | screenshot | Text clipping/overlap |

## Timing
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 2.2.1 | Time limits can be extended/disabled | logs | No extension/disable |
| 2.2.2 | Auto-updating content can be paused/stopped | logs | No pause/stop |

> **Tip:** Use `scripts/auto-play-detection.ts` to detect auto-playing content via screenshot comparison. See [interactive-checks.md](./interactive-checks.md#auto-play-detection) for details.

## Flashing
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 2.3.1 | No flashes above threshold | video | Flashing exceeds threshold |

## Orientation
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 1.3.4 | Works in both portrait/landscape | screenshots | Functionality blocked in one orientation |

## Input Purpose
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 1.3.5 | Input purpose is programmatically determinable | DOM notes | autocomplete missing/incorrect |

## Redundant Entry
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 3.3.7 | No required re-entry of known information | logs | Re-entry required without valid reason |
