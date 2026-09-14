import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { academyScopedStorageKey, setAcademyCycleStorageScope } from '@/lib/academyCycleStorage';
import { academySandbox } from '@/lib/academySandbox';
import { academyProtectedFetch } from '@/lib/academyProductionWriteGuard';

describe('Academy cycles and completion history', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/academy?academy_mode=true');
    academySandbox.enterSession();
  });

  it('isolates each local sandbox from the server cycle and reset version', () => {
    setAcademyCycleStorageScope('cycle-one', 0);
    academySandbox.startCase1();
    academySandbox.evaluate({
      machineConfigs: [
        { type: 'RC-1000S', acc: ['410910', '730600', '412603', '412594', '412614'] },
        { type: 'RC-751' },
      ],
      wiringHarnessInCart: true,
      quantityDiscount: true,
      quoteGenerated: true,
    });
    expect(localStorage.getItem(academyScopedStorageKey('timan.academy.sandbox.v1'))).not.toBeNull();

    setAcademyCycleStorageScope('cycle-two', 0);
    expect(academySandbox.getCase1().completed).toBe(false);

    setAcademyCycleStorageScope('cycle-one', 1);
    expect(academySandbox.getCase1().completed).toBe(false);
  });

  it('only permits the one canonical Academy metadata RPC while Academy is active', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await academyProtectedFetch('https://example.supabase.co/rest/v1/rpc/record_academy_cycle_completion', { method: 'POST' });
    await expect(academyProtectedFetch('https://example.supabase.co/rest/v1/rpc/admin_start_academy_cycle', { method: 'POST' })).rejects.toThrow('production writes');
    await expect(academyProtectedFetch('https://example.supabase.co/rest/v1/crm_leads', { method: 'POST' })).rejects.toThrow('production writes');
  });

  it('keeps cycles, history, audit, RLS and server-side recurrence in the canonical migration', () => {
    const migration = readFileSync('supabase/migrations/20260913173348_academy_cycles_and_completion_history.sql', 'utf8');
    expect(migration).toContain('create table public.academy_cycles');
    expect(migration).toContain('create table public.academy_cycle_completions');
    expect(migration).toContain('create table public.academy_cycle_awards');
    expect(migration).toContain('academy_cycles_one_active_per_user_idx');
    expect(migration).toContain('academy_activate_due_cycle');
    expect(migration).toContain('record_academy_cycle_completion');
    expect(migration).toContain('academy_cycle_reactivated');
    expect(migration).toContain('academy_cycle_reset');
    expect(migration).toContain("when 'annual' then now() + interval '1 year'");
    expect(migration).toContain("when 'biennial' then now() + interval '2 years'");
    expect(migration).toContain("values (p_cycle_id, 'bronze')");
    expect(migration).toContain("values (p_cycle_id, 'silver')");
    expect(migration).toContain("values (p_cycle_id, 'gold')");
    expect(migration).toContain('academy_cycle_awards_cycle_award_key unique (cycle_id, award)');
    expect(migration).toContain('academy_cycles_select_owner_or_backend');
    expect(migration).toContain('public.academy_write_audit');
  });

  it('exposes canonical cycle management in the existing Backend user editor', () => {
    const editor = readFileSync('src/pages/backend/BackendUsersPage.tsx', 'utf8');
    expect(editor).toContain('<AcademyCycleManager user={user} />');
    expect(editor).toContain("academyAdminStartCycle");
    expect(editor).toContain("academyAdminReset");
    expect(editor).toContain("academyAdminHistory");
  });

  it('renders badge totals from canonical award history, not completed-cycle arithmetic', () => {
    const academy = readFileSync('src/pages/AcademyPage.tsx', 'utf8');
    expect(academy).toContain('awardCounts.bronze');
    expect(academy).toContain('awardCounts.silver');
    expect(academy).toContain('awardCounts.gold');
    expect(academy).not.toContain('Math.floor(completedCycles / 2)');
    expect(academy).not.toContain('Math.floor(completedCycles / 3)');
  });
});
