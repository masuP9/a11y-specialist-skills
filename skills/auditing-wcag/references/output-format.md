[日本語版 (Japanese)](./output-format.ja.md)

# Output Format

Reports must follow this template. Keep entries concise and always attach evidence and rationale.

## Output Procedure

### 1. Ask for Save Location
Before generating the report, ask the user where to save the output:
```
Where should I save the audit report?
Default: ./[domain]-[YYYY-MM-DD]/
```

### 2. Create Output Directory
Create a directory with the format: `[domain]-[YYYY-MM-DD]/`

Example: `a11yc.com-2026-01-24/`

### 3. Generate Files
Save the following files in the output directory:

| File | Description |
|------|-------------|
| `report.md` | Main audit report (Markdown) |
| `axe-result.json` | axe-core results (common envelope format) |
| `*-result.json` | Other script results (same common envelope format) |
| `screenshots/` | Evidence screenshots |

### 4. Copy Script Outputs
Move generated JSON files and screenshots to the output directory.

## Result JSON Format (@a11y-skills/audit 0.3.0+)

Every script result is saved as the same axe-style envelope:

- `source` / `url` / `timestamp` — identification of the check run
- `violations[]` — **confirmed violations** (only findings whose detection has
  no blind spot and where no WCAG exception can apply)
- `incomplete[]` — **needs manual review**. All heuristic detections and
  findings with possible exceptions land here. **Treat this bucket as the
  manual-review queue, never as noise**
- `passes[]` / `inapplicable[]` — rules with no findings / nothing to examine
- `summary` — rule-level counts (`violationCount` / `incompleteCount` /
  `passCount` / `checkedNodes`)
- `details` — check-specific evidence (measurements, screenshot paths, raw
  element records)

Each rule is axe-shaped (`id` / `impact` / `tags` / `helpUrl` / `nodes[]`).
Custom rule ids are namespaced with `a11y-skills/` (e.g.
`a11y-skills/focus-visible`), and the `wcag247`-style tags identify the
success criterion mechanically. `nodes[].target` holds CSS selectors
(page-level findings use `['html']`), `nodes[].html` carries outerHTML
evidence, and `nodes[].failureSummary` explains the finding.

When writing the report, treat `violations` as Fail candidates and
`incomplete` as manual-verification items for the per-criterion verdicts.

## Report Template

```markdown
# Accessibility Audit Report

## Scope
- Target URLs/screens:
- Target flows:
- Devices/browsers:
- Date/owner:
- Exclusions:

## Summary
| Level | Pass | Fail | NT | NA |
|---|---:|---:|---:|---:|
| A |  |  |  |  |
| AA |  |  |  |  |

## Detailed Results (per criterion)
| Criterion | Level | Result | Evidence | Rationale |
|---|---|---|---|---|
|  |  |  |  |  |

## Issues Summary
| Severity | Impact | Criterion | Location | Summary | Recommendation |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## Screenshots / Evidence

### Focus Indicator Check (2.4.7 / 2.4.11)

Elements without focus styles are highlighted with a red outline and "⚠ No Focus Style" label.

![Focus Indicator Check Result](./focus-indicators.png)

**Detected Issues:**
- Total focusable elements: X
- Elements without focus style: Y
- Problematic elements:
  - `<button>` element name...
  - ...

### Auto-play Detection (1.4.2 / 2.2.2)

Screenshots taken at intervals to detect auto-playing content.

![Auto-play Detection - 0s](./auto-play-screenshots/screenshot-0.png)
![Auto-play Detection - 3s](./auto-play-screenshots/screenshot-3.png)

**Detection Results:**
- Auto-play content detected: Yes/No
- Screenshots compared: 4 (0s, 1s, 2s, 3s)
- Size change percentage: X%
- Manual verification:
  - [ ] Pause/stop controls provided
  - [ ] Content stops within 5 seconds
  - [ ] No audio auto-play (or controls provided)

### Other Evidence
<!-- Add screenshots as needed -->

## Manual Verification Checklist
- [ ] Color/contrast
- [ ] Text/layout
- [ ] Timing
- [ ] Flashing
- [ ] Orientation
- [ ] Input purpose
- [ ] Redundant entry
- [ ] Multimedia
- [ ] Sensory characteristics
- [ ] Audio
- [ ] Navigation

## Limitations
- Automated checks rely on the a11y tree; visual quality requires separate verification
- Authenticated pages or third-party services not covered
- Features dependent on sample data require production re-check
```

## Result Labels
- Pass: Meets criterion
- Fail: Does not meet
- NT: Not tested (out of scope/time)
- NA: Not applicable
