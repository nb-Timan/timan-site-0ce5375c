import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MachineSearchPage from '@/pages/service/MachineSearchPage';
import MachineJournalPage from '@/pages/service/MachineJournalPage';
import AcademyTrackGuard from '@/components/academy/AcademyTrackGuard';
import { academySandbox, ACADEMY_MACHINE_TARGET_SERIAL as target } from '@/lib/academySandbox';
import { ACADEMY_CASE_IDS, getLocalAcademyUser } from '@/lib/academyCurriculum';
import { setAcademyCycleStorageScope } from '@/lib/academyCycleStorage';
import * as registry from '@/lib/machineRegistryPageService';
import * as journal from '@/lib/machineJournalService';
import * as corrections from '@/lib/machineRegistryCorrectionsService';

const context = vi.hoisted(() => ({ user: null as ReturnType<typeof getLocalAcademyUser> | null }));
vi.mock('@/context/AppUserContext', () => ({ useAppUser: () => ({ appUser: context.user, logout: vi.fn(), loading: false }) }));
vi.mock('@/lib/viewAsUser', () => ({
  useEffectivePortalUserState: () => ({ effectiveUser: context.user ? { ...context.user } : null, resolving: false }),
  withSellerScopeIdentity: (user: unknown) => user,
}));
vi.mock('@/context/LanguageContext', () => ({ useLanguage: () => ({ language: 'da', uiLanguage: 'da', setLanguage: vi.fn() }), useOptionalLanguage: () => ({ uiLanguage: 'da' }) }));
vi.mock('@/components/portal/PortalHeader', () => ({ default: () => null }));
vi.mock('@/components/service/LegacyMachineImportPanel', () => ({ default: () => <p>Production import control</p> }));

function open(path = '/portal/service/machines?academy_mode=true') {
  return render(<MemoryRouter initialEntries={[path]}><AcademyTrackGuard><Routes>
    <Route path="/portal/service/machines" element={<MachineSearchPage />} />
    <Route path="/portal/service/machines/:serialNumber" element={<MachineJournalPage />} />
    <Route path="/academy" element={<p>Academy home</p>} />
  </Routes></AcademyTrackGuard></MemoryRouter>);
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  context.user = { ...getLocalAcademyUser(), portal_role: 'timan_service', permissions: { academy_track_sales: false, academy_track_service: true } };
  setAcademyCycleStorageScope('qa-render', 0, 'active', [ACADEMY_CASE_IDS.partnerDataPart1, ACADEMY_CASE_IDS.partnerDataPart2, ACADEMY_CASE_IDS.portalBasics, ACADEMY_CASE_IDS.partnerMap]);
  academySandbox.startServiceCase1();
  vi.spyOn(registry, 'fetchMachineRegistryPage').mockRejectedValue(new Error('Production read forbidden'));
  vi.spyOn(journal, 'loadMachineJournal').mockRejectedValue(new Error('Production read forbidden'));
  vi.spyOn(corrections, 'fetchMachineRegistryCorrection').mockRejectedValue(new Error('Production read forbidden'));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Actual machine pages with local Academy data', () => {
  it('searches, opens the target, requires explicit history interaction and persists 4/4', async () => {
    const page = open();
    await waitFor(() => expect(screen.getAllByText(target, { exact: true }).length).toBeGreaterThan(0));
    expect(academySandbox.getServiceCase1().searchOpened).toBe(true);
    expect(screen.queryByText('Production import control')).toBeNull();
    const field = screen.getAllByRole('textbox')[0];
    fireEvent.change(field, { target: { value: 'UNKNOWN' } });
    expect(academySandbox.getServiceCase1().targetSearched).toBe(false);
    fireEvent.change(field, { target: { value: target } });
    await waitFor(() => expect(academySandbox.getServiceCase1().targetSearched).toBe(true));
    const targetRow = screen.getAllByText(target, { exact: true }).find((node) => node.closest('tr'))!;
    fireEvent.click(targetRow);
    await screen.findByRole('heading', { name: 'RC-1000s' });
    expect(academySandbox.getServiceCase1().targetOpened).toBe(true);
    expect(academySandbox.getServiceCase1().historyOpened).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'TSB gennemgået' }));
    expect(academySandbox.getServiceCase1().completed).toBe(true);
    expect(screen.getByText('4 / 4 krav')).toBeTruthy();
    expect(registry.fetchMachineRegistryPage).not.toHaveBeenCalled();
    expect(journal.loadMachineJournal).not.toHaveBeenCalled();
    expect(corrections.fetchMachineRegistryCorrection).not.toHaveBeenCalled();
    page.unmount();
    open(`/portal/service/machines/${target}?academy_mode=true`);
    await screen.findByRole('heading', { name: 'RC-1000s' });
    expect(screen.getByText('4 / 4 krav')).toBeTruthy();
  });
  it('does not award target-open for a different machine', async () => {
    academySandbox.trackMachineAction('search-open');
    academySandbox.trackMachineAction('search', target);
    open('/portal/service/machines/ACA-411000-26-1001?academy_mode=true');
    await screen.findByRole('heading', { name: 'RC-1000s' });
    expect(academySandbox.getServiceCase1().targetOpened).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Service udført' }));
    expect(academySandbox.getServiceCase1().historyOpened).toBe(false);
  });
  it('effective external scope blocks an unrelated Academy serial without falling through to production', async () => {
    context.user = { ...context.user!, portal_role: 'timan_dealer', dealer_number: 'ACADEMY-102' };
    open(`/portal/service/machines/${target}?academy_mode=true`);
    await waitFor(() => expect(screen.getByText(target, { selector: 'div.text-2xl' })).toBeTruthy());
    expect(screen.queryByRole('heading', { name: 'RC-1000s' })).toBeNull();
    expect(journal.loadMachineJournal).not.toHaveBeenCalled();
    expect(academySandbox.getServiceCase1().targetOpened).toBe(false);
  });
  it.each(['sales-only', 'basic-incomplete', 'cycle-completed'])('blocks %s before mounting a service page', (condition) => {
    if (condition === 'sales-only') context.user!.permissions = { academy_track_sales: true, academy_track_service: false };
    if (condition === 'basic-incomplete') setAcademyCycleStorageScope('empty-cycle');
    if (condition === 'cycle-completed') setAcademyCycleStorageScope('done', 0, 'completed');
    open();
    expect(screen.getByText('Academy home')).toBeTruthy();
    expect(registry.fetchMachineRegistryPage).not.toHaveBeenCalled();
  });
});
