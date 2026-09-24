import type { CrmConfigurationRow, CrmDocumentType } from '@/lib/crmConfigurationsService';
import { dealerKeyOf } from '@/lib/crmRelationsService';

export type CrmDocumentSort =
  | 'standard'
  | 'date-desc'
  | 'date-asc'
  | 'sent-desc'
  | 'sent-asc'
  | 'number-asc'
  | 'number-desc'
  | 'dealer-asc'
  | 'dealer-desc';

export interface CrmDocumentListFilterState {
  search: string;
  dealerKey: string;
  country: string;
  status: string;
  sort: CrmDocumentSort;
}

export interface CrmDocumentDealerOption {
  key: string;
  label: string;
  accountNumber: string | null;
}

export const DEFAULT_CRM_DOCUMENT_FILTERS: CrmDocumentListFilterState = {
  search: '',
  dealerKey: 'all',
  country: 'all',
  status: 'all',
  sort: 'standard',
};

const textCollator = new Intl.Collator('da', { numeric: true, sensitivity: 'base' });

export function crmDocumentDealerLabel(row: CrmConfigurationRow): string {
  return row.dealer_company_name
    ?? row.dealer_name
    ?? (row.dealer_number ? `#${row.dealer_number}` : '—');
}

export function crmDocumentNumber(row: CrmConfigurationRow, mode: CrmDocumentType): string {
  return mode === 'order'
    ? (row.order_number || row.quote_number || row.id.slice(0, 8))
    : (row.quote_number || row.id.slice(0, 8));
}

export function crmDocumentStatus(row: CrmConfigurationRow, mode: CrmDocumentType): string {
  if (mode === 'order' && (row.order_sent_at || row.submitted_at)) return 'submitted';
  if (mode === 'quote' && row.quote_sent_at) return 'sent';
  return (row.case_status || row.status || 'unknown').trim().toLowerCase();
}

export function crmDocumentSentAt(row: CrmConfigurationRow, mode: CrmDocumentType): string | null {
  return mode === 'order' ? (row.order_sent_at || row.submitted_at) : row.quote_sent_at;
}

export function buildCrmDocumentDealerOptions(rows: CrmConfigurationRow[]): CrmDocumentDealerOption[] {
  const options = new Map<string, CrmDocumentDealerOption>();
  for (const row of rows) {
    const key = dealerKeyOf(row);
    if (!key) continue;
    const accountNumber = row.dealer_account_number || row.dealer_number || null;
    options.set(key, {
      key,
      accountNumber,
      label: crmDocumentDealerLabel(row),
    });
  }
  return [...options.values()].sort((a, b) => textCollator.compare(a.label, b.label));
}

export function buildCrmDocumentCountries(rows: CrmConfigurationRow[]): string[] {
  return [...new Set(rows.map((row) => row.dealer_country?.trim()).filter((value): value is string => Boolean(value)))]
    .sort((a, b) => textCollator.compare(a, b));
}

export function buildCrmDocumentStatuses(rows: CrmConfigurationRow[], mode: CrmDocumentType): string[] {
  return [...new Set(rows.map((row) => crmDocumentStatus(row, mode)))]
    .sort((a, b) => textCollator.compare(a, b));
}

function timestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function filterAndSortCrmDocuments(
  rows: CrmConfigurationRow[],
  filters: CrmDocumentListFilterState,
  mode: CrmDocumentType,
): CrmConfigurationRow[] {
  const query = filters.search.trim().toLowerCase();
  const country = filters.country.trim().toLowerCase();

  const filtered = rows.filter((row) => {
    if (filters.dealerKey !== 'all' && dealerKeyOf(row) !== filters.dealerKey) return false;
    if (filters.country !== 'all' && row.dealer_country?.trim().toLowerCase() !== country) return false;
    if (filters.status !== 'all' && crmDocumentStatus(row, mode) !== filters.status) return false;
    if (!query) return true;

    const haystack = [
      row.quote_number,
      row.order_number,
      row.title,
      row.seller_initials,
      row.seller_email,
      row.seller_name,
      row.dealer_number,
      row.dealer_account_number,
      row.dealer_name,
      row.dealer_company_name,
      row.purchase_order_number,
      ...row.purchase_order_numbers,
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query);
  });

  if (filters.sort === 'standard') return filtered;

  return filtered.slice().sort((a, b) => {
    switch (filters.sort) {
      case 'date-desc':
        return timestamp(b.created_at) - timestamp(a.created_at);
      case 'date-asc':
        return timestamp(a.created_at) - timestamp(b.created_at);
      case 'sent-desc':
        return timestamp(crmDocumentSentAt(b, mode)) - timestamp(crmDocumentSentAt(a, mode));
      case 'sent-asc':
        return timestamp(crmDocumentSentAt(a, mode)) - timestamp(crmDocumentSentAt(b, mode));
      case 'number-asc':
        return textCollator.compare(crmDocumentNumber(a, mode), crmDocumentNumber(b, mode));
      case 'number-desc':
        return textCollator.compare(crmDocumentNumber(b, mode), crmDocumentNumber(a, mode));
      case 'dealer-asc':
        return textCollator.compare(crmDocumentDealerLabel(a), crmDocumentDealerLabel(b));
      case 'dealer-desc':
        return textCollator.compare(crmDocumentDealerLabel(b), crmDocumentDealerLabel(a));
      default:
        return 0;
    }
  });
}
