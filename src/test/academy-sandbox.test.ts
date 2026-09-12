import { beforeEach, describe, expect, it } from 'vitest';
import { ACADEMY_CASE_1, ACADEMY_CASE_2_TARGET_VIDEO_ID, academySandbox } from '@/lib/academySandbox';

const completeInput = {
  machineConfigs: [{ type: 'RC-1000S', acc: ['410910', '730600', '412603', '412594', '412614'], qty: 2 }],
  deliveryDiscount: true,
  quantityDiscount: true,
};

describe('Academy Case 1 sandbox', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/configurator?academy_mode=true');
  });

  it('does not complete an incomplete RC-1000 configuration', () => {
    academySandbox.startCase1();
    academySandbox.evaluate({
      machineConfigs: [{ type: 'RC-1000S', acc: ['410910'], qty: 1 }],
      deliveryDiscount: false,
      quantityDiscount: false,
    });
    academySandbox.generateQuote();
    const state = academySandbox.saveLead();

    expect(state.leadId).toMatch(/^academy-lead-/);
    expect(state.completed).toBe(false);
    expect(state.weedBrush).toBe(false);
    expect(state.requiredComponents).toBe(false);
  });

  it('completes only after every Case 1 criterion and persists the local lead', () => {
    academySandbox.startCase1();
    academySandbox.evaluate(completeInput);
    academySandbox.generateQuote();
    const state = academySandbox.saveLead();

    expect(state.completed).toBe(true);
    expect(state).toMatchObject({
      machine: true,
      flail: true,
      weedBrush: true,
      requiredComponents: true,
      workLight: true,
      wireHarness: true,
      deliveryDiscount: true,
      quantityDiscount: true,
      quoteGenerated: true,
    });
    expect(academySandbox.getCase1()).toEqual(state);
    expect(() => academySandbox.assertNoProductionWrite()).toThrow('Blocked: Academy mode');
  });

  it('does not complete when the work light is missing', () => {
    academySandbox.startCase1();
    academySandbox.evaluate({ ...completeInput, machineConfigs: [{ ...completeInput.machineConfigs[0], acc: ['410910', '730600', '412603', '412614'] }] });
    academySandbox.generateQuote();
    const state = academySandbox.saveLead();

    expect(state.workLight).toBe(false);
    expect(state.wireHarness).toBe(true);
    expect(state.completed).toBe(false);
  });

  it('does not complete when the wiring harness is missing', () => {
    academySandbox.startCase1();
    academySandbox.evaluate({ ...completeInput, machineConfigs: [{ ...completeInput.machineConfigs[0], acc: ['410910', '730600', '412603', '412594'] }] });
    academySandbox.generateQuote();
    const state = academySandbox.saveLead();

    expect(state.workLight).toBe(true);
    expect(state.wireHarness).toBe(false);
    expect(state.completed).toBe(false);
  });

  it('requires an Academy lead after every other requirement is met', () => {
    academySandbox.startCase1();
    academySandbox.evaluate(completeInput);
    academySandbox.generateQuote();

    expect(academySandbox.getCase1().completed).toBe(false);
    const saved = academySandbox.saveLead();
    expect(saved.completed).toBe(true);
    expect(academySandbox.getCase1()).toEqual(saved);
  });

  it('keeps a completed case after a fresh configurator evaluation', () => {
    academySandbox.startCase1();
    academySandbox.evaluate(completeInput);
    academySandbox.generateQuote();
    academySandbox.saveLead();

    const refreshed = academySandbox.evaluate({
      machineConfigs: [],
      deliveryDiscount: false,
      quantityDiscount: false,
    });

    expect(refreshed.completed).toBe(true);
    expect(academySandbox.getCompletedCaseIds()).toEqual([ACADEMY_CASE_1]);
  });

  it('completes Case 2 only after the Timan 3330 maintenance filter and target video are opened', () => {
    window.history.replaceState({}, '', '/portal/videos?academy_mode=true&academy_case=2');
    academySandbox.startCase2();
    academySandbox.trackCase2Filters({ machineFilter: 'Timan 3330', contentType: 'maintenance', targetVisible: true });

    const wrongVideo = academySandbox.openCase2Video({
      youtubeVideoId: 'WPgII8T9sYk',
      machineFilter: 'Timan 3330',
      contentType: 'maintenance',
      targetVisible: true,
    });
    expect(wrongVideo.completed).toBe(false);

    const complete = academySandbox.openCase2Video({
      youtubeVideoId: ACADEMY_CASE_2_TARGET_VIDEO_ID,
      machineFilter: 'Timan 3330',
      contentType: 'maintenance',
      targetVisible: true,
    });
    expect(complete).toMatchObject({
      machineFiltered: true,
      maintenanceFiltered: true,
      targetFound: true,
      targetOpened: true,
      completed: true,
    });
    expect(academySandbox.getCase2()).toEqual(complete);
  });

  it('does not complete Case 2 when the target video is opened without the required filters', () => {
    window.history.replaceState({}, '', '/portal/videos?academy_mode=true&academy_case=2');
    academySandbox.startCase2();
    const state = academySandbox.openCase2Video({
      youtubeVideoId: ACADEMY_CASE_2_TARGET_VIDEO_ID,
      machineFilter: 'all',
      contentType: 'all',
      targetVisible: true,
    });
    expect(state.completed).toBe(false);
  });
});
