import { ATTR_FILE, ATTR_FILE_ABS, ATTR_KIND, ATTR_NAME } from "./core/markers";
import {
  Fragment,
  cloneElement,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode
} from "react";

type MarkerKind = "server" | "client";

const CONTENTS_STYLE = { display: "contents" } as const;

export function __nextrayMark(
  kind: MarkerKind,
  name: string,
  file: string,
  absoluteFile: string,
  node: ReactNode
): ReactNode {
  if (node === null || node === undefined || typeof node === "boolean") {
    return node;
  }

  const markerProps: Record<string, string> = {
    [ATTR_KIND]: kind,
    [ATTR_NAME]: name
  };

  if (file) {
    markerProps[ATTR_FILE] = file;
  }

  if (absoluteFile) {
    markerProps[ATTR_FILE_ABS] = absoluteFile;
  }

  if (isValidElement(node)) {
    if (typeof node.type === "string") {
      return cloneElement(node as ReactElement, markerProps);
    }

    if (node.type === Fragment) {
      return createElement("span", { ...markerProps, style: CONTENTS_STYLE }, node);
    }

    return createElement("span", { ...markerProps, style: CONTENTS_STYLE }, node);
  }

  return createElement("span", { ...markerProps, style: CONTENTS_STYLE }, node);
}
