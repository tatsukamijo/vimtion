/**
 * Code block navigation - handles multi-line code blocks in Notion
 */

import { getCursorIndexInElement, setCursorPosition } from "../cursor";
import { setActiveLine } from "../core/line-management";
import { updateInfoContainer } from "../ui/info-container";

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
  // Notion code blocks frequently end their textContent with a trailing
  // "\n", which split("\n") turns into a phantom empty entry past the
  // visible last line. If the only newline ahead of us IS that trailing
  // one (i.e. there's no content after it), there is no real next line —
  // we should exit the block, not advance the cursor into the phantom
  // position where the browser renders it just below the leaf.
  const onLastRealLine = lineEnd === -1 || lineEnd === text.length - 1;
  if (onLastRealLine) {
    // Already on last line of code block — exit downward into the next block.
    // setActiveLine handles cursor placement (click/focus or in-block offset)
    // and updateInfoContainer refreshes the status bar + block cursor so the
    // DOM cursor and vim_info stay in sync.
    setActiveLine(vim_info.active_line + 1);
    updateInfoContainer();
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
    // Already on first line of code block — exit upward into the previous
    // block. Same rationale as the downward exit: setActiveLine moves the
    // DOM cursor and updateInfoContainer keeps the status bar / block cursor
    // consistent with vim_info.active_line.
    setActiveLine(vim_info.active_line - 1);
    updateInfoContainer();
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

// Visual column of an absolute offset within a code block's textContent.
// Code blocks are a single contenteditable element holding `\n`-separated
// logical lines, so column must be measured from the most recent `\n` (or
// 0 if none). Without this, h/l would store the absolute offset in
// desired_column and corrupt subsequent j/k column memory.
const codeBlockVisualColumn = (text: string, offset: number): number => {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  return offset - lineStart;
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
  vim_info.desired_column = codeBlockVisualColumn(text, newPos);
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
  vim_info.desired_column = codeBlockVisualColumn(text, newPos);
};

// Insert a literal "\n" at the current selection inside a code block and
// leave the cursor positioned immediately after it. Notion code blocks
// store source as plain text with "\n" separators (the syntax highlighter
// re-renders on input), so a Text("\n") node inserted via Range +
// dispatched input event reproduces what pressing Enter in insert mode
// does. document.execCommand("insertText", "\n") used to be the
// implementation but the browser silently dropped the "\n" in
// contenteditables, leaving subsequent typed text concatenated to the
// current line.
const insertNewlineInCodeBlock = (element: Element): void => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const newlineNode = document.createTextNode("\n");
  range.insertNode(newlineNode);

  // Park the cursor right after the inserted newline so the user types
  // onto the new logical line.
  const after = document.createRange();
  after.setStartAfter(newlineNode);
  after.collapse(true);
  selection.removeAllRanges();
  selection.addRange(after);

  // Tell Notion the content changed so its mutation observer / React
  // state stays in sync with the DOM and the change persists.
  element.dispatchEvent(
    new InputEvent("input", {
      inputType: "insertText",
      data: "\n",
      bubbles: true,
    }),
  );
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

  // Move cursor to end of current line, then insert a newline so the
  // user types on a fresh logical line below.
  setCursorPosition(currentElement, lineEnd);
  insertNewlineInCodeBlock(currentElement);

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

  // Insert the newline at line start; the cursor lands after the new "\n"
  // (i.e. the start of what is now the *next* line, the original line),
  // so step it back one position to the empty line we just created.
  setCursorPosition(currentElement, lineStart);
  insertNewlineInCodeBlock(currentElement);
  setCursorPosition(currentElement, lineStart);

  // Switch to insert mode
  vim_info.mode = "insert";
  // Note: updateInfoContainer() needs to be called from vim.ts
};
