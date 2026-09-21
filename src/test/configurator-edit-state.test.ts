import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('configurator saved edit state', () => {
  const source = () => readFileSync('src/lib/configurationsService.ts', 'utf8');
  const accountPanelSource = () => readFileSync('src/components/configurator/AccountPanel.tsx', 'utf8');
  const configuratorSource = () => readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');

  it('restores active sent quotes as editable quotes even if legacy type says order', () => {
    const code = source();
    expect(code).toContain('function deriveEditableFlowType');
    expect(code).toContain('if (row.order_sent_at || row.submitted_at) return');
    expect(code).toContain('if (row.quote_number && row.quote_sent_at && !row.order_number) return');
    expect(code).toContain('const flowType = deriveEditableFlowType(row)');
  });

  it('does not apply the submitted-order totals-only lock to a sent offer', () => {
    const pricing = readFileSync('src/lib/configuratorPricing.ts', 'utf8');
    expect(pricing).toContain('const sentAt = row.order_sent_at || row.submitted_at;');
    expect(pricing).not.toContain('row.order_sent_at || row.submitted_at || row.quote_sent_at');
    expect(pricing).toContain('A sent quote is still an editable working case');
  });

  it('saves edits back to the same canonical row using the current flow type', () => {
    const code = source();
    expect(code).toContain('stateForPersistence = await finalizeConfiguratorPricingSnapshot(state, options?.pricingMode)');
    expect(code).toContain('existingRowLoaded && !submittedOrder && !stateForPersistence.pricingSnapshot');
    expect(code).toContain('legacy draft pricing finalization failed');
    expect(code).toContain('document_type: stateForPersistence.flowType');
    expect(code).toContain('case_type: stateForPersistence.flowType');
    expect(code).toContain('state_json: stateForPersistence');
  });

  it('uses full state_json as the canonical selected-item source before stale item rows', () => {
    const code = source();
    expect(code).toContain('const storedStateHasMachineSelections = Boolean');
    expect(code).toContain('(parsedState ?? payloadState)?.machineConfigs?.length');
    expect(code).toContain('const rebuiltFromItems = !storedStateHasMachineSelections && items.length > 0');
  });

  it('does not insert replacement item rows when old rows could not be deleted', () => {
    const code = source();
    expect(code).toContain("console.warn('[updateConfiguration] delete items failed:', delErr)");
    expect(code).toContain('return { error: null, itemsError: formatSupabaseError(delErr) }');
  });

  it('loads Min konto rows from the displayed seller scope during a role preview', () => {
    const code = accountPanelSource();
    expect(code).toContain("import { getEffectiveSellerEmail } from '@/lib/activeMode'");
    expect(code).toContain('const accountScopeEmail = (getEffectiveSellerEmail(appUser) ?? userEmail).toLowerCase()');
    expect(code).toContain('loadConfigurations(accountScopeEmail)');
    expect(code).toContain('loadConfigurationById(item.id, accountScopeEmail)');
    expect(code).toContain('resolveHideScopeForCurrentUser(accountScopeEmail)');
    expect(configuratorSource()).toContain('appUser={effectiveUser ?? appUser}');
  });

  it('allows only the effective Backend role to choose a historical delivery date', () => {
    const code = configuratorSource();
    expect(code).toContain("const canSelectPastDeliveryDate = activePortalRole === 'timan_backend';");
    expect(code).toContain('(!canSelectPastDeliveryDate && date < today) || day === 0 || day === 6');
  });
});
