import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifyPortalStartupFailure,
  isStaleChunkError,
  markPortalStartup,
  shouldAttemptChunkRecovery,
  withPortalStartupTimeout,
} from '@/lib/portalStartupDiagnostics';

describe('Portal startup recovery', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it.each([
    'Failed to fetch dynamically imported module: /assets/PortalPage-old.js',
    'Importing a module script failed',
    'ChunkLoadError: Loading chunk 17 failed',
    'CSS chunk load failed',
  ])('recognizes a stale deployment asset: %s', message => {
    expect(isStaleChunkError(new Error(message))).toBe(true);
    expect(classifyPortalStartupFailure(new Error(message))).toBe('chunk_load_error');
  });

  it('allows one recovery per build and route, then prevents a reload loop', () => {
    const previous = { buildId: 'abc', route: '/portal/crm', at: 1_000 };
    expect(shouldAttemptChunkRecovery(previous, 2_000, '/portal/crm', 'abc')).toBe(false);
    expect(shouldAttemptChunkRecovery(previous, 2_000, '/portal/crm/leads', 'abc')).toBe(true);
    expect(shouldAttemptChunkRecovery(previous, 2_000, '/portal/crm', 'def')).toBe(true);
    expect(shouldAttemptChunkRecovery(previous, 302_000, '/portal/crm', 'abc')).toBe(true);
  });

  it('turns a hanging bootstrap request into a categorized timeout', async () => {
    vi.useFakeTimers();
    const pending = withPortalStartupTimeout(new Promise<never>(() => undefined), 100, 'auth_timeout');
    const assertion = expect(pending).rejects.toMatchObject({ category: 'auth_timeout' });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it('stores sanitized startup stages without credentials or payload data', () => {
    const entry = markPortalStartup('route_ready', { once: false });
    expect(entry).toMatchObject({ event: 'route_ready', route: window.location.pathname });
    expect(JSON.stringify(entry)).not.toMatch(/token|password|customer/i);
  });
});
