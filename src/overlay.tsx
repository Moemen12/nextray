"use client";

import { attachNextrayOverlay } from "./core/overlay";
import { useEffect } from "react";
import type { NextrayDevOverlayProps } from "./types";

export function NextrayDevOverlay({
  enabled = process.env.NODE_ENV !== "production",
  options
}: NextrayDevOverlayProps) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let controller: ReturnType<typeof attachNextrayOverlay> | null = null;
    let cancelled = false;
    let rafA = 0;
    let rafB = 0;

    rafA = window.requestAnimationFrame(() => {
      rafB = window.requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }

        controller = attachNextrayOverlay(options);
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafA);
      window.cancelAnimationFrame(rafB);
      controller?.destroy();
    };
  }, [enabled, options]);

  return null;
}
