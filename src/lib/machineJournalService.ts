/**
 * Unified machine journal aggregator — Phase 2.
 *
 * Combines records from:
 *  - warranty_registrations          (Supabase, RLS)
 *  - service_registrations           (Supabase, RLS)
 *  - service_tickets                 (Supabase, RLS)
 *  - machine_activity_log            (Supabase, RLS)
 *  - machine_documents               (Supabase, RLS)
 *  - machines                        (Supabase, RLS) — rich master record
 *  - machine_registry_index          (Supabase, RLS) — auto-populated by triggers
 *  - claims-store                    (canonical claims store; in-memory)
 *  - tsb-store                       (canonical TSB store; in-memory)
 *
 * Keyed by serial number. Two normalization levels:
 *  - normalizeSerial(): display-stable key (trim + uppercase + collapsed
 *    whitespace). Used to dedupe across sources.
 *  - serialKey(): strict fuzzy key (alphanumerics only, uppercase). Used
 *    only for equality matching so "RC751-2025-01234", "rc751 2025 01234"
 *    and "RC751-2025-01234" collapse to the same machine without
 *    introducing false positives (no substring matching).
 *
 * Original casing from the first source that returned the serial is
 * preserved for display.
 *
 * Permissions:
 *  - Supabase queries are RLS-scoped automatically.
 *  - Claims and TSB stores are filtered against the dealer-side user's
 *    display_name so dealer/importer/service_partner users can't see
 *    other dealers' entries. Internal Timan users see everything.
 *
 * Comments (Phase 2):
 *  - Currently READ-ONLY: comments are surfaced from the original record
 *    (service notes, claim dealer comments, warranty comments). They
 *    cannot be edited from the journal page; editing happens on the
 *    source record via its "Open" link.
 *  - Future machine-level comments will live in a dedicated
 *    `machine_comments` table keyed on `normalized_serial`, merged into
 *    the same `JournalComment[]` stream by `loadMachineJournal()`. The
 *    UI already renders any extra entries that appear in that array.
 */
import { supabase } from "@/lib/supabase";
import { fetchWarrantyRegistrations, DbWarrantyRegistration } from "@/lib/warrantyRegistrationsService";
import { listServiceRegistrations, ServiceRegistration } from "@/lib/serviceMaintenanceService";
import {
  fetchVisibleServiceTickets, fetchMachineActivityLog, fetchMachineDocumentsForMachine,
  ServiceTicket, MachineActivityLogRow, MachineDocumentRow, MachineRecord,
} from "@/lib/machineLifecycleService";
import { getAllClaims, ClaimRecord } from "@/lib/claims-store";
import { getAllTsbs, getDealer, Tsb } from "@/lib/tsb-store";
import { PortalRole } from "@/lib/portalAccess";

// ---------- Serial normalization ----------

/** Display-stable key: trim, uppercase, collapse internal whitespace. */
export function normalizeSerial(v: string | null | undefined): string {
  if (!v) return "";
  return String(v).trim().toUpperCase().replace(/\s+/g, " ");
}

/**
 * Strict fuzzy match key: alphanumerics only, uppercase.
 * Lets us treat "RC751-2025-01234", "rc751 2025 01234" and "RC7512025 01234"
 * as the same machine for matching purposes, without enabling substring
 * matches (we still compare full keys for equality).
 */
export function serialKey(v: string | null | undefined): string {
  if (!v) return "";
  return String(v).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function serialMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = serialKey(a);
  const kb = serialKey(b);
  return ka.length > 0 && ka === kb;
}

// ---------- Scope ----------

export interface JournalScope {
  role: PortalRole | null;
  /** Legacy dealer label (display_name) — soft fallback for claims/TSB. */
  dealerLabel: string | null;
  /** Allow-listed dealer_numbers (lowercased, trimmed). */
  dealerNumbers: Set<string>;
  /** Allow-listed dealer names (lowercased) used for records that only
   *  carry a name (claims, tsb, some tickets, some warranties). */
  dealerNames: Set<string>;
  /** True for internal Timan staff (backend / service): no dealer filter. */
  unrestricted: boolean;
}

/** Internal Timan staff: see every machine across every dealer. */
export function isInternalRole(role: PortalRole | null): boolean {
  return role === "timan_backend" || role === "timan_service";
}

/** Seller: scoped to dealers assigned via CRM account ownership. */
export function isSellerScopedRole(role: PortalRole | null): boolean {
  return role === "timan_seller";
}

interface DealerishRecord {
  dealer_number?: string | null;
  dealer_name?: string | null;
}

function normLower(v: string | null | undefined): string {
  return (v ?? "").toString().trim().toLowerCase();
}

/**
 * Predicate used to filter ALL source records before they're shown to
 * the user. Internal roles bypass the filter. External roles must match
 * either a dealer_number from the allow-list, or a dealer_name fuzzy-
 * equal to an entry in the name allow-list. Records with NO dealer link
 * are hidden from every external role.
 */
export function dealerScopeAllows(scope: JournalScope, rec: DealerishRecord): boolean {
  if (scope.unrestricted) return true;
  const num = normLower(rec.dealer_number);
  if (num && scope.dealerNumbers.has(num)) return true;
  const name = normLower(rec.dealer_name);
  if (name) {
    for (const n of scope.dealerNames) {
      if (!n) continue;
      if (name === n || name.includes(n) || n.includes(name)) return true;
    }
  }
  return false;
}

// ---------- Output types ----------

export type TimelineKind =
  | "warranty"
  | "service"
  | "ticket"
  | "claim"
  | "tsb"
  | "comment";

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  date: string; // ISO
  title: string;
  description?: string;
  href?: string;
  source?: string;
}

export interface JournalComment {
  id: string;
  date: string | null;
  author: string | null;
  source: "ticket" | "service" | "claim" | "warranty" | "tsb";
  body: string;
  href?: string;
}

export interface HoursRegressionWarning {
  /** Highest hour count recorded previously. */
  previousHours: number;
  /** Source label for the previous (higher) record. */
  previousSource: string;
  /** Date (ISO) of the previous record. */
  previousDate: string | null;
  /** New (lower) hour count just observed. */
  newerHours: number;
  /** Source label for the new (lower) record. */
  newerSource: string;
  /** Date (ISO) of the new record. */
  newerDate: string | null;
}

export type StatusTone = "green" | "yellow" | "red" | "neutral";
export type HealthLevel = "healthy" | "needs_attention" | "critical";

export interface JournalStatusItem {
  key: string;
  label: string;
  value: string;
  tone: StatusTone;
}

export interface JournalSummary {
  serial: string; // display casing
  normalizedSerial: string;
  machineType: string | null;
  model: string | null;
  customerName: string | null;
  dealerName: string | null;
  /** Importer (= parent dealer of current dealer). */
  importerName: string | null;
  /** Active service partner(s) linked to current dealer, joined with " · ". */
  servicePartnerName: string | null;
  sellerLabel: string | null;
  warrantyStart: string | null;
  warrantyEnd: string | null;
  registrationDate: string | null;
  currentHours: number | null;
  latestServiceDate: string | null;
  openTickets: number;
  openClaims: number;
  tsbPending: number;
  /** Sum of all open items shown on the journal page banner. */
  openItemsCount: number;
  /** Operating-hours regression detected across source records. */
  hoursRegression: HoursRegressionWarning | null;
  status: "active" | "archived" | null;
  machineRecord: MachineRecord | null;
  /** True when no source record carries any dealer link. Internal UI
   *  renders "Maskinen mangler forhandlerkobling" when this is set. */
  dealerLinkMissing: boolean;
  /** Compact per-metric status used by the "Maskinestatus" health card. */
  statusItems: JournalStatusItem[];
  /** Overall health rollup. */
  health: { level: HealthLevel; reasons: string[] };
}

export interface RelatedRecord {
  id: string;
  kind: TimelineKind;
  label: string;
  sublabel?: string;
  date?: string | null;
  href?: string;
}

export interface MachineJournal {
  found: boolean;
  summary: JournalSummary;
  timeline: TimelineEvent[];
  comments: JournalComment[];
  related: {
    warranties: RelatedRecord[];
    serviceRegistrations: RelatedRecord[];
    tickets: RelatedRecord[];
    claims: RelatedRecord[];
    tsb: RelatedRecord[];
  };
  documents: MachineDocumentRow[];
  photos: MachineDocumentRow[];
  owners: Array<{ period: string; name: string }>;
}

// ---------- Helpers ----------

function isOpenTicketStatus(s: string | null | undefined): boolean {
  if (!s) return true;
  return !["resolved", "closed", "converted_to_claim", "converted_to_warranty", "converted_to_tsb"].includes(s);
}

function isOpenClaim(c: ClaimRecord): boolean {
  return !["closed", "rejected"].includes(c.status);
}

function dealerMatchesLabel(needle: string | null, hay: string | null | undefined): boolean {
  if (!needle || !hay) return false;
  const n = needle.toLowerCase().trim();
  const h = hay.toLowerCase().trim();
  if (!n || !h) return false;
  return h.includes(n) || n.includes(h);
}

function claimAllowedByScope(scope: JournalScope, c: ClaimRecord): boolean {
  if (scope.unrestricted) return true;
  if (dealerScopeAllows(scope, { dealer_name: c.dealer })) return true;
  if (scope.dealerLabel && dealerMatchesLabel(scope.dealerLabel, c.dealer)) return true;
  return false;
}

function filterClaimsForScope(all: ClaimRecord[], scope: JournalScope): ClaimRecord[] {
  if (scope.unrestricted) return all;
  return all.filter((c) => claimAllowedByScope(scope, c));
}

function filterTsbForScope(all: Tsb[], scope: JournalScope): Tsb[] {
  if (scope.unrestricted) return all;
  const allowedDealerIds = new Set<string>();
  for (const t of all) {
    for (const d of t.dealers) {
      const dealer = getDealer(d.dealerId);
      if (!dealer) continue;
      if (dealerScopeAllows(scope, { dealer_name: dealer.name })) {
        allowedDealerIds.add(d.dealerId);
        continue;
      }
      if (scope.dealerLabel && dealerMatchesLabel(scope.dealerLabel, dealer.name)) {
        allowedDealerIds.add(d.dealerId);
      }
    }
  }
  return all
    .map((t) => ({
      ...t,
      dealers: t.dealers.filter((d) => allowedDealerIds.has(d.dealerId)),
    }))
    .filter((t) => t.dealers.length > 0);
}


// ---------- Cross-source search ----------

export interface MachineSearchHit {
  serial: string; // display casing
  normalizedSerial: string;
  machineType: string | null;
  customerName: string | null;
  dealerName: string | null;
  dealerNumber: string | null;
  /** Warranty delivery date (and serves as "sold" date when nothing better exists). */
  deliveryDate: string | null;
  /** Latest known operating hours (from machines row when present). */
  operatingHours: number | null;
  /** Sources where this serial was found. */
  sources: TimelineKind[];
}

/**
 * Optional out-parameter populated by searchMachinesByIdentifier() with
 * per-source row counts. Used by the search page's DEV debug HUD so we
 * can tell whether a "no results" outcome is caused by RLS, the query
 * itself returning 0 rows, or post-filter exclusion in push().
 */
export interface MachineSearchDebug {
  searchTerm: string;
  normalizedQuery: string;
  role: PortalRole | null;
  isInternal: boolean;
  raw: {
    machines: number; warranties: number; serviceRegistrations: number;
    tickets: number; claims: number; tsb: number; registry: number;
  };
  matched: {
    machines: number; warranties: number; serviceRegistrations: number;
    tickets: number; claims: number; tsb: number; registry: number;
  };
  /** Warranty source breakdown (Task 5). */
  warrantiesTotal: number;
  warrantiesWithSerial: number;
  warrantiesSkippedNoSerial: number;
  warrantiesSkippedByScope: number;
  registryError: string | null;
  registrySkippedReason: string | null;
  totalHits: number;
}

function emptyDebug(): MachineSearchDebug {
  return {
    searchTerm: "", normalizedQuery: "", role: null, isInternal: false,
    raw: { machines: 0, warranties: 0, serviceRegistrations: 0, tickets: 0, claims: 0, tsb: 0, registry: 0 },
    matched: { machines: 0, warranties: 0, serviceRegistrations: 0, tickets: 0, claims: 0, tsb: 0, registry: 0 },
    warrantiesTotal: 0, warrantiesWithSerial: 0, warrantiesSkippedNoSerial: 0, warrantiesSkippedByScope: 0,
    registryError: null, registrySkippedReason: null, totalHits: 0,
  };
}

/**
 * Search across all sources by serial number (case-insensitive substring).
 * Returns deduped hits keyed on normalized serial.
 *
 * Pass an optional `debug` object to capture per-source raw/matched row
 * counts. The function mutates the object in place — never reassigns it —
 * so the caller can keep a reference and read it after the promise settles.
 */
export async function searchMachinesByIdentifier(
  rawQuery: string,
  scope: JournalScope,
  debug?: MachineSearchDebug,
): Promise<MachineSearchHit[]> {
  const q = rawQuery.trim();
  if (debug) {
    Object.assign(debug, emptyDebug(), {
      searchTerm: q, role: scope.role, isInternal: isInternalRole(scope.role),
    });
  }
  if (!q) return [];
  const nq = normalizeSerial(q);
  if (debug) debug.normalizedQuery = nq;

  const hits = new Map<string, MachineSearchHit>();
  const push = (
    serial: string | null | undefined,
    source: TimelineKind,
    extra: {
      machineType?: string | null;
      customerName?: string | null;
      dealerName?: string | null;
      dealerNumber?: string | null;
      deliveryDate?: string | null;
      operatingHours?: number | null;
    },
    matchCounterKey?: keyof MachineSearchDebug["matched"],
  ) => {
    const display = (serial ?? "").toString().trim();
    if (!display) return; // Task 7: ignore empty/invalid serials.
    const norm = normalizeSerial(display);
    const key = serialKey(display);
    // Match either by normalized substring (preserves dashes) or by
    // alphanumeric-only substring (so "411000021257" matches "411000-02-1257-").
    const matches = (norm && norm.includes(nq)) || (key && nqKey && key.includes(nqKey));
    if (!matches) return;
    // Scope guard — hide serials the user is not allowed to see.
    if (!dealerScopeAllows(scope, {
      dealer_number: extra.dealerNumber ?? null,
      dealer_name: extra.dealerName ?? null,
    })) {
      if (source === "warranty" && debug) debug.warrantiesSkippedByScope += 1;
      return;
    }
    if (debug && matchCounterKey) debug.matched[matchCounterKey] += 1;
    let hit = hits.get(norm);
    if (!hit) {
      hit = {
        serial: display, normalizedSerial: norm,
        machineType: extra.machineType ?? null,
        customerName: extra.customerName ?? null,
        dealerName: extra.dealerName ?? null,
        dealerNumber: extra.dealerNumber ?? null,
        deliveryDate: extra.deliveryDate ?? null,
        operatingHours: extra.operatingHours ?? null,
        sources: [],
      };
      hits.set(norm, hit);
    }
    if (!hit.sources.includes(source)) hit.sources.push(source);
    hit.machineType = hit.machineType || (extra.machineType ?? null);
    hit.customerName = hit.customerName || (extra.customerName ?? null);
    hit.dealerName = hit.dealerName || (extra.dealerName ?? null);
    hit.dealerNumber = hit.dealerNumber || (extra.dealerNumber ?? null);
    hit.deliveryDate = hit.deliveryDate || (extra.deliveryDate ?? null);
    if (hit.operatingHours == null && extra.operatingHours != null) hit.operatingHours = extra.operatingHours;
  };

  // 1. machines (RLS)
  try {
    const safe = q.replace(/[(),]/g, "");
    const { data } = await supabase
      .from("machines")
      .select("serial_number, machine_number, machine_type, customer_name, dealer_name, dealer_number, current_hours")
      .or(`serial_number.ilike.%${safe}%,machine_number.ilike.%${safe}%`)
      .limit(50);
    const rows = (data ?? []) as Array<{
      serial_number: string | null; machine_number: string | null;
      machine_type: string | null; customer_name: string | null;
      dealer_name: string | null; dealer_number: string | null;
      current_hours: number | null;
    }>;
    if (debug) debug.raw.machines = rows.length;
    for (const r of rows) {
      push(r.serial_number, "service", { machineType: r.machine_type, customerName: r.customer_name, dealerName: r.dealer_name, dealerNumber: r.dealer_number, operatingHours: r.current_hours }, "machines");
    }
  } catch (e) {
    console.warn("[machineJournal] machines search failed", e);
  }

  // 2. warranty_registrations (RLS). Internal Timan users get all 191+
  // active rows via RLS; external users get only their scope's rows.
  try {
    const list = await fetchWarrantyRegistrations();
    if (debug) {
      debug.raw.warranties = list.length;
      debug.warrantiesTotal = list.length;
    }
    for (const w of list) {
      const hasSerial = !!(w.machineSerial && String(w.machineSerial).trim());
      if (!hasSerial) {
        if (debug) debug.warrantiesSkippedNoSerial += 1;
        continue;
      }
      if (debug) debug.warrantiesWithSerial += 1;
      push(w.machineSerial, "warranty", {
        machineType: w.machineType,
        customerName: w.customer,
        dealerName: w.dealerOfficialName || w.dealerName || w.dealerNameSnapshot,
        dealerNumber: w.dealerAccountNumber,
        deliveryDate: w.deliveryDate || null,
      }, "warranties");
    }
  } catch (e) {
    console.warn("[machineJournal] warranty search failed", e);
  }


  // 3. service_registrations (RLS)
  try {
    const list = await listServiceRegistrations();
    if (debug) debug.raw.serviceRegistrations = list.length;
    for (const s of list) {
      push(s.serial_number, "service", { machineType: s.machine_type, customerName: s.customer_name, dealerName: s.dealer_name, dealerNumber: s.dealer_number }, "serviceRegistrations");
    }
  } catch (e) {
    console.warn("[machineJournal] service reg search failed", e);
  }

  // 4. service_tickets (RLS)
  try {
    const list = await fetchVisibleServiceTickets(500);
    if (debug) debug.raw.tickets = list.length;
    for (const t of list as Array<ServiceTicket & { serial_number?: string | null; dealer_number?: string | null }>) {
      push(t.serial_number ?? null, "ticket", { dealerName: t.dealer_name, dealerNumber: t.dealer_number ?? null }, "tickets");
    }
  } catch (e) {
    console.warn("[machineJournal] tickets search failed", e);
  }

  // 5. claims (canonical claims store; scope-filtered)
  {
    const list = filterClaimsForScope(getAllClaims(), scope);
    if (debug) debug.raw.claims = list.length;
    for (const c of list) {
      push(c.serial, "claim", { machineType: c.machineType, customerName: c.customer, dealerName: c.dealer }, "claims");
    }
  }

  // 6. tsb (canonical TSB store; scope-filtered)
  {
    const list = filterTsbForScope(getAllTsbs(), scope);
    let tsbRawCount = 0;
    for (const t of list) {
      for (const d of t.dealers) {
        for (const serial of d.machineSerials) {
          tsbRawCount += 1;
          const dealer = getDealer(d.dealerId);
          push(serial, "tsb", { dealerName: dealer?.name ?? null }, "tsb");
        }
      }
    }
    if (debug) debug.raw.tsb = tsbRawCount;
  }

  // 7. machine_registry_index — INTERNAL ONLY.
  //    RLS restricts SELECT to timan_backend / timan_service. Dealer-side
  //    users get no rows from this table and we skip the query entirely
  //    to avoid leaking cross-dealer serial existence.
  if (isInternalRole(scope.role)) {
    try {
      const safe = q.replace(/[(),]/g, "");
      const { data, error } = await supabase
        .from("machine_registry_index")
        .select("normalized_serial, display_serial, machine_model, machine_type, last_source")
        .or(`normalized_serial.ilike.%${safe.toUpperCase()}%,display_serial.ilike.%${safe}%`)
        .limit(50);
      if (error) {
        if (debug) debug.registryError = error.message;
        console.warn("[machineJournal] registry search returned error (tolerated)", error.message);
      } else {
        const rows = (data ?? []) as Array<{
          normalized_serial: string; display_serial: string;
          machine_model: string | null; machine_type: string | null; last_source: string | null;
        }>;
        if (debug) debug.raw.registry = rows.length;
        for (const r of rows) {
          const src = (r.last_source as TimelineKind) ?? "service";
          push(r.display_serial, src, { machineType: r.machine_type }, "registry");
        }
      }
    } catch (e) {
      if (debug) debug.registryError = String((e as Error)?.message ?? e);
      console.warn("[machineJournal] registry search failed (tolerated)", e);
    }
  } else if (debug) {
    debug.registrySkippedReason = `role ${scope.role ?? "null"} is not internal — registry query skipped by client`;
  }

  const out = Array.from(hits.values()).slice(0, 100);
  if (debug) debug.totalHits = out.length;
  return out;
}

// ---------- Full journal load ----------

export async function loadMachineJournal(
  rawSerial: string,
  scope: JournalScope,
): Promise<MachineJournal> {
  const display = rawSerial.trim();
  const target = normalizeSerial(display);

  const empty: MachineJournal = {
    found: false,
    summary: {
      serial: display,
      normalizedSerial: target,
      machineType: null, model: null, customerName: null, dealerName: null,
      importerName: null, servicePartnerName: null,
      sellerLabel: null, warrantyStart: null, warrantyEnd: null,
      registrationDate: null, currentHours: null, latestServiceDate: null,
      openTickets: 0, openClaims: 0, tsbPending: 0, openItemsCount: 0,
      hoursRegression: null, status: null, machineRecord: null,
      dealerLinkMissing: false,
      statusItems: [],
      health: { level: "healthy", reasons: [] },
    },
    timeline: [],
    comments: [],
    related: { warranties: [], serviceRegistrations: [], tickets: [], claims: [], tsb: [] },
    documents: [],
    photos: [],
    owners: [],
  };
  if (!target) return empty;

  const journal: MachineJournal = { ...empty, found: false };

  // Parallel fetches across all sources.
  const machineLookup = (async (): Promise<MachineRecord | null> => {
    try {
      const r = await supabase
        .from("machines")
        .select(
          "id, serial_number, machine_number, machine_type, model, production_year, " +
          "dealer_account_id, dealer_number, dealer_name, customer_name, customer_email, customer_phone, " +
          "seller_user_id, seller_email, seller_initials, " +
          "warranty_start_date, warranty_end_date, current_hours, created_at, updated_at",
        )
        .ilike("serial_number", display)
        .limit(1);
      return (r.data && r.data[0]) ? (r.data[0] as unknown as MachineRecord) : null;
    } catch { return null; }
  })();

  const [machinesRes, warrantiesAll, serviceRegsRaw, tickets] = await Promise.all([
    machineLookup,
    fetchWarrantyRegistrations().catch(() => [] as DbWarrantyRegistration[]),
    listServiceRegistrations({ serialNumber: display }).catch(() => [] as ServiceRegistration[]),
    fetchVisibleServiceTickets(500).catch(() => [] as ServiceTicket[]),
  ]);

  let machine = machinesRes;
  // Drop machine row if dealer scope disallows it (RLS belt + suspenders).
  if (machine && !dealerScopeAllows(scope, { dealer_number: machine.dealer_number, dealer_name: machine.dealer_name })) {
    machine = null;
  }
  if (machine) journal.summary.machineRecord = machine;

  // Warranties for this serial (scope-filtered).
  const warranties = warrantiesAll
    .filter((w) => serialMatches(w.machineSerial, display))
    .filter((w) => dealerScopeAllows(scope, { dealer_number: w.dealerAccountNumber, dealer_name: w.dealerName }));

  // Tickets for this serial (scope-filtered).
  const ticketsForSerial = (tickets as Array<ServiceTicket & { serial_number?: string | null; machine_id?: string | null; dealer_number?: string | null }>)
    .filter((t) => serialMatches(t.serial_number ?? "", display) || (machine && (t as { machine_id?: string }).machine_id === machine.id))
    .filter((t) => dealerScopeAllows(scope, { dealer_number: t.dealer_number ?? null, dealer_name: t.dealer_name }));

  // Claims for this serial (scope-filtered).
  const claimsForSerial = filterClaimsForScope(getAllClaims(), scope)
    .filter((c) => serialMatches(c.serial, display));

  // Service registrations: re-filter by scope (RLS belt + suspenders).
  const serviceRegs = serviceRegsRaw
    .filter((s) => dealerScopeAllows(scope, { dealer_number: s.dealer_number, dealer_name: s.dealer_name }));

  // TSB for this serial (scope-filtered)
  const tsbForSerial: Array<{ tsb: Tsb; dealerName: string | null; status: string }> = [];
  for (const t of filterTsbForScope(getAllTsbs(), scope)) {
    for (const d of t.dealers) {
      if (d.machineSerials.some((s) => serialMatches(s, display))) {
        const dealer = getDealer(d.dealerId);
        tsbForSerial.push({ tsb: t, dealerName: dealer?.name ?? null, status: d.status });
      }
    }
  }

  // Documents + activity log — only attempt if we have machine.id OR raw serial.
  let documents: MachineDocumentRow[] = [];
  let activities: MachineActivityLogRow[] = [];
  if (machine?.id) {
    try {
      [documents, activities] = await Promise.all([
        fetchMachineDocumentsForMachine(machine.id, machine.serial_number),
        fetchMachineActivityLog(machine.id, machine.serial_number),
      ]);
    } catch (e) {
      console.warn("[machineJournal] documents/activity load failed", e);
    }
  }

  // Found if ANY source has a record.
  journal.found = !!machine
    || warranties.length > 0
    || serviceRegs.length > 0
    || ticketsForSerial.length > 0
    || claimsForSerial.length > 0
    || tsbForSerial.length > 0;

  if (!journal.found) return empty;

  // ---------- Summary ----------
  const firstWarranty = warranties[0];
  const latestService = serviceRegs[0];

  // ---------- Hours regression detection ----------
  // Walk every source carrying an operating-hours number, sort by date
  // ascending, and flag the first record whose hours are strictly lower
  // than the running max. Surface only the most recent regression so the
  // UI banner stays focused.
  const hoursEntries: Array<{ hours: number; date: string | null; source: string }> = [];
  for (const s of serviceRegs) {
    if (typeof s.operating_hours === "number" && s.operating_hours >= 0) {
      hoursEntries.push({ hours: s.operating_hours, date: s.service_date ?? null, source: "Service" });
    }
  }
  for (const t of ticketsForSerial) {
    const oh = (t as { operating_hours?: number | null }).operating_hours;
    if (typeof oh === "number" && oh >= 0) {
      hoursEntries.push({ hours: oh, date: t.created_at ?? null, source: "Service ticket" });
    }
  }
  for (const c of claimsForSerial) {
    const oh = (c as { operatingHours?: number | null }).operatingHours;
    if (typeof oh === "number" && oh >= 0) {
      hoursEntries.push({ hours: oh, date: c.createdAt ?? null, source: "Claim" });
    }
  }
  if (machine && typeof machine.current_hours === "number" && machine.current_hours >= 0) {
    hoursEntries.push({
      hours: machine.current_hours,
      date: machine.updated_at ?? machine.created_at ?? null,
      source: "Maskine (master)",
    });
  }
  hoursEntries.sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return da - db;
  });
  let hoursRegression: HoursRegressionWarning | null = null;
  let runningMax: { hours: number; date: string | null; source: string } | null = null;
  for (const e of hoursEntries) {
    if (runningMax && e.hours < runningMax.hours) {
      hoursRegression = {
        previousHours: runningMax.hours,
        previousSource: runningMax.source,
        previousDate: runningMax.date,
        newerHours: e.hours,
        newerSource: e.source,
        newerDate: e.date,
      };
    }
    if (!runningMax || e.hours > runningMax.hours) runningMax = e;
  }

  const openTickets = ticketsForSerial.filter((t) => isOpenTicketStatus(t.status)).length;
  const openClaims = claimsForSerial.filter(isOpenClaim).length;
  const tsbPending = tsbForSerial.filter((t) => t.status === "afventer").length;

  const dealerName = machine?.dealer_name
    ?? firstWarranty?.dealerName
    ?? serviceRegs[0]?.dealer_name
    ?? claimsForSerial[0]?.dealer
    ?? null;
  const dealerNumber = machine?.dealer_number
    ?? firstWarranty?.dealerAccountNumber
    ?? serviceRegs[0]?.dealer_number
    ?? null;
  const dealerAccountId = machine?.dealer_account_id
    ?? firstWarranty?.dealerAccountId
    ?? null;

  // ---------- Importer + service partner enrichment ----------
  // Best-effort, additive. Failures are tolerated and just leave the fields null.
  let importerName: string | null = null;
  let servicePartnerName: string | null = null;
  try {
    let dealerRow: { id: string; account_number: string | null; parent_account_number: string | null } | null = null;
    if (dealerAccountId) {
      const r = await supabase
        .from("dealer_accounts")
        .select("id, account_number, parent_account_number")
        .eq("id", dealerAccountId)
        .maybeSingle();
      dealerRow = (r.data as typeof dealerRow) ?? null;
    } else if (dealerNumber) {
      const r = await supabase
        .from("dealer_accounts")
        .select("id, account_number, parent_account_number")
        .eq("account_number", dealerNumber)
        .maybeSingle();
      dealerRow = (r.data as typeof dealerRow) ?? null;
    }
    if (dealerRow?.parent_account_number) {
      const r = await supabase
        .from("dealer_accounts")
        .select("company_name, account_number")
        .eq("account_number", dealerRow.parent_account_number)
        .maybeSingle();
      const parent = r.data as { company_name: string | null; account_number: string | null } | null;
      if (parent?.company_name) importerName = parent.company_name;
    }
    if (dealerRow?.id) {
      const r = await supabase
        .from("service_partner_dealer_links")
        .select("service_partner_account_id, active")
        .eq("dealer_account_id", dealerRow.id)
        .eq("active", true);
      const links = (r.data ?? []) as Array<{ service_partner_account_id: string }>;
      if (links.length > 0) {
        const ids = links.map((l) => l.service_partner_account_id);
        const sp = await supabase
          .from("dealer_accounts")
          .select("id, company_name")
          .in("id", ids);
        const names = ((sp.data ?? []) as Array<{ company_name: string | null }>)
          .map((d) => d.company_name)
          .filter((n): n is string => !!n);
        if (names.length > 0) servicePartnerName = names.join(" · ");
      }
    }
  } catch (e) {
    console.warn("[machineJournal] importer/service-partner lookup failed (tolerated)", e);
  }

  // ---------- Health / status calculation ----------
  // Tones:
  //   green  = OK / no open issues
  //   yellow = attention required (open tickets, missing relationship data, service due soon)
  //   red    = action required (open claim, pending TSB, overdue service, hours regression)
  const SERVICE_OVERDUE_DAYS = 365; // > 12 months since last service
  const SERVICE_DUE_SOON_DAYS = 300; // 10–12 months
  const latestServiceDate = latestService?.service_date ?? null;
  let serviceDays: number | null = null;
  if (latestServiceDate) {
    const t = new Date(latestServiceDate).getTime();
    if (!Number.isNaN(t)) serviceDays = Math.floor((Date.now() - t) / 86400000);
  }
  const warrantyEnd = machine?.warranty_end_date ?? null;
  let warrantyTone: StatusTone = "neutral";
  let warrantyValue = "Ukendt";
  if (warrantyEnd) {
    const we = new Date(warrantyEnd).getTime();
    if (!Number.isNaN(we)) {
      const daysLeft = Math.floor((we - Date.now()) / 86400000);
      if (daysLeft < 0) { warrantyTone = "neutral"; warrantyValue = "Udløbet"; }
      else if (daysLeft < 60) { warrantyTone = "yellow"; warrantyValue = `Udløber om ${daysLeft} dage`; }
      else { warrantyTone = "green"; warrantyValue = "Aktiv"; }
    }
  }

  const statusItems: JournalStatusItem[] = [
    { key: "warranty", label: "Garanti", value: warrantyValue, tone: warrantyTone },
    { key: "tickets", label: "Åbne tickets", value: String(openTickets), tone: openTickets > 0 ? "yellow" : "green" },
    { key: "claims", label: "Åbne claims", value: String(openClaims), tone: openClaims > 0 ? "red" : "green" },
    { key: "tsb", label: "Åbne TSB", value: String(tsbPending), tone: tsbPending > 0 ? "red" : "green" },
    {
      key: "service",
      label: "Seneste service",
      value: latestServiceDate ? new Date(latestServiceDate).toLocaleDateString("da-DK") : "Ingen",
      tone: serviceDays == null ? "yellow"
        : serviceDays > SERVICE_OVERDUE_DAYS ? "red"
        : serviceDays > SERVICE_DUE_SOON_DAYS ? "yellow"
        : "green",
    },
    {
      key: "hours",
      label: "Driftstimer",
      value: (machine?.current_hours ?? latestService?.operating_hours) != null
        ? `${machine?.current_hours ?? latestService?.operating_hours} t`
        : "Ukendt",
      tone: hoursRegression ? "red" : (machine?.current_hours ?? latestService?.operating_hours) != null ? "green" : "yellow",
    },
    { key: "dealer", label: "Forhandler", value: dealerName || "Mangler", tone: dealerName ? "green" : "red" },
    { key: "importer", label: "Importør", value: importerName || "—", tone: importerName ? "green" : "yellow" },
    { key: "servicePartner", label: "Service partner", value: servicePartnerName || "—", tone: servicePartnerName ? "green" : "yellow" },
    {
      key: "seller",
      label: "Timan sælger",
      value: machine?.seller_initials || machine?.seller_email || "—",
      tone: (machine?.seller_initials || machine?.seller_email) ? "green" : "yellow",
    },
  ];

  const reasons: string[] = [];
  let level: HealthLevel = "healthy";
  if (openClaims > 0) { level = "critical"; reasons.push(`${openClaims} åben(e) claim(s)`); }
  if (tsbPending > 0) { level = "critical"; reasons.push(`${tsbPending} åben TSB`); }
  if (serviceDays != null && serviceDays > SERVICE_OVERDUE_DAYS) { level = "critical"; reasons.push("Service forfalden"); }
  if (hoursRegression) { level = "critical"; reasons.push("Konflikt i driftstimer"); }
  if (level !== "critical") {
    if (openTickets > 0) { level = "needs_attention"; reasons.push(`${openTickets} åben(e) ticket(s)`); }
    if (serviceDays != null && serviceDays > SERVICE_DUE_SOON_DAYS) { level = "needs_attention"; reasons.push("Service nærmer sig"); }
    if (!importerName || !servicePartnerName) { level = level === "healthy" ? "needs_attention" : level; reasons.push("Manglende relationsdata"); }
  }

  journal.summary = {
    serial: machine?.serial_number || firstWarranty?.machineSerial || serviceRegs[0]?.serial_number || display,
    normalizedSerial: target,
    machineType: machine?.machine_type
      ?? firstWarranty?.machineType
      ?? serviceRegs[0]?.machine_type
      ?? claimsForSerial[0]?.machineType
      ?? null,
    model: machine?.model ?? null,
    customerName: machine?.customer_name
      ?? firstWarranty?.customer
      ?? serviceRegs[0]?.customer_name
      ?? claimsForSerial[0]?.customer
      ?? null,
    dealerName,
    importerName,
    servicePartnerName,
    sellerLabel: machine?.seller_initials || machine?.seller_email || null,
    warrantyStart: machine?.warranty_start_date ?? firstWarranty?.deliveryDate ?? null,
    warrantyEnd: machine?.warranty_end_date ?? null,
    registrationDate: firstWarranty?.registrationDate ?? null,
    currentHours: machine?.current_hours ?? (latestService?.operating_hours ?? null),
    latestServiceDate,
    openTickets,
    openClaims,
    tsbPending,
    openItemsCount: openTickets + openClaims + tsbPending,
    hoursRegression,
    status: machine ? "active" : (firstWarranty?.status === "archived" ? "archived" : "active"),
    machineRecord: machine ?? null,
    dealerLinkMissing: !(
      (machine && (machine.dealer_number || machine.dealer_account_id || machine.dealer_name)) ||
      warranties.some((w) => w.dealerAccountNumber || w.dealerAccountId || w.dealerName) ||
      serviceRegs.some((s) => s.dealer_number || s.dealer_name) ||
      ticketsForSerial.some((t) => (t as { dealer_number?: string | null }).dealer_number || t.dealer_name) ||
      claimsForSerial.some((c) => c.dealer) ||
      tsbForSerial.some((t) => t.dealerName)
    ),
    statusItems,
    health: { level, reasons },
  };

  // ---------- Timeline ----------
  const events: TimelineEvent[] = [];

  for (const w of warranties) {
    const date = w.registrationDate || w.submittedAt || w.createdAt;
    events.push({
      id: `w-${w.id}`,
      kind: "warranty",
      date,
      title: "Garanti registreret",
      description: w.dealerName ? `${w.dealerName}${w.customer ? ` · ${w.customer}` : ""}` : undefined,
      href: "/portal/service/warranty/registrations",
      source: "warranty",
    });
  }

  for (const s of serviceRegs) {
    events.push({
      id: `s-${s.id}`,
      kind: "service",
      date: s.service_date,
      title: `Service registreret${s.operating_hours ? ` — ${s.operating_hours} timer` : ""}`,
      description: [s.technician_name, s.dealer_name].filter(Boolean).join(" · ") || undefined,
      href: "/portal/service/maintenance",
      source: "service",
    });
  }

  for (const t of ticketsForSerial) {
    events.push({
      id: `t-${t.id}`,
      kind: "ticket",
      date: t.created_at || new Date().toISOString(),
      title: "Service ticket oprettet",
      description: `${t.ticket_number || ""}${t.title ? ` · ${t.title}` : ""}`.trim(),
      href: `/portal/service/tickets/${t.id}`,
      source: "ticket",
    });
  }

  for (const c of claimsForSerial) {
    events.push({
      id: `c-${c.id}`,
      kind: "claim",
      date: c.createdAt,
      title: "Claim oprettet",
      description: `${c.groupId}${c.title ? ` · ${c.title}` : ""}`,
      href: `/portal/service/claims/${c.id}`,
      source: "claim",
    });
    if (c.approvedDate) {
      events.push({
        id: `c-${c.id}-approved`,
        kind: "claim",
        date: c.approvedDate,
        title: "Claim godkendt",
        description: c.groupId,
        href: `/portal/service/claims/${c.id}`,
        source: "claim",
      });
    }
  }

  for (const { tsb, status } of tsbForSerial) {
    events.push({
      id: `tsb-${tsb.id}`,
      kind: "tsb",
      date: tsb.activeFrom || tsb.createdAt,
      title: status === "accepteret" ? "TSB udført" : "TSB tildelt",
      description: `${tsb.id} · ${tsb.title}`,
      href: `/portal/service/tsb/${tsb.id}`,
      source: "tsb",
    });
  }

  for (const a of activities) {
    if (a.event_type?.startsWith("service_ticket_")) continue; // already covered
    events.push({
      id: `a-${a.id}`,
      kind: a.event_type?.includes("claim") ? "claim"
        : a.event_type?.includes("warranty") ? "warranty"
        : a.event_type?.includes("service") ? "service"
        : "comment",
      date: a.created_at || new Date().toISOString(),
      title: a.title,
      description: a.description ?? undefined,
      source: "activity",
    });
  }

  events.sort((a, b) => (new Date(b.date).getTime() - new Date(a.date).getTime()));
  journal.timeline = events;

  // ---------- Comments ----------
  const comments: JournalComment[] = [];
  for (const s of serviceRegs) {
    if (s.notes) {
      comments.push({ id: `sc-${s.id}-n`, date: s.service_date, author: s.technician_name ?? s.created_by_email,
        source: "service", body: s.notes, href: "/portal/service/maintenance" });
    }
    if (s.faults_found) {
      comments.push({ id: `sc-${s.id}-f`, date: s.service_date, author: s.technician_name ?? s.created_by_email,
        source: "service", body: `Fejl: ${s.faults_found}`, href: "/portal/service/maintenance" });
    }
  }
  for (const c of claimsForSerial) {
    if (c.adminComment) {
      comments.push({ id: `cc-${c.id}-a`, date: c.approvedDate || c.createdAt, author: "Timan Admin",
        source: "claim", body: c.adminComment, href: `/portal/service/claims/${c.id}` });
    }
    for (const dc of c.dealerComments ?? []) {
      comments.push({ id: `cc-${c.id}-${dc.id}`, date: dc.at, author: dc.author,
        source: "claim", body: dc.text, href: `/portal/service/claims/${c.id}` });
    }
  }
  for (const w of warranties) {
    if (w.comment) {
      comments.push({ id: `wc-${w.id}`, date: w.registrationDate || w.createdAt, author: w.dealerName,
        source: "warranty", body: w.comment, href: "/portal/service/warranty/registrations" });
    }
  }
  comments.sort((a, b) => (new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()));
  journal.comments = comments;

  // ---------- Related records ----------
  journal.related.warranties = warranties.map((w) => ({
    id: w.id, kind: "warranty", label: w.certificateNumber,
    sublabel: w.dealerName || undefined, date: w.registrationDate,
    href: "/portal/service/warranty/registrations",
  }));
  journal.related.serviceRegistrations = serviceRegs.map((s) => ({
    id: s.id, kind: "service", label: `${s.service_interval_hours}-timers service`,
    sublabel: s.technician_name || s.dealer_name || undefined, date: s.service_date,
    href: "/portal/service/maintenance",
  }));
  journal.related.tickets = ticketsForSerial.map((t) => ({
    id: t.id, kind: "ticket", label: t.ticket_number || t.title || t.id.slice(0, 8),
    sublabel: t.title || undefined, date: t.created_at,
    href: `/portal/service/tickets/${t.id}`,
  }));
  journal.related.claims = claimsForSerial.map((c) => ({
    id: c.id, kind: "claim", label: `${c.groupId}${c.subIndex > 1 ? `/${c.subIndex}` : ""}`,
    sublabel: c.title || undefined, date: c.createdAt,
    href: `/portal/service/claims/${c.id}`,
  }));
  journal.related.tsb = tsbForSerial.map(({ tsb, status }) => ({
    id: `${tsb.id}-${status}`, kind: "tsb", label: tsb.id,
    sublabel: `${tsb.title} · ${status}`, date: tsb.activeFrom || tsb.createdAt,
    href: `/portal/service/tsb/${tsb.id}`,
  }));

  // ---------- Documents & photos ----------
  const isImage = (d: MachineDocumentRow) =>
    /^image\//i.test(d.file_type || "") || /\.(jpe?g|png|gif|webp|heic)$/i.test(d.file_name || "");
  journal.documents = documents.filter((d) => !isImage(d));
  journal.photos = documents.filter(isImage);

  // ---------- Owners (current = current dealer/forhandler) ----------
  // Per Phase 2.1: end customers are always registered under a dealer, so
  // the canonical "current owner" of the machine is the dealer. The end
  // customer is still shown separately in the summary header.
  // TODO: full owner history once a machine_owners table exists.
  if (journal.summary.dealerName) {
    journal.owners = [{ period: "Nuværende", name: journal.summary.dealerName }];
  }

  return journal;
}
