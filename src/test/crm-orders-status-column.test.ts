import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CrmConfigurationRow } from '@/lib/crmConfigurationsService';
import {
  buildCrmDocumentStatuses,
  crmDocumentStatus,
  showCrmDocumentStatusColumn,
} from '@/lib/crmDocumentListFilters';
import { PORTAL_LANGUAGES } from '@/lib/portalLanguages';

const submittedOrder = {
  case_status: 'ordre_afgivet',
  status: 'ordre_afgivet',
  order_sent_at: '2026-10-01T10:00:00.000Z',
  submitted_at: '2026-10-01T10:00:00.000Z',
} as CrmConfigurationRow;

describe('CRM orders status-column presentation', () => {
  it('hides the redundant status header and cell for orders but keeps them for quotes', () => {
    expect(showCrmDocumentStatusColumn('order')).toBe(false);
    expect(showCrmDocumentStatusColumn('quote')).toBe(true);

    const page = readFileSync('src/pages/crm/CrmQuotesOrdersPage.tsx', 'utf8');
    expect(page).toContain('{showStatusColumn && <th className="text-left px-3 py-2 font-semibold">{T.col_status[lang]}</th>}');
    expect(page).toContain('{showStatusColumn && (');
    expect(page).not.toContain("mode === 'order' && <th className=\"text-left px-3 py-2 font-semibold\">{T.col_status[lang]}</th>");
  });

  it('keeps canonical submitted status and the existing status filter source unchanged', () => {
    expect(crmDocumentStatus(submittedOrder, 'order')).toBe('submitted');
    expect(buildCrmDocumentStatuses([submittedOrder], 'order')).toEqual(['submitted']);
  });

  it('applies the presentation rule independently of all nine portal languages', () => {
    expect(PORTAL_LANGUAGES).toHaveLength(9);
    for (const language of PORTAL_LANGUAGES) {
      expect(language).toBeTruthy();
      expect(showCrmDocumentStatusColumn('order')).toBe(false);
    }
  });
});
