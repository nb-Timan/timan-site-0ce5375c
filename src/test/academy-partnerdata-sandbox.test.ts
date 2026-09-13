import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { academyPartnerDataSandbox as sandbox, ACADEMY_PARTNER_ACCOUNT } from '@/lib/academyPartnerDataSandbox';
import { getPartnerDataRepository } from '@/lib/partnerDataRepository';
import { academyProtectedFetch } from '@/lib/academyProductionWriteGuard';
import { academySandbox } from '@/lib/academySandbox';

const invoice = { form_type: 'dealer_invoice_accept' as const, dealer_account_number: ACADEMY_PARTNER_ACCOUNT,
  payload: { decision: 'accept', your_company_name: 'Academy Maskiner', your_name: 'Test',
    third_party_company_name: 'Academy Servicepartner', third_party_cvr: 'TEST' } };

async function completeProfile() {
  sandbox.start(1);
  const dealer = sandbox.listDealers()[0];
  await getPartnerDataRepository().updateDealerAccount(dealer.id, { social_youtube: 'https://youtube.com/@academy' });
  return sandbox.upsertDealerContact({ dealer_account_id: dealer.id, contact_area: 'sales', name: 'Academy Kontakt', is_primary: true });
}

describe('canonical Partnerdata with a local data adapter', () => {
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    window.history.replaceState({}, '', '/portal/dealer-data?academy_mode=true&academy_part=1');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('requires real saved contact, primary selection and YouTube, not just starting', async () => {
    sandbox.start(1);
    expect(sandbox.getProgress().part1Completed).toBe(false);
    const dealer = sandbox.listDealers()[0];
    const saved = await sandbox.upsertDealerContact({ dealer_account_id: dealer.id, contact_area: 'sales', name: 'Academy Kontakt' });
    await sandbox.updateDealerAccount(dealer.id, { social_youtube: 'https://youtube.com/@academy' });
    expect(sandbox.getProgress().part1Completed).toBe(false);
    await sandbox.upsertDealerContact({ ...saved.row, is_primary: true });
    expect(sandbox.getProgress().part1Completed).toBe(true);
    const repo = getPartnerDataRepository();
    expect((await repo.listDealerContacts(dealer.id))[0].is_primary).toBe(true);
    expect((await repo.listDealerContacts(dealer.id))[0].name).toBe('Academy Kontakt');
  });

  it('gates Part 2 and requires a validated invoice from the real form', async () => {
    expect(() => sandbox.start(2)).toThrow('Complete Partnerdata Part 1');
    await completeProfile();
    sandbox.start(2);
    sandbox.reviewPartnerRelation(ACADEMY_PARTNER_ACCOUNT);
    expect(sandbox.getProgress().part2Completed).toBe(false);
    await expect(sandbox.submitInvoice({ ...invoice, payload: {} })).rejects.toThrow();
    const first = await sandbox.submitInvoice(invoice);
    const retry = await sandbox.submitInvoice(invoice);
    expect(retry.id).toBe(first.id);
    expect(sandbox.getState().submissions).toHaveLength(1);
    expect(sandbox.getProgress().part2Completed).toBe(true);
  });

  it('preserves both profile and invoice progress across repository re-entry', async () => {
    await completeProfile(); sandbox.start(2);
    sandbox.reviewPartnerRelation(ACADEMY_PARTNER_ACCOUNT);
    await sandbox.submitInvoice(invoice);
    window.history.replaceState({}, '', '/academy?academy_mode=true');
    expect(sandbox.getProgress()).toMatchObject({ part1Completed: true, part2Completed: true });
    expect(sandbox.getState().dealers[0].social_youtube).toBe('https://youtube.com/@academy');
  });

  it('rejects foreign IDs and writes outside the sandbox', async () => {
    await completeProfile();
    await expect(sandbox.updateDealerAccount('real-dealer', { city: 'Wrong' })).rejects.toThrow('outside');
    await expect(sandbox.upsertDealerContact({ id: 'real-contact', dealer_account_id: sandbox.listDealers()[0].id, contact_area: 'sales' })).rejects.toThrow('outside');
    await expect(sandbox.submitInvoice({ ...invoice, dealer_account_number: '10458' })).rejects.toThrow();
    academySandbox.leaveSession();
    window.history.replaceState({}, '', '/portal');
    await expect(sandbox.deleteDealerContact('anything')).rejects.toThrow('active local session');
  });

  it('does not reuse completion from the removed fake workspace', () => {
    localStorage.setItem('timan.academy.partnerdata.v1', JSON.stringify({ contactName: 'Test', primaryContactId: 'academy-contact-1', youtubeChannel: 'https://youtube.com/@test', relationReviewed: true, invoiceFlowReviewed: true }));
    expect(sandbox.getProgress().part1Completed).toBe(false);
    expect(sandbox.getProgress().part2Completed).toBe(false);
  });

  it.each(['/rest/v1/dealer_accounts', '/rest/v1/rpc/save', '/storage/v1/object/x', '/functions/v1/admin'])('blocks production mutation before network: %s', async (path) => {
    const network = vi.fn(); vi.stubGlobal('fetch', network);
    await expect(academyProtectedFetch('https://example.supabase.co' + path, { method: 'POST' })).rejects.toThrow('production writes');
    expect(network).not.toHaveBeenCalled();
  });

  it('leaves non-Academy requests unchanged and permits read-only GET', async () => {
    const network = vi.fn().mockResolvedValue(new Response('{}')); vi.stubGlobal('fetch', network);
    await academyProtectedFetch('https://example.supabase.co/rest/v1/dealer_accounts');
    academySandbox.leaveSession();
    window.history.replaceState({}, '', '/portal');
    await academyProtectedFetch('https://example.supabase.co/rest/v1/dealer_accounts', { method: 'PATCH' });
    expect(network).toHaveBeenCalledTimes(2);
  });
});

describe('canonical module reuse', () => {
  const read = (path: string) => readFileSync(path, 'utf8');
  it('has no replacement Partnerdata or Partnerkort workspace', () => {
    expect(existsSync('src/pages/portal/AcademyPartnerDataWorkspace.tsx')).toBe(false);
    expect(existsSync('src/pages/misc/AcademyAwarePartnerMapPage.tsx')).toBe(false);
    expect(read('src/App.tsx')).toContain('import("./pages/misc/PartnerMapPage")');
    expect(read('src/pages/portal/PartnerDataRoute.tsx')).toContain('<CrmMyDealersPage presentation="partnerdata"');
    expect(read('src/pages/portal/PartnerDataRoute.tsx')).toContain('<DealerDataPage');
    expect(read('src/components/portal/DealerProfileEditor.tsx')).toContain('getPartnerDataRepository()');
  });
});
