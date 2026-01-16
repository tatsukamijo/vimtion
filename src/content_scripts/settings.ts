/**
 * Settings management for Vimtion
 */

import { VimtionSettings, DEFAULT_SETTINGS } from "./types";
import { updateCurrentSettings, currentSettings } from "./state";

// Helper function to adjust color brightness
export function adjustColor(color: string, amount: number): string {
  const hex = color.replace("#", "");
  const r = Math.max(
    0,
    Math.min(255, parseInt(hex.substring(0, 2), 16) + amount),
  );
  const g = Math.max(
    0,
    Math.min(255, parseInt(hex.substring(2, 4), 16) + amount),
  );
  const b = Math.max(
    0,
    Math.min(255, parseInt(hex.substring(4, 6), 16) + amount),
  );
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// Helper to convert hex to rgba
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Apply settings to the page
export function applySettings() {
  // Apply status bar visibility and position
  const infoContainer = document.querySelector(
    ".vim-info-container",
  ) as HTMLElement;

  if (infoContainer) {
    if (currentSettings.showStatusBar) {
      infoContainer.style.display = "block";
    } else {
      infoContainer.style.display = "none";
    }

    // Apply position
    infoContainer.classList.remove(
      "bottom-right",
      "bottom-left",
      "top-right",
      "top-left",
    );
    infoContainer.classList.add(currentSettings.statusBarPosition);

    // Apply status bar color with gradient
    const gradientEnd = adjustColor(currentSettings.statusBarColor, -20);
    infoContainer.style.background = `linear-gradient(135deg, ${currentSettings.statusBarColor} 0%, ${gradientEnd} 100%)`;
  }

  // Apply cursor color and visual highlight
  const style = document.createElement("style");
  style.id = "vimtion-custom-styles";
  const existingStyle = document.getElementById("vimtion-custom-styles");
  if (existingStyle) {
    existingStyle.remove();
  }

  const visualHighlight = hexToRgba(currentSettings.visualHighlightColor, 0.3);

  style.textContent = `
    .vim-block-cursor {
      background-color: ${currentSettings.cursorColor} !important;
      box-shadow: 0 0 4px ${hexToRgba(currentSettings.cursorColor, 0.6)} !important;
      ${currentSettings.cursorBlink ? "animation: blink 1s step-end infinite !important;" : "animation: none !important;"}
    }
    body.vim-normal-mode [contenteditable="true"]:focus::selection,
    body.vim-normal-mode [contenteditable="true"]::selection {
      background-color: transparent !important;
    }
    body.vim-visual-mode [contenteditable="true"]::selection,
    body.vim-visual-mode [contenteditable="true"] *::selection,
    body.vim-visual-mode ::selection {
      background-color: ${visualHighlight} !important;
    }
    body.vim-visual-line-mode [contenteditable="true"]::selection,
    body.vim-visual-line-mode [contenteditable="true"] *::selection,
    body.vim-visual-line-mode ::selection {
      background-color: ${visualHighlight} !important;
    }
    body.vim-visual-line-mode [contenteditable="true"]:empty::selection {
      background-color: ${visualHighlight} !important;
      display: block;
      min-height: 1em;
    }
    body.vim-insert-mode [contenteditable="true"] {
      caret-color: ${currentSettings.cursorColor} !important;
    }
    body.vim-visual-mode [contenteditable="true"] {
      caret-color: ${currentSettings.cursorColor} !important;
    }
    body.vim-visual-line-mode [contenteditable="true"] {
      caret-color: ${currentSettings.cursorColor} !important;
    }
  `;

  // Insert style at the end to ensure it overrides everything
  const lastStyle = document.head.querySelector("style:last-of-type");
  if (lastStyle) {
    lastStyle.insertAdjacentElement("afterend", style);
  } else {
    document.head.appendChild(style);
  }
}

// Load settings from storage
export function loadSettings(callback?: () => void) {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings: VimtionSettings) => {
    updateCurrentSettings(settings);
    applySettings();
    if (callback) callback();
  });
}
