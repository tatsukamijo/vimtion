/**
 * Paragraph Operators Module
 * Text object operations for paragraphs (yank, delete, change)
 */

import { getInnerParagraphBounds, getAroundParagraphBounds } from "./helpers";
import { deleteNormalBlockWithKeyboardEvents } from "../core";

/**
 * Dependencies injected from vim.ts
 */
export type OperatorDeps = {
  updateInfoContainer: () => void;
  refreshLines: () => void;
  setActiveLine: (idx: number) => void;
};

/**
 * Create paragraph operator functions with injected dependencies
 */
export const createParagraphOperators = (deps: OperatorDeps) => {
  const { updateInfoContainer, refreshLines, setActiveLine } = deps;

  /**
   * Yank inner paragraph (excludes blank lines)
   */
  const yankInnerParagraph = async (): Promise<void> => {
    const bounds = getInnerParagraphBounds();
    if (!bounds) {
      const { vim_info } = window;
      vim_info.pending_operator = null;
      updateInfoContainer();
      return;
    }

    const { vim_info } = window;
    const { startLine, endLine } = bounds;
    const lines: string[] = [];

    for (let i = startLine; i <= endLine; i++) {
      lines.push(vim_info.lines[i].element.textContent || "");
    }

    const yankedText = lines.join("\n");

    try {
      await navigator.clipboard.writeText(yankedText);
    } catch (err) {
      console.error("[Vim-Notion] Failed to yank:", err);
    }

    vim_info.pending_operator = null;
    updateInfoContainer();
  };

  /**
   * Yank around paragraph (includes surrounding blank lines)
   */
  const yankAroundParagraph = async (): Promise<void> => {
    const bounds = getAroundParagraphBounds();
    if (!bounds) {
      const { vim_info } = window;
      vim_info.pending_operator = null;
      updateInfoContainer();
      return;
    }

    const { vim_info } = window;
    const { startLine, endLine } = bounds;
    const lines: string[] = [];

    for (let i = startLine; i <= endLine; i++) {
      lines.push(vim_info.lines[i].element.textContent || "");
    }

    const yankedText = lines.join("\n");

    try {
      await navigator.clipboard.writeText(yankedText);
    } catch (err) {
      console.error("[Vim-Notion] Failed to yank:", err);
    }

    vim_info.pending_operator = null;
    updateInfoContainer();
  };

  /**
   * Delete inner paragraph
   */
  const deleteInnerParagraph = (): void => {
    const bounds = getInnerParagraphBounds();
    if (!bounds) {
      const { vim_info } = window;
      vim_info.pending_operator = null;
      updateInfoContainer();
      return;
    }

    const { vim_info } = window;
    const { startLine, endLine } = bounds;

    // Collect text for clipboard
    const lines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      lines.push(vim_info.lines[i].element.textContent || "");
    }
    const clipboardText = lines.join("\n");

    navigator.clipboard.writeText(clipboardText).catch((err) => {
      console.error("[Vim-Notion] Failed to copy to clipboard:", err);
    });

    // Switch to insert mode temporarily
    vim_info.mode = "insert";

    // Delete all blocks
    let currentDelay = 10;
    for (let i = endLine; i >= startLine; i--) {
      const element = vim_info.lines[i].element;
      deleteNormalBlockWithKeyboardEvents(element, currentDelay);
      currentDelay += 50;
    }

    // Return to normal mode after deletion
    setTimeout(() => {
      vim_info.mode = "normal";
      refreshLines();

      const newActiveLine = Math.max(0, Math.min(startLine, vim_info.lines.length - 1));
      if (vim_info.lines.length > 0) {
        setActiveLine(newActiveLine);
      }
      vim_info.pending_operator = null;
      updateInfoContainer();
    }, currentDelay + 100);
  };

  /**
   * Delete around paragraph
   */
  const deleteAroundParagraph = (): void => {
    const bounds = getAroundParagraphBounds();
    if (!bounds) {
      const { vim_info } = window;
      vim_info.pending_operator = null;
      updateInfoContainer();
      return;
    }

    const { vim_info } = window;
    const { startLine, endLine } = bounds;

    // Collect text for clipboard
    const lines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      lines.push(vim_info.lines[i].element.textContent || "");
    }
    const clipboardText = lines.join("\n");

    navigator.clipboard.writeText(clipboardText).catch((err) => {
      console.error("[Vim-Notion] Failed to copy to clipboard:", err);
    });

    // Switch to insert mode temporarily
    vim_info.mode = "insert";

    // Delete all blocks
    let currentDelay = 10;
    for (let i = endLine; i >= startLine; i--) {
      const element = vim_info.lines[i].element;
      deleteNormalBlockWithKeyboardEvents(element, currentDelay);
      currentDelay += 50;
    }

    // Return to normal mode after deletion
    setTimeout(() => {
      vim_info.mode = "normal";
      refreshLines();

      const newActiveLine = Math.max(0, Math.min(startLine, vim_info.lines.length - 1));
      if (vim_info.lines.length > 0) {
        setActiveLine(newActiveLine);
      }
      vim_info.pending_operator = null;
      updateInfoContainer();
    }, currentDelay + 100);
  };

  /**
   * Change inner paragraph
   */
  const changeInnerParagraph = (): void => {
    const bounds = getInnerParagraphBounds();
    if (!bounds) {
      const { vim_info } = window;
      vim_info.pending_operator = null;
      updateInfoContainer();
      return;
    }

    const { vim_info } = window;
    const { startLine, endLine } = bounds;

    // Collect text for clipboard
    const lines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      lines.push(vim_info.lines[i].element.textContent || "");
    }
    const clipboardText = lines.join("\n");

    navigator.clipboard.writeText(clipboardText).catch((err) => {
      console.error("[Vim-Notion] Failed to copy to clipboard:", err);
    });

    // Switch to insert mode
    vim_info.mode = "insert";

    // Delete all blocks including the first one
    let currentDelay = 10;
    for (let i = endLine; i >= startLine; i--) {
      const element = vim_info.lines[i].element;
      deleteNormalBlockWithKeyboardEvents(element, currentDelay);
      currentDelay += 50;
    }

    // After deletion, create a new empty line and enter insert mode
    setTimeout(() => {
      refreshLines();

      // Position cursor at the line where the paragraph was
      const newActiveLine = Math.max(0, Math.min(startLine, vim_info.lines.length - 1));
      if (vim_info.lines.length > 0) {
        const element = vim_info.lines[newActiveLine].element;
        element.focus();
        element.click();
        vim_info.active_line = newActiveLine;
      }

      vim_info.pending_operator = null;
      updateInfoContainer();
    }, currentDelay + 100);
  };

  /**
   * Change around paragraph
   */
  const changeAroundParagraph = (): void => {
    const bounds = getAroundParagraphBounds();
    if (!bounds) {
      const { vim_info } = window;
      vim_info.pending_operator = null;
      updateInfoContainer();
      return;
    }

    const { vim_info } = window;
    const { startLine, endLine } = bounds;

    // Collect text for clipboard
    const lines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      lines.push(vim_info.lines[i].element.textContent || "");
    }
    const clipboardText = lines.join("\n");

    navigator.clipboard.writeText(clipboardText).catch((err) => {
      console.error("[Vim-Notion] Failed to copy to clipboard:", err);
    });

    // Switch to insert mode
    vim_info.mode = "insert";

    // Delete all blocks including the first one
    let currentDelay = 10;
    for (let i = endLine; i >= startLine; i--) {
      const element = vim_info.lines[i].element;
      deleteNormalBlockWithKeyboardEvents(element, currentDelay);
      currentDelay += 50;
    }

    // After deletion, create a new empty line and enter insert mode
    setTimeout(() => {
      refreshLines();

      // Position cursor at the line where the paragraph was
      const newActiveLine = Math.max(0, Math.min(startLine, vim_info.lines.length - 1));
      if (vim_info.lines.length > 0) {
        const element = vim_info.lines[newActiveLine].element;
        element.focus();
        element.click();
        vim_info.active_line = newActiveLine;
      }

      vim_info.pending_operator = null;
      updateInfoContainer();
    }, currentDelay + 100);
  };

  return {
    yankInnerParagraph,
    yankAroundParagraph,
    deleteInnerParagraph,
    deleteAroundParagraph,
    changeInnerParagraph,
    changeAroundParagraph,
  };
};
