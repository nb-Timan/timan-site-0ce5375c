import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLoanOverviewInfo } from '@/lib/loanService';
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), selects: [] as string[], filters: [] as unknown[][], caseResult: {} as Record<string, unknown>, versionResult: {} as Record<string, unknown> }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
const savedAddress = { alternative_delivery_address: true, delivery_address: 'Saved road', delivery_postal_code: '1234', delivery_city: 'Saved town', delivery_country: 'DK', delivery_contact: 'Saved name' };
beforeEach(() => {
  vi.resetAllMocks(); mocks.selects = []; mocks.filters = [];
  mocks.caseResult = { data: { ...savedAddress, status: 'ON_LOAN', current_version_number: 2, notes: 'Current case note' }, error: null };
  mocks.versionResult = { data: { ...savedAddress, delivery_address: 'Historical road' }, error: null };
  mocks.rpc.mockResolvedValue({ data: [{ case_item_id: 'a', receipt_status: 'RECEIVED' }], error: null });
  mocks.from.mockImplementation((table: string) => {
    const chain = {
      select: (columns: string) => { mocks.selects.push(columns); return chain; },
      eq: (column: string, value: unknown) => { mocks.filters.push([table, column, value]); return chain; },
      single: async () => mocks.caseResult,
      maybeSingle: async () => mocks.versionResult,
      order: async () => ({ data: [{ id: 'a', product_sku: 'SKU', product_name_snapshot: 'Saved item' }], error: null }),
    }; return chain;
  });
});
describe('canonical read-only overview loader', () => {
  it('uses case items/return RPC and exact frozen version, without Fabric or current partner queries', async () => {
    const info = await getLoanOverviewInfo('case');
    expect(info.delivery.delivery_address).toBe('Historical road'); expect(info.notes).toBe('Current case note');
    expect(info.items[0].product_name_snapshot).toBe('Saved item');
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(['loan_cases', 'loan_case_items', 'loan_case_versions']);
    expect(mocks.filters).toContainEqual(['loan_case_versions', 'version_number', 2]);
    expect(mocks.filters).toContainEqual(['loan_case_versions', 'case_id', 'case']);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('loan_list_return_summary', { p_case_id: 'case' });
  });
  it.each(['DRAFT', 'READY_FOR_REVIEW'])('uses current saved delivery choice when %s is being edited', async (status) => {
    mocks.caseResult = { data: { ...savedAddress, status, current_version_number: 2, notes: null }, error: null };
    expect((await getLoanOverviewInfo('draft')).delivery.delivery_address).toBe('Saved road');
    expect(mocks.from).not.toHaveBeenCalledWith('loan_case_versions');
  });
  it('keeps legacy missing normal addresses missing instead of looking up a changed partner', async () => {
    mocks.versionResult = { data: { ...savedAddress, alternative_delivery_address: false, delivery_address: null, delivery_postal_code: null, delivery_city: null, delivery_country: null }, error: null };
    expect((await getLoanOverviewInfo('history')).delivery.delivery_address).toBeNull();
    expect(mocks.from).not.toHaveBeenCalledWith('dealer_accounts');
  });
  it('supports an unversioned case and a legacy missing version without fabricated data', async () => {
    mocks.versionResult = { data: null, error: null };
    expect((await getLoanOverviewInfo('legacy')).delivery.delivery_address).toBe('Saved road');
    mocks.caseResult = { data: { ...savedAddress, current_version_number: 0, status: 'CANCELLED' }, error: null };
    await getLoanOverviewInfo('cancelled');
    expect(mocks.from.mock.calls.filter(([table]) => table === 'loan_case_versions')).toHaveLength(1);
  });
  it('propagates existing RLS errors; never relaxes access or substitutes another source', async () => {
    mocks.caseResult = { data: null, error: new Error('Denied') };
    await expect(getLoanOverviewInfo('denied')).rejects.toThrow('Denied');
    expect(mocks.from).not.toHaveBeenCalledWith('loan_case_versions');
  });
});
