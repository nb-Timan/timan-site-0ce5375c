export type LegacyPreviewLead = {
  id: string;
  import_id: string;
  source_id: string;
  lead_no: number;
  display_no: string;
  title: string;
  owner_name: string;
  owner_initials: string;
  owner_email: string;
  dealer_name: string;
  dealer_match_status: string;
  first_contact_date: string | null;
  next_followup_date: string | null;
  expected_close_date: string | null;
  machine_types: string[];
  machine_unmatched: string[];
  next_activity: string;
  demo_has_run: "yes" | "no" | null;
  preview_type: "crm" | "demo";
  contact_type: string;
  customer_type: string;
  a_b_customer: string;
  trade_fair: string;
  country: string;
  contact_information: string;
  contact_fields: {
    company: string;
    contact: string;
    phone: string;
    email: string;
    address: string;
    postalCode: string;
    city: string;
  };
  contact_complete: boolean;
  status: string;
  probability: number;
  pipeline_stage: string;
  is_open: boolean;
};

export type LegacyPreviewReviewRow = {
  original: string;
  mapped: string;
  status: string;
  confidence: number;
  count: number;
};

export type LegacyPreviewData = {
  summary: Record<string, unknown> & {
    generated_at: string;
    source_rows: number;
    preview_rows: number;
    first_preview_no: string | null;
    last_preview_no: string | null;
    open_count: number;
    closed_count: number;
    demo_count: number;
    seller_matched: number;
    seller_unmatched: number;
    machine_matched: number;
    machine_unmatched: number;
    contact_complete: number;
    contact_incomplete: number;
    warning_count: number;
    warnings: string[];
  };
  review: {
    sellers: LegacyPreviewReviewRow[];
    dealers: LegacyPreviewReviewRow[];
    machines: LegacyPreviewReviewRow[];
  };
  leads: LegacyPreviewLead[];
};

export const LEGACY_LEADS_PREVIEW_URL = "/import-preview/legacy-leads-preview.json";

export async function loadLegacyLeadsPreview(): Promise<LegacyPreviewData> {
  const res = await fetch(LEGACY_LEADS_PREVIEW_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Preview-filen mangler (${res.status})`);
  return res.json();
}
