[日本語版 (Japanese)](./index-by-component.ja.md)

# Index by component

When writing or reviewing code, look up, from the component type, the success criteria that apply to that component. Component types are grouped by ARIA role. For a role not in the table, look at the closest type.

- 2.5.5 is AAA. It is not asked by default, but projects with a policy of making targets 44px or larger should check it.
- The absence of 4.1.2 for `dialog` / `alertdialog` is deliberate. A dialog is a container for interactive components, not a user interface component in the sense of 4.1.2 ([4.1.2](./criteria/4.1.2.md)). Give the dialog a name as a matter of 1.3.1 and 2.4.6.
- Whole-page and multiple-page success criteria (2.4.1, 2.4.2, 3.1.1, 1.4.1, 1.3.3, 3.2.3, 3.2.4, 3.2.6) are not attached to components. Look them up from [index-by-criterion](./index-by-criterion.md).

| Component type           | Role                                                               | Success criteria that apply                                                     |
| ------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| button                   | button                                                             | 1.1.1 (when image-only), 1.3.1, 2.1.1, 2.4.3, 2.4.7, 2.5.5, 2.5.8, 4.1.2        |
| link                     | link                                                               | 1.3.1, 2.1.1, 2.4.3, 2.4.4, 2.4.7, 2.5.5, 2.5.8, 4.1.2                          |
| input                    | textbox, searchbox, spinbutton                                     | 1.1.1, 1.3.1, 1.3.5, 2.1.1, 2.4.3, 2.4.7, 3.2.1, 3.2.2, 3.3.1, 3.3.2, 4.1.2     |
| checkbox                 | checkbox                                                           | 1.3.1, 2.1.1, 2.4.3, 2.4.7, 2.5.8, 3.2.2, 3.3.2, 4.1.2                          |
| radio                    | radio                                                              | 1.3.1, 2.1.1, 2.4.3, 2.4.7, 2.5.8, 3.2.2, 3.3.2, 4.1.2                          |
| switch                   | switch                                                             | 1.3.1, 2.1.1, 2.4.3, 2.4.7, 2.5.8, 3.2.2, 3.3.2, 4.1.2                          |
| combobox                 | combobox                                                           | 1.3.1, 1.3.5, 2.1.1, 2.4.3, 2.4.7, 2.5.8, 3.2.2, 3.3.2, 4.1.2                   |
| listbox                  | listbox                                                            | 1.3.1, 2.1.1, 2.4.3, 2.4.7, 3.3.2, 4.1.2                                        |
| slider                   | slider                                                             | 1.3.1, 2.1.1, 2.4.3, 2.4.7, 2.5.8, 3.3.2, 4.1.2                                 |
| tab                      | tab                                                                | 2.1.1, 2.4.7, 2.5.8, 4.1.2                                                      |
| tablist                  | tablist                                                            | 1.3.1, 2.1.1, 4.1.2                                                             |
| menuitem                 | menuitem, menuitemcheckbox, menuitemradio                          | 2.1.1, 2.4.7, 2.5.8, 4.1.2                                                      |
| menu                     | menu, menubar                                                      | 1.3.1, 2.1.1, 4.1.2                                                             |
| option                   | option                                                             | 2.1.1, 2.4.7, 2.5.8, 4.1.2                                                      |
| treeitem                 | treeitem                                                           | 2.1.1, 2.4.7, 4.1.2                                                             |
| tree                     | tree                                                               | 1.3.1, 2.1.1, 4.1.2                                                             |
| gridcell                 | gridcell                                                           | 2.1.1, 2.4.7, 4.1.2                                                             |
| grid                     | grid                                                               | 1.3.1, 2.1.1, 4.1.2                                                             |
| rowheader / columnheader | rowheader, columnheader                                            | 1.3.1                                                                           |
| table                    | table, rowgroup, cell                                              | 1.3.1, 1.3.2                                                                    |
| image                    | img, figure                                                        | 1.1.1, 1.4.5                                                                    |
| video                    | `<video>` element (no ARIA role)                                   | 1.2.2, 1.4.2 (when it autoplays)                                                |
| heading                  | heading                                                            | 1.3.1, 2.4.6                                                                    |
| landmark                 | banner, main, contentinfo, complementary, region, search           | 1.3.1, 2.4.1                                                                    |
| navigation               | navigation                                                         | 1.3.1, 2.4.1, 2.4.5, 3.2.3 (multiple pages)                                     |
| form                     | form                                                               | 1.3.1, 3.3.1, 3.3.2, 3.3.3, 3.3.4                                               |
| modal                    | dialog, alertdialog                                                | 1.3.1, 2.1.1, 2.1.2, 2.4.3                                                      |
| list                     | list                                                               | 1.3.1                                                                           |
| article                  | article                                                            | 1.3.1                                                                           |
| alert / status / log     | alert, status, log                                                 | 4.1.3                                                                           |
| progress                 | progressbar                                                        | 4.1.2, 4.1.3                                                                    |

This table is narrowed to the success criteria "worth asking" per component, so it is not a mapping of every WCAG criterion (for example, link has no 1.1.1 because the alternative text of an image-only link is checked on the image inside it. See [1.1.1](./criteria/1.1.1.md)).
