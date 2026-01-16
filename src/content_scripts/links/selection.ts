/**
 * Link Selection Mode Utilities
 * Handles highlighting and navigation for link selection mode
 */

import {
  availableLinks,
  selectedLinkIndex,
  resetLinkSelection,
} from "../state";
import { currentSettings } from "../state";
import { hexToRgba } from "../settings";

/**
 * Highlight the currently selected link with visual feedback
 */
export function highlightSelectedLink() {
  if (
    availableLinks.length > 0 &&
    selectedLinkIndex >= 0 &&
    selectedLinkIndex < availableLinks.length
  ) {
    const visualHighlight = hexToRgba(
      currentSettings.visualHighlightColor,
      0.3,
    );
    const selectedLink = availableLinks[selectedLinkIndex];
    selectedLink.style.backgroundColor = visualHighlight;

    // Scroll the selected link into view if it's outside the viewport
    selectedLink.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }
}

/**
 * Clear background colors from all links
 */
export function clearAllLinkHighlights() {
  availableLinks.forEach((link) => {
    link.style.backgroundColor = "";
  });
}

/**
 * Exit link selection mode and clean up highlights
 */
export function exitLinkSelectionMode() {
  clearAllLinkHighlights();
  resetLinkSelection();
}
