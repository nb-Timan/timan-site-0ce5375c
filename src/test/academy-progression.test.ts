import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACADEMY_CASE_IDS,
  ACADEMY_CURRICULUM_ORDER,
  canOpenAcademyCase,
  getAcademyCasePrerequisites,
  getAcademyCaseState,
  getNextAcademyCase,
} from '@/lib/academyCurriculum';

describe('canonical Academy progression', () => {
  it('uses Partnerdata -> Portal Basics -> Sales -> CRM without changing case ids', () => {
    expect(ACADEMY_CURRICULUM_ORDER).toEqual([
      'partnerdata.part_1_profile',
      'partnerdata.part_2_relations',
      'portal.basics_5',
      'portal.partner_map',
      'sales.case_1_rc1000',
      'sales.case_2_video_3330',
      'sales.case_3_rc1000_delivery',
      'sales.bonus_case_2_3330_cs200_campaign',
      'crm.part_1',
      'crm.part_2',
      'service.case_1_machine_history',
    ]);
  });

  it('opens only Partnerdata Part 1 for a new cycle', () => {
    expect(getAcademyCaseState(ACADEMY_CASE_IDS.partnerDataPart1, [])).toBe('ready');
    for (const caseId of ACADEMY_CURRICULUM_ORDER.slice(1)) {
      expect(getAcademyCaseState(caseId, [])).toBe('locked');
    }
  });

  it.each(ACADEMY_CURRICULUM_ORDER.slice(1))('unlocks %s after its canonical prerequisites', (caseId) => {
    expect(getAcademyCaseState(caseId, getAcademyCasePrerequisites(caseId))).toBe('ready');
  });

  it('shows an available started case as active', () => {
    expect(getAcademyCaseState(
      ACADEMY_CASE_IDS.portalBasics,
      getAcademyCasePrerequisites(ACADEMY_CASE_IDS.portalBasics),
      [ACADEMY_CASE_IDS.portalBasics],
    )).toBe('active');
  });

  it('prioritizes historical completion and unlocks the next case from its direct prerequisite', () => {
    const completed = [ACADEMY_CASE_IDS.salesCase1];
    expect(getAcademyCaseState(ACADEMY_CASE_IDS.salesCase1, completed)).toBe('completed');
    expect(getAcademyCaseState(ACADEMY_CASE_IDS.salesCase2, completed)).toBe('ready');
    expect(getAcademyCaseState(ACADEMY_CASE_IDS.partnerDataPart1, completed)).toBe('ready');
  });

  it('assigns Sales Case 3 to the sales track and unlocks it after Case 2', () => {
    expect(getAcademyCaseState(
      ACADEMY_CASE_IDS.salesCase3,
      getAcademyCasePrerequisites(ACADEMY_CASE_IDS.salesCase3),
    )).toBe('ready');
    expect(getAcademyCaseState(
      ACADEMY_CASE_IDS.salesCase3,
      [ACADEMY_CASE_IDS.salesCase1],
    )).toBe('locked');
    expect(ACADEMY_CURRICULUM_ORDER.filter((id) => id.startsWith('sales.case_') || id.startsWith('sales.bonus_'))).toHaveLength(4);
  });

  it('unlocks CRM Case 1 after Sales Case 2 without making Sales Case 3 a blocker', () => {
    const completed = [ACADEMY_CASE_IDS.salesCase2];
    expect(getAcademyCaseState(ACADEMY_CASE_IDS.crmPart1, completed)).toBe('ready');
    expect(getAcademyCaseState(ACADEMY_CASE_IDS.salesCase3, completed)).toBe('ready');
    expect(getAcademyCaseState(ACADEMY_CASE_IDS.salesBonusCase2, completed)).toBe('ready');
  });

  it('keeps the service track independent from the Sales chain', () => {
    expect(getAcademyCaseState(
      ACADEMY_CASE_IDS.serviceCase1,
      [ACADEMY_CASE_IDS.partnerMap],
    )).toBe('ready');
    expect(getAcademyCaseState(
      ACADEMY_CASE_IDS.salesCase2,
      [ACADEMY_CASE_IDS.serviceCase1],
    )).toBe('locked');
  });

  it('points next unlock at a real actionable case instead of an unrelated locked row', () => {
    const completed = new Set([ACADEMY_CASE_IDS.salesCase1]);
    const stateFor = (caseId: typeof ACADEMY_CURRICULUM_ORDER[number]) => getAcademyCaseState(caseId, completed);

    expect(getNextAcademyCase(ACADEMY_CURRICULUM_ORDER, stateFor)).toBe(ACADEMY_CASE_IDS.partnerDataPart1);

    const salesCurriculum = [ACADEMY_CASE_IDS.salesCase1, ACADEMY_CASE_IDS.salesCase2, ACADEMY_CASE_IDS.salesCase3, ACADEMY_CASE_IDS.crmPart1];
    expect(getNextAcademyCase(salesCurriculum, (caseId) => getAcademyCaseState(caseId, completed, [], true, salesCurriculum)))
      .toBe(ACADEMY_CASE_IDS.salesCase2);
  });

  it('prioritizes the mandatory CRM chain over the optional Sales Case 3', () => {
    const completed = new Set([ACADEMY_CASE_IDS.salesCase1, ACADEMY_CASE_IDS.salesCase2]);
    const salesCurriculum = [
      ACADEMY_CASE_IDS.salesCase1,
      ACADEMY_CASE_IDS.salesCase2,
      ACADEMY_CASE_IDS.salesCase3,
      ACADEMY_CASE_IDS.salesBonusCase2,
      ACADEMY_CASE_IDS.crmPart1,
    ];

    expect(getNextAcademyCase(
      salesCurriculum,
      (caseId) => getAcademyCaseState(caseId, completed, [], true, salesCurriculum),
    )).toBe(ACADEMY_CASE_IDS.crmPart1);
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
    const partnerData = source.indexOf("<Module title={tr('academyPartnerData')}");
    const portalBasics = source.indexOf("<Module title={tr('academyPortalBasics')}", partnerData + 1);
    const sales = source.indexOf("<Module title={tr('academySales')}", portalBasics + 1);
    const bonus = source.indexOf("<Module title={tr('academyBonusSales')}", sales + 1);
    const crm = source.indexOf('<Module title="CRM"', bonus + 1);

    expect(partnerData).toBeGreaterThan(-1);
    expect(partnerData).toBeLessThan(portalBasics);
    expect(portalBasics).toBeLessThan(sales);
    expect(sales).toBeLessThan(bonus);
    expect(bonus).toBeLessThan(crm);
    expect(source).toContain("countCompleted([ACADEMY_CASE_IDS.salesCase1, ACADEMY_CASE_IDS.salesCase2])} / 2");
    expect(source).toContain('bonusSalesCompleted} / 2');
    expect(source).toContain("'grid w-full grid-cols-[40px_minmax(0,1fr)]");
    expect(source).toContain('disabled={!interactive}');
  });
});
