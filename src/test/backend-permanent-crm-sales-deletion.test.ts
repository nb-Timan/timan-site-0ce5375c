import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260922060809_backend_permanent_crm_sales_deletion.sql',
  'utf8',
);
const configurationService = readFileSync('src/lib/crmConfigurationsService.ts', 'utf8');
const leadService = readFileSync('src/lib/crmLeadsService.ts', 'utf8');
const documentsPage = readFileSync('src/pages/crm/CrmQuotesOrdersPage.tsx', 'utf8');
const leadsPage = readFileSync('src/pages/crm/CrmLeadsPage.tsx', 'utf8');

function functionBody(name: string, nextName: string): string {
  const start = migration.indexOf(`function public.${name}`);
  const end = migration.indexOf(`function public.${nextName}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe('Backend permanent CRM sales deletion', () => {
  it('uses a server-side Backend-only document deletion path instead of a soft-delete status update', () => {
    const documentDelete = functionBody('delete_crm_sales_document', 'delete_crm_lead_permanently');

    expect(documentDelete).toContain('security definer');
    expect(documentDelete).toContain('if not public.is_timan_backend()');
    expect(documentDelete).toContain("raise exception 'Only Timan Backend can permanently delete CRM quotes and orders'");
    expect(documentDelete).toContain("delete from public.configurations where id = target.id");
    expect(documentDelete).toContain("perform set_config('app.backend_permanent_document_delete', target.id::text, true)");
    expect(documentDelete).not.toContain("case_status = 'deleted'");
    expect(configurationService).toContain("deleteCrmRecordPermanently('document', id)");
    expect(configurationService).not.toContain('softDeleteConfiguration');
  });

  it('permits submitted-order deletion only for the scoped Backend RPC', () => {
    expect(migration).toContain("current_setting('app.backend_permanent_document_delete', true) = old.id::text");
    expect(migration).toContain("current_setting('app.backend_permanent_document_delete', true) = target.id::text");
    expect(migration).toContain('and public.is_timan_backend() then');
    expect(migration).toContain("raise exception 'Submitted configurator orders are read-only'");
  });

  it('removes document-local rows but deliberately preserves the linked lead and append-only audit', () => {
    const documentDelete = functionBody('delete_crm_sales_document', 'delete_crm_lead_permanently');

    expect(documentDelete).toContain('delete from public.configuration_items where configuration_id = target.id');
    expect(documentDelete).toContain('delete from public.crm_activities');
    expect(documentDelete).toContain('configuration_id = target.id');
    expect(documentDelete).toContain('configuration_user_hidden');
    expect(documentDelete).toContain('The linked CRM lead deliberately remains intact.');
    expect(documentDelete).not.toContain('delete from public.crm_leads');
    expect(documentDelete).toContain('Audit log rows are not');
  });

  it('deletes a lead with its own history while preserving independent quote/order records', () => {
    const leadDelete = migration.slice(migration.indexOf('function public.delete_crm_lead_permanently'));

    expect(leadDelete).toContain('if not public.is_timan_backend()');
    expect(leadDelete).toContain('update public.configurations');
    expect(leadDelete).toContain('set lead_id = null');
    expect(leadDelete).toContain('delete from public.crm_demo_leads');
    expect(leadDelete).toContain('delete from public.crm_calendar_activities');
    expect(leadDelete).toContain('delete from public.crm_activities');
    expect(leadDelete).toContain("meta ->> 'lead_id' = target.id::text");
    expect(leadDelete).toContain('delete from public.crm_leads where id = target.id');
    expect(leadDelete).toContain('audit_log deliberately remains append-only');
    expect(leadService).toContain("deleteCrmRecordPermanently('lead', id)");
  });

  it('denies direct browser RPC execution and verifies the Backend identity server-side', () => {
    for (const rpc of ['delete_crm_sales_document', 'delete_crm_lead_permanently']) {
      expect(migration).toContain(`revoke all on function public.${rpc}(uuid, uuid) from public, anon, authenticated`);
      expect(migration).toContain(`grant execute on function public.${rpc}(uuid, uuid) to service_role`);
    }
    const edge = readFileSync('supabase/functions/admin-crm-delete/index.ts', 'utf8');
    expect(edge).toContain('caller.auth.getUser()');
    expect(edge).toContain('isBackend !== true');
    expect(edge).toContain('p_actor_auth_user_id: user.id');
    expect(migration).toContain("coalesce(auth.jwt()->>'role', '') <> 'service_role'");
  });

  it('preserves sharing audit and prevents automatic replacement of a deliberately deleted lead', () => {
    expect(migration).toContain('drop constraint if exists crm_lead_share_audit_log_lead_id_fkey');
    const sync = functionBody('sync_sent_configuration_quote_to_lead', 'prevent_submitted_configurator_order_changes');
    expect(sync).toContain("current_setting('app.backend_permanent_lead_delete', true) = old.lead_id::text");
    expect(sync).toContain('public.ensure_sent_configuration_quote_lead(new.id)');
  });

  it('keeps permanent-delete controls Backend-only and makes the consequence explicit', () => {
    expect(documentsPage).toContain("const canDelete = isBackendFull;");
    expect(leadsPage).toContain("const canDelete = portalRole === 'timan_backend' && !getActiveSellerView(appUser?.email);");
    expect(documentsPage).toContain('Slet ordre permanent?');
    expect(documentsPage).toContain('Slet tilbud permanent?');
    expect(documentsPage).toContain('Ja, slet permanent');
    expect(leadsPage).toContain('Slet lead permanent?');
    expect(leadsPage).toContain('Ja, slet permanent');
  });
});
