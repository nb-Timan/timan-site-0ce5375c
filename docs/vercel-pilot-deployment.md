# Vercel Pilot Deployment

This repository builds a static React/Vite application. Vercel hosts only the
frontend. Supabase remains the database, Auth provider, Storage provider, and
Edge Function host. Lovable remains untouched during this pilot.

## Repository settings

- Framework: `Vite`
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`
- Node: `22.x` (`.nvmrc` and `package.json` both declare it)
- SPA routing: `vercel.json` rewrites client routes to `index.html`

## Vercel environment variables

Set these in Vercel for **Preview** before creating the first deployment:

| Variable | Required | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | Existing Supabase project URL. This is public browser configuration. |
| `VITE_SUPABASE_ANON_KEY` | Yes | Existing Supabase publishable/anon key. This is public browser configuration. |
| `VITE_GOOGLE_MAPS_API_KEY` | If address autocomplete is required | Browser-restricted Google Maps/Places key. `VITE_GOOGLE_PLACES_API_KEY` remains a compatibility alias. |
| `VITE_CARTO_BASEMAP_KEY` | If CARTO map tiles are required | Public CARTO browser key. It can alternatively remain in `public/runtime-config.js`. |
| `VITE_N8N_CRM_CALENDAR_WEBHOOK_URL` | No | Optional explicit CRM-calendar webhook endpoint. The current portal has a production endpoint fallback. Never put an n8n API key in Vercel. |
| `VITE_PORTAL_SITE_URL` | No for Preview | Leave unset so preview-generated QR links use the preview origin. Set only to the final HTTPS portal URL at a later production cutover. |

Never add these to Vercel browser variables: `SUPABASE_SERVICE_ROLE_KEY`, SMTP
credentials, `N8N_API_KEY`, Microsoft client secrets, GitHub tokens, or any
other private secret. Those stay only in Supabase Edge Function secrets.

## Supabase manual steps before Preview authentication tests

Do not remove existing Lovable settings. In **Supabase Dashboard →
Authentication → URL Configuration** add the Vercel preview URL to Additional
Redirect URLs, including:

```
https://<your-preview-domain>.vercel.app/**
```

Keep the current Lovable URL(s) and the existing Site URL unchanged during the
pilot. When testing a new preview deployment, add that exact preview URL if
your project does not use a stable preview alias. Google OAuth/Facebook OAuth
must also have the same callback origin registered with their providers if
those login methods are tested.

## Supabase function site URL

`admin-user-actions` already uses its server-only `PORTAL_SITE_URL` secret for
fallback invite/reset links. Leave it pointed at Lovable during the pilot.
Frontend actions pass the current browser origin for ordinary reset/invite
flows, and the function accepts it for contract invitations as well. At a
future production cutover, update `PORTAL_SITE_URL` in Supabase to the final
Vercel/custom-domain origin only after browser acceptance passes.

## Pilot sequence

1. In Vercel, import the GitHub repository and select branch `main`.
2. Confirm the repository settings above; Vercel reads `vercel.json`.
3. Add the Preview environment variables listed above. Do not add private
   secrets.
4. Deploy a Preview. Do not attach DNS or promote it to Production.
5. Add the Preview URL to Supabase Auth redirect URLs while retaining Lovable.
6. Run the full browser acceptance matrix: auth, Backend/CRM, Configurator,
   Messe, Service/Warranty, maps, deep links, downloads, webhooks, and Edge
   Functions.
7. Keep Lovable as fallback until that acceptance is complete and a separate
   production cutover is approved.
