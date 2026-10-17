/**
 * DOM Utility Functions
 * Low-level DOM manipulation helpers for Notion blocks and elements
 */

/**
 * Clear background colors from all contenteditable elements
 * Used to reset visual selections and highlights
 */
export const clearAllBackgroundColors = (): void => {
  const allEditableElements = document.querySelectorAll(
    "[contenteditable=true]",
  );
  allEditableElements.forEach((elem) => {
    (elem as HTMLElement).style.backgroundColor = "";
  });
};

/**
 * True for an editable that belongs to the page being edited. Notion also
 * renders contenteditables in popovers (sidebar Rename, database cell editor),
 * comment boxes and the sidebar; treating those as lines turned what the user
 * typed there into Vim commands (k + dd deleted a page block while renaming).
 */
// A page can be shown in the main frame or in a peek (side / centre peek,
// where Notion opens database pages). Lines come from one of them: the one
// the user is working in.
const FRAME = ".notion-frame";
const PEEK = ".notion-peek-renderer";
let activeSurface: Element | null = null;

/** The frame or peek that contains `el`, if any. */
export const surfaceOf = (el: Element): Element | null =>
  el.closest(PEEK) ?? el.closest(FRAME);

/** The surface whose lines Vimtion works on. An open peek wins by default. */
const hasLines = (el: Element | null): el is Element =>
  !!el && el.isConnected && !!el.querySelector('[contenteditable="true"]');

export const currentSurface = (): Element | null => {
  // (A peek that is closing is still in the DOM for a moment, but empty.)
  if (hasLines(activeSurface)) return activeSurface;
  const peek = document.querySelector(PEEK);
  activeSurface = hasLines(peek) ? peek : document.querySelector(FRAME);
  return activeSurface;
};

/** Work on `surface` from now on (the user focused or clicked into it). */
export const setActiveSurface = (surface: Element | null): void => {
  activeSurface = surface;
};

export const isDocumentEditable = (el: Element): boolean => {
  // Comment / discussion inputs and the Notion AI prompt inside the page.
  if (el.closest('[class*="discussion"], .notion-agent-writer-ui')) return false;
  // A centre peek sits inside Notion's overlay / dialog; it is still a page.
  const peek = el.closest(PEEK);
  if (!peek) {
    if (
      el.closest(
        '[role="dialog"], .notion-overlay-container, .notion-sidebar-container, .notion-sidebar, .notion-topbar, nav, aside',
      )
    ) {
      return false;
    }
  }
  const surface = currentSurface();
  if (!surface) return true;
  return (peek ?? el.closest(FRAME)) === surface;
};

/** The page's editable lines, in DOM order (see isDocumentEditable). */
export const documentEditables = (): HTMLDivElement[] =>
  (
    Array.from(
      document.querySelectorAll("[contenteditable=true]"),
    ) as HTMLDivElement[]
  ).filter(isDocumentEditable);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Focus a leaf and put a collapsed caret at its start. */
const placeCaretAtStart = (leaf: HTMLElement): void => {
  leaf.focus({ preventScroll: true });
  const range = document.createRange();
  range.selectNodeContents(leaf);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
};

/**
 * Remove one whole Notion block (with any nested children) via Notion's own
 * cut handler: a COLLAPSED selection inside the block + execCommand("cut")
 * makes Notion cut the entire block, exactly like Cmd+X with nothing
 * selected. It also puts the block on the clipboard as Notion markdown.
 *
 * Why not the old approaches: Notion ignores synthetic (untrusted) mouse
 * drags and KeyboardEvents, so neither the drag-to-select + Backspace path nor
 * Delete/Backspace key events delete anything on current Notion.
 * execCommand runs Notion's real clipboard pipeline.
 *
 * @returns true if the block was removed
 */
export const cutWholeBlock = async (element: HTMLElement): Promise<boolean> => {
  if (!element.isConnected) return false;
  const block = element.closest("[data-block-id]");
  placeCaretAtStart(element);
  // Notion picks up caret moves from the async selectionchange event; cutting
  // in the same tick would cut whichever block Notion still thinks is active.
  await sleep(40);
  document.execCommand("cut");
  return !block || !block.isConnected;
};


/** Blocks nested directly under `block` (its children, not grandchildren). */
const directChildBlocks = (block: Element): Element[] =>
  Array.from(block.querySelectorAll("[data-block-id]")).filter(
    (b) => b.parentElement?.closest("[data-block-id]") === block,
  );

/** The block's own editable leaf (not one belonging to a nested block). */
const ownLeaf = (block: Element): HTMLElement | null =>
  (Array.from(block.querySelectorAll('[contenteditable="true"]')).find(
    (leaf) => leaf.closest("[data-block-id]") === block,
  ) as HTMLElement | undefined) ?? null;

/**
 * Find the live editor block for an id. Several elements can share one
 * data-block-id: Notion renders a copy inside the hover menu while the mouse
 * is over a block, plus leaf-less layout wrappers. Only the block that owns
 * an editable leaf is the real one.
 */
const findBlock = (blockId: string): Element | null =>
  Array.from(
    document.querySelectorAll(`[data-block-id="${blockId}"]`),
  ).find((b) => ownLeaf(b) !== null) ?? null;

/**
 * Outdent one block by sending Shift+Tab to its leaf. Notion handles Tab in
 * its keydown handler and accepts this synthetic event (unlike Backspace on a
 * block selection). Vimtion's own listener must see insert mode so it lets the
 * key through.
 */
const outdentBlock = async (block: Element): Promise<boolean> => {
  const leaf = ownLeaf(block);
  if (!leaf) return false;
  placeCaretAtStart(leaf);
  await sleep(40); // let Notion register the caret move (see cutWholeBlock)
  const { vim_info } = window;
  const previousMode = vim_info.mode;
  vim_info.mode = "insert";
  leaf.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Tab",
      code: "Tab",
      keyCode: 9,
      which: 9,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  vim_info.mode = previousMode;
  return true;
};

/**
 * Delete `lineCount` consecutive lines starting at `firstElement`, one Notion
 * block per line, like Vim deletes lines: only those lines go away. A deleted
 * block's children that are NOT being deleted are lifted one level first (so
 * they take the deleted line's place) instead of disappearing with it.
 *
 * Blocks are processed bottom-up, so selected children are removed before their
 * parent is processed, and remaining elements stay valid. Children are lifted
 * last-first: outdenting the last child puts it right after the parent; doing
 * the first child first would make Notion adopt its later siblings under it.
 *
 * @param firstElement - First contenteditable element to delete
 * @param lineCount - Number of lines to delete
 * @returns Promise resolving to the number of Notion edits made (= undo steps)
 */
export const deleteMultipleLinesAtomically = async (
  firstElement: HTMLElement,
  lineCount: number,
): Promise<number> => {
  const { vim_info } = window;
  const firstLineIndex = vim_info.lines.findIndex(
    (line) => line.element === firstElement,
  );
  if (firstLineIndex === -1) return 0;

  const lastLineIndex = Math.min(
    firstLineIndex + lineCount - 1,
    vim_info.lines.length - 1,
  );
  const blockIds = vim_info.lines
    .slice(firstLineIndex, lastLineIndex + 1)
    .map((line) => line.element.closest("[data-block-id]")?.getAttribute("data-block-id"))
    .filter((id): id is string => !!id);
  const uniqueIds = blockIds.filter((id, i) => blockIds.indexOf(id) === i);

  let edits = 0;
  for (let k = uniqueIds.length - 1; k >= 0; k--) {
    const blockId = uniqueIds[k];

    // Lift surviving children (last-first) so only this line is deleted.
    for (let guard = 0; guard < 200; guard++) {
      const block = findBlock(blockId);
      const children = block ? directChildBlocks(block) : [];
      const lastChild = children[children.length - 1];
      if (!lastChild || !(await outdentBlock(lastChild))) break;
      edits++;
      await sleep(60);
    }

    const block = findBlock(blockId);
    const leaf = block ? ownLeaf(block) : null;
    if (leaf && (await cutWholeBlock(leaf))) edits++;
    // Give Notion a tick to commit the transaction before the next edit.
    await sleep(30);
  }

  await sleep(50);
  return edits;
};

/**
 * Delete a normal Notion block (kept for its existing callers: paragraph and
 * visual-line change operators). Uses the execCommand("cut") primitive.
 *
 * @param element - The contenteditable element to delete
 * @param delay - Delay in ms before starting deletion (for batched operations)
 */
export const deleteNormalBlockWithKeyboardEvents = (
  element: HTMLElement,
  delay: number = 0,
): void => {
  setTimeout(() => {
    cutWholeBlock(element).catch(() => {});
  }, delay);
};

/**
 * Delete a code block using keyboard events
 * Requires clicking drag handle and waiting for Notion UI
 *
 * @param element - The code block element to delete
 * @param delay - Delay in ms before starting deletion
 */
export const deleteCodeBlockWithKeyboardEvents = (
  element: HTMLElement,
  delay: number = 0,
): void => {
  setTimeout(() => {
    if (!document.contains(element)) {
      return;
    }

    const codeBlockContainer = element.closest(".notion-code-block");
    if (!codeBlockContainer) {
      console.error("[Vim-Notion] Code block container not found");
      return;
    }

    const dragHandle = codeBlockContainer.querySelector(
      '[role="button"][draggable="true"]',
    ) as HTMLElement;
    if (!dragHandle) {
      console.error("[Vim-Notion] Drag handle not found");
      return;
    }

    dragHandle.click();

    setTimeout(() => {
      const backspaceEvent = new KeyboardEvent("keydown", {
        key: "Backspace",
        code: "Backspace",
        keyCode: 8,
        which: 8,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(backspaceEvent);
    }, 200);
  }, delay);
};
