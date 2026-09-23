import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACADEMY_CASE_IDS,
  ACADEMY_CURRICULUM_ORDER,
  canOpenAcademyCase,
  getAcademyCaseState,
} from '@/lib/academyCurriculum';

const completedBefore = (caseId: typeof ACADEMY_CURRICULUM_ORDER[number]) => {
  const index = ACADEMY_CURRICULUM_ORDER.indexOf(caseId);
  return ACADEMY_CURRICULUM_ORDER.slice(0, index);
};

describe('canonical Academy progression', () => {
  it('uses Partnerdata -> Portal Basics -> Sales -> CRM without changing case ids', () => {
    expect(ACADEMY_CURRICULUM_ORDER).toEqual([
      'partnerdata.part_1_profile',
      'partnerdata.part_2_relations',
      'portal.basics_5',
      'portal.partner_map',
      'sales.case_1_rc1000',
      'sales.case_2_video_3330',
      'crm.part_1',
      'crm.part_2',
    ]);
  });

  it('opens only Partnerdata Part 1 for a new cycle', () => {
    expect(getAcademyCaseState(ACADEMY_CASE_IDS.partnerDataPart1, [])).toBe('ready');
    for (const caseId of ACADEMY_CURRICULUM_ORDER.slice(1)) {
      expect(getAcademyCaseState(caseId, [])).toBe('locked');
    }
  });

  it.each(ACADEMY_CURRICULUM_ORDER.slice(1))('unlocks %s after every earlier step', (caseId) => {
    expect(getAcademyCaseState(caseId, completedBefore(caseId))).toBe('ready');
  });

  it('shows an available started case as active', () => {
    expect(getAcademyCaseState(
      ACADEMY_CASE_IDS.portalBasics,
      completedBefore(ACADEMY_CASE_IDS.portalBasics),
      [ACADEMY_CASE_IDS.portalBasics],
    )).toBe('active');
  });

  it('keeps historical later completion while preserving prerequisites for future unlocks', () => {
    const completed = [ACADEMY_CASE_IDS.salesCase1];
    expect(getAcademyCaseState(ACADEMY_CASE_IDS.salesCase1, completed)).toBe('completed');
    expect(getAcademyCaseState(ACADEMY_CASE_IDS.salesCase2, completed)).toBe('locked');
    expect(getAcademyCaseState(ACADEMY_CASE_IDS.partnerDataPart1, completed)).toBe('ready');
  });

  it('makes ready, active and completed cases navigable, but not locked cases', () => {
    expect(canOpenAcademyCase('ready')).toBe(true);
    expect(canOpenAcademyCase('active')).toBe(true);
    expect(canOpenAcademyCase('completed')).toBe(true);
    expect(canOpenAcademyCase('locked')).toBe(false);
  });

  it('uses the same locked state when the Academy cycle is unavailable', () => {
    expect(getAcademyCaseState(ACADEMY_CASE_IDS.partnerDataPart1, [], [], false)).toBe('locked');
    expect(getAcademyCaseState(
      ACADEMY_CASE_IDS.partnerDataPart1,
      [ACADEMY_CASE_IDS.partnerDataPart1],
      [],
      false,
    )).toBe('completed');
  });

  it('renders curriculum modules in canonical order and uses a whole-row button', () => {
    const source = readFileSync('src/pages/AcademyPage.tsx', 'utf8');
    const partnerData = source.indexOf('<Module icon={ACADEMY_AREA_ICONS.partnerData}');
    const portalBasics = source.indexOf('<Module icon={ACADEMY_AREA_ICONS.portalBasics}', partnerData + 1);
    const sales = source.indexOf('<Module icon={ACADEMY_AREA_ICONS.sales}', portalBasics + 1);
    const crm = source.indexOf('<Module icon={ACADEMY_AREA_ICONS.crm}', sales + 1);

    expect(partnerData).toBeGreaterThan(-1);
    expect(partnerData).toBeLessThan(portalBasics);
    expect(portalBasics).toBeLessThan(sales);
    expect(sales).toBeLessThan(crm);
    expect(source).toContain("'grid w-full grid-cols-[40px_minmax(0,1fr)]");
    expect(source).toContain('disabled={!interactive}');
  });
});
