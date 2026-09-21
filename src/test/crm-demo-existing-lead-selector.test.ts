import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveScope: vi.fn(),
  listShared: vi.fn(),
  buildJournalScope: vi.fn(),
}));

vi.mock('@/lib/resolveSellerId', () => ({
  resolveEffectiveCrmSellerScope: mocks.resolveScope,
}));
vi.mock('@/lib/crmLeadSharingService', () => ({
  listSharedLeadIdsForUser: mocks.listShared,
}));
vi.mock('@/lib/machineJournalScope', () => ({
  buildJournalScope: mocks.buildJournalScope,
}));

import { listSelectableDemoLeads } from '@/lib/crmDemoLeadSelector';

function pageRows() {
  return {
    rows: [
      {
        id: 'lead-akr', display_no: 'L-1113', type: 'open', title: 'Landtechnik Meyer',
        customer: 'Meyer', dealer: 'Meyer', owner_user_id: 'seller-akr', owner_name: 'AKR', owner_email: 'akr@timan.dk',
        responsible_name: 'AKR', machine: 'RC-751', equipment: null, date: '2026-09-21', next_followup: null,
        status: 'Demo planlagt', probability: 50, value: 1000, detail_href: '/portal/crm/leads/lead-akr', attachments: [],
      },
      {
        id: 'demo-row', display_no: 'D-8001', type: 'demo', title: 'Linked demo',
        customer: 'Meyer', dealer: 'Meyer', owner_user_id: 'seller-akr', owner_name: 'AKR', owner_email: 'akr@timan.dk',
        responsible_name: 'AKR', machine: 'RC-751', equipment: null, date: '2026-09-21', next_followup: null,
        status: 'Demo planlagt', probability: 50, value: 1000, detail_href: '/portal/crm/demo/demo-row', attachments: [],
      },
    ],
    counts: { all: 1, open: 1, won: 0, closed: 0 },
    followup_counts: { overdue: 0, soon: 0, later: 0 },
    unassigned_count: 0,
    total_count: 1,
    total_value: 1000,
    page_limit: 100,
    page_offset: 0,
    options: { types: [], machines: [], equipment: [], statuses: [] },
  };
}

describe('Demo existing-lead selector scope', () => {
  it('uses the canonical AKR owner id, email and shared-lead scope', async () => {
    mocks.resolveScope.mockResolvedValue({ ownerUserId: 'seller-akr', ownerEmail: 'akr@timan.dk' });
    mocks.listShared.mockResolvedValue(new Set(['shared-lead']));
    const listLeadsPage = vi.fn().mockResolvedValue(pageRows());

    const choices = await listSelectableDemoLeads({
      repository: { academy: false, listLeadsPage } as never,
      sessionUser: { id: 'seller-akr', email: 'akr@timan.dk' } as never,
      effectiveUser: { id: 'seller-akr', email: 'akr@timan.dk' } as never,
      portalRole: 'timan_seller',
      dealerAccounts: [],
    });

    expect(listLeadsPage).toHaveBeenCalledWith(expect.objectContaining({
      isAdmin: false,
      ownerUserId: 'seller-akr',
      ownerEmail: 'akr@timan.dk',
      sharedLeadIds: ['shared-lead'],
      tab: 'open',
    }));
    expect(choices).toEqual([expect.objectContaining({
      id: 'lead-akr', displayNo: 'L-1113', status: 'Demo planlagt', machine: 'RC-751',
    })]);
  });

  it('keeps Backend view-as AKR scoped instead of enabling Backend-global results', async () => {
    mocks.resolveScope.mockResolvedValue({ ownerUserId: 'seller-akr', ownerEmail: 'akr@timan.dk' });
    mocks.listShared.mockResolvedValue(new Set());
    const listLeadsPage = vi.fn().mockResolvedValue(pageRows());

    await listSelectableDemoLeads({
      repository: { academy: false, listLeadsPage } as never,
      sessionUser: { id: 'backend-user', email: 'backend@timan.dk' } as never,
      effectiveUser: { id: 'seller-akr', email: 'akr@timan.dk', portal_role: 'timan_seller' } as never,
      portalRole: 'timan_seller',
      dealerAccounts: [],
    });

    expect(mocks.resolveScope).toHaveBeenCalledWith({ email: 'backend@timan.dk' });
    expect(listLeadsPage).toHaveBeenCalledWith(expect.objectContaining({
      isAdmin: false, ownerUserId: 'seller-akr', ownerEmail: 'akr@timan.dk',
    }));
  });

  it('preserves canonical Backend-global access only outside View-as', async () => {
    mocks.resolveScope.mockResolvedValue({ ownerUserId: 'backend-user', ownerEmail: 'backend@timan.dk' });
    mocks.listShared.mockResolvedValue(new Set());
    const listLeadsPage = vi.fn().mockResolvedValue(pageRows());

    await listSelectableDemoLeads({
      repository: { academy: false, listLeadsPage } as never,
      sessionUser: { id: 'backend-user', email: 'backend@timan.dk' } as never,
      effectiveUser: { id: 'backend-user', email: 'backend@timan.dk' } as never,
      portalRole: 'timan_backend',
      dealerAccounts: [],
    });

    expect(listLeadsPage).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: true }));
  });

  it('passes only the external organization dealer subset to the existing lead RPC', async () => {
    mocks.resolveScope.mockResolvedValue({ ownerUserId: null, ownerEmail: 'dealer@example.test' });
    mocks.listShared.mockResolvedValue(new Set());
    mocks.buildJournalScope.mockResolvedValue({
      dealerNumbers: new Set(['10092']), dealerNames: new Set(['bmi a/s']), unrestricted: false,
    });
    const listLeadsPage = vi.fn().mockResolvedValue({ ...pageRows(), rows: [] });
    const accounts = [
      { id: 'dealer-bmi', account_number: '10092', company_name: 'BMI A/S', branch_name: null },
      { id: 'dealer-other', account_number: '99999', company_name: 'Other dealer', branch_name: null },
    ];

    await listSelectableDemoLeads({
      repository: { academy: false, listLeadsPage } as never,
      sessionUser: { id: 'dealer-user', email: 'dealer@example.test' } as never,
      effectiveUser: { id: 'dealer-user', email: 'dealer@example.test', dealer_number: '10092' } as never,
      portalRole: 'timan_dealer',
      dealerAccounts: accounts as never,
    });

    expect(listLeadsPage).toHaveBeenCalledWith(expect.objectContaining({
      isAdmin: false,
      externalDealerIds: ['dealer-bmi'],
      externalDealerNames: expect.arrayContaining(['bmi a/s', '10092']),
    }));
  });

  it('checks selected and direct fromLead ids against the scoped choices before loading details', () => {
    const source = readFileSync('src/pages/crm/CrmNewDemoLeadPage.tsx', 'utf8');
    expect(source).toContain("leadChoices.some((lead) => lead.id === fromLeadId)");
    expect(source).toContain("leadChoices.some((lead) => lead.id === leadId)");
    expect(source).toContain("useEffectivePortalUserState(appUser)");
  });
});
