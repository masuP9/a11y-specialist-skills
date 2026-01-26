[日本語版 (Japanese)](./content-checks.ja.md)

# Content Checks

Checks that depend on content quality and availability. Validate presence and adequacy of alternatives such as captions and transcripts.

## Non-text Content
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 1.1.1 | Alt text quality for images | image list + alt text | Alt text missing, empty for informative images, or insufficient description |

> **Note:** Automated checks verify presence of alt text. Content review evaluates whether the alt text adequately describes the image content and purpose. See [automated-checks.md](./automated-checks.md) for automated alt text detection.

## Multimedia
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 1.2.1 | Alternatives for audio-only/video-only | links/notes | No alternative provided |
| 1.2.2 | Captions for prerecorded video | screenshot | No captions |
| 1.2.3 | Media alternative (audio description or text) | links/notes | No alternative |
| 1.2.4 | Live captions provided | capture | No live captions |
| 1.2.5 | Audio description provided | capture | No audio description |

## Sensory Characteristics
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 1.3.3 | Instructions not relying on sensory cues | excerpts | Sensory-only instructions without alternative |

## Audio
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 1.4.2 | Auto-play audio can be stopped/controlled | logs | No stop/controls |

> **Tip:** Use `scripts/auto-play-detection.ts` to detect auto-playing visual content via screenshot comparison. Audio auto-play requires manual listening. See [interactive-checks.md](./interactive-checks.md#auto-play-detection) for details.

## Navigation
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 2.4.5 | Multiple ways to reach content (search/site map) | capture | Only one way provided |
