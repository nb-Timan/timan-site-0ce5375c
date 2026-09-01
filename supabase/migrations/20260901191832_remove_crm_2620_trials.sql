-- Permanently retire the dedicated "Afprøvning af 2620" flow.
-- This migration is intentionally narrow: it removes only the standalone
-- crm_2620_trials register, its policies, trigger and touch function.
-- Timan 2620 product/machine data is not touched.

do $$
declare
  trial_table regclass := to_regclass('public.crm_2620_trials');
  total_rows integer := 0;
  test_rows integer := 0;
  dependent_views integer := 0;
  dependent_foreign_keys integer := 0;
begin
  if trial_table is null then
    return;
  end if;

  select count(*)
    into dependent_views
  from pg_depend d
  join pg_rewrite r on r.oid = d.objid
  join pg_class dependent_view on dependent_view.oid = r.ev_class
  where d.refobjid = trial_table
    and dependent_view.oid <> trial_table;

  if dependent_views > 0 then
    raise exception 'public.crm_2620_trials has dependent views/rules; cleanup stopped';
  end if;

  select count(*)
    into dependent_foreign_keys
  from pg_constraint
  where contype = 'f'
    and confrelid = trial_table;

  if dependent_foreign_keys > 0 then
    raise exception 'public.crm_2620_trials is referenced by foreign keys; cleanup stopped';
  end if;

  execute 'select count(*) from public.crm_2620_trials'
    into total_rows;

  execute $sql$
    select count(*)
    from public.crm_2620_trials
    where concat_ws(
      ' ',
      company_cvr,
      contact_person,
      address,
      zip_city,
      phone,
      email,
      comment,
      responsible_seller_name,
      responsible_seller_email,
      created_by_email
    ) ilike '%test nr 1%'
  $sql$
    into test_rows;

  if total_rows > 1 then
    raise exception 'public.crm_2620_trials contains % rows; expected at most the single test row', total_rows;
  end if;

  if total_rows = 1 and test_rows <> 1 then
    raise exception 'public.crm_2620_trials contains one row, but it does not match expected test record TEst nr 1';
  end if;

  execute $sql$
    delete from public.crm_2620_trials
    where concat_ws(
      ' ',
      company_cvr,
      contact_person,
      address,
      zip_city,
      phone,
      email,
      comment,
      responsible_seller_name,
      responsible_seller_email,
      created_by_email
    ) ilike '%test nr 1%'
  $sql$;
end $$;

do $$
begin
  if to_regclass('public.crm_2620_trials') is not null then
    drop trigger if exists crm_2620_trials_touch_updated_at on public.crm_2620_trials;

    drop policy if exists "crm_2620_trials_authenticated_delete" on public.crm_2620_trials;
    drop policy if exists "crm_2620_trials_authenticated_insert" on public.crm_2620_trials;
    drop policy if exists "crm_2620_trials_authenticated_select" on public.crm_2620_trials;

    revoke all on table public.crm_2620_trials from anon;
    revoke all on table public.crm_2620_trials from authenticated;

    drop table public.crm_2620_trials;
  end if;
end $$;

drop function if exists public.crm_2620_trials_touch_updated_at();
