/**
 * Notion integration module - exports all Notion-specific functions
 */

export {
  isInsideCodeBlock,
  getCodeBlockLines,
  getBlockType,
  isParagraphBoundary,
} from "./dom";

export {
  disableNotionUnsavedWarning,
  restoreNotionUnsavedWarning,
  setupBeforeUnloadHandler,
} from "./warnings";
