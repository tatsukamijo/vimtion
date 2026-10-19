<p align="center">
  <img src="https://github.com/user-attachments/assets/9fe8d591-6d61-4b15-9ea2-5b34b3765eb9" alt="Vimtion logo" width="160">
</p>

<h1 align="center">Vimtion: Vim for Notion</h1>

<p align="center">
  <strong>Vim keybindings for Notion</strong><br>
  Bring the power of Vim to your Notion workflow.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/vimtion-vim-for-notion/omcehhihhemhincacmandepjhhnjfeoo">
    <img src="https://img.shields.io/chrome-web-store/users/omcehhihhemhincacmandepjhhnjfeoo?style=flat-square&logo=googlechrome&logoColor=white&label=users&color=4285F4">
  </a>
  <a href="https://developer.chrome.com/docs/extensions/mv3/intro/">
    <img src="https://img.shields.io/badge/manifest-v3-4285F4?style=flat-square&logo=googlechrome&logoColor=white">
  </a>
  <a href="https://www.typescriptlang.org/">
    <img src="https://img.shields.io/badge/typescript-5.3-3178c6?style=flat-square&logo=typescript&logoColor=white">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-ISC-555?style=flat-square">
  </a>
</p>


https://github.com/user-attachments/assets/714e00e9-bf4a-4619-9175-0ff499f4c828


## 📖 About This Project

This project is based on [lukeingalls/vim-notion](https://github.com/lukeingalls/vim-notion), originally created by [Luke Ingalls](https://www.linkedin.com/in/luke-ingalls/). The original project stopped being maintained and became incompatible with modern Chrome versions due to the Manifest V2 to V3 migration.

This fork has been extensively rebuilt with:

### Core Updates
- **Chrome Manifest V3** compatibility
- **Modern dependencies** (Parcel 2.x, TypeScript 5.x)
- **Improved cursor handling** with proper position tracking and column memory for j/k navigation

### New Features
- **Link hint mode** (`gl`): Vimium-style link navigation with keyboard hints - type characters to filter and jump to any link instantly
- **Link navigation** (`Enter`): Navigate and open links - supports external links, block links, and intelligent Notion page link selection with `j/k` navigation
- **Enhanced motions**: Cross-line navigation (h/l/w/b wrap to previous/next lines), paragraph navigation (`{`/`}`)
- **Line jumping**: `gg` (first line) and `G` (last line) support
- **Page navigation**: `Ctrl+d/u` (half page), `Ctrl+f/b` (full page) with smooth scrolling
- **Counts and repeat**: `3j`, `2dd`, `d3w`, `10G` and the rest of Vim's counts, plus `.` to repeat the last change
- **Visual modes**: Character-wise (`v`) and line-wise (`V`) visual selection with full operator and text object support
- **Operators with motions**: Comprehensive support for d/c/y with all motions (w/W/b/B/e/E/$0/{/}/iw/ip/ap)
- **Text objects**: Full support for `i`(inner) and `a`(around) in both normal and visual modes with brackets, quotes, paragraphs, and more (e.g., `ci(`, `da"`, `yi{`, `vi(`, `va'`, `cip`, `dap`)
- **Undo/Redo**: `u` for undo, `r` for redo with intelligent grouping for multi-line operations
- **Mouse support**: Click to position cursor in normal mode
- **Better cursor visibility**: Enhanced block cursor with improved opacity and visibility on empty lines
- **Insert commands**: `a`, `A`, `I` for various insert positions

## 🚀 Installation

**Chrome Web Store** (Recommended):

Add it directly from the Chrome Web Store: [Vimtion](https://chromewebstore.google.com/detail/vimtion/omcehhihhemhincacmandepjhhnjfeoo)

**Local Installation** (For development):
1. Clone this repository
2. Run `npm install` (or `yarn install`)
3. Run `npm run build` (or `yarn build`)
4. Load the `dist` folder as an unpacked extension in Chrome
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` folder

[How to install unpacked extensions in Chrome](https://webkul.com/blog/how-to-install-the-unpacked-extension-in-chrome/)

## ⚙️ Options
<img width="1701" height="1052" alt="vimtion_options" src="https://github.com/user-attachments/assets/44926f70-819b-4ab8-8301-3c05db971e0c" />

Vimtion can be customized through the Options page. You can configure:

- Mode indicator position and colors
- Cursor colors and blink settings
- Visual selection colors
- Vimium-style link hints colors/font size

To access the Options page:
1. Right-click the Vimtion extension icon in Chrome
2. Select "Options"

## ✅ Supported Commands

### Motions
**Basic**: `h` `j` `k` `l` (with line wrapping) • `w` `b` `e` `W` `B` `E` (word motions) • `0` `$` (line start/end) • `gg` `G` (document start/end)
**Paragraph**: `{` (previous paragraph) • `}` (next paragraph)
**History**: `H` (back) • `L` (forward)
**Find**: `f{char}` `F{char}` `t{char}` `T{char}` (find/till character) • `;` `,` (repeat) • `%` (matching bracket)
**Search**: `/` `?` (search forward/backward) • `n` `N` (next/previous) • `*` `#` (word under cursor) — every match is highlighted as you type, the status bar shows `[2/5]`, and `Esc` clears the highlight
**Page navigation**: `Ctrl+d` (half down) • `Ctrl+u` (half up) • `Ctrl+f` (full down) • `Ctrl+b` (full up)

**Databases**: `j` `k` move onto and between database rows (the row is highlighted, the status bar shows `Row 2/5`) • `Enter` opens the row the way the database opens pages (side peek by default), `Shift+Enter` in a new tab • `o` adds a page to the database and starts on its title • `Esc` leaves the rows

**Side peek**: `Ctrl+h` (to the page on the left; the first time, onto the row of the open page) • `Ctrl+l` (to the page open in the side peek) • `Ctrl+j` `Ctrl+k` (open the next / previous row's page in the peek) • `gq` (close the peek, back on its row); each side keeps its cursor
**Counts**: prefix motions and commands with a number: `3j` `5w` `4x` `2dd` `d3w` `3dw` `y2b` `c2w` `10G` `3fx` `2u`

### Link Navigation

Vimtion provides two methods for link navigation:

#### Method 1: Link Hint Mode (`gl`)


https://github.com/user-attachments/assets/04dae08b-8e01-4bcd-bd33-18f00de14d9f


Vimium-style navigation with keyboard hints:
- Press `gl` to show hints for all links on the page
- Database rows and cards get hints too: a hint opens the page the way the database is set to open it (side peek, center peek or full page)
- Type hint characters to filter and navigate instantly
- `Shift+hint` opens the link in a new tab
- Cursor position is automatically saved and restored when navigating back with `Shift+H`

#### Method 2: Enter Key Navigation


https://github.com/user-attachments/assets/97d3f817-e582-4652-b373-e642e4ec3372


Faster in-document navigation:

**Open links with Enter**:
- **External links**: Press `Enter` on a link to open it in a new tab
- **Block links** (same page): Press `Enter` on a block link to jump to that block and update cursor position
- **Notion page links**: Press `Enter` near any Notion page link to enter link selection mode
- **Shift+Enter**: Open link in new tab

**Link Selection Mode** (for any in-document links):
- Pressing `Enter` on empty space enters selection mode
- The closest link to your cursor is initially highlighted
- Navigate: `j` (next link) • `k` (previous link) - cycle through all links on the page
- Open: `Enter` opens the selected link, `Shift+Enter` opens in new tab
- Delete: `d` deletes the block containing the selected link
- Exit: `Esc` exits selection mode without opening

**Example workflow**:
1. Position cursor anywhere on the page
2. Press `Enter` to activate link selection
3. Use `j`/`k` to browse through all links
4. Press `Enter` to open the selected page, or `Esc` to cancel

### Modes
**Insert**: `i` `I` `a` `A` `o` `O` • **Visual**: `v` (char) `V` (line) • **Normal**: `Esc` or `jk` (in insert mode)

### Editing
**Delete**: `x` `X` `s` `D` `dd` (delete line with block) • **Change/Yank line**: `S` `Y` • **Join**: `J` • **Indent**: `>>` `<<` • **Toggle case**: `~` • **Repeat**: `.` (repeat the last change) • **Undo/Redo**: `u` `r` (grouped undo for multi-line operations) • **Paste**: `p` `P`

### Operators with Motions
All operators (`d` delete, `c` change, `y` yank) work with all motions:
- **Lines**: `dd` `cc` `yy`
- **Words**: `dw` `cw` `yw` `de` `ce` `ye` `db` `cb` `yb` (also `W` `B` `E` variants)
- **Line parts**: `d$` `c$` `y$` `d0` `c0` `y0` `D` `C`
- **Paragraphs**: `d{` `c{` `y{` `d}` `c}` `y}` (delete/change/yank to paragraph boundary)
- **Find**: `df{char}` `cf{char}` `dt{char}` `ct{char}` (also `F` `T` variants)

### Text Objects

Operate on text inside or around delimiters. All operators (`d`, `c`, `y`) and visual mode work with text objects:

**Supported delimiters**: `w` (word) • `p` (paragraph) • `(` `)` `b` (parentheses) • `[` `]` (brackets) • `{` `}` `B` (braces) • `<` `>` (angle brackets) • `'` `"` `` ` `` (quotes) • `/` `*` (slashes/asterisks)

**Inner (`i`)**: Content only
- `ciw` `diw` `yiw` - word under cursor
- `cip` `dip` `yip` - paragraph (excludes blank lines)
- `ci(` `di(` `yi(` - inside `()`
- `ci[` `di[` `yi[` - inside `[]`
- `ci{` `di{` `yi{` - inside `{}`
- `ci<` `di<` `yi<` - inside `<>`
- `ci'` `di'` `yi'` - inside `''`
- `ci"` `di"` `yi"` - inside `""`
- `` ci` di` yi` `` - inside `` `` ``
- `ci/` `di/` `yi/` - inside `//`
- `ci*` `di*` `yi*` - inside `**`

**Around (`a`)**: Content + delimiters/whitespace
- `caw` `daw` `yaw` - word + surrounding whitespace
- `cap` `dap` `yap` - paragraph + surrounding blank lines
- `ca(` `da(` `ya(` - including `()`
- `ca[` `da[` `ya[` - including `[]`
- `ca{` `da{` `ya{` - including `{}`
- `ca<` `da<` `ya<` - including `<>`
- `ca'` `da'` `ya'` - including `''`
- `ca"` `da"` `ya"` - including `""`
- `` ca` da` ya` `` - including `` `` ``
- `ca/` `da/` `ya/` - including `//`
- `ca*` `da*` `ya*` - including `**`

**Example**: In `text (example) text` with cursor on `example`:
- `ci(` → leaves `()`, enters insert mode
- `di(` → leaves `()`
- `ca(` → removes `(example)`, enters insert mode

### Visual Mode

**Character-wise (`v`)**:
- **Navigate**: `h` `l` `w` `b` `e` `0` `$`
- **Text objects**: All `i` (inner) and `a` (around) text objects work in visual mode
  - Words: `viw` `vaw`
  - Paragraphs: `vip` `vap`
  - Brackets: `vi(` `va(` `vi[` `va[` `vi{` `va{` `vi<` `va<`
  - Quotes: `vi'` `va'` `vi"` `va"` `` vi` va` ``
  - Other: `vi/` `va/` `vi*` `va*`
- **Operate**: `d` `y` `c` or use Notion shortcuts (Cmd+B, Cmd+I, etc.)

**Line-wise (`V`)**: Select with `j` `k` `gg` `G` `{` `}`, then `d` `y` `c`

**Example**: With cursor inside `(example text)`:
- `vi(` → selects `example text`
- `va(` → selects `(example text)`
- Then `d` to delete, `y` to yank, or `c` to change

**Note**: Notion's native formatting shortcuts (Cmd+B, Cmd+I, Cmd+U, etc.) work on visual selections.

## ⚠️ Known Limitations

### Multi-line Paste
When you yank multiple lines using Visual line mode (`V` + selection + `y`), the text is correctly copied to your system clipboard with newlines preserved. However, the `p` command currently cannot properly paste multi-line content as separate Notion blocks.

**Workaround**: After yanking multiple lines with `Vy`, use your browser's native paste command instead:
- **macOS**: `Cmd+V`
- **Windows/Linux**: `Ctrl+V`

This will correctly create separate Notion blocks for each line. Single-line paste with `p` works as expected.

### Unsupported Features

The following Vim features are not implemented:

- **Marks** (`m`, `'`, `` ` ``) - Not essential for basic editing workflow
- **Macros** (`q`, `@`) - Complex to implement and not essential for most users
- **Screen-based motions** (`M`) - Not meaningful in Notion's infinite scroll context (note: `H`/`L` are repurposed for browser history navigation)
- **Replace mode** (`R`) - Not essential for core editing

**Note**: `r` is used for **redo** instead of Vim's default "replace character" to provide undo/redo functionality.

## 🚧 Roadmap

### Planned Features
- [ ] **Help page** (`?`): Display Vimium-style help overlay showing all keybindings
- [ ] **Visual block mode** (`Ctrl+v`): Rectangular/column selection
- [ ] **Code block CLI mode**: Specify code block language from command
- [x] **Line movement**: `Shift+J` / `Shift+K` in visual-line mode to move selected blocks down/up
- [ ] **Visual-line performance**: Optimize `Shift+V` for better performance, currently a bit slow
- [ ] **Table navigation**: Vim-like navigation within Notion tables (similar to page link handling)
- [x] **Repeat command** (`.`): Repeat the last command

Contributions and feature requests are welcome! Please open an issue on [GitHub](https://github.com/tatsukamijo/vimtion/issues).

## Credits

Original implementation by [Luke Ingalls](https://github.com/lukeingalls) - [vim-notion](https://github.com/lukeingalls/vim-notion)

## License

ISC License - see LICENSE file for details

Original implementation Copyright (c) 2020 Luke Ingalls
