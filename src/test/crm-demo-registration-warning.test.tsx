import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ list: vi.fn(), getDemo: vi.fn(), getLead: vi.fn(), saveResult: vi.fn(), role: 'timan_seller', language: 'da' }));
vi.mock('@/lib/crmLeadsService', () => ({
  listDemoLeadsForSource: mocks.list, formatDemoNo: (no: number) => `D-${no}`,
  getCrmDemo: mocks.getDemo, getLead: mocks.getLead, saveCrmDemoResult: mocks.saveResult,
  DEMO_RESULT_STATUS: ['Warm lead'],
}));
vi.mock('@/lib/crmCompetitorsService', () => ({
  listCrmCompetitors: vi.fn().mockResolvedValue([{ id: 'hako-id', name: 'Hako', active: true, machine_groups: ['RC-1000s'] }]),
  competitorGroupsForMachine: () => ['RC-1000s'],
}));
vi.mock('@/context/LanguageContext', () => ({ useLanguage: () => ({ uiLanguage: mocks.language }) }));
vi.mock('@/context/AppUserContext', () => ({ useAppUser: () => ({ appUser: {} }) }));
vi.mock('@/lib/viewAsUser', () => ({ useEffectivePortalUserState: () => ({ effectiveUser: { id: 'seller-a', portal_role: mocks.role }, resolving: false }) }));
vi.mock('@/lib/resolveSellerId', () => ({ resolveSellerId: vi.fn().mockResolvedValue('seller-a') }));
vi.mock('@/components/crm/CrmLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import { CrmLeadDemoSection } from '@/components/crm/CrmLeadDemoSection';
import CrmDemoLeadDetailPage from '@/pages/crm/CrmDemoLeadDetailPage';
import CrmDemoLeadsPage from '@/pages/crm/CrmDemoLeadsPage';

describe('one canonical lead demo section', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.list.mockResolvedValue([]); mocks.role = 'timan_seller'; mocks.language = 'da'; });
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
    mocks.list.mockResolvedValue([{id:'demo-a',demo_no:8028,demo_date:'2020-01-01',dealer_company:'Kobatec GmbH',demo_equipment:[]}]);
    render(<MemoryRouter><CrmLeadDemoSection leadId="lead-a" /></MemoryRouter>);
    expect(await screen.findByText('Afventer demo-resultat')).toBeInTheDocument();
    expect(screen.getByText('D-8028')).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Registrér demo-resultat'})).toHaveAttribute('href','/portal/crm/demo-leads/demo-a?result=1');
    expect(screen.getByRole('link',{name:'Redigér demo'})).toHaveAttribute('href','/portal/crm/demo-leads/new?demoId=demo-a');
    expect(screen.getByLabelText('Kundens interesse')).toBeInTheDocument();
    expect(screen.getByLabelText('Konkurrenter til stede?')).toBeInTheDocument();
    expect(screen.queryByText('Demo afholdt')).not.toBeInTheDocument();
  });
  it('completion renders the canonical result summary and both demo actions', async () => {
    mocks.list.mockResolvedValue([{id:'demo-a',demo_no:8028,demo_date:'2026-09-28',completed_at:'2026-09-28',dealer_company:'Kobatec GmbH',interest_level:4,competitors_present:'yes',result_status:'Warm lead',demo_equipment:[]}]);
    render(<MemoryRouter><CrmLeadDemoSection leadId="lead-a" /></MemoryRouter>);
    expect(await screen.findByText('D-8028')).toBeInTheDocument();
    expect(await screen.findByText('Demo kørt 28-09-2026 · Kobatec GmbH')).toBeInTheDocument();
    expect(screen.getByText('Kundens interesse')).toBeInTheDocument();
    expect(screen.getByLabelText('Kundens interesse')).toHaveValue('4');
    expect(screen.getByLabelText('Konkurrenter til stede?')).toHaveValue('yes');
    expect(screen.queryByText('Interesseret lead')).not.toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Åbn demo'})).toHaveAttribute('href','/portal/crm/demo-leads/demo-a');
    expect(screen.getByRole('link',{name:'Redigér demo'})).toHaveAttribute('href','/portal/crm/demo-leads/new?demoId=demo-a');
    expect(screen.queryByRole('link',{name:'Registrér demo-resultat'})).not.toBeInTheDocument();
    expect(screen.queryByRole('link',{name:'Planlæg demo'})).not.toBeInTheDocument();
  });

  it('reloads changed date, dealer and result values from the canonical demo record', async () => {
    mocks.list.mockResolvedValueOnce([{id:'demo-a',demo_no:8028,demo_date:'2026-09-28',completed_at:'2026-09-28',dealer_company:'Kobatec GmbH',interest_level:4,competitors_present:'yes',demo_equipment:[]}]);
    render(<MemoryRouter><CrmLeadDemoSection leadId="lead-a" /></MemoryRouter>);
    expect(await screen.findByText('Demo kørt 28-09-2026 · Kobatec GmbH')).toBeInTheDocument();
    cleanup();
    mocks.list.mockResolvedValueOnce([{id:'demo-a',demo_no:8028,demo_date:'2026-09-30',completed_at:'2026-09-28',dealer_company:'Updated Dealer',interest_level:5,competitors_present:'no',demo_equipment:[]}]);
    render(<MemoryRouter><CrmLeadDemoSection leadId="lead-a" /></MemoryRouter>);
    expect(await screen.findByText('Demo kørt 30-09-2026 · Updated Dealer')).toBeInTheDocument();
    expect(screen.getByLabelText('Kundens interesse')).toHaveValue('5');
    expect(screen.getByLabelText('Konkurrenter til stede?')).toHaveValue('no');
  });
  it('edits the top-card result through the canonical save without completing a planned demo', async () => {
    const demo = { id: 'demo-a', demo_no: 8028, demo_date: '2099-10-15', demo_machine: 'RC-1000s', demo_equipment: [], interest_level: 4, competitors_present: 'no', competitor_id: null, completed_at: null };
    mocks.list.mockResolvedValue([demo]);
    mocks.saveResult.mockImplementation(async (_id, result) => ({ ...demo, ...result }));
    render(<MemoryRouter><CrmLeadDemoSection leadId="lead-a" /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText('Kundens interesse'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Konkurrenter til stede?'), { target: { value: 'yes' } });
    expect(screen.getByLabelText('Konkurrent')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Konkurrent'), { target: { value: 'hako-id' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    expect(mocks.saveResult).toHaveBeenCalledWith('demo-a', { interest_level: 5, competitors_present: 'yes', competitor_id: 'hako-id' }, 'seller-a', true);
    expect(await screen.findByRole('status')).toHaveTextContent('Demo gemt');
    expect(screen.getByText('Demo planlagt')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Konkurrenter til stede?'), { target: { value: 'no' } });
    expect(screen.queryByLabelText('Konkurrent')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    expect(mocks.saveResult).toHaveBeenLastCalledWith('demo-a', { interest_level: 5, competitors_present: 'no', competitor_id: null }, 'seller-a', true);
    expect(await screen.findByRole('status')).toHaveTextContent('Demo gemt');
  });
});

describe('progressive demo result disclosure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = 'timan_seller';
    mocks.language = 'da';
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

  it('shows saved inline values on a planned demo without opening its result form', async () => {
    mocks.getDemo.mockResolvedValue({
      id: 'demo-a', demo_no: 8000, title: 'TEST', source_lead_id: 'lead-a', demo_date: '2099-10-15',
      demo_machine: 'RC-1000s', demo_equipment: [], attachments: [], interest_level: 5,
      competitors_present: 'yes', competitor_id: null, competitor_name: null,
    });
    renderDetail();
    expect(await screen.findByText('Demo planlagt')).toBeInTheDocument();
    expect(screen.getByText('5/5')).toBeInTheDocument();
    expect(screen.getByText('Ja')).toBeInTheDocument();
    expect(screen.queryByLabelText('Kundens interesse')).not.toBeInTheDocument();
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
    expect(await screen.findByLabelText('Kundens interesse')).toBeInTheDocument();
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
    fireEvent.change(await screen.findByLabelText('Kundens interesse'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Konkurrenter til stede?'), { target: { value: 'yes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    expect(mocks.saveResult).toHaveBeenCalledWith('demo-a', {
      interest_level: 4,
      competitors_present: 'yes',
      competitor_id: null,
    }, expect.any(String));
    expect(await screen.findByRole('button', { name: 'Redigér resultat' })).toBeInTheDocument();
    expect(screen.getByText('4/5')).toBeInTheDocument();
    expect(screen.getByText('Ja')).toBeInTheDocument();
  });

  it('keeps operational demo editing separate from result editing after completion', async () => {
    mocks.getDemo.mockResolvedValue({
      id: 'demo-a', demo_no: 8028, title: 'TEST', source_lead_id: 'lead-a', demo_date: '2026-09-28',
      demo_machine: 'RC-1000s', demo_equipment: [], attachments: [], completed_at: '2026-09-28',
      interest_level: 4, competitors_present: 'yes',
    });
    renderDetail();
    expect(await screen.findByRole('link', { name: 'Redigér demo' })).toHaveAttribute('href', '/portal/crm/demo-leads/new?demoId=demo-a');
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
