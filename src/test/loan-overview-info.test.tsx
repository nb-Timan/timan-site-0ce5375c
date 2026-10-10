import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoanOverviewInfoPopover from '@/pages/loans/LoanOverviewInfoPopover';
import LoansPage from '@/pages/loans/LoansPage';
import type { LoanCaseItem, LoanCaseSummary, LoanOverviewInfo, LoanReturnSummary } from '@/lib/loanService';
import { t } from '@/lib/i18n/translations';

const mocks = vi.hoisted(() => ({ getLoanOverviewInfo: vi.fn(), listLoanCases: vi.fn(), updateLoanExpectedReturn: vi.fn() }));
vi.mock('@/lib/loanService', () => mocks);
vi.mock('@/context/LanguageContext', () => ({ useLanguage: () => ({ uiLanguage: 'da' }) }));
vi.mock('@/context/AppUserContext', () => ({ useAppUser: () => ({ appUser: { id: 'qa', portal_role: 'timan_backend', approved: true, is_active: true, allowed_areas: ['loans'] } }) }));
vi.mock('@/pages/loans/LoanShell', () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('@/pages/loans/LoanStockPanel', () => ({ default: () => null }));
vi.mock('@/pages/loans/SalesStockSalePanel', () => ({ default: () => null }));
const click = (element: HTMLElement) => { act(() => element.focus()); fireEvent.click(element); };
const label = (key: string) => t(key, 'da');
const loan = { id: 'case', loan_number: 'U-6608', partner_name: 'QA Partner', responsible_name: 'QA Timan', status: 'RETURN_INSPECTION', asset_count: 2, updated_at: '2026-10-10' } as LoanCaseSummary;
const detail = (): LoanOverviewInfo => ({
  delivery: { alternative_delivery_address: false, delivery_address: 'Historisk vej 1', delivery_postal_code: '8600', delivery_city: 'Silkeborg', delivery_country: 'DK', delivery_contact: 'Gemte partnernavn' },
  notes: 'Første linje\nAnden linje',
  items: [
    { id: 'a', product_sku: '410040-01', product_name_snapshot: 'RC-751', serial_snapshot: 'SERIAL-QA' },
    { id: 'b', product_sku: '730600-00', product_name_snapshot: 'Ukrudtsbørste', brik_number_snapshot: 82 },
  ] as LoanCaseItem[],
  returnSummary: [{ case_item_id: 'a', receipt_status: 'RECEIVED', is_outstanding: false }, { case_item_id: 'b', receipt_status: null, is_outstanding: true }] as LoanReturnSummary[],
});
beforeEach(() => { vi.resetAllMocks(); mocks.getLoanOverviewInfo.mockResolvedValue(detail()); mocks.listLoanCases.mockResolvedValue([loan]); });
afterEach(cleanup);
const mount = (kind: 'assets' | 'delivery' | 'notes', item = loan) => render(<LoanOverviewInfoPopover item={item} kind={kind} label={label} loadInfo={mocks.getLoanOverviewInfo} />);

describe('read-only loan overview information', () => {
  it('lazily opens actual multiple asset snapshots on hover, including mixed receipt status, serial and Brik', async () => {
    mount('assets'); expect(mocks.getLoanOverviewInfo).not.toHaveBeenCalled();
    fireEvent.pointerEnter(screen.getByRole('button'));
    const popup = await screen.findByRole('dialog', { name: 'Maskiner og redskaber' });
    await within(popup).findByText('RC-751');
    for (const text of ['Ukrudtsbørste', 'Varenr.: 410040-01', 'Varenr.: 730600-00', 'Serienr.: SERIAL-QA', 'Brik nr.: 82', 'Modtaget', 'Udlånt']) expect(within(popup).getByText(text)).toBeInTheDocument();
    fireEvent.pointerLeave(screen.getByRole('button', { name: /U-6608/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('keeps the scrollable hover popup open while the pointer moves into its portal', async () => {
    mount('assets'); const trigger = screen.getByRole('button');
    fireEvent.pointerEnter(trigger); const popup = await screen.findByRole('dialog');
    fireEvent.pointerLeave(trigger); fireEvent.pointerEnter(popup);
    await new Promise((resolve) => setTimeout(resolve, 220));
    expect(popup).toBeInTheDocument();
    fireEvent.pointerLeave(popup); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it.each([false, true])('shows the saved chosen address (alternative=%s), never live partner data', async (alternative) => {
    const info = detail(); info.delivery.alternative_delivery_address = alternative;
    mocks.getLoanOverviewInfo.mockResolvedValue(info); mount('delivery');
    click(screen.getByRole('button'));
    await screen.findByText('Historisk vej 1');
    expect(screen.getByText(alternative ? 'Alternativ leveringsadresse' : 'Partnerens adresse')).toBeInTheDocument();
    expect(screen.getByText('Gemte partnernavn')).toBeInTheDocument();
    expect(screen.getByText('8600 Silkeborg')).toBeInTheDocument();
  });
  it('preserves full multiline notes and supports focus, Escape and reopening', async () => {
    mount('notes'); const trigger = screen.getByRole('button');
    fireEvent.focus(trigger); await screen.findByText('Første linje Anden linje');
    expect(screen.getByText('Første linje Anden linje').textContent).toBe('Første linje\nAnden linje');
    click(trigger); expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button')).toHaveFocus();
    click(trigger); await screen.findByRole('dialog');
    click(screen.getByRole('button', { name: 'Luk' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('handles missing address, missing note and empty assets without inventing data', async () => {
    const info = detail(); info.delivery = { ...info.delivery, delivery_contact: null, delivery_address: null, delivery_city: null, delivery_postal_code: null, delivery_country: null }; info.notes = ' '; info.items = [];
    mocks.getLoanOverviewInfo.mockResolvedValue(info);
    const view = mount('delivery'); click(screen.getByRole('button')); await screen.findByText('Adresse ikke registreret');
    view.unmount(); const notes = mount('notes'); click(screen.getByRole('button')); await screen.findByText('Ingen bemærkning registreret');
    notes.unmount(); mount('assets'); click(screen.getByRole('button')); await screen.findByText('Ingen aktiver registreret');
  });
  it('closes on an outside pointer and opens by click without navigation', async () => {
    render(<><LoanOverviewInfoPopover item={loan} kind="assets" label={label} loadInfo={mocks.getLoanOverviewInfo} /><button>Outside</button></>);
    click(screen.getByRole('button', { name: /U-6608/ })); await screen.findByRole('dialog');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }), { pointerType: 'mouse' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  it('surfaces access/read errors without displaying cached data from another case', async () => {
    mocks.getLoanOverviewInfo.mockRejectedValue(new Error('Denied')); mount('assets');
    click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveTextContent(label('loansLoadError'));
    expect(screen.queryByText('RC-751')).not.toBeInTheDocument();
  });
  it('shows one fully received asset and preserves its exact SKU and description', async () => {
    const info = detail(); info.items = [info.items[0]];
    mocks.getLoanOverviewInfo.mockResolvedValue(info); mount('assets', { ...loan, status: 'CLOSED_OK', asset_count: 1 });
    click(screen.getByRole('button')); await screen.findByText('RC-751');
    expect(screen.getByText('Varenr.: 410040-01')).toBeInTheDocument();
    expect(screen.getByText('Modtaget')).toBeInTheDocument();
    expect(screen.queryByText('Ukrudtsbørste')).not.toBeInTheDocument();
  });
  it('does not present a cancelled case asset as still on loan', async () => {
    mount('assets', { ...loan, status: 'CANCELLED' }); click(screen.getByRole('button'));
    await screen.findByText('RC-751'); expect(screen.getAllByText('Annulleret')).toHaveLength(2);
    expect(screen.queryByText('Udlånt')).not.toBeInTheDocument();
  });
  it('uses the same lazy read for all fields, with active/completed/all filters and existing Open actions intact', async () => {
    const closed = { ...loan, id: 'closed', loan_number: 'U-6609', status: 'CLOSED_OK' };
    const cancelled = { ...loan, id: 'cancelled', loan_number: 'U-6610', status: 'CANCELLED' };
    mocks.listLoanCases.mockResolvedValue([loan, closed, cancelled]);
    render(<MemoryRouter><LoansPage /></MemoryRouter>);
    const assets = (await screen.findAllByRole('button', { name: /U-6608 —/ }))[0];
    expect(screen.queryByText('U-6609')).not.toBeInTheDocument();
    click(assets); await screen.findByText('RC-751');
    click(screen.getByRole('button', { name: 'Luk' }));
    click(screen.getAllByRole('button', { name: /QA Partner —/ })[0]); await screen.findByText('Historisk vej 1');
    click(screen.getByRole('button', { name: 'Luk' }));
    click(screen.getAllByRole('button', { name: /QA Timan —/ })[0]); await screen.findByText('Første linje Anden linje');
    expect(mocks.getLoanOverviewInfo).toHaveBeenCalledOnce();
    expect(mocks.getLoanOverviewInfo).toHaveBeenCalledWith('case');
    click(screen.getByRole('button', { name: 'Luk' }));
    click(screen.getByRole('button', { name: 'Afsluttede' }));
    expect(screen.queryByText('U-6608')).not.toBeInTheDocument(); expect(screen.getAllByText('U-6609')).toHaveLength(2);
    click(screen.getAllByRole('button', { name: /U-6610 —/ })[0]); await screen.findByText('RC-751');
    expect(mocks.getLoanOverviewInfo).toHaveBeenLastCalledWith('cancelled');
    click(screen.getByRole('button', { name: 'Luk' }));
    click(screen.getByRole('button', { name: 'Alle' }));
    expect(screen.getAllByText('U-6608')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Åbn' })[0]).toHaveAttribute('href', '/portal/loans/case');
    expect(mocks.updateLoanExpectedReturn).not.toHaveBeenCalled();
  });
});
