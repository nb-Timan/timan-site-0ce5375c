import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { academySandbox, type AcademyActiveCase } from '@/lib/academySandbox';
import { academyProtectedFetch } from '@/lib/academyProductionWriteGuard';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/portal');
  vi.stubEnv('DEV', false);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('production Academy context', () => {
  it.each<AcademyActiveCase>([
    'sales.case_1_rc1000', 'portal.basics_5',
    'crm.part_1', 'crm.part_2', 'partnerdata.part_1_profile', 'partnerdata.part_2_relations',
  ])('persists %s independently of query and tab storage', (caseId) => {
    academySandbox.activateCase(caseId);
    const route = academySandbox.getContinueRoute();
    window.history.replaceState({}, '', '/portal/videos');
    sessionStorage.clear();
    expect(academySandbox.isActive()).toBe(true);
    expect(academySandbox.getActiveCase()).toBe(caseId);
    expect(academySandbox.getContinueRoute()).toBe(route);
    expect(route).not.toBe('/academy');
  });
  it('persists Sales Case 2 only after its Case 1 prerequisite is complete', () => {
    academySandbox.startCase1();
    academySandbox.evaluate({
      machineConfigs: [
        { type: 'RC-1000S', acc: ['410910', '730600', '412603', '412594', '412614'], qty: 1 },
        { type: 'RC-751', qty: 1 },
      ],
      wiringHarnessInCart: true,
      quantityDiscount: true,
    });
    academySandbox.generateQuote();
    academySandbox.saveLead();
    academySandbox.startCase2();

    window.history.replaceState({}, '', '/portal/videos');
    sessionStorage.clear();

    expect(academySandbox.getActiveCase()).toBe('sales.case_2_video_3330');
    expect(academySandbox.getContinueRoute()).toBe('/portal/videos?academy_mode=true&academy_case=2');
  });
  it('keeps CRM part 2 when a nested link drops its query', () => {
    academySandbox.activateCase('crm.part_2');
    expect(academySandbox.getCrmPart()).toBe(2);
  });
  it('explicit exit wins over browser history without deleting progress', () => {
    academySandbox.startCase1();
    const progress = academySandbox.getCase1();
    academySandbox.leaveSession();
    window.history.replaceState({}, '', '/configurator?academy_mode=true');
    expect(academySandbox.isActive()).toBe(false);
    expect(academySandbox.getActiveCase()).toBeNull();
    expect(academySandbox.getCase1()).toEqual(progress);
    academySandbox.startCase1();
    expect(academySandbox.isActive()).toBe(true);
  });
  it('normal portal and malformed session do not activate Academy', () => {
    expect(academySandbox.isActive()).toBe(false);
    localStorage.setItem('timan.academy.session.v1', 'null');
    expect(academySandbox.isActive()).toBe(false);
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('blocks production %s without DEV or query flags', async (method) => {
    academySandbox.activateCase('crm.part_1');
    const network = vi.spyOn(globalThis, 'fetch');
    await expect(academyProtectedFetch('https://example.supabase.co/rest/v1/crm_leads', { method })).rejects.toThrow('production writes');
    expect(network).not.toHaveBeenCalled();
  });
});
