/**
 * Paragraph navigation functions ({ and })
 */

import { setCursorPosition } from "../cursor";
import { isParagraphBoundary } from "../notion";

// Jump to the beginning of the previous paragraph
export const jumpToPreviousParagraph = (): void => {
  const { vim_info } = window;
  let targetLine = vim_info.active_line;

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

  // Move to target line
  vim_info.active_line = targetLine;
  vim_info.cursor_position = 0;
  vim_info.desired_column = 0;

  const targetElement = vim_info.lines[targetLine].element;
  setCursorPosition(targetElement, 0);
};

// Jump to the beginning of the next paragraph
export const jumpToNextParagraph = (): void => {
  const { vim_info } = window;
  const maxLine = vim_info.lines.length - 1;
  let targetLine = vim_info.active_line;

  // If we're on a blank line, skip forward through all consecutive blank lines
  while (targetLine < maxLine && isParagraphBoundary(targetLine)) {
    targetLine++;
  }

  // Now skip forward through the next paragraph content
  while (
    targetLine < maxLine &&
    !isParagraphBoundary(targetLine + 1)
  ) {
    targetLine++;
  }

  // Now targetLine is at the last line of the next paragraph
  // Move down one more to land on the blank line below it (Vim behavior)
  // But only if there is a blank line below
  if (targetLine < maxLine && isParagraphBoundary(targetLine + 1)) {
    targetLine++;
  }

  // Move to target line
  vim_info.active_line = targetLine;

  const targetElement = vim_info.lines[targetLine].element;

  // If at the last line, move cursor to end of line (like Vim)
  if (targetLine === maxLine) {
    const lineLength = targetElement.textContent?.length || 0;
    vim_info.cursor_position = lineLength;
    vim_info.desired_column = lineLength;
    setCursorPosition(targetElement, lineLength);
  } else {
    vim_info.cursor_position = 0;
    vim_info.desired_column = 0;
    setCursorPosition(targetElement, 0);
  }
};
