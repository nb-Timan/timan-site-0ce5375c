import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SellerOverviewSection from '@/components/crm/SellerOverviewSection';
import {
  sellerOverviewDateBelongsToYear,
  sellerOverviewDefaultYear,
  sellerOverviewMonthPeriods,
} from '@/lib/crmSellerOverviewYear';
import type { CrmActivity } from '@/lib/crmActivitiesService';
import type { CrmLead } from '@/lib/crmLeadsService';
import type { BudgetDealerLine, BudgetLine, SalesActual } from '@/lib/crmBudgetService';

const api = vi.hoisted(() => ({
  listActivities: vi.fn(),
  listLeads: vi.fn(),
  listDemoLeads: vi.fn(),
  listBudgetLines: vi.fn(),
  listForecasts: vi.fn(),
  listSalesActuals: vi.fn(),
  listBudgetDealerLines: vi.fn(),
}));

vi.mock('@/lib/crmActivitiesService', () => ({ listActivities: api.listActivities }));
vi.mock('@/lib/crmLeadsService', () => ({
  listLeads: api.listLeads,
  listDemoLeads: api.listDemoLeads,
}));
vi.mock('@/lib/crmBudgetService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/crmBudgetService')>()),
  listBudgetLines: api.listBudgetLines,
  listForecasts: api.listForecasts,
  listSalesActuals: api.listSalesActuals,
  listBudgetDealerLines: api.listBudgetDealerLines,
}));
vi.mock('@/lib/usePortalCurrency', () => ({ usePortalCurrency: () => 'DKK' }));

function lead(id: string, date: string): CrmLead {
  return {
    id,
    title: id,
    owner_user_id: null,
    owner_name: 'BP',
    owner_email: 'bp@timan.dk',
    linked_dealer_id: null,
    first_contact_date: date,
    expected_close_date: null,
    next_followup_date: null,
    machine_types: [],
    next_activity: 'New lead',
    demo_has_run: 'no',
    contact_type: null,
    customer_type: null,
    contact_information: null,
    trade_fair: null,
    country: 'DK',
    notes: null,
    estimated_value: 0,
    probability: 10,
    pipeline_stage: 'Lead',
    lost_competitor: null,
    lost_reason: null,
    lost_comment: null,
    attachments: [],
    status: 'active',
    created_at: `${date}T08:00:00.000Z`,
    updated_at: `${date}T08:00:00.000Z`,
  };
}

function activity(id: string, type: CrmActivity['activity_type'], date: string, value: number): CrmActivity {
  return {
    id,
    activity_type: type,
    lead_id: null,
    activity_date: `${date}T09:00:00.000Z`,
    account_id: null,
    account_name: null,
    created_by_user_id: null,
    created_by_name: 'BP',
    assigned_owner_user_id: null,
    assigned_owner_name: 'BP',
    title: id,
    description: null,
    status: 'sent',
    quote_id: type.startsWith('quote_') ? id : null,
    order_id: type === 'order_sent' ? id : null,
    configuration_id: null,
    value,
    currency: 'DKK',
    meta: null,
    created_at: `${date}T09:00:00.000Z`,
  };
}

function budgetLine(year: number): BudgetLine {
  return {
    id: `line-${year}`,
    year,
    product_key: 'Timan 3330',
    product_name: 'Timan 3330',
    item_number: '712000',
    category: 'machine',
    seller_id: null,
    seller_name: 'BP',
    seller_email: 'bp@timan.dk',
    seller_initials: 'BP',
    country: 'DK',
    qty_budget: 0,
    value_budget: year === 2026 ? 100_000 : 200_000,
    monthly_split: Array.from({ length: 12 }, () => 1 / 12),
    locked: true,
    created_at: `${year}-07-01T00:00:00.000Z`,
  };
}

function dealerLine(year: number): BudgetDealerLine {
  return {
    id: `dealer-${year}`,
    year,
    month_idx: 6,
    seller_id: null,
    seller_name: 'BP',
    seller_email: 'bp@timan.dk',
    seller_initials: 'BP',
    dealer_account_id: 'dealer-bp',
    dealer_account_number: 'BP',
    dealer_name: 'BP Dealer',
    dealer_name_norm: 'bp dealer',
    product_key: 'Timan 3330',
    product_name: 'Timan 3330',
    item_number: '712000',
    qty: year === 2026 ? 10 : 20,
    excluded_from_total: false,
    import_source: 'test',
    import_batch_id: 'test',
  };
}

function actual(year: number): SalesActual {
  return {
    budget_line_id: `line-${year}`,
    qty_sold: 5,
    value_sold: 0,
    seller_key: 'bp@timan.dk',
    seller_email: 'bp@timan.dk',
    seller_initials: 'BP',
    year,
    product_key: 'Timan 3330',
  };
}

function Harness() {
  const [selected, setSelected] = useState<string | null>(null);
  return <SellerOverviewSection selectedInitials={selected} onSelectSeller={setSelected}
    now={new Date('2026-10-06T12:00:00Z')} />;
}

describe('CRM seller overview year scope', () => {
  beforeEach(() => {
    api.listLeads.mockResolvedValue([
      lead('current', '2026-08-10'),
      lead('historical-1', '2025-08-10'),
      lead('historical-2', '2025-09-10'),
    ]);
    api.listDemoLeads.mockResolvedValue([]);
    api.listActivities.mockResolvedValue([
      activity('current-quote', 'quote_sent', '2026-10-02', 10_000),
      activity('current-order', 'order_sent', '2026-10-03', 20_000),
      activity('historical-quote-1', 'quote_sent', '2025-10-02', 5_000),
      activity('historical-quote-2', 'quote_sent', '2025-10-04', 5_000),
    ]);
    api.listBudgetLines.mockImplementation(async ({ year }: { year: number }) => [budgetLine(year)]);
    api.listForecasts.mockResolvedValue([]);
    api.listSalesActuals.mockImplementation(async (year: number) => [actual(year)]);
    api.listBudgetDealerLines.mockImplementation(async (year: number) => [dealerLine(year)]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the current fiscal year and historical month context without cross-year leakage', () => {
    expect(sellerOverviewDefaultYear(new Date('2026-10-06T12:00:00Z'))).toBe(2026);
    expect(sellerOverviewDefaultYear(new Date('2026-02-06T12:00:00Z'))).toBe(2025);
    expect(sellerOverviewDateBelongsToYear('2026-06-30', 2025)).toBe(true);
    expect(sellerOverviewDateBelongsToYear('2026-07-01', 2025)).toBe(false);
    const historical = sellerOverviewMonthPeriods(2025, new Date('2026-10-06T12:00:00Z'));
    expect(historical.current.from).toEqual(new Date(2025, 9, 1));
    expect(historical.current.belongsToSelectedYear).toBe(true);
  });

  it('defaults to the canonical current year and scopes every metric when the year changes', async () => {
    render(<Harness />);
    const yearSelect = screen.getByRole('combobox', { name: 'Budgetår for sælgeroverblik' });
    expect(yearSelect).toHaveValue('2026');
    expect(yearSelect).toHaveTextContent('2025/26');
    expect(yearSelect).toHaveTextContent('2026/27');
    expect(yearSelect).toHaveTextContent('2027/28');

    const currentRow = await screen.findByRole('row', { name: 'Sælger BP' });
    let cells = within(currentRow).getAllByRole('cell');
    expect(cells[1]).toHaveTextContent('1');
    expect(cells[4]).toHaveTextContent('1');
    expect(cells[6]).toHaveTextContent('1');
    expect(cells[11]).toHaveTextContent('50%');
    expect(screen.getByRole('columnheader', { name: /Denne måned okt\. 2026/i })).toBeInTheDocument();

    fireEvent.change(yearSelect, { target: { value: '2025' } });
    await waitFor(() => expect(api.listBudgetLines).toHaveBeenLastCalledWith({ year: 2025 }));
    const historicalRow = await screen.findByRole('row', { name: 'Sælger BP' });
    cells = within(historicalRow).getAllByRole('cell');
    await waitFor(() => expect(cells[1]).toHaveTextContent('2'));
    expect(cells[4]).toHaveTextContent('2');
    expect(cells[6]).toHaveTextContent('0');
    expect(cells[11]).toHaveTextContent('25%');
    expect(screen.getByRole('columnheader', { name: /Denne måned okt\. 2025/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'BP', exact: true }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(yearSelect).toHaveValue('2025');
    expect(screen.getByRole('row', { name: 'Sælger BP' })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: 'Sælger JTN' })).not.toBeInTheDocument();
  });
});
