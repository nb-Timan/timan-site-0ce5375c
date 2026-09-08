-- Keep an MO on the deterministic canonical row when source rows duplicate a serial.
do $$
declare r record;
begin
  for r in
    with ranked as (
      select wr.*, upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) normalized_serial,
        row_number() over (partition by upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) order by
          (wr.source <> 'legacy_machine_import') desc, (wr.dealer_account_id is not null) desc,
          wr.delivery_date desc nulls last, wr.created_at desc, wr.sharepoint_form_id desc nulls last, wr.id) rank
      from public.warranty_registrations wr where wr.is_active_in_source and coalesce(wr.machine_serial_number, '') <> ''
    )
    select canonical.id target_id, source.id source_id, source.legacy_warranty_reference mo
    from ranked canonical join lateral (
      select sibling.id, sibling.legacy_warranty_reference from ranked sibling
      where sibling.normalized_serial = canonical.normalized_serial and nullif(btrim(sibling.legacy_warranty_reference), '') is not null
      order by sibling.rank limit 1
    ) source on true
    where canonical.rank = 1 and nullif(btrim(canonical.legacy_warranty_reference), '') is null
  loop
    update public.warranty_registrations set legacy_warranty_reference = 'TMP-' || r.target_id::text, updated_at = now() where id = r.target_id;
    update public.warranty_registrations set legacy_warranty_reference = null, machine_order_source = null, updated_at = now() where id = r.source_id;
    update public.warranty_registrations set legacy_warranty_reference = r.mo, machine_order_source = 'portal_assigned', updated_at = now() where id = r.target_id;
    insert into public.warranty_registration_history (registration_id, change_source, snapshot, diff)
    values (r.target_id, 'machine_order_canonical_alignment', '{}'::jsonb, jsonb_build_object('event', 'Machine Order flyttet til canonical maskinrække', 'machine_order_reference', r.mo));
  end loop;
end
$$;
