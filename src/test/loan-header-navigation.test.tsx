import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import PortalHeader from '@/components/portal/PortalHeader';
import type { SessionUser } from '@/context/AppUserContext';

vi.mock('@/context/AppUserContext', () => ({ useAppUser: () => ({ refreshAppUser: vi.fn(), setAppUser: vi.fn() }) }));
vi.mock('@/context/LanguageContext', () => ({ useLanguage: () => ({ uiLanguage: 'da' }) }));
vi.mock('@/lib/dealerAccountsService', () => ({ fetchPendingUserCount: async () => 0 }));
vi.mock('@/components/portal/BackendSideNav', () => ({ default: () => null }));
vi.mock('@/lib/academyCurriculum', () => ({ clearLocalAcademyEnrollment: vi.fn() }));
vi.mock('@/lib/academySandbox', () => ({
  ACADEMY_PORTAL_BASICS: 'portal_basics', ACADEMY_PARTNER_MAP: 'partner_map',
  academySandbox: { isActive: () => false, getActiveCase: () => null },
}));

const parents = [
  ['/portal/loans', '/portal/salg-marketing'],
  ['/portal/loans/new', '/portal/loans'],
  ['/portal/loans/case-123', '/portal/loans'],
  ['/portal/loans/case-123/return', '/portal/loans/case-123'],
  ['/portal/loans/case-123/accept', '/portal/loans/case-123'],
  ['/portal/loans?view=stock', '/portal/salg-marketing'],
  ['/portal/loans?view=sale', '/portal/salg-marketing'],
  ['/portal/loans?status=closed', '/portal/salg-marketing'],
];

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function open(path: string, role: SessionUser['portal_role'], state?: unknown) {
  const user = { id: 'navigation-qa', email: 'navigation@example.invalid', display_name: 'QA', portal_role: role } as SessionUser;
  return render(<MemoryRouter initialEntries={['/unrelated', { pathname: path.split('?')[0], search: path.includes('?') ? `?${path.split('?')[1]}` : '', state }]}>
    <PortalHeader user={user} language="da" onLanguageChange={vi.fn()} onLogout={vi.fn()} />
    <Location />
  </MemoryRouter>);
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(cleanup);

describe.each(['timan_backend', 'timan_seller', 'dealer_user'] as const)('Loans header for %s', (role) => {
  it.each(parents)('Back from %s uses parent, not home or unrelated history', (path, parent) => {
    open(path, role);
    fireEvent.click(screen.getByRole('button', { name: 'Forrige' }));
    expect(screen.getByTestId('location').textContent).toBe(parent);
  });

  it('keeps the logo separate from Back on a deep link', () => {
    open('/portal/loans/case-123', role);
    fireEvent.click(screen.getByRole('button', { name: 'Gå til forside' }));
    expect(screen.getByTestId('location').textContent).toBe('/portal');
  });

  it('ignores stale CRM and machine navigation context inside Loans', () => {
    open('/portal/loans/case-123?fromMachine=other', role, { timanCrmLeadsReturnTo: '/portal/crm/leads?status=open' });
    fireEvent.click(screen.getByRole('button', { name: 'Forrige' }));
    expect(screen.getByTestId('location').textContent).toBe('/portal/loans');
  });

  it('keeps Back available at 390px after a fresh route mount', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    open('/portal/loans/new', role);
    fireEvent.click(screen.getByRole('button', { name: 'Forrige' }));
    expect(screen.getByTestId('location').textContent).toBe('/portal/loans');
  });
});

it('preserves the existing dealer-user fallback outside Loans', () => {
  open('/portal/resources', 'dealer_user');
  fireEvent.click(screen.getByRole('button', { name: 'Forrige' }));
  expect(screen.getByTestId('location').textContent).toBe('/portal');
});
