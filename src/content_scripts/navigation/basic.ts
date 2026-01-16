/**
 * Basic cursor movement functions (h, j, k, l, 0, $)
 */

import { getCursorIndexInElement, setCursorPosition } from "../cursor";

export const moveCursorBackwards = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);

  // If at beginning of line, move to end of previous line
  if (currentCursorPosition === 0) {
    if (vim_info.active_line > 0) {
      vim_info.active_line = vim_info.active_line - 1;
      const prevElement = vim_info.lines[vim_info.active_line].element;
      const prevLineLength = prevElement.textContent?.length || 0;
      setCursorPosition(prevElement, prevLineLength);
      vim_info.desired_column = prevLineLength;
    }
    return;
  }

  const newPosition = currentCursorPosition - 1;
  setCursorPosition(currentElement, newPosition);
  vim_info.desired_column = newPosition; // Remember this column
};

export const moveCursorForwards = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const lineLength = currentElement.textContent?.length || 0;

  // If at end of line, move to next line
  if (currentCursorPosition >= lineLength) {
    if (vim_info.active_line < vim_info.lines.length - 1) {
      vim_info.active_line = vim_info.active_line + 1;
      const nextElement = vim_info.lines[vim_info.active_line].element;
      setCursorPosition(nextElement, 0);
      vim_info.desired_column = 0;
    }
    return;
  }

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

  setCursorPosition(currentElement, lineLength);
  vim_info.desired_column = lineLength;
};
