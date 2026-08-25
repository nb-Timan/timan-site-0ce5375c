/**
 * Timan 2620 viewer data.
 *
 * The MESSE images are mapped directly from delivered filenames.
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

export interface Timan2620ImageConfig {
  key: string;
  base: Timan2620Base;
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
const STANDARD_BASE = `${BASE}/standard-config`;
const CABIN_BASE = `${BASE}/cab-config`;
const STANDARD_IMG = (name: string) => `${STANDARD_BASE}/${name}`;
const CABIN_IMG = (name: string) => `${CABIN_BASE}/${name}.png`;
const CABIN_JPG = (name: string) => `${CABIN_BASE}/${name}.jpg`;

function imageConfig(
  key: string,
  base: Timan2620Base,
  equipment: readonly Timan2620Equipment[],
  imageSequence: readonly string[],
  originalFileNames: readonly string[],
): Timan2620ImageConfig {
  return { key, base, equipment, imageSequence, originalFileNames };
}

export const TIMAN_2620_STANDARD_IMAGE_CONFIGS = [
  imageConfig(
    'standard',
    'standard',
    [],
    [STANDARD_IMG('a-standard.png'), STANDARD_IMG('v-standard-bagfra.png')],
    ['A-standard.png', 'V-standard-bagfra.png'],
  ),
  imageConfig(
    'standard_bucket',
    'standard',
    ['bucket'],
    [STANDARD_IMG('i-standard-skovl.png')],
    ['I-standard+skovl.png'],
  ),
  imageConfig(
    'standard_v_plow',
    'standard',
    ['v_plow'],
    [STANDARD_IMG('standard-v-plow.jpg')],
    ['1.png'],
  ),
  imageConfig(
    'standard_dozer_blade',
    'standard',
    ['dozer_blade'],
    [STANDARD_IMG('b-standard-dozerblad.jpg'), STANDARD_IMG('x-standard-bagfra-dozerblad.png')],
    ['B-standard+Dozerblad.JPG', 'X-standard-bagfra+dozerblad.png'],
  ),
  imageConfig(
    'standard_salt_spreader',
    'standard',
    ['salt_spreader'],
    [STANDARD_IMG('c-standard-saltspreder.jpg'), STANDARD_IMG('ae-standard-bagfra-saltspreder.png')],
    ['C-standard+Saltspreder.JPG', 'AE-standard-bagfra+saltspreder.png'],
  ),
  imageConfig(
    'standard_salt_spreader_dozer_blade',
    'standard',
    ['salt_spreader', 'dozer_blade'],
    [STANDARD_IMG('h-standard-dozerblad-saltspreder.jpg')],
    ['H-standard+dozerblad+saltspreder.JPG'],
  ),
] as const satisfies readonly Timan2620ImageConfig[];

export const TIMAN_2620_CABIN_IMAGE_CONFIGS = [
  imageConfig(
    'cab',
    'cab',
    [],
    [CABIN_IMG('a-kabine'), CABIN_IMG('v-kabine-bagfra')],
    ['A-Kabine.png', 'V-Kabine-bagfra.png'],
  ),
  imageConfig(
    'cab_bucket',
    'cab',
    ['bucket'],
    [CABIN_IMG('c-kabine-skovl')],
    ['C-Kabine+Skovl.png'],
  ),
  imageConfig(
    'cab_v_plow',
    'cab',
    ['v_plow'],
    [CABIN_JPG('cab-v-plow')],
    ['2.png'],
  ),
  imageConfig(
    'cab_dozer_blade',
    'cab',
    ['dozer_blade'],
    [CABIN_JPG('cab-dozer-blade')],
    ['3.png'],
  ),
  imageConfig(
    'cab_salt_spreader',
    'cab',
    ['salt_spreader'],
    [CABIN_IMG('h-kabine-saltspreder'), CABIN_IMG('ae-kabine-bagfra-saltspreder')],
    ['H-Kabine+Saltspreder.png', 'AE-Kabine-bagfra+Saltspreder.png'],
  ),
  imageConfig(
    'cab_salt_spreader_v_plow',
    'cab',
    ['salt_spreader', 'v_plow'],
    [CABIN_IMG('i-kabine-saltspreder-vplov'), CABIN_IMG('oe-kabine-bagfra-saltspreder-vplov')],
    ['I-Kabine+Saltspreder+Vplov.png', 'OE-Kabine-bagfra+Saltspreder+V-plov.png'],
  ),
  imageConfig(
    'cab_salt_spreader_dozer_blade',
    'cab',
    ['salt_spreader', 'dozer_blade'],
    [CABIN_IMG('j-kabine-saltspreder-dozerblad'), CABIN_IMG('aa-kabine-bagfra-saltspreder-dozerblad')],
    ['J-Kabine+Saltspreder+Dozer blad.png', 'AA-Kabine-bagfra+saltspreder+Dozer blad.png'],
  ),
] as const satisfies readonly Timan2620ImageConfig[];

export const TIMAN_2620_IMAGE_CONFIGS = [
  ...TIMAN_2620_STANDARD_IMAGE_CONFIGS,
  ...TIMAN_2620_CABIN_IMAGE_CONFIGS,
] as const satisfies readonly Timan2620ImageConfig[];

function equipmentSignature(equipment: Iterable<Timan2620Equipment>): string {
  return Array.from(equipment).sort().join('|');
}

const CONFIG_BY_BASE_AND_SIGNATURE = new Map(
  TIMAN_2620_IMAGE_CONFIGS.map((config) => [
    `${config.base}:${equipmentSignature(config.equipment)}`,
    config,
  ]),
);

export function getTiman2620ImageConfig(
  base: Timan2620Base,
  equipment: ReadonlySet<Timan2620Equipment>,
): Timan2620ImageConfig | null {
  return CONFIG_BY_BASE_AND_SIGNATURE.get(`${base}:${equipmentSignature(equipment)}`) ?? null;
}

export function getTiman2620CabinImageConfig(
  equipment: ReadonlySet<Timan2620Equipment>,
): Timan2620ImageConfig | null {
  return getTiman2620ImageConfig('cab', equipment);
}

export const TIMAN_2620_IMAGES: Record<string, Timan2620ImageEntry> = Object.fromEntries(
  TIMAN_2620_IMAGE_CONFIGS.map((config) => [
    config.key,
    { imageSequence: [...config.imageSequence], hotspots: [] },
  ]),
);

export function deriveTiman2620ImageKey(
  base: Timan2620Base,
  equipment: ReadonlySet<Timan2620Equipment>,
): string {
  return getTiman2620ImageConfig(base, equipment)?.key ?? `${base}_invalid`;
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
