-- The project has legacy default table grants. Keep the release audit readable
-- through backend RLS, but make every release write go through the guarded RPC.
revoke all on public.price_list_releases from public, anon, authenticated;
revoke all on public.price_list_release_items from public, anon, authenticated;

grant select on public.price_list_releases to authenticated;
grant select on public.price_list_release_items to authenticated;
