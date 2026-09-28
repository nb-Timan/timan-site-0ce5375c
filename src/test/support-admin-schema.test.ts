import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20260927124706_support_admin_foundation.sql', 'utf8');
const page = readFileSync('src/pages/backend/BackendAiSupportPage.tsx', 'utf8');
const routes = readFileSync('src/App.tsx', 'utf8');
const service = readFileSync('src/lib/supportAdminService.ts', 'utf8');
const actorAuditMigration = readFileSync('supabase/migrations/20260927133648_support_knowledge_actor_audit.sql', 'utf8');

describe('Support administration database foundation', () => {
  it('creates normalized question, feedback, knowledge, traceability and usage structures', () => {
    for (const table of [
      'support_conversations', 'support_questions', 'support_responses', 'support_feedback',
      'support_retrieval_events', 'support_response_sources', 'support_knowledge_gaps',
      'support_knowledge_items', 'support_usage_events',
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.%I enable row level security`);
    }
    expect(migration).not.toMatch(/\bembedding\s+vector\s*\(/);
    expect(migration).not.toContain('openai');
  });

  it('reuses canonical Support authorization for every Data API operation', () => {
    expect(migration).toContain("table_name || '_support_select'");
    expect(migration).toContain("table_name || '_support_insert'");
    expect(migration).toContain("table_name || '_support_update'");
    expect(migration).toContain("table_name || '_support_delete'");
    expect(migration.match(/public\.can_access_support\(\)/g)?.length).toBeGreaterThanOrEqual(5);
    expect(migration).toContain('revoke all on table public.%I from public, anon, authenticated');
    expect(migration).toContain('revoke all on function public.support_touch_updated_at() from public, anon, authenticated, service_role');
    expect(migration).toContain('revoke all on function public.support_validate_knowledge_lifecycle() from public, anon, authenticated, service_role');
  });

  it('protects the overview RPC and contains no fabricated rows', () => {
    expect(migration).toContain('public.get_support_admin_overview()');
    expect(migration).toContain("raise exception 'Support administration access denied'");
    expect(migration).toContain('grant execute on function public.get_support_admin_overview() to authenticated');
    expect(migration).not.toMatch(/insert\s+into\s+public\.support_/i);
  });

  it('provides indexes, lifecycle constraints and provider-neutral observability fields', () => {
    expect(migration).toContain('support_questions_search_idx');
    expect(migration).toContain('support_knowledge_items_search_idx');
    expect(migration).toContain('support_validate_knowledge_lifecycle');
    expect(migration).toContain('input_tokens integer');
    expect(migration).toContain('output_tokens integer');
    expect(migration).toContain('cached_tokens integer');
    expect(migration).toContain('estimated_cost numeric');
    expect(migration).not.toMatch(/gpt-|price_per_token|token_price/i);
  });

  it('derives knowledge creator and approver identities from the authenticated actor', () => {
    expect(actorAuditMigration).toContain('new.created_by_user_id := v_actor_user_id');
    expect(actorAuditMigration).toContain('new.approved_by_user_id := v_actor_user_id');
    expect(actorAuditMigration).toContain("u.auth_user_id = auth.uid()");
    expect(actorAuditMigration).toContain("lower(u.email) = lower(nullif(auth.jwt() ->> 'email', ''))");
    expect(service).not.toContain('created_by_user_id: actorUserId');
    expect(service).not.toContain('approved_by_user_id:');
  });
});

describe('Support administration route foundation', () => {
  it('guards the direct route with both client mirror and server RPC', () => {
    expect(routes).toContain('/portal/backend/ai-support');
    expect(page).toContain('canAccessSupport(effectiveUser)');
    expect(page).toContain('verifySupportAccess(effectiveUser)');
    expect(page).toContain('<Navigate to="/portal/backend" replace />');
  });

  it('exposes all six required administration views', () => {
    for (const tab of ['overview', 'questions', 'unanswered', 'feedback', 'knowledge', 'observability']) {
      expect(page).toContain(`'${tab}'`);
    }
  });
});
