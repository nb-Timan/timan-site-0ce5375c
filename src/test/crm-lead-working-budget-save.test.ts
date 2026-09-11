import { beforeEach, describe, expect, it, vi } from 'vitest';

const updates: Array<Record<string, unknown>> = [];
let failRemoteUpdate = false;

vi.mock('@/lib/supabase', () => {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  Object.assign(chain, {
    update: (payload: unknown) => {
      updates.push(payload as Record<string, unknown>);
      return chain;
    },
    eq: () => chain,
    select: () => chain,
    maybeSingle: () => Promise.resolve(
      failRemoteUpdate
        ? { data: null, error: { message: 'RLS denied' } }
        : { data: { id: 'legacy-lead', move_to_working_qty: updates[updates.length - 1]?.move_to_working_qty }, error: null },
    ),
  });

  return {
    supabase: { from: () => chain },
  };
});

import { type CrmLead, updateLead } from '@/lib/crmLeadsService';

function legacyLead(): CrmLead {
  return {
    id: 'legacy-lead',
    lead_no: 1023,
    title: 'Legacy lead',
    owner_user_id: 'seller-1',
    owner_name: 'AKR',
    linked_dealer_id: 'dealer-1',
    first_contact_date: '2026-09-01',
    expected_close_date: '2026-10-09',
    next_followup_date: '2026-09-16',
    machine_types: ['RC-1000s'],
    next_activity: 'Follow-up on leads',
    demo_has_run: 'no',
    contact_type: 'Email',
    customer_type: 'Business',
    contact_information: null,
    trade_fair: null,
    country: null,
    notes: null,
    estimated_value: 42200,
    probability: 70,
    pipeline_stage: 'Lead',
    lost_competitor: null,
    lost_reason: null,
    lost_comment: null,
    attachments: [],
    status: 'open',
    move_to_working_qty: 0,
    incomplete_from_configurator: false,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  };
}

describe('legacy lead working-budget remote save', () => {
  beforeEach(() => {
    localStorage.clear();
    updates.length = 0;
    failRemoteUpdate = false;
    localStorage.setItem('timan.crm.leads.v1', JSON.stringify([legacyLead()]));
  });

  it('sends only move_to_working_qty to Supabase', async () => {
    await updateLead(
      'legacy-lead',
      { move_to_working_qty: 1 },
      { requireRemote: true, remoteOnly: 'move_to_working_qty' },
    );

    expect(updates).toEqual([{ move_to_working_qty: 1 }]);
    const saved = JSON.parse(localStorage.getItem('timan.crm.leads.v1') || '[]') as CrmLead[];
    expect(saved[0]).toMatchObject({
      id: 'legacy-lead',
      contact_information: null,
      country: null,
      move_to_working_qty: 1,
    });
  });

  it('rolls back the local flag when the confirmed remote update fails', async () => {
    failRemoteUpdate = true;

    await expect(updateLead(
      'legacy-lead',
      { move_to_working_qty: 1 },
      { requireRemote: true, remoteOnly: 'move_to_working_qty' },
    )).rejects.toMatchObject({ message: 'RLS denied' });

    const saved = JSON.parse(localStorage.getItem('timan.crm.leads.v1') || '[]') as CrmLead[];
    expect(saved[0]?.move_to_working_qty).toBe(0);
  });
});
