import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261005095300_planning_supply_manual_import.sql', 'utf8');
const conflictGuard = readFileSync('supabase/migrations/20261005104048_planning_supply_import_conflict_guard.sql', 'utf8');
const quarantine = readFileSync('supabase/migrations/20261005163659_planning_supply_requires_action_quarantine.sql', 'utf8');
const unknownDateReporting = readFileSync('supabase/migrations/20261005175915_planning_supply_unknown_date_reporting.sql', 'utf8');
const perMachineIdempotency = readFileSync('supabase/migrations/20261005181200_planning_supply_import_per_machine_idempotency_fix.sql', 'utf8');
const service = readFileSync('src/lib/planningSupplyImport.ts', 'utf8');
const page = readFileSync('src/pages/PlanningPage.tsx', 'utf8');
const dialog = readFileSync('src/components/planning/PlanningSupplyImportDialog.tsx', 'utf8');
const translations = readFileSync('src/lib/i18n/planningTranslations.ts', 'utf8');

describe('Planning supply import server contract', () => {
  it('allows only active approved Backend users with Planning access to import', () => {
    expect(migration).toContain("u.portal_role::text = 'timan_backend'");
    expect(migration).toContain("'planning' = any(coalesce(u.allowed_areas");
    expect(migration).toContain("message = 'PLANNING_IMPORT_FORBIDDEN'");
    expect(migration).not.toContain("u.portal_role::text in ('timan_backend', 'timan_seller')");
    expect(page).toContain("{isPlanner && <PlanningSupplyImportDialog");
  });

  it('uses stable normalized serial identity and file-hash idempotency', () => {
    expect(migration).toContain('planning_supply_units_normalized_serial_unique');
    expect(quarantine).toContain('planning_supply_import_batches_file_item_unique');
    expect(quarantine).toContain('(source_system, source_file_sha256, item_number)');
    expect(quarantine).toContain("v_source_key := btrim(p_item_number) || ':' || v_serial_key");
    expect(quarantine).toContain("'alreadyImported', true");
    expect(perMachineIdempotency).toContain('planning_supply_import_batche_source_system_source_file_sha_key');
    expect(perMachineIdempotency).toContain('planning_supply_import_batches_file_item_unique');
    expect(perMachineIdempotency).toContain('source_file_sha256');
    expect(perMachineIdempotency).toContain('item_number');
  });

  it('derives commercial state from Portal and excludes sheet commercial values', () => {
    expect(migration).toContain('from public.warranty_registrations w');
    expect(migration).toContain("when v_portal_state = 'historical' then 'unavailable'");
    expect(migration).toContain("when v_has_hint and v_portal_state = 'none' then 'blocked'");
    const ingestPayload = migration.slice(migration.indexOf("v_unit_id := public.planning_ingest_supply_unit"),
      migration.indexOf("insert into public.planning_supply_import_batch_rows"));
    expect(ingestPayload).not.toContain('dealer_account_id');
    expect(ingestPayload).not.toContain('customer_name');
    expect(ingestPayload).not.toContain('source_comment');
    expect(ingestPayload).not.toContain('confirmed_customer_delivery_date');
    expect(service).not.toContain('dealer: row.');
  });

  it('keeps preview separate from the explicit confirming write', () => {
    expect(migration).toContain("if p_confirm then");
    expect(migration).toContain("'preview', not p_confirm");
    expect(migration).toContain('PLANNING_IMPORT_REQUIRES_CLEAN_PREVIEW');
    expect(service).toContain('confirm: boolean');
  });

  it('stores batch and row provenance without copying raw commercial text', () => {
    expect(migration).toContain('create table public.planning_supply_import_batches');
    expect(migration).toContain('create table public.planning_supply_import_batch_rows');
    expect(migration).toContain('source_row_number integer not null');
    expect(migration).not.toMatch(/planning_supply_import_batch_rows[\s\S]{0,500}dealer_name/);
    expect(migration).not.toMatch(/planning_supply_import_batch_rows[\s\S]{0,500}customer_name/);
  });

  it('derives past and future supply from the acceptance date', () => {
    expect(quarantine).toContain("when v_completed is null then 'in_production'");
    expect(quarantine).toContain("when v_completed <= p_as_of then 'available'");
    expect(quarantine).toContain("else 'incoming'");
    expect(quarantine).toContain("'completedCandidates', v_complete");
    expect(quarantine).toContain("'futureUnits', v_future");
    expect(quarantine).toContain("'plannedDateUnknown', v_unknown_date");
  });

  it('gives order, quote and historical Portal state precedence over free stock', () => {
    expect(migration.indexOf("then 'order'")).toBeLessThan(migration.indexOf("then 'quote'"));
    expect(migration).toContain("r.reservation_type = 'order'");
    expect(migration).toContain("r.reservation_type in ('soft_quote', 'locked_quote')");
    expect(migration).toContain("when v_portal_state = 'historical' then 'unavailable'");
  });

  it('resolves visible dealer and customer through the canonical Portal registry', () => {
    const details = migration.slice(migration.indexOf('create or replace function public.planning_get_unit_private_details'));
    expect(details).toContain('from public.warranty_registrations wr');
    expect(details).toContain('left join public.dealer_accounts wd');
    expect(details).toContain('coalesce(pd.company_name, wd.company_name)');
    expect(details).toContain('coalesce(u.customer_name, w.customer_name)');
  });

  it('marks uncorroborated commercial hints as blocked conflicts', () => {
    expect(quarantine).toContain("when v_has_hint and v_portal_state = 'none' then 'blocked'");
    expect(quarantine).toContain("v_conflict_reason := 'commercial_source_hint_without_portal_match'");
    expect(quarantine).toContain("'commercial_relation', 'portal_relation_missing'");
    expect(dialog).not.toContain('summary.conflicts === 0');
    expect(conflictGuard).toContain("if new.outcome = 'conflict' then");
    expect(quarantine).toContain("new.conflict_reason = 'commercial_source_hint_without_portal_match'");
    expect(quarantine).toContain("u.supply_status = 'blocked'");
  });

  it('keeps missing dates and P-numbers null without treating them as stock or incoming', () => {
    expect(quarantine).toContain("v_reference is not null and v_reference !~ '^S[0-9]+-[0-9]+$'");
    expect(quarantine).toContain('if extract(year from v_completed) = 1900 then v_completed := null');
    expect(quarantine).toContain('if v_year = 1900 then v_year := null');
    expect(quarantine).toContain("elsif v_supply_status = 'in_production' then v_unknown_date := v_unknown_date + 1");
  });

  it('reports missing dates independently while keeping conflicts quarantined', () => {
    expect(unknownDateReporting).toContain("row_data ->> 'productionCompletedAt' is null");
    expect(unknownDateReporting).toContain("row_data ->> 'portalState' = 'none'");
    expect(unknownDateReporting).toContain("'{summary,plannedDateUnknown}'");
    expect(unknownDateReporting).toContain('planning_process_supply_import_core');
    expect(unknownDateReporting).toContain('from public, anon, authenticated');
    expect(unknownDateReporting).not.toContain("supplyStatus' = 'in_production'");
  });

  it('keeps the manual file as an adapter into the shared canonical ingest function', () => {
    expect(migration).toContain("values ('manual_supply_import', false, 720)");
    expect(migration).toContain('public.planning_ingest_supply_unit(');
    expect(migration).toContain('planning_supply_unit_records');
  });

  it('shows parse, preview and explicit confirmation without writing on file selection', () => {
    expect(dialog).toContain('parsePlanningSupplyFile(next, itemNumber)');
    expect(dialog).toContain('onClick={() => void process(false)}');
    expect(dialog).toContain('onClick={() => void process(true)}');
    expect(dialog).not.toContain('processPlanningSupplyImport({\n        fileName: next.name');
  });

  it('keeps the existing Planning workspace and limits import UI to Backend', () => {
    expect(page).toContain("const isPlanner = portalRole === 'timan_backend'");
    expect(page).toContain('<PlanningMachineWorkspace');
    expect(page).toContain('<PlanningIncomingView');
    expect(page).toContain('<PlanningTimelineView');
    expect(page).toContain('{isPlanner && <PlanningSupplyImportDialog');
  });

  it('provides import labels for all nine Portal languages', () => {
    for (const language of ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs']) {
      expect(translations).toContain(`${language}: {`);
      expect(translations).toContain(`...PLANNING_IMPORT_TRANSLATIONS.${language}`);
    }
  });
});
