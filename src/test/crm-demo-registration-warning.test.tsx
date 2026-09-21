import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getLead: vi.fn(), list: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/crmLeadsService', () => ({
  getLead: mocks.getLead, listDemoLeadsForSource: mocks.list, updateDemoLeadDate: mocks.update,
  formatDemoNo: (no: number) => `D-${no}`,
}));
vi.mock('@/context/LanguageContext', () => ({ useLanguage: () => ({ uiLanguage: 'da' }) }));
import { CrmLeadDemoSection } from '@/components/crm/CrmLeadDemoSection';

describe('demo registration completion warning', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.list.mockResolvedValue([]); });
  afterEach(cleanup);
  it('does not warn on an ordinary requested lead', async () => {
    mocks.getLead.mockResolvedValue({ demo_registration_pending: false });
    render(<MemoryRouter><CrmLeadDemoSection leadId="lead-a" /></MemoryRouter>);
    expect(await screen.findByText('Ingen demo er knyttet til leadet endnu.')).toBeInTheDocument();
    expect(screen.queryByText('Mangler demo-registrering')).not.toBeInTheDocument();
  });
  it('warns for a started but unfinished registration', async () => {
    mocks.getLead.mockResolvedValue({ demo_registration_pending: true });
    render(<MemoryRouter><CrmLeadDemoSection leadId="lead-a" /></MemoryRouter>);
    expect(await screen.findByText('Mangler demo-registrering')).toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledWith('lead-a');
    expect(screen.getByText('Opret demo').closest('a')).toHaveAttribute('href', '/portal/crm/demo-leads/new?fromLead=lead-a');
  });
  it('uses the same demo when adding a date, clears warning and updates stage without changing follow-up', async () => {
    const demo = { id: 'demo-a', demo_no: 8000, demo_date: null, title: 'TEST' };
    mocks.getLead.mockResolvedValueOnce({ demo_registration_pending: true })
      .mockResolvedValueOnce({ demo_registration_pending: false, next_activity: 'Demonstration scheduled', probability: 50 });
    mocks.list.mockResolvedValue([demo]);
    mocks.update.mockResolvedValue({ ...demo, demo_date: '2026-10-15' });
    const changed = vi.fn();
    render(<MemoryRouter><CrmLeadDemoSection leadId="lead-a" onStageChange={changed} /></MemoryRouter>);
    await screen.findByText('Mangler demo-registrering');
    fireEvent.change(screen.getByLabelText('Demo-dato'), { target: { value: '2026-10-15' } });
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('demo-a', '2026-10-15'));
    await waitFor(() => expect(screen.queryByText('Mangler demo-registrering')).not.toBeInTheDocument());
    expect(changed).toHaveBeenCalledWith('Demonstration scheduled', 50);
    expect(screen.queryByText('Opret demo')).not.toBeInTheDocument();
  });
});
