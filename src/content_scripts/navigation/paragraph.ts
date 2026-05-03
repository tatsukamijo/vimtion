/**
 * Paragraph navigation functions ({ and })
 */

import { setActiveLine } from "../core/line-management";
import { isParagraphBoundary } from "../notion";
import { updateInfoContainer } from "../ui/info-container";

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

  // Pre-stage desired_column to col 0 so setActiveLine clamps the cursor
  // there on the destination block. Routing through setActiveLine instead
  // of mutating active_line directly is what triggers Notion's leaf
  // click/focus bookkeeping and the explicit setCursorPosition; without it,
  // the status bar advanced but the DOM cursor stayed put.
  vim_info.cursor_position = 0;
  vim_info.desired_column = 0;
  setActiveLine(targetLine);
  updateInfoContainer();
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
  while (targetLine < maxLine && !isParagraphBoundary(targetLine + 1)) {
    targetLine++;
  }

  // Now targetLine is at the last line of the next paragraph
  // Move down one more to land on the blank line below it (Vim behavior)
  // But only if there is a blank line below
  if (targetLine < maxLine && isParagraphBoundary(targetLine + 1)) {
    targetLine++;
  }

  const targetElement = vim_info.lines[targetLine].element;

  // Pre-stage desired_column for setActiveLine: col 0 normally, end-of-line
  // when landing on the very last block (matches Vim's }-at-EOF behavior).
  if (targetLine === maxLine) {
    const lineLength = targetElement.textContent?.length || 0;
    vim_info.cursor_position = lineLength;
    vim_info.desired_column = lineLength;
  } else {
    vim_info.cursor_position = 0;
    vim_info.desired_column = 0;
  }
  setActiveLine(targetLine);
  updateInfoContainer();
};
