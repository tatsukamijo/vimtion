/**
 * Notion beforeunload warning management
 */

import {
  setSuppressBeforeUnloadWarning,
  getSuppressBeforeUnloadWarning,
} from "../state";

export const disableNotionUnsavedWarning = () => {
  setSuppressBeforeUnloadWarning(true);
};

export const restoreNotionUnsavedWarning = () => {
  setSuppressBeforeUnloadWarning(false);
};

// Intercept beforeunload events to prevent Notion's warning during Vimtion operations
export function setupBeforeUnloadHandler() {
  window.addEventListener(
    "beforeunload",
    (e) => {
      if (getSuppressBeforeUnloadWarning()) {
        // Prevent the warning dialog
        e.preventDefault();
        e.stopImmediatePropagation();
        delete e.returnValue;

        // Immediately reset flag to allow warnings for actual reloads
        setSuppressBeforeUnloadWarning(false);

        return undefined;
      }
    },
    true,
  ); // Use capture phase to intercept before Notion's handler
}
