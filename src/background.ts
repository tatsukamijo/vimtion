// Background script for Vimtion extension
// Handles version updates and notifications

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // First time installation
    const version = chrome.runtime.getManifest().version;
    chrome.storage.local.set({
      vimtion_version: version,
      vimtion_show_vimium_warning: true  // Show Vimium warning on first install
    });
  } else if (details.reason === 'update') {
    // Extension was updated
    const oldVersion = details.previousVersion;
    const newVersion = chrome.runtime.getManifest().version;

    chrome.storage.local.set({
      vimtion_show_update_notification: true,
      vimtion_version: newVersion,
      vimtion_previous_version: oldVersion
    });
  }
});
