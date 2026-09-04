import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MODULE_ACCESS,
  canManageMarketingVideos,
  derivePortalRole,
  deriveStoredPortalRole,
  hasAreaAccess,
  hasInternalMesseAccess,
  hasMessePortalAccess,
  hasModuleAccess,
  isBackendActor,
} from '@/lib/portalAccess';
import { setActiveMode } from '@/lib/activeMode';
import { isExternalMesseRole } from '@/components/messe/MesseGuards';

const seller = {
  email: 'akr@timan.dk',
  role: 'timan_saelger',
  partner_type: null,
  portal_role: 'timan_seller',
};

const backend = {
  email: 'nb@timan.dk',
  role: 'timan_saelger',
  partner_type: null,
  portal_role: 'timan_backend',
};

describe('portal access precedence', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses role defaults when no manual area override exists', () => {
    expect(hasAreaAccess(seller, 'timan_crm')).toBe(true);
    expect(hasAreaAccess(seller, 'marketing')).toBe(false);
  });

  it('lets a manual area override grant extra access', () => {
    expect(hasAreaAccess({ ...seller, allowed_areas: ['marketing'] }, 'marketing')).toBe(true);
  });

  it('keeps Marketing area access separate from Marketing video management', () => {
    expect(canManageMarketingVideos({ ...seller, allowed_areas: ['marketing'], permissions: {} })).toBe(false);
    expect(canManageMarketingVideos({ ...seller, allowed_areas: ['marketing'], permissions: { marketing_videos_manage: true } })).toBe(true);
    expect(canManageMarketingVideos({ ...seller, permissions: { news_manage: true } })).toBe(true);
    expect(canManageMarketingVideos({ ...seller, permissions: { news_manage: true, marketing_videos_manage: false } })).toBe(false);
  });

  it('respects an explicitly empty manual area override', () => {
    expect(hasAreaAccess({ ...seller, allowed_areas: [] }, 'timan_crm')).toBe(false);
  });

  it('respects an explicitly empty module override', () => {
    expect(hasModuleAccess('timan_seller', 'timan_crm', [])).toBe(false);
  });

  it('lets a manual module deny override a seller role default', () => {
    const sellerWithContractDefault = [...DEFAULT_MODULE_ACCESS.timan_seller, 'contracts'];
    const manualModules = sellerWithContractDefault.filter((key) => key !== 'contracts');
    expect(hasModuleAccess('timan_seller', 'contracts', manualModules)).toBe(false);
  });

  it('keeps Timan Backend role access as the minimum access', () => {
    expect(hasAreaAccess({ ...backend, allowed_areas: ['salg_marketing'] }, 'marketing')).toBe(true);
    expect(hasModuleAccess('timan_backend', 'marketing', [])).toBe(true);
  });

  it('grants Timan Forhandler the canonical five front-page areas without backend-only areas', () => {
    const dealer = {
      email: 'dvp@example.com',
      role: 'partner',
      partner_type: 'forhandler',
      portal_role: 'timan_dealer',
      module_access: null,
      allowed_modules: null,
      allowed_areas: null,
    };

    expect(hasAreaAccess(dealer, 'salg_marketing')).toBe(true);
    expect(hasAreaAccess(dealer, 'dealer_data')).toBe(true);
    expect(hasAreaAccess(dealer, 'timan_crm')).toBe(true);
    expect(hasAreaAccess(dealer, 'teknik_service')).toBe(true);
    expect(hasModuleAccess('timan_dealer', 'messe_portal')).toBe(true);

    expect(hasAreaAccess(dealer, 'timan_backend')).toBe(false);
    expect(hasAreaAccess(dealer, 'marketing')).toBe(false);
    expect(hasAreaAccess(dealer, 'projects')).toBe(false);
  });

  it('keeps Timan Forhandler defaults aligned for real role and role preview', () => {
    const canonicalDealerModules = DEFAULT_MODULE_ACCESS.timan_dealer;
    const expectedMainAccess = ['salg_marketing', 'dealer_data', 'timan_crm', 'teknik_service'] as const;

    expect(canonicalDealerModules).toContain('messe_portal');
    for (const area of expectedMainAccess) {
      expect(hasAreaAccess({
        role: 'partner',
        partner_type: 'forhandler',
        portal_role: 'timan_dealer',
        allowed_areas: null,
        allowed_modules: null,
        module_access: null,
      }, area)).toBe(true);
    }

    expect(hasAreaAccess({
      role: 'partner',
      partner_type: 'forhandler',
      portal_role: 'timan_dealer',
      allowed_areas: null,
      allowed_modules: null,
      module_access: null,
    }, 'marketing')).toBe(false);
    expect(hasModuleAccess('timan_dealer', 'projects')).toBe(false);
  });

  it('allows standard Messe portal for Timan Forhandler but not internal Messe flows', () => {
    const dealer = {
      email: 'dvp@example.com',
      role: 'partner',
      partner_type: 'forhandler',
      portal_role: 'timan_dealer',
      module_access: null,
      allowed_modules: null,
      allowed_areas: null,
    };

    expect(hasMessePortalAccess(dealer)).toBe(true);
    expect(hasInternalMesseAccess(dealer)).toBe(false);
    expect(isExternalMesseRole('timan_dealer')).toBe(true);
    expect(isExternalMesseRole('timan_backend')).toBe(false);
  });

  it('does not treat external Messe portal access as internal Messe access', () => {
    const dealerWithExplicitMessePortal = {
      email: 'dvp@example.com',
      role: 'partner',
      partner_type: 'forhandler',
      portal_role: 'timan_dealer',
      module_access: ['messe_portal'],
      allowed_modules: null,
      allowed_areas: null,
    };

    expect(hasMessePortalAccess(dealerWithExplicitMessePortal)).toBe(true);
    expect(hasInternalMesseAccess(dealerWithExplicitMessePortal)).toBe(false);
  });

  it('keeps backend route access tied to the real stored role, not view-as mode', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });

    const bpBackend = { ...backend, email: 'bp@timan.dk' };
    setActiveMode(bpBackend.email, 'BP');

    expect(derivePortalRole(bpBackend)).toBe('timan_seller');
    expect(deriveStoredPortalRole(bpBackend)).toBe('timan_backend');
    expect(isBackendActor(bpBackend)).toBe(true);
  });
});
