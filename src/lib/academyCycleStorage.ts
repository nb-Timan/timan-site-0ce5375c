const STORAGE_SCOPE_KEY = 'timan.academy.cycle-scope.v1';

type Scope = { cycleId: string; resetVersion: number };

function readScope(): Scope | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_SCOPE_KEY) ?? 'null') as Partial<Scope> | null;
    if (!value?.cycleId || !Number.isInteger(value.resetVersion) || value.resetVersion < 0) return null;
    return { cycleId: value.cycleId, resetVersion: value.resetVersion };
  } catch {
    return null;
  }
}

/** Scope every local Academy sandbox to the canonical server cycle. */
export function setAcademyCycleStorageScope(cycleId: string, resetVersion = 0) {
  localStorage.setItem(STORAGE_SCOPE_KEY, JSON.stringify({ cycleId, resetVersion }));
}

export function getAcademyCycleStorageScope() {
  return readScope();
}

export function academyScopedStorageKey(baseKey: string) {
  const scope = readScope();
  return scope ? `${baseKey}:${scope.cycleId}:${scope.resetVersion}` : baseKey;
}
