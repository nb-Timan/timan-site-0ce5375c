import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LoanReturnPage from '@/pages/loans/LoanReturnPage';
import {
  calculateLoanUsage,
  getLoanReturnIssues,
  isLoanEligibleForReceipt,
  loanStatusTranslationKey,
  loanReceiptGroupKey,
  type LoanReturnDraftItem,
} from '@/lib/loanDomain';
import { isInternalTimanPortalRole } from '@/lib/portalAccess';
import type { LoanCase, LoanCaseItem, LoanItemPhoto, LoanReturnSummary } from '@/lib/loanService';

const sql = readFileSync('supabase/migrations/20261009055619_operational_loan_returns.sql', 'utf8');
const mocks = vi.hoisted(() => ({
  getLoanCase: vi.fn(), receiveLoanAssets: vi.fn(), uploadLoanReturnPhoto: vi.fn(), removeLoanReturnPhoto: vi.fn(),
}));
const identity = vi.hoisted(() => ({ role: 'timan_backend' }));
vi.mock('@/lib/loanService', () => mocks);
vi.mock('@/context/LanguageContext', () => ({ useLanguage: () => ({ uiLanguage: 'da' }) }));
vi.mock('@/context/AppUserContext', () => ({ useAppUser: () => ({ appUser: {
  id: 'actor', portal_role: identity.role, approved: true, is_active: true, allowed_areas: ['loans'],
} }) }));
vi.mock('@/pages/loans/LoanShell', () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));

const loan = { id: 'case', loan_number: 'U-QA-6603', case_number: 'LN-QA', responsible_user_id: 'actor', dealer_account_id: 'partner', dealer_contact_id: 'contact', created_by: 'actor', status: 'ON_LOAN', loan_date: '2026-10-01', expected_return_date: '2026-10-20' } as LoanCase;
const machine = { id: 'machine', case_id: 'case', item_type: 'machine', product_sku: '410040', product_name_snapshot: 'RC-751', serial_snapshot: '410040-01-0386', brik_number_snapshot: 194, usage_reading_value: 12, usage_reading_unit: 'hours' } as LoanCaseItem;
const attachment = { id: 'attachment', case_id: 'case', item_type: 'equipment', product_sku: '411666', product_name_snapshot: 'Weed Brush', serial_snapshot: null, brik_number_snapshot: 194, usage_reading_value: null, usage_reading_unit: null } as LoanCaseItem;
const summary = (item: LoanCaseItem): LoanReturnSummary => ({ case_item_id: item.id, item_type: item.item_type, product_sku: item.product_sku, product_name: item.product_name_snapshot, serial_number: item.serial_snapshot, brik_number: item.brik_number_snapshot, checkout_usage_reading: item.usage_reading_value, usage_reading_unit: item.usage_reading_unit, return_usage_reading: null, calculated_usage: null, serial_confirmed: false, brik_confirmed: false, receipt_status: null, returned_at: null, returned_by_name: null, notes: null, lower_reading_explanation: null, is_outstanding: true, has_return_meter_photo: false, has_return_condition_photo: false });

Object.assign(machine, { asset_instance_id_snapshot: 'SERIAL|DAT|410040-01-0386' });
Object.assign(attachment, { asset_instance_id_snapshot: 'LINE|DAT|1|1' });

beforeEach(() => {
  vi.resetAllMocks(); identity.role = 'timan_backend';
  mocks.getLoanCase.mockResolvedValue({ loanCase: loan, items: [machine, attachment], photos: [], returnSummary: [summary(machine), summary(attachment)], returnState: { case_id: 'case', outstanding_asset_count: 2, received_asset_count: 0, review_required_count: 0, can_receive: true, presentation_state: 'ON_LOAN' } });
  mocks.receiveLoanAssets.mockResolvedValue('inspection');
});
afterEach(cleanup);

function mount() {
  return render(<MemoryRouter initialEntries={['/portal/loans/case/return']}><Routes>
    <Route path="/portal/loans/:caseId/return" element={<LoanReturnPage />} />
    <Route path="/portal/loans/:caseId" element={<div>CASE</div>} />
    <Route path="/portal/loans" element={<div>LOANS</div>} />
  </Routes></MemoryRouter>);
}

describe('loan return domain', () => {
  const valid: LoanReturnDraftItem = { caseItemId: 'machine', selected: true, serialNumber: 'SERIAL', serialConfirmed: true, registeredBrikNumber: 194, observedBrikNumber: '194', checkoutReading: 12, readingUnit: 'hours', returnReading: '27', hasMeterPhoto: true, requiresReview: false, discrepancyNote: '', lowerReadingExplanation: '' };

  it.each(['timan_seller','timan_service','timan_backend'] as const)('allows internal %s role in the canonical role resolver', (role) => expect(isInternalTimanPortalRole(role)).toBe(true));
  it.each(['timan_dealer','timan_importer','timan_service_partner','dealer_customer','private_end_user'] as const)('denies external %s role', (role) => expect(isInternalTimanPortalRole(role)).toBe(false));
  it('requires serial confirmation and Brik input at the exact asset', () => {
    expect(getLoanReturnIssues({ ...valid, serialConfirmed: false })).toContain('serial_confirmation');
    expect(getLoanReturnIssues({ ...valid, observedBrikNumber: '' })).toContain('brik_required');
  });
  it('accepts matching Brik and routes a mismatch through review', () => {
    expect(getLoanReturnIssues(valid)).toEqual([]);
    expect(getLoanReturnIssues({ ...valid, observedBrikNumber: '195' })).toContain('brik_mismatch');
    expect(getLoanReturnIssues({ ...valid, observedBrikNumber: '195', requiresReview: true, discrepancyNote: 'Wrong physical tag' })).not.toContain('brik_mismatch');
  });
  it('requires return meter, meter photo and lower-reading explanation', () => {
    expect(getLoanReturnIssues({ ...valid, returnReading: '' })).toContain('return_reading');
    expect(getLoanReturnIssues({ ...valid, hasMeterPhoto: false })).toContain('return_meter_photo');
    expect(getLoanReturnIssues({ ...valid, returnReading: '10' })).toContain('lower_reading_explanation');
    expect(getLoanReturnIssues({ ...valid, returnReading: '10', lowerReadingExplanation: 'Meter replaced' })).not.toContain('lower_reading_explanation');
    expect(calculateLoanUsage(12, '27')).toBe(15);
  });
  it('uses canonical receipt states and localized presentation keys', () => {
    expect(isLoanEligibleForReceipt('ACCEPTED')).toBe(true);
    expect(isLoanEligibleForReceipt('RETURN_INSPECTION')).toBe(true);
    expect(isLoanEligibleForReceipt('DRAFT')).toBe(false);
    expect(loanStatusTranslationKey('PARTIALLY_RETURNED')).toBe('loansStatusPartiallyReturned');
    expect(loanStatusTranslationKey('REVIEW_REQUIRED')).toBe('loansStatusReviewRequired');
  });
  it('groups frozen Brik identities by company and never invents an unknown source identity', () => {
    expect(loanReceiptGroupKey(machine)).toBe(loanReceiptGroupKey(attachment));
    expect(loanReceiptGroupKey({ ...attachment, asset_instance_id_snapshot: 'LINE|OTHER|1|1' })).not.toBe(loanReceiptGroupKey(machine));
    expect(loanReceiptGroupKey({ ...attachment, asset_instance_id_snapshot: null })).toBe('ITEM:attachment');
  });
});

describe('loan return UI', () => {
  it('shows multi-asset selection, shared Brik context and responsive internal scrolling', async () => {
    mount();
    await screen.findByText(/Modtag udlån U-QA-6603/);
    expect(screen.getByText('RC-751')).toBeInTheDocument();
    expect(screen.getByText('Weed Brush')).toBeInTheDocument();
    expect(screen.getAllByText(/Delt Brik-gruppe: 2/)).toHaveLength(2);
    expect(screen.getByRole('dialog').querySelector('.overflow-y-auto')).toBeInTheDocument();
    expect(screen.getByText('Vælg alle udestående aktiver')).toBeInTheDocument();
  });
  it('marks missing serial, Brik, meter and photo fields inline', async () => {
    mount();
    await screen.findByText('RC-751');
    fireEvent.click(screen.getAllByLabelText('Vælg aktiv')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Gennemfør modtagelse' }));
    expect(await screen.findByText('Bekræft serienummeret, eller markér aktivet til afklaring.')).toBeInTheDocument();
    expect(screen.getAllByText('Indtast det aflæste Brik nr.')).toHaveLength(2);
    expect(screen.getByText('Indtast tællerstanden ved retur.')).toBeInTheDocument();
    expect(screen.getByText('Foto af tællerstand er påkrævet.')).toBeInTheDocument();
  });
  it('redirects an external role before rendering receipt controls', async () => {
    identity.role = 'timan_dealer'; mount();
    expect(await screen.findByText('LOANS')).toBeInTheDocument();
    expect(mocks.getLoanCase).not.toHaveBeenCalled();
  });

  it('refreshes meter-photo validation after upload and removal without discarding entered readings', async () => {
    mount(); await screen.findByText('RC-751');
    fireEvent.click(screen.getAllByLabelText('Vælg aktiv')[0]);
    fireEvent.click(screen.getByLabelText('Jeg har kontrolleret, at serienummeret stemmer'));
    fireEvent.change(screen.getAllByLabelText(/Brik nr. ved modtagelse/)[0], { target: { value: '194' } });
    fireEvent.change(screen.getByLabelText('Tællerstand ved modtagelse'), { target: { value: '27' } });
    const photo = { id: 'meter', case_id: 'case', case_item_id: 'machine', photo_kind: 'return_meter', preview_url: null } as LoanItemPhoto;
    const detail = await mocks.getLoanCase();
    mocks.getLoanCase.mockResolvedValue({ ...detail, photos: [photo] });
    fireEvent.change(screen.getAllByLabelText('Upload billede')[0], { target: { files: [new File(['image'], 'meter.png', { type: 'image/png' })] } });
    await screen.findByText('Billede uploadet');
    expect(screen.getByLabelText('Tællerstand ved modtagelse')).toHaveValue(27);
    mocks.getLoanCase.mockResolvedValue(detail);
    fireEvent.click(screen.getByRole('button', { name: 'Fjern billede' }));
    await waitFor(() => expect(screen.queryByText('Billede uploadet')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Gennemfør modtagelse' }));
    expect(await screen.findByText('Foto af tællerstand er påkrævet.')).toBeInTheDocument();
    expect(mocks.receiveLoanAssets).not.toHaveBeenCalled();
  });

  it('retains the same idempotency key after an uncertain response', async () => {
    const detail = await mocks.getLoanCase();
    mocks.getLoanCase.mockResolvedValue({ ...detail, items: [attachment], returnSummary: [summary(attachment)] });
    mocks.receiveLoanAssets.mockRejectedValueOnce(new Error('Network interrupted'));
    mount(); await screen.findByText('Weed Brush');
    fireEvent.click(screen.getByLabelText('Vælg aktiv'));
    fireEvent.change(screen.getByLabelText(/Brik nr. ved modtagelse/), { target: { value: '194' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gennemfør modtagelse' }));
    await screen.findByText('Network interrupted');
    fireEvent.click(screen.getByRole('button', { name: 'Gennemfør modtagelse' }));
    await screen.findByText('CASE');
    expect(mocks.receiveLoanAssets.mock.calls[0][1]).toBe(mocks.receiveLoanAssets.mock.calls[1][1]);
  });

  it('blocks direct receipt route controls when the server denies scoped receipt', async () => {
    const detail = await mocks.getLoanCase();
    mocks.getLoanCase.mockResolvedValue({ ...detail, returnState: { ...detail.returnState, can_receive: false } });
    mount(); await screen.findByText('Der er ingen udestående aktiver.');
    expect(screen.getByRole('button', { name: 'Gennemfør modtagelse' })).toBeDisabled();
  });
  it('does not automatically select a different serialized machine sharing an ambiguous Brik', async () => {
    const detail = await mocks.getLoanCase();
    const second = { ...machine, id: 'other-machine', serial_snapshot: 'OTHER-SERIAL', asset_instance_id_snapshot: 'SERIAL|DAT|OTHER-SERIAL' };
    mocks.getLoanCase.mockResolvedValue({ ...detail, items: [machine, second], returnSummary: [summary(machine), summary(second)] });
    mount(); await screen.findAllByText('RC-751');
    fireEvent.click(screen.getAllByLabelText('Vælg aktiv')[0]);
    expect(screen.getAllByLabelText('Vælg aktiv')[1]).not.toBeChecked();
    expect(screen.queryByText(/Delt Brik-gruppe/)).not.toBeInTheDocument();
  });
});

describe('loan return database boundary', () => {
  it('uses the existing normalized inspection, deviation, allocation and append-only event model', () => {
    expect(sql).toContain('alter table public.loan_return_item_inspections');
    expect(sql).toContain("insert into public.loan_case_events");
    expect(sql).toContain("'ASSET_RECEIVED'");
    expect(sql).toContain("'ASSET_RETURN_REVIEW_REQUIRED'");
    expect(sql).not.toMatch(/update\s+public\.loan_case_events/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.loan_case_events/i);
  });
  it('enforces internal scoped management and denies direct table writes', () => {
    expect(sql).toContain('not public.loan_can_manage_case(p_case_id)');
    expect(sql).toContain('revoke insert,update,delete,truncate on public.loan_return_inspections');
    expect(sql).toContain('grant execute on function public.loan_receive_assets(uuid,uuid,jsonb,text) to authenticated');
  });
  it('supports partial and full receipt while releasing only successful assets', () => {
    expect(sql).toContain("if v_needs_review then");
    expect(sql).toContain("allocation_status='released'");
    expect(sql).toContain("where case_item_id=v_item.id and allocation_status='active'");
    expect(sql).toContain("v_status:='RETURN_INSPECTION'");
    expect(sql).toContain("v_status:='CLOSED_OK'");
    expect(sql).toContain("v_status:='CLOSED_WITH_DEVIATION'");
  });
  it('keeps return media private and distinct from checkout media', () => {
    expect(sql).toContain("'return_meter','return_condition'");
    expect(sql).toContain('public.loan_register_return_photo');
    expect(sql).not.toContain("values('loan-case-media'");
  });
  it('is idempotent and never writes Fabric-owned data', () => {
    expect(sql).toContain('request_key uuid');
    expect(sql).toContain('loan_return_inspections_request_key_unique');
    expect(sql).toContain('return v_inspection');
    expect(sql).not.toMatch(/(insert into|update|delete from)\s+public\.fabric_loan_assets_current/i);
  });
});
