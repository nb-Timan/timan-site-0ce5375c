# Canonical data-modelling principles

## ONE BUSINESS ATTRIBUTE PER COLUMN

This rule applies to every new or modified Timan model, including Portal,
Supabase, Fabric staging, reporting, and semantic models.

- Separate company name, CVR/VAT number, contact person, phone, email, address,
  postal code, city, and country. Never introduce a `contact_information` blob.
- Apply the same rule to dealers, customers, machines, delivery, orders,
  products, prices, sellers, dates, and statuses.
- Use stable IDs/UUIDs for relationships. Names are not keys. Distinguish a
  current customer dimension from the contact snapshot on an historical revision.
- Use native dates, UTC timestamps, booleans, integers and exact decimals.
  Store currency separately from amounts. Display strings are not numeric data.
- Represent repeating lines, machines, discounts and references as child rows,
  never numbered columns or concatenated strings.
- JSON is appropriate for genuinely dynamic data and lossless raw ingestion,
  including existing source snapshots. Promote stable business attributes to
  typed columns in curated models; JSON must not replace relational modelling.
- Preserve existing composite fields, source snapshots and revision history for
  compatibility. Do not copy legacy composite fields into new canonical models.
  This rule does not authorize an unrelated CRM leads refactor.

## Source and refresh contracts

Select source tables explicitly. In an already-selected raw table, preserve new
columns automatically where supported; keep reporting/semantic additions deliberate.
Validate source metadata before writing: missing/renamed tables or columns and
datatype changes must stop the load with an actionable error. Never silently
replace a schema using `overwriteSchema` to hide a contract break.

Do not infer a schema from one order. Do not drop rows to make quality checks
pass. Preserve zero values and missing values distinctly. Financial reporting
must use frozen historical values, with explicit quality status when unavailable.

Do not broaden access to confidential data as part of ingestion. Use the
existing authorized connection and restricted workspace; no embedded credentials,
browser tokens, public storage or RLS bypasses. Keep authentication/permission
columns out of analytical user projections.
