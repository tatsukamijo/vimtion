/**
 * Link Hint Mode Reducer
 *
 * Handles keyboard events in link-hint mode.
 * Link hints provide Vimium-style link navigation by displaying overlays
 * with unique letter combinations on all clickable links.
 */

import { removeAllHintOverlays, filterHintsByInput } from "../links";

export interface LinkHintReducerDeps {
  updateInfoContainer: () => void;
}

/**
 * Creates the link hint mode reducer function.
 *
 * @param deps - Dependencies for the reducer
 * @returns Reducer function that handles link-hint mode keyboard events
 */
export const createLinkHintReducer = (deps: LinkHintReducerDeps) => {
  const { updateInfoContainer } = deps;

  return (e: KeyboardEvent): boolean => {
    const { vim_info } = window;

    switch (e.key) {
      case "Escape":
        // Exit link-hint mode and return to normal mode
        removeAllHintOverlays();
        vim_info.mode = "normal";
        updateInfoContainer();
        return true;

      default:
        // Handle character input for filtering hints
        const key = e.key.toLowerCase();
        if (key.length === 1 && /[a-z]/.test(key)) {
          vim_info.link_hint_input += key;
          filterHintsByInput(
            vim_info.link_hint_input,
            e.shiftKey,
            updateInfoContainer,
          );
          return true;
        }
        return false;
    }
  };
};
