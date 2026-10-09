import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchBackendUsers, saveBackendUser } from '@/lib/backendUsersService';
import { getLocalAcademyBackendUser } from '@/lib/academyCurriculum';

const db = vi.hoisted(() => ({ row: {} as Record<string, unknown>, update: vi.fn() }));
vi.mock('@/lib/adminUserActions', () => ({ adminUpdateAppUser: db.update }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: () => ({ select: () => ({
    order: async () => ({ data: [db.row], error: null }),
    eq: () => ({ maybeSingle: async () => ({ data: db.row, error: null }) }),
  }) }),
} }));

beforeEach(() => {
  db.row = { id: 'qa-track-user', email: 'qa@example.invalid', portal_role: 'timan_seller', approved: true, is_active: true, allowed_modules: ['academy'], permissions: {} };
  db.update.mockReset().mockImplementation(async (id, patch) => {
    db.row = { ...db.row, ...patch, id };
    return { ok: true, user: db.row };
  });
});

describe('Academy track canonical save and reopen', () => {
  it.each([[true, false], [false, true], [true, true], [false, false]])('persists Sales=%s Service=%s through the existing admin service', async (sales, service) => {
    const original = getLocalAcademyBackendUser();
    const draft = { ...original, id: 'qa-track-user', perms: { ...original.perms, academy_track_sales: sales, academy_track_service: service } };
    const saved = await saveBackendUser(draft.id, draft);
    expect(saved.ok, saved.error).toBe(true);
    const reopened = (await fetchBackendUsers()).users[0];
    expect(reopened.perms.academy_track_sales).toBe(sales);
    expect(reopened.perms.academy_track_service).toBe(service);
    expect(reopened.perms.can_submit_order).toBe(original.perms.can_submit_order);
    expect(db.update).toHaveBeenCalledTimes(1);
  });
  it('preserves inherited defaults as absent overrides on reopen', async () => {
    const reopened = (await fetchBackendUsers()).users[0];
    expect(reopened.perms).not.toHaveProperty('academy_track_sales');
    expect(reopened.perms).not.toHaveProperty('academy_track_service');
  });
});
