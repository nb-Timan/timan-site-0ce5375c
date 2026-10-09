import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return json({ error: "Authentication required" }, 401);
    const { data: isBackend, error: roleError } = await caller.rpc("is_timan_backend");
    if (roleError || isBackend !== true) return json({ error: "Timan Backend required" }, 403);
    const body = await req.json();
    if (body.effectiveMode !== "backend") return json({ error: "Leave View-as before permanent deletion" }, 403);
    if (!["lead", "document"].includes(body.kind) || typeof body.id !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) {
      return json({ error: "Invalid deletion target" }, 400);
    }
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc(
      body.kind === "lead" ? "delete_crm_lead_permanently" : "delete_crm_sales_document",
      { [body.kind === "lead" ? "p_lead_id" : "p_configuration_id"]: body.id, p_actor_auth_user_id: user.id },
    );
    if (error) {
      console.error("admin-crm-delete failed", { kind: body.kind, id: body.id, code: error.code, message: error.message });
      return json({ error: error.message, code: error.code }, error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 500);
    }
    return json({ ok: true, result: data });
  } catch (error) {
    console.error("admin-crm-delete failed", error);
    return json({ error: "Permanent deletion failed" }, 500);
  }
});
