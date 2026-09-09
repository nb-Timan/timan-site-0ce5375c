import { beforeEach, describe, expect, it } from 'vitest';
import { academyCrmSandbox, ACADEMY_CRM_PARTNER } from '@/lib/academyCrmSandbox';
import { getCrmLeadRepository } from '@/lib/crmLeadRepository';

describe('Academy CRM lead sandbox', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/academy/crm/leads?academy_mode=true&academy_part=1');
  });

  it('keeps Lead Part 1 incomplete until both local lead saves succeed', () => {
    academyCrmSandbox.start(1);
    academyCrmSandbox.saveLead('academy-overdue-lead', { nextFollowup: '2099-01-01' });
    expect(academyCrmSandbox.getProgress().part1Completed).toBe(false);

    academyCrmSandbox.saveLead('academy-configurator-lead', { incomplete: false, activity: 'Academy opfølgning' });
    expect(academyCrmSandbox.getProgress().part1Completed).toBe(true);
  });

  it('requires activity, local sharing, and local demo conversion for Lead Part 2', () => {
    academyCrmSandbox.start(1);
    academyCrmSandbox.saveLead('academy-overdue-lead', { nextFollowup: '2099-01-01' });
    academyCrmSandbox.saveLead('academy-configurator-lead', { incomplete: false, activity: 'Academy opfølgning' });
    academyCrmSandbox.start(2);

    academyCrmSandbox.saveLead('academy-demo-lead', { activity: 'Aftal demonstration' });
    academyCrmSandbox.openShareDialog();
    academyCrmSandbox.shareLead('academy-demo-lead', ACADEMY_CRM_PARTNER.id);
    expect(academyCrmSandbox.getProgress().part2Completed).toBe(false);

    academyCrmSandbox.convertToDemo('academy-demo-lead');
    expect(academyCrmSandbox.getProgress()).toMatchObject({
      part1Completed: true,
      part2Completed: true,
      dialogOpened: true,
      shared: true,
      demoConverted: true,
    });
  });

  it('persists only locally and blocks writes outside Academy mode', () => {
    academyCrmSandbox.start(1);
    academyCrmSandbox.saveLead('academy-overdue-lead', { nextFollowup: '2099-01-01' });
    expect(academyCrmSandbox.getState().leads.find((lead) => lead.id === 'academy-overdue-lead')?.saved).toBe(true);

    window.history.replaceState({}, '', '/portal/crm/leads');
    expect(() => academyCrmSandbox.saveLead('academy-overdue-lead', { activity: 'Production must not run' })).toThrow('Academy CRM writes must never use production persistence.');
  });

  it('hard-blocks the production CRM services while Academy mode is active', async () => {
    window.history.replaceState({}, '', '/academy/crm/leads?academy_mode=true&academy_part=1');
    const { updateLead, createDemoLead } = await import('@/lib/crmLeadsService');
    const { shareLead } = await import('@/lib/crmLeadSharingService');
    await expect(updateLead('any-id', {})).rejects.toThrow('Blocked: Academy CRM writes');
    await expect(createDemoLead({} as never)).rejects.toThrow('Blocked: Academy CRM writes');
    await expect(shareLead({} as never)).rejects.toThrow('Blocked: Academy CRM sharing');
  });

  it('uses the local repository for shared CRM operations in Academy mode', async () => {
    const repository = getCrmLeadRepository();
    expect(repository.academy).toBe(true);

    const result = await repository.listLeadsPage({ limit: 50, offset: 0 });
    expect(result.rows.map((lead) => lead.id)).toEqual([
      'academy-overdue-lead',
      'academy-configurator-lead',
    ]);

    await repository.updateLead('academy-overdue-lead', {
      next_followup_date: '2099-01-01',
    });
    const saved = await repository.getLead('academy-overdue-lead');
    expect(saved?.next_followup_date).toBe('2099-01-01');
    expect(academyCrmSandbox.getProgress().overdueUpdated).toBe(true);

    const created = await repository.createLead({
      title: 'Lokalt Academy-lead',
      next_followup_date: '2099-01-02',
    } as never);
    expect(created.id).toMatch(/^academy-created-/);
    expect(await repository.getLead(created.id)).toMatchObject({
      title: 'Lokalt Academy-lead',
    });
  });
});
