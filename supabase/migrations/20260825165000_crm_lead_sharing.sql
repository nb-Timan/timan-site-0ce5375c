-- Bidirectional CRM lead sharing.
-- Keeps one crm_leads record and grants visibility through share rows.

create table if not exists public.crm_lead_shares (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  shared_by_user_id uuid references public.app_users(id) on delete set null,
  shared_by_name text,
  shared_by_email text,
  shared_with_user_id uuid not null references public.app_users(id) on delete cascade,
  shared_with_name text,
  shared_with_email text,
  shared_with_dealer_account_id uuid references public.dealer_accounts(id) on delete set null,
  direction text not null check (direction in ('timan_to_dealer', 'dealer_to_timan')),
  channel text not null default 'portal' check (channel in ('portal', 'portal_email')),
  note text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid references public.app_users(id) on delete set null
);

create unique index if not exists crm_lead_shares_active_user_unique
  on public.crm_lead_shares (lead_id, shared_with_user_id)
  where revoked_at is null;

create index if not exists crm_lead_shares_lead_idx
  on public.crm_lead_shares (lead_id, created_at desc);

create index if not exists crm_lead_shares_shared_with_idx
  on public.crm_lead_shares (shared_with_user_id)
  where revoked_at is null;

create table if not exists public.crm_lead_share_audit_log (
  id uuid primary key default gen_random_uuid(),
  lead_share_id uuid references public.crm_lead_shares(id) on delete set null,
  lead_id uuid references public.crm_leads(id) on delete cascade,
  action text not null check (action in ('shared', 'revoked')),
  actor_user_id uuid references public.app_users(id) on delete set null,
  actor_name text,
  actor_email text,
  target_user_id uuid references public.app_users(id) on delete set null,
  target_name text,
  target_email text,
  channel text,
  direction text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists crm_lead_share_audit_lead_idx
  on public.crm_lead_share_audit_log (lead_id, created_at desc);

alter table public.crm_lead_shares enable row level security;
alter table public.crm_lead_share_audit_log enable row level security;

drop policy if exists crm_lead_shares_authenticated_all on public.crm_lead_shares;
drop policy if exists crm_lead_shares_select_scoped on public.crm_lead_shares;
create policy crm_lead_shares_select_scoped
  on public.crm_lead_shares
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where au.auth_user_id = (select auth.uid())
        and au.is_active = true
        and (
          au.id = crm_lead_shares.shared_by_user_id
          or au.id = crm_lead_shares.shared_with_user_id
          or au.portal_role in ('timan_backend', 'timan_seller', 'timan_service')
          or au.role in ('timan_backend', 'timan_seller', 'timan_service')
        )
    )
  );

drop policy if exists crm_lead_shares_insert_actor on public.crm_lead_shares;
create policy crm_lead_shares_insert_actor
  on public.crm_lead_shares
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.app_users actor
      join public.crm_leads lead on lead.id = crm_lead_shares.lead_id
      where actor.auth_user_id = (select auth.uid())
        and actor.is_active = true
        and actor.id = crm_lead_shares.shared_by_user_id
        and (
          (
            crm_lead_shares.direction = 'timan_to_dealer'
            and (
              actor.portal_role in ('timan_backend', 'timan_seller', 'timan_service')
              or actor.role in ('timan_backend', 'timan_seller', 'timan_service')
            )
            and exists (
              select 1
              from public.dealer_accounts dealer
              join public.app_users target on target.id = crm_lead_shares.shared_with_user_id
              where dealer.id = crm_lead_shares.shared_with_dealer_account_id
                and lead.linked_dealer_id = dealer.id
                and target.dealer_number = dealer.account_number
                and target.is_active = true
                and target.approved = true
            )
          )
          or (
            crm_lead_shares.direction = 'dealer_to_timan'
            and exists (
              select 1
              from public.dealer_accounts dealer
              join public.app_users target on target.id = crm_lead_shares.shared_with_user_id
              where lead.linked_dealer_id = dealer.id
                and actor.dealer_number = dealer.account_number
                and target.is_active = true
                and (
                  target.id = dealer.assigned_seller_id
                  or lower(target.email) = lower(coalesce(dealer.assigned_seller_email, ''))
                )
                and (
                  target.portal_role in ('timan_backend', 'timan_seller', 'timan_service')
                  or target.role in ('timan_backend', 'timan_seller', 'timan_service')
                )
            )
          )
        )
    )
  );

drop policy if exists crm_lead_shares_revoke_actor on public.crm_lead_shares;
create policy crm_lead_shares_revoke_actor
  on public.crm_lead_shares
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where au.auth_user_id = (select auth.uid())
        and au.is_active = true
        and (
          au.id = crm_lead_shares.shared_by_user_id
          or au.portal_role in ('timan_backend', 'timan_seller', 'timan_service')
          or au.role in ('timan_backend', 'timan_seller', 'timan_service')
        )
    )
  )
  with check (
    exists (
      select 1
      from public.app_users au
      where au.auth_user_id = (select auth.uid())
        and au.is_active = true
        and (
          au.id = crm_lead_shares.shared_by_user_id
          or au.portal_role in ('timan_backend', 'timan_seller', 'timan_service')
          or au.role in ('timan_backend', 'timan_seller', 'timan_service')
        )
    )
  );

drop policy if exists crm_lead_share_audit_authenticated_all on public.crm_lead_share_audit_log;
drop policy if exists crm_lead_share_audit_select_scoped on public.crm_lead_share_audit_log;
create policy crm_lead_share_audit_select_scoped
  on public.crm_lead_share_audit_log
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where au.auth_user_id = (select auth.uid())
        and au.is_active = true
        and (
          au.id = crm_lead_share_audit_log.actor_user_id
          or au.id = crm_lead_share_audit_log.target_user_id
          or au.portal_role in ('timan_backend', 'timan_seller', 'timan_service')
          or au.role in ('timan_backend', 'timan_seller', 'timan_service')
        )
    )
  );

drop policy if exists crm_lead_share_audit_insert_actor on public.crm_lead_share_audit_log;
create policy crm_lead_share_audit_insert_actor
  on public.crm_lead_share_audit_log
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.app_users au
      where au.auth_user_id = (select auth.uid())
        and au.is_active = true
        and au.id = crm_lead_share_audit_log.actor_user_id
    )
  );

grant select, insert, update on public.crm_lead_shares to authenticated;
grant select, insert on public.crm_lead_share_audit_log to authenticated;
