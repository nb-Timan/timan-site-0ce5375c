# Academy shared-module verification

## Scope and architecture

Verified with MCP/browser on local Vite port 4183. Academy remains subject to
the existing local/development activation rule; this is not evidence of a
Lovable or production deployment. Base origin/main: 31719439.

The separate Academy Partnerdata workspace and Partnerkort page are removed.
Training uses the existing Configurator, Video Gallery, Partnerdata list/detail/
profile/history, Leaflet Partnerkort, CRM lead editor/sharing/demo form, and
dealer invoice form. Academy-specific code supplies typed local data,
persistence, guidance, routing context and progress tracking only.

## Browser results

| Flow | Action and persistence evidence | Result |
| --- | --- | --- |
| Sales Case 1 | RC-1000s, required accessories, light/wiring dependency, quantity and delivery discounts; reload retained configuration; Save case did not complete; training quote then Academy lead completed 10/10; reload retained completion | PASS |
| Sales Case 2 | Wrong video did not complete; real machine/type filters found the existing canonical target; filters survived reload; target player completed 4/4; favorites persisted in the normal gallery controls | PASS |
| Portal Basics | FR then original DK; actual Partnerdata then Timan logo; fullscreen; actual Partnerkort area change; canonical news opened; 5/5 retained after reload | PASS |
| Partnerdata Part 1 | Real list/detail/profile; saved primary contact and YouTube value; reload/reopen retained profile and 3/3 | PASS |
| Partnerdata Part 2 | Actual agreement-history relation observed; actual dealer invoice form submitted locally; receipt and 2/2 retained after reload | PASS |
| CRM Case 1 | Real lead editor saved future follow-up and completed Configurator lead; reload/reopen retained changes and 2/2 | PASS |
| CRM Case 2 | Real lead activity, dealer sharing dialog and demo form; local full demo record persisted; reload retained 3/3 | PASS |

Dashboard showed 7/7 and 100%. Continue reopened completed cases. Small viewport
(390 x 844) checked real Configurator, Video Gallery, Partnerdata and Partnerkort;
no page-level horizontal overflow on the checked layouts. Viewport override was
reset after testing.

Leaving Academy returned to the normal login screen without training identity
or guidance. No guest lead/login record was submitted. Authenticated production
CRM actions were not replayed; normal delegation and write pass-through are
covered by targeted tests, not claimed as a fresh production-session test.

## Safety and limits

- Production Supabase business writes during training: NONE.
- No schema, RLS, migration or production-data changes.
- The shared Supabase client rejects mutation and RPC requests before network
  dispatch while local Academy is active. Local adapters handle the tested saves.
- Read-only public content/media can still load normally.
- Optional Partnerdata workflows outside these cases are not claimed as complete
  local simulations. The write guard fails closed for an unadapted write caller.
- No alternate module UI remains. CRM's Academy route is a context wrapper around
  the existing CRM list, not a replacement list/editor.
- Lovable verification: PENDING (credits).

## Automated checks

- Academy, Configurator quantity-discount and affected contract test suites:
  74 tests across 11 files.
- App TypeScript check: `npx tsc --noEmit -p tsconfig.app.json`.
- Production build: `npm run build`.
- Patch whitespace validation: `git diff --check`.

Two existing contract test fixture typing issues were corrected without changing
contract assertions or business logic. Build retains existing chunk-size and
Browserslist age warnings.
