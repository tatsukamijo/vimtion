# notion-driver — drive real Notion with the dev build of Vimtion

A long-lived Chromium (logged in, with `dist/` loaded as an unpacked extension)
plus a small CLI, `vt`, so an agent or a human can press keys in real Notion and
see what Vimtion did, step by step, from the shell.

Use it for the find → reproduce → fix → re-verify loop. The Playwright suite in
`test/` stays the regression net; this tool is for exploring and debugging.

## Setup (once)

```bash
npm install && npx playwright install chromium
PW_HEADLESS=false npm run test:setup-auth   # log in to Notion; profile → test/auth/.user-data
```

`test/.env` must have `NOTION_API_KEY` and `NOTION_PARENT_PAGE_ID` (used to
create fixture pages) and `NOTION_TEST_PAGE_URL` (the big shared test page).

## Commands

```bash
VT=tools/notion-driver/vt
npm run build
$VT start [--headless]          # browser + server in background (headed by default)
$VT fixture - <<'EOF'           # fresh Notion page from a spec, opened, cursor on title
# Heading
plain paragraph
- bullet
  - nested bullet
[ ] todo
```javascript
const x = 1;
```
EOF
$VT keys jjdw                   # vim notation: <Esc> <CR> <BS> <C-d> <S-CR> <D-z>; 30ms between keys
$VT keys jjj --delay 0          # zero-gap burst (stress test; currently drops keys)
$VT keys jjj --each             # snapshot after every key (find the key that breaks)
$VT keys Vjd --series 0,50,200,700   # snapshots over time after the last key
$VT hold j 20                   # OS-style autorepeat (held key)
$VT type "some text"            # literal text, for insert mode
$VT state [--all]               # current snapshot
$VT shot                        # screenshot → prints path (read it to look)
$VT eval [--iso] "<js>"         # page JS; --iso runs in Vimtion's world (window.vim_info)
$VT console "regex"             # captured console output
$VT clip                        # clipboard contents (yank checks)
$VT reload                      # npm run build + hot-reload extension + reload page
$VT refixture                   # re-create the last fixture (clean slate)
$VT stop
$VT clean [--all]               # delete stopped ports' profiles (keeps the 9333 login seed)
```

Fixture spec, one block per line: `#`/`##`/`###` headings, `- ` bullet,
`1. ` numbered, `[ ] `/`[x] ` todo, `> ` quote, `>> ` toggle, `! ` callout,
`---` divider, a ```` ```lang ```` … ```` ``` ```` code block (Notion API language
names: `javascript`, `python`, `plain text`, …), an empty line for an empty
paragraph, anything else for a paragraph. Inline `**bold**`, `*italic*` and
`` `code` `` are supported outside code blocks. Indent 2 spaces to nest. The last 5
fixtures per port are kept; older ones are archived.

## Reading a snapshot

```
mode=normal  vim=L4 (desired C0)  dom=L4:C6  overlay=L4  lines=9  status="-- NORMAL -- | Line 5/9"
>^  4 text      | Plain [t]ext line 2
ok: vim/DOM/overlay in sync
```

- `vim=L` is `vim_info.active_line`. `dom=L:C` is where the browser selection
  really is, in the same line frame. `overlay=L` is the line under the rendered
  block cursor. `>` marks vim's line and `^` marks the DOM caret's line.
- Line 0 is Notion's page-level editable wrapper; content starts at line 1 (title).
- `PROBLEMS:` lists any broken invariants: vim/DOM line mismatch, overlay on
  the wrong line, detached or stale elements in `lines[]`, a normal-mode caret past
  the last character, or focus outside the active line.
- A snapshot can be clean while the text is still wrong. Always check the
  resulting text against what real Vim would do.

## Bug loop

1. Build a minimal fixture for the scenario, then drive it with `keys --each` or `--series`.
2. Compare against real Vim (`nvim`/`vim` on the same lines) and against the snapshot invariants.
3. Write the bug up in `docs/known-bugs.md`: fixture, keys, expected, actual.
4. Fix it in `src/`, run `vt reload`, and replay the same keys. Then add a Playwright regression test.

## Parallel instances

Every port gets its own profile (seeded from `.profile-9333`, without caches),
state, and output dir, so agents can run side by side:

```bash
export VT_PORT=9341                # export it: in zsh a "VT_PORT=… cmd" string in a variable won't split
$VT start --headless && $VT fixture spec.txt
$VT stop && $VT clean
```

Rules for parallel agents:
- Keep helper scripts and fixture files in a directory unique to your port.
  The scratchpad is shared, so a generic `./v` or `f1.txt` gets overwritten by another agent.
- Headed browsers share the macOS clipboard. Before a yank/paste check, write a sentinel
  (`vt eval 'navigator.clipboard.writeText("SENTINEL")'`), or keep yank and paste
  in one `keys` call.

## Caveats

- Headless and headed can behave differently (see known-bugs). Confirm
  headless-only findings with a headed run before calling them bugs.
- Keys go through CDP `Input.dispatchKeyEvent`, the same as real typing as far as
  the page can tell. The extension's own synthetic events, such as the block-selection
  drag in `deleteMultipleLinesAtomically`, still behave the same way they do for users.
- The driver profile is a copy of `test/auth/.user-data`. If the Notion login
  expires, re-run the setup and delete `tools/notion-driver/.profile-*`.
