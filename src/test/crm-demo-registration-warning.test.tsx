import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ list: vi.fn(), getDemo: vi.fn(), getLead: vi.fn(), saveResult: vi.fn(), role: 'timan_seller' }));
vi.mock('@/lib/crmLeadsService', () => ({
  listDemoLeadsForSource: mocks.list, formatDemoNo: (no: number) => `D-${no}`,
  getCrmDemo: mocks.getDemo, getLead: mocks.getLead, saveCrmDemoResult: mocks.saveResult,
  DEMO_RESULT_STATUS: ['Warm lead'],
}));
vi.mock('@/context/LanguageContext', () => ({ useLanguage: () => ({ uiLanguage: 'da' }) }));
vi.mock('@/context/AppUserContext', () => ({ useAppUser: () => ({ appUser: {} }) }));
vi.mock('@/lib/viewAsUser', () => ({ useEffectivePortalUserState: () => ({ effectiveUser: { id: 'seller-a', portal_role: mocks.role }, resolving: false }) }));
vi.mock('@/lib/resolveSellerId', () => ({ resolveSellerId: vi.fn().mockResolvedValue('seller-a') }));
vi.mock('@/components/crm/CrmLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import { CrmLeadDemoSection } from '@/components/crm/CrmLeadDemoSection';
import CrmDemoLeadDetailPage from '@/pages/crm/CrmDemoLeadDetailPage';
import CrmDemoLeadsPage from '@/pages/crm/CrmDemoLeadsPage';

describe('one canonical lead demo section', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.list.mockResolvedValue([]); mocks.role = 'timan_seller'; });
  afterEach(cleanup);
  it('offers one planning entry when no demo exists and does not mutate on open', async () => {
    render(<MemoryRouter><CrmLeadDemoSection leadId="lead-a" /></MemoryRouter>);
    expect(await screen.findByText('Ingen demo er planlagt endnu.')).toBeInTheDocument();
    expect(screen.getByRole('link', {name:'Planlæg demo'})).toHaveAttribute('href', '/portal/crm/demo-leads/new?fromLead=lead-a');
    expect(screen.queryByText('Konvertér til Demo Lead')).not.toBeInTheDocument();
    expect(screen.queryByText('Resultat/status')).not.toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledWith('lead-a');
  });
  it('shows planned summary instead of missing registration, including legacy nullable equipment', async () => {
    mocks.list.mockResolvedValue([{
      id:'demo-a', demo_no:8000, demo_date:'2099-10-15', demo_machine:'RC-1000s', demo_equipment:null,
      dealer_company:'Test Dealer', dealer_rep:'Test Demonstrator', owner_name:'Hidden Seller', title:'TEST',
    }]);
    render(<MemoryRouter><CrmLeadDemoSection leadId="lead-a" /></MemoryRouter>);
    expect(await screen.findByText('Demo planlagt')).toBeInTheDocument();
    expect(screen.getByRole('link', {name:'Redigér demo'})).toHaveAttribute('href','/portal/crm/demo-leads/new?demoId=demo-a');
    expect(screen.getByRole('link', {name:'Åbn demo'})).toHaveAttribute('href','/portal/crm/demo-leads/demo-a');
    expect(screen.getByText('RC-1000s')).toBeInTheDocument();
    expect(screen.getByText('Test Dealer')).toBeInTheDocument();
    expect(screen.getByText('Test Demonstrator')).toBeInTheDocument();
    expect(screen.queryByText('Hidden Seller')).not.toBeInTheDocument();
    expect(screen.queryByText('Resultat/status')).not.toBeInTheDocument();
    expect(screen.queryByText('Planlæg demo')).not.toBeInTheDocument();
    expect(screen.queryByText('Mangler demo-registrering')).not.toBeInTheDocument();
  });
  it('a past date offers results without inventing completion', async () => {
    mocks.list.mockResolvedValue([{id:'demo-a',demo_date:'2020-01-01',demo_equipment:[]}]);
    render(<MemoryRouter><CrmLeadDemoSection leadId="lead-a" /></MemoryRouter>);
    expect(await screen.findByText('Afventer demo-resultat')).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Registrér demo-resultat'})).toHaveAttribute('href','/portal/crm/demo-leads/demo-a?result=1');
    expect(screen.queryByRole('link',{name:'Redigér demo'})).not.toBeInTheDocument();
    expect(screen.queryByText('Demo afholdt')).not.toBeInTheDocument();
  });
  it('completion is explicit and renders a compact date and dealer summary', async () => {
    mocks.list.mockResolvedValue([{id:'demo-a',demo_date:'2026-09-28',completed_at:'2026-09-28',dealer_company:'Kobatec GmbH',result_status:'Warm lead',demo_equipment:[]}]);
    render(<MemoryRouter><CrmLeadDemoSection leadId="lead-a" /></MemoryRouter>);
    expect(await screen.findByText('Demo kørt 28-09-2026 · Kobatec GmbH')).toBeInTheDocument();
    expect(screen.queryByText('Interesseret lead')).not.toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Åbn demo'})).toHaveAttribute('href','/portal/crm/demo-leads/demo-a');
    expect(screen.queryByRole('link',{name:'Redigér demo'})).not.toBeInTheDocument();
    expect(screen.queryByRole('link',{name:'Registrér demo-resultat'})).not.toBeInTheDocument();
    expect(screen.queryByRole('link',{name:'Planlæg demo'})).not.toBeInTheDocument();
  });
});

describe('progressive demo result disclosure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = 'timan_seller';
    mocks.getLead.mockResolvedValue({ next_followup_date: '2026-10-20' });
    mocks.saveResult.mockImplementation(async (_id, result) => ({
      id: 'demo-a', demo_no: 8000, title: 'TEST', source_lead_id: 'lead-a', demo_date: '2020-01-01',
      demo_machine: 'RC-1000s', demo_equipment: [], attachments: [], completed_at: '2026-10-03',
      ...result,
    }));
  });
  afterEach(cleanup);

  function renderDetail() {
    render(<MemoryRouter initialEntries={['/portal/crm/demo-leads/demo-a']}>
      <Routes><Route path="/portal/crm/demo-leads/:id" element={<CrmDemoLeadDetailPage />} /></Routes>
    </MemoryRouter>);
  }

  it('keeps result fields hidden for a planned demo', async () => {
    mocks.getDemo.mockResolvedValue({
      id: 'demo-a', demo_no: 8000, title: 'TEST', source_lead_id: 'lead-a', demo_date: '2099-10-15',
      demo_machine: 'RC-1000s', demo_equipment: [], attachments: [],
    });
    renderDetail();
    expect(await screen.findByText('Demo planlagt')).toBeInTheDocument();
    expect(screen.queryByText('Kundens interesse (1–5)')).not.toBeInTheDocument();
    expect(screen.queryByText('Resultat/status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrér demo-resultat' })).not.toBeInTheDocument();
  });

  it('opens result fields only after the explicit result action', async () => {
    mocks.getDemo.mockResolvedValue({
      id: 'demo-a', demo_no: 8000, title: 'TEST', source_lead_id: 'lead-a', demo_date: '2020-01-01',
      demo_machine: 'RC-1000s', demo_equipment: [], attachments: [],
    });
    renderDetail();
    expect(await screen.findByText('Afventer demo-resultat')).toBeInTheDocument();
    expect(screen.queryByText('Kundens interesse (1–5)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrér demo-resultat' }));
    expect(await screen.findByText('Kundens interesse (1–5)')).toBeInTheDocument();
    expect(screen.getByText('Konkurrenter til stede?')).toBeInTheDocument();
    for (const removed of ['Ønsker tilbud?', 'Opfølgningsdato', 'Sandsynlighed (%)', 'Forventet handelsstørrelse (DKK)', 'Resultat/status', 'Noter efter demo']) {
      expect(screen.queryByText(removed)).not.toBeInTheDocument();
    }
  });

  it('saves only demo-specific result fields and completes automatically', async () => {
    mocks.getDemo.mockResolvedValue({
      id: 'demo-a', demo_no: 8000, title: 'TEST', source_lead_id: 'lead-a', demo_date: '2020-01-01',
      demo_machine: 'RC-1000s', demo_equipment: [], attachments: [],
    });
    render(<MemoryRouter initialEntries={['/portal/crm/demo-leads/demo-a?result=1']}>
      <Routes><Route path="/portal/crm/demo-leads/:id" element={<CrmDemoLeadDetailPage />} /></Routes>
    </MemoryRouter>);
    fireEvent.change(await screen.findByLabelText('Kundens interesse (1–5)'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Konkurrenter til stede?'), { target: { value: 'yes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    expect(mocks.saveResult).toHaveBeenCalledWith('demo-a', {
      interest_level: 4,
      competitors_present: 'yes',
    }, expect.any(String));
    expect(await screen.findByText('4/5')).toBeInTheDocument();
    expect(screen.getByText('Ja')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redigér resultat' })).toBeInTheDocument();
  });
});

describe('legacy demo overview compatibility', () => {
  it('redirects the old overview route to the canonical CRM Leads demo filter', () => {
    render(<MemoryRouter initialEntries={['/portal/crm/demo-leads']}>
      <Routes>
        <Route path="/portal/crm/demo-leads" element={<CrmDemoLeadsPage />} />
        <Route path="/portal/crm/leads" element={<div>Canonical Demo Leads</div>} />
      </Routes>
    </MemoryRouter>);
    expect(screen.getByText('Canonical Demo Leads')).toBeInTheDocument();
  });
});
