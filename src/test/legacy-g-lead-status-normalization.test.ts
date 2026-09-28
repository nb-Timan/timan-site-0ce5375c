import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isLostLead,
  isOpenLead,
  isWonLead,
  NEXT_ACTIVITY_LOST,
  NEXT_ACTIVITY_NOT_RELEVANT,
  NEXT_ACTIVITY_WON,
} from '@/lib/leadStatus';
import {
  legacyGLeadClosureOutcome,
  normalizeLegacyGLeadClosures,
  type LegacyGLeadClosureSource,
} from '@/lib/legacyGLeadStatusNormalization';

const migration = readFileSync(
  'supabase/migrations/20260928093727_normalize_legacy_g_lead_closure_statuses.sql',
  'utf8',
);

type Fixture = LegacyGLeadClosureSource & {
  owner_user_id: string;
  linked_dealer_id: string;
  notes: string;
  lost_competitor: string | null;
  lost_reason: string | null;
  lost_comment: string | null;
};

function lead(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'g-5000',
    lead_no: 5000,
    next_activity: 'Follow-up on leads',
    pipeline_stage: 'Qualified',
    probability: 25,
    status: 'open',
    owner_user_id: 'owner-1',
    linked_dealer_id: 'dealer-1',
    notes: 'Historisk note\nKilde-ID: 3200',
    lost_competitor: null,
    lost_reason: null,
    lost_comment: null,
    ...overrides,
  };
}

function normalize(rows: Fixture[]) {
  return normalizeLegacyGLeadClosures(rows);
}

describe('legacy G-lead closure normalization', () => {
  it('maps G + Closed without order to canonical LOST', () => {
    const result = normalize([lead({ next_activity: 'Closed without order' })]);
    expect(result.changedIds).toEqual(['g-5000']);
    expect(result.rows[0]).toMatchObject({ next_activity: NEXT_ACTIVITY_LOST, pipeline_stage: 'Lost', probability: 0, status: 'closed' });
  });

  it('maps G + Closed with order to canonical WON', () => {
    const result = normalize([lead({ next_activity: 'Closed with order' })]);
    expect(result.rows[0]).toMatchObject({ next_activity: NEXT_ACTIVITY_WON, pipeline_stage: 'Won', probability: 100, status: 'closed' });
  });

  it('accepts only the verified Danish aliases', () => {
    expect(legacyGLeadClosureOutcome(lead({ next_activity: 'Lukket uden ordre' }))).toBe('LOST');
    expect(legacyGLeadClosureOutcome(lead({ next_activity: 'Lukket med ordre' }))).toBe('WON');
    expect(legacyGLeadClosureOutcome(lead({ next_activity: 'Closed without order soon' }))).toBeNull();
  });

  it('removes normalized LOST rows from the open cohort', () => {
    const [row] = normalize([lead({ next_activity: 'Closed without order' })]).rows;
    expect(isOpenLead(row)).toBe(false);
  });

  it('removes normalized WON rows from the open cohort', () => {
    const [row] = normalize([lead({ next_activity: 'Closed with order' })]).rows;
    expect(isOpenLead(row)).toBe(false);
  });

  it('includes normalized LOST rows in the lost cohort', () => {
    const [row] = normalize([lead({ next_activity: 'Closed without order' })]).rows;
    expect(isLostLead(row)).toBe(true);
  });

  it('includes normalized WON rows in the won cohort', () => {
    const [row] = normalize([lead({ next_activity: 'Closed with order' })]).rows;
    expect(isWonLead(row)).toBe(true);
  });

  it('keeps counters derived from the same row cohorts', () => {
    const rows = normalize([
      lead({ id: 'lost', next_activity: 'Closed without order' }),
      lead({ id: 'won', lead_no: 5001, next_activity: 'Closed with order' }),
      lead({ id: 'open', lead_no: 5002 }),
    ]).rows;
    expect({
      open: rows.filter(isOpenLead).length,
      won: rows.filter(isWonLead).length,
      lost: rows.filter(isLostLead).length,
    }).toEqual({ open: 1, won: 1, lost: 1 });
  });

  it('preserves G-number and does not create a replacement lead', () => {
    const source = lead({ next_activity: 'Closed with order' });
    const result = normalize([source]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ id: source.id, lead_no: source.lead_no });
  });

  it('preserves owner, dealer, notes and historical source evidence', () => {
    const source = lead({ next_activity: 'Closed without order' });
    const [row] = normalize([source]).rows;
    expect(row).toMatchObject({
      owner_user_id: source.owner_user_id,
      linked_dealer_id: source.linked_dealer_id,
      notes: source.notes,
    });
  });

  it('does not fabricate lost-deal fields', () => {
    const [row] = normalize([lead({ next_activity: 'Closed without order' })]).rows;
    expect(row).toMatchObject({ lost_competitor: null, lost_reason: null, lost_comment: null });
  });

  it('normalizes the closure marker instead of leaving an active legacy alias', () => {
    const [row] = normalize([lead({ next_activity: 'Lukket uden ordre' })]).rows;
    expect(row.next_activity).toBe(NEXT_ACTIVITY_LOST);
    expect(isOpenLead(row)).toBe(false);
  });

  it('leaves an already-correct LOST row unchanged', () => {
    const source = lead({ next_activity: NEXT_ACTIVITY_LOST, pipeline_stage: 'Lost', probability: 0, status: 'closed' });
    const result = normalize([source]);
    expect(result.changedIds).toEqual([]);
    expect(result.rows[0]).toBe(source);
  });

  it('leaves an already-correct WON row unchanged', () => {
    const source = lead({ next_activity: NEXT_ACTIVITY_WON, pipeline_stage: 'Won', probability: 100, status: 'closed' });
    const result = normalize([source]);
    expect(result.changedIds).toEqual([]);
    expect(result.rows[0]).toBe(source);
  });

  it('is idempotent on a second run', () => {
    const first = normalize([
      lead({ next_activity: 'Closed without order' }),
      lead({ id: 'g-5001', lead_no: 5001, next_activity: 'Closed with order' }),
    ]);
    const second = normalize(first.rows);
    expect(first.changedIds).toHaveLength(2);
    expect(second.changedIds).toHaveLength(0);
  });

  it('does not touch L-leads even when an exact legacy value matches', () => {
    const source = lead({ id: 'l-4999', lead_no: 4999, next_activity: 'Closed without order' });
    const result = normalize([source]);
    expect(result.changedIds).toEqual([]);
    expect(result.rows[0]).toBe(source);
  });

  it('does not change Not relevant', () => {
    const source = lead({ next_activity: NEXT_ACTIVITY_NOT_RELEVANT });
    const result = normalize([source]);
    expect(result.changedIds).toEqual([]);
    expect(result.rows[0]).toBe(source);
  });

  it('skips conflicting records instead of guessing', () => {
    const source = lead({ next_activity: 'Closed without order', pipeline_stage: 'Won' });
    const result = normalize([source]);
    expect(result.ambiguousIds).toEqual([source.id]);
    expect(result.changedIds).toEqual([]);
  });

  it('keeps View-as, RLS and ownership outside the migration scope', () => {
    expect(migration).toContain('lead.lead_no >= 5000');
    expect(migration).not.toMatch(/disable row level security/i);
    expect(migration).not.toMatch(/owner_user_id\s*=/i);
    expect(migration).not.toMatch(/linked_dealer_id\s*=/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.crm_leads/i);
  });

  it('preserves historical dates and relies on the canonical audit trigger', () => {
    expect(migration).not.toMatch(/updated_at\s*=/i);
    expect(migration).not.toMatch(/created_at\s*=/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.crm_activities/i);
    expect(migration).toContain('Existing audit triggers record the');
  });
});
