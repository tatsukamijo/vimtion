/**
 * Character Finding Navigation (f, F, t, T commands)
 * Implements single-character search within a line
 */

import { getCursorIndexInElement, setCursorPosition } from "../cursor";

/**
 * Visual column of an absolute offset within the element's textContent.
 *
 * For normal blocks, textContent has no `\n` and column === offset. For
 * multi-line code blocks (one contenteditable element with `\n`-separated
 * logical lines), the column is measured from the start of the logical
 * line containing the offset, so j/k can preserve horizontal position.
 */
const visualColumn = (text: string, offset: number): number => {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  return offset - lineStart;
};

/**
 * Find character forward (f command)
 * Moves cursor to the next occurrence of char on the current line
 */
export const findCharForward = (char: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  // Search for character after current position
  const foundIndex = text.indexOf(char, currentPos + 1);
  if (foundIndex !== -1) {
    setCursorPosition(currentElement, foundIndex);
    vim_info.desired_column = visualColumn(text, foundIndex);
  }
};

/**
 * Find character backward (F command)
 * Moves cursor to the previous occurrence of char on the current line
 */
export const findCharBackward = (char: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  // Search for character before current position
  const foundIndex = text.lastIndexOf(char, currentPos - 1);
  if (foundIndex !== -1) {
    setCursorPosition(currentElement, foundIndex);
    vim_info.desired_column = visualColumn(text, foundIndex);
  }
};

/**
 * Till character forward (t command)
 * Moves cursor to one position before the next occurrence of char
 */
export const tillCharForward = (char: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  // Search for character after current position, but stop one before it
  const foundIndex = text.indexOf(char, currentPos + 1);
  if (foundIndex !== -1) {
    const targetPos = foundIndex - 1;
    setCursorPosition(currentElement, targetPos);
    vim_info.desired_column = visualColumn(text, targetPos);
  }
};

/**
 * Till character backward (T command)
 * Moves cursor to one position after the previous occurrence of char
 */
export const tillCharBackward = (char: string) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const currentPos = getCursorIndexInElement(currentElement);

  // Search for character before current position, but stop one after it
  const foundIndex = text.lastIndexOf(char, currentPos - 1);
  if (foundIndex !== -1) {
    const targetPos = foundIndex + 1;
    setCursorPosition(currentElement, targetPos);
    vim_info.desired_column = visualColumn(text, targetPos);
  }
};
