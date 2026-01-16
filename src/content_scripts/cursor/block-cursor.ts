/**
 * Block cursor rendering for normal mode
 */

import { isInsideCodeBlock } from "../notion";

export const createBlockCursor = () => {
  const cursor = document.createElement("div");
  cursor.classList.add("vim-block-cursor");
  cursor.style.display = "none";
  document.body.appendChild(cursor);
  return cursor;
};

export const updateBlockCursor = () => {
  const { vim_info } = window;
  let blockCursor = document.querySelector(
    ".vim-block-cursor",
  ) as HTMLDivElement;

  if (!blockCursor) {
    blockCursor = createBlockCursor();
  }

  if (vim_info.mode !== "normal") {
    blockCursor.style.display = "none";
    return;
  }

  // Get current cursor position
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    blockCursor.style.display = "none";
    return;
  }

  const range = selection.getRangeAt(0);
  let rect = range.getBoundingClientRect();

  // For empty lines or lines with only newline, we need special handling
  if (rect.width === 0 && rect.height === 0) {
    const currentElement = vim_info.lines[vim_info.active_line]?.element;
    if (!currentElement) {
      blockCursor.style.display = "none";
      return;
    }

    // Check if inside a code block
    const inCodeBlock = isInsideCodeBlock(currentElement);

    if (inCodeBlock) {
      // For code blocks on empty lines, temporarily insert a zero-width space to get the cursor position
      try {
        if (
          range.startContainer &&
          range.startContainer.nodeType === Node.TEXT_NODE
        ) {
          const textNode = range.startContainer as Text;
          const offset = range.startOffset;

          // Insert a zero-width space temporarily
          const zws = "\u200B";
          const originalText = textNode.textContent || "";
          textNode.textContent =
            originalText.slice(0, offset) + zws + originalText.slice(offset);

          // Create a range around the zero-width space
          const tempRange = document.createRange();
          tempRange.setStart(textNode, offset);
          tempRange.setEnd(textNode, offset + 1);

          const tempRect = tempRange.getBoundingClientRect();

          // Remove the zero-width space
          textNode.textContent = originalText;

          // Restore the selection
          range.setStart(textNode, offset);
          range.setEnd(textNode, offset);

          // If we got a valid rect, use it
          if (tempRect.height > 0) {
            blockCursor.style.display = "block";
            blockCursor.style.left = `${tempRect.left + window.scrollX}px`;
            blockCursor.style.top = `${tempRect.top + window.scrollY}px`;
            blockCursor.style.height = `${tempRect.height}px`;
            return;
          }
        }
      } catch (e) {
        // Fall through to default handling
      }
    }

    // Default: use element rect (for normal blocks or if code block handling failed)
    const elementRect = currentElement.getBoundingClientRect();
    blockCursor.style.display = "block";
    blockCursor.style.left = `${elementRect.left + window.scrollX}px`;
    blockCursor.style.top = `${elementRect.top + window.scrollY}px`;
    blockCursor.style.height = `${elementRect.height || 20}px`;
    return;
  }

  // Position the block cursor
  blockCursor.style.display = "block";
  blockCursor.style.left = `${rect.left + window.scrollX}px`;
  blockCursor.style.top = `${rect.top + window.scrollY}px`;
  blockCursor.style.height = `${rect.height || 20}px`;
};
