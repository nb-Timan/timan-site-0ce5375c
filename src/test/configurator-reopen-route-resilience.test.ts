import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEmptyConfiguratorState, normalizeConfiguratorState } from '@/lib/configuratorState';

describe('Configurator reopen route resilience', () => {
  it('recovers a stale Configurator code-split chunk once instead of leaving the shared reopen route blank', () => {
    const app = readFileSync('src/App.tsx', 'utf8');

    expect(app).toContain('const CONFIGURATOR_CHUNK_RELOAD_KEY = "timan.configurator.chunk-reload"');
    expect(app).toContain('const ConfiguratorPage = lazyWithDynamicImportRecovery(');
    expect(app).toContain('CONFIGURATOR_CHUNK_RELOAD_KEY,');
    expect(app).toContain('sessionStorage.removeItem(reloadKey)');
    expect(app).toContain('sessionStorage.setItem(reloadKey, "1")');
  });

  it('keeps the canonical CRM deep link shared by offer and order reopen flows', () => {
    const crmConfigurations = readFileSync('src/lib/crmConfigurationsService.ts', 'utf8');
    const quotesOrders = readFileSync('src/pages/crm/CrmQuotesOrdersPage.tsx', 'utf8');

    expect(crmConfigurations).toContain('return `/configurator?configId=${encodeURIComponent(row.id)}`;');
    expect(quotesOrders).toContain('const configuratorHref = getCrmConfigurationDeepLink(r);');
    expect(quotesOrders).toContain('navigate(`${configuratorHref}&orderCorrection=1`)');
  });

  it('normalizes legacy offer snapshots with no newer customer or pricing fields', () => {
    const legacy = normalizeConfiguratorState({
      ...createEmptyConfiguratorState(),
      flowType: 'quote',
      paymentTerms: 'NET30',
      firmanavn: 'Legacy dealer',
      machineConfigs: [{ id: 'm0', type: 'Timan 3330', qty: 1, configMode: 'individual', acc: [] }],
      individualUnitConfigs: { m0_1: { acc: ['412594'] } },
    });

    expect(legacy.customerMode).toBe('manual');
    expect(legacy.manualCustomerDraft.firmanavn).toBe('Legacy dealer');
    expect(legacy.paymentTerms).toBe('NET30');
    expect(legacy.machineConfigs).toHaveLength(1);
    expect(legacy.individualUnitConfigs.m0_1.acc).toEqual(['412594']);
  });

  it('wraps Configurator rendering in a controlled fallback after recovery is exhausted', () => {
    const app = readFileSync('src/App.tsx', 'utf8');

    expect(app).toContain('class ConfiguratorRouteErrorBoundary');
    expect(app).toContain('Konfigurationen kunne ikke åbnes');
    expect(app).toContain('Den gemte konfiguration kunne ikke gendannes. Intet er blevet ændret.');
    expect(app).toContain('Prøv igen');
    expect(app).toContain('onClick={this.retry}');
    expect(app).toContain('<ConfiguratorRouteErrorBoundary><PortalLockGuard>');
  });

  it('initializes the Configurator language before customer-mode copy reads it', () => {
    const configurator = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');

    expect(configurator.indexOf('const lang = state.language;'))
      .toBeLessThan(configurator.indexOf('const customerModeCopy = CUSTOMER_MODE_COPY[lang];'));
  });
});
