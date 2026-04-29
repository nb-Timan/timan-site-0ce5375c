/**
 * AKR realistic test data seeder.
 *
 * Populates localStorage with believable test data for seller AKR
 * (Alexander Kirschner — akr@timan.dk · DE) across all major CRM areas:
 *
 *   - Konti (accounts) → exposed via listCrmAccounts() fallback merge
 *   - Leads (extra stages: Negotiation / Won / Lost)
 *   - Demo registrations (Timan 3330, Timan 2620, completed)
 *   - Activities (quotes/orders sent, calls, follow-ups)
 *   - Budget equipment lines + forecasts + actuals (per machine)
 *
 * Idempotent — re-runs are no-ops thanks to the version key. Bump
 * AKR_SEED_VERSION to force a refresh in preview.
 *
 * Test/demo data only. Does NOT touch:
 *   pricing · permissions · routes · auth · PDFs · n8n
 *   claims · TSB · warranty · Byg din Timan catalog
 */

const AKR_SEED_VERSION = "v1";
const AKR_SEED_FLAG    = "timan.akr.seed.version";

const AKR = {
  user_id: "akr-seed-user",     // synthetic — until linked to app_users
  email:   "akr@timan.dk",
  name:    "Alexander Kirschner",
  initials:"AKR",
  country: "DE",
};

// ---------- Accounts (4 dealers across DE/AT/DK) ----------
export interface AkrSeedAccount {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  country: string | null;
  preferred_language: string | null;
  role: string | null;
  partner_type: string | null;
  portal_role: string | null;
  dealer_number: string | null;
  status: string | null;
  account_owner_user_id: string | null;
  account_owner_name: string | null;
  account_owner_initials: string | null;
  account_owner_email: string | null;
  created_at: string | null;
  notes: string | null;
}

export const AKR_SEED_ACCOUNTS: AkrSeedAccount[] = [
  {
    id: "akr-acc-1",
    email: "info@dealernord.de",
    full_name: "Stefan Krüger",
    company: "Dealer Nord GmbH",
    country: "DE",
    preferred_language: "de",
    role: "partner",
    partner_type: "dealer",
    portal_role: "timan_dealer",
    dealer_number: "DE-1042",
    status: "active",
    account_owner_user_id: AKR.user_id,
    account_owner_name: AKR.name,
    account_owner_initials: AKR.initials,
    account_owner_email: AKR.email,
    created_at: "2025-11-12T08:00:00.000Z",
    notes: "Strong Q4 demos. Repeat customer.",
  },
  {
    id: "akr-acc-2",
    email: "service@kommunal-sued.de",
    full_name: "Petra Wagner",
    company: "Kommunal Service Süd",
    country: "DE",
    preferred_language: "de",
    role: "partner",
    partner_type: "service_partner",
    portal_role: "timan_service_partner",
    dealer_number: "DE-2208",
    status: "active",
    account_owner_user_id: AKR.user_id,
    account_owner_name: AKR.name,
    account_owner_initials: AKR.initials,
    account_owner_email: AKR.email,
    created_at: "2025-09-04T10:30:00.000Z",
    notes: "Municipal contracts — winter equipment focus.",
  },
  {
    id: "akr-acc-3",
    email: "office@greencity.at",
    full_name: "Markus Hofer",
    company: "Green City Austria",
    country: "AT",
    preferred_language: "de",
    role: "partner",
    partner_type: "dealer",
    portal_role: "timan_dealer",
    dealer_number: "AT-0117",
    status: "active",
    account_owner_user_id: AKR.user_id,
    account_owner_name: AKR.name,
    account_owner_initials: AKR.initials,
    account_owner_email: AKR.email,
    created_at: "2026-01-21T09:15:00.000Z",
    notes: "New 2026 partner. Pilot Timan 3330.",
  },
  {
    id: "akr-acc-4",
    email: "sales@nordicpark.dk",
    full_name: "Anders Holm",
    company: "Nordic Park Tech",
    country: "DK",
    preferred_language: "da",
    role: "partner",
    partner_type: "dealer",
    portal_role: "timan_dealer",
    dealer_number: "DK-3392",
    status: "active",
    account_owner_user_id: AKR.user_id,
    account_owner_name: AKR.name,
    account_owner_initials: AKR.initials,
    account_owner_email: AKR.email,
    created_at: "2026-02-10T14:20:00.000Z",
    notes: "Cross-border collaboration via DE office.",
  },
];

// ---------- Helpers ----------
function readLS<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || "[]") as T[]; } catch { return []; }
}
function writeLS<T>(key: string, rows: T[]): void {
  try { localStorage.setItem(key, JSON.stringify(rows)); } catch { /* */ }
}
function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-3)}`;
}
function isoDays(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString();
}
function isoDateOnly(offset: number): string {
  return isoDays(offset).slice(0, 10);
}

// ---------- Leads (extra stages beyond JSON seed) ----------
function seedExtraLeads(): void {
  const LS_LEADS = "timan.crm.leads.v1";
  const existing = readLS<{ id: string; owner_email?: string | null; meta?: { source?: string } | null }>(LS_LEADS);
  // Skip if AKR-seeded leads already present
  if (existing.some((r: any) => r?.meta?.source === "akr-seed")) return;

  const base = {
    owner_user_id: AKR.user_id,
    owner_name:    AKR.name,
    owner_email:   AKR.email,
    linked_dealer_id: null,
    machine_types: [] as string[],
    next_activity: null as string | null,
    demo_has_run: "yes" as "yes" | "no" | null,
    contact_type: "Phone" as string | null,
    customer_type: "Company" as string | null,
    contact_information: null,
    trade_fair: null,
    notes: null,
    lost_competitor: null as string | null,
    lost_reason: null as string | null,
    lost_comment: null as string | null,
    attachments: [] as { name: string; size: number }[],
  };

  const now = new Date().toISOString();
  const extras = [
    {
      title: "Stadt München — Timan 3330 + V-Plov",
      country: "Germany - South",
      machine_types: ["Timan 3330", "V-Plow"],
      pipeline_stage: "Negotiation",
      status: "Negotiation",
      estimated_value: 412000,
      probability: 70,
      first_contact_date: isoDateOnly(-22),
      next_followup_date: isoDateOnly(5),
    },
    {
      title: "Wiener Stadtgärten — RC-1000s",
      country: "Austria",
      machine_types: ["RC-1000s"],
      pipeline_stage: "Negotiation",
      status: "Negotiation",
      estimated_value: 235000,
      probability: 60,
      first_contact_date: isoDateOnly(-30),
      next_followup_date: isoDateOnly(3),
    },
    {
      title: "Dealer Nord GmbH — Timan 3330 sold",
      country: "Germany - North",
      machine_types: ["Timan 3330"],
      pipeline_stage: "Won",
      status: "Won",
      estimated_value: 650000,
      probability: 100,
      first_contact_date: isoDateOnly(-65),
      next_followup_date: null,
    },
    {
      title: "Green City Austria — RC-751 fleet",
      country: "Austria",
      machine_types: ["RC-751"],
      pipeline_stage: "Won",
      status: "Won",
      estimated_value: 335000,
      probability: 100,
      first_contact_date: isoDateOnly(-90),
      next_followup_date: null,
    },
    {
      title: "Nordic Park Tech — RC-1000s",
      country: "Denmark",
      machine_types: ["RC-1000s"],
      pipeline_stage: "Won",
      status: "Won",
      estimated_value: 470000,
      probability: 100,
      first_contact_date: isoDateOnly(-45),
      next_followup_date: null,
    },
    {
      title: "Hako Bayern — RC-1000s",
      country: "Germany - South",
      machine_types: ["RC-1000s"],
      pipeline_stage: "Lost",
      status: "Lost",
      estimated_value: 0,
      probability: 0,
      first_contact_date: isoDateOnly(-50),
      next_followup_date: null,
      lost_competitor: "Egholm",
      lost_reason: "Price",
      lost_comment: "Egholm matched on a 5-year lease.",
    },
  ];

  const rows = extras.map((e) => ({
    id: uid("akrlead"),
    expected_close_date: null,
    ...base,
    ...e,
    created_at: now,
    updated_at: now,
    meta: { source: "akr-seed" },
  }));

  writeLS(LS_LEADS, [...rows, ...existing]);
}

// ---------- Demo leads (extra machines + completed states) ----------
function seedExtraDemos(): void {
  const LS_DEMO = "timan.crm.demoLeads.v1";
  const existing = readLS<{ id: string; meta?: { source?: string } }>(LS_DEMO);
  if (existing.some((r: any) => r?.meta?.source === "akr-seed")) return;

  const base = {
    owner_user_id: AKR.user_id,
    owner_name: AKR.name,
    owner_email: AKR.email,
    dealer_country: "Germany",
    competitors_present: "no" as "yes" | "no" | null,
    competitor_name: null as string | null,
    attachments: [] as { name: string; size: number }[],
  };

  const now = new Date().toISOString();
  const demos = [
    {
      title: "Timan 3330 demo — Gartenbau Kessler",
      dealer_company: "Dealer Nord GmbH",
      dealer_rep: "Stefan Krüger",
      customer_name: "Gartenbau Kessler GmbH",
      customer_address: "80331 München, DE",
      notes: "Full-day demo with sweep + winter equipment.",
      machine_category: ["Timan machine"],
      demo_machine: "Timan 3330",
      demo_equipment: ["T2", "V-plow"],
      demo_date: isoDateOnly(-12),
      interest_level: 8,
      wants_offer: "yes" as const,
      followup_date: isoDateOnly(4),
      estimated_value: 420000,
      probability: 70,
      notes_after_demo: "Strong fit. Awaiting council budget.",
      result_status: "Hot lead",
    },
    {
      title: "Timan 3330 — completed → Won",
      dealer_company: "Dealer Nord GmbH",
      dealer_rep: "Stefan Krüger",
      customer_name: "Stadt Hannover",
      customer_address: "30159 Hannover, DE",
      notes: "Pre-order demo.",
      machine_category: ["Timan machine"],
      demo_machine: "Timan 3330",
      demo_equipment: ["Center-driven Sweeper"],
      demo_date: isoDateOnly(-60),
      interest_level: 9,
      wants_offer: "yes" as const,
      followup_date: null,
      estimated_value: 650000,
      probability: 100,
      notes_after_demo: "Closed.",
      result_status: "Won",
    },
    {
      title: "Timan 2620 preview — Wiener Stadtgärten",
      dealer_company: "Green City Austria",
      dealer_rep: "Markus Hofer",
      customer_name: "Wiener Stadtgärten",
      customer_address: "1010 Wien, AT",
      notes: "Preview machine — planned demo.",
      machine_category: ["Timan machine"],
      demo_machine: "Tool-Trac",
      demo_equipment: [],
      demo_date: isoDateOnly(14),
      interest_level: 7,
      wants_offer: null,
      followup_date: isoDateOnly(20),
      estimated_value: 280000,
      probability: 50,
      notes_after_demo: null,
      result_status: "Warm lead",
      dealer_country: "Austria",
    },
    {
      title: "RC-751 demo — completed",
      dealer_company: "Nordic Park Tech",
      dealer_rep: "Anders Holm",
      customer_name: "Aalborg Kommune",
      customer_address: "9000 Aalborg, DK",
      notes: "Council fleet evaluation.",
      machine_category: ["Timan machine"],
      demo_machine: "RC-751",
      demo_equipment: ["Weed Brush"],
      demo_date: isoDateOnly(-25),
      interest_level: 8,
      wants_offer: "yes" as const,
      followup_date: isoDateOnly(7),
      estimated_value: 167500,
      probability: 65,
      notes_after_demo: "Awaiting RFP response.",
      result_status: "Offer requested",
      dealer_country: "Denmark",
    },
  ];

  const rows = demos.map((d) => ({
    id: uid("akrdemo"),
    legacy_id: null,
    ...base,
    ...d,
    created_at: now,
    source: "user" as const,
    meta: { source: "akr-seed" },
  }));

  writeLS(LS_DEMO, [...rows, ...existing]);
}

// ---------- Activities (orders/quotes/calls) ----------
function seedExtraActivities(): void {
  const LS = "timan.crm.activities.v1";
  const existing = readLS<{ id: string; meta?: Record<string, unknown> | null }>(LS);
  if (existing.some((r: any) => r?.meta?.source === "akr-seed")) return;

  const owner = {
    assigned_owner_user_id: AKR.user_id,
    assigned_owner_name: AKR.name,
    created_by_user_id: AKR.user_id,
    created_by_name: AKR.name,
    currency: "DKK",
  };

  const acts = [
    { offset: -2,  type: "quote_sent",     account: "Dealer Nord GmbH",      title: "Tilbud sendt — Timan 3330 + T2", value: 720000, status: "sent" },
    { offset: -5,  type: "quote_created",  account: "Kommunal Service Süd", title: "Tilbud oprettet — RC-1000s + winter pack", value: 295000, status: "draft" },
    { offset: -7,  type: "order_sent",     account: "Dealer Nord GmbH",      title: "Ordre — Timan 3330 + Center sweep", value: 650000, status: "confirmed" },
    { offset: -14, type: "order_created",  account: "Green City Austria",   title: "Ordre — RC-751 (x2)", value: 335000, status: "confirmed" },
    { offset: -21, type: "order_sent",     account: "Nordic Park Tech",     title: "Ordre — RC-1000s + V-plov", value: 470000, status: "confirmed" },
    { offset: -1,  type: "comment",        account: "Wiener Stadtgärten",   title: "Opkald: Forhandling om pris", value: null, status: null },
    { offset: -3,  type: "comment",        account: "Stadt München",        title: "Follow-up tilbud — venter på rådhus", value: null, status: null },
    { offset: -10, type: "lead_accepted",  account: "Dealer Nord GmbH",     title: "Lead accepteret — Timan 3330", value: 650000, status: "Won" },
  ];

  const now = Date.now();
  const rows = acts.map((a) => {
    const dt = new Date(now + a.offset * 86400000).toISOString();
    return {
      id: uid("akract"),
      activity_type: a.type,
      activity_date: dt,
      account_id: null,
      account_name: a.account,
      ...owner,
      title: a.title,
      description: `${a.account} · AKR`,
      status: a.status,
      quote_id: null,
      order_id: null,
      configuration_id: null,
      value: a.value,
      meta: { source: "akr-seed" },
      created_at: dt,
    };
  });

  writeLS(LS, [...rows, ...existing]);
}

// ---------- Budget: equipment lines + forecasts + actuals ----------
interface AnyLine {
  id: string;
  year: number;
  product_key: string;
  product_name: string;
  item_number: string | null;
  category: string;
  parent_machine_key?: string | null;
  seller_id: string | null;
  seller_name: string | null;
  seller_email: string | null;
  seller_initials: string | null;
  country: string | null;
  qty_budget: number;
  value_budget: number;
  monthly_split: number[];
  notes?: string | null;
  locked: boolean;
  created_at: string;
  meta?: { source?: string };
}

const SEASONAL_SPLIT = [0.06,0.08,0.11,0.12,0.11,0.09,0.05,0.06,0.09,0.10,0.08,0.05];

function makeEquipLine(
  product_key: string,
  product_name: string,
  item_number: string | null,
  parent_machine_key: string,
  qty: number,
  value: number,
  year: number,
): AnyLine {
  return {
    id: uid("akrbl"),
    year,
    product_key,
    product_name,
    item_number,
    category: "attachment",
    parent_machine_key,
    seller_id: null,
    seller_name: AKR.name,
    seller_email: AKR.email,
    seller_initials: AKR.initials,
    country: AKR.country,
    qty_budget: qty,
    value_budget: value,
    monthly_split: SEASONAL_SPLIT,
    notes: null,
    locked: false,
    created_at: new Date().toISOString(),
    meta: { source: "akr-seed" },
  };
}

function seedAkrEquipmentBudget(): void {
  const LS_LINES     = "timan.crm.budget.lines.v6";
  const LS_FORECASTS = "timan.crm.budget.forecasts.v6";
  const LS_ACTUALS   = "timan.crm.budget.actuals.v6";

  const existing = readLS<AnyLine>(LS_LINES);
  if (existing.some((l: any) => l?.meta?.source === "akr-seed")) return;

  const year = 2026;

  // RC-1000s equipment for AKR
  const rc1000Eq: Array<{ key: string; vn: string; name: string; qty: number; val: number }> = [
    { key: "RC1000_410910", vn: "410910", name: "Slagleklipper inkl Y-slagle sæt",        qty: 3, val: 84000 },
    { key: "RC1000_411845", vn: "411845", name: "Centerdrevet fejemaskine",               qty: 2, val: 78000 },
    { key: "RC1000_730600", vn: "730600", name: "WB-170 Ukrudtsbørste basisenhed",        qty: 1, val: 42000 },
    { key: "RC1000_411742", vn: "411742", name: "V-plov m/gummiskær",                     qty: 2, val: 56000 },
  ];
  // Timan 3330 equipment for AKR
  const t3330Eq: Array<{ key: string; vn: string; name: string; qty: number; val: number }> = [
    { key: "T3330_720130", vn: "720130", name: "T2 m. højtryk",                  qty: 2, val: 180000 },
    { key: "T3330_730020", vn: "730020", name: "Centerdrevet fejemaskine, 120 cm", qty: 2, val: 110000 },
    { key: "T3330_730114", vn: "730114", name: "V-plov 130-150 cm",              qty: 1, val: 48000 },
    { key: "T3330_730017", vn: "730017", name: "Rotorklipper 3 knive 135 cm",    qty: 1, val: 95000 },
  ];
  // Timan 2620 planning
  const t2620Eq: Array<{ key: string; vn: string; name: string; qty: number; val: number }> = [
    { key: "T2620_FEJESUG", vn: "123456", name: "Feje sug 2620",        qty: 1, val: 65000 },
  ];

  const newLines: AnyLine[] = [
    ...rc1000Eq.map(e => makeEquipLine(e.key, e.name, e.vn, "RC-1000s",   e.qty, e.val, year)),
    ...t3330Eq.map(e  => makeEquipLine(e.key, e.name, e.vn, "Timan 3330", e.qty, e.val, year)),
    ...t2620Eq.map(e  => makeEquipLine(e.key, e.name, e.vn, "Timan 2620", e.qty, e.val, year)),
  ];

  writeLS(LS_LINES, [...existing, ...newLines]);

  // Forecasts (working budget) + actuals — give AKR a realistic mix
  interface FC { id: string; budget_line_id: string; qty_forecast: number; value_forecast: number;
                 probability: number; risk_level: "low"|"medium"|"high"; updated_at: string }
  interface AC { budget_line_id: string; qty_sold: number; value_sold: number }

  const fcExisting = readLS<FC>(LS_FORECASTS);
  const acExisting = readLS<AC>(LS_ACTUALS);
  const now = new Date().toISOString();

  const fcs: FC[] = [];
  const acs: AC[] = [];
  newLines.forEach((l, idx) => {
    // forecast slightly above budget for some, below for others
    const factor = idx % 3 === 0 ? 1.15 : idx % 3 === 1 ? 0.9 : 1.0;
    fcs.push({
      id: uid("akrfc"),
      budget_line_id: l.id,
      qty_forecast: Math.max(1, Math.round(l.qty_budget * factor)),
      value_forecast: Math.round(l.value_budget * factor),
      probability: 60 + (idx % 4) * 5,
      risk_level: idx % 2 === 0 ? "medium" : "low",
      updated_at: now,
    });
    // actuals: ~30-50% of budget so far
    const soldQty = Math.max(0, Math.floor(l.qty_budget * (0.3 + (idx % 3) * 0.1)));
    acs.push({
      budget_line_id: l.id,
      qty_sold: soldQty,
      value_sold: Math.round(l.value_budget * (soldQty / Math.max(1, l.qty_budget))),
    });
  });

  writeLS(LS_FORECASTS, [...fcExisting, ...fcs]);
  writeLS(LS_ACTUALS,   [...acExisting, ...acs]);
}

// ---------- Public entry point ----------
export function ensureAkrSeed(): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(AKR_SEED_FLAG) === AKR_SEED_VERSION) return;
    seedExtraLeads();
    seedExtraDemos();
    seedExtraActivities();
    seedAkrEquipmentBudget();
    localStorage.setItem(AKR_SEED_FLAG, AKR_SEED_VERSION);
    // eslint-disable-next-line no-console
    console.info("[akrTestSeed] AKR test data seeded (" + AKR_SEED_VERSION + ")");
  } catch (err) {
    console.warn("[akrTestSeed] failed:", err);
  }
}
