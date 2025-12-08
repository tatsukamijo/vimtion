# Vimtion

[![Chrome Web Store](https://img.shields.io/badge/chrome-extension-blue?logo=googlechrome&logoColor=white)](https://github.com/tatsuya/vim-notion)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-green)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![TypeScript](https://img.shields.io/badge/typescript-5.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

A Chrome extension that brings Vim keybindings to Notion, updated for modern Chrome compatibility.


https://github.com/user-attachments/assets/b4f2f922-dfe6-40ca-a4aa-6f7a3f89ebb3


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
- **Page navigation**: `Ctrl+d/u` (half page), `Ctrl+f/b` (full page) with smooth scrolling
- **Visual modes**: Character-wise (`v`) and line-wise (`V`) visual selection with full operator support
- **Operators with motions**: Comprehensive support for d/c/y with all motions (w/W/b/B/e/E/$0/iw)
- **Text objects**: Full support for `i`(inner) and `a`(around) with brackets, quotes (e.g., `ci(`, `da"`, `yi{`)
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

### Motions
**Basic**: `h` `j` `k` `l` (with line wrapping) • `w` `b` `e` `W` `B` `E` (word motions) • `0` `$` (line start/end) • `gg` `G` (document start/end)
**Find**: `f{char}` `F{char}` `t{char}` `T{char}` (find/till character)
**Page navigation**: `Ctrl+d` (half down) • `Ctrl+u` (half up) • `Ctrl+f` (full down) • `Ctrl+b` (full up)

### Modes
**Insert**: `i` `I` `a` `A` `o` `O` • **Visual**: `v` (char) `V` (line) • **Normal**: `Esc`

### Editing
**Delete**: `x` `X` `s` `D` • **Undo/Redo**: `u` `r` • **Paste**: `p` `P`

### Operators with Motions
All operators (`d` delete, `c` change, `y` yank) work with all motions:
- **Lines**: `dd` `cc` `yy`
- **Words**: `dw` `cw` `yw` `de` `ce` `ye` `db` `cb` `yb` (also `W` `B` `E` variants)
- **Line parts**: `d$` `c$` `y$` `d0` `c0` `y0` `D` `C`
- **Find**: `df{char}` `cf{char}` `dt{char}` `ct{char}` (also `F` `T` variants)

### Text Objects

Operate on text inside or around delimiters. All operators (`d`, `c`, `y`) work with text objects:

**Supported delimiters**: `w` (word) • `(` `)` `b` (parentheses) • `[` `]` (brackets) • `{` `}` `B` (braces) • `'` `"` (quotes)

**Inner (`i`)**: Content only
- `ciw` `diw` `yiw` - word under cursor
- `ci(` `di(` `yi(` - inside `()`
- `ci[` `di[` `yi[` - inside `[]`
- `ci{` `di{` `yi{` - inside `{}`
- `ci'` `di'` `yi'` - inside `''`
- `ci"` `di"` `yi"` - inside `""`

**Around (`a`)**: Content + delimiters
- `ca(` `da(` `ya(` - including `()`
- `ca[` `da[` `ya[` - including `[]`
- `ca{` `da{` `ya{` - including `{}`
- `ca'` `da'` `ya'` - including `''`
- `ca"` `da"` `ya"` - including `""`

**Example**: In `text (example) text` with cursor on `example`:
- `ci(` → leaves `()`, enters insert mode
- `di(` → leaves `()`
- `ca(` → removes `(example)`, enters insert mode

### Visual Mode

**Character-wise (`v`)**: Select with `h` `l` `w` `b` `e` `0` `$`, then `d` `y` `c`
**Line-wise (`V`)**: Select with `j` `k`, then `d` `y` `c`

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
