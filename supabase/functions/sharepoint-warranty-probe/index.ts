// supabase/functions/sharepoint-warranty-probe/index.ts
//
// READ-ONLY SharePoint probe for the "Warranty registration" list.
//
// Source list:
//   https://timandk.sharepoint.com/sites/SalgMarketingTiman
//   List display name: "Warranty registration"
//
// What this function does:
//   1. Resolves the SharePoint site via Microsoft Graph.
//   2. Finds the list whose displayName is "Warranty registration"
//      (fallback: name contains "warranty").
//   3. Fetches /lists/{id}/columns and returns
//      { displayName, name, id, type } for each column.
//   4. Fetches /lists/{id}/items?$expand=fields&$top=10 and returns
//      the raw `fields` objects of the first 10 rows.
//   5. Returns a suggested mapping draft to public.warranty_registrations.
//
// What this function does NOT do:
//   - No writes anywhere (no Supabase insert/update/delete).
//   - No real sync.
//   - No dealer matching.
//   - No persistence of probe results.
//   - No logging to sharepoint_sync_logs.
//
// Access: Timan Backend only (same gate as sharepoint-sync-dealers).
// Required secrets: MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SP_HOSTNAME = "timandk.sharepoint.com";
const SP_SITE_PATH = "sites/SalgMarketingTiman";
const SP_LIST_DISPLAY_NAME = "Warranty registration";

// Suggested mapping draft — for human review only. NOT applied anywhere.
// Keys = expected SharePoint column displayName, values = target column in
// public.warranty_registrations (per docs/sql/phase57_warranty_registrations.sql).
const SUGGESTED_MAPPING_DRAFT: Record<string, string> = {
  "ID_Forms": "sharepoint_item_id (string form of SP item id / ID_Forms)",
  "Forhandlernavn": "dealer_name_raw  (free text — needs alias matching)",
  "Din nye maskines identifikationsnummer": "machine_serial_raw (→ trigger normalizes to machine_serial_number)",
  "Hvilken maskine er solgt": "machine_model",
  "Leveringsdato": "delivery_date (date)",
  "Kunde": "customer_name",
  "Postnr/by": "customer_zip_city",
  "Kunde adresse": "customer_address",
  "Telefon-Nr": "customer_phone",
  "E-mail til bekræftelse": "customer_email",
  "Oprettet": "source_created_at",
  "Dit nye redskabs identifikationsnummer": "attachment_serial_1",
  "Dit nye redskabs identifikationsnummer2": "attachment_serial_2",
  "Dit nye redskabs identifikationsnummer3": "attachment_serial_3",
  "Dit nye redskabs identifikationsnummer4": "attachment_serial_4",
};

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

function detectColumnType(col: any): string {
  // Graph column resources have one of these sub-objects set.
  const keys = [
    "text", "number", "boolean", "dateTime", "choice", "personOrGroup",
    "lookup", "hyperlinkOrPicture", "calculated", "currency", "geolocation",
    "term", "contentApprovalStatus", "thumbnail",
  ];
  for (const k of keys) {
    if (col?.[k]) return k;
  }
  return "unknown";
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // --- Auth: Timan Backend only --------------------------------------
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

    // --- Probe SharePoint (READ-ONLY) ----------------------------------
    const token = await getGraphToken();

    const site = await graphGet(
      token,
      `https://graph.microsoft.com/v1.0/sites/${SP_HOSTNAME}:/${SP_SITE_PATH}`,
    );
    const siteId: string = site.id;

    const listsResp = await graphGet(
      token,
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists?$select=id,name,displayName,webUrl`,
    );
    const allLists = (listsResp.value ?? []) as any[];
    const target =
      allLists.find((l) => (l.displayName ?? "").toLowerCase() === SP_LIST_DISPLAY_NAME.toLowerCase()) ??
      allLists.find((l) => (l.displayName ?? "").toLowerCase().includes("warranty")) ??
      allLists.find((l) => (l.name ?? "").toLowerCase().includes("warranty"));

    if (!target) {
      return json({
        error: `List "${SP_LIST_DISPLAY_NAME}" not found on site.`,
        site: { id: siteId, webUrl: site.webUrl },
        available_lists: allLists.map((l) => ({
          id: l.id, name: l.name, displayName: l.displayName, webUrl: l.webUrl,
        })),
        durationMs: Date.now() - t0,
      }, 404);
    }

    const listId: string = target.id;

    // Columns metadata
    const colsResp = await graphGet(
      token,
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/columns`,
    );
    const columns = (colsResp.value ?? []).map((c: any) => ({
      displayName: c.displayName ?? null,
      name: c.name ?? null,
      id: c.id ?? null,
      type: detectColumnType(c),
      readOnly: c.readOnly ?? null,
      hidden: c.hidden ?? null,
    }));

    // First 10 rows with expanded fields
    const itemsResp = await graphGet(
      token,
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=10`,
    );
    const items = (itemsResp.value ?? []).map((it: any) => ({
      id: it.id,
      createdDateTime: it.createdDateTime,
      lastModifiedDateTime: it.lastModifiedDateTime,
      webUrl: it.webUrl,
      fields: it.fields ?? {},
    }));

    return json({
      mode: "read_only_probe",
      writes_performed: false,
      site: { id: siteId, webUrl: site.webUrl, hostname: SP_HOSTNAME, path: SP_SITE_PATH },
      list: {
        id: listId,
        name: target.name,
        displayName: target.displayName,
        webUrl: target.webUrl,
      },
      column_count: columns.length,
      columns,
      sample_row_count: items.length,
      sample_rows: items,
      suggested_mapping_draft: SUGGESTED_MAPPING_DRAFT,
      notes: [
        "READ-ONLY probe. No data was written to Supabase.",
        "No dealer matching attempted.",
        "Field internal names (`name`) shown above are the Graph API names to use in future sync.",
        "Verify each suggested mapping against the actual `name` (not just displayName) before building sync.",
      ],
      durationMs: Date.now() - t0,
    }, 200);
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
