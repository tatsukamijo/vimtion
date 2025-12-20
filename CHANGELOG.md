# Changelog

All notable changes to Vimtion will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2025-12-20

### Added
- **Tab key support**: `Tab` and `Shift+Tab` now work in normal mode for indenting/outdenting bullet points, toggle lists, and numbered lists

### Fixed
- **Page title editing cursor reset**: Fixed cursor jumping to the start when editing page titles
  - URL polling now compares page IDs instead of full URLs
  - Ignores URL slug changes caused by title edits (e.g., "Demo" → "My Demo" in URL)
  - Prevents unnecessary reinitialization during title editing

## [1.2.0] - 2025-12-15

### Added
- **Link navigation**: Press `Enter` on links to open them
  - External links: Open in new tab
  - Same-page block links: Jump to block and update cursor position
  - Notion page links: Enter link selection mode for choosing from multiple links
- **Link selection mode**: When multiple Notion page links are near cursor
  - `j`/`k`: Navigate between links (sorted top to bottom)
  - `Enter`: Open selected link
  - `d`: Delete block containing selected link
  - `Esc`: Exit selection mode
  - Auto-scroll: Selected links automatically scroll into view when off-screen
- **Browser history navigation**: Vimium-compatible history navigation
  - `H` (Shift+h): Go back in browser history
  - `L` (Shift+l): Go forward in browser history
  - Auto-reinitialize Vimtion after SPA navigation (URL polling every 500ms)
- **Options page**: Customize Vimtion's appearance and behavior
  - Mode indicator position and colors
  - Cursor colors and blink settings
  - Visual selection colors
  - Access via right-click extension icon → Options
- **Vimium conflict warning**: One-time notification on first install
  - Centered modal with dark overlay
  - Instructions to exclude `https://www.notion.so/*` in Vimium settings
  - Copy button for easy URL copying
  - Dismissible by clicking overlay, × button, or "Got it" button
- **PR template**: Added pull request template for contributors

### Fixed
- **Notion page link deletion after tab switch**: Fixed deletion failure in link selection mode when returning from external URLs
  - Clear stale selection with `removeAllRanges()` before block interaction
  - Simulate complete mouse event sequence (mouseenter → mousedown → mouseup → click) with proper coordinates
  - Ensures consistent deletion behavior across all scenarios (reload, H/L navigation, external URL tab switches)
- **Visual-line mode color**: Fixed visual-line selection color to use correct theme color setting

### Documentation
- Updated README with link navigation instructions and examples
- Added Options page section with customization details
- Improved documentation for Notion page link selection and deletion

## [1.1.0] - 2025-12-13

### Added
- **Update notification system**: Users now receive a non-intrusive toast notification when the extension is updated
- **Code block support**: Full Vim operations now work inside Notion code blocks with proper multi-line handling
- **Visual mode text objects**: `vi{motion}` and `va{motion}` support in visual mode for more intuitive text selection
- **Visual-line mode change/substitute**: `c` and `s` commands now work in visual-line mode
- **Additional text objects**: Support for backtick (`` ` ``), slash (`/`), and asterisk (`*`) as text object delimiters
- CHANGELOG.md to track version history

### Fixed
- **Visual-line mode (V+d) in code blocks**: Fixed cursor positioning after deletion - cursor now correctly moves to the deletion start position instead of always going to block start
- **Visual-line mode (V+d) in code blocks**: Fixed single-line deletion - now only deletes the selected line instead of deleting from block start to selected line
- **Visual-line mode (V+d) multi-line deletion**: Fixed issue where content was deleted but blocks remained for normal (non-code) blocks
- **Visual-line mode (V+d) mixed selection**: Fixed code blocks not being deleted when selecting normal line → code block → normal line
- **Text objects with smart quotes**: Quote and angle bracket text objects now properly handle Notion's smart quotes
- **Visual mode cursor position**: Cursor position is now properly restored when escaping from visual mode
- **Background color cleanup**: Background color is now properly removed after pressing `s` or `c` in visual modes
- Improved timing for keyboard event dispatching in normal block deletion to ensure proper focus

### Changed
- Separated deletion logic for code blocks and normal blocks with different timing requirements
- Improved selection detection to distinguish between inside and outside code block selections

## [1.0.0] - 2025-12-08

### Added
- **Initial public release of Vimtion** - Brings powerful Vim keybindings to Notion

#### Enhanced Navigation
- Basic motions: `h` `j` `k` `l` with automatic line wrapping
- Word motions: `w` `b` `e` and WORD variants (`W` `B` `E`)
- Line navigation: `0` `$` `gg` `G`
- Character search: `f` `F` `t` `T`
- Page scrolling: `Ctrl+d`/`Ctrl+u` (half page), `Ctrl+f`/`Ctrl+b` (full page)

#### Visual Selection Modes
- Character-wise visual mode (`v`) with full motion support
- Line-wise visual mode (`V`) with `gg`/`G` support
- Text objects: `viw` `vaw` (words), `vi(` `va(` (parentheses), `vi"` `va"` (quotes), `vi'` `va'`, `vi{` `va{`, `vi[` `va[`, `vi<` `va<`
- Full compatibility with Notion's native formatting shortcuts (Cmd+B, Cmd+I, Cmd+U)

#### Powerful Editing Operations
- Operators: `d` (delete), `c` (change), `y` (yank) work with all motions
- Text objects: `ciw` `diw` `yiw`, `ci(` `di(`, `ci"` `di"`, `caw` `daw` `yaw`
- Line operations: `dd` `cc` `yy` (including complete block deletion in Notion)
- Insert commands: `i` `I` `a` `A` `o` `O`
- Character operations: `x` `X` `s`
- Put operations: `p` `P`
- Intelligent undo/redo: `u` and `r` with grouped operations for multi-line edits

#### Notion Integration
- Seamless integration with Notion's block-based structure
- All delete operations yank to clipboard (Vim behavior)
- Proper cursor positioning and visual feedback
- Mouse click support for cursor placement
- Enhanced block cursor visibility
- Status line showing current mode and cursor position
