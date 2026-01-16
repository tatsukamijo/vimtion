/**
 * Code block navigation - handles multi-line code blocks in Notion
 */

import { getCursorIndexInElement, setCursorPosition } from "../cursor";

// Move cursor down within a code block (handles multi-line code blocks)
export const moveCursorDownInCodeBlock = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  // Find current line start
  let lineStart = text.lastIndexOf("\n", currentPos - 1);
  if (lineStart === -1) lineStart = -1; // Before first character

  // Find current line end (next newline)
  let lineEnd = text.indexOf("\n", currentPos);
  if (lineEnd === -1) {
    // Already on last line of code block, move to next block
    vim_info.active_line = vim_info.active_line + 1;
    return;
  }

  // Column position in current line
  const columnInLine = currentPos - lineStart - 1;

  // Next line starts after the newline
  const nextLineStart = lineEnd + 1;

  // Find next line end
  let nextLineEnd = text.indexOf("\n", nextLineStart);
  if (nextLineEnd === -1) nextLineEnd = text.length;

  // Calculate target position in next line
  const nextLineLength = nextLineEnd - nextLineStart;
  const targetColumn = Math.min(vim_info.desired_column, nextLineLength);
  const targetPos = nextLineStart + targetColumn;

  setCursorPosition(currentElement, targetPos);
};

// Move cursor up within a code block
export const moveCursorUpInCodeBlock = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  // Find current line start
  let lineStart = text.lastIndexOf("\n", currentPos - 1);

  if (lineStart === -1) {
    // Already on first line of code block, move to previous block
    vim_info.active_line = vim_info.active_line - 1;
    return;
  }

  // Find previous line start
  let prevLineStart = text.lastIndexOf("\n", lineStart - 1);
  if (prevLineStart === -1) prevLineStart = -1; // Before first character

  // Previous line is between prevLineStart and lineStart
  const prevLineLength = lineStart - prevLineStart - 1;
  const targetColumn = Math.min(vim_info.desired_column, prevLineLength);
  const targetPos = prevLineStart + 1 + targetColumn;

  setCursorPosition(currentElement, targetPos);
};

// Move cursor left within a code block, wrapping to previous line if at start
export const moveCursorBackwardsInCodeBlock = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  // If at very beginning of code block, can't go back
  if (currentPos === 0) {
    return;
  }

  // Just move back one character
  const newPos = currentPos - 1;
  setCursorPosition(currentElement, newPos);
  vim_info.desired_column = newPos;
};

// Move cursor right within a code block, wrapping to next line if at end
export const moveCursorForwardsInCodeBlock = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);
  const textLength = text.length;

  // If at very end of code block, can't go forward
  if (currentPos >= textLength) {
    return;
  }

  // Just move forward one character
  const newPos = currentPos + 1;
  setCursorPosition(currentElement, newPos);
  vim_info.desired_column = newPos;
};

// Open line below in code block (o command)
export const openLineBelowInCodeBlock = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  // Find the end of the current line (next \n or end of text)
  let lineEnd = text.indexOf("\n", currentPos);
  if (lineEnd === -1) lineEnd = text.length;

  // Move cursor to end of current line
  setCursorPosition(currentElement, lineEnd);

  // Insert a newline character using execCommand (works better in contenteditable)
  document.execCommand("insertText", false, "\n");

  // Switch to insert mode
  vim_info.mode = "insert";
  // Note: updateInfoContainer() needs to be called from vim.ts
};

// Open line above in code block (O command)
export const openLineAboveInCodeBlock = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  // Find the start of the current line (previous \n or start of text)
  let lineStart = text.lastIndexOf("\n", currentPos - 1);
  lineStart = lineStart === -1 ? 0 : lineStart + 1;

  // Move cursor to start of current line
  setCursorPosition(currentElement, lineStart);

  // Insert a newline character
  document.execCommand("insertText", false, "\n");

  // Move cursor back to the newly created empty line
  setCursorPosition(currentElement, lineStart);

  // Switch to insert mode
  vim_info.mode = "insert";
  // Note: updateInfoContainer() needs to be called from vim.ts
};
