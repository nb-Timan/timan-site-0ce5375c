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
//   Oprettet    → source_created_at
//   Ændret      → source_modified_at
//
// Safety:
//   • Never deletes. Rows missing in SharePoint stay in Supabase.
//   • Always matches on account_number.
//   • dryRun=true (default) does NOT write — returns summary only.
//   • Requires Microsoft Graph app-only credentials + Sites.Read.All.
//   • Admin-only access enforced via caller's Supabase JWT + app_users.portal_role.
//
// Required secrets (set in Supabase project — Edge Function Secrets):
//   MICROSOFT_TENANT_ID
//   MICROSOFT_CLIENT_ID
//   MICROSOFT_CLIENT_SECRET
//   SUPABASE_URL                (auto-injected)
//   SUPABASE_SERVICE_ROLE_KEY   (auto-injected)
//   SUPABASE_ANON_KEY           (auto-injected, for caller-JWT auth check)

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
  // 1) Resolve site
  const site = await graphGet(
    token,
    `https://graph.microsoft.com/v1.0/sites/${SP_HOSTNAME}:/${SP_SITE_PATH}`,
  );
  // 2) Resolve list by display name
  const lists = await graphGet(
    token,
    `https://graph.microsoft.com/v1.0/sites/${site.id}/lists?$filter=displayName eq '${SP_LIST_NAME}'`,
  );
  const list = lists.value?.[0];
  if (!list) throw new Error(`SharePoint list '${SP_LIST_NAME}' not found on site.`);
  // 3) Page through items, expanding fields
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();

  try {
    // --- Auth: require signed-in Timan Backend / admin ---------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const supaAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supaService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supaUrl, supaAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsRes, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claimsRes?.claims?.email) {
      return json({ error: "Unauthorized" }, 401);
    }
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

    // --- Parse options ----------------------------------------------------
    let dryRun = true;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (typeof body?.dryRun === "boolean") dryRun = body.dryRun;
      } catch { /* default dryRun=true */ }
    } else {
      const u = new URL(req.url);
      if (u.searchParams.get("dryRun") === "false") dryRun = false;
    }

    // --- Fetch SharePoint -------------------------------------------------
    const token = await getGraphToken();
    const rawRows = await fetchAllSharePointRows(token);

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

    // --- Map + validate ---------------------------------------------------
    type Row = {
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
    const nowIso = new Date().toISOString();
    const mapped: Row[] = [];
    for (const item of rawRows) {
      const f = item.fields ?? {};
      const account = (f.Account ?? "").toString().trim();
      const company = (f.Title ?? "").toString().trim();
      if (!account || !company) {
        summary.skipped++;
        summary.warnings++;
        if (summary.warningDetails.length < 20)
          summary.warningDetails.push(`Skip row id=${item.id}: missing Account/Titel.`);
        continue;
      }
      const code = f.A_B_KUNDE != null ? String(f.A_B_KUNDE) : null;
      const { type, warn } = mapDealerType(code);
      if (warn) {
        summary.warnings++;
        if (summary.warningDetails.length < 20)
          summary.warningDetails.push(
            `Unknown A_B_KUNDE='${code ?? ""}' for account=${account} — defaulted to 'dealer'.`,
          );
      }
      mapped.push({
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
      });
      summary.valid++;
    }

    // --- Diff vs existing -------------------------------------------------
    const accountNumbers = mapped.map((r) => r.account_number);
    const { data: existing, error: exErr } = await admin
      .from("dealer_accounts")
      .select("account_number")
      .in("account_number", accountNumbers.length ? accountNumbers : ["__none__"]);
    if (exErr) throw new Error(`Supabase read error: ${exErr.message}`);
    const existingSet = new Set((existing ?? []).map((r: any) => r.account_number));
    for (const r of mapped) {
      if (existingSet.has(r.account_number)) summary.updated++;
      else summary.created++;
    }

    // --- Write (unless dryRun) -------------------------------------------
    if (!dryRun && mapped.length) {
      // Upsert in chunks of 500
      for (let i = 0; i < mapped.length; i += 500) {
        const chunk = mapped.slice(i, i + 500);
        const { error: upErr } = await admin
          .from("dealer_accounts")
          .upsert(chunk, { onConflict: "account_number" });
        if (upErr) throw new Error(`Supabase upsert error: ${upErr.message}`);
      }
    }

    summary.durationMs = Date.now() - t0;
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
