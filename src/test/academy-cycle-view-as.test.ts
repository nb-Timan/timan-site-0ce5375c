import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMyAcademyCycle } from '@/lib/academyCyclesService';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
beforeEach(() => mocks.rpc.mockReset());

describe('Academy View-as cycle reads', () => {
  it('reads the target history without activating or writing the Backend actor cycle', async () => {
    mocks.rpc.mockResolvedValue({ data: [
      { cycle: { id: 'current', status: 'active' }, completion_ids: ['partnerdata.part_1_profile'], awards: [] },
      { cycle: { id: 'previous', status: 'completed' }, completion_ids: [], awards: ['gold'] },
    ], error: null });
    const result = await getMyAcademyCycle('target-user');
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('admin_get_academy_cycle_history', { p_user_id: 'target-user' }, { get: true });
    expect(result.cycle?.id).toBe('current');
    expect(result.completionIds).toEqual(['partnerdata.part_1_profile']);
    expect(result.completedCycleCount).toBe(1);
    expect(result.awardCounts.gold).toBe(1);
  });
  it('does not fall back to Backend progress when the target has no cycle', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect((await getMyAcademyCycle('target-user')).cycle).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('keeps the canonical own-cycle lifecycle for normal sessions', async () => {
    mocks.rpc.mockResolvedValue({ data: { cycle: { id: 'own' }, completed_cycle_count: 2 }, error: null });
    expect((await getMyAcademyCycle()).completedCycleCount).toBe(2);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('get_my_academy_cycle');
  });
});
