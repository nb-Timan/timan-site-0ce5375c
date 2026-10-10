-- Read-only Backend status. No imports, source cutover or new client grants.
create or replace function public.fabric_partner_shadow_preview()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if public.is_backend() is not true then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  return jsonb_build_object(
    'state',(select to_jsonb(s) from public.fabric_partner_shadow_state s where singleton),
    'shadow',coalesce((select jsonb_agg(to_jsonb(s) order by s.account_number,s.source_row_number)
      from public.fabric_partner_master_shadow s where s.source_present),'[]'::jsonb),
    'portal',coalesce((select jsonb_agg(jsonb_build_object(
      'id',d.id,'account_number',d.account_number,'company_name',d.company_name,
      'address_line_1',coalesce(d.address_line_1,d.address),'address_line_2',d.address_line_2,
      'postal_code',d.postal_code,'city',d.city,'country',d.country,'phone',d.phone,'email',d.email,
      'billing_account_number',b.account_number,'customer_type_label',d.customer_type_label,
      'customer_type',d.customer_type,'dealer_type',d.dealer_type,'assigned_seller_initials',d.assigned_seller_initials,
      'parent_account_number',d.parent_account_number
    ) order by d.account_number) from public.dealer_accounts d left join public.dealer_accounts b on b.id=d.billing_account_id),'[]'::jsonb),
    'imports',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'account_id',i.account_id,'account_number',i.account_number,
      'approval_id',i.approval_id,'imported_at',i.imported_at
    ) order by i.imported_at,i.id) from public.fabric_partner_import_pilots i
      join public.dealer_accounts d on d.id=i.account_id and d.account_number=i.account_number),'[]'::jsonb)
  );
end $$;
