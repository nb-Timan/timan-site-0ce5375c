// supabase/functions/geocode-dealers/index.ts
//
// Manuel, server-side geocoding af dealer_accounts.
//
// - Kun for Timan Backend brugere (verificeres via caller JWT + app_users).
// - Finder rækker uden latitude/longitude (eller geocoding_status='pending').
// - Bygger adresse fra address_line_1 + address_line_2 + postal_code + city + country.
// - Slår op via OpenStreetMap Nominatim (gratis, ingen API-nøgle).
// - Gemmer latitude/longitude, geocoded_at, geocoding_status, geocoding_error.
// - Sletter ALDRIG data. Rører ALDRIG CRM/quotes/orders/users.
//
// Body (optional): { limit?: number, retryFailed?: boolean, dealerId?: string }
// Returns: { found, geocoded, skipped, failed, errors: [...] }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "TimanPortal/1.0 (partner-map geocoder; contact: support@timan.dk)";
const RATE_LIMIT_MS = 1100; // Nominatim policy: max 1 req/sec.

interface DealerRow {
  id: string;
  account_number: string | null;
  company_name: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
}

interface Summary {
  found: number;
  geocoded: number;
  skipped: number;
  failed: number;
  errors: { account: string | null; name: string | null; address: string; reason: string }[];
}

function buildAddress(d: DealerRow): string {
  const parts = [d.address_line_1, d.address_line_2, d.postal_code, d.city, d.country]
    .map((p) => (p ?? "").toString().trim())
    .filter(Boolean);
  return parts.join(", ");
}

async function nominatim(address: string): Promise<{ lat: number; lon: number } | null> {
  const url = `${NOMINATIM_URL}?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(address)}`;
  const r = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept": "application/json" } });
  if (!r.ok) throw new Error(`nominatim HTTP ${r.status}`);
  const json = await r.json() as Array<{ lat: string; lon: string }>;
  if (!Array.isArray(json) || json.length === 0) return null;
  const lat = parseFloat(json[0].lat);
  const lon = parseFloat(json[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is a Timan Backend user.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Mangler Authorization header." }, 401);
    }
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Ugyldig session." }, 401);
    const email = (userData.user.email ?? "").toLowerCase().trim();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: appUser, error: roleErr } = await admin
      .from("app_users")
      .select("portal_role,is_active,approved")
      .eq("email", email)
      .maybeSingle();
    if (roleErr) return json({ error: `Rolle-tjek fejlede: ${roleErr.message}` }, 500);
    if (!appUser || appUser.portal_role !== "timan_backend" || !appUser.is_active || !appUser.approved) {
      return json({ error: "Kun Timan Backend må køre geocoding." }, 403);
    }

    let body: { limit?: number; retryFailed?: boolean; dealerId?: string } = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const limit = Math.max(1, Math.min(500, Number(body.limit ?? 200)));
    const retryFailed = body.retryFailed === true;
    const dealerId = typeof body.dealerId === "string" && body.dealerId.trim()
      ? body.dealerId.trim()
      : null;

    // Find rows that need geocoding.
    let query = admin
      .from("dealer_accounts")
      .select("id,account_number,company_name,address_line_1,address_line_2,postal_code,city,country,geocoding_status")
      .or("is_deleted.is.null,is_deleted.eq.false")
      .is("latitude", null)
      .limit(limit);
    if (dealerId) {
      query = query.eq("id", dealerId).limit(1);
    }
    if (!dealerId && !retryFailed) {
      // Skip rows already attempted and failed unless caller asks for retry.
      query = query.or("geocoding_status.is.null,geocoding_status.eq.pending,geocoding_status.eq.ok");
    }
    const { data: rows, error: fetchErr } = await query;
    if (fetchErr) return json({ error: `Kunne ikke hente forhandlere: ${fetchErr.message}` }, 500);

    const summary: Summary = { found: rows?.length ?? 0, geocoded: 0, skipped: 0, failed: 0, errors: [] };

    for (const r of (rows ?? []) as DealerRow[]) {
      const address = buildAddress(r);
      if (!address || (!r.city && !r.postal_code && !r.address_line_1)) {
        await admin.from("dealer_accounts").update({
          geocoded_at: new Date().toISOString(),
          geocoding_status: "skipped",
          geocoding_error: "Ingen adresse",
        }).eq("id", r.id);
        summary.skipped++;
        continue;
      }
      try {
        const hit = await nominatim(address);
        if (!hit) {
          await admin.from("dealer_accounts").update({
            geocoded_at: new Date().toISOString(),
            geocoding_status: "not_found",
            geocoding_error: `Ingen match for: ${address}`,
          }).eq("id", r.id);
          summary.failed++;
          summary.errors.push({
            account: r.account_number,
            name: r.company_name,
            address,
            reason: "Ingen match",
          });
        } else {
          await admin.from("dealer_accounts").update({
            latitude: hit.lat,
            longitude: hit.lon,
            geocoded_at: new Date().toISOString(),
            geocoding_status: "ok",
            geocoding_error: null,
          }).eq("id", r.id);
          summary.geocoded++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin.from("dealer_accounts").update({
          geocoded_at: new Date().toISOString(),
          geocoding_status: "error",
          geocoding_error: msg,
        }).eq("id", r.id);
        summary.failed++;
        summary.errors.push({
          account: r.account_number,
          name: r.company_name,
          address,
          reason: msg,
        });
      }
      await sleep(RATE_LIMIT_MS);
    }

    return json(summary, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
