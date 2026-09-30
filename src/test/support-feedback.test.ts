import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchSupportAnswerFeedback,
  isFeedbackEligibleMessage,
  saveSupportAnswerFeedback,
} from '@/lib/supportFeedbackService';

const mocks = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn();
  chain.upsert = vi.fn(() => chain);
  chain.single = vi.fn();
  return { chain, from: vi.fn(() => chain) };
});

vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }));

const responseId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const conversationId = '33333333-3333-4333-8333-333333333333';
const row = {
  id: '44444444-4444-4444-8444-444444444444',
  conversation_id: conversationId,
  response_id: responseId,
  submitted_by_user_id: userId,
  sentiment: 'POSITIVE' as const,
  reason_code: null,
  created_at: '2026-09-30T00:00:00.000Z',
  updated_at: '2026-09-30T00:00:00.000Z',
};

describe('Support answer feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chain.select.mockImplementation(() => mocks.chain);
    mocks.chain.eq.mockImplementation(() => mocks.chain);
    mocks.chain.upsert.mockImplementation(() => mocks.chain);
  });

  it('only exposes feedback for completed canonical AI responses', () => {
    expect(isFeedbackEligibleMessage({
      id: responseId, role: 'assistant', content: 'Svar', timestamp: '', status: 'sent', answerStatus: 'ACCEPTED',
    })).toBe(true);
    expect(isFeedbackEligibleMessage({
      id: responseId, role: 'user', content: 'Spørgsmål', timestamp: '', status: 'sent',
    })).toBe(false);
    expect(isFeedbackEligibleMessage({
      id: 'support-action-local', role: 'assistant', content: 'Vælg', timestamp: '', status: 'sent',
      actionCard: { kind: 'choices', title: 'Vælg' },
    })).toBe(false);
  });

  it('loads the authenticated user feedback by exact response relation', async () => {
    mocks.chain.in.mockResolvedValueOnce({ data: [row], error: null });
    await expect(fetchSupportAnswerFeedback([responseId])).resolves.toEqual({ [responseId]: row });
    expect(mocks.chain.in).toHaveBeenCalledWith('response_id', [responseId]);
  });

  it('upserts one canonical state and clears a stale negative reason on positive feedback', async () => {
    mocks.chain.single.mockResolvedValueOnce({ data: row, error: null });
    await saveSupportAnswerFeedback({ conversationId, responseId, sentiment: 'POSITIVE' });
    expect(mocks.chain.upsert).toHaveBeenCalledWith(expect.objectContaining({
      conversation_id: conversationId,
      response_id: responseId,
      sentiment: 'POSITIVE',
      reason_code: null,
    }), { onConflict: 'response_id,submitted_by_user_id' });
  });

  it('persists an optional canonical negative reason', async () => {
    mocks.chain.single.mockResolvedValueOnce({ data: { ...row, sentiment: 'NEGATIVE', reason_code: 'NOT_RELEVANT' }, error: null });
    await saveSupportAnswerFeedback({
      conversationId, responseId, sentiment: 'NEGATIVE', reasonCode: 'NOT_RELEVANT',
    });
    expect(mocks.chain.upsert).toHaveBeenCalledWith(expect.objectContaining({
      sentiment: 'NEGATIVE', reason_code: 'NOT_RELEVANT',
    }), { onConflict: 'response_id,submitted_by_user_id' });
  });
});
