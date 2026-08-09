-- Phase 66 - News CMS foundation
--
-- Creates or extends public.news_posts for the fixed-template News CMS.
-- The migration is intentionally additive and idempotent:
-- - no existing tables are dropped
-- - existing legacy news columns are preserved
-- - public reads still only expose active/published news

create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  excerpt text,
  image_url text,
  link_url text,
  category text not null default 'NYHED',
  published_at timestamptz,
  is_active boolean not null default false,
  source text,
  template_id text not null default 'legacy_card',
  status text not null default 'draft',
  slug text unique,
  localized_content jsonb not null default '{}'::jsonb,
  template_data jsonb not null default '{}'::jsonb,
  assets jsonb not null default '[]'::jsonb,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  published_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.news_posts
  add column if not exists template_id text not null default 'legacy_card',
  add column if not exists status text not null default 'draft',
  add column if not exists slug text unique,
  add column if not exists localized_content jsonb not null default '{}'::jsonb,
  add column if not exists template_data jsonb not null default '{}'::jsonb,
  add column if not exists assets jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references public.app_users(id) on delete set null,
  add column if not exists updated_by uuid references public.app_users(id) on delete set null,
  add column if not exists published_by uuid references public.app_users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.news_posts alter column published_at drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'news_posts_status_check'
      and conrelid = 'public.news_posts'::regclass
  ) then
    alter table public.news_posts
      add constraint news_posts_status_check
      check (status in ('draft', 'published', 'archived'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'news_posts_template_id_check'
      and conrelid = 'public.news_posts'::regclass
  ) then
    alter table public.news_posts
      add constraint news_posts_template_id_check
      check (
        template_id in (
          'legacy_card',
          'template-01-product-announcement',
          'template-02-split-story',
          'template-03-hero-news',
          'template-04-technical-feature',
          'template-05-story-layout',
          'template-06-flyer'
        )
      );
  end if;
end $$;

create index if not exists news_posts_public_idx
  on public.news_posts (is_active, status, published_at desc);

create index if not exists news_posts_template_idx
  on public.news_posts (template_id);

create index if not exists news_posts_updated_idx
  on public.news_posts (updated_at desc);

create index if not exists news_posts_localized_content_gin
  on public.news_posts using gin (localized_content);

alter table public.news_posts enable row level security;

revoke all on table public.news_posts from anon, authenticated;
grant select on table public.news_posts to anon, authenticated;
grant insert, update on table public.news_posts to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'news_posts'
      and policyname = 'news_posts_public_read_published'
  ) then
    create policy news_posts_public_read_published
      on public.news_posts
      for select
      to anon, authenticated
      using (is_active = true and status = 'published');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'news_posts'
      and policyname = 'news_posts_backend_select_all'
  ) then
    create policy news_posts_backend_select_all
      on public.news_posts
      for select
      to authenticated
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'news_posts'
      and policyname = 'news_posts_backend_insert'
  ) then
    create policy news_posts_backend_insert
      on public.news_posts
      for insert
      to authenticated
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'news_posts'
      and policyname = 'news_posts_backend_update'
  ) then
    create policy news_posts_backend_update
      on public.news_posts
      for update
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;
