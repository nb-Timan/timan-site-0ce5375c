import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import xlsx from "xlsx";

const DEFAULT_SOURCE = path.resolve(process.cwd(), "..", "..", "LeadsData_renset_26-08-26.xlsx");
const DEFAULT_OUTPUT = path.resolve(process.cwd(), "public", "import-preview", "legacy-leads-preview.json");

const sourcePath = path.resolve(process.argv[2] || DEFAULT_SOURCE);
const outputPath = path.resolve(process.argv[3] || DEFAULT_OUTPUT);

const sellers = [
  { initials: "AKR", name: "Alexander Kirschner", email: "akr@timan.dk", match: [/alexander/i, /kirschner/i] },
  { initials: "BP", name: "Birger Pedersen", email: "bp@timan.dk", match: [/birger/i, /pedersen/i] },
  { initials: "EM", name: "Esben Madsen", email: "em@timan.dk", match: [/esben/i, /madsen/i] },
  { initials: "JTN", name: "Jakob Troels Nielsen", email: "jtn@timan.dk", match: [/jakob/i, /troels/i, /nielsen/i] },
];

const machineOptions = new Set([
  "RC-751", "RC-1000s", "Timan 3330", "CS-200 Combi", "CS-200 Tractor",
  "New 2620", "Full Line", "Tool-Trac 5740", "T2", "T3", "V-Plow",
  "Center-driven sweeper", "Rotary mower", "Hedgetrimmer", "Weed brush",
  "Stump grinder", "Cutter bar - RC-1000s", "Tornado 400", "RC-1000",
  "Third-Party Equipment",
]);

const nextActivityStatus = {
  "Closed with order": { status: "Vundet", probability: 100, pipelineStage: "Won", open: false },
  "Closed without order": { status: "Tabt", probability: 0, pipelineStage: "Lost", open: false },
  "Not relevant": { status: "Tabt", probability: 0, pipelineStage: "Lost", open: false },
  "Offer sent to the customer": { status: "Tilbud sendt", probability: 70, pipelineStage: "Offer sent", open: true },
  "Customer requests a demonstration": { status: "Demo planlagt", probability: 50, pipelineStage: "Qualified", open: true },
  "Follow-up on leads": { status: "Follow-up", probability: 35, pipelineStage: "Qualified", open: true },
  "Sales material sent to the customer": { status: "Lead", probability: 20, pipelineStage: "Lead", open: true },
  "Lead sent to the dealer": { status: "Lead", probability: 20, pipelineStage: "Lead", open: true },
  "Wants to be contacted": { status: "Lead", probability: 20, pipelineStage: "Lead", open: true },
  "New lead": { status: "Lead", probability: 10, pipelineStage: "Lead", open: true },
  "Timan": { status: "Lead", probability: 10, pipelineStage: "Lead", open: true },
};

function clean(value) {
  if (value === undefined || value === null) return "";
  const text = String(value).replace(/\u00a0/g, " ").trim();
  return text === "0" ? "" : text;
}

function normalize(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function count(map, key) {
  const k = clean(key) || "(tom)";
  map[k] = (map[k] || 0) + 1;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  const m = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return null;
  const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
  const parsed = new Date(`${yyyy}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function addDays(dateValue, days) {
  if (!dateValue) return null;
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(dateValue, months) {
  if (!dateValue) return null;
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function deterministicUuid(input) {
  const hash = crypto.createHash("sha256").update(input).digest("hex").slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${(8 + (parseInt(hash[16], 16) % 4)).toString(16)}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function matchSeller(value) {
  const source = normalize(value);
  if (!source) return { initials: "", name: "", email: "", status: "missing", confidence: 0 };
  const hit = sellers.find((seller) => seller.match.some((pattern) => pattern.test(source)));
  return hit
    ? { initials: hit.initials, name: hit.name, email: hit.email, status: "matched", confidence: 100 }
    : { initials: "", name: clean(value), email: "", status: "unmatched", confidence: 0 };
}

function parseMachines(value) {
  const raw = clean(value);
  if (!raw) return { values: [], unmatched: [] };
  const parts = raw.split(/[,;/]+/).map((part) => clean(part)).filter(Boolean);
  const values = [];
  const unmatched = [];
  for (const part of parts) {
    const aliases = new Map([
      ["rc-1000 s", "RC-1000s"],
      ["rc1000s", "RC-1000s"],
      ["cs200 combi", "CS-200 Combi"],
      ["cs200 tractor", "CS-200 Tractor"],
      ["2620", "New 2620"],
      ["timan 2620", "New 2620"],
    ]);
    const candidate = aliases.get(normalize(part)) || part;
    if (machineOptions.has(candidate)) values.push(candidate);
    else unmatched.push(part);
  }
  return { values: Array.from(new Set(values)), unmatched };
}

function extractContact(rawValue) {
  const raw = clean(rawValue);
  const lines = raw.split(/\r?\n/).map((line) => clean(line)).filter(Boolean);
  const found = {
    company: "",
    contact: "",
    phone: "",
    email: "",
    address: "",
    postalCode: "",
    city: "",
  };

  const email = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email) found.email = email[0];
  const phone = raw.match(/(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){6,}/);
  if (phone) found.phone = phone[0].trim();

  for (const line of lines) {
    const [labelRaw, ...rest] = line.split(":");
    const label = normalize(labelRaw);
    const value = clean(rest.join(":"));
    if (!value) continue;
    if (/firma|company|kunde|customer|cvr/.test(label) && !found.company) found.company = value;
    if (/kontakt|contact|person|navn|name/.test(label) && !found.contact) found.contact = value;
    if (/adresse|address|street/.test(label) && !found.address) found.address = value;
    if (/post|zip|plz/.test(label)) {
      const zip = value.match(/\b\d{3,5}\b/);
      if (zip && !found.postalCode) found.postalCode = zip[0];
      const city = value.replace(/\b\d{3,5}\b/, "").trim();
      if (city && !found.city) found.city = city;
    }
  }

  const zipCity = raw.match(/\b(\d{3,5})\s+([A-Za-zÆØÅæøåÄÖÜäöüß .'-]{2,})/);
  if (zipCity) {
    if (!found.postalCode) found.postalCode = zipCity[1];
    if (!found.city) found.city = clean(zipCity[2]);
  }

  if (!found.company && lines.length > 0 && !/@/.test(lines[0])) found.company = lines[0];
  return found;
}

function customerFromTitle(title) {
  const text = clean(title);
  const kunde = text.match(/\bKunde\s+(.+)$/i);
  if (kunde) return clean(kunde[1]);
  const med = text.match(/\bmed\s+(.+)$/i);
  if (med) return clean(med[1]);
  if (/^demo\b/i.test(text)) return "";
  return text.includes("//") ? clean(text.split("//").at(-1)) : "";
}

function makeReviewBucket() {
  return new Map();
}

function bumpReview(bucket, original, mapped, status, confidence) {
  const key = `${clean(original)}\u0001${clean(mapped)}\u0001${status}`;
  const existing = bucket.get(key) || { original: clean(original) || "(tom)", mapped: clean(mapped), status, confidence, count: 0 };
  existing.count += 1;
  bucket.set(key, existing);
}

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Excel-filen findes ikke: ${sourcePath}`);
}

const workbook = xlsx.readFile(sourcePath, { cellDates: true });
const sheetName = workbook.SheetNames[0];
const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
const sellerReview = makeReviewBucket();
const machineReview = makeReviewBucket();
const dealerReview = makeReviewBucket();
const nextActivityCounts = {};
const warnings = [];

const leads = rows.map((row, index) => {
  const legacyNo = 5000 + index;
  const sourceId = clean(row.Id || row.ID_NR || index + 1);
  const title = clean(row["Titel (comment in the comment section)"]) || `Historisk lead ${legacyNo}`;
  const nextActivity = clean(row.NextActivity) || "New lead";
  const mappedActivity = nextActivityStatus[nextActivity] || nextActivityStatus["New lead"];
  const seller = matchSeller(row.Responsible);
  const machines = parseMachines(row.MachineType);
  const dealer = clean(row.Dealer2);
  const contact = extractContact(row["Contact information"]);
  if (!contact.company) contact.company = customerFromTitle(title);
  const country = clean(row.Country);
  const firstContactDate = parseDate(row.FirstContactDate);
  const nextFollowupDate = parseDate(row.NextFollowUpdate) || (mappedActivity.open ? addDays(firstContactDate, 14) : null);
  const expectedCloseDate = mappedActivity.open ? addMonths(firstContactDate, 6) : firstContactDate;
  const demoHasRun = /^yes$/i.test(clean(row.DemoHasRun)) ? "yes" : /^no$/i.test(clean(row.DemoHasRun)) ? "no" : null;
  const isDemoLead = demoHasRun === "yes" || nextActivity === "Customer requests a demonstration";
  const customerComplete = Boolean(contact.company && contact.contact && contact.phone && contact.email && contact.postalCode && contact.city && country);

  count(nextActivityCounts, nextActivity);
  bumpReview(sellerReview, row.Responsible, seller.initials ? `${seller.initials} - ${seller.name}` : "", seller.status, seller.confidence);
  bumpReview(dealerReview, dealer, dealer, dealer ? "needs_live_verification" : "missing", dealer ? 50 : 0);
  for (const m of machines.values) bumpReview(machineReview, m, m, "matched", 100);
  for (const m of machines.unmatched) bumpReview(machineReview, m, "", "unmatched", 0);
  if (!seller.initials) warnings.push(`G-${legacyNo}: Mangler sælgermatch for "${clean(row.Responsible)}"`);
  if (machines.values.length === 0) warnings.push(`G-${legacyNo}: Mangler maskinmatch for "${clean(row.MachineType)}"`);

  return {
    id: `legacy-${sourceId || legacyNo}`,
    import_id: deterministicUuid(`timan-legacy-leads:${sourceId || legacyNo}:${legacyNo}`),
    source_id: sourceId,
    lead_no: legacyNo,
    display_no: `G-${legacyNo}`,
    title,
    owner_name: seller.name,
    owner_initials: seller.initials,
    owner_email: seller.email,
    linked_dealer_id: null,
    dealer_name: dealer,
    dealer_match_status: dealer ? "needs_live_verification" : "missing",
    first_contact_date: firstContactDate,
    next_followup_date: nextFollowupDate,
    expected_close_date: expectedCloseDate,
    machine_types: machines.values,
    machine_unmatched: machines.unmatched,
    next_activity: nextActivity,
    demo_has_run: demoHasRun,
    preview_type: isDemoLead ? "demo" : "crm",
    contact_type: clean(row.ContactType),
    customer_type: clean(row.CustomerType),
    a_b_customer: clean(row.A_B_Kunde),
    trade_fair: clean(row.TradeFair),
    country,
    contact_information: clean(row["Contact information"]),
    contact_fields: contact,
    contact_complete: customerComplete,
    status: mappedActivity.status,
    probability: mappedActivity.probability,
    pipeline_stage: mappedActivity.pipelineStage,
    is_open: mappedActivity.open,
  };
});

const openCount = leads.filter((lead) => lead.is_open).length;
const demoCount = leads.filter((lead) => lead.preview_type === "demo").length;
const summary = {
  generated_at: new Date().toISOString(),
  source_file: sourcePath,
  sheet_name: sheetName,
  source_rows: rows.length,
  preview_rows: leads.length,
  first_preview_no: leads[0]?.display_no || null,
  last_preview_no: leads.at(-1)?.display_no || null,
  open_count: openCount,
  closed_count: leads.length - openCount,
  demo_count: demoCount,
  seller_matched: leads.filter((lead) => lead.owner_initials).length,
  seller_unmatched: leads.filter((lead) => !lead.owner_initials).length,
  machine_matched: leads.filter((lead) => lead.machine_types.length > 0).length,
  machine_unmatched: leads.filter((lead) => lead.machine_types.length === 0).length,
  contact_complete: leads.filter((lead) => lead.contact_complete).length,
  contact_incomplete: leads.filter((lead) => !lead.contact_complete).length,
  next_activity_counts: nextActivityCounts,
  warnings: warnings.slice(0, 200),
  warning_count: warnings.length,
  production_write_status: "none",
};

const review = {
  sellers: Array.from(sellerReview.values()).sort((a, b) => b.count - a.count),
  dealers: Array.from(dealerReview.values()).sort((a, b) => b.count - a.count),
  machines: Array.from(machineReview.values()).sort((a, b) => b.count - a.count),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({ summary, review, leads }, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 2));
