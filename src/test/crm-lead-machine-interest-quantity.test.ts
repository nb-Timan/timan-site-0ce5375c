import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import {
  buildCrmLeadMachineInterestItemsFromConfigurationState,
  buildCrmLeadMachineTypesFromConfigurationState,
} from '@/lib/crmLeadConfigurationSync';
import {
  canonicalCrmLeadInterestFromLegacyValue,
  crmLeadInterestIdentity,
  formatCrmLeadMachineInterestSummary,
  getCrmLeadInterestQuantity,
  isPositiveIntegerQuantity,
  legacyCrmLeadMachineInterestItems,
  machineQuantityForCrmLeadInterest,
  normalizeCrmLeadMachineInterestItems,
  selectedMachineQuantityTotal,
  setCrmLeadInterestQuantity,
  type CrmLeadMachineInterestItem,
} from '@/lib/crmLeadMachineInterest';
import { buildLeadWorkingContributions, type CrmLead } from '@/lib/crmLeadsService';
import { EQUIPMENT_BY_MACHINE } from '@/lib/crmBudgetService';
import { getLeadPipelineValue } from '@/lib/crmPipelineValue';
import {
  buildConfiguratorStateFromMachineTypes,
  calculateMachineInterestEstimate,
} from '@/lib/leadToConfiguratorDraft';

const machineValue = 'RC-1000s';
const equipmentValue = 'Equipment: RC-1000s - Slagleklipper inkl. Y-slagle sæt';
const groupedEquipmentValue = 'Equipment: Timan 3330 - Vinter redskaber - Centerdrevet fejemaskine med reversering, 120 cm, Ø550 mm børster';

function canonical(value: string, quantity: number): CrmLeadMachineInterestItem {
  const item = canonicalCrmLeadInterestFromLegacyValue(value);
  if (!item) throw new Error(`Missing canonical fixture for ${value}`);
  return { ...item, quantity };
}

function configuratorRoundTrip(machineQuantity: number, equipmentQuantity: number) {
  const values = [machineValue, equipmentValue];
  const items = [canonical(machineValue, machineQuantity), canonical(equipmentValue, equipmentQuantity)];
  const draft = buildConfiguratorStateFromMachineTypes(
    values,
    createEmptyConfiguratorState('da', 'quote'),
    items,
  ).state;
  return {
    draft,
    types: buildCrmLeadMachineTypesFromConfigurationState(draft),
    items: buildCrmLeadMachineInterestItemsFromConfigurationState(draft),
  };
}

describe('CRM lead machine-interest quantity', () => {
  it('maps supported machine aliases to one canonical machine identity', () => {
    expect(canonicalCrmLeadInterestFromLegacyValue('RC-1000')?.machine_key).toBe('RC-1000S');
    expect(canonicalCrmLeadInterestFromLegacyValue('RC-1000s')?.machine_key).toBe('RC-1000S');
    expect(canonicalCrmLeadInterestFromLegacyValue('New 2620')?.machine_key).toBe('Timan 2620');
  });

  it('defaults legacy machine and equipment interests to quantity 1', () => {
    expect(legacyCrmLeadMachineInterestItems([machineValue, equipmentValue]).map((item) => item.quantity))
      .toEqual([1, 1]);
  });

  it('normalizes invalid stored legacy quantities safely to 1', () => {
    expect(normalizeCrmLeadMachineInterestItems([machineValue], [
      { ...canonical(machineValue, 1), quantity: 0 },
    ])[0].quantity).toBe(1);
  });

  it('accepts only positive safe integers', () => {
    expect(isPositiveIntegerQuantity(27)).toBe(true);
    expect(isPositiveIntegerQuantity(0)).toBe(false);
    expect(isPositiveIntegerQuantity(-1)).toBe(false);
    expect(isPositiveIntegerQuantity(1.5)).toBe(false);
  });

  it('rejects zero and decimal quantity updates', () => {
    const item = canonical(machineValue, 27);
    expect(setCrmLeadInterestQuantity([item], item, 0)[0].quantity).toBe(27);
    expect(setCrmLeadInterestQuantity([item], item, 1.5)[0].quantity).toBe(27);
  });

  it('keeps machine and equipment quantities independent', () => {
    const machine = canonical(machineValue, 27);
    const equipment = canonical(equipmentValue, 27);
    const changed = setCrmLeadInterestQuantity([machine, equipment], equipment, 10);
    expect(machineQuantityForCrmLeadInterest(changed, 'RC-1000S')).toBe(27);
    expect(getCrmLeadInterestQuantity(changed, equipment)).toBe(10);
  });

  it('resolves grouped equipment labels to canonical catalogue IDs', () => {
    const item = canonicalCrmLeadInterestFromLegacyValue(groupedEquipmentValue);
    expect(item).toMatchObject({ interest_type: 'equipment', machine_key: 'Timan 3330' });
    expect(item?.item_number).toBeTruthy();
  });

  it('deduplicates aliases without creating duplicate language identities', () => {
    const normalized = normalizeCrmLeadMachineInterestItems(['RC-1000', 'RC-1000s'], []);
    expect(normalized).toHaveLength(1);
  });

  it('formats the lead overview compactly with xN', () => {
    expect(formatCrmLeadMachineInterestSummary(
      [machineValue, equipmentValue],
      [canonical(machineValue, 27), canonical(equipmentValue, 10)],
    )).toContain('RC-1000s ×27');
  });

  it('counts only base machines in the machine total', () => {
    expect(selectedMachineQuantityTotal([
      canonical(machineValue, 27),
      canonical(equipmentValue, 10),
    ])).toBe(27);
  });

  it('multiplies current machine unit price by machine quantity', () => {
    const single = calculateMachineInterestEstimate([machineValue], 'da').total;
    const bulk = calculateMachineInterestEstimate([machineValue], 'da', [canonical(machineValue, 27)]).total;
    expect(bulk).toBe(single * 27);
  });

  it('multiplies current equipment unit price by its independent quantity', () => {
    const single = calculateMachineInterestEstimate([equipmentValue], 'da').total;
    const bulk = calculateMachineInterestEstimate([equipmentValue], 'da', [canonical(equipmentValue, 10)]).total;
    expect(bulk).toBe(single * 10);
  });

  it('uses quantity-aware current catalogue value in the CRM pipeline', () => {
    const items = [canonical(machineValue, 27), canonical(equipmentValue, 10)];
    const estimate = calculateMachineInterestEstimate([machineValue, equipmentValue], 'da', items).total;
    expect(getLeadPipelineValue({ estimated_value: null, machine_types: [machineValue, equipmentValue], machine_interest_items: items }))
      .toBe(estimate);
  });

  it('opens 27 selected machines as quantity 27 in Configurator', () => {
    const { draft } = configuratorRoundTrip(27, 27);
    expect(draft.machineConfigs[0]).toMatchObject({ type: 'RC-1000S', qty: 27, configMode: 'shared' });
  });

  it('preserves one-per-machine equipment through a Configurator round trip', () => {
    const roundTrip = configuratorRoundTrip(27, 27);
    const equipment = roundTrip.items.find((item) => item.interest_type === 'equipment');
    expect(equipment?.quantity).toBe(27);
  });

  it('preserves an independent equipment quantity through a Configurator round trip', () => {
    const roundTrip = configuratorRoundTrip(27, 10);
    const equipment = roundTrip.items.find((item) => item.interest_type === 'equipment');
    expect(roundTrip.draft.machineConfigs[0].configMode).toBe('individual');
    expect(equipment?.quantity).toBe(10);
  });

  it('does not create a fake base-machine row for loader and tractor equipment', () => {
    const state = createEmptyConfiguratorState('da', 'quote');
    state.machineConfigs = [{ id: 'tools', type: 'LOOSE_TOOL', qty: 1, configMode: 'shared', acc: ['LT3330_730600_3330'] }];
    const items = buildCrmLeadMachineInterestItemsFromConfigurationState(state);
    expect(items.some((item) => item.interest_type === 'machine')).toBe(false);
    expect(items.some((item) => item.interest_type === 'equipment')).toBe(true);
  });

  it('uses base-machine quantity in working Budget and keeps equipment separate', () => {
    const interestItems = [canonical(machineValue, 27), canonical(equipmentValue, 10)];
    const lead = {
      id: 'qa-quantity', lead_no: 1200, title: 'QA quantity', move_to_working_qty: 1,
      expected_close_date: '2027-01-15', machine_types: [machineValue, equipmentValue],
      machine_interest_items: interestItems, owner_user_id: null, owner_email: 'qa@timan.dk', owner_name: 'QA',
      linked_dealer_id: null, contact_information: null,
    } as unknown as CrmLead;
    const rows = buildLeadWorkingContributions([lead]);
    const equipmentKey = EQUIPMENT_BY_MACHINE['RC-1000s']
      .find((item) => item.varenr === '410910')?.key;
    expect(rows.find((row) => row.product_key === 'RC-1000s')?.qty).toBe(27);
    expect(equipmentKey).toBeTruthy();
    expect(rows.find((row) => row.product_key === equipmentKey)?.qty).toBe(10);
  });

  it('uses the expected close month for every quantity-bearing Budget line', () => {
    const lead = {
      id: 'qa-month', lead_no: 1201, title: 'QA month', move_to_working_qty: 1,
      expected_close_date: '2027-01-15', machine_types: [machineValue],
      machine_interest_items: [canonical(machineValue, 27)], owner_user_id: null,
      owner_email: 'qa@timan.dk', owner_name: 'QA', linked_dealer_id: null, contact_information: null,
    } as unknown as CrmLead;
    expect(buildLeadWorkingContributions([lead])[0]).toMatchObject({ qty: 27, year: 2026, month_idx: 0 });
  });

  it('keeps legacy imports on quantity 1 even when the old working toggle is nonzero', () => {
    const lead = {
      id: 'legacy', lead_no: 1202, title: 'Legacy', move_to_working_qty: 9,
      expected_close_date: '2027-01-15', machine_types: [machineValue], owner_user_id: null,
      owner_email: 'qa@timan.dk', owner_name: 'QA', linked_dealer_id: null, contact_information: null,
    } as unknown as CrmLead;
    expect(buildLeadWorkingContributions([lead])[0].qty).toBe(1);
  });

  it('defines relational quantity storage, positive checks and server-side write scope', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261005204640_crm_lead_machine_interest_quantities.sql'), 'utf8');
    expect(sql).toContain('create table if not exists public.crm_lead_machine_interests');
    expect(sql).toContain("interest_type in ('machine', 'equipment')");
    expect(sql).toContain('quantity integer not null default 1 check (quantity >= 1)');
    expect(sql).toContain('unique (lead_id, interest_type, machine_key, item_key)');
    expect(sql).toContain('security definer');
    expect(sql).toContain("coalesce(actor.portal_role::text, actor.role) = 'timan_seller'");
    expect(sql).toContain("(item ->> 'quantity') !~ '^[1-9][0-9]*$'");
    expect(sql).toContain('revoke insert, update, delete on table public.crm_lead_machine_interests from authenticated');
  });

  it('produces stable canonical identities for persistence and reopen', () => {
    const first = normalizeCrmLeadMachineInterestItems([machineValue], [canonical(machineValue, 27)]);
    const reopened = normalizeCrmLeadMachineInterestItems([machineValue], JSON.parse(JSON.stringify(first)));
    expect(reopened.map(crmLeadInterestIdentity)).toEqual(first.map(crmLeadInterestIdentity));
    expect(reopened[0].quantity).toBe(27);
  });
});
