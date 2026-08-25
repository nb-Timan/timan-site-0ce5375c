// supabase/functions/sharepoint-warranty-sync/index.ts
//
// REAL SharePoint → warranty_registrations sync.
//
// Behaviour (locked-in contract):
//   - Fetch SharePoint "Warranty registration" list and map rows in-memory.
//   - Run dealer matching (exact → alias → fuzzy ≥ 0.8) using existing
//     dealer_accounts + dealer_account_aliases. NEVER creates dealer_accounts
//     and NEVER writes aliases.
//   - Upsert into public.warranty_registrations on (sharepoint_item_id).
//       * matched rows get dealer_account_id + dealer_account_number +
//         dealer_match_status='matched'
//       * needs_review rows are imported with dealer_account_id = NULL,
//         dealer_account_number = NULL, dealer_match_status='needs_review'
//       * unmatched rows are imported with dealer_account_id = NULL,
//         dealer_account_number = NULL, dealer_match_status='unmatched'
//       * dealer_name_snapshot is ALWAYS stored
//   - Never hard-deletes. SharePoint item ids that disappear get
//     is_active_in_source = false on the existing row.
//   - Never touches dealer_accounts. Never touches dealer_account_aliases.
//
// Access: portal_role in ('timan_backend','timan_service'), active & approved.
// Returns: { created, updated, unchanged, unmatched, needs_review,
//            deactivated, warnings, durationMs }.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SP_HOSTNAME = "timandk.sharepoint.com";
const SP_SITE_PATH = "sites/SalgMarketingTiman";
const SP_LIST_DISPLAY_NAME = "Warranty registration";

const FUZZY_ACCEPT = 0.8;

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
  sharepoint_form_id: number | null;
  dealer_name_snapshot: string;
  machine_serial_raw: string;
  machine_serial_number: string;
  machine_model: string;
  delivery_date: string | null;
  customer_name: string;
  customer_zip_city: string;
  customer_address: string;
  customer_phone: string;
  customer_email: string;
  tool_serials: string[];
  source_modified_at: string | null;
  source_created_at: string | null;
}

interface RejectedRow {
  sharepoint_item_id: string;
  dealer_name_snapshot: string;
  reason: "missing_sharepoint_item_id" | "missing_machine_serial";
  machine_model: string;
  customer_name: string;
}

function parseFormId(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  const s = String(raw).trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
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

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || (error.message ?? "").includes("Could not find the table");
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

function toDateOrNull(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  // SharePoint date strings are ISO-ish; just take the date portion.
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(t);
  return m ? m[1] : null;
}

// Split SharePoint "Postnr/by" free-text into (postal_code, city).
// Handles "2630 Taastrup", "2630  Taastrup", "DK-2630 Taastrup",
// "Taastrup 2630", or city-only / postal-only inputs. Returns nulls when
// the input is empty.
function splitZipCity(raw: string): { postal_code: string | null; city: string | null } {
  const t = (raw ?? "").trim();
  if (!t) return { postal_code: null, city: null };
  // "<prefix-?><digits> <city...>"
  let m = /^(?:[A-Za-z]{1,3}-)?(\d{3,5})\s+(.+)$/.exec(t);
  if (m) return { postal_code: m[1], city: m[2].trim() };
  // "<city...> <digits>"
  m = /^(.+?)\s+(\d{3,5})$/.exec(t);
  if (m) return { postal_code: m[2], city: m[1].trim() };
  // Pure digits → postal only
  if (/^\d{3,5}$/.test(t)) return { postal_code: t, city: null };
  // Otherwise treat as city only
  return { postal_code: null, city: t };
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
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

    // ---- Fetch SharePoint ----
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

    const mapped: MappedRow[] = items.map((it: any) => {
      const f = (it.fields ?? {}) as Record<string, unknown>;
      const serialRaw = readMachineSerial(f, displayToInternal);
      const tools = [
        readField(f, displayToInternal, FIELD_DISPLAY.tool_serial_1),
        readField(f, displayToInternal, FIELD_DISPLAY.tool_serial_2),
        readField(f, displayToInternal, FIELD_DISPLAY.tool_serial_3),
        readField(f, displayToInternal, FIELD_DISPLAY.tool_serial_4),
      ].map((x) => x.trim()).filter((x) => x.length > 0);

      // SharePoint exposes ID_Forms either via the column's display name or
      // its internal name. Try the internal lookup first, then the literal
      // "ID_Forms" key which is what Graph returns in the fields blob.
      const formIdRaw =
        (displayToInternal.get("ID_Forms") ? f[displayToInternal.get("ID_Forms")!] : undefined) ??
        f["ID_Forms"] ??
        f["ID_x005f_Forms"];
      return {
        sharepoint_item_id: String(it.id ?? ""),
        sharepoint_form_id: parseFormId(formIdRaw),
        dealer_name_snapshot: readField(f, displayToInternal, FIELD_DISPLAY.dealer_name).trim(),
        machine_serial_raw: serialRaw,
        machine_serial_number: normalizeSerial(serialRaw),
        machine_model: readField(f, displayToInternal, FIELD_DISPLAY.machine_model).trim(),
        delivery_date: readField(f, displayToInternal, FIELD_DISPLAY.delivery_date) || null,
        customer_name: readField(f, displayToInternal, FIELD_DISPLAY.customer_name).trim(),
        customer_zip_city: readField(f, displayToInternal, FIELD_DISPLAY.customer_zip_city, ["Postnr_x002f_by"]).trim(),
        customer_address: readField(f, displayToInternal, FIELD_DISPLAY.customer_address, ["Kunde_x0020_adresse"]).trim(),
        customer_phone: readField(f, displayToInternal, FIELD_DISPLAY.customer_phone, ["Telefon_x002d_Nr"]).trim(),
        customer_email: readField(f, displayToInternal, FIELD_DISPLAY.customer_email, ["E_x002d_mail_x0020_til_x0020_bek"]).trim(),
        tool_serials: tools,
        source_modified_at: it.lastModifiedDateTime ?? null,
        source_created_at: it.createdDateTime ?? null,
      };
    });

    // Skip rows with empty SP id or empty serial (DB requires non-empty serial)
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
    const skippedNoId = rejectedRows.filter((r) => r.reason === "missing_sharepoint_item_id").length;
    const skippedNoSerial = rejectedRows.filter((r) => r.reason === "missing_machine_serial").length;
    if (skippedNoId > 0) warnings.push(`${skippedNoId} SharePoint-rækker uden item id sprunget over.`);
    if (skippedNoSerial > 0) warnings.push(`${skippedNoSerial} rækker uden serienummer sprunget over (DB-krav).`);
    const missingFormId = validRows.filter((r) => r.sharepoint_form_id === null).length;
    if (missingFormId > 0) {
      warnings.push(`${missingFormId} rækker mangler ID_Forms — falder tilbage til SharePoint item id som certifikatnummer.`);
    }

    const tableProbe = await admin
      .from("warranty_registrations")
      .select("id", { head: true, count: "exact" });
    if (tableProbe.error && isMissingTableError(tableProbe.error)) {
      return jsonResp({
        mode: "real_sync",
        completed: false,
        writes_performed: false,
        fatal_error: "Databasetabellen warranty_registrations mangler eller er ikke opdateret i Supabase schema cache. Sync kan derfor ikke gemme garantiregistreringer.",
        fetched: mapped.length,
        processed: validRows.length,
        rejected_count: rejectedRows.length,
        rejected_sample: rejectedRows.slice(0, 20),
        created: 0,
        updated: 0,
        unchanged: 0,
        matched: 0,
        needs_review: 0,
        unmatched: 0,
        deactivated: 0,
        conflicts_count: 0,
        warnings: [
          ...warnings,
          `Kunne ikke læse warranty_registrations: ${tableProbe.error.message}`,
        ],
        durationMs: Date.now() - t0,
      });
    }
    if (tableProbe.error) {
      warnings.push(`Kunne ikke verificere warranty_registrations før sync: ${tableProbe.error.message}`);
    }

    // ---- Load dealer matching inputs ----
    const { data: dealers, error: dealerErr } = await admin
      .from("dealer_accounts")
      .select("id, company_name, account_number");
    if (dealerErr) warnings.push(`Kunne ikke læse dealer_accounts: ${dealerErr.message}`);
    const dealerList = (dealers ?? []) as Array<{ id: string; company_name: string; account_number: string | null }>;
    const dealerByNorm = new Map<string, { id: string; company_name: string; account_number: string | null }>();
    for (const d of dealerList) {
      const n = normalizeDealer(d.company_name ?? "");
      if (n) dealerByNorm.set(n, d);
    }

    const aliasByNorm = new Map<string, { dealer_account_id: string; dealer_account_number: string | null }>();
    {
      const { data: aliases, error: aliasErr } = await admin
        .from("dealer_account_aliases")
        .select("normalized_alias, dealer_account_id, dealer_account_number");
      if (aliasErr) {
        if (isMissingTableError(aliasErr)) {
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

    // ---- Load existing rows for diff ----
    const ids = validRows.map((m) => m.sharepoint_item_id);
    const existingById = new Map<string, any>();
    if (ids.length > 0) {
      // chunk to avoid URL limits
      const chunk = 200;
      for (let i = 0; i < ids.length; i += chunk) {
        const slice = ids.slice(i, i + chunk);
        const { data, error } = await admin
          .from("warranty_registrations")
          .select("id, sharepoint_item_id, dealer_name_snapshot, machine_serial_number, machine_model, delivery_date, customer_name, customer_email, customer_address, customer_phone, customer_postal_code, customer_city, customer_country, dealer_account_id, dealer_account_number, dealer_match_status, dealer_match_method, dealer_match_confidence, dealer_match_reviewed_by, dealer_match_reviewed_at, is_active_in_source, sharepoint_created_at")
          .in("sharepoint_item_id", slice);
        if (error) {
          warnings.push(`Kunne ikke læse warranty_registrations: ${error.message}`);
        } else {
          for (const row of (data ?? [])) existingById.set(String(row.sharepoint_item_id), row);
        }
      }
    }

    // ---- Resolve match per row ----
    interface Resolved {
      m: MappedRow;
      dealer_account_id: string | null;
      dealer_account_number: string | null;
      dealer_match_status: "matched" | "needs_review" | "unmatched";
      dealer_match_method: string | null;
      dealer_match_confidence: number | null;
    }

    const resolved: Resolved[] = validRows.map((m) => {
      const norm = normalizeDealer(m.dealer_name_snapshot);
      if (!norm) {
        return { m, dealer_account_id: null, dealer_account_number: null, dealer_match_status: "unmatched", dealer_match_method: null, dealer_match_confidence: null };
      }
      const exact = dealerByNorm.get(norm);
      if (exact) {
        return { m, dealer_account_id: exact.id, dealer_account_number: exact.account_number ?? null, dealer_match_status: exact.account_number ? "matched" : "needs_review", dealer_match_method: "exact_name", dealer_match_confidence: 1 };
      }
      const alias = aliasByNorm.get(norm);
      if (alias) {
        const dealer = dealerList.find((d) => d.id === alias.dealer_account_id);
        const acct = alias.dealer_account_number ?? dealer?.account_number ?? null;
        return { m, dealer_account_id: alias.dealer_account_id, dealer_account_number: acct, dealer_match_status: acct ? "matched" : "needs_review", dealer_match_method: "alias", dealer_match_confidence: 1 };
      }
      // fuzzy
      let best: { id: string; score: number; account_number: string | null } | null = null;
      for (const d of dealerList) {
        const s = diceCoefficient(norm, normalizeDealer(d.company_name ?? ""));
        if (s > 0 && (!best || s > best.score)) best = { id: d.id, score: s, account_number: d.account_number ?? null };
      }
      if (best && best.score >= FUZZY_ACCEPT) {
        // suggested but NOT auto-linked. Import as needs_review without dealer link
        // so it surfaces in the manual approval UI.
        return { m, dealer_account_id: null, dealer_account_number: null, dealer_match_status: "needs_review", dealer_match_method: null, dealer_match_confidence: best.score };
      }
      return { m, dealer_account_id: null, dealer_account_number: null, dealer_match_status: "unmatched", dealer_match_method: null, dealer_match_confidence: null };
    });

    // ---- Load portal-edited field protection ----
    // SAFE RULE: SharePoint sync must NEVER overwrite a field that has been
    // edited in the portal (warranty_registration_history rows where
    // change_source = 'portal_edit'). We collect the set of protected field
    // names per registration_id from the diff keys and skip those fields
    // when building the upsert payload — they remain at their current DB
    // value and are surfaced as conflicts.
    const PROTECTED_FIELDS = new Set<string>([
      "customer_name",
      "customer_address",
      "customer_postal_code",
      "customer_city",
      "customer_country",
      "customer_phone",
      "customer_email",
      "delivery_date",
      "machine_model",
    ]);
    const portalEditedByRegId = new Map<string, Set<string>>();
    {
      const regIds = Array.from(existingById.values()).map((r) => r.id).filter(Boolean);
      const chunkH = 200;
      for (let i = 0; i < regIds.length; i += chunkH) {
        const slice = regIds.slice(i, i + chunkH);
        const { data, error } = await admin
          .from("warranty_registration_history")
          .select("registration_id, diff")
          .eq("change_source", "portal_edit")
          .in("registration_id", slice);
        if (error) {
          warnings.push(`Kunne ikke læse warranty_registration_history (portal_edit beskyttelse): ${error.message}`);
        } else {
          for (const h of (data ?? []) as any[]) {
            const rid = String(h.registration_id);
            const set = portalEditedByRegId.get(rid) ?? new Set<string>();
            const diff = h.diff ?? {};
            if (diff && typeof diff === "object") {
              for (const k of Object.keys(diff)) {
                if (k.startsWith("_")) continue;
                if (PROTECTED_FIELDS.has(k)) set.add(k);
              }
            }
            portalEditedByRegId.set(rid, set);
          }
        }
      }
    }

    // ---- Build upsert payloads + count buckets ----
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let matchedCount = 0;
    let needsReviewCount = 0;
    let unmatchedCount = 0;
    let manualMatchesPreservedCount = 0;
    let fieldsPreservedFromPortalCount = 0;

    interface ConflictEntry {
      registration_id: string;
      sharepoint_item_id: string;
      dealer_name_snapshot: string;
      field: string;
      portal_value: unknown;
      sharepoint_value: unknown;
    }
    const conflicts: ConflictEntry[] = [];

    const upserts: any[] = [];
    for (const r of resolved) {
      const ex = existingById.get(r.m.sharepoint_item_id);
      const zipCity = splitZipCity(r.m.customer_zip_city);
      // Preserve the original SharePoint Created date. Existing DB value
      // always wins so Excel-restored / manually corrected dates can never
      // be overwritten by a later SharePoint sync. Only fall back to the
      // SP createdDateTime when the DB column is genuinely empty.
      const preservedSpCreated =
        (ex?.sharepoint_created_at as string | null | undefined) ?? r.m.source_created_at ?? null;

      const payload: Record<string, unknown> = {
        // Source / identity
        sharepoint_item_id: r.m.sharepoint_item_id,
        sharepoint_form_id: r.m.sharepoint_form_id,
        source: "sharepoint",
        sharepoint_modified_at: r.m.source_modified_at,
        sharepoint_created_at: preservedSpCreated,


        // Machine
        machine_serial_number: r.m.machine_serial_number,
        machine_serial_raw: r.m.machine_serial_raw || r.m.machine_serial_number,
        machine_model: r.m.machine_model || null,
        tool_serials: r.m.tool_serials,

        // Dealer relation (name-first; unmatched keeps id+number = null)
        dealer_name_snapshot: r.m.dealer_name_snapshot || "(ukendt)",
        dealer_account_id: r.dealer_account_id,
        dealer_account_number: r.dealer_account_number,
        dealer_match_status: r.dealer_match_status,
        dealer_match_method: r.dealer_match_method,
        dealer_match_confidence: r.dealer_match_confidence,

        // Customer (PII)
        customer_name: r.m.customer_name || null,
        customer_address: r.m.customer_address || null,
        customer_postal_code: zipCity.postal_code,
        customer_city: zipCity.city,
        customer_country: null, // SharePoint does not provide country
        customer_phone: r.m.customer_phone || null,
        customer_email: r.m.customer_email || null,

        // Form
        delivery_date: toDateOrNull(r.m.delivery_date),

        // Lifecycle
        is_active_in_source: true,
        last_synced_at: new Date().toISOString(),
      };

      // ---- Preserve manual dealer matches ----
      // If timan_backend/timan_service has manually linked this row to a
      // dealer (dealer_match_method = 'manual'), SharePoint sync must NEVER
      // downgrade or rewrite the dealer link — even if the SP name now
      // matches another dealer or matches nothing.
      const exMethod = ex?.dealer_match_method as string | null | undefined;
      const exDealerId = ex?.dealer_account_id as string | null | undefined;
      if (ex && exMethod === "manual" && exDealerId) {
        payload.dealer_account_id = ex.dealer_account_id;
        payload.dealer_account_number = ex.dealer_account_number ?? null;
        payload.dealer_match_status = "matched";
        payload.dealer_match_method = "manual";
        payload.dealer_match_confidence = ex.dealer_match_confidence ?? null;
        manualMatchesPreservedCount++;
      }

      // Count buckets reflect the FINAL state after manual-match protection.
      const finalStatus = payload.dealer_match_status as string;
      if (finalStatus === "matched") matchedCount++;
      else if (finalStatus === "needs_review") needsReviewCount++;
      else unmatchedCount++;

      // ---- Protect portal-edited fields from being overwritten ----
      if (ex) {
        const protectedSet = portalEditedByRegId.get(String(ex.id));
        if (protectedSet && protectedSet.size > 0) {
          for (const field of protectedSet) {
            const portalVal = (ex as Record<string, unknown>)[field] ?? null;
            const spVal = payload[field] ?? null;
            const same = String(portalVal ?? "") === String(spVal ?? "");
            // Always restore portal value so sync never overwrites it.
            payload[field] = portalVal;
            fieldsPreservedFromPortalCount++;
            if (!same) {
              conflicts.push({
                registration_id: String(ex.id),
                sharepoint_item_id: r.m.sharepoint_item_id,
                dealer_name_snapshot: r.m.dealer_name_snapshot || "(ukendt)",
                field,
                portal_value: portalVal,
                sharepoint_value: spVal,
              });
            }
          }
        }
      }

      upserts.push(payload);

      if (!ex) {
        created++;
      } else {
        const changed =
          (ex.dealer_name_snapshot ?? "") !== payload.dealer_name_snapshot ||
          (ex.machine_serial_number ?? "") !== payload.machine_serial_number ||
          (ex.machine_model ?? "") !== (payload.machine_model ?? "") ||
          String(ex.delivery_date ?? "") !== String(payload.delivery_date ?? "") ||
          (ex.customer_name ?? "") !== (payload.customer_name ?? "") ||
          (ex.customer_email ?? "") !== (payload.customer_email ?? "") ||
          (ex.customer_address ?? "") !== (payload.customer_address ?? "") ||
          (ex.customer_phone ?? "") !== (payload.customer_phone ?? "") ||
          (ex.customer_postal_code ?? "") !== (payload.customer_postal_code ?? "") ||
          (ex.customer_city ?? "") !== (payload.customer_city ?? "") ||
          (ex.dealer_account_id ?? null) !== (payload.dealer_account_id ?? null) ||
          (ex.dealer_match_status ?? "") !== payload.dealer_match_status ||
          ex.is_active_in_source !== true;
        if (changed) updated++;
        else unchanged++;
      }
    }

    // ---- Perform upserts in chunks ----
    if (upserts.length > 0) {
      const chunk = 100;
      for (let i = 0; i < upserts.length; i += chunk) {
        const slice = upserts.slice(i, i + chunk);
        const { error } = await admin
          .from("warranty_registrations")
          .upsert(slice, { onConflict: "sharepoint_item_id" });
        if (error) {
          warnings.push(`Upsert fejlede for chunk ${i}-${i + slice.length}: ${error.message}`);
        }
      }
    }

    // ---- Soft-deactivate rows that vanished from SharePoint ----
    let deactivated = 0;
    {
      const seen = new Set(validRows.map((r) => r.sharepoint_item_id));
      const { data: allActive, error: actErr } = await admin
        .from("warranty_registrations")
        .select("id, sharepoint_item_id")
        .eq("is_active_in_source", true)
        .eq("source", "sharepoint");
      if (actErr) {
        warnings.push(`Kunne ikke læse aktive rækker for soft-delete: ${actErr.message}`);
      } else {
        const stale = (allActive ?? []).filter((r) => !seen.has(String(r.sharepoint_item_id)));
        if (stale.length > 0) {
          const ids = stale.map((r) => r.id);
          const { error: upErr } = await admin
            .from("warranty_registrations")
            .update({ is_active_in_source: false, last_synced_at: new Date().toISOString() })
            .in("id", ids);
          if (upErr) warnings.push(`Kunne ikke markere is_active_in_source=false: ${upErr.message}`);
          else deactivated = stale.length;
        }
      }
    }

    return jsonResp({
      mode: "real_sync",
      completed: true,
      writes_performed: true,
      fetched: mapped.length,
      processed: validRows.length,
      rejected_count: rejectedRows.length,
      rejected_sample: rejectedRows.slice(0, 20),
      created,
      updated,
      unchanged,
      matched: matchedCount,
      needs_review: needsReviewCount,
      unmatched: unmatchedCount,
      deactivated,
      conflicts_count: conflicts.length,
      conflicts,
      manual_matches_preserved_count: manualMatchesPreservedCount,
      fields_preserved_from_portal_count: fieldsPreservedFromPortalCount,
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
