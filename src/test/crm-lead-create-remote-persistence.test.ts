import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
  notifyLocalFallback: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mocks.from },
}));
vi.mock('@/lib/crmActivitiesService', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/persistenceWarning', () => ({ notifyLocalFallback: mocks.notifyLocalFallback }));

import { createLead, type NewCrmLead } from '@/lib/crmLeadsService';

const input = {
  title: 'QA remote persistence',
  owner_user_id: '62bcded5-562e-42fb-9a63-397af3e66572',
  owner_name: 'JTN',
  owner_email: 'jtn@timan.dk',
  linked_dealer_id: null,
  first_contact_date: '2026-10-05',
  expected_close_date: '2027-04-05',
  next_followup_date: '2026-10-12',
  machine_types: ['RC-751'],
  next_activity: 'Follow-up on leads',
  demo_has_run: 'no',
  contact_type: 'Phone',
  customer_type: 'Company',
  contact_information: 'Firma/CVR: QA TEST',
  trade_fair: null,
  country: 'Danmark',
  notes: null,
  estimated_value: 100,
  probability: 25,
  pipeline_stage: 'Lead',
  lost_competitor: null,
  lost_reason: null,
  lost_comment: null,
  attachments: [],
  status: 'open',
  move_to_working_qty: 0,
  incomplete_from_configurator: false,
} as NewCrmLead;

describe('CRM lead remote create contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    const chain = {
      insert: mocks.insert,
      select: mocks.select,
      maybeSingle: mocks.maybeSingle,
    };
    mocks.from.mockReturnValue(chain);
    mocks.insert.mockReturnValue(chain);
    mocks.select.mockReturnValue(chain);
  });

  it('removes the local draft and exposes the original remote error', async () => {
    const error = { code: '42501', message: 'RLS denied' };
    mocks.maybeSingle.mockResolvedValue({ data: null, error });

    await expect(createLead(input, { requireRemote: true })).rejects.toBe(error);

    expect(JSON.parse(localStorage.getItem('timan.crm.leads.v1') || '[]')).toEqual([]);
    expect(mocks.notifyLocalFallback).toHaveBeenCalledWith(expect.objectContaining({
      table: 'crm_leads',
      action: 'insert',
      error,
    }));
  });
});
