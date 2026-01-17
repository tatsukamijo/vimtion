/**
 * Insert Mode Reducer
 *
 * Handles keyboard events in insert mode.
 * Insert mode delegates most editing to Notion's native editing but implements:
 * - Escape key to exit to normal mode
 * - "jk" sequence to exit to normal mode (Vim-style escape alternative)
 */

import { getCursorIndexInElement } from "../cursor";

export interface InsertReducerDeps {
  updateInfoContainer: () => void;
  lastInsertKey: string | null;
  lastInsertKeyTime: number;
  JK_TIMEOUT_MS: number;
  setLastInsertKey: (key: string | null) => void;
  setLastInsertKeyTime: (time: number) => void;
}

/**
 * Creates the insert mode reducer function.
 *
 * @param deps - Dependencies for the reducer
 * @returns Reducer function that handles insert mode keyboard events
 */
export const createInsertReducer = (deps: InsertReducerDeps) => {
  const {
    updateInfoContainer,
    lastInsertKey,
    lastInsertKeyTime,
    JK_TIMEOUT_MS,
    setLastInsertKey,
    setLastInsertKeyTime,
  } = deps;

  return (e: KeyboardEvent) => {
    const now = Date.now();

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        window.vim_info.mode = "normal";
        updateInfoContainer();
        setLastInsertKey(null);
        break;
      case "j":
        // Track 'j' press
        setLastInsertKey("j");
        setLastInsertKeyTime(now);
        break;
      case "k":
        // Check if 'k' follows 'j' within timeout
        if (lastInsertKey === "j" && now - lastInsertKeyTime < JK_TIMEOUT_MS) {
          e.preventDefault();
          e.stopPropagation();

          // Delete the 'j' character that was just typed
          const currentElement =
            window.vim_info.lines[window.vim_info.active_line]?.element;
          if (currentElement) {
            const selection = window.getSelection();
            const range = document.createRange();

            // Get current cursor position
            const cursorPos = getCursorIndexInElement(currentElement);

            // Create a range that selects the 'j' character (one character back)
            const walker = document.createTreeWalker(
              currentElement,
              NodeFilter.SHOW_TEXT,
              null,
            );

            let currentNode: Text | null = null;
            let currentOffset = 0;

            while ((currentNode = walker.nextNode() as Text | null)) {
              const nodeLength = currentNode.length;
              const nodeEnd = currentOffset + nodeLength;

              // Check if the position for 'j' (cursorPos - 1) falls within this node
              if (cursorPos - 1 >= currentOffset && cursorPos - 1 < nodeEnd) {
                const offsetInNode = cursorPos - 1 - currentOffset;
                range.setStart(currentNode, offsetInNode);
                range.setEnd(currentNode, offsetInNode + 1);
                range.deleteContents();
                break;
              }

              currentOffset = nodeEnd;
            }
          }

          // Switch to normal mode
          window.vim_info.mode = "normal";
          updateInfoContainer();
          setLastInsertKey(null);
        } else {
          setLastInsertKey("k");
          setLastInsertKeyTime(now);
        }
        break;
      default:
        // Reset tracking on any other key
        setLastInsertKey(null);
        break;
    }
    return;
  };
};
