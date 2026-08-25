// supabase/functions/geocode-dealers/index.ts
//
// Manuel, server-side geocoding af dealer_accounts.
//
// - Kun for Timan Backend brugere (verificeres via caller JWT + app_users).
// - Finder rækker uden latitude/longitude (eller geocoding_status='pending').
// - Bygger adresse fra address_line_1/address + address_line_2 + postal_code/zip_city_raw + city + country.
// - Slår op via OpenStreetMap Nominatim (gratis, ingen API-nøgle).
// - Gemmer latitude/longitude, geocoded_at, geocoding_status, geocoding_error.
// - Sletter ALDRIG data. Rører ALDRIG CRM/quotes/orders/users.
//
// Body (optional): { limit?: number, retryFailed?: boolean, dealerId?: string }
// Returns: { found, geocoded, skipped, failed, errors: [...] }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const DAWA_URL = "https://api.dataforsyningen.dk/adresser";
const USER_AGENT = "TimanPortal/1.0 (partner-map geocoder; contact: support@timan.dk)";
const RATE_LIMIT_MS = 1100; // Nominatim policy: max 1 req/sec.

const COUNTRY_CODES: Record<string, string> = {
  austria: "at",
  belgium: "be",
  bulgaria: "bg",
  canada: "ca",
  croatia: "hr",
  danmark: "dk",
  denmark: "dk",
  deutschland: "de",
  færøerne: "fo",
  faroe: "fo",
  "faroe islands": "fo",
  faeroerne: "fo",
  france: "fr",
  germany: "de",
  grækenland: "gr",
  greece: "gr",
  holland: "nl",
  japan: "jp",
  kanada: "ca",
  kroatien: "hr",
  norway: "no",
  norge: "no",
  poland: "pl",
  polen: "pl",
  romania: "ro",
  rumænien: "ro",
  slovenia: "si",
  slovakia: "sk",
  spain: "es",
  sverige: "se",
  sweden: "se",
  switzerland: "ch",
  schweiz: "ch",
  tyskland: "de",
  østrig: "at",
};

interface DealerRow {
  id: string;
  account_number: string | null;
  company_name: string | null;
  address: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  postal_code: string | null;
  city: string | null;
  zip_city_raw: string | null;
  country: string | null;
}

interface Summary {
  found: number;
  geocoded: number;
  skipped: number;
  failed: number;
  errors: { account: string | null; name: string | null; address: string; reason: string }[];
}

function splitZipCityRaw(zipCityRaw: string | null): { postalCode: string | null; city: string | null } {
  const raw = (zipCityRaw ?? "").trim();
  if (!raw) return { postalCode: null, city: null };
  const match = raw.match(/^(\d{3,10})\s+(.+)$/);
  if (!match) return { postalCode: null, city: raw };
  return { postalCode: match[1], city: match[2] };
}

function resolveAddressParts(d: DealerRow) {
  const zipCity = splitZipCityRaw(d.zip_city_raw);
  const street = (d.address_line_1 || d.address || "").trim();
  let postalCode = (d.postal_code || zipCity.postalCode || "").trim();
  let city = (d.city || zipCity.city || "").trim();

  const citySplit = splitZipCityRaw(city);
  if (!postalCode && citySplit.postalCode) postalCode = citySplit.postalCode;
  if (citySplit.postalCode && citySplit.city) city = citySplit.city;
  if (postalCode && city.toLowerCase().startsWith(`${postalCode.toLowerCase()} `)) {
    city = city.slice(postalCode.length).trim();
  }

  return { street, postalCode, city, country: (d.country || "").trim() };
}

function cleanupStreet(street: string): string {
  return street
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/Æ/g, "Ae")
    .replace(/Ø/g, "O")
    .replace(/Å/g, "A")
    .replace(/\bstrasse\b/gi, "str")
    .replace(/\bstr\.\b/gi, "str")
    .replace(/\bul\.\s*/gi, "ul ")
    .replace(/\s+/g, " ")
    .trim();
}

function countryCode(country: string | null | undefined): string | null {
  const key = normalizeSearchText(country ?? "").toLowerCase();
  return COUNTRY_CODES[key] ?? null;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => value && !seen.has(value.toLowerCase()) && !!seen.add(value.toLowerCase()));
}

function buildAddress(d: DealerRow): string {
  const parts = resolveAddressParts(d);
  return [cleanupStreet(parts.street), d.address_line_2, parts.postalCode, parts.city, parts.country]
    .map((p) => (p ?? "").toString().trim())
    .filter(Boolean)
    .join(", ");
}

function hasGeocodableAddress(d: DealerRow): boolean {
  const parts = resolveAddressParts(d);
  return Boolean(
    parts.street?.trim() &&
    (parts.postalCode?.trim() || parts.city?.trim()) &&
    parts.country?.trim(),
  );
}

async function nominatimUrl(url: string): Promise<{ lat: number; lon: number } | null> {
  const r = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept": "application/json" } });
  if (!r.ok) throw new Error(`nominatim HTTP ${r.status}`);
  const json = await r.json() as Array<{ lat: string; lon: string }>;
  if (!Array.isArray(json) || json.length === 0) return null;
  const lat = parseFloat(json[0].lat);
  const lon = parseFloat(json[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function nominatim(address: string, country: string | null | undefined): Promise<{ lat: number; lon: number } | null> {
  const params = new URLSearchParams({
    format: "json",
    limit: "1",
    addressdetails: "0",
    q: address,
  });
  const code = countryCode(country);
  if (code) params.set("countrycodes", code);
  return nominatimUrl(`${NOMINATIM_URL}?${params.toString()}`);
}

async function nominatimStructured(parts: ReturnType<typeof resolveAddressParts>): Promise<{ lat: number; lon: number } | null> {
  const params = new URLSearchParams({
    format: "json",
    limit: "1",
    addressdetails: "0",
  });
  const street = cleanupStreet(parts.street);
  if (street) params.set("street", street);
  if (parts.postalCode) params.set("postalcode", parts.postalCode);
  if (parts.city) params.set("city", parts.city);
  if (parts.country) params.set("country", parts.country);
  const code = countryCode(parts.country);
  if (code) params.set("countrycodes", code);
  if (!street && !parts.city && !parts.postalCode) return null;
  return nominatimUrl(`${NOMINATIM_URL}?${params.toString()}`);
}

function isDenmark(country: string | null | undefined): boolean {
  const value = (country ?? "").trim().toLowerCase();
  return ["dk", "danmark", "denmark"].includes(value);
}

async function dawa(parts: ReturnType<typeof resolveAddressParts>): Promise<{ lat: number; lon: number } | null> {
  if (!isDenmark(parts.country) || !parts.street || (!parts.postalCode && !parts.city)) return null;
  const query = [parts.street, parts.postalCode, parts.city].filter(Boolean).join(" ");
  const url = `${DAWA_URL}?struktur=mini&q=${encodeURIComponent(query)}`;
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error(`dataforsyningen HTTP ${r.status}`);
  const json = await r.json() as Array<{ x?: number; y?: number }>;
  const hit = Array.isArray(json) ? json[0] : null;
  const lat = Number(hit?.y);
  const lon = Number(hit?.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function geocode(d: DealerRow): Promise<{ lat: number; lon: number } | null> {
  const parts = resolveAddressParts(d);
  try {
    const dkHit = await dawa(parts);
    if (dkHit) return dkHit;
  } catch {
    // Fall back to Nominatim if the Danish address API is temporarily unavailable.
  }

  const street = cleanupStreet(parts.street);
  const normalizedStreet = normalizeSearchText(street);
  const normalizedCity = normalizeSearchText(parts.city);
  const normalizedCountry = normalizeSearchText(parts.country);
  const full = buildAddress(d);
  const fullNormalized = normalizeSearchText(full);
  const cityPostalCountry = [parts.postalCode, parts.city, parts.country].filter(Boolean).join(", ");
  const cityCountry = [parts.city, parts.country].filter(Boolean).join(", ");

  const attempts: Array<() => Promise<{ lat: number; lon: number } | null>> = [
    () => nominatimStructured(parts),
    () => nominatim(full, parts.country),
    () => nominatim(fullNormalized, parts.country),
    ...unique([
      [street, parts.postalCode, parts.city, parts.country].filter(Boolean).join(", "),
      [normalizedStreet, parts.postalCode, normalizedCity, normalizedCountry].filter(Boolean).join(", "),
      [street, parts.city, parts.country].filter(Boolean).join(", "),
      [normalizedStreet, normalizedCity, normalizedCountry].filter(Boolean).join(", "),
      [parts.postalCode, parts.city, parts.country].filter(Boolean).join(", "),
      cityPostalCountry,
      cityCountry,
    ]).map((query) => () => nominatim(query, parts.country)),
  ];

  let lastError: unknown = null;
  for (let i = 0; i < attempts.length; i++) {
    try {
      const hit = await attempts[i]();
      if (hit) return hit;
    } catch (e) {
      lastError = e;
    }
    if (i < attempts.length - 1) await sleep(RATE_LIMIT_MS);
  }

  if (lastError) throw lastError;

  return null;
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
      .select("id,account_number,company_name,address,address_line_1,address_line_2,postal_code,city,zip_city_raw,country,geocoding_status")
      .or("is_deleted.is.null,is_deleted.eq.false")
      .is("latitude", null)
      .limit(limit);
    if (dealerId) {
      query = query.eq("id", dealerId).limit(1);
    }
    if (!dealerId && !retryFailed) {
      // Retry old "skipped" rows: many were skipped before address fields were fully mapped.
      query = query.or("geocoding_status.is.null,geocoding_status.eq.pending,geocoding_status.eq.ok,geocoding_status.eq.skipped");
    }
    const { data: rows, error: fetchErr } = await query;
    if (fetchErr) return json({ error: `Kunne ikke hente forhandlere: ${fetchErr.message}` }, 500);

    const summary: Summary = { found: rows?.length ?? 0, geocoded: 0, skipped: 0, failed: 0, errors: [] };

    for (const r of (rows ?? []) as DealerRow[]) {
      const address = buildAddress(r);
      if (!address || !hasGeocodableAddress(r)) {
        await admin.from("dealer_accounts").update({
          geocoded_at: new Date().toISOString(),
          geocoding_status: "skipped",
          geocoding_error: "Ingen adresse",
        }).eq("id", r.id);
        summary.skipped++;
        continue;
      }
      try {
        const hit = await geocode(r);
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
