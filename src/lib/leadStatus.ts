/**
 * Shared lead-status logic.
 *
 * Source of truth for what status, probability and "is closed" mean for a
 * CRM lead. All CRM views must read status through these helpers — never
 * directly off `pipeline_stage` (which is now legacy/fallback only).
 *
 * Rule:
 *   1. If `next_activity` is set, derive status / probability from it.
 *   2. Otherwise fall back to the legacy `pipeline_stage` value by first
 *      mapping it to an equivalent next_activity, then deriving from that.
 *
 * No bulk writes are performed — old rows keep their pipeline_stage in
 * Supabase, they are just *interpreted* through this helper at read time.
 */

import type { CrmLead, PipelineStage } from "@/lib/crmLeadsService";

// ---------- Display buckets (Danish UI labels) ----------

export type LeadDisplayStatus =
  | "Lead"
  | "Demo planlagt"
  | "Tilbud sendt"
  | "Follow-up"
  | "Vundet"
  | "Tabt";

export const LEAD_DISPLAY_STATUSES: readonly LeadDisplayStatus[] = [
  "Lead",
  "Demo planlagt",
  "Tilbud sendt",
  "Follow-up",
  "Vundet",
  "Tabt",
] as const;

// Closed-with-order / Closed-without-order constants — exported so the
// Won/Lost quick action and tests can reuse the exact strings expected by
// the rest of the system.
export const NEXT_ACTIVITY_WON  = "Closed with order"   as const;
export const NEXT_ACTIVITY_LOST = "Closed without order" as const;
export const NEXT_ACTIVITY_NOT_RELEVANT = "Not relevant" as const;

// ---------- next_activity → status ----------

const NA_TO_STATUS: Record<string, LeadDisplayStatus> = {
  "New lead":                              "Lead",
  "Wants to be contacted":                 "Lead",
  "Lead sent to the dealer":               "Lead",
  "Sales material sent to the customer":   "Lead",
  "Customer requests a demonstration":     "Demo planlagt",
  "Follow-up on leads":                    "Follow-up",
  "Offer sent to the customer":            "Tilbud sendt",
  [NEXT_ACTIVITY_WON]:                     "Vundet",
  [NEXT_ACTIVITY_LOST]:                    "Tabt",
  [NEXT_ACTIVITY_NOT_RELEVANT]:            "Tabt",
};

const NA_TO_PROBABILITY: Record<string, number> = {
  "New lead":                              10,
  "Wants to be contacted":                 15,
  "Lead sent to the dealer":               10,
  "Sales material sent to the customer":   30,
  "Customer requests a demonstration":     50,
  "Follow-up on leads":                    25,
  "Offer sent to the customer":            70,
  [NEXT_ACTIVITY_WON]:                     100,
  [NEXT_ACTIVITY_LOST]:                    0,
  [NEXT_ACTIVITY_NOT_RELEVANT]:            0,
};

// ---------- Legacy pipeline_stage → next_activity (fallback only) ----------

const LEGACY_STAGE_TO_NA: Record<string, string> = {
  Lead:           "Wants to be contacted",
  Qualified:      "Follow-up on leads",
  "Offer sent":   "Offer sent to the customer",
  Negotiation:    "Follow-up on leads",
  Won:            NEXT_ACTIVITY_WON,
  Lost:           NEXT_ACTIVITY_LOST,
};

/**
 * Convert a legacy pipeline_stage value to its closest next_activity
 * equivalent. Used only as fallback for legacy leads that have no
 * next_activity set yet.
 */
export function normalizeLegacyPipelineStageToNextActivity(
  stage: string | null | undefined,
): string | null {
  if (!stage) return null;
  return LEGACY_STAGE_TO_NA[stage] ?? null;
}

/**
 * Resolve the next_activity that should drive a lead's status. Prefers the
 * row's own next_activity; falls back to deriving one from the legacy
 * pipeline_stage so old data still renders consistently.
 */
export function effectiveNextActivity(
  lead: Pick<CrmLead, "next_activity" | "pipeline_stage">,
): string | null {
  if (lead.next_activity && lead.next_activity.trim()) return lead.next_activity;
  return normalizeLegacyPipelineStageToNextActivity(lead.pipeline_stage);
}

// ---------- Public helpers ----------

export function nextActivityToLeadStatus(
  nextActivity: string | null | undefined,
): LeadDisplayStatus {
  if (!nextActivity) return "Lead";
  return NA_TO_STATUS[nextActivity] ?? "Lead";
}

export function nextActivityToProbability(
  nextActivity: string | null | undefined,
): number {
  if (!nextActivity) return 10;
  const v = NA_TO_PROBABILITY[nextActivity];
  return typeof v === "number" ? v : 10;
}

/** Closed = Won / Lost / Not relevant (no longer counts as active lead). */
export function isLeadClosed(
  leadOrActivity:
    | string
    | null
    | undefined
    | Pick<CrmLead, "next_activity" | "pipeline_stage">,
): boolean {
  let na: string | null;
  if (leadOrActivity && typeof leadOrActivity === "object") {
    na = effectiveNextActivity(leadOrActivity);
  } else {
    na = (leadOrActivity as string | null | undefined) ?? null;
  }
  const status = nextActivityToLeadStatus(na);
  return status === "Vundet" || status === "Tabt";
}

/** Single-call helper used by every CRM view. */
export function effectiveLeadStatus(
  lead: Pick<CrmLead, "next_activity" | "pipeline_stage">,
): LeadDisplayStatus {
  return nextActivityToLeadStatus(effectiveNextActivity(lead));
}

export function effectiveLeadProbability(
  lead: Pick<CrmLead, "next_activity" | "pipeline_stage" | "probability">,
): number {
  const na = effectiveNextActivity(lead);
  if (na) return nextActivityToProbability(na);
  // No next_activity AND no legacy stage → keep stored value if present.
  return typeof lead.probability === "number" ? lead.probability : 10;
}

// ---------- Bucket predicates (used to replace old OPEN_STAGES sets) ----------

export function isOpenLead(
  lead: Pick<CrmLead, "next_activity" | "pipeline_stage">,
): boolean {
  const s = effectiveLeadStatus(lead);
  return s !== "Vundet" && s !== "Tabt";
}

export function isWonLead(
  lead: Pick<CrmLead, "next_activity" | "pipeline_stage">,
): boolean {
  return effectiveLeadStatus(lead) === "Vundet";
}

export function isLostLead(
  lead: Pick<CrmLead, "next_activity" | "pipeline_stage">,
): boolean {
  return effectiveLeadStatus(lead) === "Tabt";
}

export function isOfferLead(
  lead: Pick<CrmLead, "next_activity" | "pipeline_stage">,
): boolean {
  return effectiveLeadStatus(lead) === "Tilbud sendt";
}

export function isDemoLead(
  lead: Pick<CrmLead, "next_activity" | "pipeline_stage">,
): boolean {
  return effectiveLeadStatus(lead) === "Demo planlagt";
}

// ---------- Derive a legacy pipeline_stage from current next_activity ----------
// Used when we still need to write to the legacy column for backward
// compatibility (until pipeline_stage is dropped). NEVER read from this.

const STATUS_TO_LEGACY_STAGE: Record<LeadDisplayStatus, PipelineStage> = {
  Lead:           "Lead",
  "Demo planlagt":"Qualified",
  "Follow-up":    "Qualified",
  "Tilbud sendt": "Offer sent",
  Vundet:         "Won",
  Tabt:           "Lost",
};

export function deriveLegacyPipelineStage(
  nextActivity: string | null | undefined,
): PipelineStage {
  return STATUS_TO_LEGACY_STAGE[nextActivityToLeadStatus(nextActivity)];
}
