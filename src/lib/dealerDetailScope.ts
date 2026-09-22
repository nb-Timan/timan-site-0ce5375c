import type { DealerAccount } from "@/lib/dealerAccountsService";
import type { PartnerAccountRelation } from "@/lib/partnerRelationsService";

function normalizeAccountNumber(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function buildDealerDetailRowsFromVisibleDealers(
  visibleDealers: DealerAccount[],
  requestedAccountNumber: string | null | undefined,
): DealerAccount[] {
  const requested = normalizeAccountNumber(requestedAccountNumber);
  if (!requested) return [];

  const selected = visibleDealers.find((dealer) => normalizeAccountNumber(dealer.account_number) === requested);
  if (!selected) return [];

  const rootAccountNumber = normalizeAccountNumber(selected.parent_account_number || selected.account_number);
  const allowedNumbers = new Set<string>([
    normalizeAccountNumber(selected.account_number),
    rootAccountNumber,
  ]);

  for (const dealer of visibleDealers) {
    const accountNumber = normalizeAccountNumber(dealer.account_number);
    const parentAccountNumber = normalizeAccountNumber(dealer.parent_account_number);
    if (!accountNumber) continue;
    if (accountNumber === rootAccountNumber || parentAccountNumber === rootAccountNumber) {
      allowedNumbers.add(accountNumber);
    }
  }

  return visibleDealers.filter((dealer) => allowedNumbers.has(normalizeAccountNumber(dealer.account_number)));
}

export function addRelatedDealerDetailRowsFromVisibleDealers(
  detailRows: DealerAccount[],
  visibleDealers: DealerAccount[],
  selectedAccountId: string,
  relations: PartnerAccountRelation[],
): DealerAccount[] {
  if (!selectedAccountId || detailRows.length === 0) return detailRows;

  const relatedAccountIds = new Set<string>();
  for (const relation of relations) {
    if (!relation.active) continue;
    if (relation.source_account_id === selectedAccountId) relatedAccountIds.add(relation.target_account_id);
    if (relation.target_account_id === selectedAccountId) relatedAccountIds.add(relation.source_account_id);
  }

  const existingIds = new Set(detailRows.map((dealer) => dealer.id));
  const relatedVisibleRows = visibleDealers.filter(
    (dealer) => relatedAccountIds.has(dealer.id) && !existingIds.has(dealer.id),
  );
  return relatedVisibleRows.length > 0 ? [...detailRows, ...relatedVisibleRows] : detailRows;
}

export function canOpenDealerDetailFromVisibleDealers(
  visibleDealers: DealerAccount[],
  requestedAccountNumber: string | null | undefined,
): boolean {
  return buildDealerDetailRowsFromVisibleDealers(visibleDealers, requestedAccountNumber).length > 0;
}
