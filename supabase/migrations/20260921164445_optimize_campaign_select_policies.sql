drop policy marketing_campaigns_read_active on public.marketing_campaigns;
drop policy marketing_campaigns_manage_select on public.marketing_campaigns;

create policy marketing_campaigns_read_active_anon
on public.marketing_campaigns for select
to anon
using (
  status = 'published'
  and published_at is not null and published_at <= now()
  and starts_at <= now() and ends_at > now()
);

create policy marketing_campaigns_read_authenticated
on public.marketing_campaigns for select
to authenticated
using (
  (
    status = 'published'
    and published_at is not null and published_at <= now()
    and starts_at <= now() and ends_at > now()
  )
  or (select public.can_manage_marketing_configurator_content())
);

drop policy marketing_campaign_products_read_active on public.marketing_campaign_products;
drop policy marketing_campaign_products_manage_select on public.marketing_campaign_products;

create policy marketing_campaign_products_read_active_anon
on public.marketing_campaign_products for select
to anon
using (exists (
  select 1 from public.marketing_campaigns campaign
  where campaign.id = campaign_id
    and campaign.status = 'published'
    and campaign.published_at is not null and campaign.published_at <= now()
    and campaign.starts_at <= now() and campaign.ends_at > now()
));

create policy marketing_campaign_products_read_authenticated
on public.marketing_campaign_products for select
to authenticated
using (
  exists (
    select 1 from public.marketing_campaigns campaign
    where campaign.id = campaign_id
      and campaign.status = 'published'
      and campaign.published_at is not null and campaign.published_at <= now()
      and campaign.starts_at <= now() and campaign.ends_at > now()
  )
  or (select public.can_manage_marketing_configurator_content())
);
