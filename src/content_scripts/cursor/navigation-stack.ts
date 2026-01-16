/**
 * Navigation stack for cursor position history
 * Saves and restores cursor positions when navigating between pages
 */

import { setCursorPosition } from "./position";
import { updateBlockCursor } from "./block-cursor";

export const saveCursorPosition = () => {
  const { vim_info } = window;
  // Remove hash from URL to normalize it (block links have hashes)
  const currentUrl = window.location.href.split("#")[0];

  const currentElement = vim_info.lines[vim_info.active_line]?.element;

  // Try to find block ID from element or its ancestors
  let blockId = "N/A";
  let elem = currentElement;
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

    // Save position for current URL with block ID
    positionsMap[currentUrl] = {
      active_line: vim_info.active_line,
      cursor_position: vim_info.cursor_position,
      block_id: blockId !== "N/A" ? blockId : null,
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

export const restoreCursorPosition = () => {
  const currentUrl = window.location.href.split("#")[0];

  try {
    const savedPositions = sessionStorage.getItem("vimtion_cursor_positions");

    if (savedPositions) {
      const positionsMap: Record<string, any> = JSON.parse(savedPositions);
      const data = positionsMap[currentUrl];

      if (data) {
        const { vim_info } = window;

        // Try to find the element by block ID first (more reliable)
        let targetLineIndex = data.active_line;
        if (data.block_id) {
          const foundIndex = vim_info.lines.findIndex((line) => {
            let elem = line.element;
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
          vim_info.active_line = targetLineIndex;
          vim_info.cursor_position = data.cursor_position;

          const targetElement = vim_info.lines[targetLineIndex]?.element;
          if (targetElement && document.contains(targetElement)) {
            // Scroll to the target element first (before Notion does its own scrolling)
            // Use 'nearest' to avoid creating white space at the bottom
            targetElement.scrollIntoView({
              behavior: "auto",
              block: "nearest",
            });

            // Then restore cursor position with delay to allow DOM to settle
            setTimeout(() => {
              // Re-set cursor position in case Notion moved it during re-render
              const currentElement =
                vim_info.lines[vim_info.active_line]?.element;
              if (currentElement && document.contains(currentElement)) {
                setCursorPosition(currentElement, vim_info.cursor_position);
              }

              updateBlockCursor();
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
};
