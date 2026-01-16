/**
 * Visual Mode Helper Functions
 *
 * This module contains helper functions for visual and visual-line modes:
 * - Selection manipulation (setRange, safeAddRange, updateVisualSelection)
 * - Text object selection (word, bracket, paragraph)
 * - Visual mode cursor movement
 * - Visual mode operators (yank, delete)
 */

import { getCursorIndexInElement, setCursorPosition } from "../cursor";
import {
  getInnerWordBounds,
  getAroundWordBounds,
} from "../text-objects/word";
import {
  findMatchingQuotes,
  findMatchingBrackets,
} from "../text-objects/bracket";
import {
  getInnerParagraphBounds,
  getAroundParagraphBounds,
} from "../operators/helpers";
import { clearAllBackgroundColors } from "../core/dom-utils";

/**
 * Safely add a range to a selection, handling errors gracefully
 */
export const safeAddRange = (
  selection: Selection | null,
  range: Range,
): boolean => {
  if (!selection) return false;
  try {
    selection.addRange(range);
    return true;
  } catch (e) {
    // Range is no longer in document, silently ignore
    console.warn("[Vim-Notion] Failed to add range to selection:", e);
    return false;
  }
};

/**
 * Set a range within an element based on character positions.
 * Handles text nodes and nested elements correctly.
 */
export const setRangeInElement = (
  range: Range,
  element: Node,
  start: number,
  end: number,
) => {
  let textOffset = 0;
  let startSet = false;
  let endSet = false;

  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const nodeLength = node.textContent?.length || 0;
      const nodeEnd = textOffset + nodeLength;

      if (!startSet && start >= textOffset && start <= nodeEnd) {
        range.setStart(node, Math.min(start - textOffset, nodeLength));
        startSet = true;
      }
      if (!endSet && end >= textOffset && end <= nodeEnd) {
        range.setEnd(node, Math.min(end - textOffset, nodeLength));
        endSet = true;
      }

      textOffset += nodeLength;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const childLength = node.textContent?.length || 0;

      if (!startSet && start < textOffset + childLength) {
        setRangeInElement(range, node, start - textOffset, end - textOffset);
        return;
      }

      textOffset += childLength;
    }
  }
};

/**
 * Update the visual selection based on current cursor position
 */
export const updateVisualSelection = () => {
  const { vim_info } = window;

  if (vim_info.mode !== "visual") return;

  // Only support single-line selection for now
  if (vim_info.active_line !== vim_info.visual_start_line) {
    // For now, don't support multi-line
    return;
  }

  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentPos = vim_info.desired_column;
  const startPos = vim_info.visual_start_pos;

  // Create selection using browser's Selection API
  const selection = window.getSelection();
  const range = document.createRange();

  const lineLength = currentElement.textContent?.length || 0;

  const [selStart, selEnd] =
    startPos <= currentPos
      ? [startPos, Math.min(currentPos + 1, lineLength)] // Include character under cursor, but don't exceed line length
      : [currentPos, Math.min(startPos + 1, lineLength)];

  setRangeInElement(range, currentElement, selStart, selEnd);
  selection?.removeAllRanges();
  safeAddRange(selection, range);
};

/**
 * Start visual mode at current cursor position
 */
export const createStartVisualMode = (updateInfoContainer: () => void) => {
  return () => {
    const { vim_info } = window;
    const currentElement = vim_info.lines[vim_info.active_line].element;
    const currentCursorPosition = getCursorIndexInElement(currentElement);

    vim_info.mode = "visual";
    vim_info.visual_start_line = vim_info.active_line;
    vim_info.visual_start_pos = currentCursorPosition;

    updateInfoContainer();
  };
};

/**
 * Select inner word in visual mode
 */
export const visualSelectInnerWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const [start, end] = getInnerWordBounds(text, currentCursorPosition);

  // Update visual selection to cover the word
  vim_info.visual_start_pos = start;
  vim_info.desired_column = end - 1; // Position cursor at end of word (inclusive)

  // Update the visual selection
  const range = document.createRange();
  const selection = window.getSelection();

  setRangeInElement(range, currentElement, start, end);
  selection?.removeAllRanges();
  safeAddRange(selection, range);
};

/**
 * Select around word in visual mode (includes surrounding whitespace)
 */
export const visualSelectAroundWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const [start, end] = getAroundWordBounds(text, currentCursorPosition);

  // Update visual selection to cover the word and surrounding whitespace
  vim_info.visual_start_pos = start;
  vim_info.desired_column = end - 1; // Position cursor at end of selection (inclusive)

  // Update the visual selection
  const range = document.createRange();
  const selection = window.getSelection();

  setRangeInElement(range, currentElement, start, end);
  selection?.removeAllRanges();
  safeAddRange(selection, range);
};

/**
 * Select inner bracket/quote in visual mode
 */
export const visualSelectInnerBracket = (
  openChar: string,
  closeChar: string,
) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  // Use different function for quotes (where open === close)
  const result =
    openChar === closeChar
      ? findMatchingQuotes(text, currentCursorPosition, openChar)
      : findMatchingBrackets(text, currentCursorPosition, openChar, closeChar);

  if (!result) {
    return;
  }

  const [openIndex, closeIndex] = result;

  // Select inner content (excluding brackets)
  vim_info.visual_start_pos = openIndex + 1;
  vim_info.desired_column = closeIndex - 1;

  // Update the visual selection
  const range = document.createRange();
  const selection = window.getSelection();

  setRangeInElement(range, currentElement, openIndex + 1, closeIndex);
  selection?.removeAllRanges();
  safeAddRange(selection, range);
};

/**
 * Select around bracket/quote in visual mode (includes delimiters)
 */
export const visualSelectAroundBracket = (
  openChar: string,
  closeChar: string,
) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  // Use different function for quotes (where open === close)
  const result =
    openChar === closeChar
      ? findMatchingQuotes(text, currentCursorPosition, openChar)
      : findMatchingBrackets(text, currentCursorPosition, openChar, closeChar);

  if (!result) {
    return;
  }

  const [openIndex, closeIndex] = result;

  // Select including brackets
  vim_info.visual_start_pos = openIndex;
  vim_info.desired_column = closeIndex;

  // Update the visual selection
  const range = document.createRange();
  const selection = window.getSelection();

  setRangeInElement(range, currentElement, openIndex, closeIndex + 1);
  selection?.removeAllRanges();
  safeAddRange(selection, range);
};

/**
 * Select inner paragraph in visual mode (switches to visual-line mode)
 */
export const createVisualSelectInnerParagraph = (
  updateVisualLineSelection: () => void,
  updateInfoContainer: () => void,
) => {
  return (): void => {
    const bounds = getInnerParagraphBounds();
    if (!bounds) {
      return;
    }

    const { vim_info } = window;
    const { startLine, endLine } = bounds;

    // Switch to visual line mode for paragraph selection
    vim_info.mode = "visual-line";
    vim_info.visual_start_line = startLine;
    vim_info.active_line = endLine;

    updateVisualLineSelection();
    updateInfoContainer();
  };
};

/**
 * Select around paragraph in visual mode (switches to visual-line mode)
 */
export const createVisualSelectAroundParagraph = (
  updateVisualLineSelection: () => void,
  updateInfoContainer: () => void,
) => {
  return (): void => {
    const bounds = getAroundParagraphBounds();
    if (!bounds) {
      return;
    }

    const { vim_info } = window;
    const { startLine, endLine } = bounds;

    // Switch to visual line mode for paragraph selection
    vim_info.mode = "visual-line";
    vim_info.visual_start_line = startLine;
    vim_info.active_line = endLine;

    updateVisualLineSelection();
    updateInfoContainer();
  };
};

// ============================================================================
// Visual Mode Cursor Movement
// ============================================================================

/**
 * Move cursor backwards in visual mode
 */
export const visualMoveCursorBackwards = () => {
  const { vim_info } = window;

  if (vim_info.desired_column === 0) return;

  vim_info.desired_column--;
  updateVisualSelection();
};

/**
 * Move cursor forwards in visual mode
 */
export const visualMoveCursorForwards = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const lineLength = currentElement.textContent?.length || 0;

  if (vim_info.desired_column >= lineLength) return;

  vim_info.desired_column++;
  updateVisualSelection();
};

/**
 * Jump to next word in visual mode
 */
export const visualJumpToNextWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  let pos = vim_info.desired_column;

  // Skip current word (alphanumeric characters)
  while (pos < text.length && /\w/.test(text[pos])) {
    pos++;
  }

  // Skip non-word characters (spaces, punctuation)
  while (pos < text.length && !/\w/.test(text[pos])) {
    pos++;
  }

  vim_info.desired_column = pos;
  updateVisualSelection();
};

/**
 * Jump to previous word in visual mode
 */
export const visualJumpToPreviousWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";

  if (vim_info.desired_column === 0) return;

  let pos = vim_info.desired_column - 1;

  // Skip non-word characters (spaces, punctuation) backwards
  while (pos > 0 && !/\w/.test(text[pos])) {
    pos--;
  }

  // Skip current word backwards
  while (pos > 0 && /\w/.test(text[pos - 1])) {
    pos--;
  }

  vim_info.desired_column = pos;
  updateVisualSelection();
};

/**
 * Jump to end of word in visual mode
 */
export const visualJumpToEndOfWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  let pos = vim_info.desired_column;

  // Always move at least one character forward
  pos++;

  // Skip non-word characters
  while (pos < text.length && !/\w/.test(text[pos])) {
    pos++;
  }

  // Skip to end of next word
  while (pos < text.length && /\w/.test(text[pos])) {
    pos++;
  }

  pos--; // Move back to last character of the word

  if (pos >= text.length) pos = text.length - 1;
  if (pos < vim_info.desired_column) pos = vim_info.desired_column; // Don't move backward

  vim_info.desired_column = pos;
  updateVisualSelection();
};

/**
 * Jump to next WORD in visual mode (whitespace-delimited)
 */
export const visualJumpToNextWORD = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  let pos = vim_info.desired_column;

  // Skip current WORD (non-whitespace characters)
  while (pos < text.length && !/\s/.test(text[pos])) {
    pos++;
  }

  // Skip whitespace
  while (pos < text.length && /\s/.test(text[pos])) {
    pos++;
  }

  vim_info.desired_column = pos;
  updateVisualSelection();
};

/**
 * Jump to previous WORD in visual mode
 */
export const visualJumpToPreviousWORD = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";

  if (vim_info.desired_column === 0) return;

  let pos = vim_info.desired_column - 1;

  // Skip whitespace backwards
  while (pos > 0 && /\s/.test(text[pos])) {
    pos--;
  }

  // Skip current WORD backwards
  while (pos > 0 && !/\s/.test(text[pos - 1])) {
    pos--;
  }

  vim_info.desired_column = pos;
  updateVisualSelection();
};

/**
 * Jump to end of WORD in visual mode
 */
export const visualJumpToEndOfWORD = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  let pos = vim_info.desired_column;

  // Always move at least one character forward
  pos++;

  // Skip whitespace
  while (pos < text.length && /\s/.test(text[pos])) {
    pos++;
  }

  // Skip to end of next WORD
  while (pos < text.length && !/\s/.test(text[pos])) {
    pos++;
  }

  pos--; // Move back to last character of the WORD

  if (pos >= text.length) pos = text.length - 1;
  if (pos < vim_info.desired_column) pos = vim_info.desired_column; // Don't move backward

  vim_info.desired_column = pos;
  updateVisualSelection();
};

/**
 * Jump to beginning of line in visual mode
 */
export const visualJumpToBeginningOfLine = () => {
  const { vim_info } = window;
  vim_info.desired_column = 0;
  updateVisualSelection();
};

/**
 * Jump to end of line in visual mode
 */
export const visualJumpToEndOfLine = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const lineLength = currentElement.textContent?.length || 0;
  vim_info.desired_column = lineLength;
  updateVisualSelection();
};

// ============================================================================
// Visual Mode Operators
// ============================================================================

/**
 * Delete visual selection (cuts to clipboard)
 */
export const createDeleteVisualSelection = (
  updateInfoContainer: () => void,
) => {
  return () => {
    const { vim_info } = window;

    if (vim_info.active_line !== vim_info.visual_start_line) {
      // Don't support multi-line delete yet
      return;
    }

    // The selection is already set by updateVisualSelection
    // Use 'cut' to copy to clipboard like vim's 'd' command
    document.execCommand("cut");

    vim_info.mode = "normal";
    window.getSelection()?.removeAllRanges();
    updateInfoContainer();
  };
};

/**
 * Yank visual selection (copies to clipboard)
 */
export const createYankVisualSelection = (updateInfoContainer: () => void) => {
  return () => {
    const { vim_info } = window;

    // Use execCommand('copy') to copy to clipboard without deleting
    document.execCommand("copy");

    vim_info.mode = "normal";
    window.getSelection()?.removeAllRanges();
    updateInfoContainer();
  };
};

/**
 * Yank visual line selection (copies to clipboard)
 */
export const createYankVisualLineSelection = (
  updateInfoContainer: () => void,
) => {
  return () => {
    const { vim_info } = window;

    // Use execCommand('copy') to copy to clipboard without deleting
    document.execCommand("copy");

    // Clear background highlights from all elements
    clearAllBackgroundColors();

    vim_info.mode = "normal";
    window.getSelection()?.removeAllRanges();
    updateInfoContainer();
  };
};
