/**
 * Timan 2620 viewer data — base machine + equipment model.
 *
 * Image folder convention:
 *   public/images/timan-2620/<imageKey>/NN.jpg
 *
 * Where <imageKey> is derived from base + equipment:
 *   - standard
 *   - standard_v_plow
 *   - standard_salt_spreader
 *   - standard_brush
 *   - standard_full_winter_setup     (V-plov + Saltspreder, no Kost)
 *   - cab
 *   - cab_v_plow
 *   - cab_salt_spreader
 *   - cab_brush
 *   - cab_full_winter_setup
 *
 * Each folder may contain:
 *   - 1 image (01.jpg)              → static photo, no rotation
 *   - 2+ images (01.jpg .. NN.jpg)  → drag-to-rotate 360° sequence
 *
 * To add images for a new combination:
 *   1. Drop NN.jpg files into public/images/timan-2620/<imageKey>/
 *   2. Update the matching entry below with the correct frame count
 *      via `seq('<imageKey>', N)`.
 *
 * Never modify, crop, recolor, upscale or recompress the originals.
 */
import type { ViewerHotspot } from '@/components/product-viewer/types';

export type Timan2620Base = 'standard' | 'cab';
export type Timan2620Equipment = 'v_plow' | 'salt_spreader' | 'brush';

export interface Timan2620BaseOption {
  key: Timan2620Base;
  label: string;
}

export interface Timan2620EquipmentOption {
  key: Timan2620Equipment;
  label: string;
}

export interface Timan2620ImageEntry {
  imageSequence: string[];
  hotspots: ViewerHotspot[];
}

export const TIMAN_2620_BASE_OPTIONS: Timan2620BaseOption[] = [
  { key: 'standard', label: 'Standard' },
  { key: 'cab', label: 'Kabine' },
];

export const TIMAN_2620_EQUIPMENT_OPTIONS: Timan2620EquipmentOption[] = [
  { key: 'v_plow', label: 'V-plov' },
  { key: 'salt_spreader', label: 'Saltspreder' },
  { key: 'brush', label: 'Kost' },
];

/** Pairs of equipment that cannot be combined. Order does not matter. */
export const TIMAN_2620_INCOMPATIBLE: Array<[Timan2620Equipment, Timan2620Equipment]> = [
  ['brush', 'v_plow'],
];

const BASE = '/images/timan-2620';

/** Helper: build `<folder>/01.jpg .. <folder>/NN.jpg`. */
function seq(folder: string, count: number, ext: 'jpg' | 'png' | 'webp' = 'jpg'): string[] {
  return Array.from(
    { length: count },
    (_, i) => `${BASE}/${folder}/${String(i + 1).padStart(2, '0')}.${ext}`,
  );
}

/**
 * Image sequences and hotspots for every base + equipment combination.
 * Empty `imageSequence` means the photo set has not been shot yet — the
 * viewer shows a friendly placeholder instead of a broken image.
 */
export const TIMAN_2620_IMAGES: Record<string, Timan2620ImageEntry> = {
  standard: { imageSequence: seq('standard', 8), hotspots: [] },
  standard_v_plow: { imageSequence: [], hotspots: [] },
  standard_salt_spreader: { imageSequence: [], hotspots: [] },
  standard_brush: { imageSequence: [], hotspots: [] },
  standard_full_winter_setup: { imageSequence: [], hotspots: [] },

  cab: { imageSequence: [], hotspots: [] },
  cab_v_plow: { imageSequence: [], hotspots: [] },
  cab_salt_spreader: { imageSequence: [], hotspots: [] },
  cab_brush: { imageSequence: [], hotspots: [] },
  cab_full_winter_setup: { imageSequence: [], hotspots: [] },
};

/**
 * Derive the image key for the active base machine + selected equipment.
 *
 * Rules:
 *   - V-plov + Saltspreder (without Kost) → "<base>_full_winter_setup"
 *   - Otherwise the single piece of equipment determines the suffix
 *   - Kost is never combined with V-plov (enforced in the UI)
 */
export function deriveTiman2620ImageKey(
  base: Timan2620Base,
  equipment: ReadonlySet<Timan2620Equipment>,
): string {
  const hasVPlow = equipment.has('v_plow');
  const hasSalt = equipment.has('salt_spreader');
  const hasBrush = equipment.has('brush');

  if (hasVPlow && hasSalt && !hasBrush) return `${base}_full_winter_setup`;
  if (hasVPlow) return `${base}_v_plow`;
  if (hasSalt && hasBrush) return `${base}_brush`; // fallback, both shown as badges
  if (hasSalt) return `${base}_salt_spreader`;
  if (hasBrush) return `${base}_brush`;
  return base;
}
