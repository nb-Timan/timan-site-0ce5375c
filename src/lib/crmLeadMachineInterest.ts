import {
  getAccessoriesFlat,
  getLocalizedName,
  LOOSE_TOOL_KEY,
  PRODUCTS,
} from '@/data/machines';
import type { Accessory, Language } from '@/types/configurator';

export type CrmLeadMachineInterestType = 'machine' | 'equipment';

export interface CrmLeadMachineInterestItem {
  id?: string;
  lead_id?: string;
  interest_type: CrmLeadMachineInterestType;
  machine_key: string;
  item_key: string;
  item_number: string;
  quantity: number;
}

const GROUP_ONLY_MACHINE_TYPES = new Set([
  'Equipment',
  'Full Line',
  'Loader line / Tractor Equipment',
]);

const MACHINE_ORDER = ['RC-751', 'RC-1000S', 'Timan 2620', 'Timan 3330', LOOSE_TOOL_KEY];

function norm(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/&oslash;/g, 'ø')
    .replace(/&aring;/g, 'å')
    .replace(/&aelig;/g, 'æ')
    .replace(/rc-1000s/g, 'rc-1000')
    .replace(/[^a-z0-9æøå]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function crmLeadMachineKeyFromText(value: string): string | null {
  const normalized = norm(value);
  if (normalized.includes('rc 751')) return 'RC-751';
  if (normalized.includes('rc 1000')) return 'RC-1000S';
  if (normalized.includes('2620')) return 'Timan 2620';
  if (normalized.includes('3330')) return 'Timan 3330';
  if (normalized.includes('loader') || normalized.includes('tractor') || normalized.includes('traktor')) {
    return LOOSE_TOOL_KEY;
  }
  return null;
}

function accessoryName(accessory: Accessory): string {
  return typeof accessory.name === 'string'
    ? accessory.name
    : getLocalizedName(accessory.name, 'da' as Language);
}

function extractItemNumber(value: string): string | null {
  const match = value.match(/\(([A-Z0-9][A-Z0-9._-]{2,})\)\s*$/i);
  return match?.[1]?.trim() || null;
}

function parseEquipmentEntry(value: string): { machineKey: string | null; label: string } {
  const clean = value.replace(/^Equipment:\s*/i, '').trim();
  const parts = clean.split(/\s+[-–]\s+/);
  if (parts.length >= 2) {
    return {
      machineKey: crmLeadMachineKeyFromText(parts[0]),
      label: parts.slice(1).join(' - ').trim(),
    };
  }
  return { machineKey: crmLeadMachineKeyFromText(clean), label: clean };
}

export function findCrmLeadInterestAccessory(machineKey: string, labelOrItemNumber: string): Accessory | null {
  const candidates = getAccessoriesFlat(machineKey).filter((accessory) => !accessory.isHeader && !accessory.hidden);
  const itemNumber = extractItemNumber(labelOrItemNumber);
  if (itemNumber) {
    const wantedNumber = itemNumber.toLowerCase();
    const byNumber = candidates.find((accessory) =>
      accessory.varenr.trim().toLowerCase() === wantedNumber
      || accessory.id.trim().toLowerCase() === wantedNumber);
    if (byNumber) return byNumber;
  }

  // CRM display values may include a translated catalogue section before the
  // actual product name. Match the most specific suffix first, then the full
  // value, without persisting or filtering by that visible section text.
  const wantedLabels = labelOrItemNumber
    .split(/\s+[-–]\s+/)
    .map((part) => norm(part))
    .filter(Boolean)
    .reverse();
  wantedLabels.push(norm(labelOrItemNumber));

  for (const wanted of Array.from(new Set(wantedLabels))) {
    const exact = candidates.find((accessory) => norm(accessoryName(accessory)) === wanted);
    if (exact) return exact;
    const partial = candidates.find((accessory) => {
      const candidate = norm(accessoryName(accessory));
      return wanted.length > 5 && (candidate.includes(wanted) || wanted.includes(candidate));
    });
    if (partial) return partial;
  }
  return null;
}

export function crmLeadInterestIdentity(item: Pick<CrmLeadMachineInterestItem, 'interest_type' | 'machine_key' | 'item_key'>): string {
  return `${item.interest_type}:${item.machine_key}:${item.item_key}`;
}

export function isPositiveIntegerQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

export function normalizePositiveIntegerQuantity(value: unknown, fallback = 1): number {
  const quantity = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return isPositiveIntegerQuantity(quantity) ? quantity : fallback;
}

export function canonicalCrmLeadInterestFromLegacyValue(value: string): Omit<CrmLeadMachineInterestItem, 'quantity'> | null {
  if (!value || GROUP_ONLY_MACHINE_TYPES.has(value)) return null;
  const isEquipment = /^Equipment:/i.test(value);
  const machineKey = crmLeadMachineKeyFromText(value);

  if (machineKey && !isEquipment && machineKey !== LOOSE_TOOL_KEY) {
    const product = PRODUCTS[machineKey];
    if (!product) return null;
    return {
      interest_type: 'machine',
      machine_key: machineKey,
      item_key: product.id,
      item_number: product.varenr,
    };
  }

  if (!isEquipment) return null;
  const parsed = parseEquipmentEntry(value);
  const keys = parsed.machineKey
    ? [parsed.machineKey]
    : ['RC-1000S', 'Timan 2620', 'Timan 3330', LOOSE_TOOL_KEY];
  for (const key of keys) {
    const accessory = findCrmLeadInterestAccessory(key, parsed.label);
    if (!accessory) continue;
    return {
      interest_type: 'equipment',
      machine_key: key,
      item_key: accessory.id,
      item_number: accessory.varenr,
    };
  }
  return null;
}

export function legacyCrmLeadMachineInterestItems(machineTypes: string[] | null | undefined): CrmLeadMachineInterestItem[] {
  const items = new Map<string, CrmLeadMachineInterestItem>();
  for (const value of machineTypes || []) {
    const canonical = canonicalCrmLeadInterestFromLegacyValue(value);
    if (!canonical) continue;
    const item = { ...canonical, quantity: 1 };
    items.set(crmLeadInterestIdentity(item), item);
  }
  return Array.from(items.values());
}

export function normalizeCrmLeadMachineInterestItems(
  machineTypes: string[] | null | undefined,
  stored: CrmLeadMachineInterestItem[] | null | undefined,
): CrmLeadMachineInterestItem[] {
  const normalized = new Map<string, CrmLeadMachineInterestItem>();
  for (const raw of stored || []) {
    const interestType = raw?.interest_type;
    const machineKey = String(raw?.machine_key || '').trim();
    const itemKey = String(raw?.item_key || '').trim();
    const itemNumber = String(raw?.item_number || '').trim();
    if ((interestType !== 'machine' && interestType !== 'equipment') || !machineKey || !itemKey || !itemNumber) continue;
    const quantity = normalizePositiveIntegerQuantity(raw.quantity);
    const item: CrmLeadMachineInterestItem = {
      ...(raw.id ? { id: raw.id } : {}),
      ...(raw.lead_id ? { lead_id: raw.lead_id } : {}),
      interest_type: interestType,
      machine_key: machineKey,
      item_key: itemKey,
      item_number: itemNumber,
      quantity,
    };
    normalized.set(crmLeadInterestIdentity(item), item);
  }

  // Legacy rows remain valid without a data rewrite. Canonical entries that
  // have not been saved with quantities yet are projected as quantity 1.
  for (const legacy of legacyCrmLeadMachineInterestItems(machineTypes)) {
    const key = crmLeadInterestIdentity(legacy);
    if (!normalized.has(key)) normalized.set(key, legacy);
  }

  return Array.from(normalized.values()).sort((a, b) => {
    const machineDelta = MACHINE_ORDER.indexOf(a.machine_key) - MACHINE_ORDER.indexOf(b.machine_key);
    if (machineDelta !== 0) return machineDelta;
    if (a.interest_type !== b.interest_type) return a.interest_type === 'machine' ? -1 : 1;
    return a.item_number.localeCompare(b.item_number, 'da');
  });
}

export function getCrmLeadInterestQuantity(
  items: CrmLeadMachineInterestItem[] | null | undefined,
  identity: Pick<CrmLeadMachineInterestItem, 'interest_type' | 'machine_key' | 'item_key'>,
): number {
  const key = crmLeadInterestIdentity(identity);
  return normalizePositiveIntegerQuantity(items?.find((item) => crmLeadInterestIdentity(item) === key)?.quantity);
}

export function setCrmLeadInterestQuantity(
  items: CrmLeadMachineInterestItem[],
  identity: Pick<CrmLeadMachineInterestItem, 'interest_type' | 'machine_key' | 'item_key'>,
  quantity: number,
): CrmLeadMachineInterestItem[] {
  if (!isPositiveIntegerQuantity(quantity)) return items;
  const key = crmLeadInterestIdentity(identity);
  return items.map((item) => crmLeadInterestIdentity(item) === key ? { ...item, quantity } : item);
}

export function machineQuantityForCrmLeadInterest(
  items: CrmLeadMachineInterestItem[] | null | undefined,
  machineKey: string,
): number {
  const machine = items?.find((item) => item.interest_type === 'machine' && item.machine_key === machineKey);
  return normalizePositiveIntegerQuantity(machine?.quantity);
}

export function formatCrmLeadMachineInterestSummary(
  machineTypes: string[] | null | undefined,
  items: CrmLeadMachineInterestItem[] | null | undefined,
): string {
  const normalized = normalizeCrmLeadMachineInterestItems(machineTypes, items);
  if (normalized.length === 0) return (machineTypes || []).join(', ');
  return normalized.map((item) => {
    const label = item.interest_type === 'machine'
      ? item.machine_key.replace('RC-1000S', 'RC-1000s')
      : item.item_number;
    return item.quantity > 1 ? `${label} ×${item.quantity}` : label;
  }).join(', ');
}

export function selectedMachineQuantityTotal(items: CrmLeadMachineInterestItem[] | null | undefined): number {
  return (items || [])
    .filter((item) => item.interest_type === 'machine')
    .reduce((total, item) => total + normalizePositiveIntegerQuantity(item.quantity), 0);
}
