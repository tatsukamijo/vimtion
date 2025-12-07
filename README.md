# Vimtion

A Chrome extension that brings Vim keybindings to Notion, updated for modern Chrome compatibility.

## About This Project

This project is based on [lukeingalls/vim-notion](https://github.com/lukeingalls/vim-notion), originally created by [Luke Ingalls](https://www.linkedin.com/in/luke-ingalls/). The original project stopped being maintained around 4 years ago and became incompatible with modern Chrome versions due to the Manifest V2 to V3 migration.

This fork has been updated to:
- **Chrome Manifest V3** compatibility
- **Modern dependencies** (Parcel 2.x, TypeScript 5.x)
- **Improved vim keybindings** with proper cursor position handling and column memory for j/k navigation

## Installation

**Local Installation**:
1. Clone this repository
2. Run `npm install` (or `yarn install`)
3. Run `npm run build` (or `yarn build`)
4. Load the `dist` folder as an unpacked extension in Chrome
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` folder

[How to install unpacked extensions in Chrome](https://webkul.com/blog/how-to-install-the-unpacked-extension-in-chrome/)

## Supported Commands

| Support Icon |      Definition      |
| :----------: | :------------------: |
|      🗓       |  Support is planned  |
|      ✅      | Feature is Supported |
|      ❌      |  No support planned  |

### Currently Working Commands

| Key | Supported | Comments                                                                                                                           |
| :-: | :-------: | :--------------------------------------------------------------------------------------------------------------------------------- |
| `h` |    ✅     | Move cursor left (wraps to previous line)                                                                                         |
| `j` |    ✅     | Move cursor down (preserves column position!)                                                                                      |
| `k` |    ✅     | Move cursor up (preserves column position!)                                                                                        |
| `l` |    ✅     | Move cursor right (wraps to next line)                                                                                             |
| `w` |    ✅     | Jump to next word (wraps to next line)                                                                                             |
| `b` |    ✅     | Jump to previous word (wraps to previous line)                                                                                     |
| `e` |    ✅     | Jump to end of word                                                                                                                |
| `W` |    ✅     | Jump to next WORD (space-separated)                                                                                                |
| `B` |    ✅     | Jump to previous WORD (space-separated)                                                                                            |
| `E` |    ✅     | Jump to end of WORD                                                                                                                |
| `0` |    ✅     | Jump to beginning of line                                                                                                          |
| `$` |    ✅     | Jump to end of line                                                                                                                |
| `i` |    ✅     | Enter insert mode                                                                                                                  |
| `a` |    ✅     | Enter insert mode after cursor                                                                                                     |
| `A` |    ✅     | Insert at end of line                                                                                                              |
| `I` |    ✅     | Insert at beginning of line                                                                                                        |
| `x` |    ✅     | Delete character under cursor (copies to clipboard)                                                                                |
| `s` |    ✅     | Substitute character (delete and enter insert mode)                                                                                |
| `v` |    ✅     | Enter visual mode (character-wise selection)                                                                                       |
| `V` |    ✅     | Enter visual line mode (line-wise selection, supports multi-line with j/k)                                                         |
| `d` |    ✅     | Delete operator - works with motions and in visual mode (copies to clipboard)                                                     |
| `dd` |   ✅     | Delete entire line                                                                                                                 |
| `dw` |   ✅     | Delete to next word                                                                                                                |
| `d$` |   ✅     | Delete to end of line                                                                                                              |
| `d0` |   ✅     | Delete to beginning of line                                                                                                        |
| `diw` |  ✅     | Delete inner word (word under cursor)                                                                                              |
| `c` |    ✅     | Change operator - deletes and enters insert mode, works with motions                                                               |
| `cc` |   ✅     | Change entire line                                                                                                                 |
| `cw` |   ✅     | Change to next word                                                                                                                |
| `c$` |   ✅     | Change to end of line                                                                                                              |
| `c0` |   ✅     | Change to beginning of line                                                                                                        |
| `ciw` |  ✅     | Change inner word (word under cursor)                                                                                              |
| `y` |    ✅     | Yank (copy) operator - works with motions and in visual mode                                                                       |
| `yy` |   ✅     | Yank entire line                                                                                                                   |
| `yw` |   ✅     | Yank to next word                                                                                                                  |
| `y$` |   ✅     | Yank to end of line                                                                                                                |
| `y0` |   ✅     | Yank to beginning of line                                                                                                          |
| `yiw` |  ✅     | Yank inner word (word under cursor)                                                                                                |
| `p` |    ✅     | Paste from clipboard after cursor                                                                                                  |
| `u` |    ✅     | Undo                                                                                                                                |
| `r` |    ✅     | Redo                                                                                                                                |
| `Esc` |  ✅     | Return to normal mode                                                                                                              |

#### Visual Mode Motions
When in visual mode (`v`), you can use these motions to extend the selection:
| Key | Supported | Comments                                                                                                                           |
| :-: | :-------: | :--------------------------------------------------------------------------------------------------------------------------------- |
| `h` |    ✅     | Extend selection left                                                                                                              |
| `l` |    ✅     | Extend selection right                                                                                                             |
| `w` |    ✅     | Extend selection to next word                                                                                                      |
| `b` |    ✅     | Extend selection to previous word                                                                                                  |
| `e` |    ✅     | Extend selection to end of word                                                                                                    |
| `W` |    ✅     | Extend selection to next WORD                                                                                                      |
| `B` |    ✅     | Extend selection to previous WORD                                                                                                  |
| `E` |    ✅     | Extend selection to end of WORD                                                                                                    |
| `0` |    ✅     | Extend selection to beginning of line                                                                                              |
| `$` |    ✅     | Extend selection to end of line                                                                                                    |

#### Visual Line Mode Motions
When in visual line mode (`V`), you can use these motions:
| Key | Supported | Comments                                                                                                                           |
| :-: | :-------: | :--------------------------------------------------------------------------------------------------------------------------------- |
| `j` |    ✅     | Extend selection down one line                                                                                                     |
| `k` |    ✅     | Extend selection up one line                                                                                                       |

### Planned Support

| Key | Supported | Comments                                                                                                        |
| :-: | :-------: | :-------------------------------------------------------------------------------------------------------------- |
| `g` |     🗓     | Limited support planned. Will only support gg.                                                                  |
| `G` |     🗓     | Jump to last line                                                                                               |
| `o` |     🗓     | Open new line below                                                                                             |
| `O` |     🗓     | Open new line above                                                                                             |
| `f` |     🗓     | Find character forward                                                                                          |
| `F` |     🗓     | Find character backward                                                                                         |
| `t` |     🗓     | Till character forward                                                                                          |
| `T` |     🗓     | Till character backward                                                                                         |
| `C` |     🗓     | Change to end of line                                                                                           |
| `D` |     🗓     | Delete to end of line                                                                                           |
| `P` |     🗓     | Paste before cursor                                                                                             |
| `X` |     🗓     | Delete character before cursor                                                                                  |

### No Support Planned

**Note**: `r` is used for redo instead of replace character (vim's default behavior). Replace character functionality is not supported.

| Key | Supported |
| :-: | :-------: |
| `m` |    ❌     |
| `n` |    ❌     |
| `q` |    ❌     |
| `z` |    ❌     |
| `H` |    ❌     |
| `J` |    ❌     |
| `K` |    ❌     |
| `L` |    ❌     |
| `M` |    ❌     |
| `N` |    ❌     |
| `Q` |    ❌     |
| `R` |    ❌     |
| `S` |    ❌     |
| `U` |    ❌     |
| `V` |    ❌     |
| `Y` |    ❌     |
| `Z` |    ❌     |

## Development

```bash
# Install dependencies
npm install

# Build the extension
npm run build

# The built extension will be in the dist/ folder
```

## Credits

Original implementation by [Luke Ingalls](https://github.com/lukeingalls) - [vim-notion](https://github.com/lukeingalls/vim-notion)

## License

ISC License - see LICENSE file for details

Original implementation Copyright (c) 2020 Luke Ingalls
