import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/pages/crm/CrmLeadsPage.tsx', 'utf8');
const service = readFileSync('src/lib/crmLeadsService.ts', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20260925085932_crm_lead_owner_filtered_counters.sql',
  'utf8',
);

describe('CRM lead owner-filtered counters', () => {
  it('uses one owner-filtered cohort for summary cards and result rows', () => {
    expect(migration).toContain('owner_filtered_rows as');
    expect(migration).toContain("' from owner_filtered_rows ), option_rows as ('");
    expect(migration).toContain(
      "'), filtered_rows as ( select r.* from owner_filtered_rows r, args a where'",
    );
  });

  it('keeps the canonical owner filter in the existing scoped RPC call', () => {
    expect(service).toContain('p_owner_filter: opts.ownerFilter ?? null');
    expect(page).toContain('ownerFilter: isAdmin ? ownerFilter : null');
    expect(page).toContain("ownerFilter === 'other_timan_sellers'");
  });

  it('preserves owner and ordinary filters when selecting a status cohort', () => {
    const tabHandler = page.slice(
      page.indexOf('const selectLeadTab'),
      page.indexOf('useEffect(() =>', page.indexOf('const selectLeadTab')),
    );

    expect(tabHandler).toContain("if (nextTab === 'all')");
    expect(tabHandler).toContain('setTab(nextTab)');
    expect(tabHandler).toContain('setFollowupFilter(null)');
    expect(tabHandler).not.toContain("setOwnerFilter('')");
    expect(page.match(/onClick=\{\(\) => selectLeadTab\(t\.key\)\}/g)).toHaveLength(5);
  });

  it('makes All leads the canonical master reset', () => {
    const resetHandler = page.slice(
      page.indexOf('const resetAllLeadFilters'),
      page.indexOf('const selectLeadTab'),
    );

    expect(resetHandler).toContain("setTab('all')");
    expect(resetHandler).toContain('setFollowupFilter(null)');
    expect(resetHandler).toContain("setQ('')");
    expect(resetHandler).toContain("setTypeFilter('')");
    expect(resetHandler).toContain("setMachineFilter('')");
    expect(resetHandler).toContain("setEquipmentFilter('')");
    expect(resetHandler).toContain("setOwnerFilter('')");
    expect(resetHandler).toContain("setStage('')");
    expect(resetHandler).toContain("setSort('default')");
  });
});
