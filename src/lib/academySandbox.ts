import { ACC_ID_WIRE_HARNESS, ACC_ID_WORK_LIGHT } from '@/data/machines';

export const ACADEMY_CASE_1 = 'sales-rc-1000';
const KEY = 'timan.academy.sandbox.v1';

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

const initial = (): AcademyCase1State => ({ started: false, completed: false, quoteGenerated: false, leadId: null, machine: false, flail: false, weedBrush: false, requiredComponents: false, workLight: false, wireHarness: false, deliveryDiscount: false, quantityDiscount: false });

function isComplete(state: AcademyCase1State) {
  return state.machine && state.flail && state.weedBrush && state.requiredComponents
    && state.workLight && state.wireHarness && state.deliveryDiscount
    && state.quantityDiscount && state.quoteGenerated && Boolean(state.leadId);
}

function isLocalAcademyMode() {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get('academy_mode') === 'true';
}

function load(): AcademyCase1State {
  try { return { ...initial(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return initial(); }
}
function save(state: AcademyCase1State) { localStorage.setItem(KEY, JSON.stringify(state)); return state; }

export const academySandbox = {
  isActive: isLocalAcademyMode,
  getCase1: load,
  getCompletedCaseIds() { return load().completed ? [ACADEMY_CASE_1] : []; },
  startCase1() { return save({ ...load(), started: true }); },
  evaluate(input: AcademyCase1Input) {
    if (!isLocalAcademyMode()) throw new Error('Academy sandbox is only available on localhost.');
    const rc = input.machineConfigs.find((item) => item.type === 'RC-1000S');
    const accessories = rc?.acc ?? [];
    const current = load();
    const next = { ...current, started: true, machine: Boolean(rc), flail: accessories.includes('410910'), weedBrush: accessories.includes('730600'), requiredComponents: accessories.includes('412603'), workLight: accessories.includes(ACC_ID_WORK_LIGHT), wireHarness: accessories.includes(ACC_ID_WIRE_HARNESS), deliveryDiscount: input.deliveryDiscount, quantityDiscount: input.quantityDiscount, quoteGenerated: input.quoteGenerated ?? current.quoteGenerated };
    // Once the sandbox has awarded completion, a Configurator UI refresh must
    // not revoke it just because the in-memory training configuration resets.
    next.completed = current.completed || isComplete(next);
    return save(next);
  },
  generateQuote() {
    if (!isLocalAcademyMode()) throw new Error('Academy writes must never use production persistence.');
    return save({ ...load(), quoteGenerated: true });
  },
  saveLead() {
    if (!isLocalAcademyMode()) throw new Error('Academy writes must never use production persistence.');
    const current = load();
    const next = { ...current, leadId: current.leadId ?? `academy-lead-${crypto.randomUUID()}` };
    next.completed = isComplete(next);
    return save(next);
  },
  assertNoProductionWrite() { if (isLocalAcademyMode()) throw new Error('Blocked: Academy mode cannot write to Supabase.'); },
};
