import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteCrmRecordPermanently } from '@/lib/crmPermanentDelete';

const mocks = vi.hoisted(() => ({ session: vi.fn(), invoke: vi.fn(), mode: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: mocks.session }, functions: { invoke: mocks.invoke } } }));
vi.mock('@/lib/activeMode', () => ({ getActiveMode: mocks.mode }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ data: { session: { user: { email: 'qa@example.invalid' } } } });
  mocks.mode.mockReturnValue('backend');
  mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

describe('permanent deletion service', () => {
  it.each(['lead', 'document'] as const)('sends one %s request through the authenticated server endpoint', async kind => {
    await deleteCrmRecordPermanently(kind, 'qa-id');
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('admin-crm-delete', {
      body: { kind, id: 'qa-id', effectiveMode: 'backend' },
    });
  });
  it('blocks View-as before sending a destructive request', async () => {
    mocks.mode.mockReturnValue('AKR');
    await expect(deleteCrmRecordPermanently('document', 'qa-id')).rejects.toThrow('Skift til Backend');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('requires an authenticated session', async () => {
    mocks.session.mockResolvedValue({ data: { session: null } });
    await expect(deleteCrmRecordPermanently('lead', 'qa-id')).rejects.toThrow('Log ind igen');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('retains the exact server denial and does not retry or fall back to direct deletion', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: 'HTTP error', context: { json: async () => ({ error: 'Timan Backend required' }) } } });
    await expect(deleteCrmRecordPermanently('document', 'qa-id')).rejects.toThrow('Timan Backend required');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
  it('does not report success without server confirmation', async () => {
    mocks.invoke.mockResolvedValue({ data: {}, error: null });
    await expect(deleteCrmRecordPermanently('lead', 'qa-id')).rejects.toThrow('ikke bekræftet');
  });
});
