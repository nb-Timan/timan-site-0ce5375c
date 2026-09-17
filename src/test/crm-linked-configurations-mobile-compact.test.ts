import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/pages/crm/CrmNewLeadPage.tsx', 'utf8');
const linkedConfigurations = page.slice(
  page.indexOf("Linkede konfigurationer / tilbud"),
  page.indexOf('{isEdit && editId && ('),
);

describe('CRM linked configurations mobile compact layout', () => {
  it('keeps the document, kind, title, date, sync action, and deep link visible on mobile', () => {
    expect(linkedConfigurations).toContain('grid-cols-[auto_minmax(0,1fr)]');
    expect(linkedConfigurations).toContain('{documentNumber}');
    expect(linkedConfigurations).toContain('{kindLabel}');
    expect(linkedConfigurations).toContain('{q.title || dealer}');
    expect(linkedConfigurations).toContain("toLocaleDateString('da-DK')");
    expect(linkedConfigurations).toContain('Synkronisér fra ${documentNumber}');
    expect(linkedConfigurations).toContain('getCrmConfigurationDeepLink(q)');
  });

  it('hides only the company, separate machine, and amount fields below the desktop breakpoint', () => {
    expect(linkedConfigurations).toContain('hidden text-xs text-gray-500 sm:block sm:truncate');
    expect(linkedConfigurations).toContain('hidden text-xs text-gray-500 tabular-nums sm:block');
    expect(linkedConfigurations).toContain('sm:flex sm:items-center sm:gap-3');
  });

  it('allows long mobile titles and actions to wrap without a horizontal row', () => {
    expect(linkedConfigurations).toContain('col-span-full min-w-0 break-words');
    expect(linkedConfigurations).toContain('flex flex-wrap items-center gap-x-3 gap-y-1');
    expect(linkedConfigurations).toContain('text-left text-xs font-semibold');
  });
});
