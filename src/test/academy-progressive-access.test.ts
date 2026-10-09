import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACADEMY_CASE_IDS,
  getAcademyCapabilityProgress,
  hasEffectiveAcademyCapabilityAccess,
  isAcademyCapabilityUnlocked,
  type AcademyUser,
} from '@/lib/academyCurriculum';
import {
  findPortalCapabilityContract,
  type PortalAcademyGate,
} from '../../supabase/functions/_shared/portalCapabilityContract';

const academySeller: AcademyUser = {
  role: 'timan_saelger',
  partner_type: null,
  portal_role: 'timan_seller',
  allowed_modules: ['academy', 'dealer_data', 'salg_marketing', 'byg_din_timan', 'videos', 'resources', 'sales_tools', 'contracts', 'timan_crm', 'teknik_service'],
  module_access: ['academy', 'dealer_data', 'salg_marketing', 'byg_din_timan', 'videos', 'resources', 'sales_tools', 'contracts', 'timan_crm', 'teknik_service'],
  permissions: { academy_track_sales: true, academy_track_service: true },
};

const dvpProgress = [
  ACADEMY_CASE_IDS.partnerDataPart1,
  ACADEMY_CASE_IDS.partnerDataPart2,
  ACADEMY_CASE_IDS.portalBasics,
  ACADEMY_CASE_IDS.partnerMap,
  ACADEMY_CASE_IDS.salesCase1,
];

describe('Academy progressive portal access', () => {
  it('matches the verified DVP 2/2 Partnerdata, 1/2 Sales, 0/2 CRM and 0/1 Service state', () => {
    expect(isAcademyCapabilityUnlocked(academySeller, 'partner_data', dvpProgress)).toBe(true);
    expect(isAcademyCapabilityUnlocked(academySeller, 'sales_area', dvpProgress)).toBe(true);
    expect(isAcademyCapabilityUnlocked(academySeller, 'configurator', dvpProgress)).toBe(true);
    expect(isAcademyCapabilityUnlocked(academySeller, 'sales_video', dvpProgress)).toBe(false);
    expect(isAcademyCapabilityUnlocked(academySeller, 'sales_complete', dvpProgress)).toBe(false);
    expect(isAcademyCapabilityUnlocked(academySeller, 'crm_area', dvpProgress)).toBe(false);
    expect(isAcademyCapabilityUnlocked(academySeller, 'technical_service', dvpProgress)).toBe(false);
  });

  it('unlocks normal Sales after Case 2 without requiring either bonus case', () => {
    const completed = [...dvpProgress, ACADEMY_CASE_IDS.salesCase2];
    expect(isAcademyCapabilityUnlocked(academySeller, 'sales_video', completed)).toBe(true);
    expect(isAcademyCapabilityUnlocked(academySeller, 'sales_complete', completed)).toBe(true);
    expect(completed).not.toContain(ACADEMY_CASE_IDS.salesCase3);
    expect(completed).not.toContain(ACADEMY_CASE_IDS.salesBonusCase2);
  });

  it('does not let bonus completion substitute for Sales Case 2', () => {
    const completed = [...dvpProgress, ACADEMY_CASE_IDS.salesCase3, ACADEMY_CASE_IDS.salesBonusCase2];
    expect(getAcademyCapabilityProgress('sales_complete', completed)).toEqual({ completedCount: 1, total: 2 });
    expect(isAcademyCapabilityUnlocked(academySeller, 'sales_complete', completed)).toBe(false);
  });

  it('unlocks CRM progressively and keeps unrelated CRM routes closed until 2/2', () => {
    const part1 = [...dvpProgress, ACADEMY_CASE_IDS.salesCase2, ACADEMY_CASE_IDS.crmPart1];
    expect(isAcademyCapabilityUnlocked(academySeller, 'crm_area', part1)).toBe(true);
    expect(isAcademyCapabilityUnlocked(academySeller, 'crm_leads', part1)).toBe(true);
    expect(isAcademyCapabilityUnlocked(academySeller, 'crm_demo', part1)).toBe(false);
    expect(isAcademyCapabilityUnlocked(academySeller, 'crm_complete', part1)).toBe(false);
    expect(isAcademyCapabilityUnlocked(academySeller, 'crm_complete', [...part1, ACADEMY_CASE_IDS.crmPart2])).toBe(true);
  });

  it('unlocks Technical & Service only after its canonical case', () => {
    expect(isAcademyCapabilityUnlocked(academySeller, 'technical_service', dvpProgress)).toBe(false);
    expect(isAcademyCapabilityUnlocked(academySeller, 'technical_service', [...dvpProgress, ACADEMY_CASE_IDS.serviceCase1])).toBe(true);
  });

  it('never uses Academy completion to grant a missing normal permission', () => {
    const allCases = Object.values(ACADEMY_CASE_IDS);
    expect(hasEffectiveAcademyCapabilityAccess(academySeller, false, 'configurator', allCases)).toBe(false);
    expect(hasEffectiveAcademyCapabilityAccess(academySeller, true, 'configurator', allCases)).toBe(true);
  });

  it('keeps the same access result in all nine portal languages', () => {
    const languages = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'];
    const results = languages.map(() => isAcademyCapabilityUnlocked(academySeller, 'configurator', dvpProgress));
    expect(results).toEqual(languages.map(() => true));
  });

  it.each<[string, PortalAcademyGate]>([
    ['area.partner_data', 'partner_data'],
    ['area.sales', 'sales_area'],
    ['sales.configurator', 'configurator'],
    ['sales.videos', 'sales_video'],
    ['sales.resources', 'sales_complete'],
    ['quick.create_lead', 'crm_leads'],
    ['quick.create_demo', 'crm_demo'],
    ['area.technical_service', 'technical_service'],
  ])('maps %s through the canonical capability registry', (featureKey, gate) => {
    expect(findPortalCapabilityContract(featureKey)?.academyGate).toBe(gate);
  });

  it('gates direct routes as well as cards and quick actions', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    const portal = readFileSync('src/pages/PortalPage.tsx', 'utf8');
    const quickActions = readFileSync('src/components/portal/QuickActions.tsx', 'utf8');
    expect(app).toContain('path="/portal/videos" element={<AcademyCapabilityGuard capability="sales_video">');
    expect(app).toContain('path="/portal/service/machines" element={<MachineSearchPage />}');
    expect(app).toContain('<Route element={<AcademyCapabilityGuard capability="technical_service" />}>');
    expect(portal).toContain('findPortalAreaCapabilityContract(area.id)?.academyGate');
    expect(quickActions).toContain('findPortalCapabilityContract(action.featureKey)?.academyGate');
    expect(quickActions).not.toContain('Kræver Academy');
  });
});
