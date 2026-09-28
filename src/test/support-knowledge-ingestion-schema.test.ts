import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20260927135312_support_knowledge_ingestion.sql', 'utf8');
const lifecycleMigration = readFileSync('supabase/migrations/20260927150500_support_knowledge_current_source_lifecycle.sql', 'utf8');
const edge = readFileSync('supabase/functions/support-knowledge-ingestion/index.ts', 'utf8');

describe('Phase 4 additive schema', () => {
  it('keeps Phase 3 canonical knowledge and adds every ingestion relation', () => {
    for (const table of [
      'support_knowledge_sources', 'support_ingestion_runs', 'support_knowledge_chunks',
      'support_knowledge_index_states', 'support_knowledge_item_machines',
      'support_knowledge_item_products', 'support_controlled_source_registry', 'support_ingestion_events',
    ]) expect(migration).toContain(`create table public.${table}`);
    expect(migration).toContain('references public.support_knowledge_items');
    expect(migration).not.toContain('drop table public.support_knowledge_items');
  });

  it('separates content, ingestion and index states', () => {
    expect(migration).toContain("'READY_FOR_REVIEW'");
    expect(migration).toContain("'NOT_INDEXED'");
    expect(migration).toContain("'INDEXED'");
    expect(migration).not.toContain('vector(');
    expect(migration).not.toMatch(/\bembedding\s+(vector|jsonb|text|bytea)/i);
  });

  it('creates a private immutable bucket and canonical Support RLS', () => {
    expect(migration).toContain("'support-knowledge'");
    expect(migration).toContain('false,');
    expect(migration).toContain('public.can_access_support()');
    expect(migration).toContain('grant select on public.support_knowledge_sources to authenticated');
    expect(migration).not.toContain('grant select, insert, update, delete on public.support_knowledge_sources');
    expect(migration).not.toContain('storage.objects for delete');
  });

  it('restricts the controlled URL registry to Timan-owned domains', () => {
    expect(migration).toContain("lower(domain) in ('timan.dk', 'www.timan.dk')");
    expect(edge).not.toMatch(/fetch\([^)]*original_url/);
  });

  it('activates only the latest ready source while human knowledge is approved', () => {
    expect(lifecycleMigration).toContain("new.status = 'APPROVED'");
    expect(lifecycleMigration).toContain("s.ingestion_status = 'READY_FOR_REVIEW'");
    expect(lifecycleMigration).toContain('order by s.revision desc');
    expect(lifecycleMigration).toContain('is_current = (s.id = v_source_id)');
    expect(lifecycleMigration).toContain('set is_current = false');
  });
});

describe('Phase 4 server processing boundary', () => {
  it('validates real JWT access and keeps the service role server-side', () => {
    expect(edge).toContain("auth.getUser()");
    expect(edge).toContain("rpc('can_access_support')");
    expect(edge).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
    expect(edge).toContain('EdgeRuntime.waitUntil');
  });

  it('uses hashes, immutable revisions and append-only processing runs', () => {
    expect(edge).toContain('rawHash = await sha256Hex(bytes)');
    expect(edge).toContain(".eq('raw_sha256', rawHash)");
    expect(edge).toContain('supersedes_source_id');
    expect(edge).toContain("run_reason: reason");
    expect(edge).not.toContain('.delete().eq(\'knowledge_source_id\'');
  });

  it('does not integrate AI, embeddings or arbitrary crawling', () => {
    expect(edge).not.toMatch(/openai|anthropic|embedding|pgvector/i);
    expect(edge).not.toContain('original_url');
  });
});
