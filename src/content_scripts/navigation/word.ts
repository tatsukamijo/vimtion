/**
 * Word navigation functions (w, b, e, W, B, E)
 */

import { getCursorIndexInElement, setCursorPosition } from "../cursor";
import { isWrapperLine } from "../core";

export const jumpToNextWord = () => {
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

  // If we reached end of line, move to next line
  if (pos >= text.length && vim_info.active_line < vim_info.lines.length - 1) {
    vim_info.active_line = vim_info.active_line + 1;
    const nextElement = vim_info.lines[vim_info.active_line].element;
    setCursorPosition(nextElement, 0);
    vim_info.desired_column = 0;
    return;
  }

  setCursorPosition(currentElement, pos);
  vim_info.desired_column = pos;
};

export const jumpToPreviousWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  // Vim: b at col 0 wraps to the start of the last word on the previous
  // line (block, in Notion). Mirrors `w`'s wrap-forward at end-of-line —
  // without this, `b` is asymmetric with `w` and gets stuck at the top
  // of every block. The earlier "match h's no-wrap policy" comment was
  // wrong in spirit: `b` is a word motion, not a column motion.
  if (currentCursorPosition === 0) {
    // Walk back past wrapper lines (the page-title contenteditable wraps
    // the H1 leaf and surfaces in lines[] for keystroke reasons; it has
    // no navigable text).
    let prevIdx = vim_info.active_line - 1;
    while (prevIdx >= 0 && isWrapperLine(prevIdx)) prevIdx--;
    if (prevIdx < 0) return;
    vim_info.active_line = prevIdx;
    const prevElement = vim_info.lines[prevIdx].element;
    const prevText = prevElement.textContent || "";
    // Find the start of the last word: walk back over trailing non-word
    // characters, then back over the word itself.
    let p = prevText.length;
    while (p > 0 && !/\w/.test(prevText[p - 1])) p--;
    while (p > 0 && /\w/.test(prevText[p - 1])) p--;
    setCursorPosition(prevElement, p);
    vim_info.desired_column = p;
    return;
  }

  let pos = currentCursorPosition - 1;

  // Skip non-word characters (spaces, punctuation) backwards
  while (pos > 0 && !/\w/.test(text[pos])) {
    pos--;
  }

  // Skip current word backwards
  while (pos > 0 && /\w/.test(text[pos - 1])) {
    pos--;
  }

  setCursorPosition(currentElement, pos);
  vim_info.desired_column = pos;
};

export const jumpToEndOfWord = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  let pos = currentCursorPosition;

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
  if (pos < currentCursorPosition) pos = currentCursorPosition; // Don't move backward

  setCursorPosition(currentElement, pos);
  vim_info.desired_column = pos;
};

export const jumpToEndOfWORD = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  let pos = currentCursorPosition;

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
  if (pos < currentCursorPosition) pos = currentCursorPosition; // Don't move backward

  setCursorPosition(currentElement, pos);
  vim_info.desired_column = pos;
};

export const jumpToNextWORD = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  let pos = currentCursorPosition;

  // Skip non-whitespace characters
  while (pos < text.length && !/\s/.test(text[pos])) {
    pos++;
  }

  // Skip whitespace
  while (pos < text.length && /\s/.test(text[pos])) {
    pos++;
  }

  setCursorPosition(currentElement, pos);
  vim_info.desired_column = pos;
};

export const jumpToPreviousWORD = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  if (currentCursorPosition === 0) return;

  let pos = currentCursorPosition - 1;

  // Skip whitespace backwards
  while (pos > 0 && /\s/.test(text[pos])) {
    pos--;
  }

  // Skip non-whitespace backwards to find WORD start
  while (pos > 0 && !/\s/.test(text[pos - 1])) {
    pos--;
  }

  setCursorPosition(currentElement, pos);
  vim_info.desired_column = pos;
};
