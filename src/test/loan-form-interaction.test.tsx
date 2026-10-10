import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoanCasePage from '@/pages/loans/LoanCasePage';
import LoansPage from '@/pages/loans/LoansPage';
import type { FabricLoanAsset } from '@/lib/fabricLoanStock';
import type { LoanCase, LoanCaseItem, LoanItemPhoto } from '@/lib/loanService';

const mocks = vi.hoisted(() => ({
  getLoanCase: vi.fn(), listLoanCaseHistory: vi.fn(), listLoanSellers: vi.fn(), listLoanPartners: vi.fn(), listLoanContacts: vi.fn(),
  listEligibleLoanAssets: vi.fn(), createLoanCase: vi.fn(), updateLoanDraft: vi.fn(), updateLoanCaseRelationships: vi.fn(),
  addLoanAsset: vi.fn(), addFabricLoanAsset: vi.fn(), removeLoanItem: vi.fn(), removeLoanItemPhoto: vi.fn(),
  updateLoanItemUsage: vi.fn(), uploadLoanItemPhoto: vi.fn(), validateLoanImage: vi.fn(),
  submitLoanCaseForReview: vi.fn(),
  confirmLoanDraftSerials: vi.fn(),
  reopenLoanForEdit: vi.fn(),
  cancelLoanDraft: vi.fn(),
  listLoanCases: vi.fn(), updateLoanExpectedReturn: vi.fn(), toastSuccess: vi.fn(),
}));
const identity = vi.hoisted(() => ({ role: 'timan_backend' }));
vi.mock('@/lib/loanService', () => mocks);
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess } }));
vi.mock('@/pages/loans/SalesStockSalePanel', () => ({ default: () => null }));
vi.mock('@/lib/fabricLoanStockService', () => ({ addFabricLoanAsset: mocks.addFabricLoanAsset }));
vi.mock('@/context/LanguageContext', () => ({ useLanguage: () => ({ uiLanguage: 'da' }) }));
vi.mock('@/context/AppUserContext', () => ({ useAppUser: () => ({ appUser: {
  id: 'seller', portal_role: identity.role, approved: true, is_active: true, allowed_areas: ['loans'],
} }) }));
vi.mock('@/pages/loans/LoanShell', () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('@/pages/loans/LoanStockPanel', () => ({ default: ({ onSelect }: { onSelect: (asset: FabricLoanAsset) => void }) => <section aria-label="Salgslager"><button type="button" onClick={() => onSelect({
  asset_id: 'asset-2', asset_instance_id: 'SERIAL|TIMAN|QA-SERIAL-2', instance_ordinal: 1,
  company: 'TIMAN', account_number: '1010', order_number: null, line_number: 2,
  item_number: 'QA-SKU-2', item_name: 'QA machine 2', line_text: null, serial_number: 'QA-SERIAL-2',
  serial_number_normalized: 'QA-SERIAL-2', warehouse_location_code: '2', warehouse_location_name: 'Lager 2',
  inventory_qty: 1, reserved_qty: 0, stock_last_changed: '2026-10-08', classification: 'LOAN_CANDIDATE',
  review_required: false, review_reason: null, identity_conflict: false, source_present: true, item_type: 'machine',
  allocated: false, brik_number: null,
})}>Vælg QA-aktiv</button></section> }));

const loan = {
  id: 'case', loan_number: 'QA-LOAN', case_number: 'LN-000001', responsible_user_id: 'seller', dealer_account_id: 'partner',
  dealer_contact_id: 'contact', status: 'DRAFT', loan_date: '2026-10-07', expected_return_date: '2026-10-14',
  alternative_delivery_address: false, notes: 'QA only', serial_numbers_confirmed_at: null,
} as LoanCase;
const item = {
  id: 'item', case_id: 'case', item_type: 'machine', product_sku: 'QA-SKU',
  planning_supply_unit_id: 'unit', serial_snapshot: 'QA-SERIAL', asset_instance_id_snapshot: null,
  brik_number_snapshot: null, product_name_snapshot: 'QA machine',
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
    <Route path="/portal/loans" element={<LoansPage />} />
  </Routes></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.resetAllMocks();
  identity.role = 'timan_backend';
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  mocks.getLoanCase.mockResolvedValue({ loanCase: loan, items: [item], photos: [photo] });
  mocks.listLoanCaseHistory.mockResolvedValue([]);
  mocks.listLoanSellers.mockResolvedValue([{ id: 'seller', display_name: 'QA Seller', initials: 'QA' }]);
  mocks.listLoanPartners.mockResolvedValue([{ id: 'partner', company_name: 'QA Partner', account_number: 'QA' }]);
  mocks.listLoanContacts.mockResolvedValue([{ id: 'contact', name: 'QA Contact' }]);
  mocks.listEligibleLoanAssets.mockResolvedValue([]);
  mocks.listLoanCases.mockResolvedValue([{ ...loan, status: 'READY_FOR_REVIEW', asset_count: 1,
    partner_name: 'QA Partner', responsible_name: 'QA Seller' }]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Loan form interactions', () => {
  it('shows cancel only for Backend when server confirms never-issued eligibility', async () => {
    mocks.getLoanCase.mockResolvedValue({ loanCase: loan, items: [item], photos: [photo], lifecycleState: { can_cancel_draft: true } });
    const mounted = mount();
    expect(await screen.findByRole('button', { name: 'Slet' })).toBeInTheDocument();
    mounted.unmount();
    identity.role = 'timan_seller';
    mount();
    await screen.findByText('QA-LOAN');
    expect(screen.queryByRole('button', { name: 'Slet' })).not.toBeInTheDocument();
  });
  it('keeps completed detail read-only and displays the full append-only timeline beyond 20 events', async () => {
    mocks.getLoanCase.mockResolvedValue({ loanCase: { ...loan, status: 'CLOSED_OK' }, items: [item], photos: [photo], lifecycleState: { can_cancel_draft: false } });
    mocks.listLoanCaseHistory.mockResolvedValue(Array.from({ length: 25 }, (_, n) => ({ id: `event-${n}`, event_type: 'CASE_CANCELLED', actor_name: 'QA', created_at: '2026-10-09T08:00:00Z', metadata: { reason: `Retained event ${n}` } })));
    mount();
    await screen.findByText('Retained event 24');
    expect(screen.getByLabelText('Noter')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Slet' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gem kladde' })).not.toBeInTheDocument();
    expect(screen.getByText(/Serienr\.: QA-SERIAL/)).toBeInTheDocument();
  });
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
    expect(screen.getByRole('button', { name: 'Gem kladde' })).toBeInTheDocument();
    expect(mocks.listLoanCases).not.toHaveBeenCalled();
    expect(mocks.submitLoanCaseForReview).not.toHaveBeenCalled();
  });

  it('keeps loan and expected-return dates in one responsive two-column row', async () => {
    mount();
    await screen.findByText('QA-LOAN');
    expect(screen.getByTestId('loan-date-row')).toHaveClass('sm:grid-cols-2');
    expect(screen.getByTestId('loan-date-row')).not.toHaveClass('grid-cols-2');
  });

  it('renders multiple machines and attachments under the same loan number', async () => {
    mocks.getLoanCase.mockResolvedValue({ loanCase: loan, items: [item,
      { ...item, id: 'machine-2', product_name_snapshot: 'QA machine 2', serial_snapshot: 'QA-SERIAL-2' },
      { ...item, id: 'equipment-1', item_type: 'equipment', product_name_snapshot: 'QA attachment', serial_snapshot: 'QA-EQUIPMENT-1', usage_reading_value: null, usage_reading_unit: null },
    ], photos: [photo] });
    mount();
    await screen.findByText('QA-LOAN');
    expect(screen.getByText('QA machine')).toBeInTheDocument();
    expect(screen.getByText('QA machine 2')).toBeInTheDocument();
    expect(screen.getByText('QA attachment')).toBeInTheDocument();
  });

  it('keeps selected assets visible before the stock picker and hides the long picker by default', async () => {
    mount();
    await screen.findByText('QA-LOAN');
    expect(screen.getByText('QA machine')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Salgslager' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tilføj maskine eller redskab' }));
    const selected = screen.getByTestId('selected-loan-assets');
    const picker = await screen.findByRole('region', { name: 'Salgslager' });
    expect(selected.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Luk Salgslager' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('adds another physical asset to the same case, shows both selections, and closes the picker', async () => {
    const secondItem = { ...item, id: 'item-2', product_sku: 'QA-SKU-2', product_name_snapshot: 'QA machine 2', serial_snapshot: 'QA-SERIAL-2' };
    mocks.getLoanCase
      .mockResolvedValueOnce({ loanCase: loan, items: [item], photos: [photo] })
      .mockResolvedValue({ loanCase: loan, items: [item, secondItem], photos: [photo] });
    mount();
    await screen.findByText('QA-LOAN');
    fireEvent.click(screen.getByRole('button', { name: 'Tilføj maskine eller redskab' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Vælg QA-aktiv' }));

    await waitFor(() => expect(mocks.addFabricLoanAsset).toHaveBeenCalledWith('case', 'asset-2'));
    expect(await screen.findByText('QA machine 2')).toBeInTheDocument();
    expect(screen.getByText('QA machine')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Salgslager' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tilføj maskine eller redskab' })).toHaveAttribute('aria-expanded', 'false');
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
    expect(screen.getByLabelText(/^Enhed \*/)).toBeInTheDocument();
    expect(screen.getAllByText('Bekræft serienumrene.')).toHaveLength(1);
    expect(screen.queryByText('Udfyld den manglende dokumentation, før du fortsætter.')).not.toBeInTheDocument();
    expect(mocks.listLoanCases).not.toHaveBeenCalled();
    expect(mocks.submitLoanCaseForReview).not.toHaveBeenCalled();
    expect(mocks.updateLoanDraft).not.toHaveBeenCalled();
    const reading = screen.getByLabelText(/^Tællerstand ved udlån \*/);
    expect(reading).toHaveClass('border-red-500');
    expect(reading).toHaveFocus();
    fireEvent.change(reading, { target: { value: '12' } });
    expect(reading).not.toHaveClass('border-red-500');
    expect(screen.getByLabelText(/Jeg bekræfter, at serienummer eller Brik nr\./).closest('label')).toHaveClass('border-red-400');
    fireEvent.click(screen.getByLabelText(/Jeg bekræfter, at serienummer eller Brik nr\./));
    expect(screen.getByLabelText(/Jeg bekræfter, at serienummer eller Brik nr\./).closest('label')).not.toHaveClass('border-red-400');
  });

  it('marks a missing type-plate photo on the exact photo control', async () => {
    mocks.getLoanCase.mockResolvedValue({ loanCase: loan, items: [item], photos: [] });
    mount();
    await screen.findByText('QA-LOAN');
    fireEvent.click(screen.getByRole('button', { name: 'Fortsæt til kontrol' }));
    expect(await screen.findByText('Foto af typeskilt mangler.')).toBeInTheDocument();
    expect(screen.getByText('Foto af typeskilt *').parentElement).toHaveClass('border-red-400');
  });

  it('lets Backend reopen a review-ready loan for audited editing', async () => {
    mocks.getLoanCase
      .mockResolvedValueOnce({ loanCase: { ...loan, status: 'READY_FOR_REVIEW', serial_numbers_confirmed_at: '2026-10-07T12:00:00Z' }, items: [item], photos: [photo] })
      .mockResolvedValueOnce({ loanCase: { ...loan, status: 'DRAFT', serial_numbers_confirmed_at: null }, items: [item], photos: [photo] });
    mount();
    await screen.findByText('QA-LOAN');
    fireEvent.click(screen.getByRole('button', { name: 'Genåbn for redigering' }));
    await waitFor(() => expect(mocks.reopenLoanForEdit).toHaveBeenCalledWith('case'));
    expect(await screen.findByLabelText(/Jeg bekræfter, at serienummer eller Brik nr\./)).not.toBeChecked();
  });

  it('waits for successful server review before returning to the freshly loaded overview', async () => {
    let finishReview!: () => void;
    mocks.submitLoanCaseForReview.mockReturnValue(new Promise<void>((resolve) => { finishReview = resolve; }));
    mount();
    await screen.findByText('QA-LOAN');
    fireEvent.click(screen.getByLabelText(/Jeg bekræfter, at serienummer eller Brik nr\./));
    fireEvent.click(screen.getByRole('button', { name: 'Fortsæt til kontrol' }));
    await waitFor(() => expect(mocks.submitLoanCaseForReview).toHaveBeenCalledWith('case', true));
    expect(mocks.updateLoanDraft).toHaveBeenCalledTimes(1);
    expect(mocks.updateLoanCaseRelationships).toHaveBeenCalledWith('case', { sellerId: 'seller', partnerId: 'partner', contactId: 'contact' });
    expect(mocks.listLoanCases).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Fortsæt til kontrol' })).toBeDisabled();
    await act(async () => finishReview());
    expect(await screen.findByRole('tab', { name: 'Udlån' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getAllByText('QA-LOAN')).toHaveLength(2));
    expect(screen.getAllByText('Klar til kontrol')).toHaveLength(2);
    expect(mocks.listLoanCases).toHaveBeenCalledOnce();
    expect(mocks.toastSuccess).toHaveBeenCalledWith('QA-LOAN · Klar til intern kontrol');
    expect(screen.queryByRole('button', { name: 'Fortsæt til kontrol' })).not.toBeInTheDocument();
  });

  it.each(['updateLoanCaseRelationships', 'updateLoanDraft', 'updateLoanItemUsage', 'submitLoanCaseForReview'] as const)('stays on the form when %s fails', async (stage) => {
    mocks[stage].mockRejectedValue({ message: 'QA server failure' });
    mount();
    await screen.findByText('QA-LOAN');
    fireEvent.change(screen.getByLabelText(/^Tællerstand ved udlån \*/), { target: { value: '42' } });
    fireEvent.click(screen.getByLabelText(/Jeg bekræfter, at serienummer eller Brik nr\./));
    fireEvent.click(screen.getByRole('button', { name: 'Fortsæt til kontrol' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('QA server failure');
    expect(screen.getByRole('button', { name: 'Fortsæt til kontrol' })).toBeEnabled();
    expect(mocks.listLoanCases).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    if (stage !== 'submitLoanCaseForReview') expect(mocks.submitLoanCaseForReview).not.toHaveBeenCalled();
  });

  it('marks only the physical asset whose serial/Brik identity is missing', async () => {
    mocks.getLoanCase.mockResolvedValue({ loanCase: loan, items: [item, { ...item, id: 'missing', serial_snapshot: null, product_name_snapshot: 'Missing identity' }], photos: [photo] });
    mount();
    await screen.findByText('QA-LOAN');
    fireEvent.click(screen.getByRole('button', { name: 'Fortsæt til kontrol' }));
    expect(screen.getByText('Missing identity').closest('article')).toHaveClass('border-red-400');
    expect(screen.getByText('QA machine').closest('article')).not.toHaveClass('border-red-400');
    expect(mocks.submitLoanCaseForReview).not.toHaveBeenCalled();
  });

  it('blocks review while a required photo upload is pending and stays after upload failure', async () => {
    let failUpload!: (cause: Error) => void;
    mocks.uploadLoanItemPhoto.mockReturnValue(new Promise<void>((_, reject) => { failUpload = reject; }));
    mount();
    await screen.findByText('QA-LOAN');
    fireEvent.click(screen.getByLabelText(/Jeg bekræfter, at serienummer eller Brik nr\./));
    const input = screen.getByText('Udskift billede').closest('label')!.querySelector('input')!;
    fireEvent.change(input, { target: { files: [new File(['qa'], 'qa.png', { type: 'image/png' })] } });
    await waitFor(() => expect(mocks.uploadLoanItemPhoto).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Fortsæt til kontrol' })).toBeDisabled();
    expect(mocks.submitLoanCaseForReview).not.toHaveBeenCalled();
    await act(async () => failUpload(new Error('QA upload failed')));
    expect(await screen.findByRole('alert')).toHaveTextContent('QA upload failed');
    expect(mocks.listLoanCases).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('persists the selected meter unit and usage limit and shows Fabric snapshots', async () => {
    mount();
    await screen.findByText('QA-LOAN');
    expect(screen.getByText(/Konto: 1010/)).toBeInTheDocument();
    expect(screen.getByText(/Ordrenr\.: SO-100/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Tællerstand ved udlån \*/), { target: { value: '42' } });
    fireEvent.change(screen.getByLabelText(/^Enhed \*/), { target: { value: 'km' } });
    fireEvent.change(screen.getByLabelText('Kørsels-/brugsbegrænsning'), { target: { value: '500 km' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem tællerdata' }));
    await waitFor(() => expect(mocks.updateLoanItemUsage).toHaveBeenCalledWith('case', 'item', {
      value: 42, unit: 'km', limit: '500 km',
    }));
  });

  it('keeps the confirmed serial summary visible in internal review', async () => {
    mocks.getLoanCase.mockResolvedValue({ loanCase: { ...loan, status: 'READY_FOR_REVIEW', serial_numbers_confirmed_at: '2026-10-07T12:00:00Z' }, items: [item], photos: [photo] });
    mount();
    expect(await screen.findByRole('region', { name: 'Klar til intern kontrol' })).toHaveTextContent('Jeg bekræfter, at serienummer eller Brik nr.');
  });

  it('selects from the existing seller-scoped partner list and reloads only that partner contacts', async () => {
    mocks.listLoanPartners.mockResolvedValue([
      { id: 'partner', company_name: 'QA Partner', account_number: 'QA' },
      { id: 'partner-new', company_name: 'AB Lauridsen Maskiner ApS', account_number: '10295' },
    ]);
    mocks.listLoanContacts.mockImplementation(async (id: string) => id === 'partner-new'
      ? [{ id: 'contact-new', name: 'QA new contact' }] : [{ id: 'contact', name: 'QA Contact' }]);
    mount(); await screen.findByText('QA-LOAN');
    await waitFor(() => expect(screen.getByLabelText('Kontaktperson')).toHaveValue('contact'));
    fireEvent.click(screen.getByRole('combobox', { name: 'Samarbejdspartner' }));
    fireEvent.change(screen.getByPlaceholderText('Søg forhandler eller kontonummer...'), { target: { value: '10295' } });
    expect(screen.getByLabelText('Kontaktperson')).toHaveValue('contact');
    fireEvent.click(await screen.findByRole('option', { name: '10295 · AB Lauridsen Maskiner ApS' }));
    await screen.findByRole('option', { name: 'QA new contact' });
    expect(screen.getByLabelText('Kontaktperson')).toHaveValue('');
    expect(mocks.listLoanContacts).toHaveBeenCalledWith('partner-new');
    expect(mocks.listLoanPartners.mock.calls.every(([seller]) => seller === 'seller')).toBe(true);
    expect(mocks.updateLoanCaseRelationships).not.toHaveBeenCalled();
  });

  it('saves canonical partner/contact IDs and hydrates the same selected partner on reopen', async () => {
    const partner = { id: 'partner-new', company_name: 'AB Lauridsen Maskiner ApS', account_number: '10295' };
    mocks.listLoanPartners.mockResolvedValue([{ id: 'partner', company_name: 'QA Partner', account_number: 'QA' }, partner]);
    mocks.listLoanContacts.mockImplementation(async (id: string) => id === 'partner-new'
      ? [{ id: 'contact-new', name: 'QA new contact' }] : [{ id: 'contact', name: 'QA Contact' }]);
    const mounted = mount(); await screen.findByText('QA-LOAN');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Samarbejdspartner' })).toHaveTextContent('QA Partner'));
    fireEvent.click(screen.getByRole('combobox', { name: 'Samarbejdspartner' }));
    fireEvent.click(await screen.findByRole('option', { name: '10295 · AB Lauridsen Maskiner ApS' }));
    await screen.findByRole('option', { name: 'QA new contact' });
    fireEvent.change(screen.getByLabelText('Kontaktperson'), { target: { value: 'contact-new' } });
    const saved = { ...loan, dealer_account_id: partner.id, dealer_contact_id: 'contact-new' };
    mocks.updateLoanCaseRelationships.mockImplementation(async () => { mocks.getLoanCase.mockResolvedValue({ loanCase: saved, items: [item], photos: [photo] }); });
    fireEvent.click(screen.getByRole('button', { name: 'Gem kladde' }));
    await screen.findByText('Kladden er gemt.');
    expect(mocks.updateLoanCaseRelationships).toHaveBeenCalledWith('case', { sellerId: 'seller', partnerId: 'partner-new', contactId: 'contact-new' });
    mounted.unmount(); mount(); await screen.findByText('QA-LOAN');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Samarbejdspartner' })).toHaveTextContent('10295 · AB Lauridsen Maskiner ApS'));
    await waitFor(() => expect(screen.getByLabelText('Kontaktperson')).toHaveValue('contact-new'));
  });

  it('clears dependent choices on seller change and ignores an old in-flight partner response', async () => {
    let oldResponse!: (partners: unknown[]) => void;
    mocks.listLoanSellers.mockResolvedValue([{ id: 'seller', display_name: 'QA Seller', initials: 'QA' }, { id: 'seller-next', display_name: 'Next seller', initials: 'QN' }]);
    mocks.listLoanPartners.mockImplementation((seller: string) => seller === 'seller'
      ? new Promise((resolve) => { oldResponse = resolve; })
      : Promise.resolve([{ id: 'new-scope', company_name: 'New scoped partner', account_number: 'NEXT' }]));
    mount('/portal/loans/new');
    await screen.findByRole('option', { name: 'QA · QA Seller' });
    expect(screen.getByRole('combobox', { name: 'Samarbejdspartner' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Ansvarlig Timan-sælger'), { target: { value: 'seller' } });
    await waitFor(() => expect(mocks.listLoanPartners).toHaveBeenCalledWith('seller'));
    fireEvent.change(screen.getByLabelText('Ansvarlig Timan-sælger'), { target: { value: 'seller-next' } });
    await waitFor(() => expect(mocks.listLoanPartners).toHaveBeenCalledWith('seller-next'));
    await act(async () => oldResponse([{ id: 'old-scope', company_name: 'Old scoped partner', account_number: 'OLD' }]));
    fireEvent.click(screen.getByRole('combobox', { name: 'Samarbejdspartner' }));
    expect(await screen.findByRole('option', { name: 'NEXT · New scoped partner' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Old scoped partner/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Kontaktperson')).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Samarbejdspartner' })).toHaveTextContent('Vælg samarbejdspartner');
  });
});
