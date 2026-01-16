/**
 * Motion yank operators
 * Handles yanking (copying) text based on motion commands
 */

import { getCursorIndexInElement } from "../cursor";
import { isParagraphBoundary } from "../notion";

/**
 * Yank current line
 */
export const createYankCurrentLine = () => async () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";

  try {
    // Add newline to indicate line-wise yank (Vim behavior)
    await navigator.clipboard.writeText(text + "\n");
  } catch (err) {
    console.error("[Vim-Notion] Failed to yank:", err);
  }
};

/**
 * Yank from cursor to next word boundary
 */
export const createYankToNextWord = () => async () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  let pos = currentCursorPosition;

  // Skip current word (alphanumeric characters)
  while (pos < text.length && /\w/.test(text[pos])) {
    pos++;
  }

  // Skip non-word characters (spaces, punctuation)
  while (pos < text.length && !/\w/.test(text[pos])) {
    pos++;
  }

  const yankedText = text.slice(currentCursorPosition, pos);

  try {
    await navigator.clipboard.writeText(yankedText);
  } catch (err) {
    console.error("[Vim-Notion] Failed to yank:", err);
  }
};

/**
 * Yank from cursor to end of line
 */
export const createYankToEndOfLine = () => async () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const yankedText = text.slice(currentCursorPosition);

  try {
    await navigator.clipboard.writeText(yankedText);
  } catch (err) {
    console.error("[Vim-Notion] Failed to yank:", err);
  }
};

/**
 * Yank from beginning of line to cursor
 */
export const createYankToBeginningOfLine = () => async () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const yankedText = text.slice(0, currentCursorPosition);

  try {
    await navigator.clipboard.writeText(yankedText);
  } catch (err) {
    console.error("[Vim-Notion] Failed to yank:", err);
  }
};

/**
 * Yank from cursor to previous paragraph boundary
 */
export const createYankToPreviousParagraph = () => async () => {
  const { vim_info } = window;
  const currentLine = vim_info.active_line;
  const currentElement = vim_info.lines[currentLine].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);

  // Find the target paragraph boundary
  let targetLine = currentLine;

  // If we're on a blank line, skip backward through all consecutive blank lines
  while (targetLine > 0 && isParagraphBoundary(targetLine)) {
    targetLine--;
  }

  // Now skip backward through the previous paragraph content
  while (targetLine > 0 && !isParagraphBoundary(targetLine - 1)) {
    targetLine--;
  }

  // Now targetLine is at the first line of the previous paragraph
  // Move up one more to land on the blank line above it (Vim behavior)
  // But only if there is a blank line above
  if (targetLine > 0 && isParagraphBoundary(targetLine - 1)) {
    targetLine--;
  }

  // Collect text from all lines between current and target
  const lines: string[] = [];

  // Add partial text from current line (from start to cursor)
  const currentText = currentElement.textContent || "";
  lines.push(currentText.slice(0, currentCursorPosition));

  // Add all lines in between (in reverse order since we're going backward)
  for (let i = currentLine - 1; i >= targetLine; i--) {
    const lineText = vim_info.lines[i].element.textContent || "";
    lines.unshift(lineText);
  }

  const yankedText = lines.join("\n");

  try {
    await navigator.clipboard.writeText(yankedText);
  } catch (err) {
    console.error("[Vim-Notion] Failed to yank:", err);
  }
};

/**
 * Yank from cursor to next paragraph boundary
 */
export const createYankToNextParagraph = () => async () => {
  const { vim_info } = window;
  const currentLine = vim_info.active_line;
  const maxLine = vim_info.lines.length - 1;
  const currentElement = vim_info.lines[currentLine].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);

  // Find the target paragraph boundary
  let targetLine = currentLine;

  // If we're on a blank line, skip forward through all consecutive blank lines
  while (targetLine < maxLine && isParagraphBoundary(targetLine)) {
    targetLine++;
  }

  // Now skip forward through the next paragraph content
  while (targetLine < maxLine && !isParagraphBoundary(targetLine + 1)) {
    targetLine++;
  }

  // Now targetLine is at the last line of the next paragraph
  // Move down one more to land on the blank line below it (Vim behavior)
  // But only if there is a blank line below
  if (targetLine < maxLine && isParagraphBoundary(targetLine + 1)) {
    targetLine++;
  }

  // Collect text from all lines between current and target
  const lines: string[] = [];

  // Add partial text from current line (from cursor to end)
  const currentText = currentElement.textContent || "";
  lines.push(currentText.slice(currentCursorPosition));

  // Add all lines in between
  for (let i = currentLine + 1; i <= targetLine; i++) {
    const lineText = vim_info.lines[i].element.textContent || "";
    lines.push(lineText);
  }

  const yankedText = lines.join("\n");

  try {
    await navigator.clipboard.writeText(yankedText);
  } catch (err) {
    console.error("[Vim-Notion] Failed to yank:", err);
  }
};
