-- Product/site changelog for "Marketing -> Nye features på sitet".
-- Internal entries are stored separately from public user-facing entries.
-- Public users only read the safe projection table.

create extension if not exists pgcrypto;

create table if not exists public.site_change_entries (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'manual',
  source_ref text,
  implemented_at timestamptz not null default now(),
  title_internal text not null,
  description_internal text,
  technical_description text,
  title_public text,
  description_public text,
  module text not null,
  change_type text not null default 'improvement',
  affected_roles text[] not null default array['all']::text[],
  user_impact_score integer not null default 3 check (user_impact_score between 1 and 10),
  technical_impact_score integer not null default 3 check (technical_impact_score between 1 and 10),
  publish_recommendation text not null default 'maybe'
    check (publish_recommendation in ('publish','maybe','internal')),
  is_important boolean not null default false,
  status text not null default 'new'
    check (status in ('new','draft','published','archived')),
  published_at timestamptz,
  archived_at timestamptz,
  reviewed_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  published_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_change_public_entries (
  id uuid primary key references public.site_change_entries(id) on delete cascade,
  published_at timestamptz not null,
  implemented_at timestamptz not null,
  title text not null,
  description text,
  module text not null,
  change_type text not null,
  affected_roles text[] not null default array['all']::text[],
  is_important boolean not null default false,
  source_ref text,
  updated_at timestamptz not null default now()
);

create index if not exists site_change_entries_status_idx
  on public.site_change_entries (status, implemented_at desc);
create index if not exists site_change_entries_module_idx
  on public.site_change_entries (module);
create index if not exists site_change_entries_recommendation_idx
  on public.site_change_entries (publish_recommendation);
create index if not exists site_change_entries_roles_gin
  on public.site_change_entries using gin (affected_roles);
create index if not exists site_change_public_published_idx
  on public.site_change_public_entries (published_at desc);
create index if not exists site_change_public_roles_gin
  on public.site_change_public_entries using gin (affected_roles);

create or replace function public.site_change_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists site_change_entries_touch_updated_at on public.site_change_entries;
create trigger site_change_entries_touch_updated_at
before update on public.site_change_entries
for each row execute function public.site_change_touch_updated_at();

create or replace function public.sync_site_change_public_entry()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.site_change_public_entries where id = old.id;
    return old;
  end if;

  if new.status = 'published' then
    insert into public.site_change_public_entries (
      id,
      published_at,
      implemented_at,
      title,
      description,
      module,
      change_type,
      affected_roles,
      is_important,
      source_ref,
      updated_at
    )
    values (
      new.id,
      coalesce(new.published_at, now()),
      new.implemented_at,
      coalesce(nullif(new.title_public, ''), new.title_internal),
      nullif(coalesce(new.description_public, ''), ''),
      new.module,
      new.change_type,
      coalesce(new.affected_roles, array['all']::text[]),
      new.is_important,
      new.source_ref,
      now()
    )
    on conflict (id) do update set
      published_at = excluded.published_at,
      implemented_at = excluded.implemented_at,
      title = excluded.title,
      description = excluded.description,
      module = excluded.module,
      change_type = excluded.change_type,
      affected_roles = excluded.affected_roles,
      is_important = excluded.is_important,
      source_ref = excluded.source_ref,
      updated_at = now();

    if new.published_at is null then
      new.published_at = now();
    end if;
  else
    delete from public.site_change_public_entries where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_site_change_public_entry on public.site_change_entries;
create trigger sync_site_change_public_entry
before insert or update or delete on public.site_change_entries
for each row execute function public.sync_site_change_public_entry();

alter table public.site_change_entries enable row level security;
alter table public.site_change_public_entries enable row level security;

revoke all on table public.site_change_entries from anon, authenticated;
revoke all on table public.site_change_public_entries from anon, authenticated;
grant select, insert, update, delete on table public.site_change_entries to authenticated;
grant select on table public.site_change_public_entries to anon, authenticated;

drop policy if exists site_change_entries_admin_select on public.site_change_entries;
create policy site_change_entries_admin_select
on public.site_change_entries
for select
to authenticated
using (
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and (
        au.portal_role::text = 'timan_backend'
        or coalesce((au.permissions ->> 'news_manage')::boolean, false) = true
      )
  )
);

drop policy if exists site_change_entries_admin_insert on public.site_change_entries;
create policy site_change_entries_admin_insert
on public.site_change_entries
for insert
to authenticated
with check (
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and (
        au.portal_role::text = 'timan_backend'
        or coalesce((au.permissions ->> 'news_manage')::boolean, false) = true
      )
  )
);

drop policy if exists site_change_entries_admin_update on public.site_change_entries;
create policy site_change_entries_admin_update
on public.site_change_entries
for update
to authenticated
using (
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and (
        au.portal_role::text = 'timan_backend'
        or coalesce((au.permissions ->> 'news_manage')::boolean, false) = true
      )
  )
)
with check (
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and (
        au.portal_role::text = 'timan_backend'
        or coalesce((au.permissions ->> 'news_manage')::boolean, false) = true
      )
  )
);

drop policy if exists site_change_entries_admin_delete on public.site_change_entries;
create policy site_change_entries_admin_delete
on public.site_change_entries
for delete
to authenticated
using (
  exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and (
        au.portal_role::text = 'timan_backend'
        or coalesce((au.permissions ->> 'news_manage')::boolean, false) = true
      )
  )
);

drop policy if exists site_change_public_anon_all on public.site_change_public_entries;
create policy site_change_public_anon_all
on public.site_change_public_entries
for select
to anon
using ('all' = any(affected_roles));

drop policy if exists site_change_public_role_read on public.site_change_public_entries;
create policy site_change_public_role_read
on public.site_change_public_entries
for select
to authenticated
using (
  'all' = any(affected_roles)
  or exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and (
        au.portal_role::text = 'timan_backend'
        or au.portal_role::text = any(affected_roles)
        or (au.portal_role::text = 'timan_seller' and 'sales' = any(affected_roles))
        or (au.portal_role::text = 'timan_service' and 'service' = any(affected_roles))
        or (au.portal_role::text in ('timan_dealer','dealer_user','timan_importer','timan_service_partner') and 'dealer' = any(affected_roles))
        or ((au.role = 'timan_saelger') and 'sales' = any(affected_roles))
        or ((au.role = 'partner') and 'dealer' = any(affected_roles))
      )
  )
);

insert into public.site_change_entries (
  source,
  source_ref,
  implemented_at,
  title_internal,
  description_internal,
  technical_description,
  title_public,
  description_public,
  module,
  change_type,
  affected_roles,
  user_impact_score,
  technical_impact_score,
  publish_recommendation,
  is_important,
  status
)
select
  'codex',
  'migration:20260826203041_site_change_entries',
  now(),
  'Automatisk changelog og Marketing-publicering',
  'Nye site-features registreres som intern kø, hvor Marketing kan redigere og publicere udvalgte ændringer til Hvad er nyt?',
  'Opretter site_change_entries og site_change_public_entries med RLS. Public table indeholder kun brugerrettet tekst.',
  'Nye features på sitet',
  'Marketing kan nu gennemgå produktændringer og vælge hvilke der skal vises under Hvad er nyt?',
  'marketing',
  'feature',
  array['timan_backend']::text[],
  7,
  8,
  'maybe',
  false,
  'new'
where not exists (
  select 1
  from public.site_change_entries
  where source_ref = 'migration:20260826203041_site_change_entries'
);
