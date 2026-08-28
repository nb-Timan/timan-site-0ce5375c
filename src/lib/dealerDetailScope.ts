import type { DealerAccount } from "@/lib/dealerAccountsService";

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

export function canOpenDealerDetailFromVisibleDealers(
  visibleDealers: DealerAccount[],
  requestedAccountNumber: string | null | undefined,
): boolean {
  return buildDealerDetailRowsFromVisibleDealers(visibleDealers, requestedAccountNumber).length > 0;
}
