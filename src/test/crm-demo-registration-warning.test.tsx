import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ list: vi.fn(), role: 'timan_seller' }));
vi.mock('@/lib/crmLeadsService', () => ({
  listDemoLeadsForSource: mocks.list, formatDemoNo: (no: number) => `D-${no}`,
}));
vi.mock('@/context/LanguageContext', () => ({ useLanguage: () => ({ uiLanguage: 'da' }) }));
vi.mock('@/context/AppUserContext', () => ({ useAppUser: () => ({ appUser: {} }) }));
vi.mock('@/lib/viewAsUser', () => ({ useEffectivePortalUserState: () => ({ effectiveUser: { portal_role: mocks.role }, resolving: false }) }));
import { CrmLeadDemoSection } from '@/components/crm/CrmLeadDemoSection';

describe('one canonical lead demo section', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.list.mockResolvedValue([]); mocks.role = 'timan_seller'; });
  afterEach(cleanup);
  it('offers one planning entry when no demo exists and does not mutate on open', async () => {
    render(<MemoryRouter><CrmLeadDemoSection leadId="lead-a" /></MemoryRouter>);
    expect(await screen.findByText('Ingen demo er planlagt endnu.')).toBeInTheDocument();
    expect(screen.getByRole('link', {name:'Planlæg demo'})).toHaveAttribute('href', '/portal/crm/demo-leads/new?fromLead=lead-a');
    expect(screen.queryByText('Konvertér til Demo Lead')).not.toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledWith('lead-a');
  });
  it('shows planned summary instead of missing registration, including legacy nullable equipment', async () => {
    mocks.list.mockResolvedValue([{id:'demo-a',demo_no:8000,demo_date:'2099-10-15',demo_equipment:null,title:'TEST'}]);
    render(<MemoryRouter><CrmLeadDemoSection leadId="lead-a" /></MemoryRouter>);
    expect(await screen.findByText('Demo planlagt')).toBeInTheDocument();
    expect(screen.getByRole('link', {name:'Redigér demo'})).toHaveAttribute('href','/portal/crm/demo-leads/new?demoId=demo-a');
    expect(screen.queryByText('Planlæg demo')).not.toBeInTheDocument();
    expect(screen.queryByText('Mangler demo-registrering')).not.toBeInTheDocument();
  });
  it('a past date offers results without inventing completion', async () => {
    mocks.list.mockResolvedValue([{id:'demo-a',demo_date:'2020-01-01',demo_equipment:[]}]);
    render(<MemoryRouter><CrmLeadDemoSection leadId="lead-a" /></MemoryRouter>);
    expect(await screen.findByText('Afventer demo-resultat')).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Registrér resultat'})).toHaveAttribute('href','/portal/crm/demo-leads/demo-a?result=1');
    expect(screen.queryByText('Demo afholdt')).not.toBeInTheDocument();
  });
  it('completion is explicit and renders the saved result', async () => {
    mocks.list.mockResolvedValue([{id:'demo-a',demo_date:'2020-01-01',completed_at:'2020-01-02',result_status:'Warm lead',demo_equipment:[]}]);
    render(<MemoryRouter><CrmLeadDemoSection leadId="lead-a" /></MemoryRouter>);
    expect(await screen.findByText('Demo afholdt')).toBeInTheDocument();
    expect(screen.getByText('Interesseret lead')).toBeInTheDocument();
    expect(screen.queryByRole('link',{name:'Planlæg demo'})).not.toBeInTheDocument();
  });
});
