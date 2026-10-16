/**
 * Cursor module - position tracking, block cursor rendering, and navigation history
 */

export {
  getCursorIndex,
  getCursorIndexInElement,
  setCursorPosition,
  resolveTextPosition,
  selectCharRange,
  deleteCharRange,
  lineBoundsAt,
  columnInLine,
  cutCharRange,
  markNavigation,
  clearNavigationGuard,
  msSinceNavigation,
  isStrayCaret,
  reassertNavigation,
} from "./position";

export { createBlockCursor, updateBlockCursor } from "./block-cursor";

export { saveCursorPosition, restoreCursorPosition } from "./navigation-stack";
