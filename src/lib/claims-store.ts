/**
 * Mock claims store for the Dealer Claims portal (preview/demo).
 *
 * No backend yet — purely client-side fixture data.
 */

export type ClaimStatus =
  | "open"
  /** Gemt / ikke afsendt (dealer draft, full edit) */
  | "in_progress"
  /** Afventer accept (submitted, dealer can still edit until Timan approves) */
  | "waiting"
  /** Godkendt af Timan (locked for dealer, awaits dealer action) */
  | "approved"
  /** I gang hos forhandler (dealer accepted approval) */
  | "dealer_in_progress"
  /** Afventer Timan afslutning (dealer finished, Timan must close) */
  | "awaiting_timan_close"
  /** Afventer Timan kommentar (dealer disagreed/commented) */
  | "awaiting_timan_comment"
  /** Afvist af Timan */
  | "rejected"
  /** Lukket — final */
  | "closed";

export interface ClaimPartLine {
  qty: string;
  partNo: string;
  desc: string;
  unitPrice: string; // DKK net
}

/** Full claim detail used to prefill the long claim form when opening/viewing. */
export interface ClaimDetail {
  /* Dealer */
  dealer: string;
  dealerCountry: string;
  dealerContact: string;
  dealerPhone: string;
  dealerEmail: string;
  /* Owner / customer */
  owner: string;
  ownerCountry: string;
  ownerAddress: string;
  ownerPostal: string;
  /* Machine */
  machineType: string;
  serialNo: string;
  hours: string;
  /* Dates (ISO yyyy-mm-dd) */
  saleDate: string;
  damageDate: string;
  approvedDate: string;
  repairDate: string;
  /* Descriptions */
  faultDesc: string;
  repairDesc: string;
  /* Parts & labor */
  parts: ClaimPartLine[];
  laborHours: string;
  drivingKm: string;
  currency: "DKK";
}

export interface ClaimRecord {
  /**
   * Unique storage id. For grouped claims this is `${groupId}-${subIndex}`,
   * e.g. "CL-9013-2". The user-facing display id uses a slash:
   * "CL-9013/2" — see {@link claimDisplayId}.
   */
  id: string;
  /**
   * Main case number shared by all connected claims in a group, e.g.
   * "CL-9013". A standalone claim has groupId = id and subIndex = 1.
   */
  groupId: string;
  /** 1-based position within the group. */
  subIndex: number;
  /** Warranty / guarantee number issued by Timan, e.g. "T-001234". */
  warrantyNo: string;
  title: string;
  dealer: string;
  country: string;
  customer: string;
  machineType: string;
  serial: string;
  createdAt: string; // ISO date — submitted/created
  damageDate: string; // ISO date
  approvedDate: string | null; // ISO date or null
  /** Total claim amount in DKK (parts + labor). */
  totalPrice: number;
  status: ClaimStatus;
  /** Full detail used to prefill the claim form. */
  detail: ClaimDetail;
  /**
   * Internal comment from Timan Admin. Visible to both Timan Admin and the
   * dealer when the claim is opened. Editable by Timan Admin only — useful for
   * documenting why a claim was rejected/closed or follow-up notes.
   */
  adminComment?: string;
  /**
   * Comments left by the dealer. Used in the disagreement/"Ikke accepteret"
   * flow and on rejected claims so the dealer can reply. Each comment is
   * surfaced to Timan Admin with a notification icon when the claim is in
   * a status that requires Timan attention.
   */
  dealerComments?: ClaimComment[];
  /**
   * Audit log of changes made by Timan Admin after the claim was approved.
   * Visible to both Timan Admin and the dealer so any later edits are
   * transparent.
   */
  auditLog?: ClaimAuditEntry[];
}

export interface ClaimComment {
  id: string;
  author: string;
  /** ISO timestamp */
  at: string;
  text: string;
}

export interface ClaimAuditEntry {
  id: string;
  /** ISO timestamp */
  at: string;
  by: string;
  field: string;
  oldValue: string;
  newValue: string;
}

/** Format the user-facing display id, e.g. "CL-9013/2". */
export function claimDisplayId(claim: Pick<ClaimRecord, "groupId" | "subIndex">): string {
  return `${claim.groupId}/${claim.subIndex}`;
}

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  open: "Åben",
  in_progress: "Gemt / ikke afsendt",
  waiting: "Afventer accept",
  approved: "Godkendt af Timan",
  dealer_in_progress: "I gang hos forhandler",
  awaiting_timan_close: "Afventer Timan afslutning",
  awaiting_timan_comment: "Afventer Timan kommentar",
  rejected: "Afvist",
  closed: "Lukket",
};

/** Tailwind classes for the status pill, keyed by status. */
export const CLAIM_STATUS_PILL: Record<ClaimStatus, string> = {
  open: "bg-blue-50 text-blue-700",
  in_progress: "bg-slate-100 text-slate-700",
  waiting: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  dealer_in_progress: "bg-indigo-50 text-indigo-700",
  awaiting_timan_close: "bg-purple-50 text-purple-700",
  awaiting_timan_comment: "bg-orange-50 text-orange-700",
  rejected: "bg-red-50 text-red-700",
  closed: "bg-slate-100 text-slate-600",
};

/**
 * Whether the dealer is allowed to fully edit the claim form in this status.
 * Editable: in_progress (draft), waiting (Afventer accept).
 * After Timan approval the dealer is locked out of all claim data.
 */
export function isClaimEditable(status: ClaimStatus): boolean {
  return status === "in_progress" || status === "waiting";
}

/** Statuses that require Timan Admin attention because of a dealer comment. */
export const TIMAN_NEEDS_ATTENTION_STATUSES: ClaimStatus[] = [
  "awaiting_timan_comment",
  "awaiting_timan_close",
];

/** True if the claim should display a notification badge to Timan Admin. */
export function claimNeedsTimanAttention(claim: ClaimRecord): boolean {
  if (TIMAN_NEEDS_ATTENTION_STATUSES.includes(claim.status)) return true;
  // Dealer left a comment on a rejected claim — Timan should see the icon.
  if (claim.status === "rejected" && (claim.dealerComments?.length ?? 0) > 0) {
    return true;
  }
  return false;
}

const NORDIC_DEALER = "Nordic Machinery Aps";

// Entries may omit groupId/subIndex; they are backfilled below so each
// standalone claim becomes its own single-machine group.
type SeedClaim = Omit<ClaimRecord, "groupId" | "subIndex"> &
  Partial<Pick<ClaimRecord, "groupId" | "subIndex">>;
// Demo claims removed — start with an empty store. Real claims are added
// via createDealerClaim() at runtime.
const MOCK: SeedClaim[] = [];


// Backfill standalone records (no explicit groupId): each becomes its own
// single-machine group where groupId == id and subIndex == 1.
for (const c of MOCK) {
  if (!c.groupId) {
    c.groupId = c.id;
    c.subIndex = 1;
  }
}

// Normalized array — every entry now satisfies the full ClaimRecord shape.
const RECORDS: ClaimRecord[] = MOCK as ClaimRecord[];

export function getAllClaims(): ClaimRecord[] {
  return RECORDS;
}

export function getClaimById(id: string): ClaimRecord | undefined {
  return RECORDS.find((c) => c.id === id);
}

/**
 * Generate the next claim number on the format `CL-YYYY-NNNN`, where NNNN
 * is a 4-digit zero-padded sequence number that is unique within the
 * current calendar year. The dealer never types the number manually — the
 * Claim form auto-generates it when opening "Ny claim".
 */
export function generateClaimNumber(): string {
  const year = new Date().getFullYear();
  const prefix = `CL-${year}-`;
  let max = 0;
  for (const c of RECORDS) {
    if (c.groupId.startsWith(prefix)) {
      const tail = c.groupId.slice(prefix.length);
      const n = parseInt(tail, 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  const next = (max + 1).toString().padStart(4, "0");
  return `${prefix}${next}`;
}

/**
 * Persist a brand-new dealer claim into the in-memory store.
 *
 * - `groupId` becomes the claim's auto-generated number (e.g. `CL-2026-0001`).
 * - `subIndex` is always 1 for a fresh case (grouped/connected machines are
 *   added separately via {@link addConnectedClaim}).
 * - `status` controls draft vs activated:
 *     - `in_progress` → "Gem til senere redigering" (still editable by dealer)
 *     - `waiting`     → "Aktiver claim og afvent Timan"
 */
export function createDealerClaim(args: {
  groupId: string;
  warrantyNo: string;
  status: Extract<ClaimStatus, "in_progress" | "waiting">;
  detail: ClaimDetail;
  totalPrice: number;
}): ClaimRecord {
  const today = new Date().toISOString().slice(0, 10);
  const titleSeed =
    args.detail.faultDesc.trim().split(/\r?\n/)[0]?.slice(0, 80) ||
    `Reklamation ${args.detail.machineType || ""}`.trim();
  const created: ClaimRecord = {
    id: `${args.groupId}-1`,
    groupId: args.groupId,
    subIndex: 1,
    warrantyNo: args.warrantyNo || args.groupId,
    title: titleSeed,
    dealer: args.detail.dealer,
    country: args.detail.dealerCountry,
    customer: args.detail.owner,
    machineType: args.detail.machineType,
    serial: args.detail.serialNo,
    createdAt: today,
    damageDate: args.detail.damageDate || today,
    approvedDate: null,
    totalPrice: Math.round(args.totalPrice),
    status: args.status,
    detail: args.detail,
  };
  RECORDS.push(created);
  return created;
}

/**
 * True when the claim is part of a multi-machine grouped case (has siblings).
 */
export function isClaimGrouped(claim: Pick<ClaimRecord, "groupId">): boolean {
  return RECORDS.filter((c) => c.groupId === claim.groupId).length > 1;
}

/**
 * All claims that share a main-case number (groupId), sorted by sub-index.
 * For a standalone claim this returns just that single record.
 */
export function getGroupClaims(groupId: string): ClaimRecord[] {
  return RECORDS.filter((c) => c.groupId === groupId).sort(
    (a, b) => a.subIndex - b.subIndex,
  );
}

/**
 * Create a new connected claim under the same main case as `sourceId`,
 * copying common dealer/owner/machine-type/dates/description data from the
 * source so the dealer doesn't have to retype everything. Per-machine fields
 * (serialNo, hours) are intentionally cleared so the dealer must fill them
 * in for the new machine. Returns the newly created record.
 */
export function addConnectedClaim(sourceId: string): ClaimRecord | undefined {
  const source = RECORDS.find((c) => c.id === sourceId);
  if (!source) return undefined;
  const siblings = getGroupClaims(source.groupId);
  const nextIndex = siblings.reduce((max, c) => Math.max(max, c.subIndex), 0) + 1;
  const newId = `${source.groupId}-${nextIndex}`;
  const today = new Date().toISOString().slice(0, 10);
  const created: ClaimRecord = {
    id: newId,
    groupId: source.groupId,
    subIndex: nextIndex,
    warrantyNo: source.warrantyNo,
    title: source.title,
    dealer: source.dealer,
    country: source.country,
    customer: source.customer,
    machineType: source.machineType,
    serial: "",
    createdAt: today,
    damageDate: source.damageDate,
    approvedDate: null,
    totalPrice: 0,
    status: "waiting",
    detail: {
      ...source.detail,
      // Per-machine fields the dealer must review/update:
      serialNo: "",
      hours: "",
      approvedDate: "",
      // Reset price-overview fields for the new machine.
      laborHours: "0",
      drivingKm: "0",
      parts: source.detail.parts.map((p) => ({ ...p })),
    },
  };
  RECORDS.push(created);
  return created;
}

/**
 * Persist Timan-Admin-only changes back to the in-memory mock store.
 * Updates the admin comment plus the editable price-overview fields
 * (working hours, driving km, total price). When the claim is already
 * past Timan approval and a tracked field actually changes value,
 * appends entries to the audit log so the dealer can see what changed.
 * Returns the updated record or undefined if not found.
 */
export function updateAdminFields(
  id: string,
  fields: {
    adminComment?: string;
    laborHours?: string;
    drivingKm?: string;
    totalPrice?: number;
  },
  /** Display name for the audit log entry, e.g. "Timan Admin". */
  changedBy = "Timan Admin",
): ClaimRecord | undefined {
  const claim = RECORDS.find((c) => c.id === id);
  if (!claim) return undefined;
  const trackAudit = isPastApproval(claim.status);
  const log = (field: string, oldValue: string, newValue: string) => {
    if (oldValue === newValue) return;
    if (!claim.auditLog) claim.auditLog = [];
    claim.auditLog.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      by: changedBy,
      field,
      oldValue,
      newValue,
    });
  };
  if (fields.adminComment !== undefined) claim.adminComment = fields.adminComment;
  if (fields.laborHours !== undefined) {
    if (trackAudit) log("Arbejdstimer", claim.detail.laborHours, fields.laborHours);
    claim.detail.laborHours = fields.laborHours;
  }
  if (fields.drivingKm !== undefined) {
    if (trackAudit) log("Kørte km", claim.detail.drivingKm, fields.drivingKm);
    claim.detail.drivingKm = fields.drivingKm;
  }
  if (fields.totalPrice !== undefined) {
    if (trackAudit) log("Samlet pris", String(claim.totalPrice), String(fields.totalPrice));
    claim.totalPrice = fields.totalPrice;
  }
  return claim;
}

/**
 * True once Timan has approved the claim — i.e. the dealer is locked out
 * and any later edits made by Timan must appear in the audit log.
 */
export function isPastApproval(status: ClaimStatus): boolean {
  return (
    status === "approved" ||
    status === "dealer_in_progress" ||
    status === "awaiting_timan_close" ||
    status === "awaiting_timan_comment" ||
    status === "rejected" ||
    status === "closed"
  );
}

/**
 * Mutate the claim status. Used by both Dealer and Timan workflows.
 * Returns the updated record or undefined if not found.
 */
export function setClaimStatus(id: string, status: ClaimStatus): ClaimRecord | undefined {
  const claim = RECORDS.find((c) => c.id === id);
  if (!claim) return undefined;
  claim.status = status;
  if (status === "approved" && !claim.approvedDate) {
    claim.approvedDate = new Date().toISOString().slice(0, 10);
  }
  return claim;
}

/**
 * Append a dealer comment. Used by the "Ikke accepteret" / disagreement
 * flow and on rejected claims so the dealer can reply to Timan.
 */
export function addDealerComment(
  id: string,
  text: string,
  author = "Forhandler",
): ClaimRecord | undefined {
  const claim = RECORDS.find((c) => c.id === id);
  if (!claim) return undefined;
  if (!claim.dealerComments) claim.dealerComments = [];
  claim.dealerComments.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    author,
    text: text.trim(),
  });
  return claim;
}

export function getDealerClaims(dealerName: string): ClaimRecord[] {
  if (!dealerName) return RECORDS;
  const needle = dealerName.toLowerCase();
  const scoped = RECORDS.filter((c) => c.dealer.toLowerCase() === needle);
  // In preview, if the current dealer has no records yet, fall back to the
  // demo dealer so the page is not empty.
  return scoped.length > 0 ? scoped : RECORDS.filter((c) => c.dealer === NORDIC_DEALER);
}

export interface DealerClaimsSummary {
  total: number;
  open: number; // open + waiting + in_progress
  approved: number;
  rejected: number;
  latest: ClaimRecord[];
}

const OPEN_STATUSES: ClaimStatus[] = [
  "open",
  "in_progress",
  "waiting",
  "approved",
  "dealer_in_progress",
  "awaiting_timan_close",
  "awaiting_timan_comment",
];

export function summarizeDealerClaims(records: ClaimRecord[]): DealerClaimsSummary {
  const open = records.filter((r) => OPEN_STATUSES.includes(r.status)).length;
  const approved = records.filter((r) => r.status === "approved").length;
  const rejected = records.filter((r) => r.status === "rejected").length;
  const latest = [...records]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
  return { total: records.length, open, approved, rejected, latest };
}

export interface AdminClaimsSummary {
  total: number;
  open: number;
  approved: number;
  totalAmount: number;
}

export function summarizeAdminClaims(records: ClaimRecord[]): AdminClaimsSummary {
  const open = records.filter((r) => OPEN_STATUSES.includes(r.status)).length;
  const approved = records.filter((r) => r.status === "approved").length;
  const totalAmount = records.reduce((sum, r) => sum + (r.totalPrice || 0), 0);
  return { total: records.length, open, approved, totalAmount };
}

export function formatDkk(amount: number): string {
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  }).format(amount);
}
