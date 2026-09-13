import { supabase } from '@/lib/supabase';

export type AcademyCadence = 'manual' | 'annual' | 'biennial' | 'custom';
export type AcademyCycleStatus = 'active' | 'completed';

export type AcademyCycle = {
  id: string;
  user_id: string;
  cycle_number: number;
  status: AcademyCycleStatus;
  cadence: AcademyCadence;
  activated_at: string;
  completed_at: string | null;
  next_activation_at: string | null;
  reset_version: number;
};

export type AcademyAward = 'bronze' | 'silver' | 'gold';
export type AcademyAwardCounts = Record<AcademyAward, number>;
export type AcademyCycleSnapshot = { cycle: AcademyCycle | null; completionIds: string[]; completedCycleCount: number; awardCounts: AcademyAwardCounts; awards: AcademyAward[] };

function normalizeSnapshot(value: unknown): AcademyCycleSnapshot {
  const row = (value && typeof value === 'object' ? value : {}) as { cycle?: AcademyCycle | null; completion_ids?: unknown; award_counts?: unknown; awards?: unknown };
  const sourceCounts = row.award_counts && typeof row.award_counts === 'object' ? row.award_counts as Partial<AcademyAwardCounts> : {};
  return {
    cycle: row.cycle ?? null,
    completionIds: Array.isArray(row.completion_ids) ? row.completion_ids.filter((id): id is string => typeof id === 'string') : [],
    completedCycleCount: typeof row.completed_cycle_count === 'number' ? row.completed_cycle_count : 0,
    awardCounts: {
      bronze: typeof sourceCounts.bronze === 'number' ? sourceCounts.bronze : 0,
      silver: typeof sourceCounts.silver === 'number' ? sourceCounts.silver : 0,
      gold: typeof sourceCounts.gold === 'number' ? sourceCounts.gold : 0,
    },
    awards: Array.isArray(row.awards) ? row.awards.filter((award): award is AcademyAward => award === 'bronze' || award === 'silver' || award === 'gold') : [],
  };
}

function normalizeCycle(value: unknown): AcademyCycle {
  if (!value || typeof value !== 'object') throw new Error('Academy-cycle svarede uden data.');
  return value as AcademyCycle;
}

export async function getMyAcademyCycle(): Promise<AcademyCycleSnapshot> {
  const { data, error } = await supabase.rpc('get_my_academy_cycle');
  if (error) throw error;
  return normalizeSnapshot(data);
}

export async function recordAcademyCycleCompletion(cycleId: string, caseId: string) {
  const { data, error } = await supabase.rpc('record_academy_cycle_completion', {
    p_cycle_id: cycleId,
    p_case_id: caseId,
  });
  if (error) throw error;
  return data;
}

export async function startAcademyCycle(userId: string, cadence: AcademyCadence = 'manual', nextActivationAt: string | null = null) {
  const { data, error } = await supabase.rpc('admin_start_academy_cycle', {
    p_user_id: userId,
    p_cadence: cadence,
    p_next_activation_at: nextActivationAt,
  });
  if (error) throw error;
  return normalizeCycle(data);
}

export async function resetAcademyCycle(userId: string) {
  const { data, error } = await supabase.rpc('admin_reset_academy_cycle', { p_user_id: userId });
  if (error) throw error;
  return normalizeCycle(data);
}

export async function setAcademyCycleCadence(userId: string, cadence: AcademyCadence, nextActivationAt: string | null = null) {
  const { data, error } = await supabase.rpc('admin_set_academy_cycle_cadence', {
    p_user_id: userId,
    p_cadence: cadence,
    p_next_activation_at: nextActivationAt,
  });
  if (error) throw error;
  return normalizeCycle(data);
}

export async function getAcademyCycleHistory(userId: string): Promise<AcademyCycleSnapshot[]> {
  const { data, error } = await supabase.rpc('admin_get_academy_cycle_history', { p_user_id: userId });
  if (error) throw error;
  return Array.isArray(data) ? data.map(normalizeSnapshot) : [];
}
