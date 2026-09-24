import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InternalContractsOverview } from '@/pages/contracts/ContractsPage';
import type { ContractWorkflowStatus } from '@/lib/contractFlow';
import { getDealerContractOverviewActionLabel, getDealerContractOverviewStatusLabel } from '@/lib/contractOverviewLabels';
import { fetchInternalDealerContractOverview, type DealerContractOverviewRow } from '@/lib/dealerContractsService';
import { PORTAL_LANGUAGE_CODES } from '@/lib/portalLanguages';

vi.mock('@/components/portal/PortalHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalFooter', () => ({ default: () => null }));
vi.mock('@/lib/activeMode', () => ({ getEffectiveSellerEmail: () => null, getEffectiveSellerInitials: () => null }));
vi.mock('@/lib/dealerContractsService', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/dealerContractsService')>(),
  fetchInternalDealerContractOverview: vi.fn(),
}));

const statuses: ContractWorkflowStatus[] = ['draft', 'pending_decision', 'guided_review', 'ready_for_signature', 'awaiting_signed_upload', 'submitted_for_approval', 'approved', 'changes_requested', 'archived'];
const rows = statuses.map((status, index) => ({
  contract: { id: `contract-${index}`, contract_status: status, form_data: { partnerType: index ? 'dealer' : '' } },
  partnerName: `Original Partner ${index}`, accountNumber: `1028${index}`, partnerType: 'Forhandler',
  country: 'DE', sellerInitials: 'AKR', sellerName: 'Original Seller',
  createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-21T10:00:00Z',
  statusLabel: 'STALE DANISH STATUS', actionLabel: 'STALE DANISH ACTION',
})) as DealerContractOverviewRow[];

function props(uiLanguage: 'de' | 'en'): ComponentProps<typeof InternalContractsOverview> {
  return { appUser: null, effectiveUser: { id: 'qa' } as ComponentProps<typeof InternalContractsOverview>['effectiveUser'],
    language: uiLanguage, uiLanguage, portalRole: 'timan_seller', viewAsSellerId: null,
    onLanguageChange: vi.fn(), onLogout: vi.fn(), onOpenContract: vi.fn(), onNewContract: vi.fn() };
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('localized contract overview', () => {
  it.each([
    ['de', 'Verträge', 'Neuer Vertrag', 'Entwurf', 'Ausstehend', 'Prüfung / Rückmeldung des Partners ausstehend', 'Fortsetzen', 'Prüfen', 'Partnertyp', 'Händler'],
    ['en', 'Contracts', 'New contract', 'Draft', 'Pending', 'Review / awaiting partner', 'Continue', 'Review', 'Partner type', 'Dealer'],
  ] as const)('renders %s from canonical status keys without changing business data', async (language, title, create, draft, pending, reviewStatus, resume, review, partnerType, dealer) => {
    const original = JSON.stringify(rows);
    vi.mocked(fetchInternalDealerContractOverview).mockResolvedValue({ rows, counts: { all: 9, draft: 2, pending: 4, approved: 1, rejected: 1, terminated: 1 }, error: null });
    const viewProps = props(language);
    render(<InternalContractsOverview {...viewProps} />);
    expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    expect(screen.getByRole('button', { name: create })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: partnerType })).toBeTruthy();
    const first = (await screen.findByRole('button', { name: 'Original Partner 0' })).closest('tr')!;
    expect(within(first).getByText(draft)).toBeTruthy();
    expect(within(first).getByText(dealer)).toBeTruthy();
    fireEvent.click(within(first).getByRole('button', { name: resume }));
    expect(viewProps.onOpenContract).toHaveBeenCalledWith('contract-0');
    expect(screen.getAllByText(pending).length).toBeGreaterThan(0);
    expect(screen.getAllByText(reviewStatus)).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: review })).toHaveLength(4);
    expect(screen.queryByText(/STALE DANISH/)).toBeNull();
    expect(screen.getByText('10280')).toBeTruthy();
    expect(screen.getAllByText('Original Seller')).toHaveLength(9);
    expect(JSON.stringify(rows)).toBe(original);
  });

  it('updates DE -> EN -> DE without refetching or retaining translated row state', async () => {
    vi.mocked(fetchInternalDealerContractOverview).mockResolvedValue({ rows, counts: { all: 9, draft: 2, pending: 4, approved: 1, rejected: 1, terminated: 1 }, error: null });
    const view = render(<InternalContractsOverview {...props('de')} />);
    await screen.findByRole('button', { name: 'Original Partner 0' });
    view.rerender(<InternalContractsOverview {...props('en')} />);
    expect(screen.getAllByRole('button', { name: 'Continue' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Fortsetzen' })).toBeNull();
    view.rerender(<InternalContractsOverview {...props('de')} />);
    expect(screen.getAllByRole('button', { name: 'Fortsetzen' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(fetchInternalDealerContractOverview).toHaveBeenCalledTimes(1);
  });

  it.each(PORTAL_LANGUAGE_CODES)('covers every overview status/action in %s', language => {
    for (const status of statuses) {
      const label = getDealerContractOverviewStatusLabel(status, language);
      const action = getDealerContractOverviewActionLabel(status, language);
      expect(label).toBeTruthy();
      expect(action).toBeTruthy();
      if (language !== 'da') {
        expect(label).not.toMatch(/Kladde|Afventer|Gennemgang|Godkendt|Opsagt/);
        expect(action).not.toMatch(/Fortsæt|Gennemgå|Åbn/);
      }
    }
  });
});
