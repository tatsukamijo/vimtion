/**
 * Links Module - Barrel Export
 * Combines link selection and link hints functionality
 */

export {
  highlightSelectedLink,
  clearAllLinkHighlights,
  exitLinkSelectionMode,
} from "./selection";

export {
  enterLinkHintMode,
  createHintOverlay,
  removeAllHintOverlays,
  filterHintsByInput,
  navigateToLink,
  detectAllLinks,
  generateHints,
} from "./link-hints";
