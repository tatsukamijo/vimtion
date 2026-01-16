/**
 * Cursor position management
 * Functions for getting and setting cursor position within elements
 */

import { updateBlockCursor } from "./block-cursor";

/**
 * Get the cursor index within the active element
 */
export const getCursorIndex = () => {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return 0;
  }

  const range = selection.getRangeAt(0);
  let i = 0;

  const checkElementNode = (element: Element) => {
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (checkElementNode(node as Element)) {
          break;
        } else {
          continue;
        }
      }
      if (node.isSameNode(range.startContainer)) {
        i += range.startOffset;
        return true;
      }
      i += node.textContent.length;
    }
    return false;
  };

  checkElementNode(document.activeElement);
  return i;
};

/**
 * Get the cursor index within a specific element
 */
export const getCursorIndexInElement = (element: Element): number => {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return 0;
  }

  const range = selection.getRangeAt(0);
  let i = 0;

  const checkElementNode = (el: Element): boolean => {
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (checkElementNode(node as Element)) {
          return true;
        }
        continue;
      }
      if (node.isSameNode(range.startContainer)) {
        i += range.startOffset;
        return true;
      }
      i += node.textContent?.length || 0;
    }
    return false;
  };

  checkElementNode(element);
  return i;
};

/**
 * Set cursor position within an element
 */
export const setCursorPosition = (element: Element, index: number) => {
  const childNodes = Array.from(element.childNodes);

  // Handle empty elements (no child nodes or only empty text)
  if (childNodes.length === 0 || (element.textContent?.length || 0) === 0) {
    const range = document.createRange();
    const selection = window.getSelection();

    // Select the element itself for empty lines
    range.selectNodeContents(element);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    updateBlockCursor();
    return;
  }

  let i = 0;
  for (const node of childNodes) {
    const nodeLength = node.textContent?.length || 0;
    const isInRange = index >= i && index <= i + nodeLength;
    if (isInRange && node.nodeType === Node.ELEMENT_NODE) {
      setCursorPosition(node as Element, index - i);
      break;
    }
    if (isInRange) {
      const range = document.createRange();
      const selection = window.getSelection();

      // Clamp the offset to be within the node's length
      const offset = Math.min(index - i, nodeLength);
      range.setStart(node, offset);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      updateBlockCursor();
      break;
    }
    i += nodeLength;
  }
};
