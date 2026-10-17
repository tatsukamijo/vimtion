/**
 * / and ? search, n / N repeat, * and # (word under the cursor).
 *
 * A small command line opens at the bottom of the page; Enter searches, Esc
 * cancels. Matching is a plain substring with Vim's smartcase (all lower case
 * = ignore case), across all lines, wrapping around the page.
 */

import { getCursorIndexInElement, setCursorPosition, columnInLine } from "../cursor";
import { setActiveLine, isWrapperLine } from "../core/line-management";
import { WORD_CHAR } from "../text/word-char";

type Direction = "forward" | "backward";

let lastPattern = "";
let lastDirection: Direction = "forward";

export const SEARCH_BAR_CLASS = "vim-search-bar";

const flash = (message: string) => {
  const bar = document.createElement("div");
  bar.className = SEARCH_BAR_CLASS;
  bar.textContent = message;
  document.body.appendChild(bar);
  setTimeout(() => bar.remove(), 1500);
};

const matchIndex = (haystack: string, needle: string, from: number, dir: Direction) => {
  const ignoreCase = needle === needle.toLowerCase();
  const h = ignoreCase ? haystack.toLowerCase() : haystack;
  const n = ignoreCase ? needle.toLowerCase() : needle;
  if (dir === "forward") return from > h.length ? -1 : h.indexOf(n, from);
  return from < 0 ? -1 : h.lastIndexOf(n, from);
};

/** Jump to the next match of `pattern` in `dir` from the cursor. */
const jump = (pattern: string, dir: Direction, updateInfoContainer: () => void): boolean => {
  const { vim_info } = window;
  const { lines } = vim_info;
  if (!pattern || lines.length === 0) return false;
  const startLine = vim_info.active_line;
  const startEl = lines[startLine]?.element;
  const pos = startEl ? getCursorIndexInElement(startEl) : 0;

  for (let step = 0; step <= lines.length; step++) {
    const idx =
      dir === "forward"
        ? (startLine + step) % lines.length
        : (startLine - step + lines.length) % lines.length;
    if (isWrapperLine(idx)) continue;
    const el = lines[idx].element;
    const text = el.textContent || "";
    let from: number;
    if (step === 0) from = dir === "forward" ? pos + 1 : pos - 1;
    else if (step === lines.length) from = dir === "forward" ? 0 : text.length; // wrapped back
    else from = dir === "forward" ? 0 : text.length;
    const at = matchIndex(text, pattern, from, dir);
    if (at === -1) continue;
    if (step === lines.length && (dir === "forward" ? at > pos : at < pos)) continue;
    const wrapped =
      dir === "forward" ? idx < startLine || (idx === startLine && step > 0) : idx > startLine || (idx === startLine && step > 0);
    if (idx !== startLine) setActiveLine(idx);
    setCursorPosition(el, at);
    vim_info.desired_column = columnInLine(el, at);
    updateInfoContainer();
    if (wrapped) flash(dir === "forward" ? "search hit BOTTOM, continuing at TOP" : "search hit TOP, continuing at BOTTOM");
    return true;
  }
  flash(`Pattern not found: ${pattern}`);
  return false;
};

/** Open the / or ? command line. */
export const openSearch = (dir: Direction, updateInfoContainer: () => void) => {
  const { vim_info } = window;
  if (document.querySelector(`.${SEARCH_BAR_CLASS} input`)) return;
  const origin = vim_info.lines[vim_info.active_line]?.element;
  const originPos = origin ? getCursorIndexInElement(origin) : 0;

  const bar = document.createElement("div");
  bar.className = SEARCH_BAR_CLASS;
  const prompt = document.createElement("span");
  prompt.textContent = dir === "forward" ? "/" : "?";
  const input = document.createElement("input");
  input.type = "text";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Search");
  bar.append(prompt, input);
  document.body.appendChild(bar);
  input.focus();

  const close = () => {
    bar.remove();
    if (origin && origin.isConnected) {
      (origin as HTMLElement).focus({ preventScroll: true });
      setCursorPosition(origin, originPos);
    }
  };

  input.addEventListener("keydown", (e) => {
    // Keep keys typed here away from Notion and Vimtion's page handling.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pattern = input.value || lastPattern;
      close();
      if (!pattern) return;
      lastPattern = pattern;
      lastDirection = dir;
      jump(pattern, dir, updateInfoContainer);
    }
  });
  input.addEventListener("blur", () => setTimeout(() => bar.isConnected && bar.remove(), 0));
};

/** n (same direction) / N (opposite). */
export const repeatSearch = (reverse: boolean, updateInfoContainer: () => void) => {
  if (!lastPattern) {
    flash("No previous search");
    return;
  }
  const dir: Direction = reverse ? (lastDirection === "forward" ? "backward" : "forward") : lastDirection;
  jump(lastPattern, dir, updateInfoContainer);
};

/** * (forward) / # (backward): search for the word under the cursor. */
export const searchWordUnderCursor = (dir: Direction, updateInfoContainer: () => void) => {
  const { vim_info } = window;
  const el = vim_info.lines[vim_info.active_line]?.element;
  if (!el) return;
  const text = el.textContent || "";
  const pos = getCursorIndexInElement(el);
  let start = pos;
  let end = pos;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
  while (end < text.length && WORD_CHAR.test(text[end])) end++;
  const word = text.slice(start, end);
  if (!word) return;
  lastPattern = word;
  lastDirection = dir;
  jump(word, dir, updateInfoContainer);
};
