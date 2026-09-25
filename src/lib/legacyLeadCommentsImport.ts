export const LEGACY_LEAD_COMMENT_SOURCE = 'legacy_leads_csv';

export interface LegacyCommentCsvRow {
  ItemId?: string | null;
  CommentId?: string | null;
  CommentCreatedDate?: string | null;
  CommentText?: string | null;
}

export interface LegacyLeadImportTarget {
  id: string;
  lead_no: number;
  notes?: string | null;
}

export interface LegacyCommentCandidate {
  itemId: string;
  commentId: string;
  sourceKey: string;
  createdAt: string;
  text: string;
}

export interface LegacyCommentImportPlan {
  comments: LegacyCommentCandidate[];
  eligible: Array<LegacyCommentCandidate & { leadId: string; leadNo: number }>;
  skippedEmpty: number;
  invalidDates: LegacyCommentCsvRow[];
  invalidIdentifiers: LegacyCommentCsvRow[];
  duplicateSourceKeys: string[];
  alreadyImported: string[];
  unmatchedItemIds: string[];
  ambiguousItemIds: string[];
}

export function extractLegacyLeadSourceId(notes: string | null | undefined): string | null {
  return notes?.match(/Kilde-ID:\s*(\d+)/i)?.[1] ?? null;
}

export function legacyCommentSourceKey(itemId: string, commentId: string): string {
  return `${itemId}:${commentId}`;
}

export function prepareLegacyCommentCandidates(rows: LegacyCommentCsvRow[]): Pick<
  LegacyCommentImportPlan,
  'comments' | 'skippedEmpty' | 'invalidDates' | 'invalidIdentifiers' | 'duplicateSourceKeys'
> {
  const comments: LegacyCommentCandidate[] = [];
  const invalidDates: LegacyCommentCsvRow[] = [];
  const invalidIdentifiers: LegacyCommentCsvRow[] = [];
  const duplicateSourceKeys: string[] = [];
  const seen = new Set<string>();
  let skippedEmpty = 0;

  for (const row of rows) {
    const text = row.CommentText ?? '';
    if (!text.trim()) {
      skippedEmpty += 1;
      continue;
    }

    const itemId = row.ItemId?.trim() ?? '';
    const commentId = row.CommentId?.trim() ?? '';
    if (!/^\d+$/.test(itemId) || !/^\d+$/.test(commentId)) {
      invalidIdentifiers.push(row);
      continue;
    }

    const timestamp = Date.parse(row.CommentCreatedDate?.trim() ?? '');
    if (Number.isNaN(timestamp)) {
      invalidDates.push(row);
      continue;
    }

    const sourceKey = legacyCommentSourceKey(itemId, commentId);
    if (seen.has(sourceKey)) {
      duplicateSourceKeys.push(sourceKey);
      continue;
    }
    seen.add(sourceKey);
    comments.push({
      itemId,
      commentId,
      sourceKey,
      createdAt: new Date(timestamp).toISOString(),
      text,
    });
  }

  return { comments, skippedEmpty, invalidDates, invalidIdentifiers, duplicateSourceKeys };
}

export function planLegacyLeadCommentImport(
  rows: LegacyCommentCsvRow[],
  leads: LegacyLeadImportTarget[],
  importedSourceKeys: ReadonlySet<string> = new Set(),
): LegacyCommentImportPlan {
  const prepared = prepareLegacyCommentCandidates(rows);
  const targetsBySourceId = new Map<string, LegacyLeadImportTarget[]>();

  for (const lead of leads) {
    if (lead.lead_no < 5000) continue;
    const sourceId = extractLegacyLeadSourceId(lead.notes);
    if (!sourceId) continue;
    const targets = targetsBySourceId.get(sourceId) ?? [];
    targets.push(lead);
    targetsBySourceId.set(sourceId, targets);
  }

  const unmatchedItemIds = new Set<string>();
  const ambiguousItemIds = new Set<string>();
  const alreadyImported: string[] = [];
  const eligible: LegacyCommentImportPlan['eligible'] = [];

  for (const comment of prepared.comments) {
    const targets = targetsBySourceId.get(comment.itemId) ?? [];
    if (targets.length === 0) {
      unmatchedItemIds.add(comment.itemId);
      continue;
    }
    if (targets.length > 1) {
      ambiguousItemIds.add(comment.itemId);
      continue;
    }
    if (importedSourceKeys.has(comment.sourceKey)) {
      alreadyImported.push(comment.sourceKey);
      continue;
    }
    eligible.push({ ...comment, leadId: targets[0].id, leadNo: targets[0].lead_no });
  }

  return {
    ...prepared,
    eligible,
    alreadyImported,
    unmatchedItemIds: [...unmatchedItemIds].sort((a, b) => Number(a) - Number(b)),
    ambiguousItemIds: [...ambiguousItemIds].sort((a, b) => Number(a) - Number(b)),
  };
}

export function sortLegacyCommentsNewestFirst<T extends Pick<LegacyCommentCandidate, 'createdAt'>>(rows: T[]): T[] {
  return [...rows].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
