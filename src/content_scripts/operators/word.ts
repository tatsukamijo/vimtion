/**
 * Word Operators Module
 * Text object operations for words (yank, delete, change)
 */

import { getInnerWordBounds, getAroundWordBounds } from "../text-objects/word";
import { getCursorIndexInElement, setCursorPosition } from "../cursor";

/**
 * Dependencies injected from vim.ts
 */
export type OperatorDeps = {
  updateInfoContainer: () => void;
};

/**
 * Create word operator functions with injected dependencies
 */
export const createWordOperators = (deps: OperatorDeps) => {
  const { updateInfoContainer } = deps;

  /**
   * Yank inner word (excludes surrounding whitespace)
   */
  const yankInnerWord = async (): Promise<void> => {
    const { vim_info } = window;
    const currentElement = vim_info.lines[vim_info.active_line].element;
    const currentCursorPosition = getCursorIndexInElement(currentElement);
    const text = currentElement.textContent || "";

    const [start, end] = getInnerWordBounds(text, currentCursorPosition);
    const yankedText = text.slice(start, end);

    try {
      await navigator.clipboard.writeText(yankedText);
    } catch (err) {
      console.error("[Vim-Notion] Failed to yank:", err);
    }
    vim_info.pending_operator = null;
    updateInfoContainer();
  };

  /**
   * Yank around word (includes surrounding whitespace)
   */
  const yankAroundWord = async (): Promise<void> => {
    const { vim_info } = window;
    const currentElement = vim_info.lines[vim_info.active_line].element;
    const currentCursorPosition = getCursorIndexInElement(currentElement);
    const text = currentElement.textContent || "";

    const [start, end] = getAroundWordBounds(text, currentCursorPosition);
    const yankedText = text.slice(start, end);

    try {
      await navigator.clipboard.writeText(yankedText);
    } catch (err) {
      console.error("[Vim-Notion] Failed to yank:", err);
    }
    vim_info.pending_operator = null;
    updateInfoContainer();
  };

  /**
   * Delete inner word
   */
  const deleteInnerWord = (): void => {
    const { vim_info } = window;
    const currentElement = vim_info.lines[vim_info.active_line].element;
    const currentCursorPosition = getCursorIndexInElement(currentElement);
    const text = currentElement.textContent || "";

    const [start, end] = getInnerWordBounds(text, currentCursorPosition);
    const deletedText = text.slice(start, end);

    // Copy to clipboard (Vim's delete yanks)
    navigator.clipboard.writeText(deletedText).catch((err) => {
      console.error("[Vim-Notion] Failed to copy to clipboard:", err);
    });

    const newText = text.slice(0, start) + text.slice(end);
    currentElement.textContent = newText;

    setCursorPosition(currentElement, start);
    vim_info.desired_column = start;
    vim_info.pending_operator = null;
    updateInfoContainer();
  };

  /**
   * Delete around word
   */
  const deleteAroundWord = (): void => {
    const { vim_info } = window;
    const currentElement = vim_info.lines[vim_info.active_line].element;
    const currentCursorPosition = getCursorIndexInElement(currentElement);
    const text = currentElement.textContent || "";

    const [start, end] = getAroundWordBounds(text, currentCursorPosition);
    const deletedText = text.slice(start, end);

    // Copy to clipboard (Vim's delete yanks)
    navigator.clipboard.writeText(deletedText).catch((err) => {
      console.error("[Vim-Notion] Failed to copy to clipboard:", err);
    });

    const newText = text.slice(0, start) + text.slice(end);
    currentElement.textContent = newText;

    setCursorPosition(currentElement, start);
    vim_info.desired_column = start;
    vim_info.pending_operator = null;
    updateInfoContainer();
  };

  /**
   * Change inner word (delete and enter insert mode)
   */
  const changeInnerWord = (): void => {
    deleteInnerWord();
    window.vim_info.mode = "insert";
    updateInfoContainer();
  };

  /**
   * Change around word (delete and enter insert mode)
   */
  const changeAroundWord = (): void => {
    deleteAroundWord();
    window.vim_info.mode = "insert";
    updateInfoContainer();
  };

  return {
    yankInnerWord,
    yankAroundWord,
    deleteInnerWord,
    deleteAroundWord,
    changeInnerWord,
    changeAroundWord,
  };
};