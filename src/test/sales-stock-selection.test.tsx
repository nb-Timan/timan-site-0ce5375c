import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import SalesStockSalePanel from '@/pages/loans/SalesStockSalePanel';
import { consumeSalesStockHandoff } from '@/lib/salesStockConfigurator';
import type { FabricLoanAsset, FabricLoanStock } from '@/lib/fabricLoanStock';

const mocks = vi.hoisted(() => ({ stock: null as FabricLoanStock | null, error: false, navigate: vi.fn() }));
vi.mock('@/hooks/useFabricLoanStock', () => ({ useFabricLoanStock: () => ({
  enabled: true, query: { data: mocks.stock, isPending: false, isError: mocks.error },
}) }));
vi.mock('@/context/LanguageContext', () => ({ useLanguage: () => ({ uiLanguage: 'da' }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));

const asset = (id: string, patch: Partial<FabricLoanAsset> = {}): FabricLoanAsset => ({
  asset_id: id, asset_instance_id: `SERIAL|DAT|${id}`, instance_ordinal: 1, company: 'DAT',
  account_number: '1010', order_number: '133225', line_number: 1, item_number: '410040-01',
  item_name: 'RC-751', line_text: `QA ${id}`, serial_number: id, serial_number_normalized: id,
  warehouse_location_code: '2', warehouse_location_name: 'Lager 2', inventory_qty: 1, reserved_qty: 0,
  stock_last_changed: '2026-10-10T10:00:00', classification: 'LOAN_CANDIDATE', review_required: false,
  review_reason: null, identity_conflict: false, source_present: true, item_type: 'machine',
  allocated: false, sales_committed: false, brik_number: null, ...patch,
});

beforeEach(() => {
  vi.clearAllMocks(); mocks.error = false; sessionStorage.clear();
  mocks.stock = { assets: [asset('A'), asset('B', { item_number: '312010-00', item_type: 'equipment',
    warehouse_location_code: '4', account_number: '1020', inventory_qty: 18 })], sync: {
    configured: true, running: false, failed: false, stale: false,
    source_as_of: new Date().toISOString(), last_success_at: new Date().toISOString(), stale_after_seconds: 900,
  } };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const select = (id: string) => fireEvent.click(screen.getByRole('checkbox', { name: `Vælg aktiv: ${id}` }));

describe('sales stock multi-selection', () => {
  it('starts empty, highlights multiple choices, preserves them through filters and transfers every current source field', () => {
    render(<SalesStockSalePanel />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).not.toBeChecked());
    const transfer = screen.getByRole('button', { name: 'Til Configurator' });
    expect(transfer).toBeDisabled();
    select('A'); select('B');
    const checked = screen.getByRole('checkbox', { name: 'Fjern aktiv: A' });
    expect(checked).toBeChecked();
    expect(checked.closest('article')).toHaveClass('bg-emerald-50');
    expect(checked.querySelector('svg')).not.toBeNull();
    expect(screen.getByText('Valgte aktiver: 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lager 2' }));
    fireEvent.click(screen.getByRole('button', { name: '1010' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Søg i salgslager' }), { target: { value: '133225' } });
    expect(screen.getByText('Valgte aktiver: 2')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Fjern aktiv: B' })).not.toBeInTheDocument();
    fireEvent.click(transfer);
    expect(consumeSalesStockHandoff()).toEqual(mocks.stock!.assets);
    expect(mocks.navigate).toHaveBeenCalledWith('/configurator?salesStock=1');
  });

  it('keeps unavailable rows visible with their actual resolver reason and canonical loan number', () => {
    mocks.stock!.assets = [asset('loan', { allocated: true }), asset('sale', { sales_committed: true }),
      asset('brik', { serial_number: null }), asset('master', { item_number: 'UNKNOWN' })];
    mocks.stock!.active_assignments = [{ asset_id: 'loan', loan_number: 'U-QA-01', partner_name: 'QA Partner',
      partner_country: 'DK', status: 'ON_LOAN' }];
    render(<SalesStockSalePanel />);
    screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeDisabled());
    expect(screen.getByText('Allerede reserveret til lån · U-QA-01')).toBeInTheDocument();
    expect(screen.getByText('Allerede reserveret til salg')).toBeInTheDocument();
    expect(screen.getByText('Mangler Brik nr.')).toBeInTheDocument();
    expect(screen.getByText('Mangler Product Master-match')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Søg i salgslager' }), { target: { value: 'U-QA-01' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('protects a shared physical Brik and leaves other independent assets selectable', () => {
    mocks.stock!.assets = [asset('A', { brik_number: 96 }), asset('B', { brik_number: 96 }), asset('C')];
    render(<SalesStockSalePanel />); select('A');
    expect(screen.getByRole('checkbox', { name: 'Vælg aktiv: B' })).toBeDisabled();
    expect(screen.getByText('Samme fysiske redskab er allerede valgt')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Vælg aktiv: C' })).toBeEnabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fjern aktiv: A' }));
    expect(screen.getByRole('checkbox', { name: 'Vælg aktiv: B' })).toBeEnabled();
  });

  it.each(['reservation', 'removed', 'failed read', 'changed grouping'])('revalidates selected assets after %s and blocks transfer until resolved', (change) => {
    const view = render(<SalesStockSalePanel />); select('A'); select('B');
    if (change === 'reservation') mocks.stock!.assets[0] = { ...mocks.stock!.assets[0], allocated: true };
    if (change === 'removed') mocks.stock!.assets = mocks.stock!.assets.slice(1);
    if (change === 'failed read') mocks.error = true;
    if (change === 'changed grouping') mocks.stock!.assets = mocks.stock!.assets.map((item) => ({ ...item, brik_number: 96 }));
    view.rerender(<SalesStockSalePanel />);
    expect(screen.getByRole('button', { name: 'Til Configurator' })).toBeDisabled();
    const selectedPanel = screen.getByRole('region', { name: 'Valgte salgslageraktiver' });
    expect(within(selectedPanel).getAllByRole('alert').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Fjern 410040-01' }));
    expect(screen.getByText('Valgte aktiver: 1')).toBeInTheDocument();
    expect(consumeSalesStockHandoff()).toEqual([]);
  });

  it('transfers the latest source row rather than an outdated selection snapshot', () => {
    const view = render(<SalesStockSalePanel />); select('A');
    mocks.stock!.assets[0] = { ...mocks.stock!.assets[0], order_number: 'NEW-ORDER', brik_number: 55, inventory_qty: 3 };
    view.rerender(<SalesStockSalePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Til Configurator' }));
    expect(consumeSalesStockHandoff()).toEqual([mocks.stock!.assets[0]]);
  });

  it('rechecks freshness at the moment of transfer', () => {
    vi.useFakeTimers(); const now = new Date(); vi.setSystemTime(now);
    render(<SalesStockSalePanel />); select('A');
    vi.setSystemTime(new Date(now.getTime() + 901000));
    fireEvent.click(screen.getByRole('button', { name: 'Til Configurator' }));
    screen.getAllByRole('alert').forEach((alert) => expect(alert).toHaveTextContent('Salgslagerdata er ikke opdateret'));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(consumeSalesStockHandoff()).toEqual([]);
  });
});
