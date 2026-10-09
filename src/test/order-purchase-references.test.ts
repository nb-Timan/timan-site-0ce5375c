import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import {
  machinePurchaseReference,
  orderPurchaseReferences,
  orderPurchaseReferenceSummary,
} from '@/lib/orderPurchaseReferences';

describe('submitted order requisition / PO presentation', () => {
  it('does not show the PO of a removed unit while preserving it in history', () => {
    const state = createEmptyConfiguratorState('da', 'order');
    state.machineConfigs = [{ id: 'm0', type: 'Loader Line', qty: 1, configMode: 'individual', acc: [] }];
    state.reqNumbers = { machine_1: 'PO-ONE', machine_2: 'PO-REMOVED' };
    expect(orderPurchaseReferenceSummary(state).headerValue).toBe('PO-ONE');
    expect(state.reqNumbers.machine_2).toBe('PO-REMOVED');
  });
  it('keeps an order with no PO empty', () => {
    const state = createEmptyConfiguratorState('da', 'order');

    expect(orderPurchaseReferences(state)).toEqual([]);
    expect(orderPurchaseReferenceSummary(state).headerValue).toBeNull();
  });

  it('uses a single legacy global PO when no machine PO exists', () => {
    const state = createEmptyConfiguratorState('da', 'order');
    state.purchaseOrderNumber = ' PO-7010 ';

    expect(orderPurchaseReferences(state)).toEqual(['PO-7010']);
    expect(orderPurchaseReferenceSummary(state)).toMatchObject({
      headerValue: 'PO-7010',
      hasMultiple: false,
    });
  });

  it('deduplicates repeated machine PO values in machine order', () => {
    const state = createEmptyConfiguratorState('da', 'order');
    state.purchaseOrderNumber = 'WRONG-GLOBAL-FALLBACK';
    state.reqNumbers = {
      machine_3: 'PO-C',
      machine_2: 'PO-A',
      machine_1: 'PO-A',
    };

    expect(orderPurchaseReferences(state)).toEqual(['PO-A', 'PO-C']);
    expect(orderPurchaseReferenceSummary(state)).toMatchObject({
      headerValue: 'Flere (2)',
      hasMultiple: true,
    });
    expect(machinePurchaseReference(state, 1)).toBe('PO-A');
    expect(machinePurchaseReference(state, 3)).toBe('PO-C');
  });

  it('makes only the unit-specific PO visible beside its relevant machine group', () => {
    const state = createEmptyConfiguratorState('da', 'order');
    state.reqNumbers = { machine_1: 'PO-ONE', machine_2: 'PO-TWO' };

    expect(machinePurchaseReference(state, 1)).toBe('PO-ONE');
    expect(machinePurchaseReference(state, 2)).toBe('PO-TWO');
    expect(machinePurchaseReference(state, 3)).toBeNull();
  });

  it('uses the frozen snapshot references in the overview, confirmation, PDF and revision history', () => {
    const overview = readFileSync('src/lib/crmConfigurationsService.ts', 'utf8');
    const confirmation = readFileSync('src/components/crm/ReadOnlyOrderConfirmationModal.tsx', 'utf8');
    const pdf = readFileSync('src/lib/configuratorPdf.ts', 'utf8');
    const revisions = readFileSync('src/components/crm/SubmittedOrderRevisionHistoryModal.tsx', 'utf8');

    expect(overview).toContain('orderPurchaseReferenceSummary');
    expect(overview).toContain('purchase_order_numbers: purchaseOrderNumbers');
    expect(confirmation).toContain('purchaseReferences.headerValue');
    expect(confirmation).toContain('group.purchaseReference');
    expect(pdf).toContain('orderPurchaseReferenceSummary(input.state)');
    expect(pdf).toContain('machinePurchaseReference(state, item.index)');
    expect(revisions).toContain('orderPurchaseReferenceSummary(normalizeConfiguratorState(state))');
  });
});
