import { describe, expect, it } from 'vitest';
import {
  EMPTY_SUPPORT_ADMIN_OVERVIEW,
  SUPPORT_GAP_REASONS,
  SUPPORT_KNOWLEDGE_TYPES,
  canTransitionKnowledgeStatus,
  percentage,
} from '@/lib/supportAdminTypes';

describe('Support administration model', () => {
  it('keeps the empty dashboard honest and zero-safe', () => {
    expect(Object.values(EMPTY_SUPPORT_ADMIN_OVERVIEW).every((value) => (
      value === 0
      || value === false
      || value === null
      || (typeof value === 'object' && Object.keys(value).length === 0)
    ))).toBe(true);
    expect(percentage(0, 0)).toBe(0);
    expect(percentage(3, 4)).toBe(75);
  });

  it('models every specified failure reason without inventing provider behavior', () => {
    expect(SUPPORT_GAP_REASONS).toEqual(expect.arrayContaining([
      'NO_RELEVANT_KNOWLEDGE', 'ACCESS_RESTRICTED', 'LOW_CONFIDENCE',
      'AMBIGUOUS_QUESTION', 'MISSING_DOCUMENTATION', 'RETRIEVAL_ERROR',
      'AI_PROVIDER_ERROR', 'OTHER',
    ]));
  });

  it('prepares the required knowledge types', () => {
    expect(SUPPORT_KNOWLEDGE_TYPES).toEqual(expect.arrayContaining([
      'MANUAL_QA', 'TECHNICAL_NOTE', 'MACHINE_INFORMATION', 'DOCUMENT',
      'MANUAL', 'TIMAN_DK_PAGE', 'VIDEO', 'TSB', 'APPROVED_SERVICE_CASE',
    ]));
  });

  it('enforces the human review lifecycle', () => {
    expect(canTransitionKnowledgeStatus('DRAFT', 'REVIEW')).toBe(true);
    expect(canTransitionKnowledgeStatus('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransitionKnowledgeStatus('REVIEW', 'APPROVED')).toBe(true);
    expect(canTransitionKnowledgeStatus('APPROVED', 'ARCHIVED')).toBe(true);
    expect(canTransitionKnowledgeStatus('ARCHIVED', 'APPROVED')).toBe(false);
    expect(canTransitionKnowledgeStatus('ARCHIVED', 'DRAFT')).toBe(true);
  });
});
