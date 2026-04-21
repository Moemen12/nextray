import type { MarkerMeta, NextrayKind } from "./types";

export const ATTR_KIND = "data-nextray-kind";
export const ATTR_NAME = "data-nextray-name";
export const ATTR_FILE = "data-nextray-file";
export const ATTR_FILE_ABS = "data-nextray-file-abs";

export function createMarkerAttributes(meta: MarkerMeta): Record<string, string> {
  const attrs: Record<string, string> = {
    [ATTR_KIND]: meta.kind,
    [ATTR_NAME]: meta.name
  };

  if (meta.file) {
    attrs[ATTR_FILE] = meta.file;
  }

  if (meta.absoluteFile) {
    attrs[ATTR_FILE_ABS] = meta.absoluteFile;
  }

  return attrs;
}

export function getMarkerKind(element: Element | null): NextrayKind | null {
  if (!element) {
    return null;
  }

  const value = element.getAttribute(ATTR_KIND);
  return value === "server" || value === "client" ? value : null;
}

export function getMarkerName(element: Element | null): string {
  if (!element) {
    return "Unknown";
  }

  return element.getAttribute(ATTR_NAME) ?? "Unknown";
}

export function getMarkerFile(element: Element | null): string {
  if (!element) {
    return "";
  }

  return element.getAttribute(ATTR_FILE) ?? "";
}

export function getMarkerAbsoluteFile(element: Element | null): string {
  if (!element) {
    return "";
  }

  return element.getAttribute(ATTR_FILE_ABS) ?? "";
}
