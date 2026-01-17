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
 * Delete multiple lines atomically using Notion's block selection UI
 * Simulates mouse drag selection to select multiple blocks, then Backspace
 *
 * @param firstElement - First contenteditable element to delete
 * @param lineCount - Number of lines to delete
 * @returns Promise that resolves when deletion completes
 */
export const deleteMultipleLinesAtomically = (
  firstElement: HTMLElement,
  lineCount: number,
): Promise<void> => {
  return new Promise((resolve) => {
    const { vim_info } = window;
    const firstLineIndex = vim_info.lines.findIndex(
      (line) => line.element === firstElement,
    );

    if (firstLineIndex === -1) {
      resolve();
      return;
    }

    const lastLineIndex = firstLineIndex + lineCount - 1;
    if (lastLineIndex >= vim_info.lines.length) {
      resolve();
      return;
    }

    const firstBlock = firstElement.closest("[data-block-id]") as HTMLElement;
    const lastElement = vim_info.lines[lastLineIndex].element;
    const lastBlock = lastElement.closest("[data-block-id]") as HTMLElement;

    if (!firstBlock || !lastBlock) {
      resolve();
      return;
    }

    const firstRect = firstBlock.getBoundingClientRect();
    const lastRect = lastBlock.getBoundingClientRect();

    const startX = firstRect.left - 10;
    const startY = firstRect.top + firstRect.height / 2;
    const endX = firstRect.left + 200;
    const endY = lastRect.top + lastRect.height / 2;

    const startElement = document.elementFromPoint(startX, startY);

    const mouseDownEvent = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: startX,
      clientY: startY,
      button: 0,
    });
    startElement?.dispatchEvent(mouseDownEvent);

    setTimeout(() => {
      const mouseMoveEvent = new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: endX,
        clientY: endY,
        button: 0,
      });
      document.dispatchEvent(mouseMoveEvent);

      setTimeout(() => {
        const mouseUpEvent = new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: endX,
          clientY: endY,
          button: 0,
        });
        document.dispatchEvent(mouseUpEvent);

        setTimeout(() => {
          const selectedBlocks = document.querySelectorAll(
            "[data-block-id][data-block-selected]",
          );

          if (selectedBlocks.length === 0) {
            for (
              let i = firstLineIndex + lineCount - 1;
              i >= firstLineIndex;
              i--
            ) {
              const element = vim_info.lines[i].element;
              deleteNormalBlockWithKeyboardEvents(
                element,
                (firstLineIndex + lineCount - 1 - i) * 100,
              );
            }
            setTimeout(() => resolve(), lineCount * 100 + 100);
            return;
          }

          const backspaceEvent = new KeyboardEvent("keydown", {
            key: "Backspace",
            code: "Backspace",
            keyCode: 8,
            which: 8,
            bubbles: true,
            cancelable: true,
          });
          document.dispatchEvent(backspaceEvent);

          setTimeout(() => resolve(), 20);
        }, 100);
      }, 50);
    }, 50);
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

    const isListBlock =
      blockClassName.includes("bulleted_list") ||
      blockClassName.includes("numbered_list") ||
      blockClassName.includes("to_do") ||
      blockClassName.includes("quote");

    const range = document.createRange();
    range.selectNodeContents(element);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    element.focus();

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

      setTimeout(() => {
        const isEmpty = (element.textContent || "").trim().length === 0;
        const blockStillExists =
          blockElement && document.contains(blockElement);

        if (isEmpty && blockStillExists) {
          if (isListBlock) {
            const backspaceEvent = new KeyboardEvent("keydown", {
              key: "Backspace",
              code: "Backspace",
              keyCode: 8,
              which: 8,
              bubbles: true,
              cancelable: true,
            });
            element.dispatchEvent(backspaceEvent);

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
