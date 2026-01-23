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

### Focus Indicator Check Script

Use `scripts/focus-indicator-check.ts` to automatically detect focus indicator presence.

**Features:**
- Detects all focusable elements on the page
- Tabs through each element and captures style changes on focus
- Checks for outline, box-shadow, background-color changes
- Reports elements without visible focus indicators with warning labels
- Takes a full-page screenshot highlighting problematic elements

**Usage:**
```bash
# Update URL in the script and run
npx playwright test scripts/focus-indicator-check.ts
```

**Output:**
- `focus-indicators.png` - Full-page screenshot with warning labels on elements missing focus styles
- Console output - Summary of total elements, elements with/without focus styles

**Dependencies:**
```bash
npm install @playwright/test
```

## Pointer
| Criterion | Action | Evidence | Fail rule |
|---|---|---|---|
| 2.5.7 | Provide alternative to dragging | logs | Dragging is required with no alternative |
| 2.5.8 | Measure target size | screenshots/measurement | Minimum target size not met |

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
