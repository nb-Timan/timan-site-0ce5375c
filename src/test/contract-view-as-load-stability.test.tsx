import { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/context/AppUserContext';

const mocks = vi.hoisted(() => ({
  fetchUser: vi.fn(),
  loadContract: vi.fn(),
  showLoadError: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.fetchUser,
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/activeMode', () => ({
  canSwitchMode: () => true,
  getActiveMode: () => 'user:akr',
  getActiveRolePreview: () => null,
  getActiveUserView: () => ({
    key: 'AKR',
    initials: 'AKR',
    email: 'akr@timan.dk',
    portalRole: 'timan_seller',
    viewRole: 'seller',
    label: 'AKR - Sælger',
  }),
}));

import { useEffectivePortalUserState } from '@/lib/viewAsUser';

const backendUser: SessionUser = {
  id: 'backend-user',
  email: 'backend@timan.dk',
  role: 'timan_saelger',
  partner_type: null,
  approved: true,
  is_active: true,
  start_step: 1,
  max_step: 4,
  can_view_prices: true,
  can_submit_order: true,
  can_edit_discount: true,
  can_switch_customer_mode: false,
  working_for: null,
  display_name: 'Backend User',
  initials: 'BU',
  portal_role: 'timan_backend',
  preferred_language: 'da',
  preferred_currency: 'DKK',
  company_dealer: 'Timan',
  portal_variant: 'standard',
  module_access: null,
  allowed_areas: null,
  allowed_modules: null,
  status: 'active',
  dealer_number: '100',
  permissions: null,
  quick_actions: null,
};

const sellerUser = {
  ...backendUser,
  id: 'akr-user',
  email: 'akr@timan.dk',
  display_name: 'AKR',
  initials: 'AKR',
  portal_role: 'timan_seller',
};

function ContractLoadHarness({ renderVersion }: { renderVersion: number }) {
  const { effectiveUser } = useEffectivePortalUserState(backendUser);

  useEffect(() => {
    if (!effectiveUser) return;
    mocks.loadContract().catch(() => mocks.showLoadError());
  }, [effectiveUser]);

  return <span>{renderVersion}</span>;
}

describe('contract loading under View-as', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchUser.mockResolvedValue({ data: sellerUser });
    mocks.loadContract.mockRejectedValue(new Error('controlled load failure'));
  });

  it('keeps one effective-user identity across renders, so a failed contract load and toast run once', async () => {
    const view = render(<ContractLoadHarness renderVersion={0} />);

    await waitFor(() => expect(mocks.loadContract).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.showLoadError).toHaveBeenCalledTimes(1));

    for (let version = 1; version <= 5; version += 1) {
      act(() => view.rerender(<ContractLoadHarness renderVersion={version} />));
    }

    expect(mocks.fetchUser).toHaveBeenCalledTimes(1);
    expect(mocks.loadContract).toHaveBeenCalledTimes(1);
    expect(mocks.showLoadError).toHaveBeenCalledTimes(1);
  });
});
