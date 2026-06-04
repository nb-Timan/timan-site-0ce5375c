// supabase/functions/sharepoint-warranty-dryrun/index.ts
//
// READ-ONLY dry-run of a future SharePoint Warranty sync.
//
// Fetches every row from the SharePoint "Warranty registration" list, maps
// each row to the planned warranty_registrations shape in memory, and
// computes:
//   - new / updates / unchanged buckets (compared to warranty_registrations
//     by sharepoint_item_id, if that table exists)
//   - dealer matching buckets:
//       * safe_matches   — exact match on normalized company_name, or alias hit
//       * needs_review   — fuzzy candidate(s) with score >= 0.8
//       * unmatched      — no candidate
//
// Performs NO writes. NO dealer_accounts are created. NO aliases are written.
// NO warranty_registrations rows are written. NO log rows are written.
//
// Access: portal_role in ('timan_backend','timan_service'), active & approved.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SP_HOSTNAME = "timandk.sharepoint.com";
const SP_SITE_PATH = "sites/SalgMarketingTiman";
const SP_LIST_DISPLAY_NAME = "Warranty registration";

const FUZZY_ACCEPT = 0.8;
const MAX_FUZZY_CANDIDATES = 3;

interface MappedRow {
  sharepoint_item_id: string;
  dealer_name_raw: string;
  machine_serial_raw: string;
  machine_serial_normalized: string;
  machine_model: string;
  delivery_date: string | null;
  customer_name: string;
  customer_zip_city: string;
  customer_address: string;
  customer_phone: string;
  customer_email: string;
  source_created_at: string | null;
  attachment_serial_1: string;
  attachment_serial_2: string;
  attachment_serial_3: string;
  attachment_serial_4: string;
}

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function normalizeSerial(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeDealer(raw: string): string {
  let n = (raw ?? "").toLowerCase().trim();
  // Strip diacritics
  n = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Remove common company-form suffixes / tokens
  n = n.replace(/\b(a\/s|aps|ivs|p\/s|i\/s|k\/s|holding|maskiner?|service)\b/g, " ");
  n = n.replace(/&/g, " og ");
  n = n.replace(/[^a-z0-9]+/g, " ");
  n = n.replace(/\s+/g, " ").trim();
  return n;
}

function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      out.set(bg, (out.get(bg) ?? 0) + 1);
    }
    return out;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let totalA = 0;
  let totalB = 0;
  for (const v of A.values()) totalA += v;
  for (const v of B.values()) totalB += v;
  for (const [k, va] of A) {
    const vb = B.get(k);
    if (vb) inter += Math.min(va, vb);
  }
  return (2 * inter) / (totalA + totalB);
}

async function getGraphToken(): Promise<string> {
  const tenant = Deno.env.get("MICROSOFT_TENANT_ID");
  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID");
  const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET");
  if (!tenant || !clientId || !clientSecret) {
    throw new Error("Missing Microsoft secrets (MICROSOFT_TENANT_ID/CLIENT_ID/CLIENT_SECRET).");
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`Microsoft token error ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token as string;
}

async function graphGet(token: string, url: string): Promise<any> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Graph ${r.status} ${url}: ${await r.text()}`);
  return await r.json();
}

async function graphGetAll(token: string, url: string): Promise<any[]> {
  const out: any[] = [];
  let next: string | null = url;
  while (next) {
    const j: any = await graphGet(token, next);
    if (Array.isArray(j.value)) out.push(...j.value);
    next = j["@odata.nextLink"] ?? null;
  }
  return out;
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mapRow(it: any): MappedRow {
  const f = (it.fields ?? {}) as Record<string, unknown>;
  const serialRaw = s(f["Din nye maskines identifikationsnummer"]);
  return {
    sharepoint_item_id: String(it.id ?? s(f.ID_Forms) ?? ""),
    dealer_name_raw: s(f["Forhandlernavn"]).trim(),
    machine_serial_raw: serialRaw,
    machine_serial_normalized: normalizeSerial(serialRaw),
    machine_model: s(f["Hvilken maskine er solgt"]).trim(),
    delivery_date: s(f["Leveringsdato"]) || null,
    customer_name: s(f["Kunde"]).trim(),
    customer_zip_city: s(f["Postnr_x002f_by"] ?? f["Postnr/by"]).trim(),
    customer_address: s(f["Kunde_x0020_adresse"] ?? f["Kunde adresse"]).trim(),
    customer_phone: s(f["Telefon-Nr"] ?? f["Telefon_x002d_Nr"]).trim(),
    customer_email: s(f["E-mail til bekræftelse"] ?? f["E_x002d_mail_x0020_til_x0020_bek"]).trim(),
    source_created_at: it.createdDateTime ?? null,
    attachment_serial_1: s(f["Dit nye redskabs identifikationsnummer"]).trim(),
    attachment_serial_2: s(f["Dit nye redskabs identifikationsnummer2"]).trim(),
    attachment_serial_3: s(f["Dit nye redskabs identifikationsnummer3"]).trim(),
    attachment_serial_4: s(f["Dit nye redskabs identifikationsnummer4"]).trim(),
  };
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ---- Auth ----
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return jsonResp({ error: "Unauthorized" }, 401);

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const supaAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supaService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supaUrl, supaAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsRes, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claimsRes?.claims?.email) return jsonResp({ error: "Unauthorized" }, 401);
    const email = String(claimsRes.claims.email).toLowerCase();

    const admin = createClient(supaUrl, supaService);
    const { data: appUser } = await admin
      .from("app_users")
      .select("portal_role, is_active, approved")
      .ilike("email", email)
      .maybeSingle();
    const role = appUser?.portal_role;
    if (
      !appUser || appUser.is_active === false || appUser.approved === false ||
      (role !== "timan_backend" && role !== "timan_service")
    ) {
      return jsonResp({ error: "Forbidden — Timan Backend or Timan Service only" }, 403);
    }

    const warnings: string[] = [];

    // ---- Fetch SharePoint rows ----
    const token = await getGraphToken();
    const site = await graphGet(
      token,
      `https://graph.microsoft.com/v1.0/sites/${SP_HOSTNAME}:/${SP_SITE_PATH}`,
    );
    const siteId: string = site.id;

    const listsResp = await graphGet(
      token,
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists?$select=id,name,displayName`,
    );
    const allLists = (listsResp.value ?? []) as any[];
    const target =
      allLists.find((l) => (l.displayName ?? "").toLowerCase() === SP_LIST_DISPLAY_NAME.toLowerCase()) ??
      allLists.find((l) => (l.displayName ?? "").toLowerCase().includes("warranty"));
    if (!target) return jsonResp({ error: `List "${SP_LIST_DISPLAY_NAME}" not found.` }, 404);

    const items = await graphGetAll(
      token,
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${target.id}/items?$expand=fields&$top=200`,
    );

    const mapped: MappedRow[] = items.map(mapRow);

    // ---- Diff vs warranty_registrations (graceful if table missing) ----
    let warrantyTableExists = true;
    let existingById = new Map<string, any>();
    {
      const ids = mapped.map((m) => m.sharepoint_item_id).filter(Boolean);
      if (ids.length > 0) {
        const { data, error } = await admin
          .from("warranty_registrations")
          .select("sharepoint_item_id, dealer_name_raw, machine_serial_number, machine_model, delivery_date, customer_name, customer_email")
          .in("sharepoint_item_id", ids);
        if (error) {
          warrantyTableExists = false;
          warnings.push(`Tabellen warranty_registrations findes ikke endnu — diff udelades (${error.message}).`);
        } else {
          for (const row of (data ?? [])) {
            existingById.set(String(row.sharepoint_item_id), row);
          }
        }
      }
    }

    const newRows: MappedRow[] = [];
    const updateRows: Array<{ row: MappedRow; changed_fields: string[] }> = [];
    const unchangedRows: MappedRow[] = [];

    if (warrantyTableExists) {
      for (const m of mapped) {
        const ex = existingById.get(m.sharepoint_item_id);
        if (!ex) { newRows.push(m); continue; }
        const changed: string[] = [];
        if ((ex.dealer_name_raw ?? "") !== m.dealer_name_raw) changed.push("dealer_name_raw");
        if ((ex.machine_serial_number ?? "") !== m.machine_serial_normalized) changed.push("machine_serial_number");
        if ((ex.machine_model ?? "") !== m.machine_model) changed.push("machine_model");
        if ((ex.delivery_date ?? null) !== m.delivery_date) changed.push("delivery_date");
        if ((ex.customer_name ?? "") !== m.customer_name) changed.push("customer_name");
        if ((ex.customer_email ?? "") !== m.customer_email) changed.push("customer_email");
        if (changed.length > 0) updateRows.push({ row: m, changed_fields: changed });
        else unchangedRows.push(m);
      }
    }

    // ---- Dealer matching ----
    const { data: dealers, error: dealerErr } = await admin
      .from("dealer_accounts")
      .select("id, company_name");
    if (dealerErr) {
      warnings.push(`Kunne ikke læse dealer_accounts: ${dealerErr.message}`);
    }
    const dealerList = (dealers ?? []) as Array<{ id: string; company_name: string }>;
    const dealerByNorm = new Map<string, { id: string; company_name: string }>();
    for (const d of dealerList) {
      const n = normalizeDealer(d.company_name ?? "");
      if (n) dealerByNorm.set(n, d);
    }

    // Aliases (graceful if table missing)
    let aliasByNorm = new Map<string, { dealer_account_id: string; dealer_account_number: string | null }>();
    {
      const { data: aliases, error: aliasErr } = await admin
        .from("dealer_account_aliases")
        .select("normalized_alias, dealer_account_id, dealer_account_number");
      if (aliasErr) {
        warnings.push(`Aliasopslag udeladt — dealer_account_aliases findes ikke endnu (${aliasErr.message}).`);
      } else {
        for (const a of (aliases ?? []) as any[]) {
          aliasByNorm.set(String(a.normalized_alias ?? ""), {
            dealer_account_id: a.dealer_account_id,
            dealer_account_number: a.dealer_account_number ?? null,
          });
        }
      }
    }

    const safe_matches: Array<{
      sharepoint_item_id: string;
      dealer_name_raw: string;
      dealer_account_id: string;
      dealer_company_name: string;
      reason: "exact" | "alias";
    }> = [];
    const needs_review: Array<{
      sharepoint_item_id: string;
      dealer_name_raw: string;
      candidates: Array<{ dealer_account_id: string; company_name: string; score: number }>;
    }> = [];
    const unmatched: Array<{
      sharepoint_item_id: string;
      dealer_name_raw: string;
    }> = [];

    for (const m of mapped) {
      const rawName = m.dealer_name_raw;
      if (!rawName) {
        unmatched.push({ sharepoint_item_id: m.sharepoint_item_id, dealer_name_raw: "" });
        continue;
      }
      const norm = normalizeDealer(rawName);
      if (!norm) {
        unmatched.push({ sharepoint_item_id: m.sharepoint_item_id, dealer_name_raw: rawName });
        continue;
      }

      // 1. exact normalized match
      const exact = dealerByNorm.get(norm);
      if (exact) {
        safe_matches.push({
          sharepoint_item_id: m.sharepoint_item_id,
          dealer_name_raw: rawName,
          dealer_account_id: exact.id,
          dealer_company_name: exact.company_name,
          reason: "exact",
        });
        continue;
      }

      // 2. alias match
      const alias = aliasByNorm.get(norm);
      if (alias) {
        const dealer = dealerList.find((d) => d.id === alias.dealer_account_id);
        safe_matches.push({
          sharepoint_item_id: m.sharepoint_item_id,
          dealer_name_raw: rawName,
          dealer_account_id: alias.dealer_account_id,
          dealer_company_name: dealer?.company_name ?? "(ukendt — alias)",
          reason: "alias",
        });
        continue;
      }

      // 3. fuzzy
      const scored = dealerList
        .map((d) => ({
          dealer_account_id: d.id,
          company_name: d.company_name,
          score: diceCoefficient(norm, normalizeDealer(d.company_name ?? "")),
        }))
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_FUZZY_CANDIDATES);

      if (scored.length > 0 && scored[0].score >= FUZZY_ACCEPT) {
        needs_review.push({
          sharepoint_item_id: m.sharepoint_item_id,
          dealer_name_raw: rawName,
          candidates: scored.map((c) => ({
            dealer_account_id: c.dealer_account_id,
            company_name: c.company_name,
            score: Math.round(c.score * 1000) / 1000,
          })),
        });
      } else {
        unmatched.push({
          sharepoint_item_id: m.sharepoint_item_id,
          dealer_name_raw: rawName,
        });
      }
    }

    if (newRows.length + updateRows.length === 0 && warrantyTableExists) {
      warnings.push("Ingen nye eller ændrede rækker ift. eksisterende warranty_registrations.");
    }
    if (unmatched.length > 0) {
      warnings.push(`${unmatched.length} rækker uden sikker dealer-match.`);
    }
    if (needs_review.length > 0) {
      warnings.push(`${needs_review.length} rækker kræver manuel gennemgang før dealer-match.`);
    }

    return jsonResp({
      mode: "dry_run",
      writes_performed: false,
      warranty_table_exists: warrantyTableExists,
      fetched: mapped.length,
      new: newRows.length,
      updates: updateRows.length,
      unchanged: unchangedRows.length,
      dealer_matching: {
        safe_matches_count: safe_matches.length,
        needs_review_count: needs_review.length,
        unmatched_count: unmatched.length,
        safe_matches: safe_matches.slice(0, 50),
        needs_review: needs_review.slice(0, 50),
        unmatched: unmatched.slice(0, 50),
      },
      sample_new: newRows.slice(0, 10),
      sample_updates: updateRows.slice(0, 10),
      warnings,
      durationMs: Date.now() - t0,
    });
  } catch (e) {
    return jsonResp(
      { error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - t0 },
      500,
    );
  }
});
