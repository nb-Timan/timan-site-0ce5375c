import { supabase } from '@/lib/supabase';
import type { SupportMessage } from '@/lib/supportTypes';

export type SupportFeedbackSentiment = 'POSITIVE' | 'NEGATIVE';
export type SupportFeedbackReason =
  | 'INCORRECT'
  | 'NOT_RELEVANT'
  | 'MISSING_INFORMATION'
  | 'HARD_TO_UNDERSTAND'
  | 'OTHER';

export interface SupportAnswerFeedback {
  id: string;
  conversation_id: string | null;
  response_id: string;
  submitted_by_user_id: string;
  sentiment: SupportFeedbackSentiment;
  reason_code: SupportFeedbackReason | null;
  created_at: string;
  updated_at: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isFeedbackEligibleMessage(message: SupportMessage): boolean {
  return message.role === 'assistant'
    && message.status === 'sent'
    && message.answerStatus !== 'ERROR'
    && UUID_PATTERN.test(message.id);
}

export async function fetchSupportAnswerFeedback(
  responseIds: string[],
): Promise<Record<string, SupportAnswerFeedback>> {
  const canonicalIds = Array.from(new Set(responseIds.filter((id) => UUID_PATTERN.test(id))));
  if (!canonicalIds.length) return {};

  const { data, error } = await supabase
    .from('support_feedback')
    .select('id, conversation_id, response_id, submitted_by_user_id, sentiment, reason_code, created_at, updated_at')
    .in('response_id', canonicalIds);
  if (error) throw error;

  return Object.fromEntries(
    (data || []).filter((row) => row.response_id).map((row) => [row.response_id, row as SupportAnswerFeedback]),
  );
}

export async function saveSupportAnswerFeedback(input: {
  conversationId: string;
  responseId: string;
  sentiment: SupportFeedbackSentiment;
  reasonCode?: SupportFeedbackReason | null;
}): Promise<SupportAnswerFeedback> {
  const { data, error } = await supabase
    .from('support_feedback')
    .upsert({
      conversation_id: input.conversationId,
      response_id: input.responseId,
      sentiment: input.sentiment,
      reason_code: input.sentiment === 'NEGATIVE' ? input.reasonCode || null : null,
      comment: null,
    }, { onConflict: 'response_id,submitted_by_user_id' })
    .select('id, conversation_id, response_id, submitted_by_user_id, sentiment, reason_code, created_at, updated_at')
    .single();
  if (error) throw error;
  return data as SupportAnswerFeedback;
}
