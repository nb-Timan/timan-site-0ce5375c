import { supabase } from "@/lib/supabase";
import type { LegacyPreviewLead } from "@/lib/legacyLeadsPreview";

export type LegacyLeadImportResult = {
  ok?: boolean;
  error?: string;
  received?: number;
  existing?: number;
  would_insert?: number;
  skipped_existing?: number;
  inserted?: number;
  first_no?: string;
  last_no?: string;
  dealer_matched?: number;
  dealer_unmatched?: number;
  inserted_before_error?: number;
};

export async function previewLegacyLeadImport(leads: LegacyPreviewLead[]): Promise<LegacyLeadImportResult> {
  const { data, error } = await supabase.functions.invoke("import-legacy-leads", {
    body: { action: "preview", leads },
  });
  if (error) return previewLegacyLeadImportViaClient(leads);
  return data as LegacyLeadImportResult;
}

export async function executeLegacyLeadImport(leads: LegacyPreviewLead[]): Promise<LegacyLeadImportResult> {
  const { data, error } = await supabase.functions.invoke("import-legacy-leads", {
    body: {
      action: "import",
      confirmation: "IMPORTER HISTORISKE LEADS",
      leads,
    },
  });
  if (error) return executeLegacyLeadImportViaClient(leads);
  return data as LegacyLeadImportResult;
}

function norm(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function compactLines(lines: Array<string | null | undefined>): string {
  return lines.map((line) => String(line ?? "").trim()).filter(Boolean).join("\n");
}

async function existingLegacyIds(leads: LegacyPreviewLead[]): Promise<Set<string>> {
  const ids = leads.map((lead) => lead.import_id);
  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { data, error } = await supabase.from("crm_leads").select("id").in("id", batch);
    if (error) throw error;
    for (const row of data ?? []) existing.add(row.id);
  }
  return existing;
}

async function previewLegacyLeadImportViaClient(leads: LegacyPreviewLead[]): Promise<LegacyLeadImportResult> {
  try {
    const existing = await existingLegacyIds(leads);
    return {
      ok: true,
      received: leads.length,
      existing: existing.size,
      would_insert: leads.length - existing.size,
      first_no: leads[0]?.display_no,
      last_no: leads.at(-1)?.display_no,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function executeLegacyLeadImportViaClient(leads: LegacyPreviewLead[]): Promise<LegacyLeadImportResult> {
  try {
    const existing = await existingLegacyIds(leads);
    const sellerEmails = Array.from(new Set(leads.map((lead) => norm(lead.owner_email)).filter(Boolean)));
    const { data: users, error: usersError } = await supabase
      .from("app_users")
      .select("id, email, full_name, display_name, initials")
      .in("email", sellerEmails);
    if (usersError) throw usersError;
    const userByEmail = new Map((users ?? []).map((user) => [norm(user.email), user]));

    const { data: dealers, error: dealersError } = await supabase
      .from("dealer_accounts")
      .select("id, account_number, company_name")
      .limit(5000);
    if (dealersError) throw dealersError;
    const dealerByName = new Map<string, { id: string }>();
    for (const dealer of dealers ?? []) {
      if (dealer.company_name) dealerByName.set(norm(dealer.company_name), dealer);
      if (dealer.account_number) dealerByName.set(norm(dealer.account_number), dealer);
    }

    const rows = leads
      .filter((lead) => !existing.has(lead.import_id))
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
        };
      });

    const insertedIds: string[] = [];
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { data, error } = await supabase.from("crm_leads").insert(batch).select("id");
      if (error) {
        return {
          error: `Import stoppet ved batch ${Math.floor(i / 50) + 1}: ${error.message}`,
          inserted_before_error: insertedIds.length,
        };
      }
      insertedIds.push(...(data ?? []).map((row) => row.id));
    }

    return {
      ok: true,
      received: leads.length,
      skipped_existing: existing.size,
      inserted: insertedIds.length,
      first_no: leads[0]?.display_no,
      last_no: leads.at(-1)?.display_no,
      dealer_matched: rows.filter((row) => row.linked_dealer_id).length,
      dealer_unmatched: rows.filter((row) => !row.linked_dealer_id).length,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
