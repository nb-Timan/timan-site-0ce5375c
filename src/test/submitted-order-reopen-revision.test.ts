import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20260917094832_submitted_order_revision_history.sql';

describe('Backend submitted-order reopen and revision flow', () => {
  it('keeps correction history in the existing session/audit model and exposes it only to Backend', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('list_submitted_configurator_order_corrections');
    expect(migration).toContain('from public.configurator_order_correction_sessions s');
    expect(migration).toContain('if not public.is_timan_backend() then');
    expect(migration).toContain('before_snapshot jsonb');
    expect(migration).toContain('after_snapshot jsonb');
    expect(migration).toContain('actor_name text');
    expect(migration).toContain('left join public.app_users au on au.id = s.actor_user_id');
    expect(migration).toContain('row_number() over (order by s.started_at)::bigint');
    expect(migration).toContain('revoke all on function public.list_submitted_configurator_order_corrections(uuid) from public, anon');
    expect(migration).toContain('grant execute on function public.list_submitted_configurator_order_corrections(uuid) to authenticated');
    expect(migration).not.toContain('create table');
  });

  it('makes the CRM reopen and revision controls available only in the effective full Backend context', () => {
    const page = readFileSync('src/pages/crm/CrmQuotesOrdersPage.tsx', 'utf8');

    expect(page).toContain("const canReopenSubmittedOrder = isBackendFull && mode === 'order';");
    expect(page).toContain('navigate(`${configuratorHref}&orderCorrection=1`)');
    expect(page).toContain('SubmittedOrderRevisionHistoryModal');
    expect(page).toContain('setRevisionRow(r)');
  });

  it('keeps the existing order number and opens the correction dialog after the canonical deep link restores the order', () => {
    const page = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');

    expect(page).toContain("searchParams.get('orderCorrection') === '1' && canCorrectSubmittedOrder");
    expect(page).toContain("next.delete('orderCorrection')");
    expect(page).toContain('if (orderLocked && !backendCorrectionSessionId)');
    expect(page).toContain('if (!activeOrderNumber)');
    expect(page).toContain('resend: Boolean(backendCorrectionSessionId)');
    expect(page).toContain('completeSubmittedOrderCorrection(backendCorrectionSessionId)');
    expect(page).toContain('Gem ændring');
    expect(page).toContain('Gem og opret ny ordrebekræftelse');
    expect(page).toContain('Gem og send ny ordrebekræftelse');
  });

  it('preserves the original order number and submission timestamp while an explicit resend updates sent-at', () => {
    const service = readFileSync('src/lib/configurationsService.ts', 'utf8');
    const fn = service.slice(service.indexOf('export async function markAsOrderSubmitted'));

    expect(fn).toContain('options?.resend');
    expect(fn).toContain("const existingOrderNumber = (rowSnapshot?.order_number as string | null) ?? null");
    expect(fn).toContain('const orderNumber = existingOrderNumber || options?.orderNumber');
    expect(fn).toContain('submitted_at: submittedAt');
    expect(fn).toContain('order_sent_at: orderSentAt');
  });

  it('captures a price baseline for new submitted orders and requires an explicit Backend decision before a legacy order is repriced', () => {
    const service = readFileSync('src/lib/configurationsService.ts', 'utf8');
    const page = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');

    expect(service).toContain('createConfiguratorPricingSnapshot');
    expect(service).toContain('isInitialOrderSubmission && !state.pricingSnapshot');
    expect(service).toContain('configuratorPricingSignature(state)');
    expect(service).toContain('if (hasFrozenConfiguratorPricing(state)) return state;');
    expect(service).toContain('submittedOrder && !stateForPersistence.pricingSnapshot');
    expect(service).toContain('isLegacySubmittedOrder');
    expect(page).toContain('requiresLegacyOrderReprice');
    expect(page).toContain('legacyOrderRepriceApproved');
    expect(page).toContain('Jeg accepterer, at den ved denne rettelse opdateres til de nuværende katalogpriser');
  });
});
