import {
  deriveLegacyPipelineStage,
  NEXT_ACTIVITY_LOST,
  NEXT_ACTIVITY_WON,
  nextActivityToProbability,
} from '@/lib/leadStatus';

export const LEGACY_G_LEAD_MIN_NUMBER = 5000;

export type LegacyGLeadClosureOutcome = 'LOST' | 'WON';

export type LegacyGLeadClosureSource = {
  id: string;
  lead_no: number | null;
  next_activity: string | null;
  pipeline_stage: string | null;
  probability: number | null;
  status: string | null;
};

export type LegacyGLeadClosurePatch = Pick<
  LegacyGLeadClosureSource,
  'next_activity' | 'pipeline_stage' | 'probability' | 'status'
>;

const OUTCOME_BY_EXACT_LEGACY_VALUE: Readonly<Record<string, LegacyGLeadClosureOutcome>> = {
  'Closed without order': 'LOST',
  'Lukket uden ordre': 'LOST',
  'Closed with order': 'WON',
  'Lukket med ordre': 'WON',
};

export function legacyGLeadClosureOutcome(
  lead: Pick<LegacyGLeadClosureSource, 'lead_no' | 'next_activity'>,
): LegacyGLeadClosureOutcome | null {
  if (lead.lead_no === null || lead.lead_no < LEGACY_G_LEAD_MIN_NUMBER) return null;
  return OUTCOME_BY_EXACT_LEGACY_VALUE[lead.next_activity?.trim() ?? ''] ?? null;
}

export function legacyGLeadClosureHasConflict(
  lead: Pick<LegacyGLeadClosureSource, 'lead_no' | 'next_activity' | 'pipeline_stage'>,
): boolean {
  const outcome = legacyGLeadClosureOutcome(lead);
  return (outcome === 'LOST' && lead.pipeline_stage === 'Won')
    || (outcome === 'WON' && lead.pipeline_stage === 'Lost');
}

export function legacyGLeadClosurePatch(
  lead: LegacyGLeadClosureSource,
): LegacyGLeadClosurePatch | null {
  const outcome = legacyGLeadClosureOutcome(lead);
  if (!outcome || legacyGLeadClosureHasConflict(lead)) return null;

  const nextActivity = outcome === 'WON' ? NEXT_ACTIVITY_WON : NEXT_ACTIVITY_LOST;
  const patch: LegacyGLeadClosurePatch = {
    next_activity: nextActivity,
    pipeline_stage: deriveLegacyPipelineStage(nextActivity),
    probability: nextActivityToProbability(nextActivity),
    status: 'closed',
  };

  return lead.next_activity === patch.next_activity
    && lead.pipeline_stage === patch.pipeline_stage
    && lead.probability === patch.probability
    && lead.status === patch.status
    ? null
    : patch;
}

export function normalizeLegacyGLeadClosures<T extends LegacyGLeadClosureSource>(rows: readonly T[]): {
  rows: T[];
  changedIds: string[];
  ambiguousIds: string[];
} {
  const changedIds: string[] = [];
  const ambiguousIds: string[] = [];
  const normalized = rows.map((row) => {
    if (legacyGLeadClosureHasConflict(row)) {
      ambiguousIds.push(row.id);
      return row;
    }
    const patch = legacyGLeadClosurePatch(row);
    if (!patch) return row;
    changedIds.push(row.id);
    return { ...row, ...patch };
  });

  return { rows: normalized, changedIds, ambiguousIds };
}
