import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type LegacyLeadPayload = {
  import_id: string;
  source_id?: string;
  lead_no: number;
  display_no: string;
  title: string;
  owner_name?: string;
  owner_initials?: string;
  owner_email?: string;
  dealer_name?: string;
  first_contact_date?: string | null;
  expected_close_date?: string | null;
  next_followup_date?: string | null;
  machine_types?: string[];
  next_activity?: string | null;
  demo_has_run?: "yes" | "no" | null;
  contact_type?: string | null;
  customer_type?: string | null;
  contact_information?: string | null;
  trade_fair?: string | null;
  country?: string | null;
  probability?: number | null;
  pipeline_stage?: string | null;
  status?: string | null;
  contact_fields?: {
    company?: string;
    contact?: string;
    phone?: string;
    email?: string;
    address?: string;
    postalCode?: string;
    city?: string;
  };
};

type RequestBody = {
  action: "preview" | "import";
  confirmation?: string;
  leads?: LegacyLeadPayload[];
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function norm(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function validUuid(value: string | undefined): boolean {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function compactLines(lines: Array<string | null | undefined>): string {
  return lines.map((line) => String(line ?? "").trim()).filter(Boolean).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return json({ error: "Mangler Supabase function secrets." }, 500);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ugyldig JSON body." }, 400);
  }

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
    return json({ error: "Ugyldig eller udløbet session." }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const callerEmail = userData.user.email.toLowerCase();
  const { data: caller, error: callerErr } = await admin
    .from("app_users")
    .select("id, email, portal_role, approved, is_active, permissions")
    .eq("email", callerEmail)
    .maybeSingle();
  if (callerErr) return json({ error: `Kunne ikke verificere bruger: ${callerErr.message}` }, 500);
  if (!caller || caller.portal_role !== "timan_backend" || caller.approved !== true || caller.is_active !== true) {
    return json({ error: "Adgang nægtet. Kun Timan Backend må importere historiske leads." }, 403);
  }

  const leads = Array.isArray(body.leads) ? body.leads : [];
  if (!["preview", "import"].includes(body.action)) return json({ error: "Ukendt action." }, 400);
  if (leads.length === 0) return json({ error: "Ingen leads modtaget." }, 400);
  if (leads.some((lead) => !validUuid(lead.import_id) || !Number.isFinite(lead.lead_no))) {
    return json({ error: "Importdata mangler gyldigt import_id eller lead_no." }, 400);
  }

  const ids = leads.map((lead) => lead.import_id);
  const { data: existingRows, error: existingErr } = await admin
    .from("crm_leads")
    .select("id, lead_no")
    .in("id", ids);
  if (existingErr) return json({ error: `Kunne ikke kontrollere eksisterende leads: ${existingErr.message}` }, 500);
  const existingIds = new Set((existingRows ?? []).map((row) => row.id));

  if (body.action === "preview") {
    return json({
      ok: true,
      received: leads.length,
      existing: existingIds.size,
      would_insert: leads.length - existingIds.size,
      first_no: leads[0]?.display_no,
      last_no: leads.at(-1)?.display_no,
    });
  }

  if (body.confirmation !== "IMPORTER HISTORISKE LEADS") {
    return json({ error: "Bekræftelse mangler. Skriv IMPORTER HISTORISKE LEADS." }, 400);
  }

  const { data: users } = await admin
    .from("app_users")
    .select("id, email, full_name, display_name, initials");
  const userByEmail = new Map((users ?? []).map((user) => [norm(user.email), user]));

  const { data: dealers } = await admin
    .from("dealer_accounts")
    .select("id, account_number, company_name");
  const dealerByName = new Map<string, { id: string }>();
  for (const dealer of dealers ?? []) {
    if (dealer.company_name) dealerByName.set(norm(dealer.company_name), dealer);
    if (dealer.account_number) dealerByName.set(norm(dealer.account_number), dealer);
  }

  const now = new Date().toISOString();
  const rows = leads
    .filter((lead) => !existingIds.has(lead.import_id))
    .map((lead) => {
      const owner = lead.owner_email ? userByEmail.get(norm(lead.owner_email)) : null;
      const dealer = lead.dealer_name ? dealerByName.get(norm(lead.dealer_name)) : null;
      const contact = lead.contact_fields ?? {};
      const contactInformation = compactLines([
        contact.company ? `Firma/CVR: ${contact.company}` : null,
        contact.contact ? `Kontaktperson: ${contact.contact}` : null,
        contact.phone ? `Telefon: ${contact.phone}` : null,
        contact.email ? `E-mail: ${contact.email}` : null,
        contact.address ? `Adresse: ${contact.address}` : null,
        contact.postalCode || contact.city ? `Postnr. og by: ${[contact.postalCode, contact.city].filter(Boolean).join(" ")}` : null,
        lead.contact_information ? `Oprindelig kontaktinfo:\n${lead.contact_information}` : null,
      ]);
      return {
        id: lead.import_id,
        lead_no: lead.lead_no,
        title: lead.title || `Historisk lead ${lead.display_no}`,
        owner_user_id: owner?.id ?? null,
        owner_name: lead.owner_name || owner?.full_name || owner?.display_name || null,
        owner_email: lead.owner_email || owner?.email || null,
        linked_dealer_id: dealer?.id ?? null,
        first_contact_date: lead.first_contact_date ?? null,
        expected_close_date: lead.expected_close_date ?? null,
        next_followup_date: lead.next_followup_date ?? null,
        machine_types: lead.machine_types ?? [],
        next_activity: lead.next_activity ?? null,
        demo_has_run: lead.demo_has_run ?? null,
        contact_type: lead.contact_type ?? null,
        customer_type: lead.customer_type ?? null,
        contact_information: contactInformation || lead.contact_information || null,
        trade_fair: lead.trade_fair ?? null,
        country: lead.country ?? null,
        notes: compactLines([
          "Historisk import fra LeadsData_renset_26-08-26.xlsx.",
          `G-nummer: ${lead.display_no}`,
          lead.source_id ? `Kilde-ID: ${lead.source_id}` : null,
          lead.dealer_name ? `Forhandler fra Excel: ${lead.dealer_name}` : null,
          !dealer ? "Forhandler blev ikke matchet automatisk ved import." : null,
        ]),
        estimated_value: null,
        probability: lead.probability ?? null,
        pipeline_stage: lead.pipeline_stage || "Lead",
        lost_competitor: null,
        lost_reason: null,
        lost_comment: null,
        attachments: [],
        status: lead.status ?? null,
        move_to_working_qty: 0,
        incomplete_from_configurator: false,
        created_at: now,
        updated_at: now,
      };
    });

  const insertedIds: string[] = [];
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { data, error } = await admin
      .from("crm_leads")
      .insert(batch)
      .select("id");
    if (error) {
      return json({
        error: `Import stoppet ved batch ${Math.floor(i / batchSize) + 1}: ${error.message}`,
        inserted_before_error: insertedIds.length,
      }, 500);
    }
    insertedIds.push(...(data ?? []).map((row) => row.id));
  }

  return json({
    ok: true,
    received: leads.length,
    skipped_existing: existingIds.size,
    inserted: insertedIds.length,
    first_no: leads[0]?.display_no,
    last_no: leads.at(-1)?.display_no,
    dealer_matched: rows.filter((row) => row.linked_dealer_id).length,
    dealer_unmatched: rows.filter((row) => !row.linked_dealer_id).length,
  });
});
