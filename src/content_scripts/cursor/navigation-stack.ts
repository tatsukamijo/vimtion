/**
 * Navigation stack for cursor position history
 * Saves and restores cursor positions when navigating between pages
 */

import {
  setCursorPosition,
  getCursorIndexInElement,
  markNavigation,
} from "./position";
import { updateBlockCursor } from "./block-cursor";

/**
 * @param pageLinkId - The page block highlighted on the cursor's line (its
 *   highlight comes back with the cursor).
 */
export const saveCursorPosition = (pageLinkId: string | null = null) => {
  const { vim_info } = window;
  // Remove hash from URL to normalize it (block links have hashes)
  const currentUrl = window.location.href.split("#")[0];

  const currentElement = vim_info.lines[vim_info.active_line]?.element;

  // Try to find block ID from element or its ancestors
  let blockId = "N/A";
  let elem: HTMLElement | null = currentElement;
  while (elem) {
    const foundId = elem.getAttribute("data-block-id");
    if (foundId) {
      blockId = foundId;
      break;
    }
    elem = elem.parentElement;
  }

  try {
    // Get existing positions map
    const savedPositions = sessionStorage.getItem("vimtion_cursor_positions");
    const positionsMap: Record<string, any> = savedPositions
      ? JSON.parse(savedPositions)
      : {};

    // vim_info.cursor_position is not kept current by every motion; the DOM
    // caret is the truth when it is on the active line.
    const sel = document.getSelection();
    const caretOnLine =
      !!currentElement &&
      !!sel &&
      sel.rangeCount > 0 &&
      currentElement.contains(sel.getRangeAt(0).startContainer);
    const column = caretOnLine
      ? getCursorIndexInElement(currentElement)
      : vim_info.cursor_position;

    // Save position for current URL with block ID
    positionsMap[currentUrl] = {
      active_line: vim_info.active_line,
      cursor_position: column,
      block_id: blockId !== "N/A" ? blockId : null,
      page_link_id: pageLinkId,
    };

    sessionStorage.setItem(
      "vimtion_cursor_positions",
      JSON.stringify(positionsMap),
    );

    // Set a flag to indicate this is an intentional navigation (not a reload)
    // This flag will be checked in reinitializeAfterNavigation
    sessionStorage.setItem("vimtion_intentional_navigation", "true");
  } catch (e) {
    // Ignore storage errors
  }
};

/** Returns the page block that was highlighted (null when none). */
export const restoreCursorPosition = (): string | null => {
  let pageLinkId: string | null = null;
  const currentUrl = window.location.href.split("#")[0];

  try {
    const savedPositions = sessionStorage.getItem("vimtion_cursor_positions");

    if (savedPositions) {
      const positionsMap: Record<string, any> = JSON.parse(savedPositions);
      const data = positionsMap[currentUrl];

      if (data) {
        const { vim_info } = window;
        pageLinkId = data.page_link_id ?? null;

        // Try to find the element by block ID first (more reliable)
        let targetLineIndex = data.active_line;
        if (data.block_id) {
          const foundIndex = vim_info.lines.findIndex((line) => {
            let elem: HTMLElement | null = line.element;
            while (elem) {
              const foundId = elem.getAttribute("data-block-id");
              if (foundId === data.block_id) {
                return true;
              }
              elem = elem.parentElement;
            }
            return false;
          });

          if (foundIndex !== -1) {
            targetLineIndex = foundIndex;
          }
        }

        if (targetLineIndex < vim_info.lines.length) {
          const targetElement = vim_info.lines[targetLineIndex]?.element;
          if (targetElement && document.contains(targetElement)) {
            const column = Math.min(
              data.cursor_position || 0,
              targetElement.textContent?.length || 0,
            );
            const place = () => {
              vim_info.active_line = targetLineIndex;
              vim_info.cursor_position = column;
              vim_info.desired_column = column;
              setCursorPosition(targetElement, column);
              // The caret is still on the title from page init; its queued
              // selectionchange must not pull the cursor back there.
              markNavigation(targetElement, column);
              updateBlockCursor();
            };
            // Scroll to the target element first (before Notion does its own scrolling)
            // Use 'nearest' to avoid creating white space at the bottom
            targetElement.scrollIntoView({
              behavior: "auto",
              block: "nearest",
            });
            place();
            // Notion may move the caret again while it finishes rendering.
            setTimeout(() => {
              if (
                document.contains(targetElement) &&
                vim_info.mode === "normal"
              ) {
                place();
              }
            }, 100);
          }
        }

        // Delete the restored position after use
        delete positionsMap[currentUrl];
        sessionStorage.setItem(
          "vimtion_cursor_positions",
          JSON.stringify(positionsMap),
        );
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return pageLinkId;
};
