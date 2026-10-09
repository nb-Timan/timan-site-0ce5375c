-- Append-only, field-level audit history for Backend price-list edits.
-- Existing item rows are deliberately not backfilled: a history row only exists
-- when a real change is observed, so legacy values are never invented.
create table if not exists public.price_list_item_history (
  id uuid primary key default gen_random_uuid(),
  change_set_id uuid not null,
  item_id uuid not null,
  item_number text not null,
  actor_user_id uuid references public.app_users(id) on delete set null,
  actor_name text,
  actor_initials text,
  actor_email text,
  field_name text not null check (field_name in (
    'item_number',
    'item_text_da',
    'cost_price_dkk',
    'price_dkk',
    'price_sek',
    'price_eur'
  )),
  old_value text,
  new_value text,
  old_numeric_value numeric,
  new_numeric_value numeric,
  changed_at timestamptz not null default now()
);

create index if not exists price_list_item_history_item_changed_idx
  on public.price_list_item_history (item_id, changed_at desc, id desc);

alter table public.price_list_item_history enable row level security;

drop policy if exists "Backend can read price list item history" on public.price_list_item_history;
create policy "Backend can read price list item history"
on public.price_list_item_history
for select
to authenticated
using ((select public.is_timan_backend()));

revoke all on table public.price_list_item_history from public, anon, authenticated;
grant select on table public.price_list_item_history to authenticated;

create or replace function public.record_price_list_item_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_change_set_id uuid := gen_random_uuid();
  v_actor_user_id uuid;
  v_actor_name text;
  v_actor_initials text;
  v_actor_email text := coalesce(auth.jwt() ->> 'email', new.updated_by_email);
begin
  if old.item_number is not distinct from new.item_number
    and old.item_text_da is not distinct from new.item_text_da
    and old.cost_price_dkk is not distinct from new.cost_price_dkk
    and old.price_dkk is not distinct from new.price_dkk
    and old.price_sek is not distinct from new.price_sek
    and old.price_eur is not distinct from new.price_eur then
    return new;
  end if;

  select
    au.id,
    coalesce(nullif(au.display_name, ''), nullif(au.full_name, ''), au.email),
    au.initials,
    au.email
  into v_actor_user_id, v_actor_name, v_actor_initials, v_actor_email
  from public.app_users as au
  where au.auth_user_id = auth.uid()
     or lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by (au.auth_user_id = auth.uid()) desc
  limit 1;

  v_actor_email := coalesce(v_actor_email, auth.jwt() ->> 'email', new.updated_by_email);

  if old.item_number is distinct from new.item_number then
    insert into public.price_list_item_history (
      change_set_id, item_id, item_number, actor_user_id, actor_name, actor_initials, actor_email,
      field_name, old_value, new_value
    ) values (
      v_change_set_id, new.id, new.item_number, v_actor_user_id, v_actor_name, v_actor_initials, v_actor_email,
      'item_number', old.item_number, new.item_number
    );
  end if;

  if old.item_text_da is distinct from new.item_text_da then
    insert into public.price_list_item_history (
      change_set_id, item_id, item_number, actor_user_id, actor_name, actor_initials, actor_email,
      field_name, old_value, new_value
    ) values (
      v_change_set_id, new.id, new.item_number, v_actor_user_id, v_actor_name, v_actor_initials, v_actor_email,
      'item_text_da', old.item_text_da, new.item_text_da
    );
  end if;

  if old.cost_price_dkk is distinct from new.cost_price_dkk then
    insert into public.price_list_item_history (
      change_set_id, item_id, item_number, actor_user_id, actor_name, actor_initials, actor_email,
      field_name, old_value, new_value, old_numeric_value, new_numeric_value
    ) values (
      v_change_set_id, new.id, new.item_number, v_actor_user_id, v_actor_name, v_actor_initials, v_actor_email,
      'cost_price_dkk', old.cost_price_dkk::text, new.cost_price_dkk::text, old.cost_price_dkk, new.cost_price_dkk
    );
  end if;

  if old.price_dkk is distinct from new.price_dkk then
    insert into public.price_list_item_history (
      change_set_id, item_id, item_number, actor_user_id, actor_name, actor_initials, actor_email,
      field_name, old_value, new_value, old_numeric_value, new_numeric_value
    ) values (
      v_change_set_id, new.id, new.item_number, v_actor_user_id, v_actor_name, v_actor_initials, v_actor_email,
      'price_dkk', old.price_dkk::text, new.price_dkk::text, old.price_dkk, new.price_dkk
    );
  end if;

  if old.price_sek is distinct from new.price_sek then
    insert into public.price_list_item_history (
      change_set_id, item_id, item_number, actor_user_id, actor_name, actor_initials, actor_email,
      field_name, old_value, new_value, old_numeric_value, new_numeric_value
    ) values (
      v_change_set_id, new.id, new.item_number, v_actor_user_id, v_actor_name, v_actor_initials, v_actor_email,
      'price_sek', old.price_sek::text, new.price_sek::text, old.price_sek, new.price_sek
    );
  end if;

  if old.price_eur is distinct from new.price_eur then
    insert into public.price_list_item_history (
      change_set_id, item_id, item_number, actor_user_id, actor_name, actor_initials, actor_email,
      field_name, old_value, new_value, old_numeric_value, new_numeric_value
    ) values (
      v_change_set_id, new.id, new.item_number, v_actor_user_id, v_actor_name, v_actor_initials, v_actor_email,
      'price_eur', old.price_eur::text, new.price_eur::text, old.price_eur, new.price_eur
    );
  end if;

  return new;
end;
$$;

revoke all on function public.record_price_list_item_history() from public, anon, authenticated;

drop trigger if exists record_price_list_item_history on public.price_list_items;
create trigger record_price_list_item_history
after update on public.price_list_items
for each row execute function public.record_price_list_item_history();
