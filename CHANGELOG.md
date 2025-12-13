# Changelog

All notable changes to Vimtion will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
