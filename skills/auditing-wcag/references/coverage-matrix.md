[日本語版 (Japanese)](./coverage-matrix.ja.md)

# WCAG 2.2 A/AA Coverage Matrix

Methods are labeled as Automated/Interactive/Manual/Content and can be combined.

## 1. Perceivable
| Criterion | Test Method | Evidence | Judgment Rule |
|---|---|---|---|
| 1.1.1 | Automated + Content | a11y tree/image list | Fail if informative images are unnamed or insufficient |
| 1.2.1 | Content | alternative links/notes | Fail if no alternative |
| 1.2.2 | Content | screenshots | Fail if captions missing |
| 1.2.3 | Content | alternative links/notes | Fail if no media alternative |
| 1.2.4 | Content | capture | Fail if live captions missing |
| 1.2.5 | Content | capture | Fail if audio description missing |
| 1.3.1 | Automated | a11y tree snippet | Fail on missing semantics |
| 1.3.2 | Manual | DOM order/reading notes | Fail if meaningful order breaks |
| 1.3.3 | Content | excerpts | Fail on sensory-only instructions |
| 1.3.4 | Manual | captures | Fail if one orientation blocks function |
| 1.3.5 | Manual | DOM notes | Fail on incorrect/missing autocomplete |
| 1.4.1 | Manual | screenshots | Fail if color-only cue |
| 1.4.2 | Manual | logs | Fail if audio cannot be paused/stopped |
| 1.4.3 | Manual | measurements | Fail below AA |
| 1.4.4 | Manual | screenshots | Fail if loss/overlap at 200% |
| 1.4.5 | Manual + Content | screenshots | Fail if text is image-based |
| 1.4.10 | Manual | screenshots | Fail if horizontal scroll required |
| 1.4.11 | Manual | measurements | Fail if non-text contrast insufficient |
| 1.4.12 | Manual | screenshots | Fail on text clipping/overlap |
| 1.4.13 | Interactive | video/logs | Fail if hover/focus content cannot be dismissed/retained |

## 2. Operable
| Criterion | Test Method | Evidence | Judgment Rule |
|---|---|---|---|
| 2.1.1 | Interactive | logs | Fail if keyboard-only not possible |
| 2.1.2 | Interactive | logs | Fail on keyboard trap |
| 2.1.4 | Interactive | logs | Fail if single-key shortcuts cannot be mitigated |
| 2.2.1 | Manual | logs | Fail if time limits cannot be extended/disabled |
| 2.2.2 | Manual | logs | Fail if moving content cannot be paused/stopped |
| 2.3.1 | Manual | video | Fail if flashing exceeds threshold |
| 2.4.1 | Automated | a11y tree | Fail if no bypass mechanism |
| 2.4.2 | Automated | `document.title` | Fail if title empty |
| 2.4.3 | Interactive | focus order log | Fail if order deviates from visual |
| 2.4.4 | Content | excerpts | Fail if link purpose unclear in context |
| 2.4.5 | Content | captures | Fail if only one way provided |
| 2.4.6 | Automated + Content | a11y tree/excerpts | Fail if headings/labels are unclear |
| 2.4.7 | Interactive | screenshots | Fail if focus not visible |
| 2.4.11 | Interactive | screenshots/measurement | Fail if focus appearance below minimum |
| 2.4.12 | Interactive | screenshots | Fail if focus is obscured |
| 2.5.1 | Interactive | logs | Fail if complex gestures required |
| 2.5.2 | Interactive | logs | Fail if cancellation unavailable |
| 2.5.3 | Automated | a11y name diff | Fail if label text not in accessible name |
| 2.5.4 | Interactive | logs | Fail if motion-only activation |
| 2.5.7 | Interactive | logs | Fail if dragging required |
| 2.5.8 | Manual | measurements | Fail below minimum target size |

## 3. Understandable
| Criterion | Test Method | Evidence | Judgment Rule |
|---|---|---|---|
| 3.1.1 | Automated | DOM attribute | Fail if lang missing |
| 3.1.2 | Content | excerpts | Fail if language of parts not identified |
| 3.2.1 | Interactive | DOM diff | Fail if focus triggers navigation/major update |
| 3.2.2 | Interactive | DOM diff | Fail if input triggers submit/navigation |
| 3.2.3 | Content | nav comparison | Fail if navigation inconsistent |
| 3.2.4 | Content | UI comparison | Fail if same function identified differently |
| 3.2.6 | Content | help comparison | Fail if help mechanism inconsistent |
| 3.3.1 | Interactive | screenshots | Fail if errors not identified |
| 3.3.2 | Automated + Content | a11y tree/excerpts | Fail if labels/instructions missing |
| 3.3.3 | Interactive | screenshots | Fail if no correction suggestions |
| 3.3.4 | Manual | logs | Fail if no confirm/reversal for critical actions |
| 3.3.7 | Manual | logs | Fail if redundant entry required |
| 3.3.8 | Interactive | captures | Fail if authentication relies on cognitive test only |

## 4. Robust
| Criterion | Test Method | Evidence | Judgment Rule |
|---|---|---|---|
| 4.1.1 | Automated | HTML validation logs | Fail if parsing errors block AT |
| 4.1.2 | Automated | a11y tree | Fail if name/role/value not exposed |
| 4.1.3 | Automated + Interactive | a11y tree/logs | Fail if status messages not exposed |
