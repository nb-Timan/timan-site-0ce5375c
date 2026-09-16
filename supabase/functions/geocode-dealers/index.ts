// supabase/functions/geocode-dealers/index.ts
//
// Backend-only, persisted dealer geocoding. The dealer record is always the
// map source of truth: a stored coordinate is reused until its address changes.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  dealerGeocodeAction,
  normalizedDealerAddressSignature,
  retryAfterFromHeader,
} from "./geocodingRules.ts";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const DAWA_URL = "https://api.dataforsyningen.dk/adresser";
const USER_AGENT = "TimanPortal/1.0 (partner-map geocoder; contact: support@timan.dk)";
const NOMINATIM_INTERVAL_MS = 1100;
const RATE_LIMIT_BACKOFF_MS = 5 * 60_000;
const MAX_BATCH_SIZE = 50;

const COUNTRY_CODES: Record<string, string> = {
  austria: "at", belgium: "be", bulgaria: "bg", canada: "ca", croatia: "hr",
  czechia: "cz", "czech republic": "cz", cesko: "cz", tjekkiet: "cz",
  danmark: "dk", denmark: "dk", deutschland: "de", færøerne: "fo", faroe: "fo",
  "faroe islands": "fo", faeroerne: "fo", france: "fr", germany: "de", grækenland: "gr",
  greece: "gr", holland: "nl", japan: "jp", kanada: "ca", kroatien: "hr", norway: "no",
  norge: "no", poland: "pl", polen: "pl", romania: "ro", rumænien: "ro", slovenia: "si",
  slovakia: "sk", spain: "es", sverige: "se", sweden: "se", switzerland: "ch",
  schweiz: "ch", tyskland: "de", østrig: "at",
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
  latitude: number | null;
  longitude: number | null;
  geocoding_status: string | null;
  geocoding_address_hash: string | null;
  geocoding_retry_after: string | null;
}

interface Summary {
  found: number;
  geocoded: number;
  skipped: number;
  failed: number;
  busy?: boolean;
  errors: { account: string | null; name: string | null; address: string; reason: string }[];
}

class NominatimHttpError extends Error {
  constructor(readonly status: number, readonly retryAfterMs: number) {
    super(`nominatim HTTP ${status}`);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function splitZipCityRaw(zipCityRaw: string | null): { postalCode: string; city: string } {
  const raw = (zipCityRaw ?? "").trim();
  const match = raw.match(/^(\d{3,10})\s+(.+)$/);
  return !raw ? { postalCode: "", city: "" } : match ? { postalCode: match[1], city: match[2] } : { postalCode: "", city: raw };
}

function resolveAddressParts(d: DealerRow) {
  const zipCity = splitZipCityRaw(d.zip_city_raw);
  const street = (d.address_line_1 || d.address || "").trim();
  let postalCode = (d.postal_code || zipCity.postalCode || "").trim();
  let city = (d.city || zipCity.city || "").trim();
  const citySplit = splitZipCityRaw(city);
  if (!postalCode && citySplit.postalCode) postalCode = citySplit.postalCode;
  if (citySplit.postalCode && citySplit.city) city = citySplit.city;
  if (postalCode && city.toLowerCase().startsWith(`${postalCode.toLowerCase()} `)) city = city.slice(postalCode.length).trim();
  return { street, postalCode, city, country: (d.country || "").trim() };
}

function cleanupStreet(street: string): string {
  return street.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").replace(/ß/g, "ss")
    .replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a")
    .replace(/Æ/g, "Ae").replace(/Ø/g, "O").replace(/Å/g, "A")
    .replace(/\bstrasse\b/gi, "str").replace(/\bstr\.\b/gi, "str")
    .replace(/\bul\.\s*/gi, "ul ").replace(/\s+/g, " ").trim();
}

function countryCode(country: string | null | undefined): string | null {
  return COUNTRY_CODES[normalizeSearchText(country ?? "").toLowerCase()] ?? null;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map((value) => value.trim()).filter((value) => value && !seen.has(value.toLowerCase()) && !!seen.add(value.toLowerCase()));
}

function buildAddress(d: DealerRow): string {
  const parts = resolveAddressParts(d);
  return [cleanupStreet(parts.street), d.address_line_2, parts.postalCode, parts.city, parts.country]
    .map((value) => (value ?? "").toString().trim()).filter(Boolean).join(", ");
}

function hasGeocodableAddress(d: DealerRow): boolean {
  const parts = resolveAddressParts(d);
  return Boolean(parts.street && (parts.postalCode || parts.city) && parts.country);
}

async function addressHash(d: DealerRow): Promise<string> {
  const parts = resolveAddressParts(d);
  const source = normalizedDealerAddressSignature({
    street: cleanupStreet(parts.street), addressLine2: d.address_line_2,
    postalCode: parts.postalCode, city: parts.city, country: parts.country,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function reserveNominatimSlot(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.rpc("reserve_dealer_nominatim_slot", { p_min_interval_ms: NOMINATIM_INTERVAL_MS });
  if (error) throw new Error(`Geocoding rate-control fejlede: ${error.message}`);
  const scheduledAt = Date.parse(String(data));
  if (Number.isFinite(scheduledAt)) await sleep(Math.max(0, scheduledAt - Date.now()));
}

async function nominatimUrl(admin: ReturnType<typeof createClient>, url: string): Promise<{ lat: number; lon: number } | null> {
  await reserveNominatimSlot(admin);
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!response.ok) throw new NominatimHttpError(response.status, retryAfterFromHeader(response.headers.get("Retry-After")));
  const json = await response.json() as Array<{ lat: string; lon: string }>;
  if (!Array.isArray(json) || !json.length) return null;
  const lat = Number(json[0].lat);
  const lon = Number(json[0].lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

async function nominatim(admin: ReturnType<typeof createClient>, address: string, country: string | null | undefined) {
  const params = new URLSearchParams({ format: "json", limit: "1", addressdetails: "0", q: address });
  const code = countryCode(country);
  if (code) params.set("countrycodes", code);
  return nominatimUrl(admin, `${NOMINATIM_URL}?${params.toString()}`);
}

async function nominatimStructured(admin: ReturnType<typeof createClient>, parts: ReturnType<typeof resolveAddressParts>) {
  const params = new URLSearchParams({ format: "json", limit: "1", addressdetails: "0" });
  if (parts.street) params.set("street", cleanupStreet(parts.street));
  if (parts.postalCode) params.set("postalcode", parts.postalCode);
  if (parts.city) params.set("city", parts.city);
  if (parts.country) params.set("country", parts.country);
  const code = countryCode(parts.country);
  if (code) params.set("countrycodes", code);
  return parts.street || parts.city || parts.postalCode ? nominatimUrl(admin, `${NOMINATIM_URL}?${params.toString()}`) : null;
}

function isDenmark(country: string | null | undefined): boolean {
  return ["dk", "danmark", "denmark"].includes((country ?? "").trim().toLowerCase());
}

async function dawa(parts: ReturnType<typeof resolveAddressParts>): Promise<{ lat: number; lon: number } | null> {
  if (!isDenmark(parts.country) || !parts.street || (!parts.postalCode && !parts.city)) return null;
  const query = [parts.street, parts.postalCode, parts.city].filter(Boolean).join(" ");
  const response = await fetch(`${DAWA_URL}?struktur=mini&q=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`dataforsyningen HTTP ${response.status}`);
  const json = await response.json() as Array<{ x?: number; y?: number }>;
  const lat = Number(json[0]?.y);
  const lon = Number(json[0]?.x);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

async function geocode(admin: ReturnType<typeof createClient>, d: DealerRow): Promise<{ lat: number; lon: number } | null> {
  const parts = resolveAddressParts(d);
  try {
    const dkHit = await dawa(parts);
    if (dkHit) return dkHit;
  } catch {
    // DAWA is only a best-effort Danish provider; Nominatim remains the fallback.
  }

  const street = cleanupStreet(parts.street);
  const full = buildAddress(d);
  const fullNormalized = normalizeSearchText(full);
  const fallbackQueries = unique([
    [street, parts.postalCode, parts.city, parts.country].filter(Boolean).join(", "),
    [normalizeSearchText(street), parts.postalCode, normalizeSearchText(parts.city), normalizeSearchText(parts.country)].filter(Boolean).join(", "),
    [parts.postalCode, parts.city, parts.country].filter(Boolean).join(", "),
  ]).filter((query) => query !== full && query !== fullNormalized).slice(0, 2);
  const attempts = [
    () => nominatimStructured(admin, parts),
    () => nominatim(admin, full, parts.country),
    ...(fullNormalized !== full ? [() => nominatim(admin, fullNormalized, parts.country)] : []),
    ...fallbackQueries.map((query) => () => nominatim(admin, query, parts.country)),
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const hit = await attempt();
      if (hit) return hit;
    } catch (error) {
      if (error instanceof NominatimHttpError && error.status === 429) throw error;
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return null;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let admin: ReturnType<typeof createClient> | null = null;
  let acquired = false;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Mangler Authorization header." }, 401);

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Ugyldig session." }, 401);

    admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: appUser, error: roleError } = await admin.from("app_users")
      .select("portal_role,is_active,approved").eq("email", (userData.user.email ?? "").toLowerCase().trim()).maybeSingle();
    if (roleError) return json({ error: `Rolle-tjek fejlede: ${roleError.message}` }, 500);
    if (!appUser || appUser.portal_role !== "timan_backend" || !appUser.is_active || !appUser.approved) {
      return json({ error: "Kun Timan Backend må køre geocoding." }, 403);
    }

    let body: { limit?: number; retryFailed?: boolean; dealerId?: string } = {};
    try { body = await req.json(); } catch { /* empty body is supported */ }
    const limit = Math.max(1, Math.min(MAX_BATCH_SIZE, Number(body.limit ?? 25)));
    const retryFailed = body.retryFailed === true;
    const dealerId = typeof body.dealerId === "string" && body.dealerId.trim() ? body.dealerId.trim() : null;

    const { data: lock, error: lockError } = await admin.rpc("acquire_dealer_geocoding_run", { p_lease_seconds: 900 });
    if (lockError) return json({ error: `Geocoding rate-control fejlede: ${lockError.message}` }, 500);
    const lockRow = Array.isArray(lock) ? lock[0] : lock;
    if (!lockRow?.acquired) return json({ found: 0, geocoded: 0, skipped: 0, failed: 0, busy: true, errors: [] }, 200);
    acquired = true;

    let query = admin.from("dealer_accounts")
      .select("id,account_number,company_name,address,address_line_1,address_line_2,postal_code,city,zip_city_raw,country,latitude,longitude,geocoding_status,geocoding_address_hash,geocoding_retry_after")
      .or("is_deleted.is.null,is_deleted.eq.false")
      .limit(dealerId ? 1 : limit);
    if (dealerId) query = query.eq("id", dealerId);
    else query = query.or("latitude.is.null,longitude.is.null,geocoding_address_hash.is.null");
    const { data: rows, error: fetchError } = await query;
    if (fetchError) return json({ error: `Kunne ikke hente forhandlere: ${fetchError.message}` }, 500);

    const summary: Summary = { found: rows?.length ?? 0, geocoded: 0, skipped: 0, failed: 0, errors: [] };
    for (const row of (rows ?? []) as DealerRow[]) {
      const address = buildAddress(row);
      if (row.geocoding_status === "rate_limited") {
        const retryAt = row.geocoding_retry_after ? Date.parse(row.geocoding_retry_after) : 0;
        if (!retryFailed || (Number.isFinite(retryAt) && retryAt > Date.now())) {
          summary.skipped++;
          continue;
        }
      }
      if (!retryFailed && ["error", "not_found"].includes(row.geocoding_status ?? "")) {
        summary.skipped++;
        continue;
      }
      if (!address || !hasGeocodableAddress(row)) {
        await admin.from("dealer_accounts").update({
          geocoded_at: new Date().toISOString(), geocoding_status: "skipped", geocoding_error: "Ingen adresse", geocoding_retry_after: null,
        }).eq("id", row.id);
        summary.skipped++;
        continue;
      }

      const currentHash = await addressHash(row);
      const action = dealerGeocodeAction(row, currentHash);
      if (action === "reuse") {
        summary.skipped++;
        continue;
      }
      if (action === "adopt") {
        await admin.from("dealer_accounts").update({
          geocoding_address_hash: currentHash, geocoding_status: "ok", geocoding_error: null, geocoding_retry_after: null,
        }).eq("id", row.id);
        summary.skipped++;
        continue;
      }

      try {
        const hit = await geocode(admin, row);
        if (!hit) {
          await admin.from("dealer_accounts").update({
            geocoded_at: new Date().toISOString(), geocoding_status: "not_found", geocoding_error: `Ingen match for: ${address}`,
            geocoding_address_hash: currentHash, geocoding_retry_after: null,
          }).eq("id", row.id);
          summary.failed++;
          summary.errors.push({ account: row.account_number, name: row.company_name, address, reason: "Ingen match" });
        } else {
          await admin.from("dealer_accounts").update({
            latitude: hit.lat, longitude: hit.lon, geocoded_at: new Date().toISOString(), geocoding_status: "ok",
            geocoding_error: null, geocoding_address_hash: currentHash, geocoding_retry_after: null,
          }).eq("id", row.id);
          summary.geocoded++;
        }
      } catch (error) {
        if (error instanceof NominatimHttpError && error.status === 429) {
          const retryAfter = new Date(Date.now() + Math.max(RATE_LIMIT_BACKOFF_MS, error.retryAfterMs));
          await admin.rpc("defer_dealer_nominatim_requests", { p_retry_after: retryAfter.toISOString() });
          await admin.from("dealer_accounts").update({
            geocoded_at: new Date().toISOString(), geocoding_status: "rate_limited",
            geocoding_error: "Nominatim er midlertidigt rate limited. Prøv igen senere.",
            geocoding_retry_after: retryAfter.toISOString(),
          }).eq("id", row.id);
          summary.failed++;
          summary.errors.push({ account: row.account_number, name: row.company_name, address, reason: "Nominatim er midlertidigt rate limited" });
          break;
        }
        const reason = error instanceof Error ? error.message : String(error);
        await admin.from("dealer_accounts").update({
          geocoded_at: new Date().toISOString(), geocoding_status: "error", geocoding_error: reason, geocoding_retry_after: null,
        }).eq("id", row.id);
        summary.failed++;
        summary.errors.push({ account: row.account_number, name: row.company_name, address, reason });
      }
    }
    return json(summary, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  } finally {
    if (admin && acquired) await admin.rpc("release_dealer_geocoding_run");
  }
});
