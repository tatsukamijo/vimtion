# Cursor-Sync Invariant — Design

**Owner:** invariant-guard
**Status:** Design only — no code changes yet
**Goal:** Catch the class of bugs where `vim_info.active_line` drifts from the real DOM cursor (BUG-001 / 002 / 003 / 012 / 013) on the *exact* keystroke that breaks them, not at a downstream assertion.

---

## 1. What "consistent" means

The single statement of truth:

> After a keystroke settles, the leaf element that owns `window.getSelection().anchorNode`
> is **the same element** as `window.vim_info.lines[window.vim_info.active_line].element`.

Element-identity (`===`) is the primary check. Index-identity (`getActualCursorBlockIndex() === active_line`) is the convenient *projection* but is fragile when `vim_info.lines` and `[data-content-editable-leaf="true"]` go out of sync (which is itself a bug worth surfacing).

The invariant therefore reports **both**:

```
  expectedEl  = window.vim_info.lines[active_line].element
  actualEl    = selection.anchorNode → closest('[contenteditable="true"]')
  expectedIdx = active_line
  actualIdx   = indexOf(actualEl) within document.querySelectorAll('[contenteditable="true"]')
```

A pass requires `expectedEl === actualEl`. A mismatch where indices agree but elements differ is a *stale-element* bug (BUG-012 / 013 family). A mismatch where elements agree but indices differ is a *list-rebuild* bug.

### 1.1 Allowed exceptions

The invariant must not false-positive on these legitimate states:

| Case | Why DOM and `active_line` look "off" | Detection rule |
|---|---|---|
| **Code block sub-line** | A multi-line code block is a single `[contenteditable="true"]`. `vim_info.active_line` points at that block; the DOM cursor sits on row N inside it. | `expectedEl === actualEl` still holds — element identity is the right invariant; we never check character offset against `cursor_position` for in-code-block movement. (Sub-line vertical motion is internal to one element.) |
| **Insert mode** | Notion may briefly own selection (e.g., during markdown shortcuts that swap blocks). `active_line` can lag by one tick. | Skip the invariant in `mode === "insert"` by default. Provide an opt-in `strict: true` flag for tests that want it on. **However:** always re-check immediately on the `Escape` keystroke that returns to normal mode — this is exactly where BUG-012 / 013 fire. |
| **Visual / visual-line mode** | Selection spans multiple blocks. `anchorNode` and `focusNode` differ; `active_line` tracks the *moving* end. | Use `selection.focusNode` (not `anchorNode`) as the "current cursor" when `mode` starts with `visual`. The element under `focusNode` must equal `lines[active_line].element`. |
| **Link-hint mode** | DOM selection is irrelevant. | Skip entirely when `mode === "link-hint"`. |
| **Pending operator** | After typing `d`, `c`, `y`, `g`, `f`, etc., `vim_info.pending_operator` is non-null and the cursor has not moved yet. | Invariant still applies — pending operator does not change cursor — but `active_line` and the DOM should already match from before the keypress. Standard check works. |
| **Empty document** | `vim_info.lines.length === 0` after refresh, before re-init. | Skip when `lines.length === 0`; record a warning. |
| **Selection in non-leaf** | DOM selection is on the page background or in a Notion UI element (e.g., menu). | Treat as violation only if the previous keystroke was a Vim motion. Some keystrokes (e.g., `gl` on link-hint entry) intentionally clear selection — they're already handled by the link-hint exemption above. |

---

## 2. When to check

Default: **after every `pressKeys` keystroke in normal mode and visual modes.** Skip insert mode unless `strict` is on. Always check after `Escape`.

The check runs synchronously after `page.keyboard.press(key)` and the existing `waitForTimeout(50)` in `pressKeys`. We must not add latency — the existing 50 ms is sufficient for Notion's selection to settle in practice. (If we discover specific keys need longer, we keep a small `KEY_SETTLE_OVERRIDES: Record<string, number>` map.)

The invariant is **not** checked:
- Before any keystroke (we trust the state at test start, after `navigateToTestPage`).
- During `pressKeys` if the user passed `assertInvariant: false`.
- During `expect.soft` style retries.

---

## 3. How tests opt in

Three layers, increasing strictness:

### 3.1 Per-call (lowest friction)

```ts
await pressKeys(page, "j", "j", "k", { assertInvariant: true });
```

`pressKeys` gets an optional trailing options object. Keys-only calls keep working.

### 3.2 Per-spec (recommended default)

```ts
import { useCursorInvariant } from "../helpers";

test.describe("navigation", () => {
  useCursorInvariant();   // wraps test() so every pressKeys in this describe checks

  test("j/k round-trip", async ({ page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "j", "j", "k", "k");   // each key auto-checked
  });
});
```

`useCursorInvariant({ strict?: boolean, skipInsert?: boolean })` installs a `beforeEach` hook that flips a module-level flag; `pressKeys` honors the flag. `afterEach` clears the flag so it does not leak between specs.

### 3.3 Manual fence-post

```ts
import { assertCursorInvariant } from "../helpers";

await page.keyboard.type("## hogehoge");
await page.keyboard.press("Enter");
await page.keyboard.press("Escape");
await assertCursorInvariant(page, { label: "after ##+Enter+Escape" });
```

For raw `page.keyboard.*` calls that bypass `pressKeys`.

---

## 4. Violation report

When the invariant fails, throw a Playwright assertion error whose message is **diagnostic enough to fix the bug without re-running**:

```
[CursorInvariant] Mismatch after key "Escape" (label: "after ##+Enter+Escape")

  mode:                 normal
  pending_operator:     null
  vim_info.active_line: 6      → lines[6] = <h2 contenteditable="true" data-block-id="abc...">"hogehoge"</h2>
  DOM cursor block:     7      → <div contenteditable="true" data-block-id="def...">"text after"</div>
  element identity:     MISMATCH (lines[6] !== selection.anchorNode's leaf)
  vim_info.cursor_position: 0
  DOM anchorOffset:     0
  vim_info.lines.length:    14
  DOM editable count:       14

  Last 5 keys:          ["#", "#", " ", "h", "Escape"]

  Block contents (active_line ± 2):
    4: "Plain text line 1"
    5: "Plain text line 2"
  → 6: "hogehoge"        (vim_info active)
    7: "text after"      (DOM cursor here)
    8: ""

  Hint: lines[active_line].element is detached from DOM (parentNode === null).
        Likely a stale-element bug — refreshLines() failed to re-locate the
        active element after a Notion block-type conversion.
```

Three things make this useful:

1. **The breaking key is named.** "After key Escape" pins the bug instantly.
2. **The 5-key history.** Reproduces the sequence without scrolling back through the test.
3. **The "Hint" line.** The reporter checks three common failure shapes and prints a one-line diagnosis:
   - `lines[i].element.parentNode === null` → stale element (BUG-012 / 013).
   - `lines.length !== document.querySelectorAll(...).length` → list out of sync (BUG-001 family).
   - `expectedEl === actualEl && expectedIdx !== actualIdx` → same element, different index in two queries (selector mismatch — `[contenteditable="true"]` vs `[data-content-editable-leaf="true"]`).

---

## 5. API surface

```ts
// test/helpers.ts (additions only — does not change existing exports)

export interface InvariantOptions {
  /** Check the invariant after each key (default: respects current mode). */
  assertInvariant?: boolean;
  /** Even check in insert mode (default: false — Notion may transiently own selection). */
  strict?: boolean;
  /** Free-form label included in failure message. Useful for fence-post asserts. */
  label?: string;
}

/** Wrap the existing pressKeys to accept a trailing options object. */
export async function pressKeys(
  page: Page,
  ...keysOrOpts: Array<string | InvariantOptions>
): Promise<void>;

/** Manual one-shot check. */
export async function assertCursorInvariant(
  page: Page,
  opts?: InvariantOptions,
): Promise<void>;

/** Spec-level toggle: install beforeEach/afterEach hooks. */
export function useCursorInvariant(opts?: {
  strict?: boolean;
  skipInsert?: boolean;
}): void;
```

---

## 6. Implementation sketch (~95 lines)

```ts
// test/cursor-invariant.ts
import { expect, type Page, test as base } from "@playwright/test";

export interface InvariantOptions {
  assertInvariant?: boolean;
  strict?: boolean;
  label?: string;
}

// Module-level flag toggled by useCursorInvariant().
let specWideEnabled = false;
let specWideStrict = false;
const recentKeys: string[] = [];

interface InvariantSnapshot {
  mode: string;
  pendingOperator: string | null;
  activeLine: number;
  cursorPosition: number;
  linesLength: number;
  domEditableCount: number;
  expectedElementHtml: string | null;     // outerHTML[0..120] of lines[active_line].element
  actualElementHtml: string | null;       // outerHTML[0..120] of selection's leaf
  elementMatch: boolean;
  expectedDetached: boolean;              // lines[active_line].element not in document
  actualIdx: number;
  textWindow: Array<{ idx: number; text: string }>; // active_line ± 2
}

async function snapshot(page: Page): Promise<InvariantSnapshot> {
  return page.evaluate(() => {
    const vi = (window as any).vim_info;
    const sel = window.getSelection();
    const anchor = sel?.anchorNode;
    const focus = sel?.focusNode;
    const cursorNode = vi?.mode?.startsWith("visual") ? focus : anchor;
    const el = cursorNode?.nodeType === 1
      ? (cursorNode as Element)
      : cursorNode?.parentElement ?? null;
    const actualLeaf = el?.closest('[contenteditable="true"]') ?? null;
    const expectedLeaf = vi?.lines?.[vi.active_line]?.element ?? null;
    const allEditable = Array.from(
      document.querySelectorAll('[contenteditable="true"]'),
    );
    const trim = (e: Element | null) =>
      e ? (e.outerHTML.slice(0, 120) + (e.outerHTML.length > 120 ? "…" : "")) : null;
    const window2 = (i: number) =>
      [-2, -1, 0, 1, 2]
        .map((d) => i + d)
        .filter((j) => j >= 0 && j < (vi?.lines?.length ?? 0))
        .map((j) => ({
          idx: j,
          text: (vi.lines[j].element.textContent ?? "").slice(0, 60),
        }));
    return {
      mode: vi?.mode ?? "unknown",
      pendingOperator: vi?.pending_operator ?? null,
      activeLine: vi?.active_line ?? -1,
      cursorPosition: vi?.cursor_position ?? -1,
      linesLength: vi?.lines?.length ?? 0,
      domEditableCount: allEditable.length,
      expectedElementHtml: trim(expectedLeaf),
      actualElementHtml: trim(actualLeaf),
      elementMatch: !!expectedLeaf && expectedLeaf === actualLeaf,
      expectedDetached: !!expectedLeaf && !document.contains(expectedLeaf),
      actualIdx: actualLeaf ? allEditable.indexOf(actualLeaf) : -1,
      textWindow: window2(vi?.active_line ?? -1),
    };
  });
}

function shouldCheck(s: InvariantSnapshot, strict: boolean): boolean {
  if (s.mode === "link-hint") return false;
  if (s.linesLength === 0) return false;
  if (s.mode === "insert" && !strict) return false;
  return true;
}

function diagnose(s: InvariantSnapshot): string {
  if (s.expectedDetached) {
    return "lines[active_line].element is detached — stale element after a "
      + "DOM mutation (likely BUG-012/013: refreshLines lost track).";
  }
  if (s.linesLength !== s.domEditableCount) {
    return `lines.length (${s.linesLength}) ≠ DOM editable count `
      + `(${s.domEditableCount}) — list out of sync (refreshLines missed a mutation).`;
  }
  if (s.elementMatch === false && s.activeLine === s.actualIdx) {
    return "Same index, different element — selector or list-build mismatch.";
  }
  return "Cursor moved without active_line being updated (or vice versa).";
}

export async function assertCursorInvariant(
  page: Page,
  opts: InvariantOptions = {},
): Promise<void> {
  const strict = opts.strict ?? specWideStrict;
  const s = await snapshot(page);
  if (!shouldCheck(s, strict)) return;
  if (s.elementMatch) return;

  const label = opts.label ? ` (label: "${opts.label}")` : "";
  const lastKey = recentKeys[recentKeys.length - 1] ?? "<none>";
  const msg = [
    `[CursorInvariant] Mismatch after key "${lastKey}"${label}`,
    ``,
    `  mode:                 ${s.mode}`,
    `  pending_operator:     ${s.pendingOperator}`,
    `  vim_info.active_line: ${s.activeLine}  → ${s.expectedElementHtml}`,
    `  DOM cursor block:     ${s.actualIdx}  → ${s.actualElementHtml}`,
    `  element identity:     ${s.elementMatch ? "MATCH" : "MISMATCH"}`,
    `  vim_info.cursor_position: ${s.cursorPosition}`,
    `  vim_info.lines.length:    ${s.linesLength}`,
    `  DOM editable count:       ${s.domEditableCount}`,
    ``,
    `  Last keys: ${JSON.stringify(recentKeys.slice(-5))}`,
    ``,
    `  Block contents (active_line ± 2):`,
    ...s.textWindow.map((w) => {
      const marker = w.idx === s.activeLine ? "→ " : "  ";
      return `${marker}${w.idx}: ${JSON.stringify(w.text)}`;
    }),
    ``,
    `  Hint: ${diagnose(s)}`,
  ].join("\n");
  expect.soft(s.elementMatch, msg).toBe(true);
  expect(s.elementMatch, "see soft assertion above").toBe(true);
}

/** Replacement for existing pressKeys — accepts trailing options. */
export async function pressKeys(
  page: Page,
  ...keysOrOpts: Array<string | InvariantOptions>
): Promise<void> {
  const last = keysOrOpts[keysOrOpts.length - 1];
  const opts: InvariantOptions =
    last && typeof last === "object" ? (keysOrOpts.pop() as InvariantOptions) : {};
  const keys = keysOrOpts as string[];
  const enabled = opts.assertInvariant ?? specWideEnabled;
  for (const key of keys) {
    await page.keyboard.press(key);
    recentKeys.push(key);
    if (recentKeys.length > 16) recentKeys.shift();
    await page.waitForTimeout(50);
    if (enabled) await assertCursorInvariant(page, opts);
  }
}

/** Spec-level toggle. Call inside a describe block. */
export function useCursorInvariant(
  opts: { strict?: boolean; skipInsert?: boolean } = {},
): void {
  base.beforeEach(() => {
    specWideEnabled = true;
    specWideStrict = opts.strict ?? false;
  });
  base.afterEach(() => {
    specWideEnabled = false;
    specWideStrict = false;
    recentKeys.length = 0;
  });
}
```

`test/helpers.ts` re-exports `pressKeys`, `assertCursorInvariant`, `useCursorInvariant` from `cursor-invariant.ts`, replacing the current `pressKeys`. The rename is non-breaking because the new signature is a strict superset of the old (`...string[]` is still accepted).

---

## 7. Worked example — how this catches BUG-013 immediately

BUG-013 reproduction: on an empty paragraph at block index 6, type `## hogehoge`, then `Enter`, then `Escape`. Notion converts the paragraph to an `<h2>`, destroying and replacing the `[contenteditable="true"]` element. `refreshLines()` rebuilds `vim_info.lines` but cannot find the old element by reference, so `active_line` stays at 6 — pointing at whatever block now occupies index 6 (typically the block *before* the heading).

A test today writes:

```ts
test("##+Enter promotes to h2 and lands on the heading", async ({ page }) => {
  await navigateToTestPage(page);
  await pressKeys(page, "G", "o");                       // open new line at end
  await page.keyboard.type("## hogehoge");
  await pressKeys(page, "Enter", "Escape");
  expect(await getLineText(page, await getCursorPosition(page).then(c => c.line)))
    .toBe("hogehoge");                                   // PASSES — this assertion looks at active_line, finds "hogehoge"-ish text, ships green
});
```

…and the bug ships, because the assertion happened to read `active_line` as the source of truth and never compared it against the DOM cursor.

With the invariant turned on:

```ts
test.describe("markdown shortcuts", () => {
  useCursorInvariant();
  test("##+Enter promotes to h2 and lands on the heading", async ({ page }) => {
    await navigateToTestPage(page);
    await pressKeys(page, "G", "o");
    await page.keyboard.type("## hogehoge");
    await pressKeys(page, "Enter", "Escape");
    // ...rest of test never runs
  });
});
```

What happens on the `Escape` key, step by step:

1. `pressKeys` calls `page.keyboard.press("Escape")`, waits 50 ms.
2. Notion's `MutationObserver`-driven `refreshLines()` has already run during the type/Enter — `vim_info.lines` was rebuilt without the original paragraph element.
3. `assertCursorInvariant(page)` runs. Snapshot returns:
   - `mode: "normal"` (Escape just fired)
   - `activeLine: 6`
   - `expectedElementHtml: <p contenteditable="true">…stale text…</p>` (or the block now sitting at index 6)
   - `actualLeaf: <h2 contenteditable="true">"hogehoge"</h2>` at DOM index 7
   - `elementMatch: false`
   - `expectedDetached: false` (the *new* element at index 6 is in DOM — a different bug fingerprint than full detachment, captured by the `same-index-different-element` hint).
4. `diagnose()` returns: *"Cursor moved without active_line being updated (or vice versa)."* The fingerprint here is `linesLength === domEditableCount && elementMatch === false && actualIdx !== activeLine` — the operative pattern is "DOM cursor is one block ahead of `active_line`." The reporter prints the ±2 text window:

   ```
       4: "Plain text line 2"
       5: "Plain text line 3"
     → 6: "Plain text line 3"   (vim_info active — note: index 6 now holds what used to be at some other slot)
       7: "hogehoge"             (DOM cursor here)
       8: ""
   ```

5. The test fails on the literal `Escape` key with:

   > `[CursorInvariant] Mismatch after key "Escape"` ... `vim_info.active_line: 6` ... `DOM cursor block: 7` ... `Last keys: ["#", "#", " ", "h", "o", "g", "e", "h", "o", "g", "e", "Enter", "Escape"]`

The diagnostic points an investigator straight at `refreshLines()` (the location is named in BUG-013): an element-reference lookup that silently no-ops when the lookup fails. No subsequent `j`/`k` is needed to expose the bug — the broken keystroke itself raises the alarm.

For BUG-012 (`` ``` `` → code block conversion) the snapshot fingerprint is *the same*: `expectedDetached: true` instead, because the original paragraph element was actually removed from the DOM. The hint becomes *"lines[active_line].element is detached — stale element after a DOM mutation."* — which directly names the failure.

---

## 8. Edge cases to keep on the radar

- **Open-line operations (`o`, `O`)**: invariant must run *after* the new line creation settles — the existing 50 ms wait is the bottleneck. If we see flakes here, raise to 100 ms for `o`/`O` only via `KEY_SETTLE_OVERRIDES`.
- **Special blocks** (page links, embeds, dividers): they have `contenteditable="false"` and are not in `vim_info.lines`. Vim's navigation skips them. If a key lands selection on a special block (e.g., user clicks one), `actualLeaf` will be `null` after the `closest('[contenteditable="true"]')` query — treat as a violation only if previous mode was normal and the previous key was a Vim motion (`j`/`k`/`gg`/`G`/etc.).
- **Visual-line mode (`V`)**: `focusNode` is the moving end. The element under `focusNode` (not `anchorNode`) must equal `lines[active_line].element`.
- **Pending operator with `f`/`t`/`g`**: `active_line` does not change between `f` and `<char>`; the invariant on `f` alone passes trivially. After the second key the invariant fires normally.
- **Page reload mid-test**: invariant on the *first* keystroke after a reload races with `setLines()` initialization. `useCursorInvariant` wires into `beforeEach`, so it activates after `navigateToTestPage` — by which point lines are populated. Defensive `linesLength === 0 → skip` handles any residual race.
- **Headless vs headed**: BUG-008 / 009 already show that some keystrokes behave differently in headless. The invariant is mode-blind to that; it just reports what it sees. Headless-only mismatches will surface as new-bug findings, which is the desired behavior.
- **`r` (redo)**: in this codebase `r` is redo, not Vim's "replace character." Same-document undo/redo can rebuild lines; invariant handles via `expectedDetached` / `linesLength` mismatch.

---

## 9. Out of scope (deliberately)

- Asserting `vim_info.cursor_position` against `selection.anchorOffset`. That is a separate, narrower invariant (column-sync) worth designing later but **must not** be folded in here — it has many legitimate transient mismatches (e.g., setting `desired_column` for vertical motion) that would drown out the high-value block-level signal.
- Redefining `getActualCursorBlockIndex` to use `[contenteditable="true"]` instead of `[data-content-editable-leaf="true"]`. That selector inconsistency is itself a bug fingerprint (Section 4, third hint case) — leaving it in place lets the invariant surface it.
- Auto-recovering. Tests should fail on mismatch, not paper over it.

---

## 10. Hand-off

Ready for direct implementation as `test/cursor-invariant.ts` plus a small refactor of `test/helpers.ts` to re-export and replace `pressKeys`. Estimated implementation effort: ~1.5 hours including running the existing 391-test suite to confirm no regression on tests that already pass.
