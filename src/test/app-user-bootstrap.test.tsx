import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { AppUserProvider, useAppUser } from '@/context/AppUserContext';

const { getSession, maybeSingle } = vi.hoisted(() => ({
  getSession: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn(),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  },
}));
vi.mock('@/lib/linkAuthUser', () => ({ linkAuthUserIdIfNeeded: vi.fn() }));
vi.mock('@/lib/adminUserActions', () => ({ syncSelfAppUser: vi.fn() }));
vi.mock('@/lib/dealerAccountsService', () => ({ fetchDealerStatusForUser: vi.fn() }));

function Probe() {
  const { appUser, loading, startupError } = useAppUser();
  return <div>{loading ? 'loading' : startupError ? 'startup-error' : appUser?.email || 'anonymous'}</div>;
}

describe('AppUserProvider startup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    getSession.mockReset().mockResolvedValue({
      data: { session: { user: { email: 'bp@timan.dk', user_metadata: {} } } },
      error: null,
    });
    maybeSingle.mockReset().mockReturnValue(new Promise(() => undefined));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ends a hanging profile bootstrap with a controlled error state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<AppUserProvider><Probe /></AppUserProvider>);
    expect(screen.getByText('loading')).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });

    expect(screen.getByText('startup-error')).toBeInTheDocument();
  });

  it('keeps a versioned cached identity usable during a transient profile timeout', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sessionStorage.setItem('timan.appUser', JSON.stringify({
      __identity_cache_version: 5,
      id: 'bp-id',
      email: 'bp@timan.dk',
      role: 'timan_saelger',
      portal_role: 'timan_backend',
      approved: true,
      is_active: true,
      start_step: 1,
      max_step: 4,
      can_view_prices: true,
      can_submit_order: true,
      can_edit_discount: false,
      can_switch_customer_mode: false,
      working_for: null,
    }));
    render(<AppUserProvider><Probe /></AppUserProvider>);

    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });

    expect(screen.getByText('bp@timan.dk')).toBeInTheDocument();
  });
});
