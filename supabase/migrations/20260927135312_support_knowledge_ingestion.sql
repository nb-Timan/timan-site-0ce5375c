-- Timan Assistant Phase 4: additive knowledge-source ingestion foundation.
-- Human lifecycle remains canonical in support_knowledge_items. This migration
-- adds immutable source revisions, processing history, chunks and future index
-- state without adding embeddings, retrieval or AI provider integration.

create table public.support_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  knowledge_item_id uuid not null references public.support_knowledge_items(id) on delete restrict,
  source_type text not null check (source_type in ('UPLOADED_PDF', 'PLAIN_TEXT', 'TIMAN_DK_REGISTRY')),
  revision integer not null check (revision > 0),
  original_filename text,
  original_url text,
  storage_bucket text,
  storage_path text,
  mime_type text,
  file_size bigint check (file_size is null or file_size > 0),
  raw_sha256 text check (raw_sha256 is null or raw_sha256 ~ '^[0-9a-f]{64}$'),
  normalized_content_hash text check (normalized_content_hash is null or normalized_content_hash ~ '^[0-9a-f]{64}$'),
  source_language text not null default 'da',
  source_published_at timestamptz,
  source_updated_at timestamptz,
  uploaded_by uuid references public.app_users(id) on delete set null,
  supersedes_source_id uuid references public.support_knowledge_sources(id) on delete restrict,
  is_current boolean not null default false,
  ingestion_status text not null default 'RECEIVED'
    check (ingestion_status in ('RECEIVED', 'QUEUED', 'PROCESSING', 'READY_FOR_REVIEW', 'FAILED', 'CANCELLED', 'SUPERSEDED')),
  duplicate_of_source_id uuid references public.support_knowledge_sources(id) on delete restrict,
  content_equivalent_source_id uuid references public.support_knowledge_sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (knowledge_item_id, revision),
  unique (storage_bucket, storage_path),
  check ((source_type = 'TIMAN_DK_REGISTRY') = (original_url is not null)),
  check ((storage_bucket is null) = (storage_path is null))
);

create table public.support_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  knowledge_source_id uuid not null references public.support_knowledge_sources(id) on delete restrict,
  status text not null default 'QUEUED'
    check (status in ('RECEIVED', 'QUEUED', 'PROCESSING', 'READY_FOR_REVIEW', 'FAILED', 'CANCELLED', 'SUPERSEDED')),
  run_reason text not null default 'UPLOAD'
    check (run_reason in ('UPLOAD', 'REPROCESS', 'RECHUNK')),
  processor_version text not null,
  processor_config jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  extraction_method text,
  page_count integer check (page_count is null or page_count >= 0),
  extracted_character_count integer check (extracted_character_count is null or extracted_character_count >= 0),
  chunk_count integer check (chunk_count is null or chunk_count >= 0),
  extracted_text text,
  detected_sections jsonb not null default '[]'::jsonb,
  warnings text[] not null default '{}',
  error_code text check (error_code is null or error_code in (
    'INVALID_FILE', 'UNSUPPORTED_FORMAT', 'EMPTY_CONTENT', 'DUPLICATE_SOURCE',
    'STORAGE_ERROR', 'OCR_REQUIRED', 'EXTRACTION_ERROR', 'OTHER'
  )),
  error_message_sanitized text,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.support_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  knowledge_item_id uuid not null references public.support_knowledge_items(id) on delete restrict,
  knowledge_source_id uuid not null references public.support_knowledge_sources(id) on delete restrict,
  ingestion_run_id uuid not null references public.support_ingestion_runs(id) on delete restrict,
  source_revision integer not null check (source_revision > 0),
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (length(btrim(content)) > 0),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  page_start integer check (page_start is null or page_start > 0),
  page_end integer check (page_end is null or page_end > 0),
  heading text,
  section_path text[] not null default '{}',
  language text not null,
  category_snapshot text,
  access_scope_snapshot text not null,
  required_area_snapshot text,
  required_module_snapshot text,
  created_at timestamptz not null default now(),
  unique (ingestion_run_id, chunk_index),
  check (page_start is null or page_end is null or page_end >= page_start)
);

create table public.support_knowledge_index_states (
  id uuid primary key default gen_random_uuid(),
  knowledge_source_id uuid not null unique references public.support_knowledge_sources(id) on delete restrict,
  ingestion_run_id uuid references public.support_ingestion_runs(id) on delete restrict,
  status text not null default 'NOT_INDEXED'
    check (status in ('NOT_INDEXED', 'QUEUED', 'INDEXING', 'INDEXED', 'STALE', 'FAILED')),
  status_reason text,
  indexed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.support_knowledge_item_machines (
  knowledge_item_id uuid not null references public.support_knowledge_items(id) on delete cascade,
  machine_id text not null check (length(btrim(machine_id)) > 0),
  created_at timestamptz not null default now(),
  primary key (knowledge_item_id, machine_id)
);

create table public.support_knowledge_item_products (
  knowledge_item_id uuid not null references public.support_knowledge_items(id) on delete cascade,
  product_id uuid not null references public.price_list_items(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (knowledge_item_id, product_id)
);

create table public.support_controlled_source_registry (
  id uuid primary key default gen_random_uuid(),
  knowledge_item_id uuid references public.support_knowledge_items(id) on delete restrict,
  canonical_url text not null,
  domain text not null,
  language text not null,
  page_type text,
  etag text,
  last_modified text,
  fetched_at timestamptz,
  changed_at timestamptz,
  normalized_content_hash text check (normalized_content_hash is null or normalized_content_hash ~ '^[0-9a-f]{64}$'),
  approval_state text not null default 'DRAFT'
    check (approval_state in ('DRAFT', 'REVIEW', 'APPROVED', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_url, language),
  check (lower(domain) in ('timan.dk', 'www.timan.dk')),
  check (canonical_url ~ '^https://(www\.)?timan\.dk(/|$)')
);

create table public.support_ingestion_events (
  id uuid primary key default gen_random_uuid(),
  knowledge_source_id uuid references public.support_knowledge_sources(id) on delete restrict,
  ingestion_run_id uuid references public.support_ingestion_runs(id) on delete restrict,
  event_type text not null,
  source_type text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  page_count integer check (page_count is null or page_count >= 0),
  character_count integer check (character_count is null or character_count >= 0),
  chunk_count integer check (chunk_count is null or chunk_count >= 0),
  error_code text,
  actor_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index support_knowledge_sources_item_idx on public.support_knowledge_sources (knowledge_item_id, revision desc);
create index support_knowledge_sources_status_idx on public.support_knowledge_sources (ingestion_status, created_at desc);
create unique index support_knowledge_sources_current_idx on public.support_knowledge_sources (knowledge_item_id) where is_current;
create index support_knowledge_sources_raw_hash_idx on public.support_knowledge_sources (knowledge_item_id, raw_sha256);
create index support_ingestion_runs_source_idx on public.support_ingestion_runs (knowledge_source_id, created_at desc);
create index support_knowledge_chunks_source_idx on public.support_knowledge_chunks (knowledge_source_id, source_revision, chunk_index);
create index support_knowledge_chunks_run_idx on public.support_knowledge_chunks (ingestion_run_id, chunk_index);
create index support_knowledge_item_machines_machine_idx on public.support_knowledge_item_machines (machine_id);
create index support_knowledge_item_products_product_idx on public.support_knowledge_item_products (product_id);
create index support_ingestion_events_created_idx on public.support_ingestion_events (created_at desc);

create trigger support_knowledge_sources_touch_updated_at
before update on public.support_knowledge_sources
for each row execute function public.support_touch_updated_at();

create trigger support_knowledge_index_states_touch_updated_at
before update on public.support_knowledge_index_states
for each row execute function public.support_touch_updated_at();

create trigger support_controlled_source_registry_touch_updated_at
before update on public.support_controlled_source_registry
for each row execute function public.support_touch_updated_at();

create or replace function public.support_mark_knowledge_index_stale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if row(new.content, new.summary, new.category, new.language, new.access_scope, new.required_area, new.required_module)
     is distinct from
     row(old.content, old.summary, old.category, old.language, old.access_scope, old.required_area, old.required_module) then
    update public.support_knowledge_index_states as s
       set status = case when s.status = 'INDEXED' then 'STALE' else s.status end,
           status_reason = case when s.status = 'INDEXED' then 'KNOWLEDGE_METADATA_CHANGED' else s.status_reason end
      from public.support_knowledge_sources src
     where src.id = s.knowledge_source_id
       and src.knowledge_item_id = new.id;
  end if;
  return new;
end;
$$;

create trigger support_knowledge_items_mark_index_stale
after update on public.support_knowledge_items
for each row execute function public.support_mark_knowledge_index_stale();

create or replace function public.support_mark_association_index_stale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_id uuid := coalesce(new.knowledge_item_id, old.knowledge_item_id);
begin
  update public.support_knowledge_index_states as state
     set status = case when state.status = 'INDEXED' then 'STALE' else state.status end,
         status_reason = case when state.status = 'INDEXED' then 'KNOWLEDGE_ASSOCIATION_CHANGED' else state.status_reason end
    from public.support_knowledge_sources as source
   where source.id = state.knowledge_source_id
     and source.knowledge_item_id = item_id;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger support_knowledge_item_machines_mark_index_stale
after insert or update or delete on public.support_knowledge_item_machines
for each row execute function public.support_mark_association_index_stale();

create trigger support_knowledge_item_products_mark_index_stale
after insert or update or delete on public.support_knowledge_item_products
for each row execute function public.support_mark_association_index_stale();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-knowledge',
  'support-knowledge',
  false,
  20971520,
  array['application/pdf', 'text/plain']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.support_knowledge_sources enable row level security;
alter table public.support_ingestion_runs enable row level security;
alter table public.support_knowledge_chunks enable row level security;
alter table public.support_knowledge_index_states enable row level security;
alter table public.support_knowledge_item_machines enable row level security;
alter table public.support_knowledge_item_products enable row level security;
alter table public.support_controlled_source_registry enable row level security;
alter table public.support_ingestion_events enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'support_knowledge_sources', 'support_ingestion_runs', 'support_knowledge_chunks',
    'support_knowledge_index_states', 'support_knowledge_item_machines',
    'support_knowledge_item_products', 'support_controlled_source_registry',
    'support_ingestion_events'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.can_access_support())', 'Support administrators can read ' || table_name, table_name);
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'support_knowledge_item_machines', 'support_knowledge_item_products',
    'support_controlled_source_registry'
  ] loop
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_access_support())', 'Support administrators can insert ' || table_name, table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_access_support()) with check (public.can_access_support())', 'Support administrators can update ' || table_name, table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_access_support())', 'Support administrators can delete ' || table_name, table_name);
  end loop;
end;
$$;

create policy "Support administrators can read private knowledge files"
on storage.objects for select to authenticated
using (bucket_id = 'support-knowledge' and public.can_access_support());

-- Source objects are immutable through the normal portal: upload is performed
-- only by the authorized Edge Function and no authenticated write/delete
-- policy is intentionally created for this bucket.

grant select on public.support_knowledge_sources to authenticated;
grant select on public.support_ingestion_runs to authenticated;
grant select on public.support_knowledge_chunks to authenticated;
grant select on public.support_knowledge_index_states to authenticated;
grant select, insert, update, delete on public.support_knowledge_item_machines to authenticated;
grant select, insert, update, delete on public.support_knowledge_item_products to authenticated;
grant select, insert, update, delete on public.support_controlled_source_registry to authenticated;
grant select on public.support_ingestion_events to authenticated;

revoke all on function public.support_mark_knowledge_index_stale() from public, anon, authenticated, service_role;
revoke all on function public.support_mark_association_index_stale() from public, anon, authenticated, service_role;

comment on table public.support_knowledge_sources is 'Immutable Phase 4 knowledge source revisions below human-managed support_knowledge_items.';
comment on table public.support_ingestion_runs is 'Append-only extraction and chunking attempt history. READY_FOR_REVIEW never changes content lifecycle.';
comment on table public.support_knowledge_chunks is 'Deterministic Phase 4 text chunks only; no embeddings or vector index.';
comment on table public.support_knowledge_index_states is 'Prepared Phase 5 indexing lifecycle. Phase 4 normally remains NOT_INDEXED.';
comment on table public.support_controlled_source_registry is 'Approved Timan-owned URL registry foundation only; no crawler or URL fetcher.';
