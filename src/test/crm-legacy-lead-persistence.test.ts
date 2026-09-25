import { beforeEach, describe, expect, it, vi } from 'vitest';

const remoteRows = new Map<string, Record<string, unknown>>();
let failRemoteUpdate = false;

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      let patch: Record<string, unknown> = {};
      let targetId = '';
      let updating = false;
      const chain = {
        update: (next: Record<string, unknown>) => { patch = next; updating = true; return chain; },
        eq: (_field: string, id: string) => { targetId = id; return chain; },
        in: () => chain,
        or: async () => ({ data: [], error: null }),
        select: () => chain,
        maybeSingle: async () => {
          if (updating) {
            if (failRemoteUpdate) return { data: null, error: { message: 'RLS denied' } };
            remoteRows.set(targetId, { ...remoteRows.get(targetId), ...patch });
            return { data: { id: targetId }, error: null };
          }
          return { data: remoteRows.get(targetId) || null, error: null };
        },
      };
      return chain;
    },
  },
}));

import { getLead, type CrmLead, updateLead } from '@/lib/crmLeadsService';
import {
  buildStructuredContactInformation,
  getMissingStoredCrmLeadFields,
  parseStructuredContactInformation,
} from '@/lib/crmLeadValidation';

const G_ID = '05c2b5cf-1440-431c-bb35-b8519eb46e2a';

function legacyLead(): CrmLead {
  return {
    id: G_ID, lead_no: 5182, title: 'QA legacy G lead', owner_user_id: 'seller-1',
    owner_name: 'JTN', owner_email: 'jtn@example.test', linked_dealer_id: 'dealer-1',
    first_contact_date: '2026-09-01', expected_close_date: '2026-12-01',
    next_followup_date: '2026-10-01', machine_types: ['Timan 3330'],
    next_activity: 'Follow-up on leads', demo_has_run: 'no', contact_type: 'Phone',
    customer_type: 'Business', contact_information: 'Firma/CVR: Legacy customer\nOprindelig kontaktinfo:\nLegacy source text',
    trade_fair: null, country: 'Danmark', notes: 'Historical import marker', estimated_value: 100000,
    probability: 25, pipeline_stage: 'Lead', lost_competitor: null, lost_reason: null,
    lost_comment: null, attachments: [], status: 'open', move_to_working_qty: 0,
    incomplete_from_configurator: true, created_at: '2026-08-26T00:00:00.000Z',
    updated_at: '2026-08-26T00:00:00.000Z',
  };
}

const completeCustomer = {
  company: 'Legacy customer / CVR 123', contactPerson: 'QA contact', address: 'QA Street 1',
  postalCode: 'QA POSTAL', city: 'QA CITY', zipCity: '', phone: '+45 12 34 56 78',
  email: 'qa@example.test', country: 'Danmark',
};

describe('legacy G-lead canonical persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    remoteRows.clear();
    failRemoteUpdate = false;
    const lead = legacyLead();
    localStorage.setItem('timan.crm.leads.v1', JSON.stringify([lead]));
    remoteRows.set(G_ID, lead as unknown as Record<string, unknown>);
  });

  it('updates the same G record and preserves identity, ownership and dealer links', async () => {
    const contactInformation = buildStructuredContactInformation(completeCustomer);
    const saved = await updateLead(G_ID, {
      title: 'Completed QA legacy G lead',
      owner_user_id: 'seller-2',
      owner_name: 'QA Seller',
      owner_email: 'seller@example.test',
      linked_dealer_id: 'dealer-2',
      first_contact_date: '2026-09-10',
      expected_close_date: '2027-01-15',
      next_followup_date: '2026-10-15',
      next_activity: 'Follow-up after completed legacy data',
      contact_information: contactInformation,
      incomplete_from_configurator: false,
    }, { requireRemote: true });

    expect(saved).toMatchObject({
      id: G_ID,
      lead_no: 5182,
      title: 'Completed QA legacy G lead',
      owner_user_id: 'seller-2',
      linked_dealer_id: 'dealer-2',
      first_contact_date: '2026-09-10',
      expected_close_date: '2027-01-15',
      next_followup_date: '2026-10-15',
      next_activity: 'Follow-up after completed legacy data',
    });
    expect(remoteRows).toHaveLength(1);
    expect(remoteRows.get(G_ID)).toMatchObject({
      lead_no: 5182,
      owner_user_id: 'seller-2',
      linked_dealer_id: 'dealer-2',
      contact_information: contactInformation,
      incomplete_from_configurator: false,
    });
    expect(parseStructuredContactInformation(String(remoteRows.get(G_ID)?.contact_information), '')).toEqual(completeCustomer);
    expect(getMissingStoredCrmLeadFields(remoteRows.get(G_ID) || {})).toEqual([]);
  });

  it('prefers canonical remote edits over stale imported local G-lead data and refreshes the cache', async () => {
    const stale = legacyLead();
    const canonical = {
      ...stale,
      title: 'Canonical remote title',
      contact_information: buildStructuredContactInformation(completeCustomer),
      next_followup_date: '2026-11-20',
      next_activity: 'Canonical next activity',
      incomplete_from_configurator: false,
    };
    localStorage.setItem('timan.crm.leads.v1', JSON.stringify([{ ...stale, title: 'Stale imported title' }]));
    remoteRows.set(G_ID, canonical as unknown as Record<string, unknown>);

    const reopened = await getLead(G_ID);

    expect(reopened).toMatchObject({
      id: G_ID,
      lead_no: 5182,
      title: 'Canonical remote title',
      next_followup_date: '2026-11-20',
      next_activity: 'Canonical next activity',
    });
    expect(parseStructuredContactInformation(reopened?.contact_information, reopened?.country)).toEqual(completeCustomer);
    expect(JSON.parse(localStorage.getItem('timan.crm.leads.v1') || '[]')[0]).toMatchObject({
      id: G_ID,
      title: 'Canonical remote title',
    });
  });

  it('keeps the same remote-first persistence contract for modern L leads', async () => {
    const modern = { ...legacyLead(), id: '15c2b5cf-1440-431c-bb35-b8519eb46e2a', lead_no: 1115, title: 'Modern L lead' };
    localStorage.setItem('timan.crm.leads.v1', JSON.stringify([{ ...modern, title: 'Stale modern cache' }]));
    remoteRows.set(modern.id, modern as unknown as Record<string, unknown>);

    const reopened = await getLead(modern.id);

    expect(reopened).toMatchObject({ id: modern.id, lead_no: 1115, title: 'Modern L lead' });
    expect(remoteRows).toHaveLength(2);
  });

  it('does not wipe unrelated fields when one customer field changes', async () => {
    const initial = buildStructuredContactInformation(completeCustomer);
    const completeLead = { ...legacyLead(), contact_information: initial };
    localStorage.setItem('timan.crm.leads.v1', JSON.stringify([completeLead]));
    remoteRows.set(G_ID, completeLead as unknown as Record<string, unknown>);

    const next = { ...completeCustomer, phone: '+45 87 65 43 21' };
    await updateLead(G_ID, { contact_information: buildStructuredContactInformation(next) }, { requireRemote: true });

    expect(parseStructuredContactInformation(String(remoteRows.get(G_ID)?.contact_information), '')).toEqual(next);
    expect(remoteRows.get(G_ID)).toMatchObject({ owner_user_id: 'seller-1', linked_dealer_id: 'dealer-1' });
  });

  it('keeps a genuinely incomplete G lead marked with the exact missing field', () => {
    const contactInformation = buildStructuredContactInformation({ ...completeCustomer, email: '' });
    expect(getMissingStoredCrmLeadFields({ ...legacyLead(), contact_information: contactInformation }))
      .toEqual(['contactEmail']);
  });

  it('derives completeness from canonical normalized values instead of the legacy import flag', () => {
    const contactInformation = buildStructuredContactInformation(completeCustomer);
    expect(getMissingStoredCrmLeadFields({
      ...legacyLead(),
      contact_information: contactInformation,
      incomplete_from_configurator: true,
    })).toEqual([]);
  });

  it('rolls back local edits when confirmed remote persistence fails', async () => {
    failRemoteUpdate = true;
    const before = localStorage.getItem('timan.crm.leads.v1');

    await expect(updateLead(G_ID, {
      contact_information: buildStructuredContactInformation(completeCustomer),
    }, { requireRemote: true })).rejects.toMatchObject({ message: 'RLS denied' });

    expect(localStorage.getItem('timan.crm.leads.v1')).toBe(before);
  });
});
