// supabase/functions/geocode-warranty-customers/index.ts
//
// Manuel, server-side geocoding af warranty_registrations (kundeadresser).
//
// - Kun for Timan Backend / Timan Service (verificeres via caller JWT +
//   app_users.portal_role).
// - Finder rækker uden customer_latitude/customer_longitude.
// - Bygger adresse fra customer_address + customer_postal_code +
//   customer_city + customer_country.
// - Slår op via OpenStreetMap Nominatim (gratis, ingen API-nøgle).
// - Gemmer customer_latitude/customer_longitude + customer_geocoded_at +
//   customer_geocoding_status + customer_geocoding_error.
// - Sletter ALDRIG data. Rører ALDRIG dealer-koblinger eller PII-felter.
//
// Body (optional): { limit?: number, retryFailed?: boolean, warrantyId?: string }
// Returns: { found, geocoded, skipped, failed, errors: [...] }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "TimanPortal/1.0 (warranty geocoder; contact: support@timan.dk)";
const RATE_LIMIT_MS = 1100; // Nominatim policy: max 1 req/sec.

interface WarrantyRow {
  id: string;
  certificate_number: string | null;
  customer_address: string | null;
  customer_postal_code: string | null;
  customer_city: string | null;
  customer_country: string | null;
}

interface Summary {
  found: number;
  geocoded: number;
  skipped: number;
  failed: number;
  errors: { certificate: string | null; reason: string }[];
}

function buildAddress(r: WarrantyRow): string {
  const parts = [r.customer_address, r.customer_postal_code, r.customer_city, r.customer_country]
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
    const role = appUser?.portal_role;
    const isAllowed =
      !!appUser && appUser.is_active && appUser.approved &&
      (role === "timan_backend" || role === "timan_service");
    if (!isAllowed) {
      return json({ error: "Kun Timan Backend / Timan Service må køre geocoding." }, 403);
    }

    let body: { limit?: number; retryFailed?: boolean; warrantyId?: string } = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const limit = Math.max(1, Math.min(500, Number(body.limit ?? 200)));
    const retryFailed = body.retryFailed === true;
    const warrantyId = typeof body.warrantyId === "string" && body.warrantyId.trim()
      ? body.warrantyId.trim()
      : null;

    let query = admin
      .from("warranty_registrations")
      .select(
        "id,certificate_number,customer_address,customer_postal_code,customer_city,customer_country,customer_geocoding_status",
      )
      .limit(limit);

    if (warrantyId) {
      query = query.eq("id", warrantyId).limit(1);
    } else {
      query = query.is("customer_latitude", null);
    }

    if (!warrantyId && !retryFailed) {
      query = query.or(
        "customer_geocoding_status.is.null,customer_geocoding_status.eq.pending,customer_geocoding_status.eq.ok",
      );
    }
    const { data: rows, error: fetchErr } = await query;
    if (fetchErr) return json({ error: `Kunne ikke hente registreringer: ${fetchErr.message}` }, 500);

    const summary: Summary = { found: rows?.length ?? 0, geocoded: 0, skipped: 0, failed: 0, errors: [] };

    for (const r of (rows ?? []) as WarrantyRow[]) {
      const address = buildAddress(r);
      if (!address || (!r.customer_city && !r.customer_postal_code && !r.customer_address)) {
        await admin.from("warranty_registrations").update({
          customer_geocoded_at: new Date().toISOString(),
          customer_geocoding_status: "skipped",
          customer_geocoding_error: "Ingen kundeadresse",
        }).eq("id", r.id);
        summary.skipped++;
        continue;
      }
      try {
        const hit = await nominatim(address);
        if (!hit) {
          await admin.from("warranty_registrations").update({
            customer_geocoded_at: new Date().toISOString(),
            customer_geocoding_status: "not_found",
            customer_geocoding_error: `Ingen match for: ${address}`,
          }).eq("id", r.id);
          summary.failed++;
          summary.errors.push({ certificate: r.certificate_number, reason: "Ingen match" });
        } else {
          await admin.from("warranty_registrations").update({
            customer_latitude: hit.lat,
            customer_longitude: hit.lon,
            customer_geocoded_at: new Date().toISOString(),
            customer_geocoding_status: "ok",
            customer_geocoding_error: null,
          }).eq("id", r.id);
          summary.geocoded++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin.from("warranty_registrations").update({
          customer_geocoded_at: new Date().toISOString(),
          customer_geocoding_status: "error",
          customer_geocoding_error: msg,
        }).eq("id", r.id);
        summary.failed++;
        summary.errors.push({ certificate: r.certificate_number, reason: msg });
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
