# Vimtion

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

#### Mode Commands
| Key | Supported | Comments                                                                                                                           |
| :-: | :-------: | :--------------------------------------------------------------------------------------------------------------------------------- |
| `i` |    ✅     | Enter insert mode at cursor                                                                                                        |
| `I` |    ✅     | Enter insert mode at beginning of line                                                                                             |
| `a` |    ✅     | Enter insert mode after cursor                                                                                                     |
| `A` |    ✅     | Enter insert mode at end of line                                                                                                   |
| `v` |    ✅     | Enter visual mode (character-wise selection)                                                                                       |
| `V` |    ✅     | Enter visual line mode (line-wise selection)                                                                                       |
| `Esc` |  ✅     | Return to normal mode                                                                                                              |

#### Edit Commands
| Key | Supported | Comments                                                                                                                           |
| :-: | :-------: | :--------------------------------------------------------------------------------------------------------------------------------- |
| `x` |    ✅     | Delete character under cursor (copies to clipboard)                                                                                |
| `s` |    ✅     | Substitute character (delete and enter insert mode)                                                                                |
| `u` |    ✅     | Undo                                                                                                                                |
| `r` |    ✅     | Redo (Note: `r` is used for redo instead of replace character)                                                                     |
| `p` |    ✅     | Paste from clipboard after cursor                                                                                                  |

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

### Planned Support

| Command | Supported | Comments                                                                                                        |
| :-----: | :-------: | :-------------------------------------------------------------------------------------------------------------- |
| `o`     |     🗓     | Open new line below and enter insert mode                                                                       |
| `O`     |     🗓     | Open new line above and enter insert mode                                                                       |
| `f{char}` |   🗓     | Find character forward in line                                                                                  |
| `F{char}` |   🗓     | Find character backward in line                                                                                 |
| `t{char}` |   🗓     | Till (before) character forward in line                                                                         |
| `T{char}` |   🗓     | Till (after) character backward in line                                                                         |
| `dt{char}` |  🗓     | Delete till character                                                                                           |
| `ct{char}` |  🗓     | Change till character                                                                                           |
| `df{char}` |  🗓     | Delete find character                                                                                           |
| `cf{char}` |  🗓     | Change find character                                                                                           |
| `C`     |     🗓     | Change to end of line (same as `c$`)                                                                            |
| `D`     |     🗓     | Delete to end of line (same as `d$`)                                                                            |
| `P`     |     🗓     | Paste before cursor                                                                                             |
| `X`     |     🗓     | Delete character before cursor                                                                                  |

### No Support Planned

**Note**: `r` is used for redo instead of replace character (vim's default behavior).

The following commands are not planned for support:

| Command | Vim Function | Reason                                                                                         |
| :-----: | :----------- | :--------------------------------------------------------------------------------------------- |
| `r{char}` | Replace character | Conflicting with redo functionality                                                      |
| `m{char}` | Set mark | Marks are complex and not essential for basic editing                                          |
| `'{char}` | Jump to mark | Marks not supported                                                                         |
| `` `{char} `` | Jump to mark position | Marks not supported                                                              |
| `n`     | Repeat search | Search functionality not planned                                                               |
| `N`     | Repeat search backward | Search functionality not planned                                                      |
| `/`     | Search forward | Search functionality not planned                                                             |
| `?`     | Search backward | Search functionality not planned                                                            |
| `*`     | Search word under cursor | Search functionality not planned                                                   |
| `#`     | Search word under cursor backward | Search functionality not planned                                      |
| `q{char}` | Record macro | Macros are complex and not essential                                                        |
| `@{char}` | Play macro | Macros not supported                                                                        |
| `z{command}` | Folding commands | Notion doesn't have folding                                                       |
| `H`     | Jump to top of screen | Not meaningful in Notion's context                                                |
| `M`     | Jump to middle of screen | Not meaningful in Notion's context                                             |
| `L`     | Jump to bottom of screen | Not meaningful in Notion's context                                             |
| `J`     | Join lines | Complex in Notion's block-based structure                                                     |
| `K`     | Lookup | Not applicable                                                                                  |
| `Q`     | Ex mode | Not applicable                                                                                  |
| `R`     | Replace mode | Not essential for basic editing                                                               |
| `S`     | Substitute line | Similar to `cc`                                                                             |
| `Y`     | Yank line | Similar to `yy`                                                                                 |
| `Z{command}` | Save and quit | Not applicable in browser extension                                                |
| `.`     | Repeat last command | Complex to implement, not essential                                                   |
| `~`     | Toggle case | Not essential for basic editing                                                                |
| `<`/`>` | Indent/dedent | Notion has its own indent system                                                              |
| `%`     | Jump to matching bracket | Complex to implement in Notion                                                  |
| Ctrl+r  | Redo (vim default) | Conflicting with browser shortcuts, using `r` instead                                |

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
