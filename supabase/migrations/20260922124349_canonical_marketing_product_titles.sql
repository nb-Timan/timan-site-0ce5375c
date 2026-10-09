-- Marketing drafts keep localized titles inside the existing draft JSON.
-- Publishing atomically promotes those titles to Product Master while keeping
-- pricing and price publication state untouched.
create or replace function public.publish_marketing_configurator_product_content(
  p_product_key text,
  p_machine_key text,
  p_item_number text,
  p_content jsonb
)
returns setof public.marketing_configurator_product_content
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_item_number text := nullif(btrim(p_item_number), '');
  v_title_da text := nullif(btrim(p_content #>> '{localized_titles,da}'), '');
  v_title_de text := nullif(btrim(p_content #>> '{localized_titles,de}'), '');
  v_title_en text := nullif(btrim(p_content #>> '{localized_titles,en}'), '');
  v_content jsonb;
  v_row public.marketing_configurator_product_content%rowtype;
begin
  if not public.can_manage_marketing_configurator_content() then
    raise exception 'Kun autoriserede Marketing- og Backend-brugere kan publicere produktindhold.' using errcode = '42501';
  end if;

  if nullif(btrim(p_product_key), '') is null
    or nullif(btrim(p_machine_key), '') is null
    or v_item_number is null
    or v_title_da is null then
    raise exception 'Produkt, varenummer og dansk titel er påkrævet.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.price_list_items where item_number = v_item_number
  ) then
    raise exception 'Varenr. % findes ikke i Product Master.', v_item_number using errcode = 'P0002';
  end if;

  select au.id
  into v_actor_id
  from public.app_users as au
  where au.auth_user_id = auth.uid()
  limit 1;

  v_content := jsonb_set(
    jsonb_set(
      coalesce(p_content, '{}'::jsonb),
      '{localized_titles}',
      jsonb_build_object(
        'da', v_title_da,
        'de', coalesce(v_title_de, ''),
        'en', coalesce(v_title_en, '')
      ),
      true
    ),
    '{title}',
    to_jsonb(v_title_da),
    true
  );

  update public.price_list_items
  set item_text_da = v_title_da,
      item_text_de = v_title_de,
      item_text_en = v_title_en,
      updated_by = auth.uid(),
      updated_by_email = coalesce(auth.jwt() ->> 'email', updated_by_email),
      updated_at = now()
  where item_number = v_item_number;

  insert into public.marketing_configurator_product_content (
    product_key, machine_key, item_number, content, status,
    created_by, updated_by, published_at, updated_at
  ) values (
    btrim(p_product_key), btrim(p_machine_key), v_item_number, v_content, 'published',
    v_actor_id, v_actor_id, now(), now()
  )
  on conflict (product_key, status) do update
  set machine_key = excluded.machine_key,
      item_number = excluded.item_number,
      content = excluded.content,
      updated_by = excluded.updated_by,
      published_at = excluded.published_at,
      updated_at = excluded.updated_at
  returning * into v_row;

  delete from public.marketing_configurator_product_content
  where product_key = btrim(p_product_key)
    and status = 'draft';

  return next v_row;
end;
$$;

revoke all on function public.publish_marketing_configurator_product_content(
  text, text, text, jsonb
) from public, anon;
grant execute on function public.publish_marketing_configurator_product_content(
  text, text, text, jsonb
) to authenticated;
