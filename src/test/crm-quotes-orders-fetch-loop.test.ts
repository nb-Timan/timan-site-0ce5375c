import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CRM quotes/orders fetch stability', () => {
  it('does not refetch from an unstable effectiveUser object dependency', () => {
    const source = readFileSync('src/pages/crm/CrmQuotesOrdersPage.tsx', 'utf8');
    expect(source).toContain('effectiveUserEmail');
    expect(source).toContain('effectiveDealerNumber');
    expect(source).not.toContain('effectiveUser, portalRole, mode, isSeller, reloadKey');
  });
});
