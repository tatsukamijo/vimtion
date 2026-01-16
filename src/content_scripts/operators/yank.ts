/**
 * Yank (copy) operators for Vim mode
 */

import { getCursorIndexInElement } from "../cursor";
import { isParagraphBoundary } from "../notion";
import {
  getInnerWordBounds,
  getAroundWordBounds,
  findMatchingQuotes,
  findMatchingBrackets,
} from "../text-objects";
import { getInnerParagraphBounds, getAroundParagraphBounds } from "./helpers";

/**
 * Yank inner paragraph (excludes blank lines)
 * Used by: yip text object
 */
export const yankInnerParagraph = async (
  updateInfoContainer: () => void,
): Promise<void> => {
  const bounds = getInnerParagraphBounds();
  if (!bounds) {
    const { vim_info } = window;
    vim_info.pending_operator = null;
    updateInfoContainer();
    return;
  }

  const { vim_info } = window;
  const { startLine, endLine } = bounds;
  const lines: string[] = [];

  for (let i = startLine; i <= endLine; i++) {
    lines.push(vim_info.lines[i].element.textContent || "");
  }

  const yankedText = lines.join("\n");

  try {
    await navigator.clipboard.writeText(yankedText);
  } catch (err) {
    console.error("[Vim-Notion] Failed to yank:", err);
  }

  vim_info.pending_operator = null;
  updateInfoContainer();
};

/**
 * Yank around paragraph (includes surrounding blank lines)
 * Used by: yap text object
 */
export const yankAroundParagraph = async (
  updateInfoContainer: () => void,
): Promise<void> => {
  const bounds = getAroundParagraphBounds();
  if (!bounds) {
    const { vim_info } = window;
    vim_info.pending_operator = null;
    updateInfoContainer();
    return;
  }

  const { vim_info } = window;
  const { startLine, endLine } = bounds;
  const lines: string[] = [];

  for (let i = startLine; i <= endLine; i++) {
    lines.push(vim_info.lines[i].element.textContent || "");
  }

  const yankedText = lines.join("\n");

  try {
    await navigator.clipboard.writeText(yankedText);
  } catch (err) {
    console.error("[Vim-Notion] Failed to yank:", err);
  }

  vim_info.pending_operator = null;
  updateInfoContainer();
};

/**
 * Yank current line
 * Used by: yy command
 */
export const yankCurrentLine = async () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";

  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error("[Vim-Notion] Failed to yank:", err);
  }
};

/**
 * Yank from cursor to next word
 * Used by: yw command
 */
export const yankToNextWord = async () => {
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
 * Used by: y$ command
 */
export const yankToEndOfLine = async () => {
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
 * Used by: y0 command
 */
export const yankToBeginningOfLine = async () => {
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
 * Used by: y{ command
 */
export const yankToPreviousParagraph = async () => {
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
 * Used by: y} command
 */
export const yankToNextParagraph = async () => {
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

/**
 * Yank inner word
 * Used by: yiw text object
 */
export const yankInnerWord = async (updateInfoContainer: () => void) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const [start, end] = getInnerWordBounds(text, currentCursorPosition);
  const yankedText = text.slice(start, end);

  try {
    await navigator.clipboard.writeText(yankedText);
  } catch (err) {
    console.error("[Vim-Notion] Failed to yank:", err);
  }
  vim_info.pending_operator = null;
  updateInfoContainer();
};

/**
 * Yank around word
 * Used by: yaw text object
 */
export const yankAroundWord = async (updateInfoContainer: () => void) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const [start, end] = getAroundWordBounds(text, currentCursorPosition);
  const yankedText = text.slice(start, end);

  try {
    await navigator.clipboard.writeText(yankedText);
  } catch (err) {
    console.error("[Vim-Notion] Failed to yank:", err);
  }
  vim_info.pending_operator = null;
  updateInfoContainer();
};

/**
 * Yank inner bracket/quote
 * Used by: yi(, yi[, yi{, yi", etc.
 */
export const yankInnerBracket = (
  openChar: string,
  closeChar: string,
  updateInfoContainer: () => void,
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
    vim_info.pending_operator = null;
    updateInfoContainer();
    return;
  }

  const [openIndex, closeIndex] = result;
  const textToYank = text.slice(openIndex + 1, closeIndex);
  navigator.clipboard.writeText(textToYank);
  vim_info.pending_operator = null;
  updateInfoContainer();
};

/**
 * Yank around bracket/quote
 * Used by: ya(, ya[, ya{, ya", etc.
 */
export const yankAroundBracket = (
  openChar: string,
  closeChar: string,
  updateInfoContainer: () => void,
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
    vim_info.pending_operator = null;
    updateInfoContainer();
    return;
  }

  const [openIndex, closeIndex] = result;
  const textToYank = text.slice(openIndex, closeIndex + 1);
  navigator.clipboard.writeText(textToYank);
  vim_info.pending_operator = null;
  updateInfoContainer();
};

/**
 * Yank visual selection (character-wise)
 * Used by: y in visual mode
 */
export const yankVisualSelection = (updateInfoContainer: () => void) => {
  const { vim_info } = window;

  // Use execCommand('copy') to copy to clipboard without deleting
  document.execCommand("copy");

  vim_info.mode = "normal";
  window.getSelection()?.removeAllRanges();
  updateInfoContainer();
};

/**
 * Yank visual line selection
 * Used by: y in visual-line mode
 */
export const yankVisualLineSelection = (
  updateInfoContainer: () => void,
  clearAllBackgroundColors: () => void,
) => {
  const { vim_info } = window;

  // Use execCommand('copy') to copy to clipboard without deleting
  document.execCommand("copy");

  // Clear background highlights from all elements
  clearAllBackgroundColors();

  vim_info.mode = "normal";
  window.getSelection()?.removeAllRanges();
  updateInfoContainer();
};
