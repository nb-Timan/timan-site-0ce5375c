create or replace function public.guard_configurator_campaign_opt_out()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  campaign_disabled jsonb := new.state_json -> 'campaignDisabled';
  snapshot jsonb := new.state_json -> 'pricingSnapshot';
begin
  if campaign_disabled is not null and jsonb_typeof(campaign_disabled) <> 'boolean' then
    raise exception 'INVALID_CAMPAIGN_OPT_OUT';
  end if;

  if campaign_disabled = 'true'::jsonb and jsonb_typeof(snapshot) = 'object' then
    if exists (
      select 1
      from jsonb_array_elements(coalesce(snapshot -> 'discountDetails', '[]'::jsonb)) as detail
      where detail ->> 'kind' = 'campaign'
    ) then
      raise exception 'CAMPAIGN_OPT_OUT_INCONSISTENT';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(coalesce(snapshot -> 'campaignLines', '[]'::jsonb)) as line
      where coalesce((line ->> 'applied')::boolean, false)
         or coalesce((line ->> 'discountAmount')::numeric, 0) <> 0
         or line ->> 'suppressedReason' is distinct from 'campaign_opt_out'
    ) then
      raise exception 'CAMPAIGN_OPT_OUT_INCONSISTENT';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_configurator_campaign_opt_out() from public, anon, authenticated;

drop trigger if exists guard_configurator_campaign_opt_out on public.configurations;
create trigger guard_configurator_campaign_opt_out
  before insert or update of state_json on public.configurations
  for each row execute function public.guard_configurator_campaign_opt_out();
