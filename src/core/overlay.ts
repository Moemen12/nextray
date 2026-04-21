import {
  ATTR_FILE,
  ATTR_FILE_ABS,
  ATTR_KIND,
  ATTR_NAME,
  getMarkerAbsoluteFile,
  getMarkerFile,
  getMarkerKind,
  getMarkerName
} from "./markers";
import type { NextrayController, NextrayModifierKey, OverlayOptions } from "./types";

const DEFAULT_OPTIONS: OverlayOptions = {
  markerSelector: `[${ATTR_KIND}]`,
  serverColor: "#2563eb",
  clientColor: "#f97316",
  serverTint: "rgba(37, 99, 235, 0.08)",
  clientTint: "rgba(249, 115, 22, 0.08)",
  zIndex: 2147483000,
  showBadge: true,
  showBoundaryLines: true,
  enableOpenInEditor: true,
  openInEditorModifier: "auto",
  editorUriScheme: "vscode://file"
};

const STYLE_ID = "nextray-style";
const BADGE_ID = "nextray-badge";
const HIGHLIGHT_LAYER_ID = "nextray-highlight-layer";
const BOUNDARY_LAYER_ID = "nextray-boundary-layer";

type ResolvedModifier = "ctrl" | "meta";

export function attachNextrayOverlay(options: Partial<OverlayOptions> = {}): NextrayController {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      refresh: () => undefined,
      destroy: () => undefined
    };
  }

  const resolved: OverlayOptions = { ...DEFAULT_OPTIONS, ...options };
  let rafId: number | null = null;

  const isMac = detectMacPlatform();
  const modifier = resolveModifier(resolved.openInEditorModifier, isMac);

  injectStyles(resolved);

  const badge = createBadge(resolved);
  const highlightLayer = createLayer(HIGHLIGHT_LAYER_ID, resolved.zIndex - 2);
  const boundaryLayer = createLayer(BOUNDARY_LAYER_ID, resolved.zIndex - 1);

  const onMouseMove = (event: MouseEvent): void => {
    if (!resolved.showBadge) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const marker = target?.closest(resolved.markerSelector) ?? null;

    if (!marker || getMarkerKind(marker) === null) {
      badge.style.display = "none";
      return;
    }

    const kind = getMarkerKind(marker);
    const name = getMarkerName(marker);
    const file = getMarkerFile(marker);

    const title = `${kind === "server" ? "Server" : "Client"}: ${name}`;
    const details = file || "(file path unavailable)";

    badge.textContent = `${title}\n${details}`;
    badge.style.display = "block";

    const horizontalOffset = 14;
    const verticalOffset = 18;
    const maxX = window.innerWidth - badge.offsetWidth - 8;
    const maxY = window.innerHeight - badge.offsetHeight - 8;

    badge.style.left = `${Math.min(event.clientX + horizontalOffset, Math.max(maxX, 8))}px`;
    badge.style.top = `${Math.min(event.clientY + verticalOffset, Math.max(maxY, 8))}px`;
  };

  const onMouseLeave = (): void => {
    badge.style.display = "none";
  };

  const onClick = (event: MouseEvent): void => {
    if (!resolved.enableOpenInEditor || event.button !== 0 || !isModifierActive(event, modifier)) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const marker = target?.closest(resolved.markerSelector) ?? null;

    if (!marker || getMarkerKind(marker) === null) {
      return;
    }

    const absoluteFile = getMarkerAbsoluteFile(marker);
    const relativeFile = getMarkerFile(marker);
    const fileToOpen = absoluteFile || relativeFile;

    if (!fileToOpen) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    openInEditor(fileToOpen, resolved.editorUriScheme || DEFAULT_OPTIONS.editorUriScheme || "vscode://file");
  };

  const refreshNow = (): void => {
    const current = Array.from(document.querySelectorAll(resolved.markerSelector));
    renderHighlights(highlightLayer, current, resolved);
    renderBoundaryLines(boundaryLayer, current, resolved);
  };

  const scheduleRefresh = (): void => {
    if (rafId !== null) {
      return;
    }

    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      refreshNow();
    });
  };

  const mutationObserver = new MutationObserver(() => {
    scheduleRefresh();
  });

  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [ATTR_KIND, ATTR_NAME, ATTR_FILE, ATTR_FILE_ABS]
  });

  const resizeObserver = new ResizeObserver(() => {
    scheduleRefresh();
  });

  resizeObserver.observe(document.documentElement);

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("mouseleave", onMouseLeave, true);
  document.addEventListener("click", onClick, true);
  window.addEventListener("resize", scheduleRefresh, { passive: true });
  window.addEventListener("scroll", scheduleRefresh, { passive: true });

  refreshNow();

  return {
    refresh: refreshNow,
    destroy: () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();

      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseleave", onMouseLeave, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("resize", scheduleRefresh);
      window.removeEventListener("scroll", scheduleRefresh);

      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }

      badge.remove();
      highlightLayer.remove();
      boundaryLayer.remove();
    }
  };
}

function detectMacPlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const uaDataPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
  const platform = uaDataPlatform || navigator.platform || "";
  return /mac/i.test(platform);
}

function resolveModifier(configured: NextrayModifierKey | undefined, isMac: boolean): ResolvedModifier {
  if (configured === "ctrl" || configured === "meta") {
    return configured;
  }

  return isMac ? "meta" : "ctrl";
}

function isModifierActive(event: MouseEvent, modifier: ResolvedModifier): boolean {
  if (modifier === "meta") {
    return event.metaKey || event.ctrlKey;
  }

  return event.ctrlKey;
}

function openInEditor(filePath: string, scheme: string): void {
  const uri = toEditorUri(filePath, scheme);
  const anchor = document.createElement("a");
  anchor.href = uri;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function toEditorUri(filePath: string, scheme: string): string {
  const normalizedPath = normalizePathForUri(filePath);
  const normalizedScheme = scheme.endsWith("/") ? scheme.slice(0, -1) : scheme;
  return `${normalizedScheme}/${encodeURI(normalizedPath)}`;
}

function normalizePathForUri(filePath: string): string {
  const slashNormalized = filePath.replace(/\\/g, "/");

  if (/^[A-Za-z]:\//.test(slashNormalized)) {
    return `/${slashNormalized}`;
  }

  return slashNormalized;
}

function injectStyles(options: OverlayOptions): void {
  const existing = document.getElementById(STYLE_ID);
  if (existing) {
    existing.textContent = styleText(options);
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = styleText(options);
  document.head.appendChild(style);
}

function styleText(options: OverlayOptions): string {
  return `
#${BADGE_ID} {
  position: fixed;
  z-index: ${options.zIndex};
  pointer-events: none;
  white-space: pre;
  padding: 6px 9px;
  border-radius: 6px;
  font: 12px/1.3 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  color: #f8fafc;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.3);
  backdrop-filter: blur(4px);
  display: none;
}
#${HIGHLIGHT_LAYER_ID} {
  position: fixed;
  inset: 0;
  z-index: ${options.zIndex - 2};
  pointer-events: none;
}
#${BOUNDARY_LAYER_ID} {
  position: fixed;
  inset: 0;
  z-index: ${options.zIndex - 1};
  pointer-events: none;
}
.nextray-highlight {
  position: fixed;
  box-sizing: border-box;
  border: 2px solid transparent;
  border-radius: 2px;
  transition: border-color 80ms ease, background-color 80ms ease;
}
.nextray-boundary-line {
  position: fixed;
  height: 2px;
  border-radius: 999px;
  opacity: 0.95;
}
`;
}

function createBadge(options: OverlayOptions): HTMLDivElement {
  const existing = document.getElementById(BADGE_ID);
  if (existing instanceof HTMLDivElement) {
    return existing;
  }

  const badge = document.createElement("div");
  badge.id = BADGE_ID;
  badge.style.zIndex = String(options.zIndex);
  document.body.appendChild(badge);
  return badge;
}

function createLayer(id: string, zIndex: number): HTMLDivElement {
  const existing = document.getElementById(id);
  if (existing instanceof HTMLDivElement) {
    return existing;
  }

  const layer = document.createElement("div");
  layer.id = id;
  layer.style.zIndex = String(zIndex);
  document.body.appendChild(layer);
  return layer;
}

function renderHighlights(
  layer: HTMLDivElement,
  nodes: Element[],
  options: OverlayOptions
): void {
  while (layer.firstChild) {
    layer.removeChild(layer.firstChild);
  }

  for (const node of nodes) {
    const kind = getMarkerKind(node);
    if (!kind) {
      continue;
    }

    const rect = node.getBoundingClientRect();
    const top = clamp(rect.top, 0, window.innerHeight);
    const left = clamp(rect.left, 0, window.innerWidth);
    const bottom = clamp(rect.bottom, 0, window.innerHeight);
    const right = clamp(rect.right, 0, window.innerWidth);

    const width = right - left;
    const height = bottom - top;

    if (width < 2 || height < 2) {
      continue;
    }

    const highlight = document.createElement("div");
    highlight.className = "nextray-highlight";
    highlight.style.left = `${left}px`;
    highlight.style.top = `${top}px`;
    highlight.style.width = `${width}px`;
    highlight.style.height = `${height}px`;
    highlight.style.borderColor = kind === "server" ? options.serverColor : options.clientColor;
    highlight.style.background = kind === "server" ? options.serverTint : options.clientTint;

    layer.appendChild(highlight);
  }
}

function renderBoundaryLines(
  layer: HTMLDivElement,
  nodes: Element[],
  options: OverlayOptions
): void {
  while (layer.firstChild) {
    layer.removeChild(layer.firstChild);
  }

  if (!options.showBoundaryLines) {
    return;
  }

  const servers = nodes.filter((node) => getMarkerKind(node) === "server");

  for (const server of servers) {
    const firstClient = findFirstClientDescendant(server);
    if (!firstClient) {
      continue;
    }

    const clientRect = firstClient.getBoundingClientRect();
    const serverRect = server.getBoundingClientRect();

    if (clientRect.width < 2 || clientRect.height < 2) {
      continue;
    }

    const top = clamp(clientRect.top, 0, window.innerHeight - 2);
    const left = clamp(
      Math.max(clientRect.left, serverRect.left),
      0,
      Math.max(window.innerWidth - 2, 0)
    );
    const right = clamp(
      Math.min(clientRect.right, serverRect.right),
      0,
      window.innerWidth
    );
    const width = right - left;

    if (width < 2) {
      continue;
    }

    const line = document.createElement("div");
    line.className = "nextray-boundary-line";
    line.style.left = `${left}px`;
    line.style.top = `${top}px`;
    line.style.width = `${width}px`;
    line.style.background = `linear-gradient(90deg, ${options.serverColor}, ${options.clientColor})`;
    layer.appendChild(line);
  }
}

function findFirstClientDescendant(root: Element): Element | null {
  const queue: Element[] = Array.from(root.children);

  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate) {
      break;
    }

    const kind = getMarkerKind(candidate);

    if (kind === "client") {
      return candidate;
    }

    queue.push(...Array.from(candidate.children));
  }

  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
