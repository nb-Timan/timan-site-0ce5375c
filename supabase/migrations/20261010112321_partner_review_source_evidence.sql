-- Capture original C5 facts only for future decisions; never backfill guesses.
alter table public.fabric_partner_review_decisions add column source_partner_type_code text;
alter table public.fabric_partner_review_decisions add column source_invoice_account_number text;

create table public.fabric_partner_review_invoice_chain (
  decision_id uuid not null references public.fabric_partner_review_decisions(id),
  ordinal integer not null check(ordinal between 0 and 20),
  account_number text not null,
  invoice_account_number text,
  primary key(decision_id,ordinal)
);
alter table public.fabric_partner_review_invoice_chain enable row level security;
revoke all on public.fabric_partner_review_invoice_chain from public,anon,authenticated,service_role;
create trigger fabric_partner_review_invoice_chain_immutable before update or delete or truncate
  on public.fabric_partner_review_invoice_chain for each statement execute function public.fabric_partner_review_immutable();

create function public.fabric_partner_review_capture_source()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if TG_WHEN='BEFORE' then
    select c5_partner_type_code,c5_invoice_account_number into NEW.source_partner_type_code,NEW.source_invoice_account_number
      from public.fabric_partner_master_shadow where company=NEW.company and account_number=NEW.account_number
        and source_present order by source_row_number limit 1;
    return NEW;
  end if;
  with recursive chain as (
    select s.account_number,s.c5_invoice_account_number,array[s.account_number] visited,0 ordinal
    from public.fabric_partner_master_shadow s where s.company=NEW.company and s.account_number=NEW.account_number and s.source_present
    union all
    select s.account_number,s.c5_invoice_account_number,c.visited||s.account_number,c.ordinal+1
    from chain c join public.fabric_partner_master_shadow s on s.company=NEW.company
      and s.account_number=c.c5_invoice_account_number and s.source_present
    where c.ordinal<20 and not s.account_number=any(c.visited)
  )
  insert into public.fabric_partner_review_invoice_chain(decision_id,ordinal,account_number,invoice_account_number)
    select NEW.id,ordinal,account_number,c5_invoice_account_number from chain;
  return NEW;
end $$;
revoke all on function public.fabric_partner_review_capture_source() from public,anon,authenticated,service_role;
create trigger fabric_partner_review_capture_source_before before insert on public.fabric_partner_review_decisions
  for each row execute function public.fabric_partner_review_capture_source();
create trigger fabric_partner_review_capture_source_after after insert on public.fabric_partner_review_decisions
  for each row execute function public.fabric_partner_review_capture_source();

-- Existing Backend-gated preview already serializes decision columns. Enrich its
-- immutable field history with the separately stored original invoice chain.
create or replace function public.fabric_partner_review_preview()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not public.is_backend() then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  return jsonb_build_object(
    'contexts',coalesce((select jsonb_agg(public.fabric_partner_review_context(a.account_number)
      || jsonb_build_object('effective_values',public.fabric_partner_review_effective(a.account_number)) order by a.account_number) from (
      select account_number from public.fabric_partner_master_shadow where company='DAT' and source_present
      union select btrim(account_number) from public.dealer_accounts where nullif(btrim(account_number),'') is not null
      union select account_number from public.fabric_partner_review_decisions) a),'[]'::jsonb),
    'reviews',coalesce((select jsonb_agg(to_jsonb(d)-array['request_id','request_fingerprint'] || jsonb_build_object(
      'reviewer_name',u.full_name,'current_source_fingerprint',c.ctx->>'source_fingerprint',
      'current_portal_fingerprint',c.ctx->>'portal_fingerprint',
      'needs_recheck',d.source_fingerprint is distinct from (c.ctx->>'source_fingerprint')
        or d.portal_fingerprint is distinct from (c.ctx->>'portal_fingerprint') or (c.ctx->>'source_count')::integer<>1,
      'source_invoice_chain',coalesce((select jsonb_agg(jsonb_build_object('account_number',i.account_number,
        'invoice_account_number',i.invoice_account_number) order by i.ordinal)
        from public.fabric_partner_review_invoice_chain i where i.decision_id=d.id),'[]'::jsonb),
      'fields',coalesce((select jsonb_agg(to_jsonb(f)-'decision_id' order by field_name) from public.fabric_partner_review_fields f where f.decision_id=d.id),'[]'::jsonb))
      order by d.account_number,d.version desc)
      from public.fabric_partner_review_decisions d join public.app_users u on u.id=d.reviewed_by
      cross join lateral (select public.fabric_partner_review_context(d.account_number,d.parent_dealer_id) as ctx) c),'[]'::jsonb),
    'parents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'account_number',d.account_number,'company_name',d.company_name) order by d.company_name,d.account_number)
      from public.dealer_accounts d where coalesce(d.is_active,true) and not coalesce(d.is_deleted,false) and not coalesce(d.is_blocked,false)
        and public.fabric_partner_review_portal_type(d.customer_type_label,d.customer_type,d.dealer_type)='dealer'),'[]'::jsonb)
  );
end $$;
revoke all on function public.fabric_partner_review_preview() from public,anon,service_role;
grant execute on function public.fabric_partner_review_preview() to authenticated;
