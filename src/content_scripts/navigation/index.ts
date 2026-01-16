/**
 * Navigation module - cursor movement and scrolling
 */

export {
  moveCursorBackwards,
  moveCursorForwards,
  jumpToLineStart,
  jumpToLineEnd,
} from "./basic";

export {
  jumpToNextWord,
  jumpToPreviousWord,
  jumpToEndOfWord,
  jumpToEndOfWORD,
  jumpToNextWORD,
  jumpToPreviousWORD,
} from "./word";

export {
  jumpToPreviousParagraph,
  jumpToNextParagraph,
} from "./paragraph";

export {
  moveCursorDownInCodeBlock,
  moveCursorUpInCodeBlock,
  moveCursorBackwardsInCodeBlock,
  moveCursorForwardsInCodeBlock,
  openLineBelowInCodeBlock,
  openLineAboveInCodeBlock,
} from "./code-block";

export {
  findScrollableContainer,
  scrollAndMoveCursor,
  createJumpToTop,
  createJumpToBottom,
} from "./scroll";
