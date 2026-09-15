import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/pages/crm/CrmLeadsPage.tsx', 'utf8');

describe('CRM leads mobile status grid', () => {
  it('keeps the mobile-only three-column grid separate from the existing tablet and desktop toolbar', () => {
    expect(page).toContain('data-testid="crm-leads-mobile-status-grid"');
    expect(page).toContain('grid grid-cols-3 gap-2 md:hidden');
    expect(page).toContain('hidden flex-col gap-2 md:flex xl:flex-row');
  });

  it('uses the established filter state in the required mobile priority order', () => {
    const mobileGrid = page.slice(
      page.indexOf('data-testid="crm-leads-mobile-status-grid"'),
      page.indexOf('{/* Desktop and tablet toolbar. */}'),
    );

    expect(mobileGrid).toContain("TABS.filter((t) => t.key === 'open')");
    expect(mobileGrid).toContain('[...FOLLOWUP_FILTERS].reverse()');
    expect(page).toContain("const MOBILE_RESULT_TABS: TabKey[] = ['all', 'won', 'closed'];");
    expect(mobileGrid).toContain('MOBILE_RESULT_TABS.map');
    expect(mobileGrid).toContain("setTab('open')");
    expect(mobileGrid).toContain('setFollowupFilter(active ? null : item.key)');
  });

  it('preserves the canonical new lead and demo routes', () => {
    const mobileGrid = page.slice(
      page.indexOf('data-testid="crm-leads-mobile-status-grid"'),
      page.indexOf('{/* Desktop and tablet toolbar. */}'),
    );

    expect(mobileGrid).toContain('to="/portal/crm/leads/new"');
    expect(mobileGrid).toContain('to="/portal/crm/demo-leads/new"');
  });
});
