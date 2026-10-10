import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { canSelectFabricLoanAsset, fabricLoanPhysicalGroupKey, filterFabricLoanStock, isFabricStockFresh, type FabricLoanAsset, type FabricLoanStock } from '@/lib/fabricLoanStock';
import { resolveSalesStockCatalogItem, salesStockAssetSelectionIssue, salesStockSelectedGroupIssue } from '@/lib/salesStockConfigurator';
import { FABRIC_LOAN_FIELDS, runFabricLoanSync, validateFabricLoanSnapshot } from '../../supabase/functions/_shared/fabricLoanSnapshot';
import { validateFabricPush } from '../../supabase/functions/fabric-loan-sync/fabricIngest';
import LoanStockPanel from '@/pages/loans/LoanStockPanel';
import LoansPage from '@/pages/loans/LoansPage';

const mocks = vi.hoisted(() => ({ state: null as unknown, refresh: vi.fn(), setBrik: vi.fn(), listCases: vi.fn(), updateReturn: vi.fn() }));
vi.mock('@/hooks/useFabricLoanStock', () => ({ useFabricLoanStock: () => mocks.state }));
vi.mock('@/context/LanguageContext', () => ({ useLanguage: () => ({ uiLanguage: 'da' }) }));
vi.mock('@/context/AppUserContext', () => ({ useAppUser: () => ({ appUser: { id: 'qa', portal_role: 'timan_backend', approved: true, is_active: true, allowed_areas: ['loans'] } }) }));
vi.mock('@/lib/loanService', () => ({
  listLoanCases: (...args: unknown[]) => mocks.listCases(...args),
  updateLoanExpectedReturn: (...args: unknown[]) => mocks.updateReturn(...args),
}));
vi.mock('@/pages/loans/LoanShell', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

const asset: FabricLoanAsset = {
  asset_id: 'qa-asset', asset_instance_id: 'SERIAL|QA|QA-SERIAL', instance_ordinal: 1,
  company: 'QA', account_number: '1010', order_number: null, line_number: null,
  item_number: 'QA-ITEM', item_name: 'QA machine', line_text: 'Nr.82 QA fejekost', serial_number: 'QA-SERIAL', serial_number_normalized: 'QA-SERIAL',
  warehouse_location_code: '2', warehouse_location_name: 'Lager 2', inventory_qty: 1, reserved_qty: 0,
  stock_last_changed: '2026-10-07T10:00:00', classification: 'LOAN_CANDIDATE', review_required: false,
  review_reason: null, identity_conflict: false, source_present: true, item_type: 'machine', allocated: false, brik_number: 82,
};
const fresh = () => ({ configured: true, running: false, failed: false, stale: false,
  source_as_of: new Date().toISOString(), last_success_at: new Date().toISOString(), stale_after_seconds: 900 });
const stock = (): FabricLoanStock => ({ assets: [asset, { ...asset, asset_id: 'qa-other', asset_instance_id: 'SERIAL|QA|QA-EXTERNAL', serial_number: 'QA-EXTERNAL', serial_number_normalized: 'QA-EXTERNAL', brik_number: 83, account_number: '1020', order_number: 'QA-ORDER', warehouse_location_code: '4', warehouse_location_name: 'Lager 4' }], sync: fresh() });
const hook = (data = stock()) => ({ query: { data, isPending: false, isError: false },
  refresh: { mutate: mocks.refresh, isPending: false, isError: false },
  setBrik: { mutate: mocks.setBrik, isPending: false, isError: false },
  enabled: true, canRefresh: true, canEditBrik: true });

beforeEach(() => { vi.clearAllMocks(); mocks.state = hook(); mocks.listCases.mockResolvedValue([]); });
afterEach(cleanup);

describe('single Fabric stock dataset', () => {
  it('defaults to active, preserves partial returns and exposes completed/cancelled history separately', async () => {
    const base = { id: 'draft', loan_number: 'U-QA-DRAFT', status: 'DRAFT', partner_name: 'QA', responsible_name: 'QA', asset_count: 1,
      lifecycle_state: { can_cancel_draft: true }, updated_at: '2026-10-09T08:00:00Z' };
    mocks.listCases.mockResolvedValue([base,
      { ...base, id: 'partial', loan_number: 'U-QA-PARTIAL', status: 'RETURN_INSPECTION', lifecycle_state: { can_cancel_draft: false } },
      { ...base, id: 'closed', loan_number: 'U-QA-CLOSED', status: 'CLOSED_OK', lifecycle_state: { can_cancel_draft: false, last_received_at: '2026-10-09T08:00:00Z' } },
      { ...base, id: 'cancelled', loan_number: 'U-QA-CANCELLED', status: 'CANCELLED', lifecycle_state: { can_cancel_draft: false } },
    ]);
    render(<MemoryRouter><LoansPage /></MemoryRouter>);
    await screen.findAllByText('U-QA-DRAFT');
    expect(screen.getAllByText('U-QA-PARTIAL')).toHaveLength(2);
    expect(screen.queryByText('U-QA-CLOSED')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Slet' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Afsluttede' }));
    expect(screen.queryByText('U-QA-DRAFT')).not.toBeInTheDocument();
    expect(screen.getAllByText('U-QA-CLOSED')).toHaveLength(2);
    expect(screen.getAllByText('U-QA-CANCELLED')).toHaveLength(2);
    expect(screen.getAllByText('2026-10-09')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Slet' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Alle' }));
    expect(screen.getAllByText('U-QA-DRAFT')).toHaveLength(2);
    expect(screen.getAllByText('U-QA-CLOSED')).toHaveLength(2);
  });
  it('shows bulk item 65101002 as one row with quantity 18 under item and order search', () => {
    const bulk = { ...asset, asset_id: 'bulk-line', asset_instance_id: 'LINE|DAT|420093276|65101002|4|133226|8|1',
      company: 'DAT', item_number: '65101002', line_text: 'Nr. Hammerslagle', item_name: 'Hammerslagle',
      order_number: '133226', serial_number: null, serial_number_normalized: null, brik_number: null,
      inventory_qty: 18, warehouse_location_code: '4', item_type: null };
    mocks.state = hook({ assets: [bulk], sync: fresh() });
    render(<LoanStockPanel onSelect={vi.fn()} />);
    expect(screen.getAllByText('Nr. Hammerslagle')).toHaveLength(1);
    expect(screen.getByText('Stk.: 18')).toBeInTheDocument();
    const search = screen.getByRole('textbox', { name: 'Søg i salgslager' });
    for (const query of ['65101002', '133226']) {
      fireEvent.change(search, { target: { value: query } });
      expect(screen.getAllByText('Nr. Hammerslagle')).toHaveLength(1);
    }
    expect(screen.getByRole('button', { name: /Vælg aktiv/ })).toBeDisabled();
  });
  it('shows the compact four-column summary and only uses the canonical active loan as borrower', () => {
    mocks.state = hook({
      assets: [{ ...asset, allocated: true, order_number: 'FABRIC-ORDER-42' }],
      sync: fresh(),
      active_assignments: [{
        asset_id: asset.asset_id, loan_number: 'U-4242', partner_name: 'QA Partner',
        partner_country: 'DK', status: 'ON_LOAN',
      }],
    });
    render(<LoanStockPanel />);
    expect(screen.getAllByText('Navn').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Varenr.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Brik nr.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Udlånsoplysninger').length).toBeGreaterThan(0);
    expect(screen.getAllByText('QA Partner · DK').length).toBeGreaterThan(0);
    expect(screen.getByText('Stk.: 1 · U-4242')).toBeInTheDocument();
    expect(screen.queryByText('Canonical SKU')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Nr.82 QA fejekost'));
    expect(screen.getByText('Canonical SKU')).toBeInTheDocument();
    expect(screen.getByText('Udlånt')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Søg i salgslager' }), { target: { value: 'U-4242' } });
    expect(screen.getAllByText('QA Partner · DK').length).toBeGreaterThan(0);
  });
  it('renders separate Loans and Sales stock views', async () => {
    render(<MemoryRouter><LoansPage /></MemoryRouter>);
    expect(await screen.findByText('Ingen lånesager endnu.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Salgslager' }));
    expect(screen.getByText('QA-SERIAL')).toBeInTheDocument();
    expect(screen.queryByText('Ingen lånesager endnu.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Udlån' }));
    expect(screen.getByText('Ingen lånesager endnu.')).toBeInTheDocument();
  });
  it('shows symmetric warehouse and account filter groups with explicit defaults and counts', () => {
    render(<LoanStockPanel />);
    const warehouseGroup = screen.getByRole('group', { name: 'Lager' });
    const accountGroup = screen.getByRole('group', { name: 'Konto' });
    expect(warehouseGroup).toContainElement(screen.getByRole('button', { name: 'Alle lagre' }));
    expect(accountGroup).toContainElement(screen.getByRole('button', { name: 'Alle konti' }));
    expect(screen.getByRole('button', { name: 'Alle lagre' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Alle konti' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('combobox', { name: 'Konto' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alle lagre' })).toHaveTextContent('2');
  });
  it('selects multiple physical assets in the third sale tab and hands off to the existing Configurator', async () => {
    const rc751 = { ...asset, asset_id: 'rc751-a', asset_instance_id: 'SERIAL|DAT|410040-A',
      item_number: '410040-01', item_name: 'RC-751', line_text: 'RC-751 salgslager', serial_number: '410040-A',
      serial_number_normalized: '410040-A' };
    const rc1000 = { ...asset, asset_id: 'rc1000-a', asset_instance_id: 'SERIAL|DAT|411000-A',
      item_number: '411000-04', item_name: 'RC-1000s', line_text: 'RC-1000s salgslager', serial_number: '411000-A',
      serial_number_normalized: '411000-A', brik_number: 83, warehouse_location_code: '4', warehouse_location_name: 'Lager 4' };
    mocks.state = hook({ assets: [rc751, rc1000], sync: fresh() });
    render(<MemoryRouter><LoansPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('tab', { name: 'Sælg salgslagermaskine' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Vælg aktiv: 410040-A' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Vælg aktiv: 411000-A' }));
    expect(screen.getByText('Valgte aktiver: 2')).toBeInTheDocument();
    expect(screen.getAllByText(/Serienr\./).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: 'Til Configurator' })).toBeEnabled();
  });
  it('uses the shared warehouse/account/search browser in the sales tab', async () => {
    const rc751 = { ...asset, asset_id: 'rc751-a', asset_instance_id: 'SERIAL|DAT|410040-A',
      item_number: '410040-01', item_name: 'RC-751', line_text: 'RC-751 salgslager', serial_number: '410040-A',
      serial_number_normalized: '410040-A', item_type: null };
    const flail = { ...asset, asset_id: 'flail-a', asset_instance_id: 'SERIAL|DAT|410910-A',
      item_number: '410910-00', item_name: 'Slagleklipper', line_text: 'RC-1000 slagleklipper', serial_number: '410910-A',
      serial_number_normalized: '410910-A', item_type: 'equipment' as const, account_number: '1020',
      warehouse_location_code: '4', warehouse_location_name: 'Lager 4' };
    mocks.state = hook({ assets: [rc751, flail], sync: fresh() });
    render(<MemoryRouter><LoansPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('tab', { name: 'Sælg salgslagermaskine' }));
    expect(screen.getByRole('group', { name: 'Lager' })).toContainElement(screen.getByRole('button', { name: 'Alle lagre' }));
    expect(screen.getByRole('group', { name: 'Konto' })).toContainElement(screen.getByRole('button', { name: 'Alle konti' }));
    expect(screen.queryByRole('combobox', { name: 'Konto' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Lager 4/ }));
    fireEvent.click(screen.getByRole('button', { name: '1020' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Søg i salgslager' }), { target: { value: '410910' } });
    expect(screen.getByText('RC-1000 slagleklipper')).toBeInTheDocument();
    expect(screen.queryByText('RC-751 salgslager')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1020' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Lager 4/ })).toHaveAttribute('aria-pressed', 'true');
  });
  it('lets the sales resolver safely classify a canonical match even when Fabric type is missing', () => {
    const untyped = { ...asset, item_number: '410040-01', item_type: null };
    expect(canSelectFabricLoanAsset(untyped, fresh())).toBe(false);
    expect(resolveSalesStockCatalogItem(untyped.item_number, 'DKK')?.catalogItemNumber).toBe('410040');
    expect(salesStockAssetSelectionIssue(untyped, fresh(), 'DKK')).toBeNull();
    const loaderLineEquipment = { ...asset, item_number: '312010-00', item_type: null };
    expect(resolveSalesStockCatalogItem(loaderLineEquipment.item_number, 'DKK')).toMatchObject({
      catalogItemNumber: '312010',
      itemType: 'equipment',
      machineType: 'Loader Line',
    });
    expect(salesStockAssetSelectionIssue(loaderLineEquipment, fresh(), 'DKK')).toBeNull();
  });
  it('shows deterministic reasons for every unsafe sales-stock selection', () => {
    expect(salesStockAssetSelectionIssue({ ...asset, item_number: 'UNKNOWN-01' }, fresh(), 'DKK')).toBe('Mangler Product Master-match');
    expect(salesStockAssetSelectionIssue({ ...asset, item_number: '410910-00', serial_number: null, brik_number: null }, fresh(), 'DKK')).toBe('Mangler Brik nr.');
    expect(salesStockAssetSelectionIssue({ ...asset, item_number: '410040-01', review_required: true }, fresh(), 'DKK')).toBe('Kræver kontrol');
    expect(salesStockAssetSelectionIssue({ ...asset, item_number: '410040-01', identity_conflict: true }, fresh(), 'DKK')).toBe('Identitetskonflikt');
    expect(salesStockAssetSelectionIssue({ ...asset, item_number: '410040-01', sales_committed: true }, fresh(), 'DKK')).toBe('Allerede reserveret til salg');
  });
  it('filters Lager 2 and Lager 4 without resetting the account selection', () => {
    render(<LoanStockPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Lager 4/ }));
    expect(screen.getByText('QA-EXTERNAL')).toBeInTheDocument();
    expect(screen.queryByText('QA-SERIAL')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Alle lagre' }));
    fireEvent.click(screen.getByRole('button', { name: '1010' }));
    expect(screen.getByText('QA-SERIAL')).toBeInTheDocument();
    expect(screen.queryByText('QA-EXTERNAL')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Lager 2/ }));
    expect(screen.getByRole('button', { name: '1010' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('searches brik, line text, serial, item, name, account and order without fabricating missing orders', () => {
    for (const term of ['82', 'fejekost', 'qa-serial', 'QA-ITEM', 'machine', '1010']) expect(filterFabricLoanStock([asset], 'all', term, 'all')).toEqual([asset]);
    expect(filterFabricLoanStock(stock().assets, 'all', 'QA-ORDER', '1020')).toHaveLength(1);
    render(<LoanStockPanel />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Søg i salgslager' }), { target: { value: 'qa-external' } });
    expect(screen.queryByText('QA-SERIAL')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('QA-EXTERNAL'));
    expect(screen.getByText('Ekstern placering')).toBeInTheDocument();
  });
  it('keeps shared Brik component rows distinct, searchable and informational instead of invalid', () => {
    const componentA = { ...asset, asset_id: 'component-a', asset_instance_id: 'LINE|DAT|A', company: 'DAT',
      item_number: '210100-01', line_text: 'Nr.96 Skovl', serial_number: null, serial_number_normalized: null,
      brik_number: 96, brik_group_size: 2, physical_asset_group_key: 'DAT:BRIK:96', item_type: 'equipment' as const };
    const componentB = { ...componentA, asset_id: 'component-b', asset_instance_id: 'LINE|DAT|B',
      item_number: '210123-00', line_text: 'Nr.96 Overfald' };
    mocks.state = hook({ assets: [componentA, componentB], sync: fresh() });
    render(<LoanStockPanel onSelect={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /Brik nr. 96 anvendes på 2 varelinjer/ })).toHaveLength(2);
    expect(screen.queryByText('Brik nr. er allerede i brug.')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Søg i salgslager' }), { target: { value: '96' } });
    expect(screen.getByText('Nr.96 Skovl')).toBeInTheDocument();
    expect(screen.getByText('Nr.96 Overfald')).toBeInTheDocument();
    expect(fabricLoanPhysicalGroupKey(componentA)).toBe(fabricLoanPhysicalGroupKey(componentB));
  });
  it('allows assigning and clearing a shared Brik without client-side duplicate rejection', () => {
    render(<LoanStockPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Redigér Brik nr.: QA-SERIAL' }));
    const input = screen.getByRole('spinbutton', { name: 'Brik nr.: QA-SERIAL' });
    fireEvent.change(input, { target: { value: '96' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    expect(mocks.setBrik).toHaveBeenLastCalledWith({ assetId: 'qa-asset', brikNumber: 96 }, expect.any(Object));
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    expect(mocks.setBrik).toHaveBeenLastCalledWith({ assetId: 'qa-asset', brikNumber: null }, expect.any(Object));
  });
  it('blocks a shared Brik group with conflicting serialized identities', () => {
    expect(canSelectFabricLoanAsset({ ...asset, brik_group_serial_conflict: true }, fresh())).toBe(false);
    expect(salesStockAssetSelectionIssue({ ...asset, item_number: '410040-01', brik_group_serial_conflict: true }, fresh(), 'DKK'))
      .toBe('Identitetskonflikt');
  });
  it('returns both serialized and non-serialized physical rows for order 138063', () => {
    const serialized = { ...asset, asset_id: 'serial', asset_instance_id: 'SERIAL|DAT|730600-00-2044',
      order_number: '138063', item_number: '730600-00', line_text: 'Nr.194 Ukrudtsbørste med mulighed for opsamling',
      serial_number: '730600-00-2044', serial_number_normalized: '730600-00-2044', brik_number: null };
    const nonSerialized = { ...asset, asset_id: 'line', asset_instance_id: 'LINE|DAT|445129381|1',
      order_number: '138063', item_number: '730601-00', line_text: 'Nr.131 Sug for ukrudtsbørste',
      serial_number: null, serial_number_normalized: null, brik_number: null };
    expect(filterFabricLoanStock([serialized, nonSerialized], 'all', '138063', 'all')).toEqual([serialized, nonSerialized]);
    expect(canSelectFabricLoanAsset(nonSerialized, fresh())).toBe(false);
    expect(canSelectFabricLoanAsset({ ...nonSerialized, brik_number: 131 }, fresh())).toBe(true);
  });
  it('edits expected return from the overview with a required note', async () => {
    mocks.listCases.mockResolvedValue([{ id: 'loan-1', loan_number: 'U-6601', case_number: 'LN-000001', responsible_user_id: 'qa', responsible_name: 'QA Seller', dealer_account_id: 'partner', partner_name: 'QA Partner', dealer_contact_id: 'contact', loan_date: '2026-10-07', expected_return_date: '2026-10-14', status: 'ON_LOAN', asset_count: 3, can_edit_expected_return: true, created_at: '2026-10-07T00:00:00Z', updated_at: '2026-10-07T00:00:00Z' }]);
    render(<MemoryRouter><LoansPage /></MemoryRouter>);
    expect(await screen.findAllByText('U-6601')).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Rediger retur' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Vælg en ny dato og skriv en kort årsag.');
    fireEvent.change(screen.getByLabelText('Ny forventet retur'), { target: { value: '2026-10-21' } });
    fireEvent.change(screen.getByLabelText('Note / årsag'), { target: { value: 'Ny aftale' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    await waitFor(() => expect(mocks.updateReturn).toHaveBeenCalledWith('loan-1', '2026-10-21', 'Ny aftale'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('combines search, account and warehouse as AND filters without resetting either control', () => {
    render(<LoanStockPanel />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Søg i salgslager' }), { target: { value: 'QA-ORDER' } });
    fireEvent.click(screen.getByRole('button', { name: '1020' }));
    expect(screen.getByRole('textbox', { name: 'Søg i salgslager' })).toHaveValue('QA-ORDER');
    expect(screen.getByRole('button', { name: '1020' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('QA-EXTERNAL')).toBeInTheDocument();
    expect(screen.queryByText('QA-SERIAL')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Lager 2/ }));
    expect(screen.queryByText('QA-EXTERNAL')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1020' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Søg i salgslager' })).toHaveValue('QA-ORDER');
  });
  it('limits All warehouses to Lager 2 and Lager 4, All accounts to 1010 and 1020, and keeps search below both groups', () => {
    expect(filterFabricLoanStock([asset,
      { ...asset, asset_id: 'other-warehouse', warehouse_location_code: '7' },
      { ...asset, asset_id: 'other-account', account_number: null },
    ], 'all', '', 'all')).toEqual([asset]);
    render(<LoanStockPanel />);
    const accountGroup = screen.getByRole('group', { name: 'Konto' });
    const searchInput = screen.getByRole('textbox', { name: 'Søg i salgslager' });
    expect(accountGroup.compareDocumentPosition(searchInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('uses line text as the title, keeps short row warehouse labels and retains full warehouse headings', () => {
    mocks.state = hook({ ...stock(), assets: [{ ...asset, warehouse_location_name: 'Lager 2 - Nye ubrugte salgslagermaskiner' }] });
    render(<LoanStockPanel />);
    expect(screen.getByText('Nr.82 QA fejekost')).toBeInTheDocument();
    expect(screen.getByText('Nye ubrugte salgslagermaskiner')).toBeInTheDocument();
    expect(screen.queryByText('Lager 2 - Nye ubrugte salgslagermaskiner')).not.toBeInTheDocument();
    expect(screen.getAllByText('Lager 2').length).toBeGreaterThan(0);
  });
  it('lets Backend edit the Portal-owned brik number', () => {
    render(<LoanStockPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Redigér Brik nr.: QA-SERIAL' }));
    const input = screen.getByRole('spinbutton', { name: 'Brik nr.: QA-SERIAL' });
    fireEvent.change(input, { target: { value: '83' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    expect(mocks.setBrik).toHaveBeenCalledWith({ assetId: 'qa-asset', brikNumber: 83 }, expect.any(Object));
  });
  it('shows a non-serialized Backend row without fabricating a serial and blocks it until Brik is assigned', () => {
    const nonSerialized = { ...asset, asset_id: 'line', asset_instance_id: 'LINE|DAT|445129381|1',
      item_number: '730601-00', line_text: 'Nr.131 Sug for ukrudtsbørste', serial_number: null,
      serial_number_normalized: null, brik_number: null, account_number: '1020', order_number: '138063',
      warehouse_location_code: '4', warehouse_location_name: 'Lager 4', item_type: 'equipment' as const };
    mocks.state = hook({ assets: [nonSerialized], sync: fresh() });
    render(<LoanStockPanel onSelect={vi.fn()} />);
    expect(screen.getByText('Nr.131 Sug for ukrudtsbørste')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Nr.131 Sug for ukrudtsbørste'));
    expect(screen.getByText('Mangler Brik nr.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vælg aktiv: 730601-00 #1' })).toBeDisabled();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
  it.each(['1010', '1020'])('allows a fresh %s candidate', (account_number) => {
    expect(canSelectFabricLoanAsset({ ...asset, account_number }, fresh())).toBe(true);
  });
  it.each([
    { classification: 'REVIEW_REQUIRED' }, { classification: 'IDENTITY_CONFLICT' }, { classification: 'SOLD' },
    { classification: 'EXCLUDED' }, { review_required: true }, { identity_conflict: true },
    { allocated: true }, { brik_group_serial_conflict: true }, { source_present: false }, { item_type: null }, { warehouse_location_code: '7' },
  ])('blocks unsafe candidate %j', (patch) => {
    expect(canSelectFabricLoanAsset({ ...asset, ...patch }, fresh())).toBe(false);
  });
  it('enforces the four verified Fabric acceptance cases', () => {
    expect(canSelectFabricLoanAsset({ ...asset, serial_number: '725142-00-1002' }, fresh())).toBe(true);
    expect(canSelectFabricLoanAsset({ ...asset, serial_number: '730017-00-1063', classification: 'REVIEW_REQUIRED', review_required: true }, fresh())).toBe(false);
    expect(canSelectFabricLoanAsset({ ...asset, serial_number: 'V34-000-04-1255', classification: 'IDENTITY_CONFLICT', identity_conflict: true }, fresh())).toBe(false);
    expect(canSelectFabricLoanAsset({ ...asset, serial_number: '410040-01-0349', classification: 'SOLD' }, fresh())).toBe(false);
  });
  it('ages out cached data even before the next poll', () => {
    const sync = { ...fresh(), source_as_of: '2026-10-07T10:00:00Z' };
    expect(isFabricStockFresh(sync, Date.parse('2026-10-07T10:16:00Z'))).toBe(false);
    expect(canSelectFabricLoanAsset(asset, { ...fresh(), stale: true })).toBe(false);
  });
  it('selects from the same rendered stock and disables review/conflict rows', () => {
    const data = stock();
    data.assets.push({ ...asset, asset_id: 'review', serial_number: 'QA-REVIEW', classification: 'REVIEW_REQUIRED' },
      { ...asset, asset_id: 'conflict', serial_number: 'QA-CONFLICT', identity_conflict: true });
    mocks.state = hook(data);
    const onSelect = vi.fn();
    render(<LoanStockPanel onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: 'Vælg aktiv: QA-REVIEW' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Vælg aktiv: QA-CONFLICT' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Vælg aktiv: QA-SERIAL' }));
    expect(onSelect).toHaveBeenCalledWith(asset);
  });
  it('refreshes through the backend, shows freshness and prevents repeated clicks while running', () => {
    const state = hook(); mocks.state = state;
    const { rerender } = render(<LoanStockPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Opdater fra Fabric' }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.getByText(/Sidst opdateret fra Fabric/)).toBeInTheDocument();
    state.query.data.sync.running = true; rerender(<LoanStockPanel />);
    expect(screen.getByRole('button', { name: 'Opdaterer...' })).toBeDisabled();
  });
  it('keeps last stock visible on failure and blocks selection on a failed read', () => {
    const state = hook(); state.query.isError = true; state.refresh.isError = true; mocks.state = state;
    render(<LoanStockPanel onSelect={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Seneste lagerdata er bevaret');
    expect(screen.getByText('QA-SERIAL')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vælg aktiv: QA-SERIAL' })).toBeDisabled();
  });
  it('does not claim zero inventory or a preserved snapshot before the first successful sync', () => {
    mocks.state = { ...hook(), query: { data: undefined, isPending: false, isError: true } };
    render(<LoanStockPanel />);
    expect(screen.getByRole('button', { name: /Lager 2/ })).toHaveTextContent('—');
    expect(screen.getByRole('button', { name: /Lager 4/ })).toHaveTextContent('—');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Seneste lagerdata er bevaret');
    expect(screen.getByRole('button', { name: 'Opdater fra Fabric' })).toBeDisabled();
  });
  it('hides refresh from non-Backend and the pool from unauthorized users', () => {
    const state = hook(); state.canRefresh = false; state.canEditBrik = false; mocks.state = state;
    const { rerender } = render(<LoanStockPanel />);
    expect(screen.queryByRole('button', { name: 'Opdater fra Fabric' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Redigér Brik nr.: QA-SERIAL' })).not.toBeInTheDocument();
    state.enabled = false; rerender(<LoanStockPanel />);
    expect(screen.queryByText('QA-SERIAL')).not.toBeInTheDocument();
  });
});

describe('atomic server sync contract', () => {
  const row = () => Object.fromEntries(FABRIC_LOAN_FIELDS.map((key) => [key, key === 'source_row_number' ? 1 : asset[key as keyof FabricLoanAsset] ?? null]));
  it('accepts only the approved schema and no finance fields', () => {
    expect(validateFabricLoanSnapshot([row()], [...FABRIC_LOAN_FIELDS])).toHaveLength(1);
    expect(() => validateFabricLoanSnapshot([{ ...row(), cost_price: 1 }], [...FABRIC_LOAN_FIELDS])).toThrow();
    expect(() => validateFabricLoanSnapshot([row()], ['company'])).toThrow();
    expect(() => validateFabricLoanSnapshot([{ ...row(), review_required: null }], [...FABRIC_LOAN_FIELDS])).toThrow();
  });
  it('rejects duplicate normalized serial identities instead of silently losing rows', () => {
    expect(() => validateFabricLoanSnapshot([row(), { ...row(), asset_instance_id: 'SERIAL|QA|OTHER', serial_number: ' qa-serial ' }], [...FABRIC_LOAN_FIELDS])).toThrow();
  });
  it('keeps one non-serialized source row regardless of quantity and rejects synthetic expansion', () => {
    const nonSerialized = { ...row(), asset_instance_id: 'LINE|QA|123|1', serial_number: null };
    expect(validateFabricLoanSnapshot([{ ...nonSerialized, inventory_qty: 18 }], [...FABRIC_LOAN_FIELDS])).toEqual([{ ...nonSerialized, inventory_qty: 18 }]);
    expect(() => validateFabricLoanSnapshot([nonSerialized, { ...nonSerialized }], [...FABRIC_LOAN_FIELDS])).toThrow();
    expect(() => validateFabricLoanSnapshot([nonSerialized, { ...nonSerialized, asset_instance_id: 'LINE|QA|123|2', instance_ordinal: 2 }], [...FABRIC_LOAN_FIELDS])).toThrow();
    expect(() => validateFabricLoanSnapshot([nonSerialized, { ...nonSerialized, asset_instance_id: 'LINE|QA|123|OTHER' }], [...FABRIC_LOAN_FIELDS])).toThrow();
  });
  it('allows a complete empty source snapshot with valid metadata', () => {
    expect(validateFabricLoanSnapshot([], [...FABRIC_LOAN_FIELDS])).toEqual([]);
  });
  it('enforces the same bulk-source rule at the signed ingest payload boundary', () => {
    const now = Date.now();
    const sourceAsOf = new Date(now).toISOString();
    const bulk = { ...row(), serial_number: null, serial_number_normalized: null,
      source_as_of: sourceAsOf, asset_instance_id: 'LINE|QA|1|1', inventory_qty: '18' };
    const snapshot = { snapshot_id: '11111111-1111-4111-8111-111111111111', source_as_of: sourceAsOf,
      expected_row_count: 1, rows: [bulk] };
    expect(validateFabricPush(snapshot, now).rows[0].inventory_qty).toBe('18');
    expect(() => validateFabricPush({ ...snapshot, expected_row_count: 2,
      rows: [bulk, { ...bulk, asset_instance_id: 'LINE|QA|1|2', instance_ordinal: 2 }] }, now)).toThrow('INVALID_SNAPSHOT');
  });
  it('never starts a second source read when an existing sync owns the lease', async () => {
    const deps = { begin: vi.fn().mockResolvedValue(null), read: vi.fn(), publish: vi.fn(), fail: vi.fn() };
    expect(await runFabricLoanSync(deps)).toEqual({ status: 'RUNNING' });
    expect(deps.read).not.toHaveBeenCalled();
  });
  it('does not publish any rows after a partial or failed source read', async () => {
    const deps = { begin: vi.fn().mockResolvedValue('run'), read: vi.fn().mockRejectedValue(new Error('private connection details')),
      publish: vi.fn(), fail: vi.fn() };
    await expect(runFabricLoanSync(deps)).rejects.toThrow('SOURCE_UNAVAILABLE');
    expect(deps.publish).not.toHaveBeenCalled(); expect(deps.fail).toHaveBeenCalledWith('run', 'SOURCE_UNAVAILABLE');
  });
  it('publishes only after successful complete schema validation', async () => {
    const deps = { begin: vi.fn().mockResolvedValue('run'), read: vi.fn().mockResolvedValue({ rows: [row()], columns: FABRIC_LOAN_FIELDS, sourceAsOf: new Date().toISOString() }), publish: vi.fn(), fail: vi.fn() };
    expect(await runFabricLoanSync(deps)).toEqual({ status: 'SUCCEEDED', rowCount: 1 });
    expect(deps.publish).toHaveBeenCalledOnce(); expect(deps.fail).not.toHaveBeenCalled();
  });
  it('uses Fabric-side reads, authenticated HTTPS push, private reads and guarded atomic publication', () => {
    const sql = readFileSync('supabase/migrations/20261007160113_fabric_loan_stock_projection.sql', 'utf8');
    const nonSerialMigration = readFileSync('supabase/migrations/20261008094909_support_nonserialized_fabric_loan_assets.sql', 'utf8');
    const fabricView = readFileSync('fabric/loans/loan_assets_current.sql', 'utf8');
    const edge = readFileSync('supabase/functions/fabric-loan-sync/index.ts', 'utf8');
    const picker = readFileSync('src/pages/loans/LoanCasePage.tsx', 'utf8');
    expect(sql).toContain('fabric_loan_ingest_snapshot');
    expect(sql).toContain('loan_request_fabric_refresh');
    expect(sql).toContain('external_snapshot_id uuid unique');
    expect(sql).not.toContain('net.http_post');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('revoke all on function public.fabric_loan_sync_publish(uuid,timestamptz,jsonb) from public, anon, authenticated');
    expect(sql).toContain('STALE_SYNC_LEASE'); expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('set source_present=false'); expect(sql).not.toContain('delete from public.fabric_loan_assets_current');
    expect(nonSerialMigration).toContain('on conflict(asset_instance_id)');
    expect(nonSerialMigration).toContain('Brik number is already assigned');
    expect(fabricView).toContain("NULLIF(TRIM(REPLACE(l.SERIALNUMBER, CHAR(2), '')), '') IS NULL");
    expect(fabricView).toContain("CONCAT('LINE|', company");
    expect(fabricView).not.toContain('CEILING(l.QTY)');
    expect(fabricView).not.toContain('CROSS JOIN digits');
    expect(fabricView).toContain('QTY AS inventory_qty');
    expect(fabricView).toContain('FROM nonserialized_lines');
    expect(fabricView).not.toContain('TRANSACTION_ =');
    expect(edge).toContain("caller.rpc('can_administer_loans')"); expect(edge).toContain('caller.auth.getUser()');
    expect(edge).toContain('verifyFabricSignature'); expect(edge).toContain('validateFabricPush');
    expect(edge).toContain("request.headers.has('Authorization') || request.headers.has('Origin')");
    expect(edge).not.toContain('fabricReader'); expect(edge).not.toContain('readFabricLoanSnapshot');
    expect(picker).toContain('<LoanStockPanel'); expect(picker).not.toContain('listEligibleLoanAssets');
    expect(picker).not.toContain("label('loansSaveDraftFirst')");
  });
});
