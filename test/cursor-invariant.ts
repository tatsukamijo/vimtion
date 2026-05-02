/**
 * Continuous test-time invariants. Two siblings live here, sharing the
 * `recentKeys` ring buffer so both can blame the same breaking key:
 *
 *   1. assertCursorInvariant / useCursorInvariant — element-identity check.
 *      vim_info.lines[active_line].element === the leaf owning the DOM
 *      selection's anchor/focus node. Catches stale-element / refresh-miss
 *      bugs (BUG-012/013/002/003).
 *
 *   2. assertUiInvariant / useUiInvariant — rendered-UI check.
 *      Catches a different bug class than assertCursorInvariant: UI lag
 *      where vim_info IS correct but the rendered status bar `.vim-mode`
 *      and/or the absolutely-positioned `<div class="vim-block-cursor">`
 *      overlay are stale (BUG-016 `w`/`b` cross-line, BUG-017 `{`/`}`).
 *
 * The two invariants are independent; specs opt into either, both, or neither.
 *
 * See docs/test-overhaul/invariant-design.md for the cursor-invariant rationale.
 */
import { expect, test as base, type Page } from "@playwright/test";

export interface InvariantOptions {
  /** Check the invariant after each key (default: respects the spec-wide flag). */
  assertInvariant?: boolean;
  /** Even check in insert mode (default: false — Notion may transiently own selection). */
  strict?: boolean;
  /** Free-form label included in failure message. Useful for fence-post asserts. */
  label?: string;
}

// Module-level flags toggled by useCursorInvariant() / useUiInvariant().
let specWideEnabled = false;
let specWideStrict = false;
let specWideUiEnabled = false;
let specWideUiStrict = false;
const recentKeys: string[] = [];

interface InvariantSnapshot {
  mode: string;
  pendingOperator: string | null;
  activeLine: number;
  cursorPosition: number;
  linesLength: number;
  domEditableCount: number;
  expectedElementHtml: string | null;
  actualElementHtml: string | null;
  elementMatch: boolean;
  expectedDetached: boolean;
  actualIdx: number;
  textWindow: Array<{ idx: number; text: string }>;
}

async function snapshot(page: Page): Promise<InvariantSnapshot> {
  return page.evaluate(() => {
    interface VimLineLite {
      element: HTMLElement;
      cursor_position: number;
    }
    interface VimInfoLite {
      active_line: number;
      cursor_position: number;
      lines: VimLineLite[];
      mode: string;
      pending_operator: string | null;
    }
    const vi = (window as unknown as { vim_info?: VimInfoLite }).vim_info;
    const sel = window.getSelection();
    const anchor = sel?.anchorNode ?? null;
    const focus = sel?.focusNode ?? null;
    const cursorNode = vi?.mode?.startsWith("visual") ? focus : anchor;
    const el =
      cursorNode && cursorNode.nodeType === 1
        ? (cursorNode as Element)
        : cursorNode?.parentElement ?? null;
    const actualLeaf = el?.closest('[contenteditable="true"]') ?? null;
    const expectedLeaf = vi?.lines?.[vi.active_line]?.element ?? null;
    const allEditable = Array.from(
      document.querySelectorAll('[contenteditable="true"]'),
    );
    const trim = (e: Element | null): string | null => {
      if (!e) return null;
      const html = e.outerHTML;
      return html.length > 120 ? `${html.slice(0, 120)}…` : html;
    };
    const buildWindow = (i: number): Array<{ idx: number; text: string }> => {
      const out: Array<{ idx: number; text: string }> = [];
      const len = vi?.lines?.length ?? 0;
      for (const d of [-2, -1, 0, 1, 2]) {
        const j = i + d;
        if (j < 0 || j >= len) continue;
        const text = (vi!.lines[j].element.textContent ?? "").slice(0, 60);
        out.push({ idx: j, text });
      }
      return out;
    };
    return {
      mode: vi?.mode ?? "unknown",
      pendingOperator: (vi?.pending_operator as string | null) ?? null,
      activeLine: vi?.active_line ?? -1,
      cursorPosition: vi?.cursor_position ?? -1,
      linesLength: vi?.lines?.length ?? 0,
      domEditableCount: allEditable.length,
      expectedElementHtml: trim(expectedLeaf),
      actualElementHtml: trim(actualLeaf),
      elementMatch: !!expectedLeaf && expectedLeaf === actualLeaf,
      expectedDetached: !!expectedLeaf && !document.contains(expectedLeaf),
      actualIdx: actualLeaf ? allEditable.indexOf(actualLeaf) : -1,
      textWindow: buildWindow(vi?.active_line ?? -1),
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
    return (
      "lines[active_line].element is detached — stale element after a " +
      "DOM mutation (likely BUG-012/013: refreshLines lost track)."
    );
  }
  if (s.linesLength !== s.domEditableCount) {
    return (
      `lines.length (${s.linesLength}) ≠ DOM editable count ` +
      `(${s.domEditableCount}) — list out of sync (refreshLines missed a mutation).`
    );
  }
  if (s.elementMatch === false && s.activeLine === s.actualIdx) {
    return "Same index, different element — selector or list-build mismatch.";
  }
  return "Cursor moved without active_line being updated (or vice versa).";
}

/** Manual one-shot check. Safe to call any time. */
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
  const lines = [
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
  ];
  expect(s.elementMatch, lines.join("\n")).toBe(true);
}

/**
 * Replacement for the legacy pressKeys — accepts a trailing options object.
 * `pressKeys(page, "j", "k")` continues to work; `pressKeys(page, "j", { assertInvariant: true })`
 * opts in to a per-call check.
 */
export async function pressKeys(
  page: Page,
  ...keysOrOpts: Array<string | InvariantOptions>
): Promise<void> {
  let opts: InvariantOptions = {};
  const last = keysOrOpts[keysOrOpts.length - 1];
  if (last && typeof last === "object") {
    opts = keysOrOpts.pop() as InvariantOptions;
  }
  const keys = keysOrOpts as string[];
  const enabled = opts.assertInvariant ?? specWideEnabled;
  const uiEnabled = specWideUiEnabled;
  for (const key of keys) {
    await page.keyboard.press(key);
    recentKeys.push(key);
    if (recentKeys.length > 16) recentKeys.shift();
    await page.waitForTimeout(50);
    if (enabled) await assertCursorInvariant(page, opts);
    if (uiEnabled) await assertUiInvariant(page, { label: opts.label });
  }
}

/**
 * Spec-level toggle. Call inside a describe() block — Playwright's beforeEach/afterEach
 * register against the enclosing scope.
 *
 * If the spec uses a fixture-extended `test` object (e.g. `import { test } from "../fixtures"`),
 * pass it as the second argument. Hooks registered on `base` from `@playwright/test` do NOT
 * always propagate to fixture-extended test objects — passing the same `test` the spec uses
 * guarantees they fire.
 */
type HookHost = {
  beforeEach: (fn: (...a: unknown[]) => unknown) => void;
  afterEach: (fn: (...a: unknown[]) => unknown) => void;
};

export function useCursorInvariant(
  opts: { strict?: boolean; skipInsert?: boolean } = {},
  testObj: HookHost = base as unknown as HookHost,
): void {
  testObj.beforeEach(() => {
    specWideEnabled = true;
    specWideStrict = opts.strict ?? false;
  });
  testObj.afterEach(() => {
    specWideEnabled = false;
    specWideStrict = false;
    recentKeys.length = 0;
  });
}

// ===========================================================================
// UI-sync invariant (BUG-016 / BUG-017 family).
//
// vim_info.active_line and the DOM cursor can both be correct, yet the
// rendered UI lags because a motion handler skipped updateInfoContainer() /
// updateBlockCursor(). This invariant catches that mismatch.
//
// Two checks:
//   (a) Status bar: ".vim-mode" text contains "Line N/M" (1-based);
//       require N - 1 === vim_info.active_line.
//   (b) Block-cursor overlay: ".vim-block-cursor" is a div absolutely
//       positioned in document.body. Its rendered viewport rect must overlap
//       vertically with vim_info.lines[active_line].element's bounding rect.
//       Geometric, not DOM-containment, because the overlay is not nested
//       inside the active block.
// ===========================================================================

interface UiSnapshot {
  // mode is inferred from body classes (set by updateInfoContainer); page-DOM
  // accessible. window.vim_info itself is in the content script's ISOLATED
  // world and not reachable from page.evaluate's MAIN world, so this
  // invariant is intentionally DOM-only.
  mode: string;
  // Source of truth for "where the cursor really is": the [contenteditable="true"]
  // index of the DOM selection's leaf. The cursor invariant guarantees this
  // tracks vim_info.active_line, so we use it as a proxy.
  domCursorBlockIdx: number;
  domEditableCount: number;
  // Status bar
  statusBarText: string;
  statusBarLine: number; // 1-based; -1 if unparseable
  statusBarMatch: boolean;
  // Block cursor overlay
  overlayPresent: boolean;
  overlayDisplayed: boolean;
  overlayTop: number; // viewport y; NaN if absent
  overlayBottom: number;
  activeBlockTop: number;
  activeBlockBottom: number;
  overlayMatch: boolean;
  // Diagnostic context
  textWindow: Array<{ idx: number; text: string }>;
}

async function uiSnapshot(page: Page): Promise<UiSnapshot> {
  return page.evaluate(() => {
    // Mode from body class (set by updateInfoContainer).
    const body = document.body;
    let mode = "unknown";
    if (body.classList.contains("vim-normal-mode")) mode = "normal";
    else if (body.classList.contains("vim-insert-mode")) mode = "insert";
    else if (body.classList.contains("vim-visual-mode")) mode = "visual";
    else if (body.classList.contains("vim-visual-line-mode")) mode = "visual-line";

    const allEditable = Array.from(
      document.querySelectorAll('[contenteditable="true"]'),
    );
    const domEditableCount = allEditable.length;

    // DOM cursor's block via the same logic as cursor-invariant.
    const sel = window.getSelection();
    const anchor = sel?.anchorNode ?? null;
    const el =
      anchor && anchor.nodeType === 1
        ? (anchor as Element)
        : anchor?.parentElement ?? null;
    const cursorLeaf = el?.closest('[contenteditable="true"]') ?? null;
    const domCursorBlockIdx = cursorLeaf ? allEditable.indexOf(cursorLeaf) : -1;

    // Status bar
    const modeEl = document.querySelector(".vim-mode") as HTMLElement | null;
    const statusBarText = modeEl?.textContent ?? "";
    const lineMatch = statusBarText.match(/Line\s+(\d+)\/(\d+)/);
    const statusBarLine = lineMatch ? parseInt(lineMatch[1], 10) : -1;
    // Compare 1-based status bar to 0-based DOM index.
    const statusBarMatch =
      statusBarLine !== -1 &&
      domCursorBlockIdx !== -1 &&
      statusBarLine - 1 === domCursorBlockIdx;

    // Block cursor overlay
    const overlay = document.querySelector(
      ".vim-block-cursor",
    ) as HTMLElement | null;
    const overlayPresent = !!overlay;
    const overlayStyle = overlay ? window.getComputedStyle(overlay) : null;
    const overlayDisplayed =
      !!overlay && overlayStyle?.display !== "none" && overlay.offsetWidth > 0;
    const overlayRect = overlay?.getBoundingClientRect();
    const overlayTop = overlayRect?.top ?? Number.NaN;
    const overlayBottom = overlayRect?.bottom ?? Number.NaN;

    const activeEl = cursorLeaf as HTMLElement | null;
    const activeRect = activeEl?.getBoundingClientRect();
    const activeBlockTop = activeRect?.top ?? Number.NaN;
    const activeBlockBottom = activeRect?.bottom ?? Number.NaN;

    let overlayMatch = true;
    if (overlay && overlayDisplayed && activeRect) {
      const overlayCenter = (overlayTop + overlayBottom) / 2;
      overlayMatch =
        overlayCenter >= activeBlockTop - 4 &&
        overlayCenter <= activeBlockBottom + 4;
    }

    const textWindow: Array<{ idx: number; text: string }> = [];
    for (const d of [-2, -1, 0, 1, 2]) {
      const j = domCursorBlockIdx + d;
      if (j < 0 || j >= allEditable.length) continue;
      const text = (allEditable[j].textContent ?? "").slice(0, 60);
      textWindow.push({ idx: j, text });
    }
    return {
      mode,
      domCursorBlockIdx,
      domEditableCount,
      statusBarText: statusBarText.slice(0, 200),
      statusBarLine,
      statusBarMatch,
      overlayPresent,
      overlayDisplayed,
      overlayTop,
      overlayBottom,
      activeBlockTop,
      activeBlockBottom,
      overlayMatch,
      textWindow,
    };
  });
}

function shouldCheckUi(s: UiSnapshot, strict: boolean): boolean {
  if (s.mode === "link-hint") return false;
  if (s.domEditableCount === 0) return false;
  if (s.domCursorBlockIdx === -1) return false; // selection lost — separate failure
  // In insert/visual modes, the overlay is hidden and the status bar still
  // updates. Honor the same conservative default as cursor-invariant: skip
  // insert by default unless `strict` is on.
  if (s.mode === "insert" && !strict) return false;
  return true;
}

/** Manual one-shot UI-sync check. Safe to call any time. */
export async function assertUiInvariant(
  page: Page,
  opts: InvariantOptions = {},
): Promise<void> {
  const strict = opts.strict ?? specWideUiStrict;
  const s = await uiSnapshot(page);
  if (!shouldCheckUi(s, strict)) return;

  // Block cursor is hidden in non-normal modes; only check the overlay when
  // the mode says it should be visible.
  const overlayApplicable = s.mode === "normal";
  const statusOk = s.statusBarMatch;
  const overlayOk = !overlayApplicable || s.overlayMatch;
  if (statusOk && overlayOk) return;

  const failures: string[] = [];
  if (!statusOk) failures.push("status-bar");
  if (!overlayOk) failures.push("block-cursor-overlay");

  const label = opts.label ? ` (label: "${opts.label}")` : "";
  const lastKey = recentKeys[recentKeys.length - 1] ?? "<none>";
  const lines = [
    `[UiInvariant] Mismatch after key "${lastKey}" — ${failures.join(", ")}${label}`,
    ``,
    `  mode:                       ${s.mode}`,
    `  DOM cursor block idx:       ${s.domCursorBlockIdx}  (expected status-bar Line ${s.domCursorBlockIdx + 1})`,
    `  status-bar text:            ${JSON.stringify(s.statusBarText)}`,
    `  status-bar Line N:          ${s.statusBarLine}  → ${s.statusBarMatch ? "MATCH" : "STALE"}`,
    `  DOM editable count:         ${s.domEditableCount}`,
    ``,
    `  overlay present:            ${s.overlayPresent}`,
    `  overlay displayed:          ${s.overlayDisplayed}`,
    `  overlay viewport y:         ${s.overlayTop.toFixed(1)} … ${s.overlayBottom.toFixed(1)}`,
    `  active block (cursor) y:    ${s.activeBlockTop.toFixed(1)} … ${s.activeBlockBottom.toFixed(1)}`,
    `  overlay vs active:          ${s.overlayMatch ? "OVERLAPS" : "STALE (frozen at previous block?)"}`,
    ``,
    `  Last keys: ${JSON.stringify(recentKeys.slice(-5))}`,
    ``,
    `  Block contents (DOM cursor idx ± 2):`,
    ...s.textWindow.map((w) => {
      const marker = w.idx === s.domCursorBlockIdx ? "→ " : "  ";
      return `${marker}${w.idx}: ${JSON.stringify(w.text)}`;
    }),
    ``,
    `  Hint: a motion handler updated vim_info.active_line directly without `,
    `        calling updateInfoContainer() / updateBlockCursor(). Look for `,
    `        the keystroke's reducer in src/content_scripts/{navigation,visual,…}.`,
  ];
  expect(statusOk && overlayOk, lines.join("\n")).toBe(true);
}

/**
 * Spec-level toggle for the UI-sync invariant. Mirrors useCursorInvariant.
 *
 * Pass the spec's fixture-extended `test` as the second argument when the
 * spec uses one (see useCursorInvariant docstring for why).
 */
export function useUiInvariant(
  opts: { strict?: boolean } = {},
  testObj: HookHost = base as unknown as HookHost,
): void {
  testObj.beforeEach(() => {
    specWideUiEnabled = true;
    specWideUiStrict = opts.strict ?? false;
  });
  testObj.afterEach(() => {
    specWideUiEnabled = false;
    specWideUiStrict = false;
    // recentKeys is shared with cursor-invariant; only clear if cursor-
    // invariant isn't also active (its afterEach handles its own cleanup).
    if (!specWideEnabled) recentKeys.length = 0;
  });
}
