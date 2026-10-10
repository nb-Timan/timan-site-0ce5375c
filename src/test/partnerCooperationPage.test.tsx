import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BackendPartnerRelationsPage from '@/pages/backend/BackendPartnerRelationsPage';

const mocks = vi.hoisted(() => ({
  backend: true, active: true, service: false,
  upsert: vi.fn(), toggle: vi.fn(), remove: vi.fn(),
}));
vi.mock('@/context/AppUserContext', () => ({ useAppUser: () => ({ appUser: { id: 'backend' }, logout: vi.fn() }) }));
vi.mock('@/context/LanguageContext', () => ({ useLanguage: () => ({ language: 'da', setLanguage: vi.fn() }) }));
vi.mock('@/lib/portalAccess', () => ({ isBackendActor: () => mocks.backend }));
vi.mock('@/components/portal/PortalHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalFooter', () => ({ default: () => null }));
vi.mock('@/components/backend/BillingRelationReview', () => ({ default: () => null }));
vi.mock('@/lib/partnerBillingRelationsService', () => ({ loadBillingRelations: async () => ({ relations: [] }) }));
vi.mock('@/components/backend/PartnerCooperationDialog', () => ({ default: ({ action }: { action: string }) => <div role="dialog">{action}</div> }));
vi.mock('@/lib/dealerAccountsService', () => ({
  fetchDealerAccounts: async () => ({ rows: [
    { id: 'dealer', account_number: '10295', company_name: 'Dealer', customer_type_label: 'Forhandler' },
    { id: 'customer', account_number: '12041', company_name: 'Customer', customer_type_label: 'Forhandlerkunde' },
    { id: 'service', account_number: '10082', company_name: 'Service', customer_type_label: 'Servicepartner' },
  ] }),
  isDealerCustomerAccount: (account: { id: string }) => account.id === 'customer',
}));
vi.mock('@/lib/partnerRelationsService', () => ({
  listPartnerAccountRelations: async () => [{ id: 'relation', source_account_id: 'dealer', target_account_id: mocks.service ? 'service' : 'customer',
    relation_type: mocks.service ? 'dealer_has_service_partner' : 'dealer_has_dealer_customer', active: mocks.active }],
  listServicePartnerLinks: async () => [],
  upsertPartnerAccountRelation: mocks.upsert,
  setPartnerAccountRelationActive: mocks.toggle,
  deletePartnerAccountRelation: mocks.remove,
}));

describe('Backend cooperation controls', () => {
  beforeEach(() => { mocks.backend = true; mocks.active = true; mocks.service = false; vi.clearAllMocks(); });
  const open = () => render(<MemoryRouter><BackendPartnerRelationsPage /></MemoryRouter>);
  it('uses the same approval/end/history controls for a Servicepartner, with no raw toggle/delete',async()=>{
    mocks.service=true;open();
    fireEvent.click(await screen.findByRole('button',{name:'Skift samarbejdspartner'}));
    expect(screen.getByRole('dialog')).toHaveTextContent('SWITCH');
    expect(screen.queryByRole('button',{name:'Slet'})).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();expect(mocks.toggle).not.toHaveBeenCalled();expect(mocks.remove).not.toHaveBeenCalled();
  });
  it.each([['Afslut samarbejde', 'END'], ['Skift forhandler', 'SWITCH'], ['Historik', 'HISTORY']])(
    'opens %s without a raw relation write', async (label, action) => {
      open(); fireEvent.click(await screen.findByRole('button', { name: label }));
      expect(screen.getByRole('dialog')).toHaveTextContent(action);
      expect(screen.queryByRole('button', { name: 'Slet' })).not.toBeInTheDocument();
      expect(mocks.toggle).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
    });
  it('requires a new approval instead of rechecking an inactive relation', async () => {
    mocks.active = false; open();
    fireEvent.click(await screen.findByRole('button', { name: 'Godkend nyt samarbejde' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('ACTIVATE');
    expect(mocks.toggle).not.toHaveBeenCalled();
  });
  it('reviews new dealer-customer relations instead of using generic upsert', async () => {
    open(); await screen.findByRole('button', { name: 'Afslut samarbejde' });
    fireEvent.change(screen.getByLabelText('Relation', { exact: true }), { target: { value: 'dealer_has_dealer_customer' } });
    fireEvent.change(screen.getByLabelText('Fra: Forhandler'), { target: { value: 'dealer' } });
    fireEvent.change(screen.getByLabelText('Til: Forhandlerkunde'), { target: { value: 'customer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gennemgå relation' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('ACTIVATE'); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('does not render cooperation actions for non-Backend users', async () => {
    mocks.backend = false; open();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Afslut samarbejde' })).not.toBeInTheDocument());
  });
});
