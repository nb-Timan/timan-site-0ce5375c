-- Phase 7 — Visitor tracking & Portal Analytics
-- Run this in your external Supabase project.
-- Safe to re-run (uses IF NOT EXISTS / IF NOT EXISTS-style guards).

-- =========================================================
-- 1. guest_visitors
--    One row per unique anonymous visitor (identified by client-side UUID).
-- =========================================================
create table if not exists public.guest_visitors (
  id uuid primary key default gen_random_uuid(),
  visitor_uid text not null unique,            -- stable client UUID stored in localStorage
  email text,                                  -- optional, only if guest later provides it
  country text,
  postal_code text,
  language text,
  user_agent text,
  first_visit_at timestamptz not null default now(),
  last_visit_at  timestamptz not null default now(),
  visit_count int not null default 1,
  converted_to_user boolean not null default false,
  converted_user_email text,
  converted_at timestamptz
);

create index if not exists idx_guest_visitors_country on public.guest_visitors(country);
create index if not exists idx_guest_visitors_last_visit on public.guest_visitors(last_visit_at desc);

-- =========================================================
-- 2. guest_sessions
--    One row per session (open/close) for a visitor.
-- =========================================================
create table if not exists public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  visitor_uid text not null,                   -- FK-by-value to guest_visitors.visitor_uid
  user_type text not null default 'guest',     -- 'guest' | 'authenticated'
  email text,                                   -- if authenticated user
  country text,
  postal_code text,
  language text,
  user_agent text,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  duration_seconds int
);

create index if not exists idx_guest_sessions_visitor on public.guest_sessions(visitor_uid);
create index if not exists idx_guest_sessions_started on public.guest_sessions(started_at desc);
create index if not exists idx_guest_sessions_user_type on public.guest_sessions(user_type);

-- =========================================================
-- 3. portal_activity_log
--    Page/module visit log (one row per page view).
-- =========================================================
create table if not exists public.portal_activity_log (
  id uuid primary key default gen_random_uuid(),
  visitor_uid text not null,
  session_id uuid,
  user_type text not null default 'guest',     -- 'guest' | 'authenticated'
  email text,
  country text,
  postal_code text,
  language text,
  path text not null,
  module text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pal_visitor on public.portal_activity_log(visitor_uid);
create index if not exists idx_pal_created on public.portal_activity_log(created_at desc);
create index if not exists idx_pal_module  on public.portal_activity_log(module);

-- =========================================================
-- RLS — anon may INSERT (for tracking) but not SELECT.
-- Authenticated Timan Backend users may SELECT everything.
-- =========================================================
alter table public.guest_visitors      enable row level security;
alter table public.guest_sessions      enable row level security;
alter table public.portal_activity_log enable row level security;

-- Helper: is current user a Timan Backend user (uses existing app_users.portal_role)
create or replace function public.is_timan_backend()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and portal_role = 'timan_backend'
      and is_active = true
  );
$$;

-- guest_visitors policies
drop policy if exists "anon insert visitors"   on public.guest_visitors;
drop policy if exists "anon update own visitor" on public.guest_visitors;
drop policy if exists "backend read visitors"  on public.guest_visitors;
create policy "anon insert visitors" on public.guest_visitors
  for insert to anon, authenticated with check (true);
create policy "anon update own visitor" on public.guest_visitors
  for update to anon, authenticated using (true) with check (true);
create policy "backend read visitors" on public.guest_visitors
  for select to authenticated using (public.is_timan_backend());

-- guest_sessions policies
drop policy if exists "anon insert sessions" on public.guest_sessions;
drop policy if exists "anon update sessions" on public.guest_sessions;
drop policy if exists "backend read sessions" on public.guest_sessions;
create policy "anon insert sessions" on public.guest_sessions
  for insert to anon, authenticated with check (true);
create policy "anon update sessions" on public.guest_sessions
  for update to anon, authenticated using (true) with check (true);
create policy "backend read sessions" on public.guest_sessions
  for select to authenticated using (public.is_timan_backend());

-- portal_activity_log policies
drop policy if exists "anon insert activity" on public.portal_activity_log;
drop policy if exists "backend read activity" on public.portal_activity_log;
create policy "anon insert activity" on public.portal_activity_log
  for insert to anon, authenticated with check (true);
create policy "backend read activity" on public.portal_activity_log
  for select to authenticated using (public.is_timan_backend());
