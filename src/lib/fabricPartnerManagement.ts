import { groupPartnerImportQueue, type PartnerReviewRow } from './fabricPartnerReview';
import { resolvePartnerAccountType } from './partnerAccountTypes';
import type { PortalPartnerParity } from './fabricPartnerParity';

export interface PartnerImportReceipt {
  id: string;
  account_id: string;
  account_number: string;
  approval_id: string;
  imported_at: string;
}

export function partnerManagementCounts(rows: readonly PartnerReviewRow[], portal: readonly PortalPartnerParity[],
  imports: readonly PartnerImportReceipt[] | undefined, parentIds: readonly string[]) {
  const transferred = new Set((imports ?? []).filter(receipt => portal.some(account =>
    account.id === receipt.account_id && account.account_number === receipt.account_number)).map(receipt => receipt.account_number));
  const queue = groupPartnerImportQueue(rows, parentIds).map(group => ({ ...group,
    rows: group.rows.filter(row => !transferred.has(row.account_number)),
  })).filter(group => group.rows.length > 0);
  return {
    portalPartners: portal.filter(account => ['dealer', 'service_partner', 'importer', 'dealer_customer']
      .includes(resolvePartnerAccountType(account))).length,
    pending: rows.filter(row => row.review_status === 'PENDING' && !transferred.has(row.account_number)).length,
    approved: queue.reduce((total, group) => total + group.rows.length, 0),
    needsReview: rows.filter(row => row.needs_recheck || row.review_status === 'NEEDS_CLARIFICATION').length,
    transferred: imports === undefined ? null : transferred.size,
    queue,
  };
}
