import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CRM order number columns', () => {
  it('renders separate order and originating quote numbers for orders', () => {
    const page = readFileSync('src/pages/crm/CrmQuotesOrdersPage.tsx', 'utf8');

    expect(page).toContain("col_order_number: { da: 'Ordrenr.'");
    expect(page).toContain("col_quote_number: { da: 'Tilbudsnr.'");
    expect(page).toContain("{r.quote_number || '—'}");
  });
});
