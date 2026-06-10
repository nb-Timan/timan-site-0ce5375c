/**
 * Persists Machine Search (Søg på maskine) UI state across navigations so
 * users returning from Min Maskine see the same filters, sorting, page,
 * search text and scroll position.
 *
 * Stored in sessionStorage so it is scoped to the current tab and cleared
 * when the user logs out / closes the tab.
 */

export type MachineSearchStatusFilter = 'all' | 'healthy' | 'needs_attention' | 'critical';
export type MachineSearchPageSize = number | 'all';

export interface MachineSearchSavedState {
  query: string;
  dealerQuery?: string;
  dateFrom?: string;
  dateTo?: string;
  modelFilter?: string;
  statusFilter: MachineSearchStatusFilter;
  page: number;
  pageSize: MachineSearchPageSize;
  scrollY: number;
  /** Last serial the user opened from this state. Lets the journal page
   *  decide whether the "back to search" affordance should be shown. */
  lastOpenedSerial?: string;
  savedAt: number;
}

const KEY = 'timan.machineSearchState.v1';
/** Max age before we treat the state as stale (24h). */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function saveMachineSearchState(state: Omit<MachineSearchSavedState, 'savedAt'>): void {
  try {
    const payload: MachineSearchSavedState = { ...state, savedAt: Date.now() };
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota/serialization errors */
  }
}

export function readMachineSearchState(): MachineSearchSavedState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MachineSearchSavedState;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearMachineSearchState(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** True when state exists and the user came from the search page for the
 *  given serial (or any serial, if `serial` is omitted). */
export function hasMachineSearchContext(serial?: string): boolean {
  const s = readMachineSearchState();
  if (!s) return false;
  if (!serial) return true;
  return !s.lastOpenedSerial || s.lastOpenedSerial === serial;
}
