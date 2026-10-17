/**
 * Basic cursor movement functions (h, j, k, l, 0, $)
 */

import {
  getCursorIndexInElement,
  setCursorPosition,
  lineBoundsAt,
  charBoundsAt,
} from "../cursor";

/** desired_column after `$`: "the end of whatever line we move to". */
export const END_OF_LINE_COLUMN = 1_000_000;

export const moveCursorBackwards = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);

  // Vim semantics: h at col 0 is a no-op (no wrap to previous line).
  if (currentCursorPosition <= 0) return;

  const text = currentElement.textContent || "";
  const newPosition = charBoundsAt(text, currentCursorPosition - 1).start;
  setCursorPosition(currentElement, newPosition);
  vim_info.desired_column = newPosition; // Remember this column
};

export const moveCursorForwards = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const lineLength = currentElement.textContent?.length || 0;
  // Vim's normal-mode cursor sits ON a character; max valid column is len-1.
  const text = currentElement.textContent || "";
  const maxCol = charBoundsAt(text, Math.max(0, lineLength - 1)).start;

  // Vim semantics: l at last char is a no-op (no wrap to next line).
  if (currentCursorPosition >= maxCol) return;

  const newPosition = charBoundsAt(text, currentCursorPosition).end;
  setCursorPosition(currentElement, newPosition);
  vim_info.desired_column = newPosition; // Remember this column
};

// 0 / $ / ^ act on the current line: the whole block for normal blocks, the
// current "\n"-delimited line inside a code block.
const currentLineBounds = () => {
  const { vim_info } = window;
  const element = vim_info.lines[vim_info.active_line].element;
  const text = element.textContent || "";
  return {
    element,
    text,
    ...lineBoundsAt(text, getCursorIndexInElement(element)),
  };
};

export const jumpToLineStart = () => {
  const { vim_info } = window;
  const { element, start } = currentLineBounds();

  setCursorPosition(element, start);
  vim_info.desired_column = 0;
};

export const jumpToLineEnd = () => {
  const { vim_info } = window;
  const { element, start, end } = currentLineBounds();

  // Vim semantics: $ lands ON the last character (col = len - 1), not past it.
  // Empty line: clamp to the line start.
  const newPos = Math.max(start, charBoundsAt(element.textContent || "", end - 1).start);
  setCursorPosition(element, newPos);
  // Vim's $ is sticky: later j / k keep going to the end of each line until a
  // horizontal motion. Every vertical move clamps the column to the line, so a
  // column past any line end means exactly that.
  vim_info.desired_column = END_OF_LINE_COLUMN;
};

// Move the cursor to the first non-whitespace character of the active line
// (Vim's `^`). Used by the cursor-moving `z` reposition variants
// (z. / z<CR> / z-). Falls back to the line start when the line is blank.
export const jumpToFirstNonBlank = () => {
  const { vim_info } = window;
  const { element, text, start, end } = currentLineBounds();
  const match = text.slice(start, end).match(/\S/);
  const newPos = start + (match ? (match.index ?? 0) : 0);

  setCursorPosition(element, newPos);
  vim_info.desired_column = newPos - start;
};
