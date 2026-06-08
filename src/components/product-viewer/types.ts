/**
 * Shared types for the reusable Timan product image viewer.
 *
 * The viewer is configuration-driven: each configuration has its own image
 * sequence (1..N frames) and optional hotspots. A single image just shows
 * the photo; ≥ 2 images activate frame-by-frame drag-to-rotate.
 *
 * IMPORTANT: original images must be displayed as-is — never recolored,
 * cropped, upscaled or recompressed by the viewer. We render with
 * `object-fit: contain` to preserve original proportions.
 */

export interface ViewerHotspotTechnical {
  label: string;
  value: string;
}

export interface ViewerHotspot {
  id: string;
  /**
   * 1-based frame index this hotspot belongs to.
   * Use 0 for "always visible" (frame-independent callouts).
   */
  frame: number;
  /** Position in percent of the rendered image box (0..100). */
  x: number;
  y: number;
  title: string;
  /** Short tagline shown under the title in the callout chip. */
  subtitle?: string;
  description?: string;
  /** Optional bullets shown in the detail modal. */
  bullets?: string[];
  /** Optional technical specs shown in the detail modal. */
  technical?: ViewerHotspotTechnical[];
  /** Optional thumbnail shown in the hotspot popover/modal. */
  imageUrl?: string;
  /** Optional outbound link from the popover. */
  linkUrl?: string;
  /**
   * Visual variant:
   *  - 'dot'      → classic small pulsing dot (default, existing behaviour)
   *  - 'callout'  → large round white card with green plus marker,
   *                 connector line, title + subtitle; click opens a modal.
   */
  variant?: 'dot' | 'callout';
  /**
   * Where the callout card sits relative to the (x, y) anchor on the image.
   * Defaults to 'right'. Used only as a fallback when `calloutCenter` is not set.
   */
  calloutPlacement?: 'left' | 'right' | 'top' | 'bottom';
  /**
   * Explicit centre of the callout card in canvas percent (0..100).
   * When set, this overrides any computed placement so callouts can be
   * orbited around the machine silhouette without overlapping each other
   * or the product.
   */
  calloutCenter?: { cx: number; cy: number };
}

export interface EquipmentBadge {
  id: string;
  label: string;
}

export interface ViewerConfiguration {
  /** Stable key, e.g. "standard", "v_plow". */
  key: string;
  /** UI label shown on the configuration button + active badge. */
  label: string;
  /** Equipment chips shown above the image. */
  badges: EquipmentBadge[];
  /**
   * Ordered list of image URLs (public-relative or absolute).
   *  - length 1 → static image, no rotation, no prev/next.
   *  - length ≥ 2 → drag-to-rotate sequence.
   */
  imageSequence: string[];
  hotspots: ViewerHotspot[];
  /** Disabled configurations are shown greyed-out and not selectable. */
  enabled: boolean;
}
