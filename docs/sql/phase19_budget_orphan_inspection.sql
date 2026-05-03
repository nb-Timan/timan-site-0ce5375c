-- =====================================================================
-- Phase 19 — Inspect orphan / wrongly-owned CRM Budget rows
--
-- READ-ONLY. Run these in the Supabase SQL editor to find rows that
-- the backend "Alle sælgere" total includes but no seller view shows.
--
-- Known seller emails (must match src/lib/crmBudgetService.ts BUDGET_SELLERS):
--   bp@timan.dk, em@timan.dk, jtn@timan.dk, akr@timan.dk, nb@timan.dk
--
-- Do NOT delete or update anything based on these queries automatically.
-- Review the output, decide per-row what to do, then run a targeted
-- UPDATE / DELETE manually.
-- =====================================================================

-- 1) Rows with NO seller owner at all (NULL or empty seller_email AND
--    no seller_initials AND no seller_id).
select id, year, product_key, product_name, item_number,
       seller_id, seller_initials, seller_email, qty_budget, value_budget,
       created_at
from public.crm_budget_lines
where coalesce(nullif(trim(seller_email), ''), '') = ''
  and coalesce(nullif(trim(seller_initials), ''), '') = ''
  and seller_id is null
order by year desc, product_key;

-- 2) Rows whose seller_email is NOT one of the 5 known sellers
--    (e.g. saved under a backend user like NB before NB was a seller,
--    or under any other email). These are the typical culprits when a
--    backend total (RC-751 = 4) doesn't show up in any seller view.
select id, year, product_key, product_name, seller_initials, seller_email,
       qty_budget, value_budget, created_at
from public.crm_budget_lines
where lower(coalesce(seller_email, '')) not in (
        'bp@timan.dk', 'em@timan.dk', 'jtn@timan.dk', 'akr@timan.dk', 'nb@timan.dk'
      )
order by year desc, product_key;

-- 3) Per-seller totals for a given year (sanity check). The sum across
--    all sellers should match the backend "Alle sælgere" total.
select year,
       coalesce(nullif(seller_initials, ''), '— (orphan)') as seller,
       product_key,
       sum(qty_budget) as qty
from public.crm_budget_lines
where year = 2026   -- ← change as needed
group by year, seller, product_key
order by product_key, seller;

-- 4) Quick orphan vs assigned summary per year.
select year,
       count(*) filter (where lower(coalesce(seller_email, '')) in (
         'bp@timan.dk','em@timan.dk','jtn@timan.dk','akr@timan.dk','nb@timan.dk'
       )) as assigned_rows,
       count(*) filter (where lower(coalesce(seller_email, '')) not in (
         'bp@timan.dk','em@timan.dk','jtn@timan.dk','akr@timan.dk','nb@timan.dk'
       )) as orphan_rows
from public.crm_budget_lines
group by year
order by year desc;

-- =====================================================================
-- After review, examples of MANUAL cleanup (run only on rows you've
-- inspected — do NOT batch-blind):
--
--   -- Re-assign a known orphan to NB:
--   update public.crm_budget_lines
--   set seller_email = 'nb@timan.dk', seller_initials = 'NB',
--       seller_name = 'NB', country = coalesce(country, 'DK')
--   where id = '<row-id>';
--
--   -- Delete a confirmed bad row:
--   delete from public.crm_budget_lines where id = '<row-id>';
-- =====================================================================
