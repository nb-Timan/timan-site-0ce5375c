import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CRM order number columns', () => {
  it('renders separate order and originating quote numbers for orders', () => {
    const page = readFileSync('src/pages/crm/CrmQuotesOrdersPage.tsx', 'utf8');

    expect(page).toContain("col_order_number: { da: 'Ordrenr.'");
    expect(page).toContain("col_quote_number: { da: 'Tilbudsnr.'");
    expect(page).toContain("{r.quote_number || '—'}");
  });

  it('places expected delivery before created and sent dates on the order list', () => {
    const page = readFileSync('src/pages/crm/CrmQuotesOrdersPage.tsx', 'utf8');
    const expectedDelivery = page.indexOf("{mode === 'order' && <th className=\"text-left px-3 py-2 font-semibold\">{T.col_expected_delivery[lang]}</th>}");
    const created = page.indexOf("{T.col_created[lang]}");
    const sent = page.indexOf("{T.col_sent[lang]}");

    expect(expectedDelivery).toBeGreaterThan(-1);
    expect(expectedDelivery).toBeLessThan(created);
    expect(created).toBeLessThan(sent);
  });
});
