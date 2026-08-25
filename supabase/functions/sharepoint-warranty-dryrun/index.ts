// supabase/functions/sharepoint-warranty-dryrun/index.ts
//
// READ-ONLY dry-run of a future SharePoint Warranty sync.
//
// - Resolves SharePoint internal field names from list columns (displayName
//   → internal name) so we never hardcode brittle names.
// - Maps rows in-memory to warranty_registrations shape.
// - Computes new / updates / unchanged buckets against warranty_registrations
//   (which exists in Phase 57). Distinguishes "table missing" from "0 rows".
// - Dealer matching: safe_matches (exact / alias), needs_review (fuzzy ≥ 0.8),
//   unmatched.
//
// NO writes anywhere. NO dealer_accounts created. NO aliases written.
//
// Access: portal_role in ('timan_backend','timan_service'), active & approved.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SP_HOSTNAME = "timandk.sharepoint.com";
const SP_SITE_PATH = "sites/SalgMarketingTiman";
const SP_LIST_DISPLAY_NAME = "Warranty registration";

const FUZZY_ACCEPT = 0.8;
const MAX_FUZZY_CANDIDATES = 3;

// Logical field key → SharePoint displayName. We resolve displayName to the
// actual internal Graph field name at runtime via /lists/{id}/columns.
const FIELD_DISPLAY: Record<string, string> = {
  dealer_name:          "Forhandlernavn",
  machine_serial:       "Din nye maskines identifikationsnummer",
  machine_model:        "Hvilken maskine er solgt",
  delivery_date:        "Leveringsdato",
  customer_name:        "Kunde",
  customer_zip_city:    "Postnr/by",
  customer_address:     "Kunde adresse",
  customer_phone:       "Telefon-Nr",
  customer_email:       "E-mail til bekræftelse",
  tool_serial_1:        "Dit nye redskabs identifikationsnummer",
  tool_serial_2:        "Dit nye redskabs identifikationsnummer2",
  tool_serial_3:        "Dit nye redskabs identifikationsnummer3",
  tool_serial_4:        "Dit nye redskabs identifikationsnummer4",
};

interface MappedRow {
  sharepoint_item_id: string;
  dealer_name_snapshot: string;
  machine_serial_raw: string;
  machine_serial_number: string; // normalized
  machine_model: string;
  delivery_date: string | null;
  customer_name: string;
  customer_zip_city: string;
  customer_address: string;
  customer_phone: string;
  customer_email: string;
  tool_serials: string[];
  source_created_at: string | null;
}

interface RejectedRow {
  sharepoint_item_id: string;
  dealer_name_snapshot: string;
  reason: "missing_sharepoint_item_id" | "missing_machine_serial";
  machine_model: string;
  customer_name: string;
}

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(s).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    for (const key of ["LookupValue", "lookupValue", "Title", "title", "Value", "value", "Email", "email", "Description", "description"]) {
      const nested = obj[key];
      if (typeof nested === "string" || typeof nested === "number" || typeof nested === "boolean") {
        return String(nested);
      }
    }
  }
  return "";
}

function normalizeSerial(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeDealer(raw: string): string {
  let n = (raw ?? "").toLowerCase().trim();
  n = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  n = n.replace(/\b(a\/s|aps|ivs|p\/s|i\/s|k\/s|holding|maskiner?|service)\b/g, " ");
  n = n.replace(/&/g, " og ");
  n = n.replace(/[^a-z0-9]+/g, " ");
  n = n.replace(/\s+/g, " ").trim();
  return n;
}

function normalizeFieldName(raw: string): string {
  return (raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
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
  let inter = 0, totalA = 0, totalB = 0;
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

// Try several candidate internal names for a SharePoint field, with the
// resolved displayName→internal map as primary source.
function readField(
  fields: Record<string, unknown>,
  displayToInternal: Map<string, string>,
  displayName: string,
  extraCandidates: string[] = [],
): string {
  const wanted = [displayName, ...extraCandidates];
  const wantedNorm = new Set(wanted.map(normalizeFieldName));
  let internal = displayToInternal.get(displayName);
  if (!internal) {
    for (const [spDisplay, spInternal] of displayToInternal.entries()) {
      if (wantedNorm.has(normalizeFieldName(spDisplay))) {
        internal = spInternal;
        break;
      }
    }
  }
  const candidates = [
    ...(internal ? [internal] : []),
    displayName,
    ...extraCandidates,
  ];
  for (const k of candidates) {
    if (k in fields) {
      const v = fields[k];
      if (v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "")) {
        return s(v);
      }
    }
  }
  for (const [k, v] of Object.entries(fields)) {
    if (!wantedNorm.has(normalizeFieldName(k))) continue;
    const str = s(v);
    if (str.trim()) return str;
  }
  return "";
}

function readMachineSerial(fields: Record<string, unknown>, displayToInternal: Map<string, string>): string {
  const direct = readField(fields, displayToInternal, FIELD_DISPLAY.machine_serial, [
    "Maskinens identifikationsnummer",
    "Maskin identifikationsnummer",
    "Maskin nr.",
    "Maskinnr.",
    "Maskinnummer",
    "Serienummer",
    "Serie nr.",
    "Serial number",
    "Machine serial number",
    "Din_x0020_nye_x0020_maskines_x0020_identifikationsnummer",
  ]);
  if (direct.trim()) return direct;

  for (const [display, internal] of displayToInternal.entries()) {
    const n = normalizeFieldName(display);
    const looksLikeMachineSerial =
      (n.includes("maskin") || n.includes("machine")) &&
      (n.includes("identifikationsnummer") || n.includes("serienummer") || n.includes("serial"));
    if (!looksLikeMachineSerial) continue;
    const str = s(fields[internal]);
    if (str.trim()) return str;
  }
  return "";
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

    // ---- Fetch SharePoint site, list, columns, items ----
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

    // Resolve displayName → internal name from list columns.
    const colsResp = await graphGet(
      token,
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${target.id}/columns?$select=displayName,name`,
    );
    const displayToInternal = new Map<string, string>();
    for (const c of (colsResp.value ?? []) as any[]) {
      if (c.displayName && c.name) displayToInternal.set(String(c.displayName), String(c.name));
    }

    const items = await graphGetAll(
      token,
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${target.id}/items?$expand=fields&$top=200`,
    );

    // ---- Map rows ----
    const mapped: MappedRow[] = items.map((it: any) => {
      const f = (it.fields ?? {}) as Record<string, unknown>;
      const serialRaw = readMachineSerial(f, displayToInternal);
      const tools = [
        readField(f, displayToInternal, FIELD_DISPLAY.tool_serial_1),
        readField(f, displayToInternal, FIELD_DISPLAY.tool_serial_2),
        readField(f, displayToInternal, FIELD_DISPLAY.tool_serial_3),
        readField(f, displayToInternal, FIELD_DISPLAY.tool_serial_4),
      ].map((x) => x.trim()).filter((x) => x.length > 0);

      return {
        sharepoint_item_id: String(it.id ?? ""),
        dealer_name_snapshot: readField(f, displayToInternal, FIELD_DISPLAY.dealer_name).trim(),
        machine_serial_raw: serialRaw,
        machine_serial_number: normalizeSerial(serialRaw),
        machine_model: readField(f, displayToInternal, FIELD_DISPLAY.machine_model).trim(),
        delivery_date: readField(f, displayToInternal, FIELD_DISPLAY.delivery_date) || null,
        customer_name: readField(f, displayToInternal, FIELD_DISPLAY.customer_name).trim(),
        customer_zip_city: readField(f, displayToInternal, FIELD_DISPLAY.customer_zip_city, [
          "Postnr_x002f_by",
        ]).trim(),
        customer_address: readField(f, displayToInternal, FIELD_DISPLAY.customer_address, [
          "Kunde_x0020_adresse",
        ]).trim(),
        customer_phone: readField(f, displayToInternal, FIELD_DISPLAY.customer_phone, [
          "Telefon_x002d_Nr",
        ]).trim(),
        customer_email: readField(f, displayToInternal, FIELD_DISPLAY.customer_email, [
          "E_x002d_mail_x0020_til_x0020_bek",
        ]).trim(),
        tool_serials: tools,
        source_created_at: it.createdDateTime ?? null,
      };
    });

    const validRows: MappedRow[] = [];
    const rejectedRows: RejectedRow[] = [];
    for (const m of mapped) {
      if (!m.sharepoint_item_id) {
        rejectedRows.push({
          sharepoint_item_id: "",
          dealer_name_snapshot: m.dealer_name_snapshot,
          reason: "missing_sharepoint_item_id",
          machine_model: m.machine_model,
          customer_name: m.customer_name,
        });
        continue;
      }
      if (!m.machine_serial_number) {
        rejectedRows.push({
          sharepoint_item_id: m.sharepoint_item_id,
          dealer_name_snapshot: m.dealer_name_snapshot,
          reason: "missing_machine_serial",
          machine_model: m.machine_model,
          customer_name: m.customer_name,
        });
        continue;
      }
      validRows.push(m);
    }
    if (rejectedRows.length > 0) {
      warnings.push(`${rejectedRows.length} rækker kan ikke gemmes før de manglende DB-krav er løst. Se "Afviste rækker".`);
    }

    // ---- Diff vs warranty_registrations (graceful) ----
    // Probe existence with a HEAD count — distinguish "missing table" (42P01)
    // from "0 rows" (data === [], no error).
    let warrantyTableExists = true;
    let warrantyTableEmpty = false;
    {
      const probe = await admin
        .from("warranty_registrations")
        .select("id", { head: true, count: "exact" });
      if (probe.error) {
        const code = (probe.error as { code?: string }).code;
        if (code === "42P01") {
          warrantyTableExists = false;
          warnings.push("Tabellen warranty_registrations findes ikke endnu — diff udelades.");
        } else {
          warnings.push(`Kunne ikke læse warranty_registrations: ${probe.error.message}`);
        }
      } else {
        warrantyTableEmpty = (probe.count ?? 0) === 0;
      }
    }

    const existingById = new Map<string, any>();
    if (warrantyTableExists && !warrantyTableEmpty) {
      const ids = validRows.map((m) => m.sharepoint_item_id).filter(Boolean);
      if (ids.length > 0) {
        const { data, error } = await admin
          .from("warranty_registrations")
          .select(
            "sharepoint_item_id, dealer_name_snapshot, machine_serial_number, machine_model, delivery_date, customer_name, customer_email",
          )
          .in("sharepoint_item_id", ids);
        if (error) {
          warnings.push(`Kunne ikke læse warranty_registrations: ${error.message}`);
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
      for (const m of validRows) {
        const ex = existingById.get(m.sharepoint_item_id);
        if (!ex) { newRows.push(m); continue; }
        const changed: string[] = [];
        if ((ex.dealer_name_snapshot ?? "") !== m.dealer_name_snapshot) changed.push("dealer_name_snapshot");
        if ((ex.machine_serial_number ?? "") !== m.machine_serial_number) changed.push("machine_serial_number");
        if ((ex.machine_model ?? "") !== m.machine_model) changed.push("machine_model");
        if ((ex.delivery_date ?? null) !== m.delivery_date) changed.push("delivery_date");
        if ((ex.customer_name ?? "") !== m.customer_name) changed.push("customer_name");
        if ((ex.customer_email ?? "") !== m.customer_email) changed.push("customer_email");
        if (changed.length > 0) updateRows.push({ row: m, changed_fields: changed });
        else unchangedRows.push(m);
      }
    }

    if (warrantyTableExists && warrantyTableEmpty) {
      warnings.push(
        "Warranty-tabellen er tom. Alle gyldige SharePoint-rækker vil være nye ved første sync.",
      );
    }

    // ---- Dealer matching ----
    const { data: dealers, error: dealerErr } = await admin
      .from("dealer_accounts")
      .select("id, company_name, account_number");
    if (dealerErr) {
      warnings.push(`Kunne ikke læse dealer_accounts: ${dealerErr.message}`);
    }
    const dealerList = (dealers ?? []) as Array<{ id: string; company_name: string; account_number: string | null }>;
    const dealerByNorm = new Map<string, { id: string; company_name: string; account_number: string | null }>();
    for (const d of dealerList) {
      const n = normalizeDealer(d.company_name ?? "");
      if (n) dealerByNorm.set(n, d);
    }

    let aliasByNorm = new Map<string, { dealer_account_id: string; dealer_account_number: string | null }>();
    {
      const { data: aliases, error: aliasErr } = await admin
        .from("dealer_account_aliases")
        .select("normalized_alias, dealer_account_id, dealer_account_number");
      if (aliasErr) {
        const code = (aliasErr as { code?: string }).code;
        if (code === "42P01") {
          warnings.push("Aliasopslag udeladt — dealer_account_aliases findes ikke endnu.");
        } else {
          warnings.push(`Kunne ikke læse dealer_account_aliases: ${aliasErr.message}`);
        }
      } else {
        for (const a of (aliases ?? []) as any[]) {
          aliasByNorm.set(String(a.normalized_alias ?? ""), {
            dealer_account_id: a.dealer_account_id,
            dealer_account_number: a.dealer_account_number ?? null,
          });
        }
      }
    }

    interface SafeMatch {
      sharepoint_item_id: string;
      dealer_name_snapshot: string;
      dealer_account_id: string;
      dealer_company_name: string;
      dealer_account_number: string | null;
      reason: "exact" | "alias";
    }
    interface NeedsReview {
      sharepoint_item_id: string;
      dealer_name_snapshot: string;
      candidates: Array<{
        dealer_account_id: string;
        company_name: string;
        account_number: string | null;
        score: number;
      }>;
    }
    interface Unmatched {
      sharepoint_item_id: string;
      dealer_name_snapshot: string;
    }

    const safe_matches: SafeMatch[] = [];
    const needs_review: NeedsReview[] = [];
    const unmatched: Unmatched[] = [];

    for (const m of validRows) {
      const rawName = m.dealer_name_snapshot;
      if (!rawName) {
        unmatched.push({ sharepoint_item_id: m.sharepoint_item_id, dealer_name_snapshot: "" });
        continue;
      }
      const norm = normalizeDealer(rawName);
      if (!norm) {
        unmatched.push({ sharepoint_item_id: m.sharepoint_item_id, dealer_name_snapshot: rawName });
        continue;
      }

      const exact = dealerByNorm.get(norm);
      if (exact) {
        safe_matches.push({
          sharepoint_item_id: m.sharepoint_item_id,
          dealer_name_snapshot: rawName,
          dealer_account_id: exact.id,
          dealer_company_name: exact.company_name,
          dealer_account_number: exact.account_number ?? null,
          reason: "exact",
        });
        continue;
      }

      const alias = aliasByNorm.get(norm);
      if (alias) {
        const dealer = dealerList.find((d) => d.id === alias.dealer_account_id);
        safe_matches.push({
          sharepoint_item_id: m.sharepoint_item_id,
          dealer_name_snapshot: rawName,
          dealer_account_id: alias.dealer_account_id,
          dealer_company_name: dealer?.company_name ?? "(ukendt — alias)",
          dealer_account_number: alias.dealer_account_number ?? dealer?.account_number ?? null,
          reason: "alias",
        });
        continue;
      }

      const scored = dealerList
        .map((d) => ({
          dealer_account_id: d.id,
          company_name: d.company_name,
          account_number: d.account_number ?? null,
          score: diceCoefficient(norm, normalizeDealer(d.company_name ?? "")),
        }))
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_FUZZY_CANDIDATES);

      if (scored.length > 0 && scored[0].score >= FUZZY_ACCEPT) {
        needs_review.push({
          sharepoint_item_id: m.sharepoint_item_id,
          dealer_name_snapshot: rawName,
          candidates: scored.map((c) => ({
            dealer_account_id: c.dealer_account_id,
            company_name: c.company_name,
            account_number: c.account_number,
            score: Math.round(c.score * 1000) / 1000,
          })),
        });
      } else {
        unmatched.push({
          sharepoint_item_id: m.sharepoint_item_id,
          dealer_name_snapshot: rawName,
        });
      }
    }

    if (unmatched.length > 0) warnings.push(`${unmatched.length} rækker uden sikker dealer-match.`);
    if (needs_review.length > 0) warnings.push(`${needs_review.length} rækker kræver manuel gennemgang før dealer-match.`);

    return jsonResp({
      mode: "dry_run",
      writes_performed: false,
      warranty_table_exists: warrantyTableExists,
      warranty_table_empty: warrantyTableEmpty,
      resolved_field_names: Object.fromEntries(
        Object.entries(FIELD_DISPLAY).map(([k, dn]) => [k, displayToInternal.get(dn) ?? null]),
      ),
      fetched: mapped.length,
      processed: validRows.length,
      rejected_count: rejectedRows.length,
      rejected_sample: rejectedRows.slice(0, 20),
      new: newRows.length,
      updates: updateRows.length,
      unchanged: unchangedRows.length,
      dealer_matching: {
        safe_matches_count: safe_matches.length,
        needs_review_count: needs_review.length,
        unmatched_count: unmatched.length,
        safe_matches: safe_matches.slice(0, 200),
        needs_review: needs_review.slice(0, 200),
        unmatched: unmatched.slice(0, 200),
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
