import { describe, expect, it } from 'vitest';
import { ACADEMY_CASE_1_ID, getAcademyCapabilityProgress, getAcademyProgress, isAcademyCapabilityUnlocked } from '@/lib/academyCurriculum';

const academySeller = { role: 'timan_saelger' as const, partner_type: null, portal_role: 'timan_seller', allowed_modules: ['academy'], permissions: {} };
const normalSeller = { role: 'timan_saelger' as const, partner_type: null, portal_role: 'timan_seller', permissions: {} };

describe('Academy Case 1 checkpoint curriculum', () => {
  it('keeps a new Academy seller locked out of Configurator and CRM', () => {
    expect(isAcademyCapabilityUnlocked(academySeller, 'configurator', [])).toBe(false);
    expect(isAcademyCapabilityUnlocked(academySeller, 'crm', [])).toBe(false);
  });

  it('unlocks Configurator only after Case 1, while CRM stays locked', () => {
    expect(isAcademyCapabilityUnlocked(academySeller, 'configurator', [ACADEMY_CASE_1_ID])).toBe(true);
    expect(isAcademyCapabilityUnlocked(academySeller, 'crm', [ACADEMY_CASE_1_ID])).toBe(false);
    expect(getAcademyCapabilityProgress('configurator', [ACADEMY_CASE_1_ID])).toEqual({ completedCount: 1, total: 1 });
  });

  it('does not apply Academy gates to a normal seller', () => {
    expect(isAcademyCapabilityUnlocked(normalSeller, 'configurator', [])).toBe(true);
    expect(getAcademyProgress(academySeller, [ACADEMY_CASE_1_ID])).toMatchObject({ completedCount: 1, total: 1, percentage: 100 });
  });
});
