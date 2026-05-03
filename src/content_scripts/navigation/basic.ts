/**
 * Basic cursor movement functions (h, j, k, l, 0, $)
 */

import { getCursorIndexInElement, setCursorPosition } from "../cursor";

export const moveCursorBackwards = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);

  // Vim semantics: h at col 0 is a no-op (no wrap to previous line).
  if (currentCursorPosition <= 0) return;

  const newPosition = currentCursorPosition - 1;
  setCursorPosition(currentElement, newPosition);
  vim_info.desired_column = newPosition; // Remember this column
};

export const moveCursorForwards = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const lineLength = currentElement.textContent?.length || 0;
  // Vim's normal-mode cursor sits ON a character; max valid column is len-1.
  const maxCol = Math.max(0, lineLength - 1);

  // Vim semantics: l at last char is a no-op (no wrap to next line).
  if (currentCursorPosition >= maxCol) return;

  const newPosition = currentCursorPosition + 1;
  setCursorPosition(currentElement, newPosition);
  vim_info.desired_column = newPosition; // Remember this column
};

export const jumpToLineStart = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;

  setCursorPosition(currentElement, 0);
  vim_info.desired_column = 0;
};

export const jumpToLineEnd = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const lineLength = currentElement.textContent?.length || 0;

  // Vim semantics: $ lands ON the last character (col = len - 1), not past it.
  // Empty line: clamp to 0.
  const newPos = Math.max(0, lineLength - 1);
  setCursorPosition(currentElement, newPos);
  vim_info.desired_column = newPos;
};
