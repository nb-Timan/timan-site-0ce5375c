import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareCrmLeadExpectedClose } from '@/lib/crmLeadExpectedCloseSort';
import { addMonthsToIsoDate, isExpectedCloseWithinTwoCalendarMonths } from '@/lib/crmLeadExpectedClose';
import {
  defaultCrmLeadsNavigationState,
  parseCrmLeadsNavigationState,
  serializeCrmLeadsNavigationState,
} from '@/lib/crmLeadsNavigationState';

const leadsPage = readFileSync('src/pages/crm/CrmLeadsPage.tsx', 'utf8');
const expectedCloseSortMigration = readFileSync('supabase/migrations/20260928210451_crm_leads_expected_close_sort.sql', 'utf8');
const migration = readFileSync('supabase/migrations/20260929225058_crm_leads_expected_close_two_month_filter.sql', 'utf8');

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

  it('uses an inclusive two-calendar-month window and excludes past, null and later dates', () => {
    const today = '2026-09-29';
    expect(isExpectedCloseWithinTwoCalendarMonths('2026-09-29', today)).toBe(true);
    expect(isExpectedCloseWithinTwoCalendarMonths('2026-10-15', today)).toBe(true);
    expect(isExpectedCloseWithinTwoCalendarMonths('2026-11-29', today)).toBe(true);
    expect(isExpectedCloseWithinTwoCalendarMonths('2026-09-28', today)).toBe(false);
    expect(isExpectedCloseWithinTwoCalendarMonths('2026-11-30', today)).toBe(false);
    expect(isExpectedCloseWithinTwoCalendarMonths(null, today)).toBe(false);
  });

  it('clamps the exact calendar-month boundary at month end', () => {
    expect(addMonthsToIsoDate('2026-12-31', 2)).toBe('2027-02-28');
    expect(isExpectedCloseWithinTwoCalendarMonths('2027-02-28', '2026-12-31')).toBe(true);
    expect(isExpectedCloseWithinTwoCalendarMonths('2027-03-01', '2026-12-31')).toBe(false);
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
    expect(leadsPage).toContain('Inden for 2 måneder');
    expect(leadsPage).toContain('Forventet luk: tidligst til senest');
    expect(leadsPage).not.toContain('Inden 20 dage');
    expect(leadsPage).not.toContain('Forventet luk: senest først');
    expect(leadsPage).not.toContain('<option value="expected_close_desc">');
  });

  it('uses the canonical expected-close field for matching counts, filtering and ascending sort', () => {
    expect(migration).toContain('r.expected_close_date is not null');
    expect(migration).toContain('r.expected_close_date::date >=');
    expect(migration).toContain('r.expected_close_date::date <=');
    expect(migration).toContain("p_followup_filter = ''later'' and r.expected_close_in_two_months");
    expect(migration).toContain("tab_bucket = ''open'' and expected_close_in_two_months");
    expect(expectedCloseSortMigration).toContain("p_sort = ''expected_close_asc'' then expected_close_date end asc nulls last");
    expect(migration).toContain("definition := replace(definition, old_desc_sort, '')");
  });

  it('keeps overdue follow-up independent while the two-month filter combines through the existing query', () => {
    expect(migration).toContain("p_followup_filter = ''overdue'' and r.followup_tone = ''overdue''");
    expect(migration).toContain('definition := replace(definition, old_filter, new_filter)');
    expect(leadsPage).toContain('typeFilter,');
    expect(leadsPage).toContain('machineFilter,');
    expect(leadsPage).toContain('equipmentFilter,');
    expect(leadsPage).toContain('stage,');
    expect(leadsPage).toContain('search: q');
  });
});
