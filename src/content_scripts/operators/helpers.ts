/**
 * Shared helper functions for operators
 */

import { isParagraphBoundary } from "../notion";

/**
 * Get bounds for inner paragraph text object (excludes blank lines)
 * Used by: yip, dip, cip operators
 */
export const getInnerParagraphBounds = (): {
  startLine: number;
  endLine: number;
} | null => {
  const { vim_info } = window;
  const currentLine = vim_info.active_line;
  const maxLine = vim_info.lines.length - 1;

  // If we're on a blank line, inner paragraph is empty
  if (isParagraphBoundary(currentLine)) {
    return null;
  }

  // Find the start of the paragraph (first non-blank line after blank)
  let startLine = currentLine;
  while (startLine > 0 && !isParagraphBoundary(startLine - 1)) {
    startLine--;
  }

  // Find the end of the paragraph (last non-blank line before blank)
  let endLine = currentLine;
  while (endLine < maxLine && !isParagraphBoundary(endLine + 1)) {
    endLine++;
  }

  return { startLine, endLine };
};

/**
 * Get bounds for around paragraph text object (includes surrounding blank lines)
 * Used by: yap, dap, cap operators
 */
export const getAroundParagraphBounds = (): {
  startLine: number;
  endLine: number;
} | null => {
  const { vim_info } = window;
  const currentLine = vim_info.active_line;
  const maxLine = vim_info.lines.length - 1;

  // If we're on a blank line, select it and adjacent blank lines
  if (isParagraphBoundary(currentLine)) {
    let startLine = currentLine;
    let endLine = currentLine;

    // Extend to include adjacent blank lines
    while (startLine > 0 && isParagraphBoundary(startLine - 1)) {
      startLine--;
    }
    while (endLine < maxLine && isParagraphBoundary(endLine + 1)) {
      endLine++;
    }

    return { startLine, endLine };
  }

  // Find the content bounds first
  let startLine = currentLine;
  while (startLine > 0 && !isParagraphBoundary(startLine - 1)) {
    startLine--;
  }

  let endLine = currentLine;
  while (endLine < maxLine && !isParagraphBoundary(endLine + 1)) {
    endLine++;
  }

  // Include trailing blank lines if present
  if (endLine < maxLine && isParagraphBoundary(endLine + 1)) {
    endLine++;
    // Include all consecutive blank lines
    while (endLine < maxLine && isParagraphBoundary(endLine + 1)) {
      endLine++;
    }
  } else if (startLine > 0 && isParagraphBoundary(startLine - 1)) {
    // No trailing blanks, so include leading blank lines instead
    startLine--;
    while (startLine > 0 && isParagraphBoundary(startLine - 1)) {
      startLine--;
    }
  }

  return { startLine, endLine };
};
