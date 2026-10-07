export type PortalStartupStage =
  | 'app_start'
  | 'auth_resolved'
  | 'profile_resolved'
  | 'permissions_resolved'
  | 'route_ready'
  | 'initial_data_ready'
  | 'first_meaningful_render';

export type PortalStartupFailureCategory =
  | 'chunk_load_error'
  | 'auth_timeout'
  | 'auth_error'
  | 'profile_error'
  | 'permission_error'
  | 'rpc_error'
  | 'route_error'
  | 'bootstrap_timeout'
  | 'runtime_error';

export type PortalStartupDiagnostic = {
  event: PortalStartupStage | PortalStartupFailureCategory | 'automatic_recovery';
  timestamp: string;
  duration_ms: number;
  build_id: string;
  route: string;
  user_id?: string;
  role?: string;
  effective_role?: string;
  error_category?: PortalStartupFailureCategory;
};

type StartupIdentity = {
  userId?: string | null;
  role?: string | null;
  effectiveRole?: string | null;
};

const STORAGE_KEY = 'timan.portal.startup-diagnostics.v1';
const RECOVERY_KEY = 'timan.portal.chunk-recovery.v1';
const RECOVERY_TTL_MS = 5 * 60 * 1000;
const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
const recordedStages = new Set<string>();
let identity: StartupIdentity = {};

export const PORTAL_BUILD_ID = typeof __TIMAN_BUILD_ID__ === 'string'
  ? __TIMAN_BUILD_ID__
  : 'unknown';

function elapsedMs(): number {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return Math.max(0, Math.round(now - startedAt));
}

function currentRoute(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname;
}

function readStoredDiagnostics(): PortalStartupDiagnostic[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function storeDiagnostic(entry: PortalStartupDiagnostic): void {
  if (typeof window === 'undefined') return;
  try {
    const history = [...readStoredDiagnostics(), entry].slice(-60);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Startup diagnostics must never become a startup dependency themselves.
  }
}

export function setPortalStartupIdentity(next: StartupIdentity): void {
  identity = { ...identity, ...next };
}

export function markPortalStartup(
  event: PortalStartupStage | PortalStartupFailureCategory | 'automatic_recovery',
  options: { once?: boolean; errorCategory?: PortalStartupFailureCategory } = {},
): PortalStartupDiagnostic | null {
  const once = options.once ?? !event.endsWith('_error');
  if (once && recordedStages.has(event)) return null;
  if (once) recordedStages.add(event);

  const entry: PortalStartupDiagnostic = {
    event,
    timestamp: new Date().toISOString(),
    duration_ms: elapsedMs(),
    build_id: PORTAL_BUILD_ID,
    route: currentRoute(),
    ...(identity.userId ? { user_id: identity.userId } : {}),
    ...(identity.role ? { role: identity.role } : {}),
    ...(identity.effectiveRole ? { effective_role: identity.effectiveRole } : {}),
    ...(options.errorCategory ? { error_category: options.errorCategory } : {}),
  };
  storeDiagnostic(entry);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('timan:portal-startup-diagnostic', { detail: entry }));
  }
  console.info('[portal-startup]', entry);
  return entry;
}

export function getPortalStartupDiagnostics(): PortalStartupDiagnostic[] {
  return readStoredDiagnostics();
}

export class PortalStartupTimeoutError extends Error {
  readonly category: PortalStartupFailureCategory;

  constructor(category: PortalStartupFailureCategory) {
    super(category);
    this.name = 'PortalStartupTimeoutError';
    this.category = category;
  }
}

export function withPortalStartupTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  category: PortalStartupFailureCategory,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new PortalStartupTimeoutError(category)), timeoutMs);
    Promise.resolve(promise).then(
      value => { window.clearTimeout(timer); resolve(value); },
      error => { window.clearTimeout(timer); reject(error); },
    );
  });
}

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /failed to fetch dynamically imported module|importing a module script failed|loading chunk|chunkloaderror|css chunk load failed/i.test(message);
}

export function classifyPortalStartupFailure(
  error: unknown,
  fallback: PortalStartupFailureCategory = 'runtime_error',
): PortalStartupFailureCategory {
  if (isStaleChunkError(error)) return 'chunk_load_error';
  if (error instanceof PortalStartupTimeoutError) return error.category;
  return fallback;
}

export function shouldAttemptChunkRecovery(
  previous: { buildId?: string; route?: string; at?: number } | null,
  now = Date.now(),
  route = currentRoute(),
  buildId = PORTAL_BUILD_ID,
): boolean {
  return !previous
    || previous.buildId !== buildId
    || previous.route !== route
    || typeof previous.at !== 'number'
    || now - previous.at > RECOVERY_TTL_MS;
}

export function attemptAutomaticChunkRecovery(error: unknown): boolean {
  if (typeof window === 'undefined' || !isStaleChunkError(error)) return false;
  let previous: { buildId?: string; route?: string; at?: number } | null = null;
  try {
    previous = JSON.parse(window.sessionStorage.getItem(RECOVERY_KEY) || 'null');
  } catch {
    previous = null;
  }
  if (!shouldAttemptChunkRecovery(previous)) return false;

  try {
    window.sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({
      buildId: PORTAL_BUILD_ID,
      route: currentRoute(),
      at: Date.now(),
    }));
  } catch {
    // A reload can still recover even when storage is unavailable.
  }
  markPortalStartup('chunk_load_error', { once: false, errorCategory: 'chunk_load_error' });
  markPortalStartup('automatic_recovery', { once: false, errorCategory: 'chunk_load_error' });
  const next = new URL(window.location.href);
  next.searchParams.set('__timan_recover', String(Date.now()));
  next.searchParams.set('__timan_build', PORTAL_BUILD_ID);
  window.location.replace(next.toString());
  return true;
}

export function markFirstMeaningfulRender(): void {
  markPortalStartup('first_meaningful_render');
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    // Optional cleanup only.
  }
  const current = new URL(window.location.href);
  if (current.searchParams.has('__timan_recover') || current.searchParams.has('__timan_build')) {
    current.searchParams.delete('__timan_recover');
    current.searchParams.delete('__timan_build');
    window.history.replaceState(window.history.state, '', current.toString());
  }
}
