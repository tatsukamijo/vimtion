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
export const cutWholeBlock = (element: HTMLElement): boolean => {
  if (!element.isConnected) return false;
  const block = element.closest("[data-block-id]");
  element.focus({ preventScroll: true });
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(true);
  const sel = window.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand("cut");
  return !block || !block.isConnected;
};

/**
 * Delete `lineCount` consecutive lines starting at `firstElement`, one Notion
 * block per line. Lines whose block sits inside another deleted block are
 * skipped (they go away with their parent). Blocks are cut bottom-up so the
 * remaining elements stay valid.
 *
 * @param firstElement - First contenteditable element to delete
 * @param lineCount - Number of lines to delete
 * @returns Promise resolving to the number of blocks cut (= undo steps)
 */
export const deleteMultipleLinesAtomically = (
  firstElement: HTMLElement,
  lineCount: number,
): Promise<number> => {
  return new Promise((resolve) => {
    const { vim_info } = window;
    const firstLineIndex = vim_info.lines.findIndex(
      (line) => line.element === firstElement,
    );

    if (firstLineIndex === -1) {
      resolve(0);
      return;
    }

    const lastLineIndex = Math.min(
      firstLineIndex + lineCount - 1,
      vim_info.lines.length - 1,
    );
    const elements = vim_info.lines
      .slice(firstLineIndex, lastLineIndex + 1)
      .map((line) => line.element);
    const blocks = elements.map((el) => el.closest("[data-block-id]"));
    const targets = elements.filter(
      (_, i) =>
        !blocks.some(
          (other, j) =>
            j !== i && other && blocks[i] && other !== blocks[i] &&
            other.contains(blocks[i]),
        ),
    );

    const cutNext = (k: number) => {
      if (k < 0) {
        setTimeout(() => resolve(targets.length), 50);
        return;
      }
      cutWholeBlock(targets[k]);
      // Give Notion a tick to commit the transaction before the next cut.
      setTimeout(() => cutNext(k - 1), 30);
    };
    cutNext(targets.length - 1);
  });
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
    cutWholeBlock(element);
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
