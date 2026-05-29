## Plan — Budget pr. forhandler i CRM

Trinvist, ingen ændring af budgetmodulets gemmeflow. Genbruger eksisterende services. Beder om bekræftelse før implementation, fordi DEL 4 afhænger af en datamodel-beslutning (se "Beslutningspunkt" nedenfor).

### Datamodel — fundet ved undersøgelse

| Område | Tabel/service | Status |
|---|---|---|
| Arbejdsbudget pr. forhandler/måned | `crm_budget_dealer_lines` (via `crmBudgetService.fetchDealerLines`) | OK — bruges af Budget Dashboard |
| Realiserede ordrer (vundne) | `configurations` + `listScopedOrdersWithValue` (dealer_account_number/dealer_number, sorteret på `order_sent_at`/`submitted_at`) | OK |
| Åbne tilbud | `listScopedOpenQuotes` + `dealerKeyOf` | OK |
| Leads pr. forhandler | `crmLeadsService` (`linked_dealer_id`) | OK |
| Demoer pr. forhandler | `crmLeadsService` demos (`dealer_company`) | OK |
| Budget-referencer | `budget_references` med `delta_qty` + `reference_group_id` (Phase 46/47) | OK |
| Adgang/scope | `crmScope` (`isCrmAdmin`, `isScopedSeller`) + `fetchDealerAccountsForSeller` | OK |

**Konklusion:** Ingen ny SQL er nødvendig for DEL 1, 2, 3, 5. DEL 4 afhænger af beslutningspunkt nedenfor.

### Beslutningspunkt for DEL 4 (månedlig historik med referencer pr. forhandler)

`budget_references` har `dealer_name` (fritekst-felt valgt i modal), men IKKE `dealer_account_id`/`dealer_account_number`. For at vise referencer pålideligt pr. forhandler kan jeg enten:

- **A. Matche på `dealer_name`** (normaliseret) mod forhandlerens `company_name`. Hurtigt, ingen SQL. Risiko: stavefejl/ændrede navne giver mismatch.
- **B. Tilføj `dealer_account_number` til `budget_references`** (additiv migration) og udfyld fremover fra modal. Korrekt, men kræver SQL + lille ændring i `BudgetReferenceModal` til at sætte feltet.

Anbefaling: **B** — det er den eneste robuste løsning, og det matcher kravet "Hvis eksisterende datamodel ikke understøtter…, stop og forklar SQL". Stoppe og spørge inden DEL 4 implementeres.

### Implementation (rækkefølge)

**DEL 1 — Budget YTD + status på Mine forhandlere**
- Ny helper `computeDealerBudgetYtd(dealerAccountNumber, year)` i `src/lib/crmDealerBudget.ts` der:
  - henter `fetchDealerLines` for året (allerede cached pr. sælger i Dashboard) og summer kvantitet jan→nuværende måned for arbejdsbudget hvor `dealer_account_number` matcher;
  - henter `listScopedOrdersWithValue` og tæller vundne ordrer i samme periode (`order_sent_at` ≤ slut-af-nuværende-måned) hvor dealer matcher.
- 2 nye kolonner i `CrmMyDealersPage`: "Budget YTD" (`X / Y stk.`) og "Budget status" (progress bar + %). Tom-state: "Intet budget".
- Batch-fetch én gang pr. side-load (én dealer-lines-kald + én orders-kald), beregn lokalt — ingen N+1.

**DEL 2 — Budgetkort på forhandlerens detaljeside**
- Ny komponent `DealerBudgetCard` i `src/components/crm/DealerBudgetCard.tsx`. Viser: Årsbudget, Budget YTD, Realiseret YTD, Pipeline (åbne tilbud sum-qty), Forventet (Realiseret + Pipeline), Mangler YTD, Mangler forventet, progress bar. Pipeline aldrig medregnet som realiseret.

**DEL 3 — Klikbare KPI-tal på detaljesiden**
- Wrap KPI-værdier "Åbne leads", "Tilbud", "Demoer", "Ordrer" i Radix `Popover` (eksisterer i `ui/popover.tsx`). Popover-indhold: liste af poster for **kun denne forhandler** (allerede filtreret via dealer-scope-funktioner). Klik på post → naviger til detaljerute hvis findes (`/portal/crm/leads/:id`, `/portal/crm/demo-leads/:id`, `/portal/crm/quotes-orders` med highlight); ellers vises kun i popover. Tom-state håndteres.

**DEL 4 — Månedlig budgethistorik (STOP for bekræftelse)**
- Kræver beslutning A vs B ovenfor. Hvis B: ny migration `docs/sql/phase48_budget_references_dealer_account.sql` (additiv) + lille ændring i `BudgetReferenceModal` til at sætte `dealer_account_number` på nye rækker. Visning: kompakt 12-måneders tabel med Budget/Realiseret/Difference/Referencer (samlet `delta_qty` pr. måned). Read-only.

**DEL 5 — Testcases**
- Forhandler med/uden budget, med/uden leads/demo/tilbud.
- Sælger-scope vs admin: sælger ser kun egne; admin/backend ser alt (genbruger eksisterende `crmScope`).
- Reference-tal i historik = `delta_qty`-sum (ikke `new_value`), så 2 stk. på en reference vises som 2 stk. — uden at overskrive eksisterende.

### Filer der vil blive ændret (estimat)
- Nye: `src/lib/crmDealerBudget.ts`, `src/components/crm/DealerBudgetCard.tsx`, `src/components/crm/DealerKpiPopover.tsx`, evt. `src/components/crm/DealerBudgetHistory.tsx`.
- Ændret: `src/pages/crm/CrmMyDealersPage.tsx`, `src/pages/crm/CrmDealerDetailPage.tsx`.
- Ikke rørt: budgetmodulets gemmeflow, `CrmBudgetPage`, `BudgetReferenceModal`s allokeringslogik (kun ny optional kolonne hvis B vælges).

### Spørgsmål jeg har brug for svar på, før jeg implementerer

1. Skal jeg gå direkte i gang med DEL 1–3 + 5 (ingen SQL), og derefter stoppe og spørge før DEL 4?
2. For DEL 4: vælger du **A** (matche på dealer_name, ingen SQL) eller **B** (tilføj `dealer_account_number` til `budget_references`, en lille additiv SQL)?
