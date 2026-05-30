/**
 * Navigation module - cursor movement and scrolling
 */

export {
  moveCursorBackwards,
  moveCursorForwards,
  jumpToLineStart,
  jumpToLineEnd,
  jumpToFirstNonBlank,
} from "./basic";

export {
  jumpToNextWord,
  jumpToPreviousWord,
  jumpToEndOfWord,
  jumpToEndOfWORD,
  jumpToNextWORD,
  jumpToPreviousWORD,
} from "./word";

export { jumpToPreviousParagraph, jumpToNextParagraph } from "./paragraph";

export {
  moveCursorDownInCodeBlock,
  moveCursorUpInCodeBlock,
  moveCursorBackwardsInCodeBlock,
  moveCursorForwardsInCodeBlock,
  openLineBelowInCodeBlock,
  openLineAboveInCodeBlock,
  deleteCharacterInCodeBlock,
} from "./code-block";

export {
  findScrollableContainer,
  scrollAndMoveCursor,
  scrollActiveLineTo,
  createJumpToTop,
  createJumpToBottom,
} from "./scroll";

export {
  findCharForward,
  findCharBackward,
  tillCharForward,
  tillCharBackward,
} from "./char-find";
