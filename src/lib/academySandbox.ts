import { ACC_ID_WIRE_HARNESS, ACC_ID_WORK_LIGHT } from '@/data/machines';
import { ACADEMY_CASE_1_ID } from '@/lib/academyCurriculum';

export const ACADEMY_CASE_1 = ACADEMY_CASE_1_ID;
export const ACADEMY_CASE_2 = 'sales.case_2_video_3330';
export const ACADEMY_PORTAL_BASICS = 'portal.basics_5';
export const ACADEMY_CASE_2_TARGET_VIDEO_ID = 'sxYALA86PaI';
export const ACADEMY_CASE_2_MACHINE_KEY = 'Timan 3330';
export const ACADEMY_CASE_2_CONTENT_TYPE = 'maintenance';
const KEY = 'timan.academy.sandbox.v1';
const SESSION_KEY = 'timan.academy.session.v1';
const PORTAL_BASICS_NEWS_TITLE = 'Skivehøster til Timan RC-1000s';

export type AcademyCase1State = {
  started: boolean; completed: boolean; quoteGenerated: boolean; leadId: string | null;
  machine: boolean; flail: boolean; weedBrush: boolean; requiredComponents: boolean;
  workLight: boolean; wireHarness: boolean;
  deliveryDiscount: boolean; quantityDiscount: boolean;
};

export type AcademyCase1Input = {
  machineConfigs: Array<{ type: string; acc?: string[]; qty?: number }>;
  deliveryDiscount: boolean;
  quantityDiscount: boolean;
  quoteGenerated?: boolean;
};

export type AcademyCase2State = {
  started: boolean;
  completed: boolean;
  machineFiltered: boolean;
  maintenanceFiltered: boolean;
  targetFound: boolean;
  targetOpened: boolean;
};

export type AcademyPortalBasicsState = {
  started: boolean;
  completed: boolean;
  startingLanguage: string | null;
  frenchSelected: boolean;
  languageRestored: boolean;
  partnerDataOpened: boolean;
  returnedHomeFromPartnerData: boolean;
  fullscreenUsed: boolean;
  mapAreaChanged: boolean;
  targetNewsOpened: boolean;
};

type AcademySandboxState = AcademyCase1State & {
  case2: AcademyCase2State;
  portalBasics: AcademyPortalBasicsState;
};

const initialCase1 = (): AcademyCase1State => ({ started: false, completed: false, quoteGenerated: false, leadId: null, machine: false, flail: false, weedBrush: false, requiredComponents: false, workLight: false, wireHarness: false, deliveryDiscount: false, quantityDiscount: false });
const initialCase2 = (): AcademyCase2State => ({ started: false, completed: false, machineFiltered: false, maintenanceFiltered: false, targetFound: false, targetOpened: false });
const initialPortalBasics = (): AcademyPortalBasicsState => ({
  started: false,
  completed: false,
  startingLanguage: null,
  frenchSelected: false,
  languageRestored: false,
  partnerDataOpened: false,
  returnedHomeFromPartnerData: false,
  fullscreenUsed: false,
  mapAreaChanged: false,
  targetNewsOpened: false,
});
const initial = (): AcademySandboxState => ({ ...initialCase1(), case2: initialCase2(), portalBasics: initialPortalBasics() });

function isComplete(state: AcademyCase1State) {
  return state.machine && state.flail && state.weedBrush && state.requiredComponents
    && state.workLight && state.wireHarness && state.deliveryDiscount
    && state.quantityDiscount && state.quoteGenerated && Boolean(state.leadId);
}

function isLocalAcademyMode() {
  return import.meta.env.DEV && (
    new URLSearchParams(window.location.search).get('academy_mode') === 'true'
    || sessionStorage.getItem(SESSION_KEY) === 'active'
  );
}

function load(): AcademySandboxState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AcademySandboxState>;
    const state = {
      ...initial(),
      ...saved,
      case2: { ...initialCase2(), ...saved.case2 },
      portalBasics: { ...initialPortalBasics(), ...saved.portalBasics },
    };
    // Completion can only be awarded after every Case 1 requirement has
    // passed. Repair local progress saved by the earlier refresh bug, where
    // a reset Configurator form overwrote checklist detail after completion.
    return state.completed
      ? {
        ...state,
        machine: true,
        flail: true,
        weedBrush: true,
        requiredComponents: true,
        workLight: true,
        wireHarness: true,
        deliveryDiscount: true,
        quantityDiscount: true,
        quoteGenerated: true,
      }
      : state;
  } catch {
    return initial();
  }
}
function save(state: AcademySandboxState) { localStorage.setItem(KEY, JSON.stringify(state)); return state; }
function case1Of({ case2: _case2, portalBasics: _portalBasics, ...case1 }: AcademySandboxState): AcademyCase1State { return case1; }
function isPortalBasicsComplete(state: AcademyPortalBasicsState) {
  return state.frenchSelected
    && state.languageRestored
    && state.partnerDataOpened
    && state.returnedHomeFromPartnerData
    && state.fullscreenUsed
    && state.mapAreaChanged
    && state.targetNewsOpened;
}

export const academySandbox = {
  isActive: isLocalAcademyMode,
  enterSession() {
    if (import.meta.env.DEV) sessionStorage.setItem(SESSION_KEY, 'active');
  },
  leaveSession() {
    if (import.meta.env.DEV) sessionStorage.removeItem(SESSION_KEY);
  },
  getCase1() { return case1Of(load()); },
  getCase2() { return load().case2; },
  getPortalBasics() { return load().portalBasics; },
  getCompletedCaseIds() {
    const state = load();
    return [
      state.completed && ACADEMY_CASE_1,
      state.case2.completed && ACADEMY_CASE_2,
      state.portalBasics.completed && ACADEMY_PORTAL_BASICS,
    ].filter(Boolean) as string[];
  },
  startCase1() { return case1Of(save({ ...load(), started: true })); },
  startCase2() {
    const current = load();
    return save({ ...current, case2: { ...current.case2, started: true } }).case2;
  },
  startPortalBasics(startingLanguage: string) {
    if (!import.meta.env.DEV) throw new Error('Academy sandbox is only available on localhost.');
    this.enterSession();
    const current = load();
    return save({
      ...current,
      portalBasics: {
        ...initialPortalBasics(),
        ...current.portalBasics,
        started: true,
        startingLanguage: current.portalBasics.started ? current.portalBasics.startingLanguage : startingLanguage,
      },
    }).portalBasics;
  },
  trackPortalBasicsLanguage(language: string) {
    if (!isLocalAcademyMode()) return load().portalBasics;
    const current = load();
    if (!current.portalBasics.started) return current.portalBasics;
    const frenchSelected = current.portalBasics.frenchSelected || language === 'fr';
    const languageRestored = current.portalBasics.languageRestored || (
      frenchSelected
      && current.portalBasics.startingLanguage !== null
      && language === current.portalBasics.startingLanguage
    );
    const portalBasics = { ...current.portalBasics, frenchSelected, languageRestored };
    portalBasics.completed = current.portalBasics.completed || isPortalBasicsComplete(portalBasics);
    return save({ ...current, portalBasics }).portalBasics;
  },
  trackPortalBasicsPartnerData() {
    if (!isLocalAcademyMode()) return load().portalBasics;
    const current = load();
    if (!current.portalBasics.started) return current.portalBasics;
    const portalBasics = { ...current.portalBasics, partnerDataOpened: true };
    portalBasics.completed = current.portalBasics.completed || isPortalBasicsComplete(portalBasics);
    return save({ ...current, portalBasics }).portalBasics;
  },
  trackPortalBasicsHomeReturn(fromPath: string) {
    if (!isLocalAcademyMode()) return load().portalBasics;
    const current = load();
    if (!current.portalBasics.started || fromPath !== '/portal/dealer-data') return current.portalBasics;
    const portalBasics = { ...current.portalBasics, returnedHomeFromPartnerData: current.portalBasics.partnerDataOpened };
    portalBasics.completed = current.portalBasics.completed || isPortalBasicsComplete(portalBasics);
    return save({ ...current, portalBasics }).portalBasics;
  },
  trackPortalBasicsFullscreen() {
    if (!isLocalAcademyMode()) return load().portalBasics;
    const current = load();
    if (!current.portalBasics.started) return current.portalBasics;
    const portalBasics = { ...current.portalBasics, fullscreenUsed: true };
    portalBasics.completed = current.portalBasics.completed || isPortalBasicsComplete(portalBasics);
    return save({ ...current, portalBasics }).portalBasics;
  },
  trackPortalBasicsMapArea(area: string) {
    if (!isLocalAcademyMode()) return load().portalBasics;
    const current = load();
    if (!current.portalBasics.started || area === 'none') return current.portalBasics;
    const portalBasics = { ...current.portalBasics, mapAreaChanged: true };
    portalBasics.completed = current.portalBasics.completed || isPortalBasicsComplete(portalBasics);
    return save({ ...current, portalBasics }).portalBasics;
  },
  trackPortalBasicsNews(title: string) {
    if (!isLocalAcademyMode()) return load().portalBasics;
    const current = load();
    if (!current.portalBasics.started || title !== PORTAL_BASICS_NEWS_TITLE) return current.portalBasics;
    const portalBasics = { ...current.portalBasics, targetNewsOpened: true };
    portalBasics.completed = current.portalBasics.completed || isPortalBasicsComplete(portalBasics);
    return save({ ...current, portalBasics }).portalBasics;
  },
  evaluate(input: AcademyCase1Input) {
    if (!isLocalAcademyMode()) throw new Error('Academy sandbox is only available on localhost.');
    const current = load();
    // A completed Academy case is a local training achievement. The regular
    // Configurator intentionally resets its in-memory form after a refresh,
    // so it must not replace the persisted checklist with an empty form.
    if (current.completed) return case1Of(current);
    const rc = input.machineConfigs.find((item) => item.type === 'RC-1000S');
    const accessories = rc?.acc ?? [];
    const next = { ...current, started: true, machine: Boolean(rc), flail: accessories.includes('410910'), weedBrush: accessories.includes('730600'), requiredComponents: accessories.includes('412603'), workLight: accessories.includes(ACC_ID_WORK_LIGHT), wireHarness: accessories.includes(ACC_ID_WIRE_HARNESS), deliveryDiscount: input.deliveryDiscount, quantityDiscount: input.quantityDiscount, quoteGenerated: input.quoteGenerated ?? current.quoteGenerated };
    next.completed = isComplete(next);
    return case1Of(save(next));
  },
  generateQuote() {
    if (!isLocalAcademyMode()) throw new Error('Academy writes must never use production persistence.');
    return case1Of(save({ ...load(), quoteGenerated: true }));
  },
  saveLead() {
    if (!isLocalAcademyMode()) throw new Error('Academy writes must never use production persistence.');
    const current = load();
    const next = { ...current, leadId: current.leadId ?? `academy-lead-${crypto.randomUUID()}` };
    next.completed = isComplete(next);
    return case1Of(save(next));
  },
  trackCase2Filters(input: { machineFilter: string; contentType: string; targetVisible: boolean }) {
    if (!isLocalAcademyMode()) throw new Error('Academy sandbox is only available on localhost.');
    const current = load();
    const machineFiltered = input.machineFilter === ACADEMY_CASE_2_MACHINE_KEY;
    const maintenanceFiltered = input.contentType === ACADEMY_CASE_2_CONTENT_TYPE;
    const correctFilters = machineFiltered && maintenanceFiltered;
    return save({
      ...current,
      case2: {
        ...current.case2,
        machineFiltered: current.case2.machineFiltered || machineFiltered,
        maintenanceFiltered: current.case2.maintenanceFiltered || maintenanceFiltered,
        targetFound: current.case2.targetFound || (current.case2.started && correctFilters && input.targetVisible),
      },
    }).case2;
  },
  openCase2Video(input: { youtubeVideoId: string; machineFilter: string; contentType: string; targetVisible: boolean }) {
    if (!isLocalAcademyMode()) throw new Error('Academy sandbox is only available on localhost.');
    const current = load();
    const correctFilters = input.machineFilter === ACADEMY_CASE_2_MACHINE_KEY
      && input.contentType === ACADEMY_CASE_2_CONTENT_TYPE;
    const correctVideo = input.youtubeVideoId === ACADEMY_CASE_2_TARGET_VIDEO_ID;
    const targetOpened = current.case2.targetOpened || (current.case2.started && correctFilters && input.targetVisible && correctVideo);
    return save({
      ...current,
      case2: {
        ...current.case2,
        machineFiltered: current.case2.machineFiltered || input.machineFilter === ACADEMY_CASE_2_MACHINE_KEY,
        maintenanceFiltered: current.case2.maintenanceFiltered || input.contentType === ACADEMY_CASE_2_CONTENT_TYPE,
        targetFound: current.case2.targetFound || (current.case2.started && correctFilters && input.targetVisible),
        targetOpened,
        completed: current.case2.completed || targetOpened,
      },
    }).case2;
  },
  assertNoProductionWrite() { if (isLocalAcademyMode()) throw new Error('Blocked: Academy mode cannot write to Supabase.'); },
};
