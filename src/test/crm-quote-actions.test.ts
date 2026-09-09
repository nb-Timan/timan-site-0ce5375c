import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CRM quote actions', () => {
  it('renders explicit configurator and canonical lead actions for quotes', () => {
    const page = readFileSync('src/pages/crm/CrmQuotesOrdersPage.tsx', 'utf8');

    expect(page).toContain("col_actions: { da: 'Handling'");
    expect(page).toContain("open_configurator: { da: 'Åbn i Configurator'");
    expect(page).toContain("open_lead: { da: 'Åbn Lead'");
    expect(page).toContain('getCrmConfigurationLeadDeepLink(r)');
  });

  it('disables the lead action rather than guessing when a quote has no lead', () => {
    const page = readFileSync('src/pages/crm/CrmQuotesOrdersPage.tsx', 'utf8');

    expect(page).toContain('disabled={!leadHref}');
    expect(page).toContain('T.no_linked_lead[lang]');
  });
});
