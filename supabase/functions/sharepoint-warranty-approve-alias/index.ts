// supabase/functions/sharepoint-warranty-approve-alias/index.ts
//
// Writes a manually approved SharePoint forhandlernavn → dealer_account
// alias to public.dealer_account_aliases.
//
// - Access: portal_role in ('timan_backend','timan_service'), active & approved.
// - Never creates a dealer_account. The dealer_account_id MUST exist.
// - Idempotent upsert on normalized_alias.
//
// Body:
//   { sp_dealer_name: string, dealer_account_id: string }
//
// Response:
//   { ok: true, normalized_alias, dealer_account_id, dealer_company_name }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function normalizeDealer(raw: string): string {
  let n = (raw ?? "").toLowerCase().trim();
  n = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  n = n.replace(/\b(a\/s|aps|ivs|p\/s|i\/s|k\/s|holding|maskiner?|service)\b/g, " ");
  n = n.replace(/&/g, " og ");
  n = n.replace(/[^a-z0-9]+/g, " ");
  n = n.replace(/\s+/g, " ").trim();
  return n;
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp({ error: "Method not allowed" }, 405);

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
      .select("id, portal_role, is_active, approved, email")
      .ilike("email", email)
      .maybeSingle();
    const role = appUser?.portal_role;
    if (
      !appUser || appUser.is_active === false || appUser.approved === false ||
      (role !== "timan_backend" && role !== "timan_service")
    ) {
      return jsonResp({ error: "Forbidden — Timan Backend or Timan Service only" }, 403);
    }

    let body: { sp_dealer_name?: unknown; dealer_account_id?: unknown };
    try { body = await req.json(); } catch { return jsonResp({ error: "Invalid JSON body" }, 400); }

    const spDealerName = typeof body.sp_dealer_name === "string" ? body.sp_dealer_name.trim() : "";
    const dealerAccountId = typeof body.dealer_account_id === "string" ? body.dealer_account_id.trim() : "";
    if (!spDealerName) return jsonResp({ error: "sp_dealer_name kræves." }, 400);
    if (!dealerAccountId) return jsonResp({ error: "dealer_account_id kræves." }, 400);

    const normalized = normalizeDealer(spDealerName);
    if (!normalized) return jsonResp({ error: "SharePoint forhandlernavn er tomt efter normalisering." }, 400);

    // Verify the dealer_account exists. We do NOT create one.
    const { data: dealer, error: dealerErr } = await admin
      .from("dealer_accounts")
      .select("id, company_name, account_number")
      .eq("id", dealerAccountId)
      .maybeSingle();
    if (dealerErr) return jsonResp({ error: `Kunne ikke slå dealer_account op: ${dealerErr.message}` }, 500);
    if (!dealer) return jsonResp({ error: "Valgt dealer_account findes ikke." }, 404);

    const { error: upsertErr } = await admin
      .from("dealer_account_aliases")
      .upsert({
        normalized_alias: normalized,
        raw_alias: spDealerName,
        dealer_account_id: dealer.id,
        dealer_account_number: dealer.account_number ?? null,
        source: "manual",
        approved_by_user_id: appUser.id,
        approved_by_email: appUser.email,
        updated_at: new Date().toISOString(),
      }, { onConflict: "normalized_alias" });

    if (upsertErr) {
      const code = (upsertErr as { code?: string }).code;
      if (code === "42P01") {
        return jsonResp({
          error: "Tabellen dealer_account_aliases findes ikke endnu. Kør migrationen 20260604_dealer_account_aliases.sql først.",
        }, 500);
      }
      return jsonResp({ error: `Kunne ikke gemme alias: ${upsertErr.message}` }, 500);
    }

    return jsonResp({
      ok: true,
      normalized_alias: normalized,
      dealer_account_id: dealer.id,
      dealer_company_name: dealer.company_name,
      dealer_account_number: dealer.account_number ?? null,
    });
  } catch (e) {
    return jsonResp({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
