# Vimtion

[![Chrome Web Store](https://img.shields.io/badge/chrome-extension-blue?logo=googlechrome&logoColor=white)](https://github.com/tatsuya/vim-notion)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-green)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![TypeScript](https://img.shields.io/badge/typescript-5.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

A Chrome extension that brings Vim keybindings to Notion, updated for modern Chrome compatibility.

## About This Project

This project is based on [lukeingalls/vim-notion](https://github.com/lukeingalls/vim-notion), originally created by [Luke Ingalls](https://www.linkedin.com/in/luke-ingalls/). The original project stopped being maintained and became incompatible with modern Chrome versions due to the Manifest V2 to V3 migration.

This fork has been extensively rebuilt with:

### Core Updates
- **Chrome Manifest V3** compatibility
- **Modern dependencies** (Parcel 2.x, TypeScript 5.x)
- **Improved cursor handling** with proper position tracking and column memory for j/k navigation

### New Features
- **Enhanced motions**: Cross-line navigation (h/l/w/b wrap to previous/next lines)
- **Line jumping**: `gg` (first line) and `G` (last line) support
- **Visual modes**: Character-wise (`v`) and line-wise (`V`) visual selection with full operator support
- **Operators with motions**: Comprehensive support for d/c/y with all motions (w/W/b/B/e/E/$0/iw)
- **Undo/Redo**: `u` for undo, `r` for redo (using native Notion history)
- **Mouse support**: Click to position cursor in normal mode
- **Better cursor visibility**: Enhanced block cursor with improved opacity and visibility on empty lines
- **Insert commands**: `a`, `A`, `I` for various insert positions

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

#### Basic Motions
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
| `gg` |   ✅     | Jump to first line                                                                                                                 |
| `G` |    ✅     | Jump to last line                                                                                                                  |
| `f{char}` | ✅  | Find character forward in line                                                                                                     |
| `F{char}` | ✅  | Find character backward in line                                                                                                    |
| `t{char}` | ✅  | Till (before) character forward in line                                                                                            |
| `T{char}` | ✅  | Till (after) character backward in line                                                                                            |

#### Mode Commands
| Key | Supported | Comments                                                                                                                           |
| :-: | :-------: | :--------------------------------------------------------------------------------------------------------------------------------- |
| `i` |    ✅     | Enter insert mode at cursor                                                                                                        |
| `I` |    ✅     | Enter insert mode at beginning of line                                                                                             |
| `a` |    ✅     | Enter insert mode after cursor                                                                                                     |
| `A` |    ✅     | Enter insert mode at end of line                                                                                                   |
| `o` |    ✅     | Open new line below and enter insert mode                                                                                          |
| `O` |    ✅     | Open new line above and enter insert mode                                                                                          |
| `v` |    ✅     | Enter visual mode (character-wise selection)                                                                                       |
| `V` |    ✅     | Enter visual line mode (line-wise selection)                                                                                       |
| `Esc` |  ✅     | Return to normal mode                                                                                                              |

#### Edit Commands
| Key | Supported | Comments                                                                                                                           |
| :-: | :-------: | :--------------------------------------------------------------------------------------------------------------------------------- |
| `x` |    ✅     | Delete character under cursor (copies to clipboard)                                                                                |
| `X` |    ✅     | Delete character before cursor                                                                                                     |
| `s` |    ✅     | Substitute character (delete and enter insert mode)                                                                                |
| `u` |    ✅     | Undo                                                                                                                                |
| `r` |    ✅     | Redo (Note: `r` is used for redo instead of replace character)                                                                     |
| `p` |    ✅     | Paste from clipboard after cursor                                                                                                  |
| `P` |    ✅     | Paste from clipboard before cursor                                                                                                 |
| `D` |    ✅     | Delete to end of line (same as `d$`)                                                                                               |
| `C` |    ✅     | Change to end of line (same as `c$`)                                                                                               |

#### Operators with Motions

**Delete operator (`d`)**
| Command | Supported | Comments                                                                                                                     |
| :-----: | :-------: | :--------------------------------------------------------------------------------------------------------------------------- |
| `dd`    |    ✅     | Delete entire line                                                                                                           |
| `dw`    |    ✅     | Delete to next word                                                                                                          |
| `dW`    |    ✅     | Delete to next WORD                                                                                                          |
| `de`    |    ✅     | Delete to end of word                                                                                                        |
| `dE`    |    ✅     | Delete to end of WORD                                                                                                        |
| `db`    |    ✅     | Delete to previous word                                                                                                      |
| `dB`    |    ✅     | Delete to previous WORD                                                                                                      |
| `d$`    |    ✅     | Delete to end of line                                                                                                        |
| `d0`    |    ✅     | Delete to beginning of line                                                                                                  |
| `diw`   |    ✅     | Delete inner word (word under cursor)                                                                                        |
| `df{char}` | ✅  | Delete find character (delete to and including character)                                                                    |
| `dF{char}` | ✅  | Delete find character backward                                                                                               |
| `dt{char}` | ✅  | Delete till character (delete up to but not including character)                                                             |
| `dT{char}` | ✅  | Delete till character backward                                                                                               |

**Change operator (`c`)**
| Command | Supported | Comments                                                                                                                     |
| :-----: | :-------: | :--------------------------------------------------------------------------------------------------------------------------- |
| `cc`    |    ✅     | Change entire line                                                                                                           |
| `cw`    |    ✅     | Change to next word                                                                                                          |
| `cW`    |    ✅     | Change to next WORD                                                                                                          |
| `ce`    |    ✅     | Change to end of word                                                                                                        |
| `cE`    |    ✅     | Change to end of WORD                                                                                                        |
| `cb`    |    ✅     | Change to previous word                                                                                                      |
| `cB`    |    ✅     | Change to previous WORD                                                                                                      |
| `c$`    |    ✅     | Change to end of line                                                                                                        |
| `c0`    |    ✅     | Change to beginning of line                                                                                                  |
| `ciw`   |    ✅     | Change inner word (word under cursor)                                                                                        |
| `cf{char}` | ✅  | Change find character (delete to and including character, enter insert mode)                                                 |
| `cF{char}` | ✅  | Change find character backward                                                                                               |
| `ct{char}` | ✅  | Change till character (delete up to but not including character, enter insert mode)                                          |
| `cT{char}` | ✅  | Change till character backward                                                                                               |

**Yank operator (`y`)**
| Command | Supported | Comments                                                                                                                     |
| :-----: | :-------: | :--------------------------------------------------------------------------------------------------------------------------- |
| `yy`    |    ✅     | Yank entire line                                                                                                             |
| `yw`    |    ✅     | Yank to next word                                                                                                            |
| `yW`    |    ✅     | Yank to next WORD                                                                                                            |
| `ye`    |    ✅     | Yank to end of word                                                                                                          |
| `yE`    |    ✅     | Yank to end of WORD                                                                                                          |
| `yb`    |    ✅     | Yank to previous word                                                                                                        |
| `yB`    |    ✅     | Yank to previous WORD                                                                                                        |
| `y$`    |    ✅     | Yank to end of line                                                                                                          |
| `y0`    |    ✅     | Yank to beginning of line                                                                                                    |
| `yiw`   |    ✅     | Yank inner word (word under cursor)                                                                                          |

#### Visual Mode
In visual mode (`v` or `V`), you can use motions to extend selection and operators to act on the selection:

**Visual character-wise mode (`v`)**
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
| `d`/`x` | ✅   | Delete selection                                                                                                                   |
| `y` |    ✅     | Yank (copy) selection                                                                                                              |
| `c` |    ✅     | Change selection (delete and enter insert mode)                                                                                    |

**Visual line mode (`V`)**
| Key | Supported | Comments                                                                                                                           |
| :-: | :-------: | :--------------------------------------------------------------------------------------------------------------------------------- |
| `j` |    ✅     | Extend selection down one line                                                                                                     |
| `k` |    ✅     | Extend selection up one line                                                                                                       |
| `d`/`x` | ✅   | Delete selected lines                                                                                                              |
| `y` |    ✅     | Yank (copy) selected lines                                                                                                         |
| `c` |    ✅     | Change selected lines (delete and enter insert mode)                                                                               |

## Known Limitations

### Multi-line Paste
When you yank multiple lines using Visual line mode (`V` + selection + `y`), the text is correctly copied to your system clipboard with newlines preserved. However, the `p` command currently cannot properly paste multi-line content as separate Notion blocks.

**Workaround**: After yanking multiple lines with `Vy`, use your browser's native paste command instead:
- **macOS**: `Cmd+V`
- **Windows/Linux**: `Ctrl+V`

This will correctly create separate Notion blocks for each line. Single-line paste with `p` works as expected.

## Notes

### Feature Limitations

**Search functionality** (`/`, `?`, `n`, `N`, `*`, `#`): Not planned due to complexity and Notion's built-in search.

**Marks** (`m`, `'`, `` ` ``): Not essential for basic editing workflow.

**Macros** (`q`, `@`): Complex to implement and not essential for most users.

**Screen-based motions** (`H`, `M`, `L`): Not meaningful in Notion's infinite scroll context.

**Block operations** (`J` join lines, `<`/`>` indent): Notion's block-based structure has its own system.

**Advanced features** (`.` repeat, `~` toggle case, `%` bracket matching, `R` replace mode): Not essential for core editing.

**Special note**: `r` is used for **redo** instead of vim's default "replace character" to provide undo/redo functionality. Use `Ctrl+r` for vim's traditional redo if needed.

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
