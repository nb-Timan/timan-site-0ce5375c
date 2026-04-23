

# Apply new front-end design to dealer portal

Replace the visuals of `/portal` with the layout from your HTML mockup, while keeping all current behavior (auth, routing, language switcher, role gating, configurator link, login fallback).

## What changes (visual / structural)

**Top header bar (`PortalHeader.tsx`)**
- Left: bold green "TIMAN" wordmark + thin divider + light gray "Forhandler Portal" subtitle.
- Right: language flags (kept), role pill (kept), and a new compact user chip — circular green avatar with the user's initials + company / display name next to it.
- Logout button kept (icon-only on small screens, label on desktop).
- Light bottom border, white background — matches the mockup.

**Hero / welcome banner (`PortalPage.tsx`)**
- Replace the current dark green gradient with the mockup's lighter card style:
  - White rounded card on a soft gray page background.
  - Left side: large square Timan logo block (green, rounded, big "T").
  - Right side: "Velkommen til Timan{, name}" headline + subtitle ("Din centrale adgang til konfiguration, salgsværktøjer og teknisk support.").
- Translations preserved for all 5 languages.

**4-card grid (`ModuleCard.tsx`)**
- Same 4 modules — order and IDs unchanged: Byg din Timan, Video Galleri, Ressourcer, Diverse.
- New card style to match mockup:
  - White card, rounded-2xl, soft shadow, subtle hover lift.
  - Larger square icon tile (light tinted background per accent color) at the top.
  - Title (bold) + description (gray).
  - Bottom CTA row: green text link ("Gå til konfigurator", "Se videoer", "Åbn bibliotek", "Se mere") + arrow icon.
- "Coming soon" badge kept for disabled cards (videos / resources / misc).
- A new optional `cta` field added to each module in `portalModules.ts` for the localized button label.

**"Seneste fra Timan" section (`LatestFromTiman.tsx`)**
- Keep the component, restyle to match mockup:
  - Section heading in normal case ("Seneste fra Timan"), not uppercase eyebrow.
  - Two cards side-by-side: colored category tag (e.g. green "NYHED", blue "SERVICE"), title, body text.
  - Support a `category` field per item with tone (`news` / `service`) so future content can color-tag itself.
- Placeholder content updated to the two examples from the mockup ("Ny redskabsserie til Timan 3400…" and "Opdatering af AI-assistenten…").

**Footer (new `PortalFooter.tsx`)**
- Thin top border, light background.
- Left: "© 2024 Timan A/S — Forhandler Portal".
- Right: Privatlivspolitik · Brugervilkår · Support (placeholder links for now).

**Page background & font**
- Page background: soft gray (`bg-gray-50`) — already in place.
- Inter font preserved.

## What stays exactly the same

- Routing: `/portal` is the landing page, `/configurator` is the configurator.
- Auth: `AppUserContext` + Supabase session — no changes.
- Login fallback: when not signed in, `LoginStep` is rendered as today.
- `slutkunde` users still get auto-redirected to `/configurator`.
- Role-based module visibility via `isModuleVisible`.
- Language switcher, all 5 languages.
- Configurator, webhooks, quote/order logic — untouched.

## Files touched

- `src/pages/PortalPage.tsx` — new hero card, render footer.
- `src/components/portal/PortalHeader.tsx` — TIMAN wordmark, user chip with avatar initials.
- `src/components/portal/ModuleCard.tsx` — new card style with bottom CTA.
- `src/components/portal/LatestFromTiman.tsx` — restyle, add category tone.
- `src/lib/portalModules.ts` — add `cta: Record<Language,string>` per module.
- `src/components/portal/PortalFooter.tsx` — new file.

No backend, no auth, no routing, no Supabase changes.

