/**
 * Core utilities barrel export
 */

export {
  clearAllBackgroundColors,
  deleteNormalBlockWithKeyboardEvents,
  deleteCodeBlockWithKeyboardEvents,
  deleteMultipleLinesAtomically,
  isDocumentEditable,
  documentEditables,
  surfaceOf,
  currentSurface,
  setActiveSurface,
} from "./dom-utils";

export {
  setActiveLine,
  isWrapperLine,
  createRefreshLines,
  createSetLines,
} from "./line-management";
