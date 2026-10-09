import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import QuickActions from '@/components/portal/QuickActions';
import type { SessionUser } from '@/context/AppUserContext';
import type { QuickActionKey } from '@/lib/backend-users-store';

const state = vi.hoisted(() => ({ appUser: null as SessionUser | null, effectiveUser: null as SessionUser | null }));
vi.mock('@/context/AppUserContext', () => ({ useAppUser: () => ({ appUser: state.appUser }) }));
vi.mock('@/lib/viewAsUser', () => ({ useEffectivePortalUser: (user: SessionUser | null) => state.effectiveUser ?? user }));
vi.mock('@/lib/academySandbox', () => ({ academySandbox: { isActive: () => false, getCompletedCaseIds: () => [] } }));

const canonicalOrder: QuickActionKey[] = [
  'create_lead', 'create_demo', 'company_contact_info', 'dealer_invoice_accept',
  'create_warranty_registration', 'warranty_registrations', 'partner_map',
];

function seller(actions: QuickActionKey[], modules = ['sales_tools', 'timan_crm', 'warranty']): SessionUser {
  return {
    id: 'qa-seller', email: 'qa@example.invalid', role: 'timan_saelger', partner_type: null,
    approved: true, is_active: true, start_step: 1, max_step: 4, can_view_prices: true,
    can_submit_order: true, can_edit_discount: false, can_switch_customer_mode: false,
    portal_role: 'timan_seller', allowed_areas: ['salg_marketing', 'timan_crm', 'teknik_service'],
    allowed_modules: modules, module_access: null, permissions: null, quick_actions: actions,
  };
}

function open() {
  return render(<MemoryRouter><QuickActions language="da" /></MemoryRouter>);
}

beforeEach(() => {
  state.appUser = seller([]);
  state.effectiveUser = null;
});
afterEach(cleanup);

describe('Portal Home quick-action parity', () => {
  it.each([4, 5, 7])('renders every one of %s canonically allowed actions', (count) => {
    state.appUser = seller(canonicalOrder.slice(0, count));
    open();
    expect(screen.getAllByRole('link')).toHaveLength(count);
  });

  it('keeps configured ordering and manual ON/OFF state', () => {
    state.appUser = seller(['partner_map', 'create_lead', 'dealer_invoice_accept']);
    open();
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Partnerkort', 'Opret nyt lead', 'Forhandler faktura accept',
    ]);
    expect(screen.queryByText('Ny demo-registrering')).toBeNull();
  });

  it('keeps configured but unauthorized actions hidden', () => {
    state.appUser = seller(canonicalOrder, ['sales_tools', 'timan_crm']);
    open();
    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(screen.queryByText('Opret garantiregistrering')).toBeNull();
    expect(screen.queryByText('Registrerede garantibeviser')).toBeNull();
  });

  it('renders the View-as target actions without Backend leakage', () => {
    state.appUser = { ...seller(canonicalOrder), id: 'backend', portal_role: 'timan_backend' };
    state.effectiveUser = seller(canonicalOrder.slice(0, 5));
    open();
    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(screen.queryByText('Registrerede garantibeviser')).toBeNull();
  });

  it('wraps responsively without removing actions at desktop or 390px', () => {
    state.appUser = seller(canonicalOrder);
    const view = open();
    const grid = view.container.querySelector('.grid');
    expect(grid?.className).toContain('grid-cols-2');
    expect(grid?.className).toContain('lg:grid-cols-4');
    expect(screen.getAllByRole('link')).toHaveLength(7);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    window.dispatchEvent(new Event('resize'));
    expect(screen.getAllByRole('link')).toHaveLength(7);
  });
});
