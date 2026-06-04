// supabase/functions/sharepoint-warranty-verify/index.ts
//
// READ-ONLY verification of the SharePoint "Warranty registration" list.
// Phase 1 of warranty sync: shows exactly what the list contains, which
// internal column names to use, and which rows are missing required data.
//
// Performs NO writes. Reads NOTHING from warranty_registrations. No dealer
// matching. No logging.
//
// Access: portal_role in ('timan_backend','timan_service'), active & approved.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SP_HOSTNAME = "timandk.sharepoint.com";
const SP_SITE_PATH = "sites/SalgMarketingTiman";
const SP_LIST_DISPLAY_NAME = "Warranty registration";

// SharePoint displayName → warranty_registrations target column.
// Phase 57 mapping draft. Used for "unknown field" detection only.
const MAPPING: Record<string, string> = {
  "ID_Forms": "sharepoint_item_id",
  "Forhandlernavn": "dealer_name_raw",
  "Din nye maskines identifikationsnummer": "machine_serial_raw",
  "Hvilken maskine er solgt": "machine_model",
  "Leveringsdato": "delivery_date",
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

// Required SharePoint displayNames per row.
const REQUIRED_FIELDS = [
  "Forhandlernavn",
  "Din nye maskines identifikationsnummer",
  "Hvilken maskine er solgt",
  "Leveringsdato",
  "Kunde",
];

// SharePoint system / OData fields to ignore in "unknown" detection.
const SYSTEM_FIELD_PREFIXES = ["@odata", "_"];
const SYSTEM_FIELDS = new Set([
  "id", "ID", "Title", "ContentType", "Modified", "Created",
  "Author", "Editor", "AuthorLookupId", "EditorLookupId",
  "AppAuthorLookupId", "AppEditorLookupId", "Attachments",
  "Edit", "LinkTitleNoMenu", "LinkTitle", "DocIcon",
  "ItemChildCount", "FolderChildCount", "ComplianceAssetId",
  "FileSystemObjectType", "ServerRedirectedEmbedUri",
  "ServerRedirectedEmbedUrl", "OData__UIVersionString",
]);

function isSystemField(key: string): boolean {
  if (SYSTEM_FIELDS.has(key)) return true;
  return SYSTEM_FIELD_PREFIXES.some((p) => key.startsWith(p));
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ---- Auth: timan_backend OR timan_service ----
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
    const role = appUser?.portal_role;
    if (
      !appUser || appUser.is_active === false || appUser.approved === false ||
      (role !== "timan_backend" && role !== "timan_service")
    ) {
      return json({ error: "Forbidden — Timan Backend or Timan Service only" }, 403);
    }

    // ---- SharePoint (READ-ONLY) ----
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
      allLists.find((l) => (l.displayName ?? "").toLowerCase().includes("warranty"));

    if (!target) {
      return json({
        list_found: false,
        error: `List "${SP_LIST_DISPLAY_NAME}" not found on site.`,
        site: { id: siteId, webUrl: site.webUrl },
        available_lists: allLists.map((l) => ({
          id: l.id, name: l.name, displayName: l.displayName,
        })),
        durationMs: Date.now() - t0,
      }, 404);
    }

    const listId: string = target.id;

    // Columns metadata (internal names)
    const colsResp = await graphGet(
      token,
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/columns`,
    );
    const columns = (colsResp.value ?? []).map((c: any) => ({
      displayName: c.displayName ?? null,
      name: c.name ?? null,
      type: c.text ? "text" :
            c.number ? "number" :
            c.dateTime ? "dateTime" :
            c.choice ? "choice" :
            c.boolean ? "boolean" :
            c.hyperlinkOrPicture ? "hyperlinkOrPicture" : "other",
      readOnly: !!c.readOnly,
      hidden: !!c.hidden,
    }));

    // All items
    const items = await graphGetAll(
      token,
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=200`,
    );

    // Validate per-row required fields + collect unknown fields
    const missing_required: Array<{ item_id: string; missing: string[] }> = [];
    const unknown_field_counts: Record<string, number> = {};
    const known = new Set(Object.keys(MAPPING));

    for (const it of items) {
      const fields = (it.fields ?? {}) as Record<string, unknown>;
      const missing: string[] = [];
      for (const req of REQUIRED_FIELDS) {
        if (isEmpty(fields[req])) missing.push(req);
      }
      if (missing.length > 0) {
        missing_required.push({ item_id: String(it.id), missing });
      }
      for (const k of Object.keys(fields)) {
        if (isSystemField(k)) continue;
        if (!known.has(k)) {
          unknown_field_counts[k] = (unknown_field_counts[k] ?? 0) + 1;
        }
      }
    }

    const warnings: string[] = [];
    if (items.length === 0) warnings.push("SharePoint-listen returnerede 0 rækker.");
    if (missing_required.length > 0) {
      warnings.push(`${missing_required.length} rækker mangler ét eller flere obligatoriske felter.`);
    }
    const unknownCount = Object.keys(unknown_field_counts).length;
    if (unknownCount > 0) {
      warnings.push(`${unknownCount} SharePoint-felter er ikke i mapping-udkastet.`);
    }

    return json({
      mode: "verify",
      writes_performed: false,
      site: { id: siteId, webUrl: site.webUrl, hostname: SP_HOSTNAME, path: SP_SITE_PATH },
      list: {
        id: listId,
        name: target.name,
        displayName: target.displayName,
        webUrl: target.webUrl,
      },
      row_count: items.length,
      column_count: columns.length,
      columns,
      required_fields: REQUIRED_FIELDS,
      missing_required,
      unknown_fields: Object.entries(unknown_field_counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      mapping_draft: MAPPING,
      warnings,
      durationMs: Date.now() - t0,
    });
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - t0 },
      500,
    );
  }
});
