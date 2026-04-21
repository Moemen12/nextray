export type NextrayKind = "server" | "client";
export type NextrayModifierKey = "auto" | "ctrl" | "meta";

export interface MarkerMeta {
  kind: NextrayKind;
  name: string;
  file?: string;
  absoluteFile?: string;
}

export interface OverlayOptions {
  markerSelector: string;
  serverColor: string;
  clientColor: string;
  serverTint: string;
  clientTint: string;
  zIndex: number;
  showBadge: boolean;
  showBoundaryLines: boolean;
  enableOpenInEditor?: boolean;
  openInEditorModifier?: NextrayModifierKey;
  editorUriScheme?: string;
}

export interface NextrayController {
  refresh(): void;
  destroy(): void;
}
