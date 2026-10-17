/**
 * / and ? search, n / N repeat, * and # (word under the cursor).
 *
 * A small command line opens at the bottom of the page; Enter searches, Esc
 * cancels. Matching is a plain substring with Vim's smartcase (all lower case
 * = ignore case), across all lines, wrapping around the page.
 *
 * Like Vim's hlsearch + incsearch, every match is highlighted (the one under
 * the cursor more strongly) while typing and after the search, and the status
 * bar shows the match number, e.g. "/foo [2/5]". Esc in normal mode clears it.
 * Highlights use the CSS Custom Highlight API, so Notion's DOM is never
 * touched.
 */

import {
  getCursorIndexInElement,
  setCursorPosition,
  columnInLine,
  resolveTextPosition,
} from "../cursor";
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

/** Highlight names, styled by ::highlight() rules in vim.css. */
const HL_ALL = "vimtion-search";
const HL_CURRENT = "vimtion-search-current";
/** Ranges painted at most; the count still covers every match. */
const MAX_PAINTED = 1000;

type Match = { line: number; start: number; end: number };

/** The pattern currently highlighted ("" = highlighting off). */
let hlPattern = "";
let hlDirection: Direction = "forward";
let hlStatus = "";
/** While the / ? bar is open its live preview owns the highlights. */
let barOpen = false;

const highlightsSupported = () =>
  typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";
// The bundled DOM typings predate the registry's Map methods.
const registry = () => (CSS as any).highlights as Map<string, Highlight>;

const matchIndex = (haystack: string, needle: string, from: number, dir: Direction) => {
  const ignoreCase = needle === needle.toLowerCase();
  const h = ignoreCase ? haystack.toLowerCase() : haystack;
  const n = ignoreCase ? needle.toLowerCase() : needle;
  if (dir === "forward") return from > h.length ? -1 : h.indexOf(n, from);
  return from < 0 ? -1 : h.lastIndexOf(n, from);
};

const findAll = (pattern: string): Match[] => {
  const { lines } = window.vim_info;
  const matches: Match[] = [];
  if (!pattern) return matches;
  for (let line = 0; line < lines.length; line++) {
    if (isWrapperLine(line)) continue;
    const text = lines[line].element.textContent || "";
    let at = matchIndex(text, pattern, 0, "forward");
    while (at !== -1) {
      matches.push({ line, start: at, end: at + pattern.length });
      at = matchIndex(text, pattern, at + pattern.length, "forward");
    }
  }
  return matches;
};

const toRange = (m: Match): Range | null => {
  const el = window.vim_info.lines[m.line]?.element;
  if (!el) return null;
  // A match can straddle a formatting or syntax-token boundary: the start
  // must sit in the node holding the first character, the end after the last.
  const a = resolveTextPosition(el, m.start, true);
  const b = resolveTextPosition(el, m.end);
  if (!a || !b) return null;
  const range = document.createRange();
  try {
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
  } catch {
    return null;
  }
  return range;
};

const clearPaint = () => {
  if (!highlightsSupported()) return;
  registry().delete(HL_ALL);
  registry().delete(HL_CURRENT);
};

/**
 * Paint every match of `pattern` and mark `current` (index into the matches,
 * -1 = none). Returns the "[n/total]" text.
 */
const paint = (pattern: string, matches: Match[], current: number): string => {
  clearPaint();
  if (!pattern) return "";
  if (highlightsSupported() && matches.length > 0) {
    // Paint the matches nearest the current one first when there are too many.
    const center = Math.max(0, current);
    const from = Math.max(0, Math.min(center - MAX_PAINTED / 2, matches.length - MAX_PAINTED));
    const ranges = matches
      .slice(from, from + MAX_PAINTED)
      .map(toRange)
      .filter((r): r is Range => r !== null);
    registry().set(HL_ALL, new Highlight(...ranges));
    const cur = current >= 0 ? toRange(matches[current]) : null;
    if (cur) {
      const h = new Highlight(cur);
      h.priority = 1;
      registry().set(HL_CURRENT, h);
    }
  }
  if (matches.length === 0) return "[0/0]";
  return current >= 0 ? `[${current + 1}/${matches.length}]` : `[-/${matches.length}]`;
};

/** Index of the match at the cursor (or -1). */
const matchAtCursor = (matches: Match[]): number => {
  const { vim_info } = window;
  const el = vim_info.lines[vim_info.active_line]?.element;
  if (!el) return -1;
  const pos = getCursorIndexInElement(el);
  return matches.findIndex((m) => m.line === vim_info.active_line && m.start <= pos && pos < m.end);
};

/**
 * Re-highlight the last search for the current text and cursor (called on
 * every status bar update, so edits and moves keep it right).
 */
export const refreshSearchHighlights = () => {
  if (!hlPattern || barOpen) return;
  const matches = findAll(hlPattern);
  hlStatus = paint(hlPattern, matches, matchAtCursor(matches));
};

/** Turn search highlighting off (Vim's :nohlsearch). */
export const clearSearchHighlights = () => {
  if (!hlPattern) return;
  hlPattern = "";
  hlStatus = "";
  clearPaint();
};

/** Status bar text for the highlighted search, e.g. "/foo [2/5]" ("" = none). */
export const searchStatusText = () => {
  if (!hlPattern) return "";
  const shown = hlPattern.length > 20 ? `${hlPattern.slice(0, 19)}…` : hlPattern;
  return `${hlDirection === "forward" ? "/" : "?"}${shown} ${hlStatus}`;
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
    hlPattern = pattern;
    hlDirection = dir;
    updateInfoContainer();
    if (wrapped) flash(dir === "forward" ? "search hit BOTTOM, continuing at TOP" : "search hit TOP, continuing at BOTTOM");
    return true;
  }
  clearSearchHighlights();
  updateInfoContainer();
  flash(`Pattern not found: ${pattern}`);
  return false;
};

/** The match `dir` from (line, pos), wrapping around (or -1). */
const nextMatchFrom = (matches: Match[], line: number, pos: number, dir: Direction) => {
  if (matches.length === 0) return -1;
  if (dir === "forward") {
    const i = matches.findIndex((m) => m.line > line || (m.line === line && m.start > pos));
    return i === -1 ? 0 : i;
  }
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    if (m.line < line || (m.line === line && m.start < pos)) return i;
  }
  return matches.length - 1;
};

const isOffscreen = (rect: DOMRect) => rect.bottom < 0 || rect.top > window.innerHeight;

/** Open the / or ? command line. */
export const openSearch = (dir: Direction, updateInfoContainer: () => void) => {
  const { vim_info } = window;
  if (document.querySelector(`.${SEARCH_BAR_CLASS} input`)) return;
  const originLine = vim_info.active_line;
  const origin = vim_info.lines[originLine]?.element;
  const originPos = origin ? getCursorIndexInElement(origin) : 0;

  const bar = document.createElement("div");
  bar.className = SEARCH_BAR_CLASS;
  const prompt = document.createElement("span");
  prompt.textContent = dir === "forward" ? "/" : "?";
  const input = document.createElement("input");
  input.type = "text";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Search");
  const count = document.createElement("span");
  count.className = "vim-search-count";
  bar.append(prompt, input, count);
  document.body.appendChild(bar);
  barOpen = true;
  input.focus();

  // Show the previous search's highlights again (or none) after the bar
  // closes without searching.
  const restoreHighlights = () => {
    barOpen = false;
    if (!hlPattern) clearPaint();
    updateInfoContainer();
  };

  // incsearch: highlight every match while typing and bring the one Enter
  // would jump to into view, without moving the cursor.
  input.addEventListener("input", () => {
    const pattern = input.value;
    if (!pattern) {
      // Back to the previous search's highlights while the bar stays open.
      count.textContent = "";
      bar.classList.remove("vim-search-bar--miss");
      const previous = findAll(hlPattern);
      paint(hlPattern, previous, matchAtCursor(previous));
      return;
    }
    const matches = findAll(pattern);
    const current = nextMatchFrom(matches, originLine, originPos, dir);
    count.textContent = paint(pattern, matches, current);
    bar.classList.toggle("vim-search-bar--miss", matches.length === 0);
    const range = current >= 0 ? toRange(matches[current]) : null;
    if (range && isOffscreen(range.getBoundingClientRect())) {
      const el = vim_info.lines[matches[current].line].element as HTMLElement;
      el.scrollIntoView({ block: "center" });
    }
  });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    barOpen = false;
    bar.remove();
    if (origin && origin.isConnected) {
      (origin as HTMLElement).focus({ preventScroll: true });
      setCursorPosition(origin, originPos);
      if (isOffscreen(origin.getBoundingClientRect())) {
        (origin as HTMLElement).scrollIntoView({ block: "center" });
      }
    }
  };

  input.addEventListener("keydown", (e) => {
    // Keep keys typed here away from Notion and Vimtion's page handling.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      restoreHighlights();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pattern = input.value || lastPattern;
      close();
      if (!pattern) {
        restoreHighlights();
        return;
      }
      lastPattern = pattern;
      lastDirection = dir;
      jump(pattern, dir, updateInfoContainer);
    }
  });
  input.addEventListener("blur", () =>
    setTimeout(() => {
      if (closed) return;
      closed = true;
      bar.remove();
      restoreHighlights();
    }, 0),
  );
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
