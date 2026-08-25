-- Allow extra director contacts in dealer profile contact lists.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname
    INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'dealer_contacts'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%contact_area%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.dealer_contacts DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.dealer_contacts
  ADD CONSTRAINT dealer_contacts_contact_area_check
  CHECK (contact_area IN ('director','sales','workshop','parts','marketing','finance'));
