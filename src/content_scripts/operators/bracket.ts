/**
 * Bracket/Quote Operators Module
 * Text object operations for brackets and quotes (yank, delete, change)
 */

import {
  findMatchingQuotes,
  findMatchingBrackets,
} from "../text-objects/bracket";
import { getCursorIndexInElement, setCursorPosition } from "../cursor";

/**
 * Dependencies injected from vim.ts
 */
export type OperatorDeps = {
  updateInfoContainer: () => void;
};

/**
 * Create bracket/quote operator functions with injected dependencies
 */
export const createBracketOperators = (deps: OperatorDeps) => {
  const { updateInfoContainer } = deps;

  /**
   * Yank inner bracket/quote (excludes delimiters)
   */
  const yankInnerBracket = (openChar: string, closeChar: string): void => {
    const { vim_info } = window;
    const currentElement = vim_info.lines[vim_info.active_line].element;
    const currentCursorPosition = getCursorIndexInElement(currentElement);
    const text = currentElement.textContent || "";

    // Use different function for quotes (where open === close)
    const result =
      openChar === closeChar
        ? findMatchingQuotes(text, currentCursorPosition, openChar)
        : findMatchingBrackets(
            text,
            currentCursorPosition,
            openChar,
            closeChar,
          );

    if (!result) {
      vim_info.pending_operator = null;
      updateInfoContainer();
      return;
    }

    const [openIndex, closeIndex] = result;
    const textToYank = text.slice(openIndex + 1, closeIndex);
    navigator.clipboard.writeText(textToYank);
    vim_info.pending_operator = null;
    updateInfoContainer();
  };

  /**
   * Yank around bracket/quote (includes delimiters)
   */
  const yankAroundBracket = (openChar: string, closeChar: string): void => {
    const { vim_info } = window;
    const currentElement = vim_info.lines[vim_info.active_line].element;
    const currentCursorPosition = getCursorIndexInElement(currentElement);
    const text = currentElement.textContent || "";

    // Use different function for quotes (where open === close)
    const result =
      openChar === closeChar
        ? findMatchingQuotes(text, currentCursorPosition, openChar)
        : findMatchingBrackets(
            text,
            currentCursorPosition,
            openChar,
            closeChar,
          );

    if (!result) {
      vim_info.pending_operator = null;
      updateInfoContainer();
      return;
    }

    const [openIndex, closeIndex] = result;
    const textToYank = text.slice(openIndex, closeIndex + 1);
    navigator.clipboard.writeText(textToYank);
    vim_info.pending_operator = null;
    updateInfoContainer();
  };

  /**
   * Delete inner bracket/quote
   */
  const deleteInnerBracket = (openChar: string, closeChar: string): void => {
    const { vim_info } = window;
    const currentElement = vim_info.lines[vim_info.active_line].element;
    const currentCursorPosition = getCursorIndexInElement(currentElement);
    const text = currentElement.textContent || "";

    // Use different function for quotes (where open === close)
    const result =
      openChar === closeChar
        ? findMatchingQuotes(text, currentCursorPosition, openChar)
        : findMatchingBrackets(
            text,
            currentCursorPosition,
            openChar,
            closeChar,
          );

    if (!result) {
      vim_info.pending_operator = null;
      updateInfoContainer();
      return;
    }

    const [openIndex, closeIndex] = result;
    const deletedText = text.slice(openIndex + 1, closeIndex);

    // Copy to clipboard (Vim's delete yanks)
    navigator.clipboard.writeText(deletedText).catch((err) => {
      console.error("[Vim-Notion] Failed to copy to clipboard:", err);
    });

    const newText = text.slice(0, openIndex + 1) + text.slice(closeIndex);
    currentElement.textContent = newText;

    setCursorPosition(currentElement, openIndex + 1);
    vim_info.desired_column = openIndex + 1;
    vim_info.pending_operator = null;
    updateInfoContainer();
  };

  /**
   * Delete around bracket/quote
   */
  const deleteAroundBracket = (openChar: string, closeChar: string): void => {
    const { vim_info } = window;
    const currentElement = vim_info.lines[vim_info.active_line].element;
    const currentCursorPosition = getCursorIndexInElement(currentElement);
    const text = currentElement.textContent || "";

    // Use different function for quotes (where open === close)
    const result =
      openChar === closeChar
        ? findMatchingQuotes(text, currentCursorPosition, openChar)
        : findMatchingBrackets(
            text,
            currentCursorPosition,
            openChar,
            closeChar,
          );

    if (!result) {
      vim_info.pending_operator = null;
      updateInfoContainer();
      return;
    }

    const [openIndex, closeIndex] = result;
    const deletedText = text.slice(openIndex, closeIndex + 1);

    // Copy to clipboard (Vim's delete yanks)
    navigator.clipboard.writeText(deletedText).catch((err) => {
      console.error("[Vim-Notion] Failed to copy to clipboard:", err);
    });

    const newText = text.slice(0, openIndex) + text.slice(closeIndex + 1);
    currentElement.textContent = newText;

    setCursorPosition(currentElement, openIndex);
    vim_info.desired_column = openIndex;
    vim_info.pending_operator = null;
    updateInfoContainer();
  };

  /**
   * Change inner bracket/quote (delete and enter insert mode)
   */
  const changeInnerBracket = (openChar: string, closeChar: string): void => {
    deleteInnerBracket(openChar, closeChar);
    window.vim_info.mode = "insert";
    updateInfoContainer();
  };

  /**
   * Change around bracket/quote (delete and enter insert mode)
   */
  const changeAroundBracket = (openChar: string, closeChar: string): void => {
    deleteAroundBracket(openChar, closeChar);
    window.vim_info.mode = "insert";
    updateInfoContainer();
  };

  return {
    yankInnerBracket,
    yankAroundBracket,
    deleteInnerBracket,
    deleteAroundBracket,
    changeInnerBracket,
    changeAroundBracket,
  };
};
