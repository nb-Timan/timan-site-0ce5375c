# Portal-Wide Localization Plan

The current state: language switcher + fallback layer ship; ~5 inline `Record<Language,…>` T objects per page still hardcode da/en/de/it/hu only. Extending real coverage to SE/FR/PL/CZ across the entire portal (CRM, Service, Warranty, Claims, Backend, Configurator, ~50 pages) is a large change. To keep diffs reviewable and the app stable I'll ship it in 4 PR-sized stages, each independently testable.

## Stage 1 — Expand the central registry + shared chrome (this PR)

Files:
- `src/lib/i18n/translations.ts` — add ~120 keys covering: nav cards (Sales & Marketing, Technical & Service, Misc, Backend, Resources, Video gallery, Partner map, Configurator), common buttons (Open, Back to portal, Back to Sales & Marketing, Back to Technical & Service), CRM tab labels (My dealers, Leads, Quotes, Orders, Activities, Calendar, Budget, Budget Dashboard, Reports), Service/Warranty headers (Service tickets, Search machine, Warranty registration, Claims, TSB, Service registration and maintenance), shared status/priority labels, empty states, "No results", validation messages. Full dictionaries for `da`, `en`, `de`, `it`, `hu`, `sv`, `fr`, `pl`, `cs`.
- `src/pages/PortalPage.tsx` — replace hardcoded card titles/subtitles with `t(key, uiLanguage)`.
- `src/pages/PortalAreaPage.tsx` — same for area landing pages (Sales & Marketing, Technical & Service, Misc, Backend headers + "Back to portal").
- `src/components/crm/CrmLayout.tsx` — translate nav tab labels via `t()`.

Result after Stage 1: portal front page, all 4 area landing pages and CRM tab strip are fully localized in all 9 languages. Currency stays EUR for sv/fr/pl/cs via existing legacy mapping.

## Stage 2 — Configurator: extend language type to 9 codes

This is invasive because `Language = 'da'|'en'|'de'|'it'|'hu'` is referenced in ~80 files (every page that uses `Record<Language, string>`).

Approach:
- Widen `Language` in `src/types/configurator.ts` to include `'sv'|'fr'|'pl'|'cs'` (i.e. make it equal to `PortalUiLanguage`).
- Add a `resolveT<T>(table: Partial<Record<Language,T>>, lang): T` helper that returns `table[lang] ?? table.en ?? table.da`. Use it in the configurator's existing T objects so they don't need new entries to compile.
- Extend configurator's flag bar (`ConfiguratorPage.tsx` ~line 1946) to render all 9 `PORTAL_LANGUAGES`.
- Add full sv/fr/pl/cs translations to the configurator's largest T blocks (step labels, CTA buttons, summary, ownership picker, account panel).

Result: configurator opens in any of 9 languages, syncs with portal language; untranslated strings fall back to English instead of crashing.

## Stage 3 — Service, Warranty, Claims, Backend pages

Per page: add T entries for sv/fr/pl/cs (mirroring en), or migrate to `t()` from the central registry where the strings are reused.

Pages: `WarrantyPage`, `ClaimsPage`, `NewClaimPage`, `ClaimDetailPage`, `ServiceMaintenancePage`, all under `src/pages/service/*`, all under `src/pages/backend/*`, `src/pages/tsb/*`, `ResourcesPage`, `VideoGalleryPage`, `VideoCategoryPage`, `Co2CalculatorPage`, `DriftberegnerPage`.

## Stage 4 — CRM internals

Page-by-page T expansion for: `CrmDashboardPage`, `CrmMyDealersPage`, `CrmLeadsPage`, `CrmQuotesOrdersPage`, `CrmActivitiesPage`, `CrmCalendarPage`, `CrmBudgetPage`, `CrmBudgetDashboardPage`, `CrmDealerDetailPage` (large — overview labels, notes, follow-up, table headers, filters).

## What you'll get in this PR (Stage 1)
1. Central registry grows from ~30 to ~150 keys, all in 9 languages.
2. Portal front, all 4 area pages, and CRM tab strip render natively in DK/GB/DE/IT/HU/SE/FR/PL/CZ.
3. Stages 2-4 remain as follow-up PRs; until then those pages display the legacy en/da fallback when SE/FR/PL/CZ is selected — no crashes, no missing UI.

## How to test Stage 1
1. Open `/portal`, switch language to each of the 9 flags — card titles/subtitles localize.
2. Open Sales & Marketing, Technical & Service, Misc, Backend — headers and "Back to portal" localize.
3. Open `/portal/crm/my-dealers` — tab strip localizes; table content still uses legacy en fallback (Stage 4).
4. Language persists across navigation (already wired via `LanguageContext`).
5. Confirm no console errors.

## Why staged
A single PR that adds 9-language coverage to every page would touch 80+ files with ~3,000 lines of translation tables and require widening the `Language` type (cascading TS errors across the configurator). Each stage is reviewable in ~15 minutes and shippable independently. Approve Stage 1 and I'll proceed; I can chain the remaining stages back-to-back without further questions if you want.
