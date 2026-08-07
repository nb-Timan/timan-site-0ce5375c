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
  { key: 'v_plow', label: 'Dozer blad' },
  { key: 'salt_spreader', label: 'Saltspreder' },
  { key: 'brush', label: 'Skov' },
];

/** Pairs of equipment that cannot be combined. Order does not matter. */
export const TIMAN_2620_INCOMPATIBLE: Array<[Timan2620Equipment, Timan2620Equipment]> = [
  ['brush', 'v_plow'],
];

const BASE = '/images/timan-2620';

/**
 * Explicit mapping from uploaded source photos.
 * All 8 reference images currently live in `public/images/timan-2620/standard/`
 * as NN.jpg (01..08). Each combination below references those files directly
 * — no path guessing, no inferred folders.
 *
 *   Image 1 → Kabine + Saltspreder
 *   Image 2 → Standard + Saltspreder
 *   Image 3 → Standard
 *   Image 4 → Standard + V-plov
 *   Image 5 → Standard + Fuldt vintersæt
 *   Image 6 → Kabine + Fuldt vintersæt
 *   Image 7 → Kabine
 *   Image 8 → Kabine + Fuldt vintersæt (alternate view)
 */
const IMG = (n: number) => `${BASE}/standard/${String(n).padStart(2, '0')}.jpg`;

/**
 * Image sequences and hotspots for every base + equipment combination.
 * Empty `imageSequence` means the photo set has not been shot yet — the
 * viewer shows a friendly placeholder instead of a broken image.
 */
export const TIMAN_2620_IMAGES: Record<string, Timan2620ImageEntry> = {
  // Base machine only
  standard: { imageSequence: [IMG(3)], hotspots: [] },
  cab: { imageSequence: [`${BASE}/cab/01.jpg`], hotspots: [] },

  // Saltspreder only
  standard_salt_spreader: { imageSequence: [IMG(2)], hotspots: [] },
  cab_salt_spreader: { imageSequence: [IMG(1)], hotspots: [] },

  // V-plov only
  standard_v_plow: { imageSequence: [IMG(4)], hotspots: [] },
  cab_v_plow: { imageSequence: [`${BASE}/cab_v_plow/01.jpg`], hotspots: [] },

  // Fuldt vintersæt (V-plov + Saltspreder)
  standard_full_winter_setup: { imageSequence: [IMG(5)], hotspots: [] },
  cab_full_winter_setup: { imageSequence: [IMG(6), IMG(8)], hotspots: [] },

  // Kost — not photographed yet
  standard_brush: { imageSequence: [], hotspots: [] },
  cab_brush: { imageSequence: [], hotspots: [] },
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
