import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LeadLinkPicker from '@/components/configurator/LeadLinkPicker';
import type { CrmLead } from '@/lib/crmLeadsService';
import type { AppUser } from '@/data/appUsers';
import type { PortalRole } from '@/lib/portalAccess';

const mocks = vi.hoisted(() => ({
  role: 'timan_backend' as PortalRole,
  list: vi.fn(), get: vi.fn(), resolve: vi.fn(), academy: false,
  academyLeads: [] as CrmLead[],
}));
vi.mock('@/lib/portalAccess', () => ({ derivePortalRole: () => mocks.role }));
vi.mock('@/lib/crmLeadsService', () => ({
  listLeads: mocks.list, getLead: mocks.get, formatLeadNo: (n: number) => `L-${n}`,
}));
vi.mock('@/lib/resolveSellerId', () => ({ resolveSellerId: mocks.resolve }));
vi.mock('@/lib/academyCrmSandbox', () => ({ academyCrmSandbox: {
  isActive: () => mocks.academy,
  getAcademyActor: () => ({ id: 'academy-local-sales-user' }),
  getState: () => ({ leads: mocks.academyLeads }),
  getCrmLead: (id: string) => mocks.academyLeads.find(lead => lead.id === id),
} }));

const seller = '11111111-1111-4111-8111-111111111111';
const otherSeller = '22222222-2222-4222-8222-222222222222';
const dealer = '33333333-3333-4333-8333-333333333333';
const otherDealer = '44444444-4444-4444-8444-444444444444';
const appUser = { email: 'seller@example.test' } as AppUser & { email: string };
const lead = (id: string, changes: Partial<CrmLead> = {}): CrmLead => ({
  id, lead_no: 1, title: id, owner_user_id: seller, linked_dealer_id: dealer,
  owner_name: 'Selected seller', owner_email: 'seller@example.test',
  next_activity: 'Lead', pipeline_stage: 'Lead', status: 'open', ...changes,
} as CrmLead);
const base = { appUser, value: null, onChange: vi.fn(), sellerEmail: appUser.email, dealerAccountId: dealer };
const candidateValues = () => Array.from(document.querySelectorAll<HTMLOptionElement>('optgroup option')).map(option => option.value);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = 'timan_backend';
  mocks.academy = false;
  mocks.academyLeads = [];
  mocks.resolve.mockImplementation(async (email: string) => email === 'other@example.test' ? otherSeller : seller);
  mocks.list.mockResolvedValue([lead('matching')]);
  mocks.get.mockResolvedValue(lead('saved'));
});
afterEach(cleanup);

describe('Step 4 lead candidates use canonical seller AND dealer relations', () => {
  it('queries both IDs and excludes seller-only/dealer-only/text matches', async () => {
    mocks.list.mockResolvedValue([
      lead('matching'), lead('wrong-seller', { owner_user_id: otherSeller }),
      lead('wrong-dealer', { linked_dealer_id: otherDealer }),
      lead('account-number-not-id', { linked_dealer_id: '10109' }),
      lead('email-only', { owner_user_id: null }),
    ]);
    render(<LeadLinkPicker {...base} />);
    await waitFor(() => expect(candidateValues()).toEqual(['matching']));
    expect(mocks.list).toHaveBeenCalledWith({ payload: 'summary', ownerUserId: seller, linkedDealerIds: [dealer] });
    expect(screen.getByRole('group', { name: 'Matchende åbne leads' })).toBeInTheDocument();
    expect(screen.queryByText('Andre åbne leads')).not.toBeInTheDocument();
  });

  it('uses canonical status including order-linked wins and excludes closed/archive flags', async () => {
    mocks.list.mockResolvedValue([
      lead('open'), lead('demo', { next_activity: 'Demo agreed' }),
      lead('won', { pipeline_stage: 'Won', status: 'closed' }),
      lead('lost', { pipeline_stage: 'Lost', status: 'closed' }),
      lead('order', { linked_sales_event: 'order_submitted' }),
      lead('closed', { status: 'closed' }), lead('archived', { status: 'archived' }),
      lead('deleted', { status: 'deleted' }),
    ]);
    render(<LeadLinkPicker {...base} />);
    await waitFor(() => expect(candidateValues()).toEqual(['open', 'demo']));
  });

  it('keeps both commands enabled while loading and in the no-match state', async () => {
    let finish!: (rows: CrmLead[]) => void;
    mocks.list.mockReturnValue(new Promise<CrmLead[]>(resolve => { finish = resolve; }));
    render(<LeadLinkPicker {...base} />);
    expect(screen.getByRole('combobox')).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Gem uden lead' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '+ Opret nyt lead' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.list).toHaveBeenCalled());
    finish([]);
    await screen.findByText('Ingen åbne leads matcher valgt sælger og forhandler.');
    expect(candidateValues()).toEqual([]);
  });

  it.each([{ sellerEmail: null }, { dealerAccountId: null }])('never requests unrelated fallback leads for missing context %j', async missing => {
    render(<LeadLinkPicker {...base} {...missing} />);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toBeEnabled();
    expect(screen.getByText('Ingen åbne leads matcher valgt sælger og forhandler.')).toBeInTheDocument();
  });

  it('does not fall back to the signed-in seller when the selected seller cannot resolve', async () => {
    mocks.resolve.mockResolvedValue(null);
    render(<LeadLinkPicker {...base} />);
    await screen.findByText('Ingen åbne leads matcher valgt sælger og forhandler.');
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('refreshes when seller changes and clears an invalid unsaved selected lead', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<LeadLinkPicker {...base} value="matching" onChange={onChange} />);
    await waitFor(() => expect(candidateValues()).toEqual(['matching']));
    mocks.list.mockResolvedValue([lead('other', { owner_user_id: otherSeller })]);
    rerender(<LeadLinkPicker {...base} value="matching" onChange={onChange} sellerEmail="other@example.test" />);
    expect(candidateValues()).toEqual([]);
    await waitFor(() => expect(candidateValues()).toEqual(['other']));
    expect(mocks.list).toHaveBeenLastCalledWith({ payload: 'summary', ownerUserId: otherSeller, linkedDealerIds: [dealer] });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('refreshes on dealer change and ignores a late response from the old dealer', async () => {
    let finishOld!: (rows: CrmLead[]) => void;
    mocks.list.mockReturnValueOnce(new Promise<CrmLead[]>(resolve => { finishOld = resolve; }));
    const { rerender } = render(<LeadLinkPicker {...base} />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    mocks.list.mockResolvedValue([lead('other-dealer', { linked_dealer_id: otherDealer })]);
    rerender(<LeadLinkPicker {...base} dealerAccountId={otherDealer} />);
    await waitFor(() => expect(candidateValues()).toEqual(['other-dealer']));
    finishOld([lead('stale')]);
    await waitFor(() => expect(screen.queryByRole('option', { name: /stale/ })).not.toBeInTheDocument());
    expect(mocks.list).toHaveBeenLastCalledWith({ payload: 'summary', ownerUserId: seller, linkedDealerIds: [otherDealer] });
  });

  it('keeps a deferred new-lead intent across ownership changes', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<LeadLinkPicker {...base} value="__new__" onChange={onChange} />);
    await waitFor(() => expect(candidateValues()).toEqual(['matching']));
    rerender(<LeadLinkPicker {...base} value="__new__" onChange={onChange} dealerAccountId={otherDealer} />);
    await screen.findByText('Ingen åbne leads matcher valgt sælger og forhandler.');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toHaveValue('__new__');
  });

  it('preserves saved relations even when closed or outside the current context', async () => {
    const onChange = vi.fn();
    mocks.get.mockResolvedValue(lead('saved', { status: 'closed', pipeline_stage: 'Won', linked_dealer_id: otherDealer }));
    render(<LeadLinkPicker {...base} value="saved" onChange={onChange} readOnly />);
    await screen.findByText('Knyttet til L-1 · saved');
    expect(mocks.list).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('retains Seller scope and does not load another seller even if selected', async () => {
    mocks.role = 'timan_seller';
    render(<LeadLinkPicker {...base} sellerEmail="other@example.test" />);
    await screen.findByText('Ingen åbne leads matcher valgt sælger og forhandler.');
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('remains hidden and performs no CRM reads for an external role', () => {
    mocks.role = 'timan_dealer';
    render(<LeadLinkPicker {...base} value="saved" readOnly />);
    expect(screen.queryByText('Knyt til lead (CRM)')).not.toBeInTheDocument();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('keeps Academy local and applies the same dealer relation', async () => {
    mocks.academy = true;
    mocks.academyLeads = [lead('academy', { owner_user_id: 'academy-local-sales-user' }), lead('other', { linked_dealer_id: otherDealer })];
    render(<LeadLinkPicker {...base} />);
    await waitFor(() => expect(candidateValues()).toEqual(['academy']));
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('shows a controlled read error without unrelated leads or disabling commands', async () => {
    mocks.list.mockRejectedValue(new Error('read failed'));
    render(<LeadLinkPicker {...base} />);
    await screen.findByText('Leads kunne ikke indlæses.');
    expect(candidateValues()).toEqual([]);
    expect(screen.getByRole('combobox')).toBeEnabled();
  });

  it('uses existing parent callbacks for both commands and lead selection', async () => {
    const onChange = vi.fn();
    render(<LeadLinkPicker {...base} onChange={onChange} />);
    await waitFor(() => expect(candidateValues()).toEqual(['matching']));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__new__' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'matching' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(onChange.mock.calls).toEqual([['__new__'], ['matching'], [null]]);
  });
});
