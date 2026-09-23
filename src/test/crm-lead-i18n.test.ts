import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  crmLeadActivityLabel,
  crmLeadChoiceLabel,
  crmLeadEquipmentGroupLabel,
  crmLeadStatusLabel,
  crmLeadText,
  localizeLeadHistoryBlock,
  localizeLeadHistoryText,
} from '@/lib/crmLeadI18n';
import { demoFlowText } from '@/lib/crmDemoFlowI18n';

describe('CRM Lead and Demo i18n', () => {
  it('renders German lead labels without Danish or English leakage', () => {
    expect(crmLeadText('nextActivity', 'de')).toBe('Nächste Aktivität');
    expect(crmLeadText('linkedTitle', 'de')).toBe('Verknüpfte Konfigurationen / Angebote');
    expect(crmLeadText('shareTitle', 'de')).toBe('Lead-Freigabe');
    expect(crmLeadText('leadHistory', 'de')).toBe('Lead-Verlauf');
    expect(crmLeadText('noNotes', 'de')).toBe('Noch keine Notizen.');
  });

  it('renders English lead labels without Danish or German leakage', () => {
    expect(crmLeadText('nextActivity', 'en')).toBe('Next activity');
    expect(crmLeadText('linkedTitle', 'en')).toBe('Linked configurations / quotes');
    expect(crmLeadText('shareTitle', 'en')).toBe('Lead sharing');
    expect(crmLeadText('leadHistory', 'en')).toBe('Lead history');
    expect(crmLeadText('noNotes', 'en')).toBe('No notes yet.');
  });

  it('localizes canonical activity and status keys without changing the keys', () => {
    const activity = 'Offer sent to the customer';
    const status = 'Tilbud sendt';
    expect(crmLeadActivityLabel(activity, 'de')).toBe('Angebot an Kunden gesendet');
    expect(crmLeadActivityLabel(activity, 'en')).toBe('Offer sent to customer');
    expect(crmLeadStatusLabel(status, 'de')).toBe('Angebot gesendet');
    expect(crmLeadStatusLabel(status, 'en')).toBe('Offer sent');
    expect(activity).toBe('Offer sent to the customer');
    expect(status).toBe('Tilbud sendt');
  });

  it('keeps the canonical Demo states localized through the existing source', () => {
    expect(demoFlowText('scheduled', 'de')).toBe('Demo geplant');
    expect(demoFlowText('awaiting', 'en')).toBe('Awaiting demo result');
    expect(demoFlowText('Hot lead', 'de')).toBe('Heißer Lead');
  });

  it('localizes machine grouping and canonical option values at render time', () => {
    expect(crmLeadEquipmentGroupLabel('Vinter redskaber', 'de')).toBe('Winteranbaugeräte');
    expect(crmLeadEquipmentGroupLabel('Vinter redskaber', 'en')).toBe('Winter equipment');
    expect(crmLeadChoiceLabel('Trade fair', 'de')).toBe('Messe');
    expect(crmLeadChoiceLabel('Trade fair', 'en')).toBe('Trade fair');
  });

  it('localizes only the known Configurator history pattern and preserves identifiers', () => {
    expect(localizeLeadHistoryText('Tilbud afgivet via konfiguratoren — T-4010', 'de'))
      .toBe('Angebot über den Konfigurator erstellt — T-4010');
    expect(localizeLeadHistoryText('Tilbud afgivet via konfiguratoren — T-4010', 'en'))
      .toBe('Offer created via the Configurator — T-4010');
    expect(localizeLeadHistoryBlock('AROLD\nTilbud afgivet via konfiguratoren — T-4010', 'de'))
      .toBe('AROLD\nAngebot über den Konfigurator erstellt — T-4010');
  });

  it('never translates arbitrary user-authored notes', () => {
    const userNote = 'Ulf taler med NT om dette';
    expect(localizeLeadHistoryText(userNote, 'de')).toBe(userNote);
    expect(localizeLeadHistoryText(userNote, 'en')).toBe(userNote);
  });

  it('wires the scoped Lead surfaces to the shared translation helper', () => {
    const detail = readFileSync('src/pages/crm/CrmNewLeadPage.tsx', 'utf8');
    const history = readFileSync('src/components/crm/CrmLeadHistoryPanel.tsx', 'utf8');
    expect(detail).toContain("crmLeadText('linkedTitle', uiLanguage)");
    expect(detail).toContain("crmLeadText('shareTitle', uiLanguage)");
    expect(detail).toContain('crmLeadStatusLabel(effectiveLeadStatus');
    expect(detail).toContain('localizedCatalogProductLabel(item, language)');
    expect(history).toContain('localizeLeadHistoryText(note.description, uiLanguage)');
  });
});
