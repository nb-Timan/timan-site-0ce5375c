import { describe, it, expect } from 'vitest';
import {
  effectiveLeadStatus,
  effectiveLeadProbability,
  nextActivityToLeadStatus,
  nextActivityToProbability,
  isLeadClosed,
  isOpenLead,
  normalizeLegacyPipelineStageToNextActivity,
  deriveLegacyPipelineStage,
  NEXT_ACTIVITY_WON,
  NEXT_ACTIVITY_LOST,
} from '@/lib/leadStatus';
import { classifyLeadFollowupUrgency } from '@/lib/leadFollowupUrgency';
import type { CrmLead } from '@/lib/crmLeadsService';

function lead(partial: Partial<CrmLead>): CrmLead {
  return {
    id: 'x', title: 't',
    owner_user_id: null, owner_name: null,
    linked_dealer_id: null,
    first_contact_date: null, expected_close_date: null, next_followup_date: null,
    machine_types: [],
    next_activity: null,
    demo_has_run: null, contact_type: null, customer_type: null,
    contact_information: null, trade_fair: null, country: null, notes: null,
    estimated_value: null, probability: null,
    pipeline_stage: 'Lead',
    lost_competitor: null, lost_reason: null, lost_comment: null,
    attachments: [], status: null,
    created_at: '', updated_at: '',
    ...partial,
  } as CrmLead;
}

describe('next_activity → status mapping', () => {
  it('maps known next_activity values', () => {
    expect(nextActivityToLeadStatus('Customer requests a demonstration')).toBe('Demo planlagt');
    expect(nextActivityToLeadStatus('Offer sent to the customer')).toBe('Tilbud sendt');
    expect(nextActivityToLeadStatus('Follow-up on leads')).toBe('Follow-up');
    expect(nextActivityToLeadStatus(NEXT_ACTIVITY_WON)).toBe('Vundet');
    expect(nextActivityToLeadStatus(NEXT_ACTIVITY_LOST)).toBe('Tabt');
  });
  it('defaults unknown / null to Lead', () => {
    expect(nextActivityToLeadStatus(null)).toBe('Lead');
    expect(nextActivityToLeadStatus('Whatever')).toBe('Lead');
  });
});

describe('next_activity → probability mapping', () => {
  it('returns expected probabilities', () => {
    expect(nextActivityToProbability('Offer sent to the customer')).toBe(70);
    expect(nextActivityToProbability('Customer requests a demonstration')).toBe(50);
    expect(nextActivityToProbability(NEXT_ACTIVITY_WON)).toBe(100);
    expect(nextActivityToProbability(NEXT_ACTIVITY_LOST)).toBe(0);
    expect(nextActivityToProbability(null)).toBe(10);
  });
});

describe('legacy pipeline_stage fallback', () => {
  it('uses pipeline_stage when next_activity is empty', () => {
    expect(effectiveLeadStatus(lead({ next_activity: null, pipeline_stage: 'Offer sent' }))).toBe('Tilbud sendt');
    expect(effectiveLeadStatus(lead({ next_activity: null, pipeline_stage: 'Won' }))).toBe('Vundet');
    expect(effectiveLeadStatus(lead({ next_activity: null, pipeline_stage: 'Lost' }))).toBe('Tabt');
  });
  it('next_activity takes precedence over pipeline_stage', () => {
    expect(effectiveLeadStatus(lead({ next_activity: NEXT_ACTIVITY_WON, pipeline_stage: 'Lead' }))).toBe('Vundet');
  });
  it('normalizeLegacyPipelineStageToNextActivity covers all known stages', () => {
    expect(normalizeLegacyPipelineStageToNextActivity('Won')).toBe(NEXT_ACTIVITY_WON);
    expect(normalizeLegacyPipelineStageToNextActivity('Lost')).toBe(NEXT_ACTIVITY_LOST);
    expect(normalizeLegacyPipelineStageToNextActivity('Offer sent')).toBe('Offer sent to the customer');
    expect(normalizeLegacyPipelineStageToNextActivity(null)).toBe(null);
  });
});

describe('Won/Lost close flow values', () => {
  it('Won → status Vundet, probability 100, closed, legacy stage Won', () => {
    const na = NEXT_ACTIVITY_WON;
    expect(nextActivityToLeadStatus(na)).toBe('Vundet');
    expect(nextActivityToProbability(na)).toBe(100);
    expect(isLeadClosed(na)).toBe(true);
    expect(deriveLegacyPipelineStage(na)).toBe('Won');
  });
  it('Lost → status Tabt, probability 0, closed, legacy stage Lost', () => {
    const na = NEXT_ACTIVITY_LOST;
    expect(nextActivityToLeadStatus(na)).toBe('Tabt');
    expect(nextActivityToProbability(na)).toBe(0);
    expect(isLeadClosed(na)).toBe(true);
    expect(deriveLegacyPipelineStage(na)).toBe('Lost');
  });
});

describe('lead follow-up urgency', () => {
  const now = new Date('2026-08-26T19:00:00+02:00');

  it('treats today as soon, not overdue', () => {
    expect(classifyLeadFollowupUrgency('2026-08-26', now)).toBe('soon');
  });

  it('keeps every future follow-up in the visible green bucket after 20 days', () => {
    expect(classifyLeadFollowupUrgency('2026-09-15', now)).toBe('soon');
    expect(classifyLeadFollowupUrgency('2026-09-16', now)).toBe('later');
    expect(classifyLeadFollowupUrgency('2026-12-01', now)).toBe('later');
  });
});

describe('active lead exclusion after closed', () => {
  it('open while no closing activity', () => {
    expect(isOpenLead(lead({ next_activity: 'Offer sent to the customer' }))).toBe(true);
  });
  it('not open once closed Won/Lost', () => {
    expect(isOpenLead(lead({ next_activity: NEXT_ACTIVITY_WON }))).toBe(false);
    expect(isOpenLead(lead({ next_activity: NEXT_ACTIVITY_LOST }))).toBe(false);
  });
});

describe('effectiveLeadProbability', () => {
  it('derives from next_activity when set', () => {
    expect(effectiveLeadProbability(lead({ next_activity: 'Offer sent to the customer', probability: 5 }))).toBe(70);
  });
  it('falls back to stored probability when nothing to derive', () => {
    expect(effectiveLeadProbability(lead({ next_activity: null, pipeline_stage: null as any, probability: 42 }))).toBe(42);
  });
});
