-- Disambiguate the contract review history audit call for databases that have
-- both 10-argument and 11-argument append_partner_agreement_history overloads.

create or replace function public.complete_dealer_contract_guided_review(
  p_contract_id uuid,
  p_snapshot jsonb,
  p_expected_signed_pages integer default null
)
returns public.dealer_contracts
language plpgsql
security definer
set search_path = public
as $$
declare
  actor jsonb := public.current_app_user_json();
  result public.dealer_contracts;
begin
  if not public.can_read_dealer_contract(p_contract_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.dealer_contracts
  set contract_status = 'ready_for_signature',
      status = 'Ready for signature',
      final_snapshot = p_snapshot || jsonb_build_object('lockedAt', now(), 'contractId', p_contract_id),
      expected_signed_pages = greatest(coalesce(p_expected_signed_pages, expected_signed_pages, 1), 1),
      guided_review_completed_at = now(),
      guided_review_completed_by_user_id = auth.uid(),
      guided_review_completed_by_name = actor ->> 'display_name',
      guided_review_completed_by_email = actor ->> 'email',
      updated_at = now()
  where id = p_contract_id
    and contract_status in ('pending_decision', 'draft', 'guided_review', 'ready_for_signature')
  returning * into result;

  if result.id is null then
    raise exception 'contract cannot be completed from current status';
  end if;

  perform public.audit_dealer_contract_event(p_contract_id, 'guided_review_completed', jsonb_build_object('expected_signed_pages', result.expected_signed_pages));
  perform public.audit_dealer_contract_event(p_contract_id, 'snapshot_created', jsonb_build_object('contract_version', result.contract_version));
  perform public.append_partner_agreement_history(
    result.dealer_account_id,
    'contract_review_completed'::text,
    'Kontraktgennemgang afsluttet'::text,
    'Den guidede kontrakt blev låst og gjort klar til underskrift.'::text,
    result.id,
    null::uuid,
    null::uuid,
    null::text,
    null::text,
    jsonb_build_object('contract_status', result.contract_status, 'expected_signed_pages', result.expected_signed_pages)
  );
  return result;
end;
$$;

revoke all on function public.complete_dealer_contract_guided_review(uuid, jsonb, integer) from public;
grant execute on function public.complete_dealer_contract_guided_review(uuid, jsonb, integer) to authenticated;
