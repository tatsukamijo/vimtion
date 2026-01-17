/**
 * Motion delete operators
 * Handles deleting text based on motion commands
 */

import { getCursorIndexInElement, setCursorPosition } from "../cursor";
import { isParagraphBoundary, isInsideCodeBlock } from "../notion";
import {
  deleteNormalBlockWithKeyboardEvents,
  deleteMultipleLinesAtomically,
} from "../core/dom-utils";
import { setActiveLine } from "../core/line-management";

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
    // Include the newline character in deletion (if it exists)
    if (lineEnd !== -1) {
      lineEnd = lineEnd + 1; // Include the \n
    } else {
      // Last line - check if there's a newline before this line
      if (lineStart > 0) {
        // Delete the newline before this line instead
        lineStart = lineStart - 1;
      }
      lineEnd = text.length;
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
          // Position cursor at the start of the line (or end of previous line if we deleted content)
          const newCursorPos = lineStart;
          setCursorPosition(currentElement, newCursorPos);
          updateInfoContainer();
        }, 10);
      }, 10);
    }
  } else {
    const lineText = currentElement.textContent || "";
    navigator.clipboard.writeText(lineText).catch((err) => {
      console.error("[Vim-Notion] Failed to copy to clipboard:", err);
    });

    vim_info.mode = "insert";
    vim_info.undo_count = 1;

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
    });
  }
};

/**
 * Delete from cursor to next word boundary
 */
export const createDeleteToNextWord = () => () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  let pos = currentCursorPosition;

  // Skip current word
  while (pos < text.length && /\w/.test(text[pos])) {
    pos++;
  }

  // Skip non-word characters
  while (pos < text.length && !/\w/.test(text[pos])) {
    pos++;
  }

  // Select from cursor to pos
  setCursorPosition(currentElement, currentCursorPosition);
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    r.setStart(r.startContainer, r.startOffset);
    r.setEnd(r.startContainer, r.startOffset + (pos - currentCursorPosition));
    sel.removeAllRanges();
    sel.addRange(r);

    document.execCommand("cut");
  }

  vim_info.desired_column = currentCursorPosition;
};

/**
 * Delete from cursor to end of line
 */
export const createDeleteToEndOfLine = () => () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const newText = text.slice(0, currentCursorPosition);
  currentElement.textContent = newText;

  setCursorPosition(currentElement, currentCursorPosition);
  vim_info.desired_column = currentCursorPosition;
};

/**
 * Delete from beginning of line to cursor
 */
export const createDeleteToBeginningOfLine = () => () => {
  const { vim_info } = window;
  const currentElement = vim_info.lines[vim_info.active_line].element;
  const currentCursorPosition = getCursorIndexInElement(currentElement);
  const text = currentElement.textContent || "";

  const newText = text.slice(currentCursorPosition);
  currentElement.textContent = newText;

  setCursorPosition(currentElement, 0);
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
 * Delete from cursor to and including the next occurrence of char (f)
 */
export const createDeleteFindCharForward =
  (deps: CharDeleteDeps) => (char: string) => {
    const { updateInfoContainer } = deps;
    const { vim_info } = window;
    const currentElement = vim_info.lines[vim_info.active_line].element;
    const text = currentElement.textContent || "";
    const currentPos = getCursorIndexInElement(currentElement);

    const foundIndex = text.indexOf(char, currentPos + 1);
    if (foundIndex !== -1) {
      // Delete from current position to and including the found character
      const newText = text.slice(0, currentPos) + text.slice(foundIndex + 1);
      currentElement.textContent = newText;
      setCursorPosition(currentElement, currentPos);
      vim_info.desired_column = currentPos;
      updateInfoContainer();
    }
  };

/**
 * Delete from and including the previous occurrence of char to cursor (F)
 */
export const createDeleteFindCharBackward =
  (deps: CharDeleteDeps) => (char: string) => {
    const { updateInfoContainer } = deps;
    const { vim_info } = window;
    const currentElement = vim_info.lines[vim_info.active_line].element;
    const text = currentElement.textContent || "";
    const currentPos = getCursorIndexInElement(currentElement);

    const foundIndex = text.lastIndexOf(char, currentPos - 1);
    if (foundIndex !== -1) {
      // Delete from and including the found character to current position
      const newText = text.slice(0, foundIndex) + text.slice(currentPos);
      currentElement.textContent = newText;
      setCursorPosition(currentElement, foundIndex);
      vim_info.desired_column = foundIndex;
      updateInfoContainer();
    }
  };

/**
 * Delete from cursor till (but not including) the next occurrence of char (t)
 */
export const createDeleteTillCharForward =
  (deps: CharDeleteDeps) => (char: string) => {
    const { updateInfoContainer } = deps;
    const { vim_info } = window;
    const currentElement = vim_info.lines[vim_info.active_line].element;
    const text = currentElement.textContent || "";
    const currentPos = getCursorIndexInElement(currentElement);

    const foundIndex = text.indexOf(char, currentPos + 1);
    if (foundIndex !== -1) {
      // Delete from current position till (not including) the found character
      const newText = text.slice(0, currentPos) + text.slice(foundIndex);
      currentElement.textContent = newText;
      setCursorPosition(currentElement, currentPos);
      vim_info.desired_column = currentPos;
      updateInfoContainer();
    }
  };

/**
 * Delete from after the previous occurrence of char to cursor (T)
 */
export const createDeleteTillCharBackward =
  (deps: CharDeleteDeps) => (char: string) => {
    const { updateInfoContainer } = deps;
    const { vim_info } = window;
    const currentElement = vim_info.lines[vim_info.active_line].element;
    const text = currentElement.textContent || "";
    const currentPos = getCursorIndexInElement(currentElement);

    const foundIndex = text.lastIndexOf(char, currentPos - 1);
    if (foundIndex !== -1) {
      // Delete from after the found character to current position
      const newText = text.slice(0, foundIndex + 1) + text.slice(currentPos);
      currentElement.textContent = newText;
      setCursorPosition(currentElement, foundIndex + 1);
      vim_info.desired_column = foundIndex + 1;
      updateInfoContainer();
    }
  };
