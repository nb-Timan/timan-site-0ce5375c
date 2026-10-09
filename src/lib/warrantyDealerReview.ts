export interface WarrantyReviewCandidate {
  dealer_account_id: string;
  company_name: string;
  account_number: string | null;
  score: number;
}

export interface WarrantyReviewRow {
  sharepoint_item_id: string;
  dealer_name_snapshot: string;
  source_dealer_name_raw?: string;
  machine_serial_raw?: string;
  machine_serial_number?: string;
  machine_model?: string;
}

export interface WarrantyReviewEntry {
  sharepoint_item_id: string;
  dealer_name_snapshot: string;
  source_dealer_name_raw?: string;
  normalized_dealer_name?: string;
  warranty_row?: WarrantyReviewRow;
  candidates?: WarrantyReviewCandidate[];
}

export interface WarrantyReviewSourceValue {
  value: string;
  count: number;
}

export interface PendingWarrantyReviewGroup {
  key: string;
  bucket: "needs_review" | "unmatched";
  approval_source_name: string;
  normalized_dealer_name: string;
  row_count: number;
  rows: WarrantyReviewRow[];
  raw_source_values: WarrantyReviewSourceValue[];
  candidates: WarrantyReviewCandidate[];
}

function rowFor(entry: WarrantyReviewEntry): WarrantyReviewRow {
  return entry.warranty_row ?? {
    sharepoint_item_id: entry.sharepoint_item_id,
    dealer_name_snapshot: entry.dealer_name_snapshot,
    source_dealer_name_raw: entry.source_dealer_name_raw ?? entry.dealer_name_snapshot,
  };
}

function sourceValueFor(entry: WarrantyReviewEntry): string {
  return entry.source_dealer_name_raw ?? entry.warranty_row?.source_dealer_name_raw ?? entry.dealer_name_snapshot ?? "";
}

function mergeCandidates(
  current: WarrantyReviewCandidate[],
  incoming: WarrantyReviewCandidate[] = [],
): WarrantyReviewCandidate[] {
  const byDealer = new Map(current.map((candidate) => [candidate.dealer_account_id, candidate]));
  for (const candidate of incoming) {
    const existing = byDealer.get(candidate.dealer_account_id);
    if (!existing || candidate.score > existing.score) byDealer.set(candidate.dealer_account_id, { ...candidate });
  }
  return Array.from(byDealer.values()).sort((a, b) => b.score - a.score);
}

export function buildWarrantyReviewGroups(
  needsReview: WarrantyReviewEntry[],
  unmatched: WarrantyReviewEntry[],
): PendingWarrantyReviewGroup[] {
  const groups = new Map<string, PendingWarrantyReviewGroup>();

  const add = (entry: WarrantyReviewEntry, bucket: PendingWarrantyReviewGroup["bucket"]) => {
    const normalizedName = entry.normalized_dealer_name || entry.dealer_name_snapshot.trim().toLocaleLowerCase();
    const key = `${bucket}::${normalizedName}`;
    const sourceValue = sourceValueFor(entry);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        bucket,
        approval_source_name: entry.dealer_name_snapshot,
        normalized_dealer_name: normalizedName,
        row_count: 1,
        rows: [rowFor(entry)],
        raw_source_values: [{ value: sourceValue, count: 1 }],
        candidates: mergeCandidates([], entry.candidates),
      });
      return;
    }

    existing.row_count += 1;
    existing.rows.push(rowFor(entry));
    existing.candidates = mergeCandidates(existing.candidates, entry.candidates);
    const source = existing.raw_source_values.find((value) => value.value === sourceValue);
    if (source) source.count += 1;
    else existing.raw_source_values.push({ value: sourceValue, count: 1 });
  };

  for (const entry of needsReview ?? []) add(entry, "needs_review");
  for (const entry of unmatched ?? []) add(entry, "unmatched");

  return Array.from(groups.values()).sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket === "needs_review" ? -1 : 1;
    return b.row_count - a.row_count;
  });
}

export function formatWarrantyMatchScore(score: number): string {
  return new Intl.NumberFormat("da-DK", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(score);
}
