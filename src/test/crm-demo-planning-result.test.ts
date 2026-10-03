import { describe, expect, it } from 'vitest';
import { crmDemoProgress, EMPTY_DEMO_RESULT, formatDemoDate } from '@/lib/crmDemoFlow';
import { demoFlowText } from '@/lib/crmDemoFlowI18n';
import { PORTAL_LANGUAGES } from '@/lib/portalLanguages';

describe('demo planning is independent of results', () => {
  it('does not invent survey data, value or probability at planning', () => {
    expect(EMPTY_DEMO_RESULT).toEqual({ interest_level: null, competitors_present: null });
    expect(formatDemoDate('2026-09-28')).toBe('28-09-2026');
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
      for (const key of ['newRegistration','plan','empty','date','awaiting','completed','demoRun','recordResult','editResult','resultRegistered','backToLead','interest','competitors','notSpecified'] as const) {
        expect(demoFlowText(key, language)).not.toBe(key);
        expect(demoFlowText(key, language)).toBeTruthy();
      }
    }
  });
});
