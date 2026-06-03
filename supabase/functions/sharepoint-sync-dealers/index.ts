// supabase/functions/sharepoint-sync-dealers/index.ts
//
// SharePoint → Supabase sync for dealer_accounts.
//
// Source list:  https://timandk.sharepoint.com/sites/SalgMarketingTiman
//               List: DebitorFiltered (98 rows expected)
//
// Mapping (SharePoint field → dealer_accounts column):
//   Titel       → company_name
//   Account     → account_number       (match key, upsert on this)
//   A_B_KUNDE   → source_customer_type_code  ("1" | "2" | "3" | …)
//                 dealer_type: 1=dealer, 2=service_partner, 3=importer
//                 unknown    → dealer_type='dealer' + warning
//   COUNTRY     → country
//   ADDRESS1    → address_line_1
//   ADDRESS2    → address_line_2
//   ZIPCITY     → zip_city_raw   (then split into postal_code + city)
//   Oprettet    → source_created_at
//   Ændret      → source_modified_at
//
// Modes:
//   • default / { dryRun: true }  — fetch + validate + diff, NO write
//   • { dryRun: false }           — actually upsert (NEVER deletes)
//   • { mode: "verify", limit }   — side-by-side compare first N SP rows
//                                   vs dealer_accounts. READ-ONLY.
//
// Safety:
//   • Never deletes. Rows missing in SharePoint stay in Supabase.
//   • Always matches on account_number.
//   • dryRun=true (default) does NOT write — returns summary only.
//   • Requires Microsoft Graph app-only credentials + Sites.Read.All.
//   • Admin-only access enforced via caller's Supabase JWT + app_users.portal_role.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SP_HOSTNAME = "timandk.sharepoint.com";
const SP_SITE_PATH = "sites/SalgMarketingTiman";
const SP_LIST_NAME = "DebitorFiltered";

type DealerType = "dealer" | "service_partner" | "importer";

interface SyncSummary {
  fetched: number;
  valid: number;
  created: number;
  updated: number;
  skipped: number;
  warnings: number;
  dryRun: boolean;
  warningDetails: string[];
  durationMs: number;
}

/**
 * Split "8920 Randers NV" / "DK-8920 Randers" / "1000 Copenhagen K" into
 * { postal_code, city }. Returns nulls when ambiguous.
 */
function splitZipCity(raw: string | null | undefined): { postal_code: string | null; city: string | null } {
  const s = (raw ?? "").toString().trim();
  if (!s) return { postal_code: null, city: null };
  // Strip optional "XX-" country prefix (e.g. "DK-8920").
  const cleaned = s.replace(/^[A-Za-z]{1,3}-\s*/, "").trim();
  // First whitespace-separated token must look like a postal code
  // (digits and optional spaces, e.g. "8920", "1000", "SW1A 1AA" handled loosely).
  const m = cleaned.match(/^([0-9][0-9A-Za-z\s-]{1,9})\s+(.+)$/);
  if (m) {
    return { postal_code: m[1].trim(), city: m[2].trim() };
  }
  // Fallback — first numeric block as postal, rest as city.
  const m2 = cleaned.match(/^(\d{3,6})\s*(.*)$/);
  if (m2) {
    return { postal_code: m2[1], city: m2[2].trim() || null };
  }
  return { postal_code: null, city: cleaned || null };
}

function mapDealerType(code: string | null | undefined): { type: DealerType; warn: boolean } {
  const c = (code ?? "").toString().trim();
  if (c === "1") return { type: "dealer", warn: false };
  if (c === "2") return { type: "service_partner", warn: false };
  if (c === "3") return { type: "importer", warn: false };
  return { type: "dealer", warn: true };
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
  const j = await r.json();
  return j.access_token as string;
}

async function graphGet(token: string, url: string): Promise<any> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Graph ${r.status} ${url}: ${await r.text()}`);
  return await r.json();
}

async function fetchAllSharePointRows(token: string): Promise<any[]> {
  const site = await graphGet(
    token,
    `https://graph.microsoft.com/v1.0/sites/${SP_HOSTNAME}:/${SP_SITE_PATH}`,
  );
  const lists = await graphGet(
    token,
    `https://graph.microsoft.com/v1.0/sites/${site.id}/lists?$filter=displayName eq '${SP_LIST_NAME}'`,
  );
  const list = lists.value?.[0];
  if (!list) throw new Error(`SharePoint list '${SP_LIST_NAME}' not found on site.`);
  const rows: any[] = [];
  let next: string | null =
    `https://graph.microsoft.com/v1.0/sites/${site.id}/lists/${list.id}/items?$expand=fields&$top=1000`;
  while (next) {
    const page = await graphGet(token, next);
    rows.push(...(page.value ?? []));
    next = page["@odata.nextLink"] ?? null;
  }
  return rows;
}

type MappedRow = {
  account_number: string;
  company_name: string;
  dealer_type: DealerType;
  country: string | null;
  source: "sharepoint";
  external_id: string | null;
  source_customer_type_code: string | null;
  source_created_at: string | null;
  source_modified_at: string | null;
  last_synced_at: string;
  is_active: boolean;
};

function mapSpRow(item: any, nowIso: string): { row: MappedRow | null; warn: string | null; skipReason: string | null } {
  const f = item.fields ?? {};
  const account = (f.Account ?? "").toString().trim();
  const company = (f.Title ?? "").toString().trim();
  if (!account || !company) {
    return { row: null, warn: null, skipReason: `Missing Account/Titel (sp id=${item.id})` };
  }
  const code = f.A_B_KUNDE != null ? String(f.A_B_KUNDE) : null;
  const { type, warn } = mapDealerType(code);
  return {
    row: {
      account_number: account,
      company_name: company,
      dealer_type: type,
      country: (f.COUNTRY ?? null) || null,
      source: "sharepoint",
      external_id: String(item.id),
      source_customer_type_code: code,
      source_created_at: f.Oprettet ?? null,
      source_modified_at: f["Ændret"] ?? f.Modified ?? null,
      last_synced_at: nowIso,
      is_active: true,
    },
    warn: warn ? `Unknown A_B_KUNDE='${code ?? ""}' for account=${account} — defaulted to 'dealer'.` : null,
    skipReason: null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();

  try {
    // --- Auth -----------------------------------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const supaAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supaService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supaUrl, supaAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsRes, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claimsRes?.claims?.email) return json({ error: "Unauthorized" }, 401);
    const email = String(claimsRes.claims.email).toLowerCase();
    const admin = createClient(supaUrl, supaService);
    const { data: appUser } = await admin
      .from("app_users")
      .select("portal_role, is_active, approved")
      .ilike("email", email)
      .maybeSingle();
    if (
      !appUser ||
      appUser.is_active === false ||
      appUser.approved === false ||
      appUser.portal_role !== "timan_backend"
    ) {
      return json({ error: "Forbidden — Timan Backend only" }, 403);
    }

    // --- Parse options --------------------------------------------------
    let dryRun = true;
    let mode: "sync" | "verify" = "sync";
    let limit = 20;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (typeof body?.dryRun === "boolean") dryRun = body.dryRun;
        if (body?.mode === "verify") mode = "verify";
        if (typeof body?.limit === "number" && body.limit > 0 && body.limit <= 500) limit = body.limit;
      } catch { /* defaults */ }
    } else {
      const u = new URL(req.url);
      if (u.searchParams.get("dryRun") === "false") dryRun = false;
      if (u.searchParams.get("mode") === "verify") mode = "verify";
    }

    // --- Fetch SharePoint -----------------------------------------------
    const token = await getGraphToken();
    const rawRows = await fetchAllSharePointRows(token);
    const nowIso = new Date().toISOString();

    // ======================================================================
    // VERIFY MODE — read-only side-by-side mapping check
    // ======================================================================
    if (mode === "verify") {
      const mappedAll: MappedRow[] = [];
      for (const item of rawRows) {
        const { row } = mapSpRow(item, nowIso);
        if (row) mappedAll.push(row);
      }
      const slice = mappedAll.slice(0, limit);
      const allAccountNumbers = mappedAll.map((r) => r.account_number);

      // Fetch dealer_accounts for the slice (for side-by-side details)
      const sliceAccounts = slice.map((r) => r.account_number);
      const { data: daSlice, error: daErr } = await admin
        .from("dealer_accounts")
        .select("account_number, company_name, dealer_type, country")
        .in("account_number", sliceAccounts.length ? sliceAccounts : ["__none__"]);
      if (daErr) throw new Error(`Supabase read error: ${daErr.message}`);
      const daMap = new Map<string, any>();
      (daSlice ?? []).forEach((r: any) => daMap.set(r.account_number, r));

      // Fetch ALL existing accounts for totals
      const { data: daAll, error: daAllErr } = await admin
        .from("dealer_accounts")
        .select("account_number");
      if (daAllErr) throw new Error(`Supabase read error: ${daAllErr.message}`);
      const daAllSet = new Set((daAll ?? []).map((r: any) => r.account_number));
      const spAllSet = new Set(allAccountNumbers);

      const norm = (v: unknown) => (v == null ? "" : String(v).trim().toLowerCase());
      const comparisons = slice.map((sp) => {
        const da = daMap.get(sp.account_number) ?? null;
        const fields = ["account_number", "company_name", "dealer_type", "country"] as const;
        const fieldResults = fields.map((f) => {
          const spVal = (sp as any)[f] ?? null;
          const daVal = da ? (da[f] ?? null) : null;
          const match = da ? norm(spVal) === norm(daVal) : false;
          return { field: f, sharepoint: spVal, dealer_accounts: daVal, match };
        });
        const allMatch = !!da && fieldResults.every((r) => r.match);
        return {
          account_number: sp.account_number,
          exists_in_dealer_accounts: !!da,
          all_match: allMatch,
          fields: fieldResults,
        };
      });

      // Totals across ALL sharepoint rows (not just the slice)
      let matches = 0;
      let mismatches = 0;
      let missing_in_dealer_accounts = 0;
      const { data: daAllFull, error: daAllFullErr } = await admin
        .from("dealer_accounts")
        .select("account_number, company_name, dealer_type, country");
      if (daAllFullErr) throw new Error(`Supabase read error: ${daAllFullErr.message}`);
      const daFullMap = new Map<string, any>();
      (daAllFull ?? []).forEach((r: any) => daFullMap.set(r.account_number, r));
      for (const sp of mappedAll) {
        const da = daFullMap.get(sp.account_number);
        if (!da) { missing_in_dealer_accounts++; continue; }
        const ok = norm(sp.company_name) === norm(da.company_name)
          && norm(sp.dealer_type) === norm(da.dealer_type)
          && norm(sp.country) === norm(da.country);
        if (ok) matches++; else mismatches++;
      }
      let missing_in_sharepoint = 0;
      for (const acc of daAllSet) if (!spAllSet.has(acc)) missing_in_sharepoint++;

      return json({
        mode: "verify",
        dryRun: true,
        total_sharepoint: mappedAll.length,
        total_dealer_accounts: daAllSet.size,
        total_checked: mappedAll.length,
        matches,
        mismatches,
        missing_in_dealer_accounts,
        missing_in_sharepoint,
        sample_size: comparisons.length,
        comparisons,
        durationMs: Date.now() - t0,
      }, 200);
    }

    // ======================================================================
    // SYNC / DRY-RUN MODE (unchanged)
    // ======================================================================
    const summary: SyncSummary = {
      fetched: rawRows.length,
      valid: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      warnings: 0,
      dryRun,
      warningDetails: [],
      durationMs: 0,
    };

    const mapped: MappedRow[] = [];
    for (const item of rawRows) {
      const { row, warn, skipReason } = mapSpRow(item, nowIso);
      if (skipReason) {
        summary.skipped++;
        summary.warnings++;
        if (summary.warningDetails.length < 20) summary.warningDetails.push(skipReason);
        continue;
      }
      if (warn) {
        summary.warnings++;
        if (summary.warningDetails.length < 20) summary.warningDetails.push(warn);
      }
      if (row) {
        mapped.push(row);
        summary.valid++;
      }
    }

    const accountNumbers = mapped.map((r) => r.account_number);
    const { data: existing, error: exErr } = await admin
      .from("dealer_accounts")
      .select("account_number")
      .in("account_number", accountNumbers.length ? accountNumbers : ["__none__"]);
    if (exErr) throw new Error(`Supabase read error: ${exErr.message}`);
    const existingSet = new Set((existing ?? []).map((r: any) => r.account_number));

    const toCreate: MappedRow[] = [];
    const toUpdate: MappedRow[] = [];
    for (const r of mapped) {
      if (existingSet.has(r.account_number)) toUpdate.push(r);
      else toCreate.push(r);
    }
    summary.updated = toUpdate.length;
    summary.created = toCreate.length;

    if (!dryRun) {
      // INSERT new accounts (full record incl. defaults).
      for (let i = 0; i < toCreate.length; i += 500) {
        const chunk = toCreate.slice(i, i + 500);
        const { error: insErr } = await admin
          .from("dealer_accounts")
          .insert(chunk);
        if (insErr) throw new Error(`Supabase insert error: ${insErr.message}`);
      }
      // UPDATE existing accounts — ONLY masterdata fields. Never touches
      // assigned_seller, crm fields, users, offers, orders, notes, etc.
      for (const r of toUpdate) {
        const patch = {
          company_name: r.company_name,
          dealer_type: r.dealer_type,
          country: r.country,
          source_customer_type_code: r.source_customer_type_code,
          source_modified_at: r.source_modified_at,
          last_synced_at: r.last_synced_at,
        };
        const { error: updErr } = await admin
          .from("dealer_accounts")
          .update(patch)
          .eq("account_number", r.account_number);
        if (updErr) throw new Error(`Supabase update error for ${r.account_number}: ${updErr.message}`);
      }
    }

    summary.durationMs = Date.now() - t0;

    // Persist a log entry (best-effort; do not fail the response).
    try {
      await admin.from("sharepoint_sync_logs").insert({
        ran_at: nowIso,
        ran_by_email: email,
        ran_by_user_id: (claimsRes?.claims?.sub as string | undefined) ?? null,
        dry_run: dryRun,
        fetched: summary.fetched,
        valid: summary.valid,
        created: summary.created,
        updated: summary.updated,
        skipped: summary.skipped,
        warnings: summary.warnings,
        duration_ms: summary.durationMs,
        warning_details: summary.warningDetails,
        error: null,
      });
    } catch (_logErr) { /* ignore log errors */ }

    return json(summary, 200);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - t0 },
      500,
    );
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
