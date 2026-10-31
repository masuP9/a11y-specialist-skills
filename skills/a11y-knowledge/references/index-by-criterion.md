[日本語版 (Japanese)](./index-by-criterion.ja.md)

# Index by success criterion

"Nature" classifies what is needed to judge the success criterion. It distinguishes criteria decided by automated check results alone from those that cannot be decided without looking at the whole page or multiple pages.

| Nature         | Meaning                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| Element        | Decided by the element's role, name, and attributes, and the surrounding tree                                    |
| Whole page     | Needs the structure of the whole page (landmarks, headings, title, lang) or an image of the whole page           |
| Multiple pages | Cannot be decided without comparing multiple pages. Read [cross-page](./cross-page.md) first                     |
| Measurement    | Needs results of operating and measuring in a browser (`@a11y-skills/audit`). Without them, leave as needs review |
| Visual         | Needs the runtime appearance or operation, and cannot be decided from the tree or measurement                    |

| Criterion | Name (short)                              | Nature                | File                                          |
| --------- | ----------------------------------------- | --------------------- | --------------------------------------------- |
| 1.1.1     | Non-text Content                          | Element               | [1.1.1](./criteria/1.1.1.md)                  |
| 1.2.2     | Captions (Prerecorded)                    | Element               | [1.2.2](./criteria/1.2.2.md)                  |
| 1.3.1     | Info and Relationships                    | Element               | [1.3.1](./criteria/1.3.1.md)                  |
| 1.3.3     | Sensory Characteristics                   | Whole page            | [1.3.3](./criteria/1.3.3.md)                  |
| 1.3.4     | Orientation                               | Measurement           | [1.3.4](./criteria/1.3.4.md)                  |
| 1.3.5     | Identify Input Purpose                    | Measurement + Element | [1.3.5](./criteria/1.3.5.md)                  |
| 1.4.1     | Use of Color                              | Whole page            | [1.4.1](./criteria/1.4.1.md)                  |
| 1.4.2     | Audio Control                             | Measurement           | [1.4.2](./criteria/1.4.2.md)                  |
| 1.4.4     | Resize Text                               | Measurement           | [1.4.4](./criteria/1.4.4.md)                  |
| 1.4.5     | Images of Text                            | Element               | [1.4.5](./criteria/1.4.5.md)                  |
| 1.4.10    | Reflow                                    | Measurement           | [1.4.10](./criteria/1.4.10.md)                |
| 1.4.11 | Non-text Contrast | Measurement + Visual | [1.4.11](./criteria/1.4.11.md) |
| 1.4.12    | Text Spacing                              | Measurement           | [1.4.12](./criteria/1.4.12.md)                |
| 2.1.1     | Keyboard                                  | Element + Measurement | [2.1.1](./criteria/2.1.1.md)                  |
| 2.2.1     | Timing Adjustable                         | Measurement           | [2.2.1](./criteria/2.2.1.md)                  |
| 2.2.2     | Pause, Stop, Hide                         | Measurement           | [2.2.2](./criteria/2.2.2.md)                  |
| 2.4.1     | Bypass Blocks                             | Whole page            | [2.4.1](./criteria/2.4.1.md)                  |
| 2.4.2     | Page Titled                               | Whole page            | [2.4.2](./criteria/2.4.2.md)                  |
| 2.4.3     | Focus Order                               | Measurement           | [2.4.3](./criteria/2.4.3.md)                  |
| 2.4.4     | Link Purpose (In Context)                 | Element               | [2.4.4](./criteria/2.4.4.md)                  |
| 2.4.7     | Focus Visible                             | Measurement           | [2.4.7](./criteria/2.4.7.md)                  |
| 2.4.11    | Focus Not Obscured (Minimum)              | Measurement           | [2.4.11](./criteria/2.4.11.md)                |
| 2.4.12 | Focus Not Obscured (Enhanced), AAA | Measurement + Visual | [2.4.12](./criteria/2.4.12.md) |
| 2.4.13 | Focus Appearance, AAA | Measurement + Visual | [2.4.13](./criteria/2.4.13.md) |
| 2.5.1     | Pointer Gestures                          | Measurement           | [2.5.1](./criteria/2.5.1.md)                  |
| 2.5.5     | Target Size (Enhanced) AAA                | Measurement           | [2.5.5](./criteria/2.5.5.md)                  |
| 2.5.7     | Dragging Movements                        | Measurement           | [2.5.7](./criteria/2.5.7.md)                  |
| 2.5.8     | Target Size (Minimum)                     | Measurement + Element | [2.5.8](./criteria/2.5.8.md)                  |
| 3.1.1     | Language of Page                          | Whole page            | [3.1.1](./criteria/3.1.1.md)                  |
| 3.2.1     | On Focus                                  | Measurement           | [3.2.1](./criteria/3.2.1.md)                  |
| 3.2.2     | On Input                                  | Visual                | (Not written. Cannot be decided without entering input and watching the behavior) |
| 3.2.3     | Consistent Navigation                     | Multiple pages        | [3.2.3](./criteria/3.2.3.md)                  |
| 3.2.4     | Consistent Identification                 | Multiple pages        | [3.2.4](./criteria/3.2.4.md)                  |
| 3.2.6     | Consistent Help                           | Multiple pages        | [3.2.6](./criteria/3.2.6.md)                  |
| 3.3.1     | Error Identification                      | Element               | [3.3.1](./criteria/3.3.1.md)                  |
| 3.3.2     | Labels or Instructions                    | Element               | [3.3.2](./criteria/3.3.2.md)                  |
| 3.3.3     | Error Suggestion                          | Element               | [3.3.3](./criteria/3.3.3.md)                  |
| 3.3.4     | Error Prevention (Legal, Financial, Data) | Element               | [3.3.4](./criteria/3.3.4.md)                  |
| 4.1.2     | Name, Role, Value                         | Element               | [4.1.2](./criteria/4.1.2.md)                  |

Success criteria not listed here do not yet have judgment lines written. Read the Understanding document to judge, and add a file once the judgment lines are settled.
