begin;

alter view public.crm_configurations_view set (security_invoker = true);

revoke all on function public.sales_stock_actor_can_manage() from public, anon, authenticated;

commit;
