/**
 * Type definitions for Vimtion
 */

// Settings interface
export interface VimtionSettings {
  showStatusBar: boolean;
  statusBarPosition: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  statusBarColor: string;
  cursorBlink: boolean;
  cursorColor: string;
  visualHighlightColor: string;
  showUpdateNotifications: boolean;
  linkHintsEnabled: boolean;
  hintCharacters: string;
  hintBackgroundColor: string;
  hintTextColor: string;
  hintMatchedColor: string;
  hintFontSize: number;
}

// Default settings
export const DEFAULT_SETTINGS: VimtionSettings = {
  showStatusBar: true,
  statusBarPosition: "bottom-right",
  statusBarColor: "#667eea",
  cursorBlink: true,
  cursorColor: "#667eea",
  visualHighlightColor: "#667eea",
  showUpdateNotifications: true,
  linkHintsEnabled: true,
  hintCharacters: "asdfghjklqwertyuiopzxcvbnm",
  hintBackgroundColor: "#333333",
  hintTextColor: "#ffffff",
  hintMatchedColor: "#ff4458",
  hintFontSize: 14,
};

// Vim line interface
export interface VimLine {
  cursor_position: number;
  element: HTMLDivElement;
}

// Link hint interface
export interface LinkHint {
  link: HTMLAnchorElement;
  hint: string;
  overlay: HTMLElement;
}

// Vim info interface (attached to window)
export interface VimInfo {
  active_line: number;
  cursor_position: number;
  desired_column: number;
  lines: VimLine[];
  mode: "normal" | "insert" | "visual" | "visual-line" | "link-hint";
  visual_start_line: number;
  visual_start_pos: number;
  visual_end_pos?: number;
  pending_operator:
    | "y"
    | "d"
    | "c"
    | "yi"
    | "di"
    | "ci"
    | "ya"
    | "da"
    | "ca"
    | "vi"
    | "va"
    | "g"
    | "f"
    | "F"
    | "t"
    | "T"
    | "df"
    | "dF"
    | "dt"
    | "dT"
    | "cf"
    | "cF"
    | "ct"
    | "cT"
    | null;
  undo_count: number;
  in_undo_group: boolean;
  link_hints: LinkHint[];
  link_hint_input: string;
}

// Extend Window interface
declare global {
  interface Window {
    vim_info: VimInfo;
  }
}
