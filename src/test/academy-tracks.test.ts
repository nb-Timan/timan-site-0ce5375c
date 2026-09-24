import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ACADEMY_CASE_IDS, ACADEMY_CASE_TRACK, ACADEMY_CURRICULUM_ORDER, canAccessAcademyCase, getAcademyAwardTargets, getAcademyCaseState, getAcademyProgress, getAcademyRouteTrack, getAcademyTracks, getAssignedAcademyCurriculum, getMandatoryAcademyCurriculum, isAcademyCapabilityUnlocked } from '@/lib/academyCurriculum';
import { sanitizeAccessForRole } from '@/lib/backendUsersService';
import { getLocalAcademyBackendUser } from '@/lib/academyCurriculum';
import { getLocalAcademyUser } from '@/lib/academyCurriculum';
import { mergeEffectivePortalUser } from '@/lib/viewAsUser';

const user = (sales?: boolean, service?: boolean, on = true) => ({
  role: 'timan_saelger' as const, portal_role: 'timan_seller', allowed_modules: on ? ['academy'] : [],
  permissions: { ...(sales === undefined ? {} : { academy_track_sales: sales }), ...(service === undefined ? {} : { academy_track_service: service }) },
});

describe('Academy assigned tracks', () => {
  it('requires the area even when both track permissions are true', () => {
    expect(getAcademyTracks(user(true, true, false))).toEqual([]);
    expect(getAssignedAcademyCurriculum(user(true, true, false))).toEqual([]);
  });
  it.each([
    [false, false, ['basic'], 4], [true, false, ['basic', 'sales'], 9],
    [false, true, ['basic', 'service'], 5], [true, true, ['basic', 'sales', 'service'], 10],
  ] as const)('resolves Sales=%s Service=%s without duplicating Basic', (sales, service, tracks, total) => {
    const target = user(sales, service);
    expect(getAcademyTracks(target)).toEqual(tracks);
    const curriculum = getAssignedAcademyCurriculum(target);
    expect(curriculum).toHaveLength(total);
    expect(new Set(curriculum).size).toBe(total);
    expect(curriculum.filter((id) => ACADEMY_CASE_TRACK[id] === 'basic')).toHaveLength(4);
    const mandatoryTotal = total - (sales ? 1 : 0);
    expect(getAcademyProgress(target, ACADEMY_CURRICULUM_ORDER)).toEqual({ completedCount: mandatoryTotal, total: mandatoryTotal, percentage: 100 });
  });
  it('preserves the old curriculum and ids when no track overrides exist', () => {
    expect(getAssignedAcademyCurriculum(user())).toEqual(ACADEMY_CURRICULUM_ORDER.filter((id) => ACADEMY_CASE_TRACK[id] !== 'service'));
    expect(getAcademyProgress(user(), [ACADEMY_CASE_IDS.salesCase1])).toMatchObject({ completedCount: 1, total: 8 });
  });
  it('keeps the optional Sales case assigned but excludes it from mandatory progress', () => {
    const target = user(true, true);
    expect(getAssignedAcademyCurriculum(target)).toContain(ACADEMY_CASE_IDS.salesCase3);
    expect(getMandatoryAcademyCurriculum(target)).not.toContain(ACADEMY_CASE_IDS.salesCase3);
    const beforeBonus = getAcademyProgress(target, ACADEMY_CURRICULUM_ORDER.filter((id) => id !== ACADEMY_CASE_IDS.salesCase3));
    const afterBonus = getAcademyProgress(target, ACADEMY_CURRICULUM_ORDER);
    expect(afterBonus).toEqual(beforeBonus);
  });
  it('maps Partnerdata/Portal Basics to Basic and Sales/CRM to Sales', () => {
    for (const id of ACADEMY_CURRICULUM_ORDER) expect(ACADEMY_CASE_TRACK[id]).toBe(/^(partnerdata|portal)\./.test(id) ? 'basic' : id.startsWith('service.') ? 'service' : 'sales');
  });
  it('does not allow disabling Basic separately', () => {
    expect(getAcademyTracks({ ...user(false, false), permissions: { academy_track_sales: false, academy_track_basic: false } })).toEqual(['basic']);
  });
  it('never unlocks unassigned historical cases or Sales capabilities', () => {
    const target = user(false, true);
    const curriculum = getAssignedAcademyCurriculum(target);
    expect(canAccessAcademyCase(target, ACADEMY_CASE_IDS.salesCase1)).toBe(false);
    expect(getAcademyCaseState(ACADEMY_CASE_IDS.salesCase1, ACADEMY_CURRICULUM_ORDER, [], true, curriculum)).toBe('locked');
    expect(isAcademyCapabilityUnlocked(target, 'configurator', ACADEMY_CURRICULUM_ORDER)).toBe(false);
    expect(curriculum.find((id) => getAcademyCaseState(id, curriculum, [], true, curriculum) !== 'completed')).toBeUndefined();
    expect(getAcademyAwardTargets(target)).toEqual(['gold']);
  });
  it.each(['/configurator', '/academy/crm/leads', '/academy/crm/leads/lead-id', '/portal/crm/demo/new', '/portal/videos', '/messe/konfigurator'])('guards direct training route %s', (path) => {
    expect(getAcademyRouteTrack(path, '?academy_mode=true')).toBe('sales');
    expect(getAcademyRouteTrack(path, '?academy_mode=true&track=basic')).toBe('sales');
    expect(getAcademyTracks(user(false, true))).not.toContain(getAcademyRouteTrack(path, '?academy_mode=true'));
  });
  it('resolves the effective target instead of backend permissions', () => {
    const backend = { ...getLocalAcademyUser(), ...user(true, true), portal_role: 'timan_backend' };
    const target = { ...getLocalAcademyUser(), ...user(false, true), id: 'qa-target', email: 'qa-target@example.invalid' };
    const effective = mergeEffectivePortalUser(backend, target, null);
    expect(getAcademyTracks(effective)).toEqual(['basic', 'service']);
    expect(effective.id).toBe(target.id);
  });
  it('preserves track overrides through save serialization and dealer sanitization', () => {
    const original = getLocalAcademyBackendUser();
    const draft = { ...original, role: 'timan_dealer' as const, perms: { ...original.perms, academy_track_sales: false, academy_track_service: true } };
    const saved = JSON.parse(JSON.stringify(sanitizeAccessForRole(draft)));
    expect(saved.perms.academy_track_sales).toBe(false);
    expect(saved.perms.academy_track_service).toBe(true);
    expect(saved.perms.can_manage_users).toBe(false);
  });
  it('keeps one reset action and protected server-side completion', () => {
    const editor = readFileSync('src/pages/backend/BackendUsersPage.tsx', 'utf8');
    expect(editor.match(/Nulstil til rolle/g)).toHaveLength(1);
    const sql = readFileSync('supabase/migrations/20260924063833_academy_track_access.sql', 'utf8');
    expect(sql).toContain('p_case_id = any(v_cases)');
    expect(sql).toContain('user_id = v_user_id for update');
    expect(sql).toContain('v_total = cardinality(v_cases)');
    expect(sql).toContain('completed_curriculum = v_cases');
    expect(sql).not.toContain('create policy');
    const case3Sql = readFileSync('supabase/migrations/20260924173730_academy_sales_case_3.sql', 'utf8');
    expect(case3Sql).toContain("'sales.case_1_rc1000', 'sales.case_2_video_3330', 'sales.case_3_rc1000_delivery'");
    expect(case3Sql).toContain('security invoker');
    const optionalSql = readFileSync('supabase/migrations/20260924190521_academy_optional_sales_case.sql', 'utf8');
    expect(optionalSql).toContain("array_remove(v_cases, 'sales.case_3_rc1000_delivery')");
    expect(optionalSql).toContain('p_case_id = any(v_cases)');
    expect(optionalSql).toContain('v_total = cardinality(v_mandatory_cases)');
    expect(optionalSql).toContain('completed_curriculum = v_mandatory_cases');
    expect(optionalSql).not.toContain('create policy');
  });
});
