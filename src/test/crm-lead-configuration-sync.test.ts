import { describe, expect, it } from 'vitest';
import {
  buildLeadPatchFromConfigurationState,
  type CrmLeadConfigurationSyncRow,
} from '@/lib/crmLeadConfigurationSync';
import type { CrmLead } from '@/lib/crmLeadsService';
import type { ConfiguratorState } from '@/types/configurator';

function baseLead(): CrmLead {
  return {
    id: '72f270f4-cc62-422f-b67f-ad02c584c7fc',
    lead_no: 1014,
    title: 'ÖGA2026 Lead',
    owner_user_id: 'old-owner',
    owner_name: 'Old Owner',
    owner_email: 'old@example.com',
    linked_dealer_id: 'old-dealer',
    first_contact_date: '2026-09-01',
    expected_close_date: '2026-10-01',
    next_followup_date: '2026-09-10',
    machine_types: ['RC-1000S'],
    next_activity: 'Konfigurator-lead',
    demo_has_run: null,
    contact_type: null,
    customer_type: null,
    contact_information: 'Old contact',
    trade_fair: null,
    country: null,
    notes: 'Manual CRM note\n\n--- CONFIGURATOR SYNC START ---\nOld sync\n--- CONFIGURATOR SYNC END ---',
    estimated_value: 1000,
    probability: 25,
    pipeline_stage: 'Lead',
    lost_competitor: null,
    lost_reason: null,
    lost_comment: null,
    attachments: [],
    status: 'open',
    incomplete_from_configurator: true,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  };
}

const linkedQuoteRow: CrmLeadConfigurationSyncRow = {
  id: '925ae37c-2d1c-4435-8f6a-74b98011d68a',
  title: 'ÖGA2026 Lead - RC-1000S',
  state_json: null,
  total_price: 32584,
  lead_id: '72f270f4-cc62-422f-b67f-ad02c584c7fc',
  quote_number: 'T-4001',
  order_number: null,
  document_type: 'quote',
  case_type: 'quote',
  case_status: 'aktiv',
  status: 'aktiv',
  quote_sent_at: '2026-09-01T07:29:29.748Z',
  order_sent_at: null,
  submitted_at: null,
  last_saved_at: '2026-09-02T09:26:39.249Z',
  updated_at: '2026-09-02T09:26:39.249Z',
  created_at: '2026-09-01T07:00:00.000Z',
  dealer_account_id: '42c89ab9-72cb-4def-bb94-78e910bc74f5',
  dealer_account_number: '10570',
  dealer_number: '10570',
  dealer_name: 'Ad. Bachmann AG',
  dealer_company_name: 'Ad. Bachmann AG',
  assigned_seller_id: '9d6c31ba-5ec6-43aa-95ae-dbf241d6414a',
  seller_email: 'akr@timan.dk',
  seller_initials: 'AKR',
  seller_name: 'Alexander Kirschner',
};

const state: ConfiguratorState = {
  step: 4,
  flowType: 'quote',
  language: 'da',
  machineConfigs: [{ id: 'm0', type: 'RC-1000S', qty: 1, configMode: 'individual', acc: [] }],
  individualUnitConfigs: { m0_1: { acc: ['13101003', '410910'] } },
  ralCodes: {},
  accQty: {},
  date: '',
  deliveryMethod: '',
  deliveryDeliverStartup: null,
  manualDealerDiscountPct: 0,
  baseDiscountPct: 0.25,
  demoMachines: {},
  reqNumbers: {},
  currentMachineIndex: 0,
  firmanavn: 'ÖGA2026 Lead',
  kontaktperson: 'Roman Guichen',
  telefon: '+420 123 456',
  email: 'roman@example.com',
  emailRecipient: '',
  comment: '',
  internalNote: '',
  paymentTerms: 'net_30',
  customerNeeds: { tasks: [], focus: [] },
};

describe('CRM lead configurator sync', () => {
  it('builds a lead patch from configurator data while preserving CRM-only fields', () => {
    const patch = buildLeadPatchFromConfigurationState(
      baseLead(),
      linkedQuoteRow,
      state,
      '2026-09-02T12:00:00.000Z',
      linkedQuoteRow.assigned_seller_id,
    );

    expect(patch.title).toBe('ÖGA2026 Lead');
    expect(patch.linked_dealer_id).toBe('42c89ab9-72cb-4def-bb94-78e910bc74f5');
    expect(patch.owner_user_id).toBe('9d6c31ba-5ec6-43aa-95ae-dbf241d6414a');
    expect(patch.estimated_value).toBe(32584);
    expect(patch.machine_types).toContain('RC-1000S');
    expect(patch.machine_types?.some((value) => value.startsWith('Equipment: RC-1000S - '))).toBe(true);
    expect(patch.contact_information).toContain('Roman Guichen');
    expect(patch.notes).toContain('Manual CRM note');
    expect(patch.notes).toContain('Konfiguration: T-4001');
    expect(patch.notes).not.toContain('Old sync');
    expect(patch.incomplete_from_configurator).toBe(false);
    expect(patch).not.toHaveProperty('pipeline_stage');
    expect(patch).not.toHaveProperty('next_followup_date');
    expect(patch).not.toHaveProperty('next_activity');
    expect(patch).not.toHaveProperty('status');
  });
});

