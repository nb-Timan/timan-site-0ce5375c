# Shadow replay: missing historical baseline

## Evidence

- Source commit: `3722fc7196487039b5f08a9407bd290d1b5cb5bf` (`origin/main` at capture).
- Live migrations: 138. Source migrations: 139.
- Source-only versions: 61. This is broader than the previously identified 31-file working-tree set.
- Read-only live catalog snapshot SHA-256: `1fc7d3cccc5c4841bc7a4cd08c6c61c86374805b25cf7a1528912d7ead49f760`.
- Runtime: isolated PGlite 0.5.8 PostgreSQL instances, not a full Supabase stack. Supabase extension parity has not been tested.
- Shadow A used captured live migration statements in version order.
- Shadow B used SQL read from the pinned source commit in version order.
- Each source-only version was omitted in an independent fresh B replay.

## Actual results

All 63 runs (A, B, and 61 omissions) failed before applying any migration:

```text
version: 20260806131342
SQLSTATE: 42P01
relation "public.dealer_accounts" does not exist
```

The first migration alters an existing table; it does not bootstrap it. Captured migration history did not contain the searched CREATE TABLE definitions for dealer_accounts, app_users, or configurations.

Independent bootstrap probes of these repository files also failed:

| Candidate | Result |
| --- | --- |
| docs/sql/phase9_dealer_accounts.sql | 42P01: public.app_users missing |
| docs/sql/phase1b_portal_profile.sql | 42P01: public.app_users missing |
| docs/sql/phase2_backend_users.sql | 42P01: public.app_users missing |

The Git-history search found dealer_accounts creation in documentation commit `7342aa35af6e2035eb7684fe73107cfd82bfd1ca`, but no app_users CREATE TABLE match in the searched SQL/TypeScript history. These searches do not establish that an external historical baseline never existed.

## Interpretation and safety

The omission runs never reached their omitted versions. They provide no evidence that any of the 31 requested migrations is redundant, pending, or ambiguous in isolation. Lexical SQL matches under different version numbers are comparison evidence, not complete runtime-effect proof.

An independently justified pre-20260806131342 baseline is required to continue the requested historical replay. Bootstrapping from the final live schema would make an omission-based proof circular. Native Supabase extension behavior will also require a compatible test runtime once the baseline is available.

No migration repair, historical SQL execution against live, Academy deployment, or live business-data writes were performed in this replay phase. Full schema/RPC/RLS parity is NOT established. No successful db push dry-run is claimed.

Private detailed results and the live snapshot are retained locally under ignored `.forensic-runtime/`; they must not be committed as public artifacts.
