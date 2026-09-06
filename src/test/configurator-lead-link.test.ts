import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('configurator existing lead protection', () => {
  const configurator = () => readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
  const picker = () => readFileSync('src/components/configurator/LeadLinkPicker.tsx', 'utf8');
  const service = () => readFileSync('src/lib/configurationsService.ts', 'utf8');

  it('locks the lead picker and hides new-lead actions for a saved linked configuration', () => {
    const code = configurator();
    expect(code).toContain('const existingConfigurationLeadLocked = Boolean(savedConfigurationId && linkedLeadId)');
    expect(code).toContain('const canCreateLeadForCurrentConfiguration = !savedConfigurationId && !linkedLeadId');
    expect(code).toContain('readOnly={Boolean(savedConfigurationId)}');
    expect(code).toContain('canCreateLeadForCurrentConfiguration &&');
  });

  it('renders the existing relation as read-only instead of offering a new lead', () => {
    const code = picker();
    expect(code).toContain('if (readOnly)');
    expect(code).toContain('L.linked[language]');
    expect(code).toContain('getLead(value)');
  });

  it('keeps persisted lead_id over any edit-time client value', () => {
    const code = service();
    expect(code).toContain(".select('internal_note, note, pdf_downloaded, pdf_downloaded_at, lead_id')");
    expect(code).toContain('let persistedLeadId: string | null = null');
    expect(code).toContain('persistedLeadId = ((row as Record<string, unknown>).lead_id as string | null) ?? null');
    expect(code).toContain('...(persistedLeadId');
    expect(code).toContain('? { lead_id: persistedLeadId }');
  });
});
