const STORAGE_SCOPE_KEY = 'timan.academy.cycle-scope.v1';

export type AcademyCycleScopeStatus = 'active' | 'completed';

type Scope = { cycleId: string; resetVersion: number; status?: AcademyCycleScopeStatus; completionIds?: string[] };

function readScope(): Scope | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_SCOPE_KEY) ?? 'null') as Partial<Scope> | null;
    if (!value?.cycleId || !Number.isInteger(value.resetVersion) || value.resetVersion < 0) return null;
    const status = value.status;
    if (status !== undefined && status !== 'active' && status !== 'completed') return null;
    return { cycleId: value.cycleId, resetVersion: value.resetVersion, ...(status ? { status } : {}),
      ...(Array.isArray(value.completionIds) ? { completionIds: value.completionIds.filter((id): id is string => typeof id === 'string') } : {}) };
  } catch {
    return null;
  }
}

/** Scope every local Academy sandbox to the canonical server cycle. */
export function setAcademyCycleStorageScope(cycleId: string, resetVersion = 0, status?: AcademyCycleScopeStatus, completionIds?: string[]) {
  localStorage.setItem(STORAGE_SCOPE_KEY, JSON.stringify({ cycleId, resetVersion, ...(status ? { status } : {}), ...(completionIds ? { completionIds } : {}) }));
}

export function getAcademyCycleStorageScope() {
  return readScope();
}

export function hasAcademyCycleCompletion(caseId: string) {
  return readScope()?.completionIds?.includes(caseId) ?? false;
}

/** A completed server cycle preserves its local history but cannot keep a training session active. */
export function isAcademyCycleStorageScopeActive() {
  return readScope()?.status !== 'completed';
}

export function academyScopedStorageKey(baseKey: string) {
  const scope = readScope();
  return scope ? `${baseKey}:${scope.cycleId}:${scope.resetVersion}` : baseKey;
}
