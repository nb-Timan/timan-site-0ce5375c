-- An explicitly stored crm_leads.probability is canonical. Activity/stage
-- percentages are fallbacks only for legacy rows without a stored value.
--
-- Keep the existing scoped query definition intact and update only its
-- numeric probability branches. This avoids changing its RLS/scope logic.
do $$
declare
  function_definition text;
  has_old_fallbacks boolean;
  has_canonical_probability boolean;
begin
  select pg_get_functiondef(
    'public.crm_leads_page_query(boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz)'::regprocedure
  ) into function_definition;

  has_old_fallbacks := position('when ''Follow-up on leads'' then 25' in function_definition) > 0;
  has_canonical_probability := position('when ''Follow-up on leads'' then coalesce(l.probability, 25)' in function_definition) > 0;

  if has_canonical_probability then
    return;
  end if;

  if not has_old_fallbacks then
    raise exception 'crm_leads_page_query does not contain the expected probability fallback';
  end if;

  function_definition := replace(function_definition, 'when ''Wants to be contacted'' then 15', 'when ''Wants to be contacted'' then coalesce(l.probability, 15)');
  function_definition := replace(function_definition, 'when ''Lead sent to the dealer'' then 10', 'when ''Lead sent to the dealer'' then coalesce(l.probability, 10)');
  function_definition := replace(function_definition, 'when ''Sales material sent to the customer'' then 30', 'when ''Sales material sent to the customer'' then coalesce(l.probability, 30)');
  function_definition := replace(function_definition, 'when ''Customer requests a demonstration'' then 50', 'when ''Customer requests a demonstration'' then coalesce(l.probability, 50)');
  function_definition := replace(function_definition, 'when ''Follow-up on leads'' then 25', 'when ''Follow-up on leads'' then coalesce(l.probability, 25)');
  function_definition := replace(function_definition, 'when ''Offer sent to the customer'' then 70', 'when ''Offer sent to the customer'' then coalesce(l.probability, 70)');
  function_definition := replace(function_definition, 'when ''Closed with order'' then 100', 'when ''Closed with order'' then coalesce(l.probability, 100)');
  function_definition := replace(function_definition, 'when ''Closed without order'' then 0', 'when ''Closed without order'' then coalesce(l.probability, 0)');
  function_definition := replace(function_definition, 'when ''Not relevant'' then 0', 'when ''Not relevant'' then coalesce(l.probability, 0)');
  function_definition := replace(function_definition, 'when ''New lead'' then 10', 'when ''New lead'' then coalesce(l.probability, 10)');

  execute function_definition;
end;
$$;
