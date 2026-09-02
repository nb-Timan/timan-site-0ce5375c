import { getAccessoriesFlat, getLocalizedName, getPrice, LOOSE_TOOL_KEY, PRODUCTS } from '@/data/machines';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import type { CrmLead } from '@/lib/crmLeadsService';
import type { Accessory, ConfiguratorState, Language } from '@/types/configurator';

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

function machineKeyFromText(value: string): string | null {
  const s = norm(value);
  if (s.includes('rc 751')) return 'RC-751';
  if (s.includes('rc 1000')) return 'RC-1000S';
  if (s.includes('2620')) return 'Timan 2620';
  if (s.includes('3330')) return 'Timan 3330';
  if (s.includes('loader') || s.includes('tractor') || s.includes('traktor')) return LOOSE_TOOL_KEY;
  return null;
}

function parseLeadField(text: string | null | undefined, label: string): string {
  const lines = String(text || '').split(/\r?\n/);
  const wanted = norm(label);
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    if (norm(line.slice(0, idx)) === wanted) return line.slice(idx + 1).trim();
  }
  return '';
}

function accessoryName(acc: Accessory): string {
  return typeof acc.name === 'string'
    ? acc.name
    : getLocalizedName(acc.name, 'da' as Language);
}

function findAccessory(machineKey: string, label: string): Accessory | null {
  const wanted = norm(label);
  if (!wanted) return null;
  const candidates = getAccessoriesFlat(machineKey).filter((acc) => !acc.isHeader && !acc.hidden);

  return candidates.find((acc) => norm(accessoryName(acc)) === wanted)
    || candidates.find((acc) => {
      const n = norm(accessoryName(acc));
      return wanted.length > 5 && (n.includes(wanted) || wanted.includes(n));
    })
    || null;
}

function extractItemNumber(value: string): string | null {
  const parenthesized = value.match(/\(([A-Z0-9][A-Z0-9._-]{2,})\)\s*$/i)?.[1];
  const direct = value.match(/\b([A-Z0-9][A-Z0-9._-]{2,})\b/i)?.[1];
  return (parenthesized || direct || '').trim() || null;
}

function findAccessoryByItemNumber(machineKey: string, itemNumber: string | null): Accessory | null {
  if (!itemNumber) return null;
  const wanted = itemNumber.trim().toLowerCase();
  return getAccessoriesFlat(machineKey)
    .filter((acc) => !acc.isHeader && !acc.hidden)
    .find((acc) => acc.varenr.trim().toLowerCase() === wanted || acc.id.trim().toLowerCase() === wanted)
    || null;
}

function addAccessoryWithParents(machineKey: string, ids: Set<string>, acc: Accessory) {
  ids.add(acc.id);
  const flat = getAccessoriesFlat(machineKey);
  let current: Accessory | undefined = acc;
  for (let i = 0; i < 8 && current; i++) {
    const parentId = (current as any).requires || (current as any).parentId;
    if (!parentId) break;
    ids.add(parentId);
    current = flat.find((item) => item.id === parentId);
  }
}

function parseEquipmentEntry(value: string): { machineKey: string | null; label: string } {
  const clean = value.replace(/^Equipment:\s*/i, '').trim();
  const parts = clean.split(/\s+[-–]\s+/);
  if (parts.length >= 2) {
    return {
      machineKey: machineKeyFromText(parts[0]),
      label: parts.slice(1).join(' - ').trim(),
    };
  }
  return { machineKey: machineKeyFromText(clean), label: clean };
}

const GROUP_ONLY_MACHINE_TYPES = new Set(['Equipment', 'Loader line / Tractor Equipment']);

export function calculateMachineInterestEstimate(
  machineTypes: string[] | null | undefined,
  language: Language = 'da',
): { total: number; unmappedItems: string[]; pricedItems: { label: string; price: number }[] } {
  const unmappedItems: string[] = [];
  const pricedItems: { label: string; price: number }[] = [];
  let total = 0;

  for (const item of machineTypes || []) {
    if (GROUP_ONLY_MACHINE_TYPES.has(item)) continue;

    const machineKey = machineKeyFromText(item);
    const isEquipment = /^Equipment:/i.test(item);

    if (machineKey && !isEquipment) {
      const product = PRODUCTS[machineKey];
      if (product) {
        const price = getPrice(product, language);
        total += price;
        pricedItems.push({ label: item, price });
      } else {
        unmappedItems.push(item);
      }
      continue;
    }

    if (isEquipment) {
      const parsed = parseEquipmentEntry(item);
      const itemNumber = extractItemNumber(parsed.label);
      const keysToTry = parsed.machineKey
        ? [parsed.machineKey]
        : ['RC-1000S', 'Timan 2620', 'Timan 3330', LOOSE_TOOL_KEY];
      let matched = false;

      for (const key of keysToTry) {
        const acc = findAccessoryByItemNumber(key, itemNumber) || findAccessory(key, parsed.label);
        if (!acc) continue;
        const price = getPrice(acc, language);
        total += price;
        pricedItems.push({ label: item, price });
        matched = true;
        break;
      }

      if (!matched) unmappedItems.push(item);
      continue;
    }

    unmappedItems.push(item);
  }

  return { total: Math.round(total), unmappedItems, pricedItems };
}

export function buildConfiguratorStateFromMachineTypes(
  machineTypes: string[] | null | undefined,
  previous: ConfiguratorState,
): { state: ConfiguratorState; unmappedItems: string[] } {
  const base = createEmptyConfiguratorState(previous.language, 'quote');
  const machineSet = new Set<string>();
  const accByMachine = new Map<string, Set<string>>();
  const unmappedItems: string[] = [];

  for (const item of machineTypes || []) {
    if (GROUP_ONLY_MACHINE_TYPES.has(item)) continue;
    const machineKey = machineKeyFromText(item);
    const isEquipment = /^Equipment:/i.test(item);
    let mapped = false;

    if (machineKey && !isEquipment) {
      machineSet.add(machineKey);
      mapped = true;
    }

    if (isEquipment) {
      const parsed = parseEquipmentEntry(item);
      const keysToTry = parsed.machineKey
        ? [parsed.machineKey]
        : ['RC-1000S', 'Timan 2620', 'Timan 3330', LOOSE_TOOL_KEY];

      for (const key of keysToTry) {
        const acc = findAccessory(key, parsed.label);
        if (!acc) continue;
        machineSet.add(key);
        const ids = accByMachine.get(key) || new Set<string>();
        addAccessoryWithParents(key, ids, acc);
        accByMachine.set(key, ids);
        mapped = true;
        break;
      }
    }

    if (!mapped) unmappedItems.push(item);
  }

  const orderedMachines = MACHINE_ORDER.filter((key) => machineSet.has(key) && PRODUCTS[key]);
  const machineConfigs = orderedMachines.map((type, index) => ({
    id: `lead-${index}`,
    type,
    qty: 1,
    configMode: 'shared' as const,
    acc: Array.from(accByMachine.get(type) || []),
  }));

  return {
    state: {
      ...base,
      language: previous.language,
      step: machineConfigs.length > 0 ? 2 : 1,
      flowType: 'quote',
      machineConfigs,
      currentMachineIndex: 0,
    },
    unmappedItems,
  };
}

export function buildConfiguratorStateFromLead(
  lead: CrmLead,
  previous: ConfiguratorState,
): ConfiguratorState {
  const { state } = buildConfiguratorStateFromMachineTypes(lead.machine_types, previous);
  const contactText = lead.contact_information || '';
  const noteText = [lead.notes, lead.trade_fair ? `Messe: ${lead.trade_fair}` : null]
    .filter(Boolean)
    .join('\n\n');

  return {
    ...state,
    firmanavn: parseLeadField(contactText, 'Firma/CVR'),
    kontaktperson: parseLeadField(contactText, 'Kontaktperson'),
    telefon: parseLeadField(contactText, 'Telefon'),
    email: parseLeadField(contactText, 'E-mail'),
    comment: noteText,
  };
}
