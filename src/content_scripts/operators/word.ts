/**
 * Word Operators Module
 * Text object operations for words (yank, delete, change)
 */

import { getInnerWordBounds, getAroundWordBounds } from "../text-objects/word";
import {
  getCursorIndexInElement,
  setCursorPosition,
  deleteCharRange,
} from "../cursor";

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
  const deleteInnerWord = (): number => {
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

    deleteCharRange(currentElement, start, end);

    // Normal mode rests ON a character: clamp after deleting the line's tail.
    const restAt = Math.max(
      0,
      Math.min(start, (currentElement.textContent || "").length - 1),
    );
    setCursorPosition(currentElement, restAt);
    vim_info.desired_column = restAt;
    vim_info.pending_operator = null;
    updateInfoContainer();
    return start;
  };

  /**
   * Delete around word
   */
  const deleteAroundWord = (): number => {
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

    deleteCharRange(currentElement, start, end);

    // Normal mode rests ON a character: clamp after deleting the line's tail.
    const restAt = Math.max(
      0,
      Math.min(start, (currentElement.textContent || "").length - 1),
    );
    setCursorPosition(currentElement, restAt);
    vim_info.desired_column = restAt;
    vim_info.pending_operator = null;
    updateInfoContainer();
    return start;
  };

  /**
   * Change inner word (delete and enter insert mode)
   */
  const changeInnerWord = (): void => {
    const start = deleteInnerWord();
    const { vim_info } = window;
    // Insert at the deletion point (the delete clamped the normal-mode caret).
    setCursorPosition(vim_info.lines[vim_info.active_line].element, start);
    vim_info.mode = "insert";
    updateInfoContainer();
  };

  /**
   * Change around word (delete and enter insert mode)
   */
  const changeAroundWord = (): void => {
    const start = deleteAroundWord();
    const { vim_info } = window;
    // Insert at the deletion point (the delete clamped the normal-mode caret).
    setCursorPosition(vim_info.lines[vim_info.active_line].element, start);
    vim_info.mode = "insert";
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
