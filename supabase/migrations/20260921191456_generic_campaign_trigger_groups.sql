alter table public.marketing_campaigns
  add column trigger_match_mode text not null default 'any'
  check (trigger_match_mode in ('any', 'all'));

comment on column public.marketing_campaigns.trigger_match_mode is
  'How trigger products form one completed trigger set: any (OR/aggregate) or all (AND).';
