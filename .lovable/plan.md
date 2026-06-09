## Goal

Eliminate "FR heading + EN body" style mixed-language modals across the configurator. Every modal must be 100% in one language: the selected language if its content exists, otherwise English as the documented fallback.

## Root cause

The configurator uses two parallel translation channels:

1. **UI chrome labels** — `T(key) = t(key, uiLanguage)` from `src/data/translations.ts`. Has entries for all 9 portal languages (da, en, de, it, hu, sv, fr, pl, cs), though some keys are still only translated for the 5 legacy languages.
2. **Product / accessory data** (names, `main`, `bullets`, spec values, descriptions) in `src/data/machines.ts` and friends. These are typed as `Record<Language, string>` where `Language = 'da'|'en'|'de'|'it'|'hu'` only. For sv/fr/pl/cs the configurator passes `lang = mapUiLanguageToLegacy(ui) = 'en'`, so data renders in English while chrome renders in French/Swedish/Polish/Czech → mixed modal.

Additionally `getLocalizedName(name, lang)` falls back to `name.da`, not `name.en`, which can leak Danish into otherwise-English modals.

## Strategy

Introduce a single "modal/content language" derived from the legacy `Language`:

```
contentLang  = mapUiLanguageToLegacy(uiLanguage)   // da|en|de|it|hu
contentUiLang = legacyToUi(contentLang)            // dk|gb|de|it|hu (same code in PortalUiLanguage)
```

Inside every modal builder (`buildConfirmationHtml`, machine info modal, accessory info modal, oil modal body, packaging cost modal, auto-added modal, demo machine modal, etc.) use `contentUiLang` for `T()` instead of `uiLanguage`. That way when the user picks FR:

- Product/accessory data resolves to English (already the case).
- Chrome inside the modal (titles, "Main information", "Key features", "Dimensions & technical specifications", "Item no.", "Ref.", "Description", spec labels) also resolves to English.
- Result: the entire modal is English. No mixing.

For DK/GB/DE/IT/HU nothing changes — `contentUiLang === uiLanguage`.

## Scope of code changes

All edits live in the configurator and translation helpers — no data migration, no new translations required.

### `src/lib/portalLanguages.ts`
- Add `legacyToUi(lang: Language): PortalUiLanguage` (identity, since 'da'/'en'/'de'/'it'/'hu' are valid `PortalUiLanguage`s). Export.
- Add `resolveContentUiLanguage(ui)`= `legacyToUi(mapUiLanguageToLegacy(ui))`.

### `src/data/machines.ts`
- `getLocalizedName`: fall back `name[lang] || name.en || name.da || ''` (English first, Danish last). Matches the documented fallback chain.

### `src/pages/ConfiguratorPage.tsx`
- Compute `const contentUiLang = resolveContentUiLanguage(uiLanguage);` next to `T`.
- Introduce `const TC = (key: string) => t(key, contentUiLang);` for use inside modal/HTML builders.
- Replace `T(...)` with `TC(...)` inside:
  - machine info modal HTML builder (lines ~805–828)
  - accessory info modal HTML builder (lines ~835–850)
  - auto-add toast/modal (`showAutoAddModal`)
  - packaging cost modal trigger (`setInfoModal({ title: T('packagingCostTitle'), content: T('packagingCostBody') })`)
  - demo machine modal title/body (lines ~868–872)
  - `buildConfirmationHtml` chrome (`reqNrLabel`, totals, warranty/oil notice blocks)
  - oil modal body (`OilModalBody` if it uses `T`)
- Replace `translateSpecLabel(label, uiLanguage)` with `translateSpecLabel(label, contentUiLang)` inside the same modal builders.
- Replace `itemNoLabel(uiLanguage)` similarly where it appears inside modal/PDF HTML.
- Use `contentUiLang` for the modal-internal "Cancel/Close" labels and for any inline `Record<Language, string>` lookups already keyed by `lang` (no functional change but keeps the rule consistent).

### `src/components/configurator/*` modal-like components
Audit and apply the same `contentUiLang`-vs-`uiLanguage` split where the component renders product/accessory data inside a Dialog/Popover:
- `RecommendationInfoPopover.tsx`
- `GuestVisitorPopup.tsx` (if it surfaces product copy)
- `DeliveryStep.tsx` info dialogs
- `AccountPanel.tsx` confirmation dialog

For components that only show plain UI chrome (no product data), keep `uiLanguage` — those are not mixed.

### `src/components/ui` shared dialogs
No changes; they are language-agnostic primitives.

## Verification

Manual smoke test for FR, SE, PL, CZ on `/configurator`:
1. Open machine info modal (each of RC-1000s, RC-751, Timan 2620, Timan 3330, Loader-Line) → entire modal English.
2. Open accessory info modal for items with `Beskrivelse` and tech specs → entire modal English (spec labels translated via `SPEC_LABEL_MAP` already cover FR/SE/PL/CZ — they will still render in those languages; if mixing reappears we tighten by passing `contentUiLang` to `translateSpecLabel` too — already in the plan).
3. Trigger auto-add modal (e.g. toggle V-plow → rust protection auto-add) → fully English in FR/SE/PL/CZ.
4. Trigger packaging-cost modal (LOOSE_TOOL flow) → fully English.
5. Trigger oil selector modal → fully English body + buttons.
6. Open confirmation modal → English content; the surrounding page chrome stays in FR (this is expected because it's outside the modal).
7. Re-test DK, GB, DE, IT, HU → unchanged behavior (modals stay in the selected language because `contentUiLang === uiLanguage`).

Add a Vitest unit test for `resolveContentUiLanguage` covering all 9 codes.

## Out of scope

- Translating product names, descriptions, bullets and spec values into FR/SE/PL/CZ (would require content from product owners; we keep English fallback per the user's explicit instruction).
- Widening the `Language` type to all 9 codes (a much larger refactor, breaks every existing `Record<Language, string>`).
- Changes outside the configurator (portal, service, claims, warranty modals).
