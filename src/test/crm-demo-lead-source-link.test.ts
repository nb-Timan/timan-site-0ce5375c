import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture supabase calls so we can assert on the insert payload and
// the follow-up back-link update.
const insertCalls: { table: string; payload: any }[] = [];
const updateCalls: { table: string; patch: any; eqId: any }[] = [];

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      from(table: string) {
        return {
          insert(payload: any) {
            insertCalls.push({ table, payload });
            return {
              select: () => ({
                maybeSingle: async () => ({ data: { demo_no: 8123 }, error: null }),
              }),
            };
          },
          update(patch: any) {
            return {
              eq: async (_col: string, val: any) => {
                updateCalls.push({ table, patch, eqId: val });
                return { error: null };
              },
            };
          },
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      },
    },
  };
});

// Silence activity logger side-effects.
vi.mock('@/lib/crmActivitiesService', () => ({ logActivity: async () => {} }));

import { createDemoLead, type NewCrmDemoLead } from '@/lib/crmLeadsService';

const baseDemo: NewCrmDemoLead = {
  title: 'Demo X',
  owner_user_id: null, owner_name: null,
  dealer_company: null, dealer_rep: null,
  customer_name: null, customer_address: null, notes: null,
  machine_category: ['Timan machine'],
  demo_machine: 'RC-751',
  demo_equipment: ['T2'],
  demo_date: null, interest_level: 3,
  wants_offer: 'yes', followup_date: null,
  estimated_value: 12345, probability: 50,
  competitors_present: 'no', competitor_name: null,
  notes_after_demo: null, result_status: 'Warm lead',
  attachments: [],
};

beforeEach(() => {
  insertCalls.length = 0;
  updateCalls.length = 0;
  try { localStorage.clear(); } catch { /* */ }
});

describe('createDemoLead — Phase 38 lead↔demo link', () => {
  it('writes source_lead_id into crm_demo_leads when provided', async () => {
    await createDemoLead({ ...baseDemo, source_lead_id: 'lead-abc' });
    const ins = insertCalls.find(c => c.table === 'crm_demo_leads');
    expect(ins).toBeTruthy();
    expect(ins!.payload.source_lead_id).toBe('lead-abc');
    // estimated_value flows through (covers prefill mapping target).
    expect(ins!.payload.estimated_value).toBe(12345);
  });

  it('back-links the originating lead with converted_demo_lead_id', async () => {
    const demo = await createDemoLead({ ...baseDemo, source_lead_id: 'lead-abc' });
    const upd = updateCalls.find(c => c.table === 'crm_leads');
    expect(upd).toBeTruthy();
    expect(upd!.eqId).toBe('lead-abc');
    expect(upd!.patch.converted_demo_lead_id).toBe(demo.id);
  });

  it('standalone demo creation still works without source_lead_id', async () => {
    await createDemoLead({ ...baseDemo });
    const ins = insertCalls.find(c => c.table === 'crm_demo_leads');
    expect(ins).toBeTruthy();
    expect(ins!.payload.source_lead_id ?? null).toBeNull();
    // No back-link update should be issued.
    expect(updateCalls.find(c => c.table === 'crm_leads')).toBeUndefined();
  });
});
