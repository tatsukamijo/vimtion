/**
 * Core utilities barrel export
 */

export {
  clearAllBackgroundColors,
  deleteNormalBlockWithKeyboardEvents,
  deleteCodeBlockWithKeyboardEvents,
  deleteMultipleLinesAtomically,
} from "./dom-utils";

export {
  setActiveLine,
  isWrapperLine,
  createRefreshLines,
  createSetLines,
} from "./line-management";
