import { afterEach, describe, expect, it, vi } from 'vitest';
import { derivePortalRole, deriveStoredPortalRole, hasAreaAccess, hasModuleAccess, isBackendActor } from '@/lib/portalAccess';
import { setActiveMode } from '@/lib/activeMode';

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

  it('respects an explicitly empty manual area override', () => {
    expect(hasAreaAccess({ ...seller, allowed_areas: [] }, 'timan_crm')).toBe(false);
  });

  it('respects an explicitly empty module override', () => {
    expect(hasModuleAccess('timan_seller', 'timan_crm', [])).toBe(false);
  });

  it('keeps Timan Backend role access as the minimum access', () => {
    expect(hasAreaAccess({ ...backend, allowed_areas: ['salg_marketing'] }, 'marketing')).toBe(true);
    expect(hasModuleAccess('timan_backend', 'marketing', [])).toBe(true);
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
