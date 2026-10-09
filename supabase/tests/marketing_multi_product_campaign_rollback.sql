begin;

do $$
declare
  v_first uuid;
  v_second uuid;
  v_conditional uuid;
  v_first_code text;
  v_second_code text;
begin
  insert into public.marketing_campaigns (
    campaign_name, status, campaign_type, starts_at, ends_at
  ) values (
    'ROLLBACK badge campaign', 'draft', 'badge', '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z'
  ) returning id, campaign_code into v_first, v_first_code;

  insert into public.marketing_campaigns (
    campaign_name, status, campaign_type, starts_at, ends_at
  ) values (
    'ROLLBACK second campaign', 'draft', 'badge', '2026-09-02T00:00:00Z', '2026-10-02T00:00:00Z'
  ) returning id, campaign_code into v_second, v_second_code;

  if v_first_code !~ '^K09-2026-[0-9]{2}$' or v_second_code !~ '^K09-2026-[0-9]{2}$' or v_first_code = v_second_code then
    raise exception 'Monthly campaign code generation failed: %, %', v_first_code, v_second_code;
  end if;

  insert into public.marketing_campaign_products (
    campaign_id, product_key, machine_key, item_number, product_role
  ) values (
    v_first, 'Timan 3330::725138', 'Timan 3330', '725138', 'linked'
  );
  update public.marketing_campaigns set status = 'published' where id = v_first;

  insert into public.marketing_campaigns (
    campaign_name, status, campaign_type, benefit_pricing_type,
    target_price_dkk, target_price_eur, starts_at, ends_at
  ) values (
    'ROLLBACK conditional zero campaign', 'draft', 'conditional', 'fixed',
    0, 0, '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z'
  ) returning id into v_conditional;

  insert into public.marketing_campaign_products (
    campaign_id, product_key, machine_key, item_number, product_role, quantity
  ) values
    (v_conditional, 'Timan 3330::Timan 3330', 'Timan 3330', '712000', 'trigger', 1),
    (v_conditional, 'Timan 3330::725138', 'Timan 3330', '725138', 'benefit', 1);
  update public.marketing_campaigns set status = 'published' where id = v_conditional;

  set constraints all immediate;

  if not exists (
    select 1 from public.marketing_campaigns
    where id = v_conditional and campaign_type = 'conditional'
      and target_price_dkk = 0 and target_price_eur = 0
  ) then
    raise exception 'Conditional zero-price campaign was not persisted correctly';
  end if;

  if (select count(*) from public.marketing_campaign_products where campaign_id = v_conditional) <> 2 then
    raise exception 'Trigger/benefit links were not persisted atomically';
  end if;

  begin
    insert into public.marketing_campaigns (
      campaign_name, status, campaign_type, discount_pct, starts_at, ends_at
    ) values (
      'ROLLBACK invalid percentage', 'draft', 'percentage', 101,
      '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z'
    );
    raise exception 'Invalid campaign percentage unexpectedly succeeded';
  exception when check_violation then
    null;
  end;
end;
$$;

rollback;
