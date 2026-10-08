export const FABRIC_LOAN_FIELDS = [
  'asset_instance_id', 'instance_ordinal', 'company', 'account_number', 'order_number', 'line_number',
  'item_number', 'item_name', 'line_text', 'serial_number',
  'warehouse_location_code', 'warehouse_location_name', 'inventory_qty', 'reserved_qty', 'stock_last_changed',
  'source_row_number', 'classification', 'review_required', 'review_reason', 'identity_conflict',
] as const;

export type FabricLoanRow = Record<typeof FABRIC_LOAN_FIELDS[number], string | number | boolean | null>;

const classifications = new Set(['LOAN_CANDIDATE', 'REVIEW_REQUIRED', 'IDENTITY_CONFLICT', 'SOLD', 'EXCLUDED']);
const numericFields = new Set(['instance_ordinal', 'line_number', 'inventory_qty', 'reserved_qty', 'source_row_number']);

// Do not infer missing fields, classifications or account/order references from product text.
export function validateFabricLoanSnapshot(rows: unknown, columns: string[]): FabricLoanRow[] {
  if (!Array.isArray(rows) || rows.length > 10000 || columns.length !== FABRIC_LOAN_FIELDS.length
    || FABRIC_LOAN_FIELDS.some((key) => !columns.includes(key))) throw new Error('INVALID_SNAPSHOT');
  const identities = new Set<string>();
  const serializedIdentities = new Set<string>();
  return rows.map((input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_SNAPSHOT');
    const row = input as Record<string, unknown>;
    if (Object.keys(row).length !== FABRIC_LOAN_FIELDS.length) throw new Error('INVALID_SNAPSHOT');
    for (const key of FABRIC_LOAN_FIELDS) {
      if (!(key in row)) throw new Error('INVALID_SNAPSHOT');
      const value = row[key];
      if (key === 'review_required' || key === 'identity_conflict') {
        if (typeof value !== 'boolean') throw new Error('INVALID_SNAPSHOT');
      } else if (numericFields.has(key)) {
        if (value !== null && !((typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value))) && Number.isFinite(Number(value)))) throw new Error('INVALID_SNAPSHOT');
      } else if (value !== null && typeof value !== 'string') throw new Error('INVALID_SNAPSHOT');
    }
    for (const key of ['asset_instance_id', 'company', 'item_number', 'warehouse_location_code']) {
      if (typeof row[key] !== 'string' || !(row[key] as string).trim()) throw new Error('INVALID_SNAPSHOT');
    }
    if (!Number.isInteger(Number(row.instance_ordinal)) || Number(row.instance_ordinal) < 1
      || Number(row.instance_ordinal) > 10000) throw new Error('INVALID_SNAPSHOT');
    if (row.serial_number !== null && (typeof row.serial_number !== 'string' || !row.serial_number.trim())) {
      throw new Error('INVALID_SNAPSHOT');
    }
    if (!classifications.has(String(row.classification))) throw new Error('INVALID_SNAPSHOT');
    if (row.stock_last_changed !== null && !Number.isFinite(Date.parse(String(row.stock_last_changed)))) throw new Error('INVALID_SNAPSHOT');
    const identity = String(row.asset_instance_id).trim();
    if (identities.has(identity)) throw new Error('INVALID_SNAPSHOT');
    identities.add(identity);
    if (row.serial_number !== null) {
      const serializedIdentity = JSON.stringify([String(row.company).trim(), row.serial_number.trim().toUpperCase()]);
      if (serializedIdentities.has(serializedIdentity)) throw new Error('INVALID_SNAPSHOT');
      serializedIdentities.add(serializedIdentity);
    }
    return Object.fromEntries(FABRIC_LOAN_FIELDS.map((key) => [key, row[key]])) as FabricLoanRow;
  });
}

export interface FabricSyncDependencies {
  begin: () => Promise<string | null>;
  read: () => Promise<{ rows: unknown; columns: string[]; sourceAsOf: string }>;
  publish: (runId: string, sourceAsOf: string, rows: FabricLoanRow[]) => Promise<void>;
  fail: (runId: string, code: string) => Promise<void>;
}

export async function runFabricLoanSync(deps: FabricSyncDependencies) {
  const runId = await deps.begin();
  if (!runId) return { status: 'RUNNING' as const };
  try {
    const snapshot = await deps.read();
    if (!Number.isFinite(Date.parse(snapshot.sourceAsOf))) throw new Error('INVALID_SNAPSHOT');
    const rows = validateFabricLoanSnapshot(snapshot.rows, snapshot.columns);
    await deps.publish(runId, snapshot.sourceAsOf, rows);
    return { status: 'SUCCEEDED' as const, rowCount: rows.length };
  } catch (cause) {
    const code = cause instanceof Error && cause.message === 'INVALID_SNAPSHOT' ? 'INVALID_SNAPSHOT' : 'SOURCE_UNAVAILABLE';
    await deps.fail(runId, code);
    // Raw driver errors can contain connection information. Never return or log them.
    throw new Error(code);
  }
}
