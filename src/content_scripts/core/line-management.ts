/**
 * Line Management Module
 * Manages the lines array (cached contenteditable elements) and active line state
 */

import { isInsideCodeBlock } from "../notion";
import { setCursorPosition } from "../cursor";
import { updateInfoContainer } from "../ui/info-container";

/**
 * Event listener callbacks - to be provided by vim.ts
 */
type EventHandlers = {
  handleKeydown: (e: KeyboardEvent) => void;
  handleClick: (e: MouseEvent) => void;
};

/**
 * True iff `lines[idx]` is a container contenteditable that wraps another
 * contenteditable also tracked in vim_info.lines.
 *
 * The concrete case is Notion's page-title editor wrapper
 * (`<div role="group" class="whenContentEditable">`): it has
 * contenteditable=true and contains the H1 leaf inside it. Placing the
 * DOM cursor on the wrapper is a visual no-op — Notion immediately
 * relocates the selection to the inner H1 leaf — but vim would still
 * record `active_line = wrapper-index`, producing a persistent invariant
 * mismatch (vim says "you're on line N", DOM cursor is on line N+1).
 * Detect structurally rather than by class name so the fix doesn't
 * depend on Notion-specific markup that may change.
 *
 * Filtering wrappers OUT of `lines` entirely is tempting but brittle —
 * Notion frequently swaps the H1 element under DOM mutation, and
 * keeping the wrapper in `lines` means `addEventListener("keydown", ...)`
 * on the stable wrapper catches keystrokes that bubble up from
 * transiently-stranded H1's. So we keep wrappers in `lines` but skip
 * them at the navigation boundary here.
 */
const isWrapperLine = (idx: number): boolean => {
  const el = window.vim_info.lines[idx]?.element;
  if (!el) return false;
  return window.vim_info.lines.some(
    (line) => line.element !== el && el.contains(line.element),
  );
};

/**
 * Set the active line and position cursor appropriately
 * Handles both normal blocks and code blocks differently
 *
 * @param idx - Line index to activate
 */
export const setActiveLine = (idx: number): void => {
  const {
    vim_info: { lines, desired_column },
  } = window;
  let i = idx;

  if (idx >= lines.length) i = lines.length - 1;
  if (i < 0) i = 0;

  // Walk past wrapper contenteditables. gg / k-at-line-1 land here when
  // lines[0] is the page-title wrapper; without the skip, vim's
  // active_line points at the wrapper while the DOM cursor is on the
  // inner H1. Walk forward (toward higher indices, deeper into the
  // document) — going backward would loop on lines[0].
  while (i < lines.length - 1 && isWrapperLine(i)) {
    i++;
  }

  const previousActiveLine = window.vim_info.active_line;
  window.vim_info.active_line = i;

  const targetElement = lines[i].element;

  // Check if we're inside a code block
  const inCodeBlock = isInsideCodeBlock(targetElement);

  // For code blocks, avoid .click() as it triggers Notion's internal logic
  // that can cause cursor to jump outside the block
  if (inCodeBlock) {
    // Only use setCursorPosition() for code blocks - no click or focus
    // Don't call focus() or click() - just set cursor position directly

    // For code blocks, we need to position the cursor on the correct line
    // If moving up (idx < previous active_line), go to the last line of the code block
    // If moving down (idx > previous active_line), go to the first line
    const text = targetElement.textContent || "";
    const rawCodeLines = text.split("\n");
    // Notion code blocks frequently end their textContent with a trailing
    // "\n", which split("\n") turns into a phantom empty entry. If we treat
    // it as a real line, k-from-the-block-below lands the cursor at
    // textLength (past the visible last line). Drop it so "last line"
    // means the last *visible* code line.
    const codeLines =
      rawCodeLines.length > 1 && rawCodeLines[rawCodeLines.length - 1] === ""
        ? rawCodeLines.slice(0, -1)
        : rawCodeLines;
    const movingUp = i < previousActiveLine;

    let cursorPosition = 0;
    if (movingUp) {
      // Moving up: go to the last line
      for (let j = 0; j < codeLines.length - 1; j++) {
        cursorPosition += codeLines[j].length + 1; // +1 for newline
      }
      // Add desired column on the last line
      const lastLineLength = codeLines[codeLines.length - 1].length;
      cursorPosition += Math.min(desired_column, lastLineLength);
    } else {
      // Moving down: go to the first line at desired column
      const firstLineLength = codeLines[0].length;
      cursorPosition = Math.min(desired_column, firstLineLength);
    }

    setCursorPosition(targetElement, cursorPosition);
  } else {
    // For normal blocks, click() and focus() with preventScroll to avoid
    // unwanted page jumps. Headings are an exception: Notion's own click
    // handler on a heading element relocates the DOM selection to an
    // unrelated leaf below (observed: k from first code line lands the
    // selection two leaves past the heading instead of in it). For
    // headings, skip the synthetic click and let focus + setCursorPosition
    // do the work directly. The block-type predicate matches Notion's
    // semantic heading tags (H1–H4 plus the page-title H1).
    const tag = targetElement.tagName;
    const isHeading =
      tag === "H1" || tag === "H2" || tag === "H3" || tag === "H4";
    if (!isHeading) {
      targetElement.click();
    }
    targetElement.focus({ preventScroll: true });

    // Set cursor to desired column, or end of line if line is shorter
    const lineLength = targetElement.textContent?.length || 0;
    const targetColumn = Math.min(desired_column, lineLength);
    setCursorPosition(targetElement, targetColumn);
  }
};

/**
 * Factory function to create refreshLines with event handlers
 * Rescans DOM for contenteditable elements and updates vim_info.lines
 *
 * @param handlers - Event listener callbacks for new elements
 * @returns refreshLines function
 */
export const createRefreshLines = (handlers: EventHandlers) => {
  return (): void => {
    const { vim_info } = window;
    const allEditableElements = Array.from(
      document.querySelectorAll("[contenteditable=true]"),
    ) as HTMLDivElement[];

    // Snapshot the active line's identity BEFORE rebuilding the lines array.
    // The element reference may become stale (Notion swaps leaf elements during
    // markdown-shortcut conversion); block_id was cached eagerly when the entry
    // was built, so it survives the swap.
    const previousActive = vim_info.lines[vim_info.active_line];
    const previousActiveElement = previousActive?.element ?? null;
    const previousActiveBlockId = previousActive?.block_id ?? null;

    // Find new elements that aren't in our lines array yet
    const existingElements = new Set(
      vim_info.lines.map((line) => line.element),
    );
    const newElements = allEditableElements.filter(
      (elem) => !existingElements.has(elem),
    );

    if (newElements.length > 0) {
      // Add event listeners to new elements
      newElements.forEach((elem) => {
        elem.addEventListener("keydown", handlers.handleKeydown, true);
        elem.addEventListener("click", handlers.handleClick, true);
      });
    }

    // Rebuild lines array in DOM order, caching block_id per entry
    vim_info.lines = allEditableElements.map((elem) => ({
      cursor_position: 0,
      element: elem,
      block_id:
        elem.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null,
    }));

    // Recover active line. Tiers, in priority order:
    //
    //   0. Code-block anchor (undo-scoped): when undo() opened the
    //      __vimtionUndoSettleUntil window AND previousActiveElement was
    //      inside a code block (still attached) AND the post-mutation
    //      DOM selection has wandered outside any code block, restore
    //      active_line to the code-block leaf and re-anchor the DOM
    //      cursor inside it. Catches the post-undo case where Notion's
    //      undo for code-block inserts moves the DOM cursor up to the
    //      heading above the block. Scoped to the post-undo window so
    //      click-driven navigation OUT of a code block is not fought.
    //
    //   1. Selection-leaf-as-truth: the DOM selection's leaf is in the
    //      rebuilt array AND differs from previousActiveElement. This covers
    //      both fresh-leaf insertion (o/O/Enter) and Notion-driven cursor
    //      jumps to a *pre-existing* leaf (the dominant case is undo, which
    //      can either roll back an insert — making previousActiveElement a
    //      detached node — or refocus the block where the original edit
    //      happened).
    //
    //   2. Element-identity: previousActiveElement still in the rebuilt
    //      array. Covers ordinary navigation (rapid j/k) where the cursor
    //      stayed on the active element and Notion's transient renderer
    //      noise hasn't moved the selection.
    //
    //   3. block_id: previousActiveElement detached but its data-block-id
    //      survives on a replacement node (markdown-shortcut swap territory,
    //      e.g. paragraph→heading conversion).
    //
    // The (0) → (1) → (2) → (3) ordering matters. Tier 0 must precede tier 1
    // because tier 1 would happily follow Notion's stray selection out of
    // the code block and produce the post-undo desync. A
    // previous narrow form of (1) gated on "selLeaf is brand new" to keep
    // rapid j/k off this path, but that gate also blocked the post-undo
    // cursor-jump cases where the new leaf is pre-existing. Tier 1 is now
    // safe to broaden because rapid j/k ends with setCursorPosition leaving
    // selLeaf === lines[active_line].element === previousActiveElement, so
    // the `selLeaf !== previousActiveElement` guard alone is enough to
    // keep that path off.
    const selection = window.getSelection();
    const selAnchor = selection?.anchorNode ?? null;
    const selAnchorEl =
      selAnchor && selAnchor.nodeType === Node.ELEMENT_NODE
        ? (selAnchor as Element)
        : selAnchor?.parentElement ?? null;
    const selLeaf = selAnchorEl?.closest('[contenteditable="true"]') ?? null;

    let tierOneFired = false;

    // Tier 0: undo-scoped code-block anchor. Only active inside the post-
    // undo window opened by undo() in vim.ts.
    const undoSettleUntil =
      (window as Window & { __vimtionUndoSettleUntil?: number })
        .__vimtionUndoSettleUntil ?? 0;
    const inUndoWindow = Date.now() < undoSettleUntil;
    if (
      inUndoWindow &&
      previousActiveElement &&
      isInsideCodeBlock(previousActiveElement) &&
      selLeaf &&
      !isInsideCodeBlock(selLeaf)
    ) {
      const prevIndex = vim_info.lines.findIndex(
        (line) => line.element === previousActiveElement,
      );
      if (prevIndex !== -1) {
        vim_info.active_line = prevIndex;
        setCursorPosition(previousActiveElement as Element, 0);
        tierOneFired = true;
      }
    }

    if (!tierOneFired && selLeaf && selLeaf !== previousActiveElement) {
      const selIndex = vim_info.lines.findIndex(
        (line) => line.element === selLeaf,
      );
      if (selIndex !== -1) {
        vim_info.active_line = selIndex;
        tierOneFired = true;
      }
    }

    if (!tierOneFired && previousActiveElement) {
      let newIndex = vim_info.lines.findIndex(
        (line) => line.element === previousActiveElement,
      );
      if (newIndex === -1 && previousActiveBlockId) {
        newIndex = vim_info.lines.findIndex(
          (line) => line.block_id === previousActiveBlockId,
        );
      }
      if (newIndex !== -1) {
        vim_info.active_line = newIndex;
      }
    }

    // Keep ALL UI surfaces in step with the rebuilt array: the status bar
    // text (rendered from vim_info.active_line + 1), the absolutely-positioned
    // block-cursor overlay (geometric, anchored to lines[active_line]), and
    // the body.dataset bridge consumed by the test harness. refreshLines is
    // driven by MutationObserver, so it can fire AFTER the keydown handler's
    // updateInfoContainer has already run — without re-rendering here, any
    // active_line shift this function makes is invisible to the user (status
    // bar shows the previous block) and to the test harness (overlay
    // geometry stays frozen on the previous block). updateInfoContainer is
    // a pure render plus a syncVimInfoToDOM call at its tail; safe in any
    // observer context.
    //
    // The sync MUST cover all three tiers (selection-leaf, identity,
    // block_id); an earlier draft returned early from the selection-leaf
    // tier and skipped the sync, leaving the bridge frozen at the
    // pre-mutation active_line even though vim_info itself was correct.
    updateInfoContainer();
  };
};

/**
 * Factory function to create setLines with event handlers
 * Initial setup of lines array with event listeners and MutationObserver
 *
 * @param handlers - Event listener callbacks
 * @param refreshLines - The refresh function to use in MutationObserver
 * @returns setLines function
 */
export const createSetLines = (
  handlers: EventHandlers,
  refreshLines: () => void,
) => {
  return (elements: HTMLDivElement[]): void => {
    const { vim_info } = window;

    vim_info.lines = elements.map((elem) => ({
      cursor_position: 0,
      element: elem as HTMLDivElement,
      block_id:
        elem.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null,
    }));

    // Set initial active line to 0 BEFORE adding event listeners
    // (to prevent Notion's auto-focus from changing it)
    setActiveLine(0); // Uses the exported setActiveLine from this module

    // Add event listeners to ALL lines at once
    vim_info.lines.forEach((line) => {
      line.element.addEventListener("keydown", handlers.handleKeydown, true);
      line.element.addEventListener("click", handlers.handleClick, true);
    });

    // Reconcile active_line against the current DOM selection. Cheap; safe
    // to call repeatedly. Returns true iff it wrote a new active_line. When
    // it does, all UI surfaces are re-rendered via updateInfoContainer so
    // the status bar, block-cursor overlay, and dataset bridge agree with
    // vim_info.
    const reconcileFromSelection = (): boolean => {
      const sel = window.getSelection();
      const anchor = sel?.anchorNode ?? null;
      if (!anchor) return false;
      const el =
        anchor.nodeType === Node.ELEMENT_NODE
          ? (anchor as Element)
          : anchor.parentElement;
      const leaf = el?.closest('[contenteditable="true"]') ?? null;
      if (!leaf) return false;
      const { lines, active_line } = vim_info;
      if (lines[active_line]?.element === leaf) return false;
      const idx = lines.findIndex((line) => line.element === leaf);
      if (idx === -1) return false;
      vim_info.active_line = idx;
      updateInfoContainer();
      return true;
    };

    // Set up MutationObserver to detect new lines AND text-only mutations.
    // childList alone misses Notion's text-only undo (e.g. `A` → type → Esc →
    // j → u: undo rewinds the typed characters without removing/adding any
    // leaf, so refreshLines never re-runs and active_line stays on the post-j
    // block while the DOM cursor jumps back to where the edit happened).
    // Adding characterData covers that case while still firing on the insert
    // and removal paths.
    //
    // Filter our own UI surfaces (status bar, block-cursor overlay) out of
    // observed mutations. updateInfoContainer (called from refreshLines)
    // rewrites the status bar text and sometimes nudges the overlay's
    // textContent (zero-width-space measurement trick); both are observable
    // mutations on document.body subtree. Without this filter, refreshLines
    // → updateInfoContainer → mutation → MutationObserver → refreshLines is
    // an infinite loop that hangs the page on every keystroke.
    const ownUiContains = (node: Node | null): boolean => {
      let cur: Node | null = node;
      while (cur && cur !== document.body) {
        if (cur instanceof Element) {
          if (
            cur.classList.contains("vim-info-container") ||
            cur.classList.contains("vim-mode") ||
            cur.classList.contains("vim-block-cursor")
          ) {
            return true;
          }
        }
        cur = cur.parentNode;
      }
      return false;
    };
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((m) => !ownUiContains(m.target));
      if (!relevant) return;
      refreshLines();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Selection-change reconciliation: catches cursor moves that are not
    // accompanied by any DOM mutation (Notion can move the DOM cursor as a
    // pure focus shuffle between blocks). Pairs with the selection-leaf-as
    // -truth tier inside refreshLines, which handles the mutation-driven
    // path; this listener handles the remainder.
    document.addEventListener("selectionchange", reconcileFromSelection);
  };
};
