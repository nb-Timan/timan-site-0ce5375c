-- Supabase retained an explicit anon grant from the predecessor function.
-- Dealer submission is authenticated-only; the RPC itself derives identity
-- server-side and must never be callable by anon.
revoke execute on function public.create_scoped_portal_warranty_registration(jsonb) from anon;
