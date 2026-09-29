import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareCrmLeadExpectedClose } from '@/lib/crmLeadExpectedCloseSort';
import {
  defaultCrmLeadsNavigationState,
  parseCrmLeadsNavigationState,
  serializeCrmLeadsNavigationState,
} from '@/lib/crmLeadsNavigationState';

const leadsPage = readFileSync('src/pages/crm/CrmLeadsPage.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260928210451_crm_leads_expected_close_sort.sql', 'utf8');

describe('CRM Leads expected-close sorting', () => {
  const rows = [
    { id: 'latest', expected_close_date: '2026-11-27' },
    { id: 'missing', expected_close_date: null },
    { id: 'nearest', expected_close_date: '2026-10-04' },
    { id: 'middle-2', expected_close_date: '2026-11-05' },
    { id: 'middle-1', expected_close_date: '2026-10-18' },
  ];

  it('sorts the nearest expected close first and missing dates last', () => {
    expect([...rows].sort((a, b) => compareCrmLeadExpectedClose(a, b, 'asc')).map((row) => row.id))
      .toEqual(['nearest', 'middle-1', 'middle-2', 'latest', 'missing']);
  });

  it('sorts the latest expected close first and still keeps missing dates last', () => {
    expect([...rows].sort((a, b) => compareCrmLeadExpectedClose(a, b, 'desc')).map((row) => row.id))
      .toEqual(['latest', 'middle-2', 'middle-1', 'nearest', 'missing']);
  });

  it('round-trips expected-close sorting with every existing filter and owner scope', () => {
    const state = {
      ...defaultCrmLeadsNavigationState('open'),
      followupFilter: 'later' as const,
      q: 'Munich',
      typeFilter: 'demo' as const,
      machineFilter: 'Timan 3330',
      equipmentFilter: 'Weed brush',
      ownerFilter: 'seller:akr-user-id' as const,
      stage: 'Demo aftalt::50',
      sort: 'expected_close_asc' as const,
    };
    const params = serializeCrmLeadsNavigationState(new URLSearchParams(), state, { isAdmin: true });

    expect(parseCrmLeadsNavigationState(params, { isAdmin: true })).toEqual(state);
    expect(params.get('sort')).toBe('expected_close_asc');
  });

  it('selects the canonical expected-close sort when the existing two-month cohort is clicked', () => {
    expect(leadsPage).toContain("nextFilter === 'later' && !active ? { sort: 'expected_close_asc' as const } : {}");
    expect(leadsPage).toContain('<option value="expected_close_asc">');
    expect(leadsPage).toContain('Forventet luk: nærmest først');
  });

  it('sorts the complete server result before pagination with null dates last', () => {
    expect(migration).toContain("l.expected_close_date::text as expected_close_date");
    expect(migration).toContain("p_sort = ''expected_close_asc'' then expected_close_date end asc nulls last");
    expect(migration).toContain("p_sort = ''expected_close_desc'' then expected_close_date end desc nulls last");
    expect(migration).toContain("''expected_close_date'', expected_close_date");
  });

  it('does not alter the existing cohort predicates or counters', () => {
    expect(migration).not.toContain('followup_tone =');
    expect(migration).not.toContain('later_count');
    expect(migration).not.toContain('p_followup_filter is null');
  });
});
