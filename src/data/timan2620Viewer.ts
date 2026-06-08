/**
 * Timan 2620 viewer data.
 *
 * To add or replace images, drop files into the matching folder under
 * `public/images/timan-2620/<configuration>/` and update the
 * `imageSequence` arrays below. See the folder's README.md for the naming
 * convention.
 *
 * To add a new configuration, append a new entry to TIMAN_2620_CONFIGS —
 * the viewer picks it up automatically.
 */
import type { ViewerConfiguration } from '@/components/product-viewer/types';

const BASE = '/images/timan-2620';

/** Convenience: build standard/01.jpg .. standard/NN.jpg. */
function seq(folder: string, count: number, ext = 'jpg'): string[] {
  return Array.from({ length: count }, (_, i) => `${BASE}/${folder}/${String(i + 1).padStart(2, '0')}.${ext}`);
}

export const TIMAN_2620_CONFIGS: ViewerConfiguration[] = [
  {
    key: 'standard',
    label: 'Standard',
    badges: [],
    imageSequence: seq('standard', 8),
    hotspots: [
      // Example — uncomment when real coordinates are known:
      // { id: 'engine', frame: 1, x: 52, y: 48, title: 'Motor', description: 'Kubota 25 hk', imageUrl: '/images/timan-2620/hotspots/engine.jpg' },
    ],
    enabled: true,
  },
  {
    key: 'v_plow',
    label: 'V-plov',
    badges: [{ id: 'v-plow', label: 'V-plov' }],
    imageSequence: [`${BASE}/v-plow/01.jpg`],
    hotspots: [],
    enabled: true,
  },
  {
    key: 'salt_spreader',
    label: 'Saltspreder',
    badges: [{ id: 'salt-spreader', label: 'Saltspreder' }],
    imageSequence: [`${BASE}/salt-spreader/01.jpg`],
    hotspots: [],
    enabled: true,
  },
  {
    key: 'cab',
    label: 'Kabine',
    badges: [{ id: 'cab', label: 'Kabine' }],
    imageSequence: [`${BASE}/cab/01.jpg`],
    hotspots: [],
    enabled: true,
  },
  {
    key: 'full_winter_setup',
    label: 'Fuldt vintersæt',
    badges: [
      { id: 'v-plow', label: 'V-plov' },
      { id: 'salt-spreader', label: 'Saltspreder' },
      { id: 'cab', label: 'Kabine' },
    ],
    imageSequence: [`${BASE}/full-winter-setup/01.jpg`],
    hotspots: [],
    enabled: true,
  },
  {
    key: 'brush',
    label: 'Kost',
    badges: [{ id: 'brush', label: 'Kost' }],
    imageSequence: [`${BASE}/brush/01.jpg`],
    hotspots: [],
    enabled: true,
  },
];
