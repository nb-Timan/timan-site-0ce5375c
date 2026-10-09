import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getAccessoriesFlat, LOOSE_TOOL_KEY } from '@/data/machines';
import { planningSelectedAttachments } from '@/lib/planningConfigurationItems';
import type { ConfiguratorState } from '@/types/configurator';

const MACHINE_KEYS = ['RC-751', 'RC-1000S', 'Timan 3330', 'Timan 2620', LOOSE_TOOL_KEY] as const;
const migration = readFileSync('supabase/migrations/20261004161934_planning_attachment_mapping.sql', 'utf8');

describe('Planning accessory catalogue', () => {
  it('keeps every selectable accessory ID mapped to its canonical item number on the server', () => {
    const mappings = MACHINE_KEYS.flatMap((machineKey) => getAccessoriesFlat(machineKey)
      .filter((item) => item.varenr && item.varenr !== 'HEADER')
      .map((item) => ({ machineKey, accessoryId: item.id, itemNumber: item.varenr,
        quantityInput: Boolean(item.isQtyInput) })));
    expect(mappings.length).toBeGreaterThan(100);
    expect(mappings.every((row) => row.accessoryId && row.itemNumber)).toBe(true);
    const sqlRows = [...migration.matchAll(/^ {2}\('([^']+)', '([^']+)', '([^']+)', (true|false)\)[,;]$/gm)]
      .map((match) => ({ machineKey: match[1], accessoryId: match[2],
        itemNumber: match[3], quantityInput: match[4] === 'true' }));
    expect(sqlRows).toHaveLength(mappings.length);
    expect(sqlRows).toEqual(mappings);
    expect(migration).toContain('public.planning_selected_accessory_quantity');
    expect(migration).not.toContain("split_part(a.value, '_', 1)");
    expect(migration).toContain('public.planning_can_view_configuration(p_configuration_id)');
    expect(migration).toContain('public.can_manage_planning()');
  });

  it('maps nontrivial 3330 and 2620 IDs and quantity inputs to item numbers', () => {
    const state = {
      machineConfigs: [
        { id: 'm0', type: 'Timan 3330', qty: 1, configMode: 'individual', acc: [] },
        { id: 'm1', type: 'Timan 2620', qty: 1, configMode: 'individual', acc: [] },
      ],
      individualUnitConfigs: {
        m0_1: { acc: ['LT_712900'] },
        m1_1: { acc: ['3000-01'] },
      },
      accQty: { 'm0_1_720121': 2 },
    } as unknown as ConfiguratorState;
    expect(planningSelectedAttachments(state)).toEqual(expect.arrayContaining([
      { itemNumber: '712900', quantity: 1 },
      { itemNumber: '744000', quantity: 1 },
      { itemNumber: '720121', quantity: 2 },
    ]));
  });
});
