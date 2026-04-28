-- Suggested Supabase migration for Timan Backend → Brugere.
-- Run in your external Supabase project when ready to swap localStorage
-- for a real backend. The shape mirrors src/lib/backend-users-store.ts.
--
-- NOTE: This file is a suggestion only. It is NOT executed by the app.

create table if not exists public.backend_users (
  id              uuid primary key default gen_random_uuid(),
  initials        text not null,
  name            text not null,
  email           text not null unique,
  company         text not null default 'Timan',
  country         text not null default 'DK',
  language        text not null default 'da',
  dealer_number   text,
  notes           text,
  role            text not null,                -- portal role key (timan_backend, ...)
  status          text not null default 'active', -- active | pending | blocked
  allowed_areas   text[] not null default '{}',
  allowed_modules text[] not null default '{}',
  backend_modules text[] not null default '{}',
  perms           jsonb  not null default '{}'::jsonb,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.backend_users enable row level security;

-- Only Timan Backend role users (looked up via has_role()) may select/update.
-- Adjust to your auth model:
--   create policy "backend can read"   on public.backend_users for select using (public.has_role(auth.uid(), 'timan_backend'));
--   create policy "backend can update" on public.backend_users for update using (public.has_role(auth.uid(), 'timan_backend'));
