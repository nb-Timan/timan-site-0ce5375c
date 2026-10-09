import { describe, expect, it } from 'vitest';
import {
  LEGACY_LEAD_COMMENT_SOURCE,
  extractLegacyLeadSourceId,
  planLegacyLeadCommentImport,
  sortLegacyCommentsNewestFirst,
  type LegacyCommentCsvRow,
} from '@/lib/legacyLeadCommentsImport';

const rows: LegacyCommentCsvRow[] = [
  { ItemId: '3378', CommentId: '1', CommentCreatedDate: '2025-01-02T09:00:00Z', CommentText: 'First historical note' },
  { ItemId: '3378', CommentId: '2', CommentCreatedDate: '2025-04-02T09:00:00Z', CommentText: 'Second historical note' },
];

const gLead = { id: 'g-lead', lead_no: 5000, notes: 'Historisk import\nKilde-ID: 3378' };

describe('legacy G-lead comment import planning', () => {
  it('matches CSV ItemId only to the G-lead Kilde-ID and imports every comment', () => {
    const plan = planLegacyLeadCommentImport(rows, [gLead]);
    expect(extractLegacyLeadSourceId(gLead.notes)).toBe('3378');
    expect(plan.eligible).toHaveLength(2);
    expect(plan.eligible.every((entry) => entry.leadId === gLead.id)).toBe(true);
  });

  it('excludes L-leads and unmatched ItemIds without guessing from titles', () => {
    const plan = planLegacyLeadCommentImport(rows, [
      { id: 'l-lead', lead_no: 1234, notes: 'Kilde-ID: 3378' },
      { id: 'similar-g-lead', lead_no: 5001, notes: 'Kilde-ID: 9999' },
    ]);
    expect(plan.eligible).toHaveLength(0);
    expect(plan.unmatchedItemIds).toEqual(['3378']);
  });

  it('rejects ambiguous source matches', () => {
    const plan = planLegacyLeadCommentImport(rows, [gLead, { ...gLead, id: 'duplicate-g-lead', lead_no: 5001 }]);
    expect(plan.eligible).toHaveLength(0);
    expect(plan.ambiguousItemIds).toEqual(['3378']);
  });

  it('skips empty comments and invalid dates while preserving exact valid text and timestamps', () => {
    const plan = planLegacyLeadCommentImport([
      ...rows,
      { ItemId: '3378', CommentId: '3', CommentCreatedDate: '2025-05-01T10:00:00Z', CommentText: '   ' },
      { ItemId: '3378', CommentId: '4', CommentCreatedDate: 'not-a-date', CommentText: 'Invalid date' },
      { ItemId: '3378', CommentId: '5', CommentCreatedDate: '2025-05-01T10:00:00Z', CommentText: '  Preserve spacing  ' },
    ], [gLead]);
    expect(plan.skippedEmpty).toBe(1);
    expect(plan.invalidDates).toHaveLength(1);
    expect(plan.eligible.at(-1)).toMatchObject({
      createdAt: '2025-05-01T10:00:00.000Z',
      text: '  Preserve spacing  ',
    });
  });

  it('deduplicates by ItemId plus CommentId and makes a second run insert nothing', () => {
    const duplicateRows = [...rows, { ...rows[0] }];
    const first = planLegacyLeadCommentImport(duplicateRows, [gLead]);
    expect(first.duplicateSourceKeys).toEqual(['3378:1']);
    expect(first.eligible).toHaveLength(2);

    const second = planLegacyLeadCommentImport(rows, [gLead], new Set(first.eligible.map((entry) => entry.sourceKey)));
    expect(second.eligible).toHaveLength(0);
    expect(second.alreadyImported).toEqual(['3378:1', '3378:2']);
  });

  it('keeps provenance rollback-safe without importing legacy author fields', () => {
    const plan = planLegacyLeadCommentImport([{
      ...rows[0],
      CommentAuthorName: 'Legacy Author',
      CommentAuthorEmail: 'legacy@example.test',
    } as LegacyCommentCsvRow], [gLead]);
    expect(LEGACY_LEAD_COMMENT_SOURCE).toBe('legacy_leads_csv');
    expect(plan.eligible[0].sourceKey).toBe('3378:1');
    expect(plan.eligible[0]).not.toHaveProperty('CommentAuthorName');
    expect(plan.eligible[0]).not.toHaveProperty('CommentAuthorEmail');
  });

  it('sorts imported and modern chronology newest first', () => {
    expect(sortLegacyCommentsNewestFirst([
      { ...planEntry('old'), createdAt: '2025-01-01T00:00:00.000Z' },
      { ...planEntry('new'), createdAt: '2026-01-01T00:00:00.000Z' },
    ]).map((entry) => entry.commentId)).toEqual(['new', 'old']);
  });
});

function planEntry(commentId: string) {
  return { itemId: '3378', commentId, sourceKey: `3378:${commentId}`, text: commentId };
}
