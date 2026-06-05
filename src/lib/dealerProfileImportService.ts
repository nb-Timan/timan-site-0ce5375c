/**
 * Dealer profile import — Excel parsing + dry-run matching.
 *
 * Phase: dry-run only. NO database writes happen from this module.
 * Used by Backend → Forhandlere → "Importér firma- og kontaktinformation".
 *
 * Rules:
 *  - SharePoint-styret stamdata MÅ ALDRIG overskrives:
 *      company_name, account_number, customer_type / dealer_type,
 *      country, address_line_1, address_line_2, postal_code, city.
 *    Disse felter er markeret `sharepointMaster: true` og kan kun bruges
 *    som *match-nøgler*, aldrig som update-target.
 *  - Alt andet (kontaktpersoner, CVR, telefon, økonomi, sociale medier,
 *    kommentarer) er portalstyret profil-data og må opdateres.
 */

import { updateDealerAccount, type DealerAccount, type UpdateDealerAccountPatch } from "@/lib/dealerAccountsService";

// ─────────────────────────────────────────────────────────────────────────────
// Target field catalog
// ─────────────────────────────────────────────────────────────────────────────

export type FieldRole = "match-only" | "profile";

export interface TargetField {
  /** dealer_accounts column name */
  key: string;
  /** Dansk label vist i UI */
  label: string;
  /** profile = må opdateres; match-only = bruges til match, aldrig overskrevet */
  role: FieldRole;
  /** SharePoint master data — explicit, til UI-advarsel */
  sharepointMaster: boolean;
  /** Alias-strenge til auto-detektion (lowercased, uden mellemrum/symboler) */
  aliases: string[];
}

/**
 * VIGTIGT: rækkefølge styrer UI-visning. SharePoint-master først, derefter
 * profil-felter.
 */
export const TARGET_FIELDS: TargetField[] = [
  // ── SharePoint master (kun match, aldrig overskriv) ────────────────────
  { key: "company_name",     label: "Firmanavn (match)",            role: "match-only", sharepointMaster: true,
    aliases: ["firmanavn", "firma", "company", "companyname", "name", "kunde", "kundenavn", "dealer"] },
  { key: "account_number",   label: "Kontonummer (match)",          role: "match-only", sharepointMaster: true,
    aliases: ["kontonummer", "kontonr", "accountnumber", "accountno", "kundenr", "kundenummer", "debitor", "debitornr"] },
  { key: "customer_type",    label: "Kundetype (match)",            role: "match-only", sharepointMaster: true,
    aliases: ["kundetype", "type", "customertype", "dealertype", "forhandlertype"] },
  { key: "country",          label: "Land (match)",                 role: "match-only", sharepointMaster: true,
    aliases: ["land", "country", "landekode"] },
  { key: "address_line_1",   label: "Adresse 1 (master)",           role: "match-only", sharepointMaster: true,
    aliases: ["adresse", "adresse1", "address", "address1", "addressline1", "vej", "gade"] },
  { key: "address_line_2",   label: "Adresse 2 (master)",           role: "match-only", sharepointMaster: true,
    aliases: ["adresse2", "address2", "addressline2"] },
  { key: "postal_code",      label: "Postnr. (master)",             role: "match-only", sharepointMaster: true,
    aliases: ["postnr", "postnummer", "zip", "zipcode", "postalcode"] },
  { key: "city",             label: "By (master)",                  role: "match-only", sharepointMaster: true,
    aliases: ["by", "city", "town"] },

  // ── Profil-felter (må opdateres) ───────────────────────────────────────
  { key: "director_name",        label: "Direktør",                role: "profile", sharepointMaster: false,
    aliases: ["direktør", "direktor", "director", "ceo", "ledelse", "ejer"] },
  { key: "vat_number",           label: "CVR / VAT",               role: "profile", sharepointMaster: false,
    aliases: ["cvr", "vat", "vatnumber", "cvrnr", "cvrnummer", "momsnr", "regnr"] },
  { key: "phone",                label: "Telefon",                 role: "profile", sharepointMaster: false,
    aliases: ["telefon", "phone", "tlf", "tlfnr", "telephone", "mobile", "mobil"] },
  { key: "email",                label: "E-mail (hoved)",          role: "profile", sharepointMaster: false,
    aliases: ["email", "mail", "epost", "emailaddress", "kontaktmail", "info"] },
  { key: "website",              label: "Hjemmeside",              role: "profile", sharepointMaster: false,
    aliases: ["website", "hjemmeside", "www", "homepage", "url"] },

  { key: "finance_contact_name", label: "Økonomi — kontaktperson", role: "profile", sharepointMaster: false,
    aliases: ["økonomikontakt", "okonomikontakt", "økonomikontaktperson", "bogholder", "regnskab", "financecontact", "financename"] },
  { key: "finance_contact_email",label: "Økonomi — e-mail",        role: "profile", sharepointMaster: false,
    aliases: ["økonomiemail", "okonomiemail", "bogholderemail", "financeemail", "regnskabemail"] },
  { key: "finance_contact_phone",label: "Økonomi — telefon",       role: "profile", sharepointMaster: false,
    aliases: ["økonomitelefon", "okonomitelefon", "bogholdertelefon", "financephone", "regnskabtelefon"] },
  { key: "invoice_email",        label: "Faktura e-mail",          role: "profile", sharepointMaster: false,
    aliases: ["faktura", "fakturaemail", "invoiceemail", "invoice", "ean", "fakturamail"] },

  { key: "sales_contact_name",   label: "Salg — kontaktperson",    role: "profile", sharepointMaster: false,
    aliases: ["salg", "salgskontakt", "sales", "salesname", "salescontact", "salgsansvarlig"] },
  { key: "sales_contact_email",  label: "Salg — e-mail",           role: "profile", sharepointMaster: false,
    aliases: ["salgemail", "salgsmail", "salesemail"] },
  { key: "sales_contact_phone",  label: "Salg — telefon",          role: "profile", sharepointMaster: false,
    aliases: ["salgtelefon", "salgstelefon", "salesphone"] },

  { key: "workshop_contact_name",label: "Værksted/reservedele — kontaktperson", role: "profile", sharepointMaster: false,
    aliases: ["værksted", "vaerksted", "workshop", "reservedele", "service", "spareparts", "workshopname"] },
  { key: "workshop_contact_email",label:"Værksted — e-mail",       role: "profile", sharepointMaster: false,
    aliases: ["værkstedemail", "vaerkstedemail", "workshopemail", "servicemail", "serviceemail"] },
  { key: "workshop_contact_phone",label:"Værksted — telefon",      role: "profile", sharepointMaster: false,
    aliases: ["værkstedtelefon", "vaerkstedtelefon", "workshopphone", "servicetelefon"] },

  { key: "marketing_contact_name",label:"Marketing — kontaktperson",role: "profile", sharepointMaster: false,
    aliases: ["marketing", "marketingkontakt", "marketingname"] },
  { key: "marketing_contact_email",label:"Marketing — e-mail",     role: "profile", sharepointMaster: false,
    aliases: ["marketingemail", "marketingmail"] },
  { key: "marketing_contact_phone",label:"Marketing — telefon",    role: "profile", sharepointMaster: false,
    aliases: ["marketingtelefon", "marketingphone"] },

  { key: "social_facebook",      label: "Facebook",                role: "profile", sharepointMaster: false,
    aliases: ["facebook", "fb"] },
  { key: "social_linkedin",      label: "LinkedIn",                role: "profile", sharepointMaster: false,
    aliases: ["linkedin", "li"] },
  { key: "social_instagram",     label: "Instagram",               role: "profile", sharepointMaster: false,
    aliases: ["instagram", "ig"] },
  { key: "social_youtube",       label: "YouTube",                 role: "profile", sharepointMaster: false,
    aliases: ["youtube", "yt"] },
  { key: "social_tiktok",        label: "TikTok",                  role: "profile", sharepointMaster: false,
    aliases: ["tiktok"] },

  { key: "__comment",            label: "Kommentar / noter",       role: "profile", sharepointMaster: false,
    aliases: ["kommentar", "kommentarer", "noter", "note", "bemærkning", "bemaerkning", "comment", "comments"] },
];

export const SKIP_KEY = "__skip";

// ─────────────────────────────────────────────────────────────────────────────
// Normalisering
// ─────────────────────────────────────────────────────────────────────────────

export function normHeader(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function normCompany(s: string): string {
  if (!s) return "";
  let v = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  v = v.replace(/\b(a\/s|aps|ivs|p\/s|k\/s|gmbh|ltd|llc|inc|as|ab|oy|bv|nv|sa|srl|sl|sarl)\b/g, "");
  v = v.replace(/&/g, "og");
  v = v.replace(/[^a-z0-9]/g, "");
  return v;
}

export function emailDomain(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.toLowerCase().trim().match(/@([a-z0-9.\-]+\.[a-z]{2,})$/i);
  return m ? m[1].toLowerCase() : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Excel parsing
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
}

export async function parseWorkbookFile(file: File): Promise<ParsedSheet[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const out: ParsedSheet[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: "",
      raw: false,
      blankrows: false,
    });
    if (json.length === 0) {
      out.push({ sheetName, headers: [], rows: [], rowCount: 0 });
      continue;
    }
    const headerSet = new Set<string>();
    for (const r of json) for (const k of Object.keys(r)) headerSet.add(k);
    const headers = Array.from(headerSet);
    const rows = json.map((r) => {
      const o: Record<string, string> = {};
      for (const h of headers) {
        const v = r[h];
        o[h] = v == null ? "" : String(v).trim();
      }
      return o;
    });
    out.push({ sheetName, headers, rows, rowCount: rows.length });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-mapping
// ─────────────────────────────────────────────────────────────────────────────

/** header → target key (eller SKIP_KEY) */
export type ColumnMapping = Record<string, string>;

export function autoMapHeaders(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  for (const h of headers) {
    const nh = normHeader(h);
    let bestKey: string | null = null;
    let bestScore = 0;
    for (const f of TARGET_FIELDS) {
      if (used.has(f.key)) continue;
      for (const a of [normHeader(f.label), ...f.aliases.map(normHeader), normHeader(f.key)]) {
        if (!a) continue;
        let s = 0;
        if (nh === a) s = 100;
        else if (nh.startsWith(a) || a.startsWith(nh)) s = 80;
        else if (nh.includes(a) || a.includes(nh)) s = 60;
        if (s > bestScore) { bestScore = s; bestKey = f.key; }
      }
    }
    if (bestKey && bestScore >= 60) {
      mapping[h] = bestKey;
      used.add(bestKey);
    } else {
      mapping[h] = SKIP_KEY;
    }
  }
  return mapping;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dry-run matching
// ─────────────────────────────────────────────────────────────────────────────

export interface DryRunChangeField {
  key: string;
  label: string;
  current: string | null;
  next: string;
}

export interface DryRunCandidate {
  dealer: DealerAccount;
  score: number;
  reasons: string[];
}

export type MatchStatus = "matched" | "uncertain" | "unmatched";

export interface DryRunRow {
  rowIndex: number;       // 0-based row index inside sheet
  excelCompany: string;
  excelAccountNumber: string | null;
  excelCountry: string | null;
  excelEmailDomain: string | null;
  status: MatchStatus;
  topCandidates: DryRunCandidate[];
  selectedDealerId: string | null;   // null when unmatched / awaiting manual pick
  changes: DryRunChangeField[];      // only profile fields, only when value differs
  warnings: string[];
}

export interface DryRunResult {
  totalRows: number;
  matched: number;
  uncertain: number;
  unmatched: number;
  rows: DryRunRow[];
  // For UI: which target keys had at least one value mapped
  usedTargetKeys: string[];
  // SharePoint-master fields that were mapped (info-only)
  mappedSharepointMasterKeys: string[];
}

const MATCH_THRESHOLD = 90;
const UNCERTAIN_THRESHOLD = 55;

function pickByMapping(row: Record<string, string>, mapping: ColumnMapping, key: string): string {
  for (const [header, mappedKey] of Object.entries(mapping)) {
    if (mappedKey === key) {
      const v = row[header];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return "";
}

function scoreDealer(
  dealer: DealerAccount,
  excelCompanyNorm: string,
  excelAcct: string | null,
  excelCountry: string | null,
  excelDomain: string | null,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const dealerCompanyNorm = normCompany(dealer.company_name);
  if (dealerCompanyNorm && excelCompanyNorm) {
    if (dealerCompanyNorm === excelCompanyNorm) { score += 80; reasons.push("Firmanavn = match"); }
    else if (dealerCompanyNorm.startsWith(excelCompanyNorm) || excelCompanyNorm.startsWith(dealerCompanyNorm)) {
      score += 55; reasons.push("Firmanavn ≈ prefix"); }
    else if (dealerCompanyNorm.includes(excelCompanyNorm) || excelCompanyNorm.includes(dealerCompanyNorm)) {
      score += 40; reasons.push("Firmanavn ≈ delvis"); }
  }
  if (excelAcct && dealer.account_number && dealer.account_number === excelAcct) {
    score += 50; reasons.push("Kontonummer match");
  }
  if (excelCountry && dealer.country && dealer.country.toLowerCase() === excelCountry.toLowerCase()) {
    score += 8; reasons.push("Land match");
  }
  if (excelDomain) {
    const dDomain = emailDomain(dealer.email)
      || emailDomain(dealer.primary_contact_email)
      || emailDomain(dealer.sales_contact_email);
    if (dDomain && dDomain === excelDomain) {
      score += 15; reasons.push("E-mail-domæne match");
    }
  }
  return { score, reasons };
}

export function runDryRun(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  dealers: DealerAccount[],
  overrides: Record<number, string | null> = {},
): DryRunResult {
  const usedTargetKeys = Array.from(new Set(Object.values(mapping).filter((k) => k !== SKIP_KEY)));
  const mappedSharepointMasterKeys = usedTargetKeys.filter(
    (k) => TARGET_FIELDS.find((f) => f.key === k)?.sharepointMaster,
  );

  const out: DryRunRow[] = [];
  let matched = 0, uncertain = 0, unmatched = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const excelCompany = pickByMapping(row, mapping, "company_name");
    const excelAcct = pickByMapping(row, mapping, "account_number") || null;
    const excelCountry = pickByMapping(row, mapping, "country") || null;
    const excelEmail = pickByMapping(row, mapping, "email");
    const excelDomain = emailDomain(excelEmail);
    const excelCompanyNorm = normCompany(excelCompany);

    const warnings: string[] = [];
    if (!excelCompany && !excelAcct) {
      warnings.push("Hverken firmanavn eller kontonummer fundet — kan ikke matche");
    }

    // Score alle dealers og tag top 3
    const scored: DryRunCandidate[] = dealers
      .map((d) => {
        const { score, reasons } = scoreDealer(d, excelCompanyNorm, excelAcct, excelCountry, excelDomain);
        return { dealer: d, score, reasons };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    let status: MatchStatus = "unmatched";
    const top = scored[0];
    const second = scored[1];
    if (top && top.score >= MATCH_THRESHOLD && (!second || top.score - second.score >= 20)) {
      status = "matched";
    } else if (top && top.score >= UNCERTAIN_THRESHOLD) {
      status = "uncertain";
    }

    // Manual override
    const override = overrides[i];
    let selectedDealerId: string | null = null;
    if (override === null) {
      selectedDealerId = null; // explicit "skip"
    } else if (override !== undefined) {
      selectedDealerId = override;
      status = "matched";
    } else if (status === "matched" && top) {
      selectedDealerId = top.dealer.id;
    }

    const changes: DryRunChangeField[] = [];
    if (selectedDealerId) {
      const dealer = dealers.find((d) => d.id === selectedDealerId);
      if (dealer) {
        for (const f of TARGET_FIELDS) {
          if (f.role !== "profile") continue;
          if (!usedTargetKeys.includes(f.key)) continue;
          if (f.key === "__comment") continue; // ikke en dealer-kolonne — vises men ikke som diff
          const next = pickByMapping(row, mapping, f.key);
          if (!next) continue;
          const current = (dealer as unknown as Record<string, string | null>)[f.key] ?? null;
          if ((current ?? "") !== next) {
            changes.push({ key: f.key, label: f.label, current: current ?? null, next });
          }
        }
      }
    }

    if (status === "matched") matched++;
    else if (status === "uncertain") uncertain++;
    else unmatched++;

    out.push({
      rowIndex: i,
      excelCompany,
      excelAccountNumber: excelAcct,
      excelCountry,
      excelEmailDomain: excelDomain,
      status,
      topCandidates: scored,
      selectedDealerId,
      changes,
      warnings,
    });
  }

  return {
    totalRows: rows.length,
    matched,
    uncertain,
    unmatched,
    rows: out,
    usedTargetKeys,
    mappedSharepointMasterKeys,
  };
}
