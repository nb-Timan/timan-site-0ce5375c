-- Keep internal Partnerdata authorization helpers behind the three scoped
-- write RPCs. Existing databases may retain explicit authenticated grants
-- even after the public/anon grants are removed.
revoke all on function public.partnerdata_effective_actor_id(uuid) from authenticated;
revoke all on function public.can_edit_partnerdata_account_as(uuid, uuid) from authenticated;
