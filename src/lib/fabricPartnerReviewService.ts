import { supabase } from './supabase';
import type { ReviewContext, ReviewDraft, ReviewParent, ReviewRow, PartnerReviewRow } from './fabricPartnerReview';

export interface PartnerReviewPreview {
  reviews: ReviewRow[];
  contexts: ReviewContext[];
  parents: ReviewParent[];
}

// RPCs are Backend-gated; normal clients never receive direct review-table access.
export async function loadPartnerReviews(): Promise<PartnerReviewPreview> {
  const { data, error } = await supabase.rpc('fabric_partner_review_preview');
  if (error) throw error;
  return data as unknown as PartnerReviewPreview;
}

export async function savePartnerReview(row: PartnerReviewRow, draft: ReviewDraft, requestId: string) {
  const { data, error } = await supabase.rpc('fabric_partner_review_save', {
    p_account_number: row.account_number,
    p_expected_version: row.review?.version ?? 0,
    p_expected_source_fingerprint: row.context?.source_fingerprint ?? null,
    p_expected_portal_fingerprint: row.context?.portal_fingerprint ?? null,
    p_request_id: requestId,
    p_status: draft.status,
    p_proposed_partner_type: draft.proposed_partner_type,
    p_parent_dealer_id: draft.parent_dealer_id,
    p_comment: draft.comment,
    p_fields: draft.fields,
  });
  if (error) throw error;
  return data as string;
}

export function partnerReviewError(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (/VERSION_CONFLICT|SOURCE_CHANGED/.test(message)) return 'Oplysningerne er ændret. Genindlæs sammenligningen og gennemgå kontoen igen.';
  if (/BACKEND_ONLY/.test(message)) return 'Kun Timan Backend må gemme reviewbeslutninger.';
  if (/SYNC_BUSY/.test(message)) return 'Fabric synkroniserer lige nu. Prøv at gemme igen om lidt.';
  if (/TYPE_CONFLICT/.test(message)) return 'Typekonflikten skal afklares før godkendelse.';
  if (/PARENT_REQUIRED|INVALID_PARENT/.test(message)) return 'Vælg en gyldig overordnet forhandler.';
  if (/ADDRESS_REQUIRES/.test(message)) return 'C5-postnummer og by kræver afklaring.';
  return 'Beslutningen kunne ikke gemmes. Genindlæs og prøv igen.';
}
