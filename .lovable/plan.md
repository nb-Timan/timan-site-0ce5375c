# Timan Messe — Exhibition Mode

A new public, login-free portal mode for fairs. Visitors scan a QR → land on `/messe` → use a touch-friendly front page with Configurator (demo), Partner Map, Video, News. No CRM/backend/service/dealer-data access. Backend admins can toggle access on/off and copy the QR.

## 1. Role + access model

- Add new role: `exhibition_user` (display: "Timan Messe").
- Extend `PortalRole` union and `derivePortalRole` so a synthetic exhibition session resolves to this role.
- New AppUser stub `EXHIBITION_USER` (no Supabase auth). Stored in `AppUserContext` via a new `enterExhibitionMode()` action that:
  - clears any existing session,
  - sets `appUser = exhibitionStub`,
  - persists `localStorage["timan.exhibitionMode"] = true` so refresh on `/messe/...` keeps the mode,
  - is reverted by `leaveExhibitionMode()` / normal login.

Allowed routes (whitelist):
```text
/messe
/messe/konfigurator           → wraps /configurator with demoMode flag
/messe/partner-map            → wraps existing Partner Map
/messe/video                  → new VideoPage
/messe/video/:category
/messe/nyt                    → new MessenewsPage
```
Everything else for `exhibition_user` redirects to `/messe`.

## 2. Public entry route

`/messe` (public, no auth gate):
1. Reads backend setting `messe_enabled` (Supabase `app_settings` row, key `messe_enabled`, default `true`).
2. If disabled → renders centered card with: "Messeadgang er ikke aktiv lige nu."
3. If enabled → calls `enterExhibitionMode()` and renders the **Messe front page** with 4 large tiles:
   - Konfigurator → `/messe/konfigurator`
   - Find forhandler → `/messe/partner-map`
   - Video Akademi → `/messe/video`
   - Seneste nyt → `/messe/nyt`
4. Tiles styled as large touch targets (min-h 180px, big icon + label), 2×2 grid on tablet, 1-col on phone, language switcher in header, no portal header chrome that exposes user/CRM menus.

## 3. Route guard

New `<ExhibitionGuard>` wrapper used on protected app routes (CRM/backend/service/etc). If `portalRole === "exhibition_user"`, it `<Navigate to="/messe" replace />`. Mounted alongside the existing portal layout so it covers every non-`/messe` route in one place.

Direct API calls are already gated by Supabase RLS; the exhibition stub has no Supabase session, so any authenticated query fails closed — no data leak even if a guard is bypassed.

## 4. Configurator demo mode

`ConfiguratorPage` reads `isExhibition = portalRole === "exhibition_user"` and a new `demoMode` prop on `useConfigurator`. When demo:
- hides Save / Send quote / Send order / "Mit account" / saved-cases buttons,
- hides internal assignment fields (seller, dealer override),
- forces `language` selectable + prices visible,
- shows persistent small badge in header: "Demo mode".

The existing save/send handlers short-circuit when `demoMode` is true so even direct invocation is a no-op.

## 5. Partner Map visibility

`PartnerMapPage` already lists dealers. Add filter when `isExhibition`:
- include dealer_accounts where `is_active = true` AND type in (`dealer`, `importer`, `service_partner`),
- exclude rows flagged `is_internal_test`, `is_hidden`, `deleted_at not null`,
- never load warranty_registrations.

## 6. Video page (simple)

New file `src/data/messeVideos.ts`:
```ts
export interface MesseVideo {
  id: string; title: Record<Language,string>; description: Record<Language,string>;
  youtubeUrl: string; category: "maskiner"|"redskaber"|"service"|"salg";
  language: Language[]; thumbnail?: string; publishedAt: string;
}
```
`/messe/video` renders sections: Seneste videoer (top 6 by publishedAt) + one section per category, each card uses YouTube thumbnail + opens in modal lite-embed.

## 7. News page (simple)

New Supabase table reuse: extend existing `news_posts` (already used by `LatestFromTiman`) with optional `messe_visible boolean default true, link_url text, active boolean default true`. `/messe/nyt` queries `active = true AND messe_visible = true`, renders cards (image, title, short text, link).

Migration: `db/sql/20260609_news_posts_messe_fields.sql`.

## 8. Backend setting + QR

New backend card in `BackendDataIntegrationsPage` (or new `BackendMessePage`):
- toggle `Messe-adgang aktiv`,
- shows full public URL `https://<host>/messe`,
- "Kopiér link" button,
- "Download QR" button using `qrcode` npm package (already small, ~20kb) — renders a 512×512 PNG client-side from the live URL.

Setting persisted in `app_settings` (key/value JSON table). Migration: `db/sql/20260609_app_settings_messe.sql` creates the table if missing and seeds the row + GRANTs.

## 9. Backend "Vis som rolle"

Add `exhibition_user` / "Timan Messe" to the existing role preview dropdown in `BackendRolesPage` (or wherever `viewAsUser` is selected). Selecting it sets the preview role; the existing `useEffectivePortalUser` already drives UI from that role, so guards + Messe front page render automatically for backend testers.

## 10. Future lead capture (prep only)

Create empty module `src/lib/messeLeadCapture.ts` exporting a typed `MesseLeadDraft` interface (name/company/email/phone/country/machine interest) and a `submitMesseLead(draft)` stub that currently `console.warn`s "not implemented". No UI, no DB writes yet — just clean architecture so a popup can be wired later.

## Files changed / added

Added:
- `src/pages/messe/MesseEntryPage.tsx`
- `src/pages/messe/MesseHomePage.tsx`
- `src/pages/messe/MesseVideoPage.tsx`
- `src/pages/messe/MesseNewsPage.tsx`
- `src/pages/messe/MesseConfiguratorPage.tsx` (thin wrapper passing `demoMode`)
- `src/pages/messe/MessePartnerMapPage.tsx` (wrapper with exhibition filter)
- `src/components/messe/ExhibitionGuard.tsx`
- `src/components/messe/DemoModeBadge.tsx`
- `src/data/messeVideos.ts`
- `src/lib/exhibitionMode.ts` (enter/leave helpers + storage key)
- `src/lib/messeLeadCapture.ts` (interface + stub)
- `src/lib/appSettings.ts` (generic key/value reader)
- `src/pages/backend/BackendMesseSettingsPage.tsx`
- `db/sql/20260609_app_settings_messe.sql`
- `db/sql/20260609_news_posts_messe_fields.sql`

Edited:
- `src/App.tsx` — register `/messe/*` routes + `ExhibitionGuard` on portal routes.
- `src/context/AppUserContext.tsx` — exhibition stub + enter/leave actions, restore from `localStorage`.
- `src/lib/portalAccess.ts` — add `"exhibition_user"` to `PortalRole`, derive helper, permission matrix.
- `src/components/portal/PortalHeader.tsx` — hide user/CRM menus, show "Demo mode" badge when exhibition.
- `src/hooks/useConfigurator.ts` + `src/pages/ConfiguratorPage.tsx` — `demoMode` flag, no-op save/send.
- `src/pages/backend/BackendRolesPage.tsx` (or current "Vis som rolle" host) — add Timan Messe option.
- `src/pages/misc/PartnerMapPage.tsx` — exhibition filter.
- `src/components/portal/LatestFromTiman.tsx` — respect new `messe_visible` flag is unchanged on /portal; query unchanged.
- `package.json` — add `qrcode` + `@types/qrcode`.

## Access rules summary

| Capability | exhibition_user |
|---|---|
| CRM / backend / service / dealer data / saved/sent offers / orders / account | blocked (guard + RLS) |
| Language switch | allowed |
| See prices | allowed |
| Configurator | demo only (no save/send) |
| Partner Map | active dealers/importers/service partners only |
| Video page | allowed |
| News page | allowed |

## Test steps

1. SQL: run both migrations; confirm `app_settings.messe_enabled = true` row exists.
2. Open incognito `/messe` → front page with 4 tiles renders, header has "Demo mode" badge, no user menu.
3. Click Konfigurator → demo configurator opens, Save/Send hidden, prices visible, language switch works.
4. Click Find forhandler → only active dealers/importers/service partners shown; warranty data not requested in network tab.
5. Click Video → sections render; clicking a card plays YouTube.
6. Click Seneste nyt → only `active && messe_visible` news shown.
7. Try `/portal/crm/leads` directly while in exhibition mode → redirects to `/messe`.
8. Backend → Messe settings: toggle off → reload `/messe` → "Messeadgang er ikke aktiv lige nu." message.
9. Backend → Vis som rolle → "Timan Messe" → app reflects exhibition_user UI/permissions.
10. Copy link + download QR PNG buttons work; scanning QR opens `/messe` on phone.