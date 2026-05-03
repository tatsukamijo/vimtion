/**
 * Line Management Module
 * Manages the lines array (cached contenteditable elements) and active line state
 */

import { isInsideCodeBlock } from "../notion";
import { setCursorPosition } from "../cursor";

/**
 * Event listener callbacks - to be provided by vim.ts
 */
type EventHandlers = {
  handleKeydown: (e: KeyboardEvent) => void;
  handleClick: (e: MouseEvent) => void;
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
    const codeLines = text.split("\n");
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
    // For normal blocks, use click() and focus() with preventScroll to avoid unwanted page jumps
    targetElement.click();
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
    // was built, so it survives the swap. (BUG-013/BUG-012)
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

    // Recover active line: try element-identity first, then fall back to
    // block_id matching for replaced leaves.
    if (previousActiveElement) {
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

    // Set up MutationObserver to detect new lines
    const observer = new MutationObserver(() => {
      refreshLines();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  };
};
