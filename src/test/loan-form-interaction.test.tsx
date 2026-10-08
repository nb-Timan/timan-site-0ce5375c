import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoanCasePage from '@/pages/loans/LoanCasePage';
import type { LoanCase, LoanCaseItem, LoanItemPhoto } from '@/lib/loanService';

const mocks = vi.hoisted(() => ({
  getLoanCase: vi.fn(), listLoanSellers: vi.fn(), listLoanPartners: vi.fn(), listLoanContacts: vi.fn(),
  listEligibleLoanAssets: vi.fn(), createLoanCase: vi.fn(), updateLoanDraft: vi.fn(),
  addLoanAsset: vi.fn(), removeLoanItem: vi.fn(), removeLoanItemPhoto: vi.fn(),
  updateLoanItemUsage: vi.fn(), uploadLoanItemPhoto: vi.fn(), validateLoanImage: vi.fn(),
  submitLoanCaseForReview: vi.fn(),
  confirmLoanDraftSerials: vi.fn(),
}));
const identity = vi.hoisted(() => ({ role: 'timan_backend' }));
vi.mock('@/lib/loanService', () => mocks);
vi.mock('@/context/LanguageContext', () => ({ useLanguage: () => ({ uiLanguage: 'da' }) }));
vi.mock('@/context/AppUserContext', () => ({ useAppUser: () => ({ appUser: {
  id: 'seller', portal_role: identity.role, approved: true, is_active: true, allowed_areas: ['loans'],
} }) }));
vi.mock('@/pages/loans/LoanShell', () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('@/pages/loans/LoanStockPanel', () => ({ default: () => <section aria-label="Salgslager" /> }));

const loan = {
  id: 'case', case_number: 'QA-LOAN', responsible_user_id: 'seller', dealer_account_id: 'partner',
  dealer_contact_id: 'contact', status: 'DRAFT', loan_date: '2026-10-07', expected_return_date: '2026-10-14',
  alternative_delivery_address: false, notes: 'QA only', serial_numbers_confirmed_at: null,
} as LoanCase;
const item = {
  id: 'item', case_id: 'case', item_type: 'machine', product_sku: 'QA-SKU',
  planning_supply_unit_id: 'unit', serial_snapshot: 'QA-SERIAL', product_name_snapshot: 'QA machine',
  warehouse_snapshot: 'Lager 2', warehouse_location_code_snapshot: '2', usage_reading_value: 12,
  usage_reading_unit: 'hours', driving_use_limit: 'Kun intern brug', fabric_account_number_snapshot: '1010',
  fabric_order_number_snapshot: 'SO-100',
} as LoanCaseItem;
const photo = {
  id: 'photo', case_id: 'case', case_item_id: 'item', photo_kind: 'serial_plate',
  storage_path: 'case/item/qa.png', file_name: 'qa.png', preview_url: null,
} as LoanItemPhoto;

function mount(path = '/portal/loans/case') {
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/portal/loans/new" element={<LoanCasePage />} />
    <Route path="/portal/loans/:caseId" element={<LoanCasePage />} />
  </Routes></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.resetAllMocks();
  identity.role = 'timan_backend';
  mocks.getLoanCase.mockResolvedValue({ loanCase: loan, items: [item], photos: [photo] });
  mocks.listLoanSellers.mockResolvedValue([{ id: 'seller', display_name: 'QA Seller', initials: 'QA' }]);
  mocks.listLoanPartners.mockResolvedValue([{ id: 'partner', company_name: 'QA Partner', account_number: 'QA' }]);
  mocks.listLoanContacts.mockResolvedValue([{ id: 'contact', name: 'QA Contact' }]);
  mocks.listEligibleLoanAssets.mockResolvedValue([]);
});
afterEach(cleanup);

describe('Loan form interactions', () => {
  it('hydrates the persisted dates and keeps draft fields editable', async () => {
    mount();
    await screen.findByText('QA-LOAN');
    expect(screen.getByLabelText('Udlånsdato')).toHaveValue('2026-10-07');
    expect(screen.getByLabelText('Noter')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Noter'), { target: { value: 'Updated QA note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem kladde' }));
    await waitFor(() => expect(mocks.updateLoanDraft).toHaveBeenCalledWith('case', expect.objectContaining({
      notes: 'Updated QA note', loanDate: '2026-10-07', expectedReturnDate: '2026-10-14',
    })));
    await screen.findByText('Kladden er gemt.');
  });

  it.each(['READY_FOR_REVIEW', 'ACCEPTED', 'ON_LOAN', 'RETURN_INSPECTION'])('locks agreement fields for %s', async (status) => {
    mocks.getLoanCase.mockResolvedValue({ loanCase: { ...loan, status }, items: [item], photos: [photo] });
    mount();
    await screen.findByText('QA-LOAN');
    expect(screen.getByLabelText('Udlånsdato')).toBeDisabled();
    expect(screen.getByLabelText('Noter')).toBeDisabled();
    expect(screen.getByLabelText('Alternativ leveringsadresse')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Gem kladde' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fortsæt til kontrol' })).not.toBeInTheDocument();
  });

  it('does not present editable agreement fields or pool access to a partner', async () => {
    identity.role = 'timan_dealer';
    mount();
    await screen.findByText('QA-LOAN');
    expect(screen.getByLabelText('Noter')).toBeDisabled();
    expect(mocks.listEligibleLoanAssets).not.toHaveBeenCalled();
    expect(mocks.listLoanSellers).not.toHaveBeenCalled();
  });

  it('keeps an existing photo when a replacement file is invalid', async () => {
    mocks.validateLoanImage.mockImplementation(() => { throw new Error('loan_image_type'); });
    const { container } = mount();
    await screen.findByText('QA-LOAN');
    const replaceLabel = screen.getByText('Udskift billede').closest('label');
    const input = replaceLabel?.querySelector('input');
    expect(input).toBeTruthy();
    fireEvent.change(input!, { target: { files: [new File(['invalid'], 'bad.txt', { type: 'text/plain' })] } });
    await screen.findByText('Brug JPG, PNG eller WebP.');
    expect(mocks.removeLoanItemPhoto).not.toHaveBeenCalled();
    expect(mocks.uploadLoanItemPhoto).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Billede uploadet');
  });

  it('blocks incomplete evidence before any review or version request', async () => {
    mocks.getLoanCase.mockResolvedValue({ loanCase: loan, items: [{ ...item, usage_reading_value: null, usage_reading_unit: null }], photos: [photo] });
    mount();
    await screen.findByText('QA-LOAN');
    fireEvent.click(screen.getByRole('button', { name: 'Fortsæt til kontrol' }));
    expect(await screen.findByText('Tællerstand ved udlån mangler.')).toBeInTheDocument();
    expect(screen.getByText('Enhed')).toBeInTheDocument();
    expect(screen.getByText('Bekræft serienumrene.')).toBeInTheDocument();
    expect(mocks.submitLoanCaseForReview).not.toHaveBeenCalled();
    expect(mocks.updateLoanDraft).not.toHaveBeenCalled();
  });

  it('submits complete checkout to review, not partner acceptance', async () => {
    mount();
    await screen.findByText('QA-LOAN');
    fireEvent.click(screen.getByLabelText(/Jeg bekræfter, at serienumrene/));
    fireEvent.click(screen.getByRole('button', { name: 'Fortsæt til kontrol' }));
    await waitFor(() => expect(mocks.submitLoanCaseForReview).toHaveBeenCalledWith('case', true));
    expect(mocks.updateLoanDraft).toHaveBeenCalledTimes(1);
    await screen.findByText('Klar til intern kontrol');
  });

  it('persists the selected meter unit and usage limit and shows Fabric snapshots', async () => {
    mount();
    await screen.findByText('QA-LOAN');
    expect(screen.getByText(/Konto: 1010/)).toBeInTheDocument();
    expect(screen.getByText(/Ordrenr\.: SO-100/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tællerstand ved udlån *'), { target: { value: '42' } });
    fireEvent.change(screen.getByLabelText('Enhed *'), { target: { value: 'km' } });
    fireEvent.change(screen.getByLabelText('Kørsels-/brugsbegrænsning'), { target: { value: '500 km' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem tællerdata' }));
    await waitFor(() => expect(mocks.updateLoanItemUsage).toHaveBeenCalledWith('case', 'item', {
      value: 42, unit: 'km', limit: '500 km',
    }));
  });

  it('keeps the confirmed serial summary visible in internal review', async () => {
    mocks.getLoanCase.mockResolvedValue({ loanCase: { ...loan, status: 'READY_FOR_REVIEW', serial_numbers_confirmed_at: '2026-10-07T12:00:00Z' }, items: [item], photos: [photo] });
    mount();
    expect(await screen.findByRole('region', { name: 'Klar til intern kontrol' })).toHaveTextContent('Jeg bekræfter, at serienumrene');
  });
});
