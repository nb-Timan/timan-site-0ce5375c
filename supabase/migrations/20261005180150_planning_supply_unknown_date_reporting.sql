-- Keep the canonical supply status exclusive while reporting missing dates as
-- an independent data-quality measure. A quarantined conflict can therefore
-- require action and still correctly contribute to the missing-date count.

alter function public.planning_process_supply_import(
  text, text, text, jsonb, boolean, date
) rename to planning_process_supply_import_core;

revoke all on function public.planning_process_supply_import_core(
  text, text, text, jsonb, boolean, date
) from public, anon, authenticated;

create function public.planning_process_supply_import(
  p_file_name text,
  p_file_sha256 text,
  p_item_number text,
  p_rows jsonb,
  p_confirm boolean default false,
  p_as_of date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_unknown_date integer;
begin
  v_result := public.planning_process_supply_import_core(
    p_file_name,
    p_file_sha256,
    p_item_number,
    p_rows,
    p_confirm,
    p_as_of
  );

  if jsonb_typeof(v_result -> 'rows') = 'array'
    and jsonb_array_length(v_result -> 'rows') > 0 then
    select count(*)::integer
    into v_unknown_date
    from jsonb_array_elements(v_result -> 'rows') as row_data
    where row_data ->> 'validationError' is null
      and row_data ->> 'productionCompletedAt' is null
      and row_data ->> 'portalState' = 'none';

    v_result := jsonb_set(
      v_result,
      '{summary,plannedDateUnknown}',
      to_jsonb(v_unknown_date),
      true
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.planning_process_supply_import(
  text, text, text, jsonb, boolean, date
) from public, anon;
grant execute on function public.planning_process_supply_import(
  text, text, text, jsonb, boolean, date
) to authenticated;

comment on function public.planning_process_supply_import(
  text, text, text, jsonb, boolean, date
) is 'Backend-only Planning supply import with independent unknown-date reporting.';
