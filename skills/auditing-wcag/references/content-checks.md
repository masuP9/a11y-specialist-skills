[日本語版 (Japanese)](./content-checks.ja.md)

# Content Checks

Checks that depend on content quality and availability. Validate presence and adequacy of alternatives such as captions and transcripts. When the "Fail rule" column says **Judgment lines**, judge with a11y-knowledge `criteria/<number>.md`.

## Non-text Content
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 1.1.1 | Alt text quality for images | image list + alt text | [Judgment lines](../../a11y-knowledge/references/criteria/1.1.1.md) |

> **Note:** Automated checks verify presence of alt text. Content review evaluates whether the alt text adequately describes the image content and purpose.

## Multimedia
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 1.2.1 | Alternatives for audio-only/video-only | Media/alternative + timestamps + content/interaction comparison | [1.2.1](../../a11y-knowledge/references/criteria/1.2.1.md) |
| 1.2.2 | Prerecorded captions, audio synchronization, exceptions | Video/caption references + timestamps + audio/caption comparison | [Judgment lines](../../a11y-knowledge/references/criteria/1.2.2.md) |
| 1.2.3 | Media alternative (audio description or text) | Media/alternative + timestamps + content/interaction comparison | [1.2.3](../../a11y-knowledge/references/criteria/1.2.3.md) |
| 1.2.4 | Presence, content, and presentation of captions on live streams | Screen during the stream, or a recording that keeps broadcast-time captions + date and time checked | [1.2.4](../../a11y-knowledge/references/criteria/1.2.4.md) |
| 1.2.5 | Audio description provided | Media/alternative + timestamps + content/interaction comparison | [1.2.5](../../a11y-knowledge/references/criteria/1.2.5.md) |

## Sensory Characteristics
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 1.3.3 | Instructions not relying on sensory cues | excerpts | [Judgment lines](../../a11y-knowledge/references/criteria/1.3.3.md) |

## Audio
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 1.4.2 | Auto-play audio can be stopped/controlled | logs | [Judgment lines](../../a11y-knowledge/references/criteria/1.4.2.md) |

> **Tip:** The `auto-play-detection` check detects auto-playing visual content via screenshot comparison and also measures the playback state of `<audio>` / `<video>` (whether it is muted, plays for more than 3 seconds, and has visible `controls`) as `a11y-skills/auto-play-audio`. Verify manually that sound is actually heard and that any pause/mute control found works. See [interactive-checks.md](./interactive-checks.md#auto-play-detection) for details.
> Run via: `npx -y @a11y-skills/audit --url "<url>" --checks auto-play-detection`

## Navigation
| Criterion | Check | Evidence | Fail rule |
|---|---|---|---|
| 2.4.5 | Multiple ways to reach content (search/site map) and where they actually lead | capture + logs | [2.4.5](../../a11y-knowledge/references/criteria/2.4.5.md) |
| 2.4.6 | Headings/labels and actual content/functions, including image labels | Content, screen, and component behavior | [2.4.6](../../a11y-knowledge/references/criteria/2.4.6.md) |
