create index marketing_campaigns_created_by_idx
  on public.marketing_campaigns (created_by)
  where created_by is not null;

create index marketing_campaigns_updated_by_idx
  on public.marketing_campaigns (updated_by)
  where updated_by is not null;
