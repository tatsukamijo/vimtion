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
 * Delete a normal Notion block using keyboard events
 * Uses Delete+Backspace sequence with empty block detection
 *
 * @param element - The contenteditable element to delete
 * @param delay - Delay in ms before starting deletion (for batched operations)
 */
export const deleteNormalBlockWithKeyboardEvents = (
  element: HTMLElement,
  delay: number = 0,
): void => {
  setTimeout(() => {
    if (!document.contains(element)) {
      return;
    }

    const blockElement = element.closest("[data-block-id]");
    const blockClassName = blockElement?.className || "";

    // Check if this is a list block or quote block (blocks that need retry logic)
    const isListBlock =
      blockClassName.includes("bulleted_list") ||
      blockClassName.includes("numbered_list") ||
      blockClassName.includes("to_do") ||
      blockClassName.includes("quote");

    // Select entire content
    const range = document.createRange();
    range.selectNodeContents(element);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    element.focus();

    // Dispatch Delete key event
    setTimeout(() => {
      const deleteEvent = new KeyboardEvent("keydown", {
        key: "Delete",
        code: "Delete",
        keyCode: 46,
        which: 46,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(deleteEvent);

      // After deleting content, check if block is empty and delete it
      setTimeout(() => {
        const isEmpty = (element.textContent || "").trim().length === 0;
        const blockStillExists = blockElement && document.contains(blockElement);

        if (isEmpty && blockStillExists) {
          if (isListBlock) {
            // For list/quote blocks, use empty block detection with retry
            const backspaceEvent = new KeyboardEvent("keydown", {
              key: "Backspace",
              code: "Backspace",
              keyCode: 8,
              which: 8,
              bubbles: true,
              cancelable: true,
            });
            element.dispatchEvent(backspaceEvent);

            // Check if still exists and retry
            setTimeout(() => {
              if (document.contains(blockElement)) {
                const backspace2 = new KeyboardEvent("keydown", {
                  key: "Backspace",
                  code: "Backspace",
                  keyCode: 8,
                  which: 8,
                  bubbles: true,
                  cancelable: true,
                });
                document.dispatchEvent(backspace2);
              }
            }, 30);
          } else {
            // Regular block - single Backspace should work
            const backspaceEvent = new KeyboardEvent("keydown", {
              key: "Backspace",
              code: "Backspace",
              keyCode: 8,
              which: 8,
              bubbles: true,
              cancelable: true,
            });
            element.dispatchEvent(backspaceEvent);
          }
        }
      }, 30);
    }, 10);
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

    // Find the code block container
    const codeBlockContainer = element.closest(".notion-code-block");
    if (!codeBlockContainer) {
      console.error("[Vim-Notion] Code block container not found");
      return;
    }

    // Find the drag handle button
    const dragHandle = codeBlockContainer.querySelector(
      '[role="button"][draggable="true"]',
    ) as HTMLElement;
    if (!dragHandle) {
      console.error("[Vim-Notion] Drag handle not found");
      return;
    }

    // Click the drag handle to activate block options
    dragHandle.click();

    // Wait for Notion's UI to update (critical for code blocks)
    setTimeout(() => {
      // Dispatch Backspace to delete the block
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
