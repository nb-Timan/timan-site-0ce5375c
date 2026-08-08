-- Phase 66 - News CMS foundation proposal
--
-- IMPORTANT:
-- This file is a proposal only. Do not run it against the live Supabase
-- project until the correct project connection has been verified.
--
-- Goal:
-- Extend the existing public.news_posts table for the News CMS while keeping
-- the current public news flow compatible with title/excerpt/image_url/etc.

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

-- Drafts need to exist before publication.
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

create index if not exists news_posts_localized_content_gin
  on public.news_posts using gin (localized_content);

-- Permission assignment proposal only:
--
-- update public.app_users
-- set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object('news_manage', true)
-- where email in ('person@example.com');
--
-- RLS policy proposal should be reviewed against the verified live schema:
-- 1. Public/portal users can read active published news.
-- 2. Users with portal_role = 'timan_backend' can manage news.
-- 3. Users with permissions->>'news_manage' = 'true' can manage news.
