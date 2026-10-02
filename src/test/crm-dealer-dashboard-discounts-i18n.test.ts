import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CRM_DEALER_DASHBOARD_TRANSLATIONS } from '@/lib/i18n/crmDealerDashboardTranslations';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

const languages: PortalUiLanguage[] = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'];
const migration = readFileSync(
  'supabase/migrations/20261002060226_canonical_dealer_dashboard_discount_amounts.sql',
  'utf8',
);
const component = readFileSync('src/components/crm/DealerSalesDashboardPrototype.tsx', 'utf8');

describe('CRM dealer dashboard canonical discount amounts', () => {
  it('reads typed amounts from the immutable current order revision', () => {
    expect(migration).toContain("latest_revision.after_snapshot -> 'configuration'");
    expect(migration).toContain("original_revision.before_snapshot -> 'configuration'");
    expect(migration).toContain("frozen_state -> 'pricingSnapshot' -> 'discountDetails'");
    expect(migration).toContain("detail ->> 'kind' in ('dealer', 'direct')");
    expect(migration).toContain("detail ->> 'kind' in ('payment', 'delivery')");
    expect(migration).not.toMatch(/price_list_items|product_master/i);
  });

  it('only resolves a legacy final extra discount from frozen net and percent', () => {
    expect(migration).toContain('c.net_value * c.legacy_extra_discount_pct / (100 - c.legacy_extra_discount_pct)');
    expect(migration).toContain('and not c.has_demo_machine');
    expect(migration).toContain("then 'legacy_frozen_totals'");
  });

  it('distinguishes a canonical zero from unavailable historical components', () => {
    expect(migration).toContain('extra_discount_available');
    expect(migration).toContain('payment_delivery_discount_available');
    expect(migration).toContain('extra_discount_missing_count');
    expect(migration).toContain('payment_delivery_discount_missing_count');
    expect(migration).toMatch(/when c\.legacy_extra_discount_pct = 0 then 0/);
  });

  it('uses the same submitted-order set for summary and detail parity', () => {
    expect(migration).toContain("order_rows as (\n    select * from rows where record_kind = 'order'");
    expect(migration).toContain("'total_count', (select count(*) from display_rows)");
    expect(migration).toContain('select * from display_rows');
    expect(migration).toContain("'extra_discount_value', extra_discount_value");
    expect(migration).toContain("'payment_delivery_discount_value', payment_delivery_discount_value");
  });

  it('normalizes DKK, EUR and combined values with the established rate', () => {
    expect(migration).toContain("when v_display_currency = 'EUR' then o.net_dkk / 7.46");
    expect(migration).toContain("when o.source_currency = 'EUR' then o.extra_discount_value * 7.46");
    expect(migration).toContain("v_display_currency not in ('DKK', 'EUR', 'BOTH')");
  });

  it('keeps Backend and seller scope enforcement in the server function', () => {
    expect(migration).toContain("v_role in ('timan_backend', 'timan_service')");
    expect(migration).toContain("v_role = 'timan_seller'");
    expect(migration).toContain('c.assigned_seller_id = v_subject.id');
    expect(migration).toContain('Only Timan Backend may use a view-as dashboard scope');
  });
});

describe('CRM dealer dashboard 9-language UI', () => {
  it('provides the complete dashboard dictionary in all portal languages', () => {
    const canonicalKeys = Object.keys(CRM_DEALER_DASHBOARD_TRANSLATIONS.da).sort();
    expect(canonicalKeys.length).toBeGreaterThan(80);
    for (const language of languages) {
      expect(Object.keys(CRM_DEALER_DASHBOARD_TRANSLATIONS[language]).sort()).toEqual(canonicalKeys);
      expect(t('crmDealerDashPaymentDeliveryDiscount', language)).not.toBe('crmDealerDashPaymentDeliveryDiscount');
    }
  });

  it.each([
    ['da', 'Betalings-/leveringsrabat'],
    ['en', 'Payment/delivery discount'],
    ['de', 'Zahlungs-/Lieferungsrabatt'],
    ['it', 'Sconto pagamento/consegna'],
    ['hu', 'Fizetési/szállítási kedvezmény'],
    ['sv', 'Betalnings-/leveransrabatt'],
    ['fr', 'Remise paiement/livraison'],
    ['pl', 'Rabat płatniczy/dostawczy'],
    ['cs', 'Sleva za platbu/dodání'],
  ] as const)('localizes the longest KPI label in %s', (language, expected) => {
    expect(t('crmDealerDashPaymentDeliveryDiscount', language)).toBe(expected);
  });

  it('does not leave the observed Danish labels hardcoded in the dashboard component', () => {
    for (const label of ['Hurtigvalg', 'Denne måned', 'Omsætning total', 'Top 10 forhandlere', 'Ordre- og rabatdetaljer']) {
      expect(component).not.toContain(`>${label}<`);
      expect(component).not.toContain(`title="${label}"`);
    }
    expect(t('crmDealerDashQuickSelect', 'de')).toBe('Schnellauswahl');
    expect(t('crmDealerDashTopDealer', 'de')).toBe('Top-Händler');
  });

  it('keeps long KPI titles inside a stable two-line header area', () => {
    expect(component).toContain('min-h-[142px]');
    expect(component).toContain('min-h-8 min-w-0 flex-1');
    expect(component).toContain('leading-4');
    expect(component).toContain('sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8');
  });

  it('keeps Top 10 in-bar labels and localized dates', () => {
    expect(component).toContain('shape={<DealerBarShape');
    expect(component).toContain('formatRevenueSeriesPoint(point, uiLanguage)');
    expect(component).toContain('formatDashboardDate(row.date, "day", uiLanguage)');
  });
});
