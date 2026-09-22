import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildDemoDealerPeople } from '@/lib/crmDemoDealerPeople';

const portalUsers = [
  {
    id: 'user-dvp', email: 'dvp@example.test', display_name: 'Dag Vilster Petersen', full_name: null,
    initials: 'DVP', portal_role: 'dealer', role: 'dealer', dealer_number: '10458', approved: true, is_active: true,
  },
  {
    id: 'user-inactive', email: 'inactive@example.test', display_name: 'Inactive', full_name: null,
    initials: null, portal_role: 'dealer', role: 'dealer', dealer_number: '10458', approved: true, is_active: false,
  },
  {
    id: 'user-other', email: 'other@example.test', display_name: 'Other Dealer', full_name: null,
    initials: null, portal_role: 'dealer', role: 'dealer', dealer_number: '99999', approved: true, is_active: true,
  },
];

const contacts = [
  {
    id: 'contact-thomas', dealer_account_id: 'dealer-tiefel', contact_area: 'sales' as const,
    role_title: 'Salg', name: 'Thomas Tiefel', email: 'thomas@example.test', phone: null,
    is_primary: true, created_at: '', updated_at: '',
  },
  {
    id: 'contact-duplicate', dealer_account_id: 'dealer-tiefel', contact_area: 'sales' as const,
    role_title: null, name: 'Duplicate DVP', email: 'DVP@example.test', phone: null,
    is_primary: false, created_at: '', updated_at: '',
  },
  {
    id: 'contact-other', dealer_account_id: 'dealer-other', contact_area: 'sales' as const,
    role_title: null, name: 'Other Contact', email: 'contact-other@example.test', phone: null,
    is_primary: false, created_at: '', updated_at: '',
  },
];

describe('CRM demo dealer-person source', () => {
  it('merges canonical portal users and contacts for exactly one dealer', () => {
    const people = buildDemoDealerPeople('10458', 'dealer-tiefel', portalUsers, contacts);
    expect(people.map((person) => person.name)).toEqual(['Dag Vilster Petersen', 'Thomas Tiefel']);
    expect(people.find((person) => person.id === 'user-dvp')).toMatchObject({
      source: 'app_user', initials: 'DVP', role: 'dealer',
    });
  });

  it('hides inactive and unrelated people and deduplicates the same email', () => {
    const people = buildDemoDealerPeople('10458', 'dealer-tiefel', portalUsers, contacts);
    expect(people).toHaveLength(2);
    expect(people.some((person) => person.name === 'Inactive')).toBe(false);
    expect(people.some((person) => person.name === 'Other Dealer')).toBe(false);
    expect(people.some((person) => person.name === 'Other Contact')).toBe(false);
    expect(people.some((person) => person.name === 'Duplicate DVP')).toBe(false);
  });

  it('keeps the database wrapper invoker-scoped and validates the dealer relation', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260922093009_crm_demo_dealer_representative_reference.sql'), 'utf8');
    expect(sql).toContain('security invoker');
    expect(sql).toContain("message = 'DEALER_REP_OUTSIDE_DEALER'");
    expect(sql).toContain('dc.dealer_account_id = v_linked_dealer_id');
    expect(sql).toContain('da.id = v_linked_dealer_id');
    expect(sql).toContain('to authenticated');
    expect(sql).toContain('coalesce(v_snapshot, dealer_rep)');
  });

  it('keeps manual names as snapshots without creating a contact', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260922093009_crm_demo_dealer_representative_reference.sql'), 'utf8');
    expect(sql).not.toMatch(/insert\s+into\s+public\.dealer_contacts/i);
    expect(sql).toContain('dealer_rep_contact_id = v_contact_id');
    expect(sql).toContain('dealer_rep_user_id = v_user_id');
  });
});
