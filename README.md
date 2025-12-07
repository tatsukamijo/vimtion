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
| `h` |    ✅     | Move cursor left                                                                                                                   |
| `j` |    ✅     | Move cursor down (preserves column position!)                                                                                      |
| `k` |    ✅     | Move cursor up (preserves column position!)                                                                                        |
| `l` |    ✅     | Move cursor right                                                                                                                  |
| `w` |    ✅     | Jump to next word                                                                                                                  |
| `b` |    ✅     | Jump to previous word                                                                                                              |
| `W` |    ✅     | Jump to next WORD (space-separated)                                                                                                |
| `B` |    ✅     | Jump to previous WORD (space-separated)                                                                                            |
| `0` |    ✅     | Jump to beginning of line                                                                                                          |
| `$` |    ✅     | Jump to end of line                                                                                                                |
| `i` |    ✅     | Enter insert mode                                                                                                                  |
| `a` |    ✅     | Enter insert mode (same as `i` for now)                                                                                            |
| `A` |    ✅     | Insert at end of line                                                                                                              |
| `I` |    ✅     | Insert at beginning of line                                                                                                        |
| `Esc` |  ✅     | Return to normal mode                                                                                                              |

### Planned Support

| Key | Supported | Comments                                                                                                        |
| :-: | :-------: | :-------------------------------------------------------------------------------------------------------------- |
| `e` |     🗓     | Jump to end of word                                                                                             |
| `E` |     🗓     | Jump to end of WORD                                                                                             |
| `g` |     🗓     | Limited support planned. Will only support gg.                                                                  |
| `G` |     🗓     | Jump to last line                                                                                               |
| `x` |     🗓     | Delete character                                                                                                |
| `d` |     🗓     | Delete operator                                                                                                 |
| `c` |     🗓     | Change operator                                                                                                 |
| `y` |     🗓     | Yank (copy) operator                                                                                            |
| `p` |     🗓     | Paste                                                                                                           |
| `o` |     🗓     | Open new line below                                                                                             |
| `O` |     🗓     | Open new line above                                                                                             |
| `A` |     🗓     | Insert at end of line                                                                                           |
| `I` |     🗓     | Insert at beginning of line                                                                                     |
| `f` |     🗓     | Find character forward                                                                                          |
| `F` |     🗓     | Find character backward                                                                                         |
| `t` |     🗓     | Till character forward                                                                                          |
| `T` |     🗓     | Till character backward                                                                                         |
| `r` |     🗓     | Replace character                                                                                               |
| `C` |     🗓     | Change to end of line                                                                                           |
| `D` |     🗓     | Delete to end of line                                                                                           |
| `P` |     🗓     | Paste before cursor                                                                                             |
| `X` |     🗓     | Delete character before cursor                                                                                  |

### No Support Planned

| Key | Supported |
| :-: | :-------: |
| `m` |    ❌     |
| `n` |    ❌     |
| `q` |    ❌     |
| `s` |    ❌     |
| `u` |    ❌     |
| `v` |    ❌     |
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
