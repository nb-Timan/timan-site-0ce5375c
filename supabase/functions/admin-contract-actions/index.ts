// supabase/functions/admin-contract-actions/index.ts
//
// Privileged contract administration actions. Contract hard-delete uses the
// Supabase Storage API for files and deletes only incomplete contract rows.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action = "delete_contract";

interface RequestBody {
  action: Action;
  contract_id?: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return json({ error: "Edge Function mangler Supabase miljoevariabler." }, 500);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ugyldig JSON body." }, 400);
  }

  if (body.action !== "delete_contract") {
    return json({ error: "Ukendt action." }, 400);
  }

  const contractId = (body.contract_id ?? "").trim();
  if (!isUuid(contractId)) return json({ error: "contract_id er ugyldig." }, 400);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Manglende Authorization header." }, 401);
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user?.email) {
    return json({ error: "Ugyldig eller udlobet session." }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const callerEmail = userData.user.email.toLowerCase();
  const { data: caller, error: callerErr } = await admin
    .from("app_users")
    .select("id, email, full_name, display_name, portal_role, approved, is_active")
    .eq("email", callerEmail)
    .maybeSingle();
  if (callerErr) return json({ error: `Kunne ikke verificere bruger: ${callerErr.message}` }, 500);
  if (!caller || caller.portal_role !== "timan_backend" || caller.approved !== true || caller.is_active !== true) {
    return json({ error: "Kun Timan Backend kan slette kontrakter." }, 403);
  }

  const { data: contract, error: contractErr } = await admin
    .from("dealer_contracts")
    .select("*")
    .eq("id", contractId)
    .maybeSingle();
  if (contractErr) return json({ error: `Kunne ikke laese kontrakt: ${contractErr.message}` }, 500);
  if (!contract) return json({ error: "Kontrakten findes ikke." }, 404);

  if (
    contract.contract_status === "approved" ||
    contract.contract_status === "archived" ||
    contract.approved_at ||
    contract.signed_at
  ) {
    return json({ error: "Godkendte kontrakter kan ikke slettes. Brug Opsig kontrakt." }, 409);
  }

  const { data: files, error: filesErr } = await admin
    .from("dealer_contract_upload_files")
    .select("storage_bucket, storage_path")
    .eq("contract_id", contractId);
  if (filesErr) return json({ error: `Kunne ikke laese kontraktfiler: ${filesErr.message}` }, 500);

  const byBucket = new Map<string, string[]>();
  for (const file of files ?? []) {
    const bucket = String(file.storage_bucket || "dealer-contracts");
    const path = String(file.storage_path || "").trim();
    if (!path) continue;
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), path]);
  }

  let removedFileCount = 0;
  for (const [bucket, paths] of byBucket.entries()) {
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error: removeErr } = await admin.storage.from(bucket).remove(chunk);
      if (removeErr) return json({ error: `Storage-sletning fejlede: ${removeErr.message}` }, 500);
      removedFileCount += chunk.length;
    }
  }

  const { count: uploadVersionCount } = await admin
    .from("dealer_contract_upload_versions")
    .select("id", { count: "exact", head: true })
    .eq("contract_id", contractId);

  const { error: deleteErr } = await admin
    .from("dealer_contracts")
    .delete()
    .eq("id", contractId);
  if (deleteErr) return json({ error: `Kontrakten kunne ikke slettes: ${deleteErr.message}` }, 500);

  await admin.from("audit_log").insert({
    actor_user_id: caller.id,
    actor_email: callerEmail,
    actor_name: caller.display_name || caller.full_name || callerEmail,
    actor_role: caller.portal_role,
    action: "delete",
    module: "contracts",
    record_type: "dealer_contracts",
    record_id: contractId,
    record_label: contract.form_data?.dealerName || contract.dealer_account_number || contract.owner_email,
    old_value: {
      contract_number: contract.contract_number,
      contract_status: contract.contract_status,
      dealer_account_id: contract.dealer_account_id,
      dealer_account_number: contract.dealer_account_number,
      owner_email: contract.owner_email,
      upload_versions: uploadVersionCount ?? 0,
      upload_files: removedFileCount,
      storage_deleted_by: "supabase_storage_api",
    },
    new_value: null,
    changed_fields: ["deleted"],
    status: "success",
  });

  return json({
    ok: true,
    action: "delete_contract",
    contract_id: contractId,
    removed_files: removedFileCount,
    message: "Kontrakten er slettet.",
  });
});
