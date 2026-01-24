[日本語版 (Japanese)](./manual-checks.ja.md)

# Manual Checks

Items requiring human judgment. Use screenshots/video/notes as evidence for visual or contextual decisions.

## Color/Contrast

> **Note:** 1.4.1 (Use of Color), 1.4.3 (Text Contrast), and 1.4.11 (Non-text Contrast) are covered in [automated-checks.md](./automated-checks.md). For 1.4.1, Claude analyzes accessible text for color references. For charts/graphs relying solely on color differentiation, manual visual inspection is still needed.

## Text/Layout
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 1.4.4 | No loss at 200% zoom | screenshot | Loss/overlap |
| 1.4.5 | Avoid text in images | screenshot | Text rendered as image |
| 1.4.10 | Reflow without horizontal scroll | screenshot | Horizontal scroll at 320px equivalent |
| 1.4.12 | Text spacing changes do not break layout | screenshot | Text clipping/overlap |

> **Scripts:**
> - `scripts/zoom-200-check.ts` - Detects content loss/clipping at 200% zoom (1.4.4)
> - `scripts/reflow-check.ts` - Detects horizontal scroll at 320px viewport (1.4.10)
> - `scripts/text-spacing-check.ts` - Detects clipping after WCAG text spacing overrides (1.4.12)

## Timing
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 2.2.1 | Time limits can be extended/disabled | logs | No extension/disable |
| 2.2.2 | Auto-updating content can be paused/stopped | logs | No pause/stop |

> **Scripts:**
> - `scripts/time-limit-detector.ts` - Detects meta refresh, setTimeout/setInterval, countdown indicators (2.2.1)
> - `scripts/auto-play-detection.ts` - Detects auto-playing content via screenshot comparison (2.2.2). See [interactive-checks.md](./interactive-checks.md#auto-play-detection) for details.

## Flashing
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 2.3.1 | No flashes above threshold | video | Flashing exceeds threshold |

## Orientation
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 1.3.4 | Works in both portrait/landscape | screenshots | Functionality blocked in one orientation |

> **Script:** `scripts/orientation-check.ts` - Detects orientation lock messages and content visibility differences between portrait/landscape.

## Redundant Entry
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 3.3.7 | No required re-entry of known information | logs | Re-entry required without valid reason |
