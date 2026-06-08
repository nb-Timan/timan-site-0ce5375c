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

export interface ViewerHotspot {
  id: string;
  /** 1-based frame index this hotspot belongs to. */
  frame: number;
  /** Position in percent of the rendered image box (0..100). */
  x: number;
  y: number;
  title: string;
  description?: string;
  /** Optional thumbnail shown in the hotspot popover. */
  imageUrl?: string;
  /** Optional outbound link from the popover. */
  linkUrl?: string;
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
