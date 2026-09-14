import { ACC_ID_WIRE_HARNESS, ACC_ID_WORK_LIGHT } from '@/data/machines';
import { ACADEMY_CASE_1_ID } from '@/lib/academyCurriculum';
import { academyScopedStorageKey, isAcademyCycleStorageScopeActive } from '@/lib/academyCycleStorage';

export const ACADEMY_CASE_1 = ACADEMY_CASE_1_ID;
export const ACADEMY_CASE_2 = 'sales.case_2_video_3330';
export const ACADEMY_PORTAL_BASICS = 'portal.basics_5';
export const ACADEMY_PARTNER_MAP = 'portal.partner_map';
export const ACADEMY_CASE_2_TARGET_VIDEO_ID = 'sxYALA86PaI';
export const ACADEMY_CASE_2_MACHINE_KEY = 'Timan 3330';
export const ACADEMY_CASE_2_CONTENT_TYPE = 'maintenance';
export const ACADEMY_PROGRESS_CHANGED = 'timan:academy-progress-changed';
export const ACADEMY_CASE_COMPLETED = 'timan:academy-case-completed';
const KEY = 'timan.academy.sandbox.v1';
const SESSION_KEY = 'timan.academy.session.v1';
export type AcademyActiveCase = 'sales.case_1_rc1000' | 'sales.case_2_video_3330' | 'portal.basics_5' | 'portal.partner_map' | 'crm.part_1' | 'crm.part_2' | 'partnerdata.part_1_profile' | 'partnerdata.part_2_relations';
export type AcademyPortalHomeCardId = 'academy' | 'salg_marketing' | 'dealer_data' | 'timan_crm' | 'marketing' | 'teknik_service' | 'calendar' | 'projects' | 'messe' | 'timan_backend';
const CASE_ROUTES: Record<AcademyActiveCase, string> = {
  'sales.case_1_rc1000': '/configurator?academy_mode=true',
  'sales.case_2_video_3330': '/portal/videos?academy_mode=true&academy_case=2',
  'portal.basics_5': '/portal?academy_mode=true',
  'portal.partner_map': '/portal/misc/partner-map?academy_mode=true',
  'crm.part_1': '/academy/crm/leads?academy_mode=true&academy_part=1',
  'crm.part_2': '/academy/crm/leads?academy_mode=true&academy_part=2',
  'partnerdata.part_1_profile': '/portal/dealer-data?academy_mode=true&academy_part=1',
  'partnerdata.part_2_relations': '/portal/dealer-data?academy_mode=true&academy_part=2',
};
const CASE_PORTAL_HOME_CARDS: Record<AcademyActiveCase, readonly AcademyPortalHomeCardId[]> = {
  'sales.case_1_rc1000': ['academy', 'salg_marketing'],
  'sales.case_2_video_3330': ['academy', 'salg_marketing'],
  'portal.basics_5': ['academy', 'dealer_data', 'messe'],
  'portal.partner_map': ['academy', 'salg_marketing'],
  'crm.part_1': ['academy', 'timan_crm'],
  'crm.part_2': ['academy', 'timan_crm'],
  'partnerdata.part_1_profile': ['academy', 'dealer_data'],
  'partnerdata.part_2_relations': ['academy', 'dealer_data'],
};
function readSession(): { active: boolean; caseId?: AcademyActiveCase } {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed.active === 'boolean') {
        return { active: parsed.active, caseId: Object.prototype.hasOwnProperty.call(CASE_ROUTES, parsed.caseId) ? parsed.caseId : undefined };
      }
    }
  } catch { /* Restore the legacy tab session below. */ }
  const active = sessionStorage.getItem(SESSION_KEY) === 'active'
    || new URLSearchParams(window.location.search).get('academy_mode') === 'true';
  const session = { active };
  if (active) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}
const PORTAL_BASICS_NEWS_TITLE = 'Skivehøster til Timan RC-1000s';

export type AcademyCase1State = {
  started: boolean; completed: boolean; quoteGenerated: boolean; leadId: string | null;
  machine: boolean; flail: boolean; weedBrush: boolean; requiredComponents: boolean;
  workLight: boolean; wireHarness: boolean;
  rc751: boolean; quantityDiscount: boolean;
};

export type AcademyCase1Input = {
  machineConfigs: Array<{ type: string; acc?: string[]; qty?: number }>;
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
  pendingStepSuccess: AcademyPortalBasicsStepSuccess | null;
  acknowledgedStepSuccesses: string[];
};

export type AcademyPortalBasicsStepSuccess = {
  taskId: 'language' | 'partnerdata' | 'fullscreen' | 'partner_map';
  title: string;
  completed: number;
  total: 5;
};

export type AcademyPartnerMapState = {
  started: boolean;
  completed: boolean;
  ownDealerShown: boolean;
  fullscreenUsed: boolean;
  warrantyLayerShown: boolean;
  warrantyOpened: boolean;
  serviceDetailOpened: boolean;
  requiresServiceDetail: boolean;
};

export type AcademyCaseCompletion = {
  caseId: AcademyActiveCase;
  titleKey: string;
  completed: number;
  total: number;
};

type AcademySandboxState = AcademyCase1State & {
  case2: AcademyCase2State;
  portalBasics: AcademyPortalBasicsState;
  partnerMap: AcademyPartnerMapState;
};

const initialCase1 = (): AcademyCase1State => ({ started: false, completed: false, quoteGenerated: false, leadId: null, machine: false, flail: false, weedBrush: false, requiredComponents: false, workLight: false, wireHarness: false, rc751: false, quantityDiscount: false });
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
  pendingStepSuccess: null,
  acknowledgedStepSuccesses: [],
});
const initialPartnerMap = (): AcademyPartnerMapState => ({
  started: false,
  completed: false,
  ownDealerShown: false,
  fullscreenUsed: false,
  warrantyLayerShown: false,
  warrantyOpened: false,
  serviceDetailOpened: false,
  requiresServiceDetail: false,
});
const initial = (): AcademySandboxState => ({ ...initialCase1(), case2: initialCase2(), portalBasics: initialPortalBasics(), partnerMap: initialPartnerMap() });

function isComplete(state: AcademyCase1State) {
  return state.machine && state.flail && state.weedBrush && state.requiredComponents
    && state.workLight && state.wireHarness && state.rc751
    && state.quantityDiscount && state.quoteGenerated && Boolean(state.leadId);
}

function isLocalAcademyMode() {
  return readSession().active === true && isAcademyCycleStorageScopeActive();
}

function load(): AcademySandboxState {
  try {
    const saved = JSON.parse(localStorage.getItem(academyScopedStorageKey(KEY)) ?? '{}') as Partial<AcademySandboxState>;
    const state = {
      ...initial(),
      ...saved,
      case2: { ...initialCase2(), ...saved.case2 },
      portalBasics: { ...initialPortalBasics(), ...saved.portalBasics },
      partnerMap: { ...initialPartnerMap(), ...saved.partnerMap },
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
        rc751: true,
        quantityDiscount: true,
        quoteGenerated: true,
      }
      : state;
  } catch {
    return initial();
  }
}
function save(state: AcademySandboxState) {
  const next = JSON.stringify(state);
  const key = academyScopedStorageKey(KEY);
  if (localStorage.getItem(key) !== next) {
    localStorage.setItem(key, next);
    window.dispatchEvent(new Event(ACADEMY_PROGRESS_CHANGED));
  }
  return state;
}
function case1Of({ case2: _case2, portalBasics: _portalBasics, partnerMap: _partnerMap, ...case1 }: AcademySandboxState): AcademyCase1State { return case1; }
function isPortalBasicsComplete(state: AcademyPortalBasicsState) {
  return state.frenchSelected
    && state.languageRestored
    && state.partnerDataOpened
    && state.returnedHomeFromPartnerData
    && state.fullscreenUsed
    && state.mapAreaChanged
    && state.targetNewsOpened;
}

function portalBasicsCompletedCount(state: AcademyPortalBasicsState) {
  return Number(state.frenchSelected && state.languageRestored)
    + Number(state.partnerDataOpened && state.returnedHomeFromPartnerData)
    + Number(state.fullscreenUsed)
    + Number(state.mapAreaChanged)
    + Number(state.targetNewsOpened);
}

function isPartnerMapComplete(state: AcademyPartnerMapState) {
  return state.ownDealerShown
    && state.fullscreenUsed
    && state.warrantyLayerShown
    && state.warrantyOpened
    && (!state.requiresServiceDetail || state.serviceDetailOpened);
}

function partnerMapTaskTotal(state: AcademyPartnerMapState) {
  return state.requiresServiceDetail ? 5 : 4;
}

function savePartnerMapTransition(current: AcademySandboxState, partnerMap: AcademyPartnerMapState) {
  partnerMap.completed = current.partnerMap.completed || isPartnerMapComplete(partnerMap);
  const saved = save({ ...current, partnerMap }).partnerMap;
  if (!current.partnerMap.completed && saved.completed) {
    window.dispatchEvent(new CustomEvent<AcademyCaseCompletion>(ACADEMY_CASE_COMPLETED, {
      detail: {
        caseId: ACADEMY_PARTNER_MAP,
        titleKey: 'academyPartnerMapTitle',
        completed: partnerMapTaskTotal(saved),
        total: partnerMapTaskTotal(saved),
      },
    }));
  }
  return saved;
}

function withPortalBasicsStepSuccess(
  previous: AcademyPortalBasicsState,
  next: AcademyPortalBasicsState,
  task: AcademyPortalBasicsStepSuccess['taskId'],
  title: string,
) {
  const completed = portalBasicsCompletedCount(next);
  const wasComplete = portalBasicsCompletedCount(previous) >= completed;
  if (wasComplete || completed === 5 || next.acknowledgedStepSuccesses.includes(task)) return next;
  return { ...next, pendingStepSuccess: { taskId: task, title, completed, total: 5 } };
}

export const academySandbox = {
  isActive: isLocalAcademyMode,
  enterSession() {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...readSession(), active: true }));
  },
  leaveSession() {
    // An explicit exit wins over stale Academy query parameters in browser history.
    localStorage.setItem(SESSION_KEY, JSON.stringify({ active: false }));
    sessionStorage.removeItem(SESSION_KEY);
  },
  activateCase(caseId: AcademyActiveCase) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ active: true, caseId }));
  },
  getActiveCase() {
    const session = readSession();
    if (!isLocalAcademyMode()) return null;
    // A stale tab must not keep Case 2 reachable after local Academy progress
    // has been reset. The dashboard will offer Case 1 again.
    if (session.caseId === ACADEMY_CASE_2 && !load().completed) return null;
    return session.caseId ?? null;
  },
  getContinueRoute() {
    const caseId = this.getActiveCase();
    return caseId ? CASE_ROUTES[caseId] : '/academy';
  },
  getAllowedPortalHomeCardIds(): readonly AcademyPortalHomeCardId[] | null {
    const caseId = this.getActiveCase();
    return caseId ? CASE_PORTAL_HOME_CARDS[caseId] : null;
  },
  getCrmPart(): 1 | 2 {
    const caseId = this.getActiveCase();
    if (caseId === 'crm.part_2') return 2;
    if (caseId === 'crm.part_1') return 1;
    return new URLSearchParams(window.location.search).get('academy_part') === '2' ? 2 : 1;
  },
  getCase1() { return case1Of(load()); },
  getCase2() { return load().case2; },
  isCase2Unlocked() { return load().completed; },
  getPortalBasics() { return load().portalBasics; },
  getPartnerMap() { return load().partnerMap; },
  getPortalBasicsStepSuccess() {
    const state = load().portalBasics;
    return state.pendingStepSuccess && !state.acknowledgedStepSuccesses.includes(state.pendingStepSuccess.taskId)
      ? state.pendingStepSuccess
      : null;
  },
  acknowledgePortalBasicsStepSuccess(taskId: AcademyPortalBasicsStepSuccess['taskId']) {
    const current = load();
    const portalBasics = current.portalBasics;
    if (portalBasics.pendingStepSuccess?.taskId !== taskId || portalBasics.acknowledgedStepSuccesses.includes(taskId)) return portalBasics;
    return save({
      ...current,
      portalBasics: {
        ...portalBasics,
        pendingStepSuccess: null,
        acknowledgedStepSuccesses: [...portalBasics.acknowledgedStepSuccesses, taskId],
      },
    }).portalBasics;
  },
  getCompletedCaseIds() {
    const state = load();
    return [
      state.completed && ACADEMY_CASE_1,
      state.case2.completed && ACADEMY_CASE_2,
      state.portalBasics.completed && ACADEMY_PORTAL_BASICS,
      state.partnerMap.completed && ACADEMY_PARTNER_MAP,
    ].filter(Boolean) as string[];
  },
  startCase1() { this.activateCase(ACADEMY_CASE_1); return case1Of(save({ ...load(), started: true })); },
  startCase2() {
    if (!this.isCase2Unlocked()) throw new Error('Sales Case 1 skal gennemføres før Case 2.');
    this.activateCase(ACADEMY_CASE_2);
    const current = load();
    return save({ ...current, case2: { ...current.case2, started: true } }).case2;
  },
  startPortalBasics(startingLanguage: string) {
    this.activateCase(ACADEMY_PORTAL_BASICS);
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
  startPartnerMap() {
    this.activateCase(ACADEMY_PARTNER_MAP);
    const current = load();
    return save({
      ...current,
      partnerMap: { ...initialPartnerMap(), ...current.partnerMap, started: true },
    }).partnerMap;
  },
  configurePartnerMapServiceDetail(required: boolean) {
    if (!isLocalAcademyMode() || this.getActiveCase() !== ACADEMY_PARTNER_MAP) return load().partnerMap;
    const current = load();
    const partnerMap = { ...current.partnerMap, requiresServiceDetail: required };
    return savePartnerMapTransition(current, partnerMap);
  },
  trackPartnerMapOwnDealer() {
    if (!isLocalAcademyMode() || this.getActiveCase() !== ACADEMY_PARTNER_MAP) return load().partnerMap;
    const current = load();
    const partnerMap = { ...current.partnerMap, ownDealerShown: true };
    return savePartnerMapTransition(current, partnerMap);
  },
  trackPartnerMapFullscreen() {
    if (!isLocalAcademyMode() || this.getActiveCase() !== ACADEMY_PARTNER_MAP) return load().partnerMap;
    const current = load();
    const partnerMap = { ...current.partnerMap, fullscreenUsed: true };
    return savePartnerMapTransition(current, partnerMap);
  },
  trackPartnerMapWarrantyLayer() {
    if (!isLocalAcademyMode() || this.getActiveCase() !== ACADEMY_PARTNER_MAP) return load().partnerMap;
    const current = load();
    const partnerMap = { ...current.partnerMap, warrantyLayerShown: true };
    return savePartnerMapTransition(current, partnerMap);
  },
  trackPartnerMapWarrantyOpened() {
    if (!isLocalAcademyMode() || this.getActiveCase() !== ACADEMY_PARTNER_MAP) return load().partnerMap;
    const current = load();
    const partnerMap = { ...current.partnerMap, warrantyOpened: true };
    return savePartnerMapTransition(current, partnerMap);
  },
  trackPartnerMapServiceDetail() {
    if (!isLocalAcademyMode() || this.getActiveCase() !== ACADEMY_PARTNER_MAP) return load().partnerMap;
    const current = load();
    const partnerMap = { ...current.partnerMap, serviceDetailOpened: true };
    return savePartnerMapTransition(current, partnerMap);
  },
  trackPortalBasicsLanguage(language: string) {
    if (!isLocalAcademyMode() || this.getActiveCase() !== ACADEMY_PORTAL_BASICS) return load().portalBasics;
    const current = load();
    if (!current.portalBasics.started) return current.portalBasics;
    const frenchSelected = current.portalBasics.frenchSelected || language === 'fr';
    const languageRestored = current.portalBasics.languageRestored || (
      frenchSelected
      && current.portalBasics.startingLanguage !== null
      && language === current.portalBasics.startingLanguage
    );
    let portalBasics = { ...current.portalBasics, frenchSelected, languageRestored };
    portalBasics.completed = current.portalBasics.completed || isPortalBasicsComplete(portalBasics);
    portalBasics = withPortalBasicsStepSuccess(current.portalBasics, portalBasics, 'language', 'Skift portalsprog til fransk og tilbage');
    return save({ ...current, portalBasics }).portalBasics;
  },
  trackPortalBasicsPartnerData() {
    if (!isLocalAcademyMode() || this.getActiveCase() !== ACADEMY_PORTAL_BASICS) return load().portalBasics;
    const current = load();
    if (!current.portalBasics.started) return current.portalBasics;
    const portalBasics = { ...current.portalBasics, partnerDataOpened: true };
    portalBasics.completed = current.portalBasics.completed || isPortalBasicsComplete(portalBasics);
    return save({ ...current, portalBasics }).portalBasics;
  },
  trackPortalBasicsLogoHome(fromPath: string) {
    if (!isLocalAcademyMode() || this.getActiveCase() !== ACADEMY_PORTAL_BASICS) return load().portalBasics;
    const current = load();
    if (!current.portalBasics.started || fromPath !== '/portal/dealer-data') return current.portalBasics;
    let portalBasics = { ...current.portalBasics, returnedHomeFromPartnerData: current.portalBasics.partnerDataOpened };
    portalBasics.completed = current.portalBasics.completed || isPortalBasicsComplete(portalBasics);
    portalBasics = withPortalBasicsStepSuccess(current.portalBasics, portalBasics, 'partnerdata', 'Partnerdata og Timan-logoet');
    return save({ ...current, portalBasics }).portalBasics;
  },
  trackPortalBasicsFullscreen() {
    if (!isLocalAcademyMode() || this.getActiveCase() !== ACADEMY_PORTAL_BASICS) return load().portalBasics;
    const current = load();
    if (!current.portalBasics.started) return current.portalBasics;
    let portalBasics = { ...current.portalBasics, fullscreenUsed: true };
    portalBasics.completed = current.portalBasics.completed || isPortalBasicsComplete(portalBasics);
    portalBasics = withPortalBasicsStepSuccess(current.portalBasics, portalBasics, 'fullscreen', 'Aktivér fullscreen');
    return save({ ...current, portalBasics }).portalBasics;
  },
  trackPortalBasicsMapArea(area: string) {
    if (!isLocalAcademyMode() || this.getActiveCase() !== ACADEMY_PORTAL_BASICS) return load().portalBasics;
    const current = load();
    if (!current.portalBasics.started || area === 'none') return current.portalBasics;
    let portalBasics = { ...current.portalBasics, mapAreaChanged: true };
    portalBasics.completed = current.portalBasics.completed || isPortalBasicsComplete(portalBasics);
    portalBasics = withPortalBasicsStepSuccess(current.portalBasics, portalBasics, 'partner_map', 'Skift område på Partnerkortet');
    return save({ ...current, portalBasics }).portalBasics;
  },
  trackPortalBasicsNews(title: string) {
    if (!isLocalAcademyMode() || this.getActiveCase() !== ACADEMY_PORTAL_BASICS) return load().portalBasics;
    const current = load();
    if (!current.portalBasics.started || title !== PORTAL_BASICS_NEWS_TITLE) return current.portalBasics;
    const portalBasics = { ...current.portalBasics, targetNewsOpened: true, pendingStepSuccess: null };
    portalBasics.completed = current.portalBasics.completed || isPortalBasicsComplete(portalBasics);
    return save({ ...current, portalBasics }).portalBasics;
  },
  evaluate(input: AcademyCase1Input) {
    if (!isLocalAcademyMode()) throw new Error('Academy sandbox is only available on localhost.');
    const current = load();
    // A completed case remains an achievement when a user starts another configuration.
    if (current.completed) return case1Of(current);
    const rc = input.machineConfigs.find((item) => item.type === 'RC-1000S');
    const accessories = rc?.acc ?? [];
    const rc751 = input.machineConfigs.find((machine) => machine.type === 'RC-751' && (machine.qty ?? 1) > 0);
    const next = { ...current, started: true, machine: Boolean(rc), flail: accessories.includes('410910'), weedBrush: accessories.includes('730600'), requiredComponents: accessories.includes('412603'), workLight: accessories.includes(ACC_ID_WORK_LIGHT), wireHarness: accessories.includes(ACC_ID_WIRE_HARNESS), rc751: Boolean(rc751), quantityDiscount: input.quantityDiscount, quoteGenerated: input.quoteGenerated ?? current.quoteGenerated };
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
    if (!this.isCase2Unlocked()) throw new Error('Sales Case 1 skal gennemføres før Case 2.');
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
    if (!this.isCase2Unlocked()) throw new Error('Sales Case 1 skal gennemføres før Case 2.');
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
