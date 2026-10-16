/**
 * Motion delete operators
 * Handles deleting text based on motion commands
 */

import {
  getCursorIndexInElement,
  setCursorPosition,
  selectCharRange,
  deleteCharRange,
  lineBoundsAt,
  columnInLine,
  cutCharRange,
} from "../cursor";
import { isParagraphBoundary, isInsideCodeBlock } from "../notion";
import {
  deleteNormalBlockWithKeyboardEvents,
  deleteMultipleLinesAtomically,
} from "../core/dom-utils";
import { setActiveLine } from "../core/line-management";
import { beginBusy, endBusy } from "../core/busy";

/**
 * Dependencies for motion delete operators
 */
export interface MotionDeleteDeps {
  refreshLines: () => void;
  updateInfoContainer: () => void;
}

/**
 * Dependencies for character-find delete operators
 */
export interface CharDeleteDeps {
  updateInfoContainer: () => void;
}

/**
 * Delete current line
 * Handles both normal blocks (deletes entire block) and code blocks (deletes line within block)
 */
export const createDeleteCurrentLine = (deps: MotionDeleteDeps) => async () => {
  const { refreshLines, updateInfoContainer } = deps;
  const { vim_info } = window;
  const currentLineIndex = vim_info.active_line;
  const currentElement = vim_info.lines[currentLineIndex].element;

  // Check if we're inside a code block
  const inCodeBlock = isInsideCodeBlock(currentElement);

  if (inCodeBlock) {
    // For code blocks, delete only the line content, not the block itself
    const text = currentElement.textContent || "";
    const cursorPos = getCursorIndexInElement(currentElement);

    // Find the start and end of the current line
    let lineStart = text.lastIndexOf("\n", cursorPos - 1);
    lineStart = lineStart === -1 ? 0 : lineStart + 1;

    let lineEnd = text.indexOf("\n", cursorPos);
    // Notion ends a code block's text with a placeholder "\n"; the line before
    // it is the last real line (deleting "line\n" there left an empty line).
    if (lineEnd === text.length - 1) lineEnd = -1;
    // Include the newline character in deletion (if it exists)
    if (lineEnd !== -1) {
      lineEnd = lineEnd + 1; // Include the \n
    } else {
      // Last line - check if there's a newline before this line
      if (lineStart > 0) {
        // Delete the newline before this line instead
        lineStart = lineStart - 1;
      }
      lineEnd = text.endsWith("\n") ? text.length - 1 : text.length;
    }

    // Extract the line text for clipboard (without newlines for clipboard)
    const originalLineStart = text.lastIndexOf("\n", cursorPos - 1);
    const actualLineStart =
      originalLineStart === -1 ? 0 : originalLineStart + 1;
    const originalLineEnd = text.indexOf("\n", cursorPos);
    const actualLineEnd =
      originalLineEnd === -1 ? text.length : originalLineEnd;
    const lineText = text.substring(actualLineStart, actualLineEnd);
    navigator.clipboard.writeText(lineText).catch((err) => {
      console.error("[Vim-Notion] Failed to copy to clipboard:", err);
    });

    // Temporarily switch to insert mode
    vim_info.mode = "insert";
    beginBusy();

    // Select the line content using TreeWalker
    const walker = document.createTreeWalker(
      currentElement,
      NodeFilter.SHOW_TEXT,
      null,
    );

    let currentNode: Text | null = null;
    let currentOffset = 0;
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;

    while ((currentNode = walker.nextNode() as Text | null)) {
      const nodeLength = currentNode.length;
      const nodeEnd = currentOffset + nodeLength;

      if (!startNode && lineStart >= currentOffset && lineStart <= nodeEnd) {
        startNode = currentNode;
        startOffset = lineStart - currentOffset;
      }

      if (!endNode && lineEnd >= currentOffset && lineEnd <= nodeEnd) {
        endNode = currentNode;
        endOffset = lineEnd - currentOffset;
      }

      currentOffset = nodeEnd;
      if (startNode && endNode) break;
    }

    if (startNode && endNode) {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);

      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);

      // Delete the selected content
      setTimeout(() => {
        document.execCommand("delete");

        setTimeout(() => {
          vim_info.mode = "normal";
          // Vim: the cursor goes to the start of the line that took the
          // deleted line's place (the previous line after deleting the last).
          const newText = currentElement.textContent || "";
          const newCursorPos = lineBoundsAt(
            newText,
            Math.min(lineStart, Math.max(0, newText.length - 1)),
          ).start;
          vim_info.desired_column = 0;
          setCursorPosition(currentElement, newCursorPos);
          updateInfoContainer();
          endBusy();
        }, 10);
      }, 10);
    } else {
      vim_info.mode = "normal";
      endBusy();
    }
  } else {
    const lineText = currentElement.textContent || "";
    navigator.clipboard.writeText(lineText).catch((err) => {
      console.error("[Vim-Notion] Failed to copy to clipboard:", err);
    });

    vim_info.mode = "insert";
    vim_info.undo_count = 1;

    beginBusy();
    deleteMultipleLinesAtomically(currentElement, 1).then(() => {
      vim_info.mode = "normal";
      refreshLines();

      const newActiveLine = Math.max(
        0,
        Math.min(currentLineIndex, vim_info.lines.length - 1),
      );
      if (vim_info.lines.length > 0) {
        setActiveLine(newActiveLine);
      }
      updateInfoContainer();
      endBusy();
    });
  }
};

/**
 * Delete from cursor to next word boundary
 */
export const createDeleteToNextWord =
  (deps: { refreshLines?: () => void } = {}) =>
  () => {
    const { vim_info } = window;
    const lineIndex = vim_info.active_line;
    const currentElement = vim_info.lines[lineIndex].element;
    const currentCursorPosition = getCursorIndexInElement(currentElement);
    const text = currentElement.textContent || "";

    // dw on an empty line deletes the line itself (Vim joins it away). The
    // collapsed cut below makes Notion remove the empty block, after which the
    // DOM selection is gone; re-anchor on the line that moved up into its slot
    // instead of letting selection recovery fall back to the page title.
    if (text.length === 0) {
      document.execCommand("cut");
      setTimeout(() => {
        deps.refreshLines?.();
        if (vim_info.lines.length === 0) return;
        vim_info.desired_column = 0;
        setActiveLine(Math.min(lineIndex, vim_info.lines.length - 1));
      }, 50);
      return;
    }

    let pos = currentCursorPosition;

    // Skip current word
    while (pos < text.length && /\w/.test(text[pos])) {
      pos++;
    }

    // Skip non-word characters
    while (pos < text.length && !/\w/.test(text[pos])) {
      pos++;
    }

    // dw stops at the end of the (code) line; it never joins lines.
    pos = Math.min(pos, lineBoundsAt(text, currentCursorPosition).end);

    // Cut from cursor to pos (boundary-safe; never cuts a whole code block)
    cutCharRange(currentElement, currentCursorPosition, pos);

    // Stay on the deletion point, clamped onto the remaining text. Only move
    // the caret when Notion left it somewhere else: an extra selection change
    // right after the cut makes Notion fold the next edit into the same undo
    // step (two dw then one u restored both).
    const newLength = (currentElement.textContent || "").length;
    const newPosition = Math.max(
      0,
      Math.min(currentCursorPosition, newLength - 1),
    );
    if (getCursorIndexInElement(currentElement) !== newPosition) {
      setCursorPosition(currentElement, newPosition);
    }
    vim_info.desired_column = columnInLine(currentElement, newPosition);
  };

/**
 * Delete from cursor to end of line (D / d$). In a code block "line" is the
 * current code line, not the whole block.
 */
export const createDeleteToEndOfLine = () => () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const pos = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";
  const { start, end } = lineBoundsAt(text, pos);

  const deleted = text.slice(pos, end);
  if (deleted) {
    navigator.clipboard.writeText(deleted).catch(() => {});
    vim_info.yank_type = "char";
  }
  deleteCharRange(currentElement, pos, end);

  // Normal mode rests on the new last character of the line.
  const target = pos > start ? pos - 1 : start;
  setCursorPosition(currentElement, target);
  vim_info.desired_column = target - start;
};

/**
 * Delete from beginning of line to cursor (d0)
 */
export const createDeleteToBeginningOfLine = () => () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const pos = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";
  const { start } = lineBoundsAt(text, pos);

  const deleted = text.slice(start, pos);
  if (deleted) {
    navigator.clipboard.writeText(deleted).catch(() => {});
    vim_info.yank_type = "char";
  }
  deleteCharRange(currentElement, start, pos);

  setCursorPosition(currentElement, start);
  vim_info.desired_column = 0;
};

/**
 * Delete from cursor to previous paragraph boundary
 */
export const createDeleteToPreviousParagraph =
  (deps: MotionDeleteDeps) => () => {
    const { refreshLines, updateInfoContainer } = deps;
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
    if (targetLine > 0) {
      targetLine--;
    }

    // Collect text from all lines between current and target for clipboard
    const lines: string[] = [];

    // Add partial text from current line (from start to cursor)
    const currentText = currentElement.textContent || "";
    lines.push(currentText.slice(0, currentCursorPosition));

    // Add all lines in between (in reverse order since we're going backward)
    for (let i = currentLine - 1; i >= targetLine; i--) {
      const lineText = vim_info.lines[i].element.textContent || "";
      lines.unshift(lineText);
    }

    const clipboardText = lines.join("\n");

    // Copy to clipboard
    navigator.clipboard.writeText(clipboardText).catch((err) => {
      console.error("[Vim-Notion] Failed to copy to clipboard:", err);
    });

    // If we're deleting across multiple lines
    if (currentLine !== targetLine) {
      // Switch to insert mode temporarily
      vim_info.mode = "insert";

      // Delete all blocks from targetLine to currentLine - 1
      let currentDelay = 10;
      for (let i = currentLine - 1; i >= targetLine; i--) {
        const element = vim_info.lines[i].element;
        deleteNormalBlockWithKeyboardEvents(element, currentDelay);
        currentDelay += 50;
      }

      // Delete partial content from current line (from start to cursor)
      setTimeout(() => {
        const text = currentElement.textContent || "";
        const newText = text.slice(currentCursorPosition);
        currentElement.textContent = newText;
        setCursorPosition(currentElement, 0);
        vim_info.desired_column = 0;

        // Return to normal mode
        setTimeout(() => {
          vim_info.mode = "normal";
          refreshLines();
          updateInfoContainer();
        }, 50);
      }, currentDelay + 50);
    } else {
      // Same line - just delete text from start to cursor
      const text = currentElement.textContent || "";
      const newText = text.slice(currentCursorPosition);
      currentElement.textContent = newText;
      setCursorPosition(currentElement, 0);
      vim_info.desired_column = 0;
    }
  };

/**
 * Delete from cursor to next paragraph boundary
 */
export const createDeleteToNextParagraph = (deps: MotionDeleteDeps) => () => {
  const { refreshLines, updateInfoContainer } = deps;
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
  if (targetLine < maxLine) {
    targetLine++;
  }

  // Collect text from all lines between current and target for clipboard
  const lines: string[] = [];

  // Add partial text from current line (from cursor to end)
  const currentText = currentElement.textContent || "";
  lines.push(currentText.slice(currentCursorPosition));

  // Add all lines in between
  for (let i = currentLine + 1; i <= targetLine; i++) {
    const lineText = vim_info.lines[i].element.textContent || "";
    lines.push(lineText);
  }

  const clipboardText = lines.join("\n");

  // Copy to clipboard
  navigator.clipboard.writeText(clipboardText).catch((err) => {
    console.error("[Vim-Notion] Failed to copy to clipboard:", err);
  });

  // If we're deleting across multiple lines
  if (currentLine !== targetLine) {
    // Switch to insert mode temporarily
    vim_info.mode = "insert";

    // Delete all blocks from currentLine + 1 to targetLine
    let currentDelay = 10;
    for (let i = currentLine + 1; i <= targetLine; i++) {
      const element = vim_info.lines[currentLine + 1].element;
      deleteNormalBlockWithKeyboardEvents(element, currentDelay);
      currentDelay += 50;
    }

    // Delete partial content from current line (from cursor to end)
    setTimeout(() => {
      const text = currentElement.textContent || "";
      const newText = text.slice(0, currentCursorPosition);
      currentElement.textContent = newText;
      setCursorPosition(currentElement, currentCursorPosition);
      vim_info.desired_column = currentCursorPosition;

      // Return to normal mode
      setTimeout(() => {
        vim_info.mode = "normal";
        refreshLines();
        updateInfoContainer();
      }, 50);
    }, currentDelay + 50);
  } else {
    // Same line - just delete text from cursor to end
    const text = currentElement.textContent || "";
    const newText = text.slice(0, currentCursorPosition);
    currentElement.textContent = newText;
    setCursorPosition(currentElement, currentCursorPosition);
    vim_info.desired_column = currentCursorPosition;
  }
};

/**
 * Shared body of df / dF / dt / dT: find `char` on the current line (code
 * line inside code blocks) and delete [from, to) through the editing pipeline.
 */
const deleteToChar = (
  char: string,
  direction: "forward" | "backward",
  inclusive: boolean,
  updateInfoContainer: () => void,
) => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const text = currentElement.textContent || "";
  const pos = getCursorIndexInElement(currentElement);
  const { start, end } = lineBoundsAt(text, pos);

  let from: number;
  let to: number;
  if (direction === "forward") {
    const found = text.indexOf(char, pos + 1);
    if (found === -1 || found >= end) return;
    from = pos;
    to = inclusive ? found + 1 : found;
  } else {
    const found = text.lastIndexOf(char, pos - 1);
    if (found === -1 || found < start) return;
    from = inclusive ? found : found + 1;
    to = pos;
  }

  navigator.clipboard.writeText(text.slice(from, to)).catch(() => {});
  vim_info.yank_type = "char";
  deleteCharRange(currentElement, from, to);
  setCursorPosition(currentElement, from);
  vim_info.desired_column = from - start;
  updateInfoContainer();
};

/**
 * Delete from cursor to and including the next occurrence of char (f)
 */
export const createDeleteFindCharForward =
  (deps: CharDeleteDeps) => (char: string) =>
    deleteToChar(char, "forward", true, deps.updateInfoContainer);

/**
 * Delete from and including the previous occurrence of char to cursor (F)
 */
export const createDeleteFindCharBackward =
  (deps: CharDeleteDeps) => (char: string) =>
    deleteToChar(char, "backward", true, deps.updateInfoContainer);

/**
 * Delete from cursor till (but not including) the next occurrence of char (t)
 */
export const createDeleteTillCharForward =
  (deps: CharDeleteDeps) => (char: string) =>
    deleteToChar(char, "forward", false, deps.updateInfoContainer);

/**
 * Delete from after the previous occurrence of char to cursor (T)
 */
export const createDeleteTillCharBackward =
  (deps: CharDeleteDeps) => (char: string) =>
    deleteToChar(char, "backward", false, deps.updateInfoContainer);
