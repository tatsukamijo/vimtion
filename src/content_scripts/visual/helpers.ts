/**
 * Visual Mode Helper Functions
 *
 * This module contains helper functions for visual and visual-line modes:
 * - Selection manipulation (setRange, safeAddRange, updateVisualSelection)
 * - Text object selection (word, bracket, paragraph)
 * - Visual mode cursor movement
 * - Visual mode operators (yank, delete)
 */

import {
  getCursorIndexInElement,
  setCursorPosition,
  resolveTextPosition,
  lineBoundsAt,
  charBoundsAt,
} from "../cursor";
import { isInsideCodeBlock } from "../notion";
import { getInnerWordBounds, getAroundWordBounds } from "../text-objects/word";
import {
  findMatchingQuotes,
  findMatchingBrackets,
} from "../text-objects/bracket";
import {
  getInnerParagraphBounds,
  getAroundParagraphBounds,
} from "../operators/helpers";
import { clearAllBackgroundColors } from "../core/dom-utils";
import { setActiveLine } from "../core/line-management";
import { WORD_CHAR } from "../text/word-char";

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
 * Resolves each endpoint to the text node that actually holds it, so ranges
 * starting inside a nested element (syntax-highlight token, bold span) still
 * get their end set. (The previous recursive walk returned after descending
 * into the start's element and never set the end when it lay past that
 * element; the range then kept its default position at the top of the
 * document, and operators hit the paragraph above the code block.)
 */
export const setRangeInElement = (
  range: Range,
  element: Node,
  start: number,
  end: number,
) => {
  const el = element as Element;
  const from = resolveTextPosition(el, start, start < end);
  const to = resolveTextPosition(el, end, false);
  if (!from || !to) {
    // No text at all (empty line): collapse inside the element itself.
    range.selectNodeContents(element);
    range.collapse(true);
    return;
  }
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
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

  // Both ends are inclusive characters; an emoji spans 2+ code units.
  const text = currentElement.textContent || "";
  const lo = Math.min(startPos, currentPos);
  const hi = Math.max(startPos, currentPos);
  const selStart = charBoundsAt(text, lo).start;
  const selEnd = Math.min(Math.max(charBoundsAt(text, hi).end, hi + 1), lineLength);

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
    // In visual mode desired_column is the selection's moving end as an
    // absolute offset. Start it on the caret and draw the one-char selection
    // now: leaving a stale column (e.g. a code-line column, or the column
    // remembered from a longer line) made `vd` act on the wrong text, and an
    // undrawn (collapsed) selection made `vd`/`vy` cut/copy the whole block.
    vim_info.desired_column = currentCursorPosition;
    updateVisualSelection();

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
  const element = vim_info.lines[vim_info.active_line].element;
  // h never leaves the (code) line.
  const { start } = lineBoundsAt(
    element.textContent || "",
    vim_info.desired_column,
  );

  if (vim_info.desired_column <= start) return;

  vim_info.desired_column = charBoundsAt(
    element.textContent || "",
    vim_info.desired_column - 1,
  ).start;
  updateVisualSelection();
};

/**
 * Move cursor forwards in visual mode
 */
export const visualMoveCursorForwards = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  // l may reach the line's end-of-line position (as in Vim's visual mode)
  // but never the next (code) line.
  const { end } = lineBoundsAt(
    currentElement.textContent || "",
    vim_info.desired_column,
  );

  if (vim_info.desired_column >= end) return;

  vim_info.desired_column = Math.min(
    end,
    charBoundsAt(currentElement.textContent || "", vim_info.desired_column).end,
  );
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
  while (pos < text.length && WORD_CHAR.test(text[pos])) {
    pos++;
  }

  // Skip non-word characters (spaces, punctuation)
  while (pos < text.length && !WORD_CHAR.test(text[pos])) {
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
  while (pos > 0 && !WORD_CHAR.test(text[pos])) {
    pos--;
  }

  // Skip current word backwards
  while (pos > 0 && WORD_CHAR.test(text[pos - 1])) {
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
  while (pos < text.length && !WORD_CHAR.test(text[pos])) {
    pos++;
  }

  // Skip to end of next word
  while (pos < text.length && WORD_CHAR.test(text[pos])) {
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
  const element = vim_info.lines[vim_info.active_line].element;
  // Start of the current (code) line, as an absolute offset.
  vim_info.desired_column = lineBoundsAt(
    element.textContent || "",
    vim_info.desired_column,
  ).start;
  updateVisualSelection();
};

/**
 * Jump to end of line in visual mode
 */
export const visualJumpToEndOfLine = () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  // Last char of the current (code) line, as an absolute offset.
  const { start, end } = lineBoundsAt(
    currentElement.textContent || "",
    vim_info.desired_column,
  );
  vim_info.desired_column = Math.max(start, end - 1);
  updateVisualSelection();
};

// ============================================================================
// Visual Mode Operators
// ============================================================================

/**
 * Leave a visual operator with the caret ON a character of the active line
 * (never with no selection at all: an empty selection makes line recovery
 * fall back to the page title, so the next edit would hit the title).
 */
const placeCaretAfterVisualOp = (position: number) => {
  const { vim_info } = window;
  const element = vim_info.lines[vim_info.active_line].element;
  const length = (element.textContent || "").length;
  const target = Math.max(0, Math.min(position, length - 1));
  setCursorPosition(element, target);
  vim_info.desired_column = target - lineBoundsAt(element.textContent || "", target).start;
};

/**
 * Delete visual selection (cuts to clipboard)
 */
export const createDeleteVisualSelection = (
  updateInfoContainer: () => void,
  refreshLines?: () => void,
) => {
  return () => {
    const { vim_info } = window;

    if (vim_info.active_line !== vim_info.visual_start_line) {
      // Don't support multi-line delete yet
      return;
    }

    const element = vim_info.lines[vim_info.active_line].element;

    // v on an empty line selects its line break; d removes the line (Vim).
    // The collapsed cut makes Notion remove the empty block and drop the
    // caret, so re-anchor on the line that moved up instead of letting
    // recovery fall back to the page title.
    if ((element.textContent || "").length === 0) {
      const lineIndex = vim_info.active_line;
      document.execCommand("cut");
      vim_info.mode = "normal";
      setTimeout(() => {
        refreshLines?.();
        if (vim_info.lines.length === 0) return;
        vim_info.desired_column = 0;
        setActiveLine(Math.min(lineIndex, vim_info.lines.length - 1));
        updateInfoContainer();
      }, 50);
      return;
    }
    // The selection start is where Vim leaves the cursor after d.
    const start = getCursorIndexInElement(element);

    // The selection is already set by updateVisualSelection
    if (isInsideCodeBlock(element)) {
      // Notion turns a cut inside a code block into "cut the whole block",
      // so copy the text ourselves and delete just the selection.
      const selected = window.getSelection()?.toString() || "";
      navigator.clipboard.writeText(selected).catch(() => {});
      document.execCommand("delete");
    } else {
      // Use 'cut' to copy to clipboard like vim's 'd' command
      document.execCommand("cut");
    }
    vim_info.yank_type = "char";

    vim_info.mode = "normal";
    placeCaretAfterVisualOp(start);
    updateInfoContainer();
  };
};

/**
 * Yank visual selection (copies to clipboard)
 */
export const createYankVisualSelection = (updateInfoContainer: () => void) => {
  return () => {
    const { vim_info } = window;
    const element = vim_info.lines[vim_info.active_line].element;
    // Vim moves the cursor to the start of the yanked text.
    const start = getCursorIndexInElement(element);

    // Use execCommand('copy') to copy to clipboard without deleting
    document.execCommand("copy");
    vim_info.yank_type = "char";

    vim_info.mode = "normal";
    placeCaretAfterVisualOp(start);
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

    const firstLine = Math.min(vim_info.visual_start_line, vim_info.active_line);
    const firstElement = vim_info.lines[firstLine].element;
    // Selection start = start of the first yanked line (a code line when V
    // was used inside a code block).
    const selectionStart = getCursorIndexInElement(firstElement);

    document.execCommand("copy");
    vim_info.yank_type = "line";

    clearAllBackgroundColors();

    vim_info.mode = "normal";
    // Vim leaves the cursor on the first line of the yanked range.
    if (isInsideCodeBlock(firstElement)) {
      // setActiveLine would enter the code block at its first code line.
      vim_info.active_line = firstLine;
      setCursorPosition(firstElement, selectionStart);
      vim_info.desired_column = 0;
    } else {
      setActiveLine(firstLine);
    }
    updateInfoContainer();
  };
};
