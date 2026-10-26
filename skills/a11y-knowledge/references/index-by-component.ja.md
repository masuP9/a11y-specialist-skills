[English](./index-by-component.md)

# 部品からの索引

コードを書く・レビューするときは、部品の種類からその部品に問われる達成基準を引く。部品の種類は ARIA の役割（role）でまとめている。表に無い役割は、いちばん近い種類を見る。

- 2.5.5 は AAA。既定では問わないが、ターゲットのサイズを 44px 以上にする方針のプロジェクトでは見る。
- button / link / input に 1.1.1 が無いのは意図的。画像だけのボタンやリンクは中の画像の側で 1.1.1 を見る。文字の入力欄は非テキストコンテンツではない。`<input type="image">` は中に画像が無いので、ボタン自体の名前（alt）を 1.1.1 で見る（[1.1.1](./criteria/1.1.1.ja.md)）。
- `dialog` / `alertdialog` に 4.1.2 が無いのは意図的。ダイアログは操作部品の入れ物で、4.1.2 の user interface component ではない（[4.1.2](./criteria/4.1.2.ja.md)）。ダイアログの名前は 1.3.1 と 2.4.6 の話として付ける。
- ページ全体・複数ページの達成基準（2.4.1、2.4.2、3.1.1、1.4.1、1.3.3、3.2.3、3.2.4、3.2.6）は部品に付かない。[index-by-criterion](./index-by-criterion.ja.md) から引く。

| 部品の種類           | 役割（role）                                                       | 問われる達成基準                                                               |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| button               | button                                                             | 1.3.1、2.1.1、2.4.3、2.4.7、2.5.5、2.5.8、4.1.2                                 |
| link                 | link                                                               | 1.3.1、2.1.1、2.4.3、2.4.4、2.4.7、2.5.5、2.5.8、4.1.2                           |
| input                | textbox、searchbox、spinbutton                                     | 1.3.1、1.3.5、2.1.1、2.4.3、2.4.7、3.2.1、3.2.2、3.3.1、3.3.2、4.1.2             |
| checkbox             | checkbox                                                           | 1.3.1、2.1.1、2.4.3、2.4.7、2.5.8、3.2.2、3.3.2、4.1.2                           |
| radio                | radio                                                              | 1.3.1、2.1.1、2.4.3、2.4.7、2.5.8、3.2.2、3.3.2、4.1.2                           |
| switch               | switch                                                             | 1.3.1、2.1.1、2.4.3、2.4.7、2.5.8、3.2.2、3.3.2、4.1.2                           |
| combobox             | combobox                                                           | 1.3.1、1.3.5、2.1.1、2.4.3、2.4.7、2.5.8、3.2.2、3.3.2、4.1.2                    |
| listbox              | listbox                                                            | 1.3.1、2.1.1、2.4.3、2.4.7、3.3.2、4.1.2                                         |
| slider               | slider                                                             | 1.3.1、2.1.1、2.4.3、2.4.7、2.5.8、3.3.2、4.1.2                                  |
| tab                  | tab                                                                | 2.1.1、2.4.7、2.5.8、4.1.2                                                      |
| tablist              | tablist                                                            | 1.3.1、2.1.1、4.1.2                                                             |
| menuitem             | menuitem、menuitemcheckbox、menuitemradio                          | 2.1.1、2.4.7、2.5.8、4.1.2                                                      |
| menu                 | menu、menubar                                                      | 1.3.1、2.1.1、4.1.2                                                             |
| option               | option                                                             | 2.1.1、2.4.7、2.5.8、4.1.2                                                      |
| treeitem             | treeitem                                                           | 2.1.1、2.4.7、4.1.2                                                             |
| tree                 | tree                                                               | 1.3.1、2.1.1、4.1.2                                                             |
| gridcell             | gridcell                                                           | 2.1.1、2.4.7、4.1.2                                                             |
| grid                 | grid                                                               | 1.3.1、2.1.1、4.1.2                                                             |
| rowheader / columnheader | rowheader、columnheader                                        | 1.3.1                                                                           |
| table                | table、rowgroup、cell                                              | 1.3.1、1.3.2                                                                    |
| image                | img、figure                                                        | 1.1.1、1.4.5                                                                    |
| video                | `<video>` 要素（ARIA の役割は無い）                                | 1.2.2、1.4.2（自動再生するとき）                                                |
| heading              | heading                                                            | 1.3.1、2.4.6                                                                    |
| landmark             | banner、main、contentinfo、complementary、region、search           | 1.3.1、2.4.1                                                                    |
| navigation           | navigation                                                         | 1.3.1、2.4.1、2.4.5、3.2.3（複数ページ）                                          |
| form                 | form                                                               | 1.3.1、3.3.1、3.3.2、3.3.3、3.3.4                                               |
| modal                | dialog、alertdialog                                                | 1.3.1、2.1.1、2.1.2、2.4.3                                                      |
| list                 | list                                                               | 1.3.1                                                                           |
| article              | article                                                            | 1.3.1                                                                           |
| alert / status / log | alert、status、log                                                 | 4.1.3                                                                           |
| progress             | progressbar                                                        | 4.1.2、4.1.3                                                                    |

この表は部品ごとに「問うに値する」達成基準に絞っているので、WCAG の全基準の対応表ではない（例: link に 1.1.1 が無いのは、画像だけのリンクの代替テキストは中の画像の側で見るため。[1.1.1](./criteria/1.1.1.ja.md)）。
