import { beforeEach, describe, expect, it } from 'vitest';
import { ACADEMY_CASE_1, ACADEMY_CASE_2_TARGET_VIDEO_ID, ACADEMY_PORTAL_BASICS, academySandbox } from '@/lib/academySandbox';

const completeInput = {
  machineConfigs: [
    { type: 'RC-1000S', acc: ['410910', '730600', '412603', '412594', '412614'], qty: 1 },
    { type: 'RC-751', acc: [], qty: 1 },
  ],
  wiringHarnessInCart: true,
  quantityDiscount: true,
};

function completeCase1() {
  academySandbox.startCase1();
  academySandbox.evaluate(completeInput);
  academySandbox.saveLead();
  academySandbox.generateQuote();
}

describe('Academy Case 1 sandbox', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/configurator?academy_mode=true');
  });

  it('removes the local Academy session when the user leaves training', () => {
    window.history.replaceState({}, '', '/portal');
    academySandbox.enterSession();

    expect(academySandbox.isActive()).toBe(true);
    academySandbox.leaveSession();
    expect(academySandbox.isActive()).toBe(false);
  });

  it('does not complete an incomplete RC-1000 configuration', () => {
    academySandbox.startCase1();
    academySandbox.evaluate({
      machineConfigs: [{ type: 'RC-1000S', acc: ['410910'], qty: 1 }],
      wiringHarnessInCart: false,
      quantityDiscount: false,
    });
    academySandbox.generateQuote();
    const state = academySandbox.saveLead();

    expect(state.leadId).toMatch(/^academy-lead-/);
    expect(state.completed).toBe(false);
    expect(state.weedBrush).toBe(false);
    expect(state.requiredComponents).toBe(false);
  });

  it('requires RC-751 even if a caller reports a quantity discount', () => {
    academySandbox.startCase1();
    const state = academySandbox.evaluate({
      machineConfigs: [{ type: 'RC-1000S', acc: ['410910', '730600', '412603', '412594', '412614'], qty: 2 }],
      wiringHarnessInCart: true,
      quantityDiscount: true,
    });

    expect(state.rc751).toBe(false);
    expect(state.quantityDiscount).toBe(true);
    academySandbox.generateQuote();
    expect(academySandbox.saveLead().completed).toBe(false);
  });

  it('requires the canonical quantity discount after RC-751 is selected', () => {
    academySandbox.startCase1();
    const state = academySandbox.evaluate({ ...completeInput, quantityDiscount: false });

    expect(state.rc751).toBe(true);
    expect(state.quantityDiscount).toBe(false);
    academySandbox.generateQuote();
    expect(academySandbox.saveLead().completed).toBe(false);
  });

  it('completes only after every Case 1 criterion and persists the local lead', () => {
    academySandbox.startCase1();
    academySandbox.evaluate(completeInput);
    academySandbox.saveLead();
    const state = academySandbox.generateQuote();

    expect(state.completed).toBe(true);
    expect(state).toMatchObject({
      machine: true,
      flail: true,
      weedBrush: true,
      requiredComponents: true,
      workLight: true,
      wireHarness: true,
      rc751: true,
      quantityDiscount: true,
      quoteGenerated: true,
    });
    expect(academySandbox.getCase1()).toEqual(state);
    expect(() => academySandbox.assertNoProductionWrite()).toThrow('Blocked: Academy mode');
  });

  it('does not complete when the work light is missing', () => {
    academySandbox.startCase1();
    academySandbox.evaluate({ ...completeInput, machineConfigs: [{ ...completeInput.machineConfigs[0], acc: ['410910', '730600', '412603', '412614'] }, completeInput.machineConfigs[1]] });
    academySandbox.generateQuote();
    const state = academySandbox.saveLead();

    expect(state.workLight).toBe(false);
    expect(state.wireHarness).toBe(true);
    expect(state.completed).toBe(false);
  });

  it('does not complete until the normal Configurator has added the wiring harness to the cart', () => {
    academySandbox.startCase1();
    academySandbox.evaluate({ ...completeInput, wiringHarnessInCart: false });
    academySandbox.generateQuote();
    const state = academySandbox.saveLead();

    expect(state.workLight).toBe(true);
    expect(state.wireHarness).toBe(false);
    expect(state.completed).toBe(false);
  });

  it('requires the Academy lead before generating the training quote and completing the case', () => {
    academySandbox.startCase1();
    academySandbox.evaluate(completeInput);

    const blockedQuote = academySandbox.generateQuote();
    expect(blockedQuote).toMatchObject({ leadId: null, quoteGenerated: false, completed: false });
    const saved = academySandbox.saveLead();
    expect(saved).toMatchObject({ quoteGenerated: false, completed: false });

    const completed = academySandbox.generateQuote();
    expect(completed).toMatchObject({ leadId: saved.leadId, quoteGenerated: true, completed: true });
    expect(academySandbox.getCase1()).toEqual(completed);
  });

  it('keeps a completed case after a fresh configurator evaluation', () => {
    academySandbox.startCase1();
    academySandbox.evaluate(completeInput);
    academySandbox.saveLead();
    academySandbox.generateQuote();

    const refreshed = academySandbox.evaluate({
      machineConfigs: [],
      wiringHarnessInCart: false,
      quantityDiscount: false,
    });

    expect(refreshed.completed).toBe(true);
    expect(refreshed).toMatchObject({
      machine: true,
      flail: true,
      weedBrush: true,
      requiredComponents: true,
      workLight: true,
      wireHarness: true,
      rc751: true,
      quantityDiscount: true,
      quoteGenerated: true,
    });
    expect(academySandbox.getCompletedCaseIds()).toEqual([ACADEMY_CASE_1]);
  });

  it('repairs completed local progress written by the old refresh behavior', () => {
    localStorage.setItem('timan.academy.sandbox.v1', JSON.stringify({
      started: true,
      completed: true,
      quoteGenerated: true,
      leadId: 'academy-lead-existing',
      machine: false,
      flail: false,
      weedBrush: false,
      requiredComponents: false,
      workLight: false,
      wireHarness: false,
      deliveryDiscount: false,
      quantityDiscount: false,
    }));

    expect(academySandbox.getCase1()).toMatchObject({
      completed: true,
      machine: true,
      flail: true,
      weedBrush: true,
      requiredComponents: true,
      workLight: true,
      wireHarness: true,
      rc751: true,
      quantityDiscount: true,
    });
  });

  it('completes Case 2 only after the Timan 3330 maintenance filter and target video are opened', () => {
    window.history.replaceState({}, '', '/portal/videos?academy_mode=true&academy_case=2');
    completeCase1();
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
    completeCase1();
    academySandbox.startCase2();
    const state = academySandbox.openCase2Video({
      youtubeVideoId: ACADEMY_CASE_2_TARGET_VIDEO_ID,
      machineFilter: 'all',
      contentType: 'all',
      targetVisible: true,
    });
    expect(state.completed).toBe(false);
  });

  it('tracks the WB-170 and work-light dependency from the actual cart state', () => {
    academySandbox.startCase1();

    const weedOnly = academySandbox.evaluate({
      ...completeInput,
      machineConfigs: [{ ...completeInput.machineConfigs[0], acc: ['410910', '730600', '412603'] }, completeInput.machineConfigs[1]],
      wiringHarnessInCart: false,
    });
    expect(weedOnly).toMatchObject({ weedBrush: true, workLight: false, wireHarness: false, completed: false });

    const lightOnly = academySandbox.evaluate({
      ...completeInput,
      machineConfigs: [{ ...completeInput.machineConfigs[0], acc: ['410910', '412603', '412594'] }, completeInput.machineConfigs[1]],
      wiringHarnessInCart: false,
    });
    expect(lightOnly).toMatchObject({ weedBrush: false, workLight: true, wireHarness: false, completed: false });

    const dependencyApplied = academySandbox.evaluate(completeInput);
    expect(dependencyApplied).toMatchObject({ weedBrush: true, workLight: true, wireHarness: true, completed: false });

    const prerequisiteRemoved = academySandbox.evaluate({
      ...completeInput,
      machineConfigs: [{ ...completeInput.machineConfigs[0], acc: ['410910', '412603', '412594'] }, completeInput.machineConfigs[1]],
      wiringHarnessInCart: false,
    });
    expect(prerequisiteRemoved).toMatchObject({ weedBrush: false, workLight: true, wireHarness: false, completed: false });
  });

  it('keeps Case 2 locked until Case 1 is complete and locks it again after a reset', () => {
    expect(() => academySandbox.startCase2()).toThrow('Sales Case 1 skal gennemføres før Case 2.');
    expect(academySandbox.getActiveCase()).toBeNull();

    completeCase1();
    academySandbox.startCase2();
    expect(academySandbox.getActiveCase()).toBe('sales.case_2_video_3330');

    localStorage.setItem('timan.academy.sandbox.v1', JSON.stringify({}));
    expect(academySandbox.isCase2Unlocked()).toBe(false);
    expect(academySandbox.getActiveCase()).toBeNull();
    expect(academySandbox.getContinueRoute()).toBe('/academy');
  });

  it('limits Portal Basics to its three real portal surfaces', () => {
    academySandbox.startPortalBasics('da');

    expect(academySandbox.getAllowedPortalHomeCardIds()).toEqual(['academy', 'dealer_data', 'messe']);
  });

  it('completes Portal Basics only after all five local portal tasks are completed', () => {
    window.history.replaceState({}, '', '/portal?academy_mode=true');
    academySandbox.startPortalBasics('da');

    academySandbox.trackPortalBasicsLanguage('fr');
    academySandbox.trackPortalBasicsLanguage('da');
    academySandbox.trackPortalBasicsPartnerData();
    academySandbox.trackPortalBasicsLogoHome('/portal/dealer-data');
    academySandbox.trackPortalBasicsFullscreen();
    academySandbox.trackPortalBasicsMapArea('de_plz2');
    academySandbox.trackPortalBasicsNews('Forkert nyhed');

    expect(academySandbox.getPortalBasics()).toMatchObject({
      frenchSelected: true,
      languageRestored: true,
      partnerDataOpened: true,
      returnedHomeFromPartnerData: true,
      fullscreenUsed: true,
      mapAreaChanged: true,
      targetNewsOpened: false,
      completed: false,
    });

    academySandbox.trackPortalBasicsNews('Skivehøster til Timan RC-1000s');
    expect(academySandbox.getPortalBasics().completed).toBe(true);
    expect(academySandbox.getCompletedCaseIds()).toContain(ACADEMY_PORTAL_BASICS);
  });

  it('keeps Portal Basics local across a refresh-equivalent read', () => {
    window.history.replaceState({}, '', '/portal?academy_mode=true');
    academySandbox.startPortalBasics('da');
    academySandbox.trackPortalBasicsLanguage('fr');
    academySandbox.trackPortalBasicsLanguage('da');
    academySandbox.trackPortalBasicsPartnerData();

    expect(academySandbox.getPortalBasics()).toMatchObject({
      started: true,
      frenchSelected: true,
      languageRestored: true,
      partnerDataOpened: true,
      completed: false,
    });
  });

  it('requires the real Partnerdata logo path after Partnerdata has opened', () => {
    window.history.replaceState({}, '', '/portal?academy_mode=true');
    academySandbox.startPortalBasics('da');

    academySandbox.trackPortalBasicsLogoHome('/portal/dealer-data');
    expect(academySandbox.getPortalBasics().returnedHomeFromPartnerData).toBe(false);

    academySandbox.trackPortalBasicsPartnerData();
    academySandbox.trackPortalBasicsLogoHome('/portal');
    expect(academySandbox.getPortalBasics().returnedHomeFromPartnerData).toBe(false);

    academySandbox.trackPortalBasicsLogoHome('/portal/dealer-data');
    expect(academySandbox.getPortalBasics()).toMatchObject({
      partnerDataOpened: true,
      returnedHomeFromPartnerData: true,
      completed: false,
    });
  });

  it('does not track Partnerdata actions outside an Academy session', () => {
    window.history.replaceState({}, '', '/portal/dealer-data');
    academySandbox.trackPortalBasicsPartnerData();
    academySandbox.trackPortalBasicsLogoHome('/portal/dealer-data');

    expect(academySandbox.getPortalBasics()).toMatchObject({
      started: false,
      partnerDataOpened: false,
      returnedHomeFromPartnerData: false,
    });
  });
});
