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
  /** Dealer-side users only see claims/TSB whose dealer matches this label. */
  dealerLabel: string | null;
}

export function isInternalRole(role: PortalRole | null): boolean {
  return role === "timan_backend" || role === "timan_seller" || role === "timan_service";
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

export interface JournalSummary {
  serial: string; // display casing
  normalizedSerial: string;
  machineType: string | null;
  model: string | null;
  customerName: string | null;
  dealerName: string | null;
  sellerLabel: string | null;
  warrantyStart: string | null;
  warrantyEnd: string | null;
  registrationDate: string | null;
  currentHours: number | null;
  latestServiceDate: string | null;
  openTickets: number;
  openClaims: number;
  tsbPending: number;
  status: "active" | "archived" | null;
  machineRecord: MachineRecord | null;
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

function filterClaimsForScope(all: ClaimRecord[], scope: JournalScope): ClaimRecord[] {
  if (isInternalRole(scope.role)) return all;
  if (!scope.dealerLabel) return [];
  return all.filter((c) => dealerMatchesLabel(scope.dealerLabel, c.dealer));
}

function filterTsbForScope(all: Tsb[], scope: JournalScope): Tsb[] {
  if (isInternalRole(scope.role)) return all;
  if (!scope.dealerLabel) return [];
  const allowedDealerIds = new Set<string>();
  for (const t of all) {
    for (const d of t.dealers) {
      const dealer = getDealer(d.dealerId);
      if (dealer && dealerMatchesLabel(scope.dealerLabel, dealer.name)) {
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
  /** Sources where this serial was found. */
  sources: TimelineKind[];
}

/**
 * Search across all sources by serial number (case-insensitive substring).
 * Returns deduped hits keyed on normalized serial.
 */
export async function searchMachinesByIdentifier(
  rawQuery: string,
  scope: JournalScope,
): Promise<MachineSearchHit[]> {
  const q = rawQuery.trim();
  if (!q) return [];
  const nq = normalizeSerial(q);

  const hits = new Map<string, MachineSearchHit>();
  const push = (
    serial: string | null | undefined,
    source: TimelineKind,
    extra: { machineType?: string | null; customerName?: string | null; dealerName?: string | null },
  ) => {
    const display = (serial ?? "").toString().trim();
    const norm = normalizeSerial(display);
    if (!norm || !norm.includes(nq)) return;
    let hit = hits.get(norm);
    if (!hit) {
      hit = {
        serial: display,
        normalizedSerial: norm,
        machineType: extra.machineType ?? null,
        customerName: extra.customerName ?? null,
        dealerName: extra.dealerName ?? null,
        sources: [],
      };
      hits.set(norm, hit);
    }
    if (!hit.sources.includes(source)) hit.sources.push(source);
    hit.machineType = hit.machineType || (extra.machineType ?? null);
    hit.customerName = hit.customerName || (extra.customerName ?? null);
    hit.dealerName = hit.dealerName || (extra.dealerName ?? null);
  };

  // 1. machines (RLS)
  try {
    const safe = q.replace(/[(),]/g, "");
    const { data } = await supabase
      .from("machines")
      .select("serial_number, machine_number, machine_type, customer_name, dealer_name")
      .or(`serial_number.ilike.%${safe}%,machine_number.ilike.%${safe}%`)
      .limit(50);
    for (const r of (data ?? []) as Array<{
      serial_number: string | null; machine_number: string | null;
      machine_type: string | null; customer_name: string | null; dealer_name: string | null;
    }>) {
      push(r.serial_number, "service", { machineType: r.machine_type, customerName: r.customer_name, dealerName: r.dealer_name });
    }
  } catch (e) {
    console.warn("[machineJournal] machines search failed", e);
  }

  // 2. warranty_registrations (RLS)
  try {
    const list = await fetchWarrantyRegistrations();
    for (const w of list) {
      push(w.machineSerial, "warranty", { machineType: w.machineType, customerName: w.customer, dealerName: w.dealerName });
    }
  } catch (e) {
    console.warn("[machineJournal] warranty search failed", e);
  }

  // 3. service_registrations (RLS)
  try {
    const list = await listServiceRegistrations();
    for (const s of list) {
      push(s.serial_number, "service", { machineType: s.machine_type, customerName: s.customer_name, dealerName: s.dealer_name });
    }
  } catch (e) {
    console.warn("[machineJournal] service reg search failed", e);
  }

  // 4. service_tickets (RLS)
  try {
    const list = await fetchVisibleServiceTickets(500);
    for (const t of list as Array<ServiceTicket & { serial_number?: string | null }>) {
      push(t.serial_number ?? null, "ticket", { dealerName: t.dealer_name });
    }
  } catch (e) {
    console.warn("[machineJournal] tickets search failed", e);
  }

  // 5. claims (canonical claims store; scope-filtered)
  for (const c of filterClaimsForScope(getAllClaims(), scope)) {
    push(c.serial, "claim", { machineType: c.machineType, customerName: c.customer, dealerName: c.dealer });
  }

  // 6. tsb (canonical TSB store; scope-filtered)
  for (const t of filterTsbForScope(getAllTsbs(), scope)) {
    for (const d of t.dealers) {
      for (const serial of d.machineSerials) {
        const dealer = getDealer(d.dealerId);
        push(serial, "tsb", { dealerName: dealer?.name ?? null });
      }
    }
  }

  // 7. machine_registry_index — auto-populated identity layer (RLS authenticated)
  try {
    const safe = q.replace(/[(),]/g, "");
    const { data } = await supabase
      .from("machine_registry_index")
      .select("normalized_serial, display_serial, machine_model, machine_type, last_source")
      .or(`normalized_serial.ilike.%${safe.toUpperCase()}%,display_serial.ilike.%${safe}%`)
      .limit(50);
    for (const r of (data ?? []) as Array<{
      normalized_serial: string; display_serial: string;
      machine_model: string | null; machine_type: string | null; last_source: string | null;
    }>) {
      const src = (r.last_source as TimelineKind) ?? "service";
      push(r.display_serial, src, { machineType: r.machine_type });
    }
  } catch (e) {
    console.warn("[machineJournal] registry search failed", e);
  }

  return Array.from(hits.values()).slice(0, 100);
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
      sellerLabel: null, warrantyStart: null, warrantyEnd: null,
      registrationDate: null, currentHours: null, latestServiceDate: null,
      openTickets: 0, openClaims: 0, tsbPending: 0, status: null, machineRecord: null,
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

  const [machinesRes, warrantiesAll, serviceRegs, tickets] = await Promise.all([
    machineLookup,
    fetchWarrantyRegistrations().catch(() => [] as DbWarrantyRegistration[]),
    listServiceRegistrations({ serialNumber: display }).catch(() => [] as ServiceRegistration[]),
    fetchVisibleServiceTickets(500).catch(() => [] as ServiceTicket[]),
  ]);

  const machine = machinesRes;
  if (machine) journal.summary.machineRecord = machine;

  // Warranties for this serial
  const warranties = warrantiesAll.filter((w) => serialMatches(w.machineSerial, display));

  // Tickets for this serial
  const ticketsForSerial = (tickets as Array<ServiceTicket & { serial_number?: string | null; machine_id?: string | null }>)
    .filter((t) => serialMatches(t.serial_number ?? "", display) || (machine && (t as { machine_id?: string }).machine_id === machine.id));

  // Mock claims for this serial
  const claimsForSerial = filterClaimsForScope(getAllClaims(), scope)
    .filter((c) => serialMatches(c.serial, display));

  // Mock TSB for this serial
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
    dealerName: machine?.dealer_name
      ?? firstWarranty?.dealerName
      ?? serviceRegs[0]?.dealer_name
      ?? claimsForSerial[0]?.dealer
      ?? null,
    sellerLabel: machine?.seller_initials || machine?.seller_email || null,
    warrantyStart: machine?.warranty_start_date ?? firstWarranty?.deliveryDate ?? null,
    warrantyEnd: machine?.warranty_end_date ?? null,
    registrationDate: firstWarranty?.registrationDate ?? null,
    currentHours: machine?.current_hours ?? (latestService?.operating_hours ?? null),
    latestServiceDate: latestService?.service_date ?? null,
    openTickets: ticketsForSerial.filter((t) => isOpenTicketStatus(t.status)).length,
    openClaims: claimsForSerial.filter(isOpenClaim).length,
    tsbPending: tsbForSerial.filter((t) => t.status === "afventer").length,
    status: machine ? "active" : (firstWarranty?.status === "archived" ? "archived" : "active"),
    machineRecord: machine ?? null,
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

  // ---------- Owners (current only — TODO: full history when schema supports it) ----------
  if (journal.summary.customerName) {
    journal.owners = [{ period: "Nuværende", name: journal.summary.customerName }];
  }

  return journal;
}
