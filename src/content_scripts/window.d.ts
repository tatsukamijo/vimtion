interface VimLine {
  element: HTMLDivElement;
  cursor_position: number;
}

interface LinkHint {
  link: HTMLAnchorElement;
  hint: string;
  overlay: HTMLElement;
}

interface VimInfo {
  active_line: number;
  cursor_position: number;
  desired_column: number;
  lines: VimLine[];
  mode: "normal" | "insert" | "visual" | "visual-line" | "link-hint";
  visual_start_line: number;
  visual_start_pos: number;
  visual_end_pos?: number;
  pending_operator: "y" | "d" | "c" | "yi" | "di" | "ci" | "ya" | "da" | "ca" | "vi" | "va" | "g" | "f" | "F" | "t" | "T" | "df" | "dF" | "dt" | "dT" | "cf" | "cF" | "ct" | "cT" | null;
  undo_count: number;
  in_undo_group: boolean;
  link_hints: LinkHint[];
  link_hint_input: string;
}

declare global {
  interface Window {
    vim_info: VimInfo;
  }
}

export {};
