// Background script for Vimtion extension
// Handles version updates and notifications

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    // First time installation
    const version = chrome.runtime.getManifest().version;
    chrome.storage.local.set({
      vimtion_version: version,
      vimtion_show_vimium_warning: true, // Show Vimium warning on first install
    });
  } else if (details.reason === "update") {
    // Extension was updated
    const oldVersion = details.previousVersion;
    const newVersion = chrome.runtime.getManifest().version;

    chrome.storage.local.set({
      vimtion_show_update_notification: true,
      vimtion_version: newVersion,
      vimtion_previous_version: oldVersion,
    });

    // The default theme colors changed from blue (#667eea) to red (#ff4458).
    // Pin existing installs to the old blue default so only fresh installs get
    // the new color. Only fills in colors the user never explicitly set, so
    // anyone who already customized keeps their own choice.
    const LEGACY_DEFAULT_COLOR = "#667eea";
    const colorKeys = ["statusBarColor", "cursorColor", "visualHighlightColor"];
    chrome.storage.sync.get(colorKeys, (stored) => {
      const patch: Record<string, string> = {};
      colorKeys.forEach((key) => {
        if (stored[key] === undefined) {
          patch[key] = LEGACY_DEFAULT_COLOR;
        }
      });
      if (Object.keys(patch).length > 0) {
        chrome.storage.sync.set(patch);
      }
    });
  }
});
