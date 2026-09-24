import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CrmConfigurationRow, CrmDocumentType } from '@/lib/crmConfigurationsService';
import {
  DEFAULT_CRM_DOCUMENT_FILTERS,
  buildCrmDocumentCountries,
  buildCrmDocumentDealerOptions,
  buildCrmDocumentStatuses,
  filterAndSortCrmDocuments,
  type CrmDocumentListFilterState,
} from '@/lib/crmDocumentListFilters';

function row(overrides: Partial<CrmConfigurationRow> = {}): CrmConfigurationRow {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    document_type: overrides.document_type ?? 'quote',
    case_type: null,
    case_status: 'aktiv',
    status: 'aktiv',
    created_at: '2026-01-01T10:00:00.000Z',
    delivery_date: null,
    last_saved_at: null,
    title: 'Test kunde',
    quote_number: 'T-4001',
    order_number: null,
    purchase_order_number: null,
    purchase_order_numbers: [],
    total_price: 100,
    note: null,
    seller_initials: 'AKR',
    seller_email: 'akr@example.com',
    seller_name: 'Anna',
    assigned_seller_id: 'seller-1',
    dealer_number: '1001',
    dealer_name: 'Alpha Dealer',
    dealer_account_id: 'dealer-alpha',
    dealer_company_name: 'Alpha Dealer',
    dealer_account_number: '1001',
    dealer_country: 'DK',
    created_by_email: null,
    created_by_user_id: null,
    created_by_role: null,
    active_mode: null,
    owner_status: null,
    lead_id: null,
    quote_sent_at: null,
    order_sent_at: null,
    submitted_at: null,
    ...overrides,
  };
}

const alpha = row({ id: 'alpha', quote_number: 'T-2', title: 'Nord kunde' });
const beta = row({
  id: 'beta',
  quote_number: 'T-10',
  title: 'Syd kunde',
  created_at: '2026-03-01T10:00:00.000Z',
  quote_sent_at: '2026-03-02T10:00:00.000Z',
  dealer_number: '2002',
  dealer_account_number: '2002',
  dealer_account_id: 'dealer-beta',
  dealer_name: 'Beta Dealer',
  dealer_company_name: 'Beta Dealer',
  dealer_country: 'DE',
  purchase_order_number: 'PO-42',
  purchase_order_numbers: ['PO-42'],
});
const gamma = row({
  id: 'gamma',
  quote_number: 'T-3',
  created_at: '2026-02-01T10:00:00.000Z',
  dealer_number: '3003',
  dealer_account_number: '3003',
  dealer_account_id: 'dealer-gamma',
  dealer_name: 'Gamma Dealer',
  dealer_company_name: 'Gamma Dealer',
  dealer_country: 'SE',
  case_status: 'pause',
  status: 'pause',
});

function filters(overrides: Partial<CrmDocumentListFilterState> = {}): CrmDocumentListFilterState {
  return { ...DEFAULT_CRM_DOCUMENT_FILTERS, ...overrides };
}

function ids(rows: CrmConfigurationRow[]): string[] {
  return rows.map((item) => item.id);
}

describe('CRM quote/order shared filters', () => {
  it.each<CrmDocumentType>(['quote', 'order'])('filters %s by the scoped dealer key', (mode) => {
    expect(ids(filterAndSortCrmDocuments([alpha, beta], filters({ dealerKey: 'id:dealer-beta' }), mode))).toEqual(['beta']);
  });

  it('builds dealer and country options only from already scoped rows', () => {
    expect(buildCrmDocumentDealerOptions([alpha, beta]).map((option) => option.accountNumber)).toEqual(['1001', '2002']);
    expect(buildCrmDocumentCountries([alpha, beta])).toEqual(['DE', 'DK']);
  });

  it('filters by country and canonical status', () => {
    expect(ids(filterAndSortCrmDocuments([alpha, beta, gamma], filters({ country: 'SE', status: 'pause' }), 'quote'))).toEqual(['gamma']);
    expect(buildCrmDocumentStatuses([alpha, beta, gamma], 'quote')).toEqual(['aktiv', 'pause', 'sent']);
  });

  it('combines dealer, country, status and search with AND semantics', () => {
    const result = filterAndSortCrmDocuments(
      [alpha, beta, gamma],
      filters({ dealerKey: 'id:dealer-beta', country: 'DE', status: 'sent', search: 'PO-42' }),
      'quote',
    );
    expect(ids(result)).toEqual(['beta']);
  });

  it('preserves the existing search fields while filters are active', () => {
    expect(ids(filterAndSortCrmDocuments([alpha, beta], filters({ search: 'syd' }), 'quote'))).toEqual(['beta']);
    expect(ids(filterAndSortCrmDocuments([alpha, beta], filters({ search: '2002' }), 'quote'))).toEqual(['beta']);
  });

  it('sorts newest and oldest by canonical created_at', () => {
    expect(ids(filterAndSortCrmDocuments([alpha, beta, gamma], filters({ sort: 'date-desc' }), 'quote'))).toEqual(['beta', 'gamma', 'alpha']);
    expect(ids(filterAndSortCrmDocuments([alpha, beta, gamma], filters({ sort: 'date-asc' }), 'quote'))).toEqual(['alpha', 'gamma', 'beta']);
  });

  it('sorts sent dates in both directions', () => {
    const olderSent = row({ id: 'older', quote_sent_at: '2026-01-15T10:00:00.000Z' });
    expect(ids(filterAndSortCrmDocuments([olderSent, beta], filters({ sort: 'sent-desc' }), 'quote'))).toEqual(['beta', 'older']);
    expect(ids(filterAndSortCrmDocuments([olderSent, beta], filters({ sort: 'sent-asc' }), 'quote'))).toEqual(['older', 'beta']);
  });

  it('sorts document numbers naturally in both directions', () => {
    expect(ids(filterAndSortCrmDocuments([beta, alpha, gamma], filters({ sort: 'number-asc' }), 'quote'))).toEqual(['alpha', 'gamma', 'beta']);
    expect(ids(filterAndSortCrmDocuments([beta, alpha, gamma], filters({ sort: 'number-desc' }), 'quote'))).toEqual(['beta', 'gamma', 'alpha']);
  });

  it('sorts dealer names in both directions', () => {
    expect(ids(filterAndSortCrmDocuments([gamma, beta, alpha], filters({ sort: 'dealer-asc' }), 'quote'))).toEqual(['alpha', 'beta', 'gamma']);
    expect(ids(filterAndSortCrmDocuments([gamma, beta, alpha], filters({ sort: 'dealer-desc' }), 'quote'))).toEqual(['gamma', 'beta', 'alpha']);
  });

  it('keeps service order for Standardvisning and reset', () => {
    expect(ids(filterAndSortCrmDocuments([gamma, alpha, beta], DEFAULT_CRM_DOCUMENT_FILTERS, 'quote'))).toEqual(['gamma', 'alpha', 'beta']);
    expect(DEFAULT_CRM_DOCUMENT_FILTERS).toEqual({ search: '', dealerKey: 'all', country: 'all', status: 'all', sort: 'standard' });
  });

  it('uses submitted as the canonical order status', () => {
    const order = row({ document_type: 'order', order_number: 'O-7001', submitted_at: '2026-04-01T10:00:00.000Z' });
    expect(buildCrmDocumentStatuses([order], 'order')).toEqual(['submitted']);
  });

  it('never introduces dealers that were not in the effective scoped result', () => {
    const sellerScopedRows = [alpha];
    expect(buildCrmDocumentDealerOptions(sellerScopedRows).map((option) => option.key)).toEqual(['id:dealer-alpha']);
  });

  it('wires synchronized column sorting and responsive controls in the shared page', () => {
    const page = readFileSync('src/pages/crm/CrmQuotesOrdersPage.tsx', 'utf8');
    expect(page).toContain("toggleSort('number-asc', 'number-desc')");
    expect(page).toContain("toggleSort('dealer-asc', 'dealer-desc')");
    expect(page).toContain("toggleSort('date-asc', 'date-desc')");
    expect(page).toContain("toggleSort('sent-asc', 'sent-desc')");
    expect(page).toContain('sm:grid-cols-2 xl:flex');
    expect(page).toContain("`${filtered.length} af ${rows.length}`");
  });
});
