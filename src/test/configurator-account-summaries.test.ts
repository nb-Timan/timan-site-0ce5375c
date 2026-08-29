import { describe, expect, it } from 'vitest';
import {
  buildAccountCaseLines,
  buildAccountCaseSummary,
  buildReorderDraft,
  filterAccountCases,
  type AccountCaseLike,
} from '@/lib/configuratorAccountSummaries';
import type { ConfiguratorState } from '@/types/configurator';

const baseState: ConfiguratorState = {
  step: 4,
  flowType: 'order',
  language: 'da',
  machineConfigs: [{ id: 'm0', type: 'RC-1000S', qty: 1, configMode: 'shared', acc: [] }],
  individualUnitConfigs: {},
  ralCodes: {},
  accQty: {},
  date: '2026-09-10',
  deliveryMethod: 'deliver',
  deliveryDeliverStartup: null,
  manualDealerDiscountPct: 0,
  demoMachines: {},
  reqNumbers: {},
  currentMachineIndex: 0,
  firmanavn: 'Test Kunde A/S',
  kontaktperson: 'Test Person',
  telefon: '12345678',
  email: 'kunde@example.com',
  emailRecipient: 'kunde@example.com',
  comment: 'Eksisterende kommentar',
  internalNote: 'Intern note',
};

function configuration(overrides: Partial<AccountCaseLike> = {}): AccountCaseLike {
  return {
    id: 'config-12345678',
    title: 'Test ordre',
    case_type: 'order',
    case_status: 'ordre_afgivet',
    state_json: baseState,
    created_at: '2026-08-20T10:00:00.000Z',
    created_case_at: '2026-08-20T10:00:00.000Z',
    submitted_at: '2026-08-21T10:00:00.000Z',
    last_saved_at: '2026-08-22T10:00:00.000Z',
    quote_number: 'Q-100',
    order_number: 'O-100',
    order_sent_at: '2026-08-21T10:00:00.000Z',
    seller_name: 'Birger Pedersen',
    seller_email: 'bp@timan.dk',
    dealer_number: '1000',
    dealer_name: 'Test Forhandler',
    ...overrides,
  };
}

describe('configurator account summaries', () => {
  it('builds an order summary from existing configuration data', () => {
    const summary = buildAccountCaseSummary(configuration(), 'da');

    expect(summary.reference).toBe('O-100');
    expect(summary.customerName).toBe('Test Kunde A/S');
    expect(summary.dealerName).toBe('Test Forhandler');
    expect(summary.sellerEmail).toBe('bp@timan.dk');
    expect(summary.deliveryDate).toBe('2026-09-10');
    expect(summary.totalPrice).toBeGreaterThan(0);
  });

  it('filters by status and search without fetching detail rows', () => {
    const items = [
      configuration(),
      configuration({ id: 'config-paused', case_status: 'pause', order_number: 'O-200', state_json: { ...baseState, firmanavn: 'Anden kunde' } }),
    ];

    expect(filterAccountCases(items, 'sent', '')).toHaveLength(1);
    expect(filterAccountCases(items, 'paused', '')).toHaveLength(1);
    expect(filterAccountCases(items, 'all', 'anden')).toHaveLength(1);
    expect(filterAccountCases(items, 'all', 'O-100')).toHaveLength(1);
  });

  it('creates a reorder draft as a new editable order flow', () => {
    const draft = buildReorderDraft(baseState);

    expect(draft.flowType).toBe('order');
    expect(draft.step).toBe(1);
    expect(draft.firmanavn).toBe('Test Kunde A/S');
    expect(draft.machineConfigs).toEqual(baseState.machineConfigs);
    expect(draft.internalNote).toBe('');
  });

  it('builds detail lines from the saved configurator state', () => {
    const lines = buildAccountCaseLines(baseState, 'da');

    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].itemNo).toBeTruthy();
    expect(lines[0].description).toBeTruthy();
    expect(lines[0].quantity).toBe(1);
    expect(lines[0].total).toBeGreaterThan(0);
  });
});
