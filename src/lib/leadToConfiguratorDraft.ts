import { getAccessoriesFlat, getLocalizedName, getPrice, LOOSE_TOOL_KEY, PRODUCTS } from '@/data/machines';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import type { CrmLead } from '@/lib/crmLeadsService';
import { readCrmLeadStructuredContact } from '@/lib/crmLeadValidation';
import {
  canonicalCrmLeadInterestFromLegacyValue,
  crmLeadInterestIdentity,
  normalizeCrmLeadMachineInterestItems,
  type CrmLeadMachineInterestItem,
} from '@/lib/crmLeadMachineInterest';
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
    const relation = current as Accessory & { requires?: string; parentId?: string };
    const parentId = relation.requires || relation.parentId;
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
  interestItems?: CrmLeadMachineInterestItem[] | null,
): { total: number; unmappedItems: string[]; pricedItems: { label: string; price: number; quantity: number; total: number }[] } {
  const unmappedItems: string[] = [];
  const pricedItems: { label: string; price: number; quantity: number; total: number }[] = [];
  let total = 0;
  const quantities = new Map(
    normalizeCrmLeadMachineInterestItems(machineTypes, interestItems)
      .map((item) => [crmLeadInterestIdentity(item), item.quantity] as const),
  );

  const quantityFor = (value: string) => {
    const canonical = canonicalCrmLeadInterestFromLegacyValue(value);
    return canonical ? quantities.get(crmLeadInterestIdentity(canonical)) || 1 : 1;
  };

  for (const item of machineTypes || []) {
    if (GROUP_ONLY_MACHINE_TYPES.has(item)) continue;

    const machineKey = machineKeyFromText(item);
    const isEquipment = /^Equipment:/i.test(item);

    if (machineKey && !isEquipment) {
      const product = PRODUCTS[machineKey];
      if (product) {
        const price = getPrice(product, language);
        const quantity = quantityFor(item);
        total += price * quantity;
        pricedItems.push({ label: item, price, quantity, total: price * quantity });
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
        const quantity = quantityFor(item);
        total += price * quantity;
        pricedItems.push({ label: item, price, quantity, total: price * quantity });
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
  interestItems?: CrmLeadMachineInterestItem[] | null,
): { state: ConfiguratorState; unmappedItems: string[] } {
  const base = createEmptyConfiguratorState(previous.language, 'quote');
  const machineSet = new Set<string>();
  const accByMachine = new Map<string, Set<string>>();
  const unmappedItems: string[] = [];
  const normalizedItems = normalizeCrmLeadMachineInterestItems(machineTypes, interestItems);

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

  for (const item of normalizedItems) {
    machineSet.add(item.machine_key);
    if (item.interest_type !== 'equipment') continue;
    const accessory = findAccessoryByItemNumber(item.machine_key, item.item_number)
      || getAccessoriesFlat(item.machine_key).find((candidate) => candidate.id === item.item_key)
      || null;
    if (!accessory) continue;
    const ids = accByMachine.get(item.machine_key) || new Set<string>();
    addAccessoryWithParents(item.machine_key, ids, accessory);
    accByMachine.set(item.machine_key, ids);
  }

  const orderedMachines = MACHINE_ORDER.filter((key) => machineSet.has(key) && PRODUCTS[key]);
  const individualUnitConfigs: ConfiguratorState['individualUnitConfigs'] = {};
  const accQty: ConfiguratorState['accQty'] = {};
  const machineConfigs = orderedMachines.map((type, index) => {
    const id = `lead-${index}`;
    const machineItem = normalizedItems.find((item) => item.interest_type === 'machine' && item.machine_key === type);
    const quantity = type === LOOSE_TOOL_KEY ? 1 : (machineItem?.quantity || 1);
    const equipment = normalizedItems.filter((item) => item.interest_type === 'equipment' && item.machine_key === type);
    const exactOnePerMachine = type !== LOOSE_TOOL_KEY
      && equipment.every((item) => item.quantity === quantity);

    if (exactOnePerMachine) {
      return {
        id,
        type,
        qty: quantity,
        configMode: 'shared' as const,
        acc: Array.from(accByMachine.get(type) || []),
      };
    }

    if (type === LOOSE_TOOL_KEY) {
      for (const item of equipment) {
        if (item.quantity > 1) accQty[`${id}_${item.item_key}`] = item.quantity;
      }
      return {
        id,
        type,
        qty: 1,
        configMode: 'shared' as const,
        acc: Array.from(accByMachine.get(type) || []),
      };
    }

    for (let unit = 1; unit <= quantity; unit += 1) {
      const configKey = `${id}_${unit}`;
      const selected = new Set<string>();
      for (const item of equipment) {
        const baseQuantity = Math.floor(item.quantity / quantity);
        const remainder = item.quantity % quantity;
        const unitQuantity = baseQuantity + (unit <= remainder ? 1 : 0);
        if (unitQuantity <= 0) continue;
        const accessory = findAccessoryByItemNumber(type, item.item_number)
          || getAccessoriesFlat(type).find((candidate) => candidate.id === item.item_key);
        if (!accessory) continue;
        addAccessoryWithParents(type, selected, accessory);
        if (unitQuantity > 1) accQty[`${configKey}_${accessory.id}`] = unitQuantity;
      }
      individualUnitConfigs[configKey] = { acc: Array.from(selected) };
    }

    return {
      id,
      type,
      qty: quantity,
      configMode: 'individual' as const,
      acc: [],
    };
  });

  return {
    state: {
      ...base,
      language: previous.language,
      step: machineConfigs.length > 0 ? 2 : 1,
      flowType: 'quote',
      machineConfigs,
      individualUnitConfigs,
      accQty,
      currentMachineIndex: 0,
    },
    unmappedItems,
  };
}

export function buildConfiguratorStateFromLead(
  lead: CrmLead,
  previous: ConfiguratorState,
): ConfiguratorState {
  const { state } = buildConfiguratorStateFromMachineTypes(
    lead.machine_types,
    previous,
    lead.machine_interest_items,
  );
  const contact = readCrmLeadStructuredContact(lead);
  const noteText = [lead.notes, lead.trade_fair ? `Messe: ${lead.trade_fair}` : null]
    .filter(Boolean)
    .join('\n\n');

  return {
    ...state,
    firmanavn: contact.company,
    kontaktperson: contact.contactPerson,
    telefon: contact.phone,
    email: contact.email,
    emailRecipient: contact.email,
    address: contact.address,
    postalCode: contact.postalCode,
    city: contact.city,
    country: contact.country || state.country,
    comment: noteText,
  };
}
