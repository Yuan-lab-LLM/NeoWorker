/**
 * Pretext Adapter
 *
 * Thin wrapper around @chenglou/pretext that centralises font resolution,
 * caching, and a localStorage-based feature flag.  Every call-site in the
 * renderer imports from here — never from the library directly.
 */

import { prepare, layout, clearCache } from "@chenglou/pretext";
import type { PreparedText } from "@chenglou/pretext";

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

const FEATURE_FLAG_KEY = "pretext-virtualization-enabled";

export function isPretextEnabled(): boolean {
  try {
    const raw = localStorage.getItem(FEATURE_FLAG_KEY);
    return raw === null || raw === "true"; // enabled by default
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Font resolution
// ---------------------------------------------------------------------------

/**
 * Build a CSS font shorthand string from the computed styles of an element.
 * Falls back to document.documentElement when no element is provided.
 */
export function getResolvedFont(el?: HTMLElement): {
  fontFamily: string;
  fontSize: number;
} {
  const target = el ?? document.documentElement;
  const computed = getComputedStyle(target);
  return {
    fontFamily: computed.fontFamily,
    fontSize: parseFloat(computed.fontSize) || 14,
  };
}

/** Convert our resolved font to the CSS font shorthand string that pretext expects. */
function toCssFontString(font: {
  fontFamily: string;
  fontSize: number;
}): string {
  return `${font.fontSize}px ${font.fontFamily}`;
}

// ---------------------------------------------------------------------------
// Default estimated height (matches --density-timeline-event-intrinsic-size)
// ---------------------------------------------------------------------------

const DEFAULT_ESTIMATED_HEIGHT = 40;

function getEstimatedHeight(): number {
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--density-timeline-event-intrinsic-size")
      .trim();
    return parseFloat(raw) || DEFAULT_ESTIMATED_HEIGHT;
  } catch {
    return DEFAULT_ESTIMATED_HEIGHT;
  }
}

// ---------------------------------------------------------------------------
// PretextMeasurer
// ---------------------------------------------------------------------------

export class PretextMeasurer {
  private cssFont: string;
  private fontSize: number;
  private cache = new Map<string, PreparedText>();

  constructor(font: { fontFamily: string; fontSize: number }) {
    this.cssFont = toCssFontString(font);
    this.fontSize = font.fontSize;
  }

  /** Batch-prepare a set of texts (Canvas measurement pass). */
  prepare(texts: string[]): void {
    for (const text of texts) {
      if (!this.cache.has(text)) {
        try {
          this.cache.set(text, prepare(text, this.cssFont));
        } catch {
          // If measurement fails for a given text, skip — getHeight will
          // return an estimated fallback.
        }
      }
    }
  }

  /** Return the pixel height for a single prepared text at the given width. */
  getHeight(text: string, width: number, lineHeight?: number): number {
    const prepared = this.cache.get(text);
    if (!prepared) return getEstimatedHeight();
    try {
      const lh = lineHeight ?? this.fontSize * 1.5;
      const result = layout(prepared, width, lh);
      return result.height;
    } catch {
      return getEstimatedHeight();
    }
  }

  /** Return heights for an array of texts in the same order. */
  getHeights(texts: string[], width: number, lineHeight?: number): number[] {
    return texts.map((t) => this.getHeight(t, width, lineHeight));
  }

  /** Drop all cached preparations (call on theme/font change). */
  invalidate(): void {
    this.cache.clear();
    clearCache();
  }
}

// ---------------------------------------------------------------------------
// Global singleton (for the active theme's font)
// ---------------------------------------------------------------------------

let globalMeasurer: PretextMeasurer | null = null;

export function getGlobalMeasurer(): PretextMeasurer {
  if (!globalMeasurer) {
    globalMeasurer = new PretextMeasurer(getResolvedFont());
  }
  return globalMeasurer;
}

export function invalidateGlobalMeasurer(): void {
  if (globalMeasurer) {
    globalMeasurer.invalidate();
  }
  globalMeasurer = null;
}
