import { describe, expect, it } from 'vitest';
import { crmDemoProgress, EMPTY_DEMO_RESULT } from '@/lib/crmDemoFlow';
import { demoFlowText } from '@/lib/crmDemoFlowI18n';
import { PORTAL_LANGUAGES } from '@/lib/portalLanguages';

describe('demo planning is independent of results', () => {
  it('does not invent survey data, value or probability at planning', () => {
    expect(EMPTY_DEMO_RESULT).toEqual({ interest_level:null, wants_offer:null, result_status:null,
      probability:null, estimated_value:null, competitors_present:null, competitor_name:null,
      notes_after_demo:null, followup_date:null, update_followup:false });
  });
  it('distinguishes missing, scheduled, awaiting, completed and cancelled', () => {
    const today = '2026-09-23';
    expect(crmDemoProgress(null, today)).toBe('missing');
    expect(crmDemoProgress({demo_date:null,result_status:null},today)).toBe('requested');
    expect(crmDemoProgress({demo_date:'2026-10-15',result_status:null},today)).toBe('scheduled');
    expect(crmDemoProgress({demo_date:'2026-09-22',result_status:'Warm lead'},today)).toBe('awaiting');
    expect(crmDemoProgress({demo_date:'2026-09-22',result_status:'Warm lead',completed_at:today},today)).toBe('completed');
    expect(crmDemoProgress({demo_date:'2026-09-22',result_status:'Cancelled'},today)).toBe('cancelled');
  });
  it('localizes the new flow in all nine portal languages', () => {
    for (const { code: language } of PORTAL_LANGUAGES) {
      for (const key of ['plan','empty','date','awaiting','completed','recordResult','interest','wantsOffer','followup','competitors','notesAfter','result'] as const) {
        expect(demoFlowText(key, language)).not.toBe(key);
        expect(demoFlowText(key, language)).toBeTruthy();
      }
    }
  });
});
