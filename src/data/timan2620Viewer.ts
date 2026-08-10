/**
 * Timan 2620 viewer data.
 *
 * The cabin MESSE images are mapped directly from the delivered filenames.
 * If a combination is not listed here, the configurator must not allow it.
 */
import type { ViewerHotspot } from '@/components/product-viewer/types';

export type Timan2620Base = 'standard' | 'cab';
export type Timan2620Equipment = 'bucket' | 'v_plow' | 'dozer_blade' | 'salt_spreader';

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

export interface Timan2620CabinImageConfig {
  key: string;
  equipment: readonly Timan2620Equipment[];
  imageSequence: readonly string[];
  originalFileNames: readonly string[];
}

export const TIMAN_2620_BASE_OPTIONS: Timan2620BaseOption[] = [
  { key: 'standard', label: 'Standard' },
  { key: 'cab', label: 'Kabine' },
];

export const TIMAN_2620_EQUIPMENT_OPTIONS: Timan2620EquipmentOption[] = [
  { key: 'bucket', label: 'Skovl' },
  { key: 'v_plow', label: 'V-plov' },
  { key: 'dozer_blade', label: 'Dozerblad' },
  { key: 'salt_spreader', label: 'Saltspreder' },
];

const BASE = '/images/timan-2620';
const STANDARD_IMG = (n: number) => `${BASE}/standard/${String(n).padStart(2, '0')}.jpg`;
const CABIN_BASE = `${BASE}/cab-config`;
const CABIN_IMG = (name: string) => `${CABIN_BASE}/${name}.png`;

function cabinConfig(
  key: string,
  equipment: readonly Timan2620Equipment[],
  imageSequence: readonly string[],
  originalFileNames: readonly string[],
): Timan2620CabinImageConfig {
  return { key, equipment, imageSequence, originalFileNames };
}

export const TIMAN_2620_CABIN_IMAGE_CONFIGS = [
  cabinConfig(
    'cab',
    [],
    [CABIN_IMG('a-kabine'), CABIN_IMG('v-kabine-bagfra')],
    ['A-Kabine.png', 'V-Kabine-bagfra.png'],
  ),
  cabinConfig(
    'cab_bucket',
    ['bucket'],
    [CABIN_IMG('c-kabine-skovl')],
    ['C-Kabine+Skovl.png'],
  ),
  cabinConfig(
    'cab_salt_spreader',
    ['salt_spreader'],
    [CABIN_IMG('h-kabine-saltspreder'), CABIN_IMG('ae-kabine-bagfra-saltspreder')],
    ['H-Kabine+Saltspreder.png', 'Æ-Kabine-bagfra+Saltspreder.png'],
  ),
  cabinConfig(
    'cab_salt_spreader_v_plow',
    ['salt_spreader', 'v_plow'],
    [CABIN_IMG('i-kabine-saltspreder-vplov'), CABIN_IMG('oe-kabine-bagfra-saltspreder-vplov')],
    ['I-Kabine+Saltspreder+Vplov.png', 'Ø-Kabine-bagfra+Saltspreder+V-plov.png'],
  ),
  cabinConfig(
    'cab_salt_spreader_dozer_blade',
    ['salt_spreader', 'dozer_blade'],
    [CABIN_IMG('j-kabine-saltspreder-dozerblad'), CABIN_IMG('aa-kabine-bagfra-saltspreder-dozerblad')],
    ['J-Kabine+Saltspreder+Dozer blad.png', 'Å-Kabine-bagfra+saltspreder+Dozer blad.png'],
  ),
] as const satisfies readonly Timan2620CabinImageConfig[];

function equipmentSignature(equipment: Iterable<Timan2620Equipment>): string {
  return Array.from(equipment).sort().join('|');
}

const CABIN_CONFIG_BY_SIGNATURE = new Map(
  TIMAN_2620_CABIN_IMAGE_CONFIGS.map((config) => [equipmentSignature(config.equipment), config]),
);

export function getTiman2620CabinImageConfig(
  equipment: ReadonlySet<Timan2620Equipment>,
): Timan2620CabinImageConfig | null {
  return CABIN_CONFIG_BY_SIGNATURE.get(equipmentSignature(equipment)) ?? null;
}

export const TIMAN_2620_IMAGES: Record<string, Timan2620ImageEntry> = {
  standard: { imageSequence: [STANDARD_IMG(3)], hotspots: [] },
  standard_salt_spreader: { imageSequence: [STANDARD_IMG(2)], hotspots: [] },
  standard_v_plow: { imageSequence: [STANDARD_IMG(4)], hotspots: [] },
  standard_full_winter_setup: { imageSequence: [STANDARD_IMG(5)], hotspots: [] },
  standard_bucket: { imageSequence: [], hotspots: [] },
  standard_dozer_blade: { imageSequence: [], hotspots: [] },

  cab: { imageSequence: [...TIMAN_2620_CABIN_IMAGE_CONFIGS[0].imageSequence], hotspots: [] },
  cab_bucket: { imageSequence: [...TIMAN_2620_CABIN_IMAGE_CONFIGS[1].imageSequence], hotspots: [] },
  cab_salt_spreader: { imageSequence: [...TIMAN_2620_CABIN_IMAGE_CONFIGS[2].imageSequence], hotspots: [] },
  cab_salt_spreader_v_plow: { imageSequence: [...TIMAN_2620_CABIN_IMAGE_CONFIGS[3].imageSequence], hotspots: [] },
  cab_salt_spreader_dozer_blade: { imageSequence: [...TIMAN_2620_CABIN_IMAGE_CONFIGS[4].imageSequence], hotspots: [] },
};

export function deriveTiman2620ImageKey(
  base: Timan2620Base,
  equipment: ReadonlySet<Timan2620Equipment>,
): string {
  if (base === 'cab') {
    return getTiman2620CabinImageConfig(equipment)?.key ?? 'cab_invalid';
  }

  const hasVPlow = equipment.has('v_plow');
  const hasSalt = equipment.has('salt_spreader');
  const hasBucket = equipment.has('bucket');
  const hasDozerBlade = equipment.has('dozer_blade');

  if (hasBucket || hasDozerBlade) return `${base}_invalid`;
  if (hasVPlow && hasSalt) return `${base}_full_winter_setup`;
  if (hasVPlow) return `${base}_v_plow`;
  if (hasSalt) return `${base}_salt_spreader`;
  return base;
}

export function hasTiman2620ImageForSelection(
  base: Timan2620Base,
  equipment: ReadonlySet<Timan2620Equipment>,
): boolean {
  const imageKey = deriveTiman2620ImageKey(base, equipment);
  return Boolean(TIMAN_2620_IMAGES[imageKey]?.imageSequence.length);
}

export function isTiman2620EquipmentSelectable(
  base: Timan2620Base,
  currentEquipment: ReadonlySet<Timan2620Equipment>,
  candidate: Timan2620Equipment,
): boolean {
  const next = new Set(currentEquipment);

  if (next.has(candidate)) {
    next.delete(candidate);
  } else {
    next.add(candidate);
  }

  if (base === 'standard') return true;

  return hasTiman2620ImageForSelection(base, next);
}

function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  if (items.length === size) return [items.slice()];

  const first = items[0] as T;
  const rest = items.slice(1);

  return [
    ...combinations(rest, size - 1).map((combo) => [first, ...combo]),
    ...combinations(rest, size),
  ];
}

export function getTiman2620NearestValidEquipment(
  base: Timan2620Base,
  equipment: ReadonlySet<Timan2620Equipment>,
): Set<Timan2620Equipment> {
  if (hasTiman2620ImageForSelection(base, equipment)) return new Set(equipment);

  const selectedInUiOrder = TIMAN_2620_EQUIPMENT_OPTIONS
    .map((option) => option.key)
    .filter((key) => equipment.has(key));

  for (let size = selectedInUiOrder.length - 1; size >= 0; size -= 1) {
    const match = combinations(selectedInUiOrder, size).find((combo) =>
      hasTiman2620ImageForSelection(base, new Set(combo)),
    );

    if (match) return new Set(match);
  }

  return new Set();
}
