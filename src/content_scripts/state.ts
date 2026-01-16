/**
 * State management for Vimtion
 */

import { VimInfo, VimtionSettings, DEFAULT_SETTINGS } from "./types";

// Current settings (loaded from storage)
export let currentSettings: VimtionSettings = { ...DEFAULT_SETTINGS };

// Update current settings
export function updateCurrentSettings(settings: VimtionSettings) {
  currentSettings = settings;
}

// Link selection mode state
export let linkSelectionMode = false;
export let availableLinks: HTMLAnchorElement[] = [];
export let selectedLinkIndex = 0;

export function setLinkSelectionMode(value: boolean) {
  linkSelectionMode = value;
}

export function setAvailableLinks(links: HTMLAnchorElement[]) {
  availableLinks = links;
}

export function setSelectedLinkIndex(index: number) {
  selectedLinkIndex = index;
}

export function resetLinkSelection() {
  linkSelectionMode = false;
  availableLinks = [];
  selectedLinkIndex = 0;
}

// Track last key press for jk escape sequence
export let lastInsertKey: string | null = null;
export let lastInsertKeyTime = 0;
export const JK_TIMEOUT_MS = 200; // Time window for jk sequence

export function setLastInsertKey(key: string | null) {
  lastInsertKey = key;
}

export function setLastInsertKeyTime(time: number) {
  lastInsertKeyTime = time;
}

// Flag to suppress beforeunload warning
let suppressBeforeUnloadWarning = false;

export function setSuppressBeforeUnloadWarning(value: boolean) {
  suppressBeforeUnloadWarning = value;
}

export function getSuppressBeforeUnloadWarning(): boolean {
  return suppressBeforeUnloadWarning;
}

// Initialize VimInfo
export function initVimInfo(): VimInfo {
  const vim_info: VimInfo = {
    active_line: 0,
    cursor_position: 0,
    desired_column: 0,
    lines: [],
    mode: "normal",
    visual_start_line: 0,
    visual_start_pos: 0,
    pending_operator: null,
    undo_count: 0,
    in_undo_group: false,
    link_hints: [],
    link_hint_input: "",
  };
  window.vim_info = vim_info;
  return vim_info;
}
