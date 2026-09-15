-- Canonical dealer warranty submission workflow. This migration was applied
-- to production before the repository was reconciled; keep its version so a
-- fresh database reaches the same state without replaying a second workflow.

alter table public.warranty_submissions
  alter column submission_status set default 'submitted';

alter table public.warranty_submissions
  drop constraint if exists warranty_submissions_submission_status_check;
alter table public.warranty_submissions
  add constraint warranty_submissions_submission_status_check
  check (submission_status in (
    'submitted', 'pending', 'needs_information', 'approved', 'rejected', 'cancelled'
  ));

alter table public.warranty_submissions
  add column if not exists current_status_comment text;

drop index if exists public.warranty_submissions_one_pending_serial_per_dealer;
create unique index if not exists warranty_submissions_one_open_serial_per_dealer
  on public.warranty_submissions (dealer_account_id, normalized_serial)
  where submission_status in ('submitted', 'pending', 'needs_information');

create table if not exists public.warranty_submission_status_history (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.warranty_submissions(id) on delete cascade,
  from_status text,
  to_status text not null,
  comment text,
  actor_user_id uuid references public.app_users(id) on delete set null,
  actor_email text,
  created_at timestamptz not null default now()
);

create index if not exists warranty_submission_status_history_submission_created_idx
  on public.warranty_submission_status_history (submission_id, created_at);

alter table public.warranty_submission_status_history enable row level security;

drop policy if exists warranty_submission_status_history_internal_select
  on public.warranty_submission_status_history;
create policy warranty_submission_status_history_internal_select
  on public.warranty_submission_status_history
  for select to authenticated
  using (public.is_timan_global_warranty());

drop policy if exists warranty_submission_status_history_scoped_select
  on public.warranty_submission_status_history;
create policy warranty_submission_status_history_scoped_select
  on public.warranty_submission_status_history
  for select to authenticated
  using (
    exists (
      select 1
      from public.warranty_submissions ws
      where ws.id = warranty_submission_status_history.submission_id
        and ws.dealer_account_id in (select public.warranty_visible_dealer_ids())
    )
  );

create or replace function public.record_warranty_submission_status_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.app_users%rowtype;
begin
  if tg_op = 'UPDATE' and new.submission_status is not distinct from old.submission_status then
    return new;
  end if;

  select au.* into v_actor
  from public.app_users au
  where au.auth_user_id = auth.uid()
  limit 1;

  insert into public.warranty_submission_status_history (
    submission_id, from_status, to_status, comment, actor_user_id, actor_email
  ) values (
    new.id,
    case when tg_op = 'INSERT' then null else old.submission_status end,
    new.submission_status,
    new.current_status_comment,
    v_actor.id,
    v_actor.email
  );
  return new;
end;
$$;

drop trigger if exists trg_warranty_submission_status_history on public.warranty_submissions;
create trigger trg_warranty_submission_status_history
  after insert or update of submission_status on public.warranty_submissions
  for each row execute function public.record_warranty_submission_status_history();

create or replace function public.transition_portal_warranty_submission(
  p_submission_id uuid,
  p_target_status text,
  p_comment text default null
)
returns public.warranty_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.warranty_submissions%rowtype;
  v_previous_status text;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_actor record;
begin
  if not public.is_timan_global_warranty() then
    raise exception 'Not authorised to process warranty submissions' using errcode = '42501';
  end if;

  select * into v_submission
  from public.warranty_submissions
  where id = p_submission_id
  for update;
  if not found then
    raise exception 'Warranty submission not found' using errcode = 'P0002';
  end if;

  if (v_submission.submission_status = 'submitted' and p_target_status = 'pending')
     or (v_submission.submission_status = 'pending' and p_target_status in ('needs_information', 'rejected')) then
    null;
  else
    raise exception 'Invalid warranty submission status transition' using errcode = '22023';
  end if;
  v_previous_status := v_submission.submission_status;

  if p_target_status in ('needs_information', 'rejected') and v_comment is null then
    raise exception 'A comment is required for this status' using errcode = '22023';
  end if;

  update public.warranty_submissions
     set submission_status = p_target_status,
         current_status_comment = v_comment,
         rejection_reason = case when p_target_status = 'rejected' then v_comment else rejection_reason end
   where id = v_submission.id
   returning * into v_submission;

  select * into v_actor from public.audit_current_actor();
  insert into public.audit_log (
    actor_user_id, actor_email, actor_name, actor_role,
    action, module, record_type, record_id, record_label, old_value, new_value,
    changed_fields, status
  ) values (
    v_actor.actor_user_id, v_actor.actor_email, v_actor.actor_name, v_actor.actor_role,
    'transition', 'warranty', 'warranty_submission', v_submission.id::text,
    v_submission.machine_serial_number,
    jsonb_build_object('submission_status', v_previous_status),
    jsonb_build_object('submission_status', v_submission.submission_status, 'comment', v_comment),
    array['submission_status', 'current_status_comment'], 'success'
  );

  return v_submission;
end;
$$;

revoke all on function public.transition_portal_warranty_submission(uuid, text, text) from public;
revoke execute on function public.transition_portal_warranty_submission(uuid, text, text) from anon;
grant execute on function public.transition_portal_warranty_submission(uuid, text, text) to authenticated;
