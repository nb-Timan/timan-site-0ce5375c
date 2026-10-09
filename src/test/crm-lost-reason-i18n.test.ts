import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import {
  CRM_LOST_REASON_CODES,
  classifyCrmLostReason,
  crmLostReasonLabel,
  normalizeCrmLostReason,
  serializeCrmLostReason,
} from '@/lib/crmLostReason';

const PORTAL_LANGUAGES: PortalUiLanguage[] = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'];

describe('CRM lost deal reason localization', () => {
  it('keeps one language-neutral canonical option list with NOT_RELEVANT last', () => {
    expect(CRM_LOST_REASON_CODES).toEqual([
      'PRICE',
      'DELIVERY_TIME',
      'MACHINE_TOO_SMALL',
      'MACHINE_TOO_LARGE',
      'USED_MACHINE_INSTEAD',
      'BUDGET_OR_PROJECT_CANCELLED',
      'NOT_RELEVANT',
    ]);
  });

  it('renders the required Danish labels', () => {
    expect(CRM_LOST_REASON_CODES.map((code) => crmLostReasonLabel(code, 'da'))).toEqual([
      'Pris',
      'Leveringstid',
      'Maskinen var for lille',
      'Maskinen var for stor',
      'Kunden valgte en brugt maskine i stedet',
      'Budgettet blev ændret eller projektet blev aflyst',
      'Ikke relevant',
    ]);
  });

  it('renders English and German labels without changing the selected code', () => {
    const selected = 'MACHINE_TOO_SMALL';
    expect(crmLostReasonLabel(selected, 'en')).toBe('Machine was too small');
    expect(crmLostReasonLabel(selected, 'de')).toBe('Die Maschine war zu klein');
    expect(normalizeCrmLostReason(selected)).toBe(selected);
  });

  it('has a non-empty localized label for every option in all nine portal languages', () => {
    for (const language of PORTAL_LANGUAGES) {
      for (const code of CRM_LOST_REASON_CODES) {
        expect(crmLostReasonLabel(code, language).trim()).not.toBe('');
        expect(crmLostReasonLabel(code, language)).not.toBe(code);
      }
    }
  });

  it('normalizes historical English values to canonical codes', () => {
    expect(normalizeCrmLostReason('Price')).toBe('PRICE');
    expect(normalizeCrmLostReason('Delivery time')).toBe('DELIVERY_TIME');
    expect(normalizeCrmLostReason('Machine too small')).toBe('MACHINE_TOO_SMALL');
    expect(normalizeCrmLostReason('Machine too large')).toBe('MACHINE_TOO_LARGE');
    expect(normalizeCrmLostReason('Customer found a used machine instead')).toBe('USED_MACHINE_INSTEAD');
    expect(normalizeCrmLostReason('Budget changed or project was cancelled')).toBe('BUDGET_OR_PROJECT_CANCELLED');
  });

  it('persists NOT_RELEVANT explicitly and keeps missing answers null', () => {
    expect(serializeCrmLostReason('NOT_RELEVANT')).toBe('NOT_RELEVANT');
    expect(serializeCrmLostReason('Not relevant')).toBe('NOT_RELEVANT');
    expect(serializeCrmLostReason('')).toBeNull();
    expect(serializeCrmLostReason(null)).toBeNull();
  });

  it('keeps NOT_RELEVANT separate from missing, unknown, competitor and other reporting', () => {
    expect(classifyCrmLostReason('NOT_RELEVANT')).toBe('not_relevant');
    expect(classifyCrmLostReason('Not relevant')).toBe('not_relevant');
    expect(classifyCrmLostReason(null)).toBe('other');
    expect(classifyCrmLostReason('Unknown legacy reason')).toBe('other');
    expect(classifyCrmLostReason('Lost to competitor')).toBe('comp');
  });

  it('wires both Lost Deal surfaces to the shared helper without changing competitor options', () => {
    const overview = readFileSync('src/pages/crm/CrmLeadsPage.tsx', 'utf8');
    const detail = readFileSync('src/pages/crm/CrmNewLeadPage.tsx', 'utf8');
    const service = readFileSync('src/lib/crmLeadsService.ts', 'utf8');

    expect(overview).toContain('crmLostReasonLabel(o, lang)');
    expect(detail).toContain('crmLostReasonLabel(o, uiLanguage)');
    expect(overview).toContain('lost_reason: serializeCrmLostReason(reason)');
    expect(detail).toContain('lost_reason: isLost ? serializeCrmLostReason(lostReason) : null');
    expect(service).toContain('CRM_LOST_REASON_CODES as LOST_REASON_OPTIONS');
    expect(service).not.toMatch(/LOST_COMPETITOR_OPTIONS[\s\S]{0,300}NOT_RELEVANT/);
  });
});
