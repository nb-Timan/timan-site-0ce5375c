import type { SessionUser } from '@/context/AppUserContext';
import type { CrmLeadRepository } from '@/lib/crmLeadRepository';
import { listSharedLeadIdsForUser } from '@/lib/crmLeadSharingService';
import { canUseImplicitExternalCrmDealerScope, isCrmAdmin, isExternalCrmRole } from '@/lib/crmScope';
import type { DealerAccount } from '@/lib/dealerAccountsService';
import { buildJournalScope } from '@/lib/machineJournalScope';
import type { PortalRole } from '@/lib/portalAccess';
import { resolveEffectiveCrmSellerScope } from '@/lib/resolveSellerId';

export interface DemoLeadChoice {
  id: string;
  displayNo: string;
  title: string;
  customer: string | null;
  status: string | null;
  machine: string | null;
  searchValue: string;
}

export async function listSelectableDemoLeads(input: {
  repository: CrmLeadRepository;
  sessionUser: Pick<SessionUser, 'email'> | null;
  effectiveUser: SessionUser | null;
  portalRole: PortalRole | null;
  dealerAccounts: DealerAccount[];
}): Promise<DemoLeadChoice[]> {
  const { repository, sessionUser, effectiveUser, portalRole, dealerAccounts } = input;
  const admin = isCrmAdmin(portalRole);
  const sellerScope = repository.academy
    ? { ownerUserId: 'academy-local-sales-user', ownerEmail: 'academy.sales@localhost' }
    : await resolveEffectiveCrmSellerScope({ email: sessionUser?.email });
  const sharedLeadIds = repository.academy
    ? new Set<string>()
    : await listSharedLeadIdsForUser(sellerScope.ownerUserId);

  let externalDealerIds: string[] = [];
  let externalDealerNames: string[] = [];
  if (isExternalCrmRole(portalRole)) {
    if (!effectiveUser) return [];
    const scope = await buildJournalScope(effectiveUser, portalRole);
    const scopedDealers = dealerAccounts.filter((dealer) => (
      scope.dealerNumbers.has((dealer.account_number || '').trim().toLowerCase())
      && canUseImplicitExternalCrmDealerScope(dealer)
    ));
    externalDealerIds = scopedDealers.map((dealer) => dealer.id);
    externalDealerNames = scopedDealers.flatMap((dealer) => [
      dealer.company_name,
      dealer.branch_name,
      dealer.account_number,
    ]).filter(Boolean).map((value) => String(value).trim().toLowerCase());
  }

  if (!admin && !isExternalCrmRole(portalRole) && !sellerScope.ownerUserId && !sellerScope.ownerEmail) {
    return [];
  }

  const page = await repository.listLeadsPage({
    isAdmin: admin,
    ownerUserId: sellerScope.ownerUserId,
    ownerEmail: sellerScope.ownerEmail,
    sharedLeadIds: Array.from(sharedLeadIds),
    externalDealerIds,
    externalDealerNames,
    tab: 'open',
    limit: 100,
  });

  return page.rows
    .filter((row) => row.type === 'open')
    .map((row) => ({
      id: row.id,
      displayNo: row.display_no,
      title: row.title,
      customer: row.customer,
      status: row.status,
      machine: row.machine,
      searchValue: [row.display_no, row.title, row.customer, row.status, row.machine]
        .filter(Boolean)
        .join(' '),
    }));
}
