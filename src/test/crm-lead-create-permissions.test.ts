import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { resolveCanonicalCrmLeadSellerId } from '@/lib/resolveSellerId';

const leadPage = readFileSync('src/pages/crm/CrmNewLeadPage.tsx', 'utf8');

describe('CRM lead canonical create persistence', () => {
  it('keeps a selected canonical app_users id without an email lookup', async () => {
    const resolver = vi.fn();

    await expect(resolveCanonicalCrmLeadSellerId({
      id: '62bcded5-562e-42fb-9a63-397af3e66572',
      email: 'jtn@timan.dk',
    }, 'jtn@timan.dk', resolver)).resolves.toBe('62bcded5-562e-42fb-9a63-397af3e66572');
    expect(resolver).not.toHaveBeenCalled();
  });

  it('never submits a preview fallback id and resolves the canonical session identity', async () => {
    const resolver = vi.fn(async (email: string) => email === 'jtn@timan.dk'
      ? '62bcded5-562e-42fb-9a63-397af3e66572'
      : null);

    await expect(resolveCanonicalCrmLeadSellerId({
      id: 'u-jtn',
      email: 'jakob@timan.dk',
    }, 'jtn@timan.dk', resolver)).resolves.toBe('62bcded5-562e-42fb-9a63-397af3e66572');
    expect(resolver).toHaveBeenNthCalledWith(1, 'jakob@timan.dk');
    expect(resolver).toHaveBeenNthCalledWith(2, 'jtn@timan.dk');
  });

  it('blocks save when no canonical app_users identity can be resolved', async () => {
    await expect(resolveCanonicalCrmLeadSellerId({
      id: 'u-jtn',
      email: 'jakob@timan.dk',
    }, 'jtn@timan.dk', async () => null)).resolves.toBeNull();
  });

  it('requires confirmed remote persistence before calendar sync in production', () => {
    expect(leadPage).toContain("if (res.source !== 'supabase')");
    expect(leadPage).toContain('getEffectiveSellerEmail(appUser)');
    expect(leadPage).toContain('effectiveSellerEmail.toLowerCase()');
    expect(leadPage).toContain("{ requireRemote: !repository.academy }");

    const createIndex = leadPage.indexOf('await repository.createLead(');
    const calendarIndex = leadPage.indexOf('await syncCrmLeadFollowupCalendarActivity({', createIndex);
    expect(createIndex).toBeGreaterThan(-1);
    expect(calendarIndex).toBeGreaterThan(createIndex);
  });
});
