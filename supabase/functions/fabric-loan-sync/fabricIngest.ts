import { FABRIC_LOAN_FIELDS, validateFabricLoanSnapshot, type FabricLoanRow } from '../_shared/fabricLoanSnapshot.ts';

export const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;
const wireFields = [...FABRIC_LOAN_FIELDS, 'serial_number_normalized', 'source_as_of'];
const encoder = new TextEncoder();

// Fabric validates its encrypted REST connection with a read-only Basic-auth probe.
// The actual snapshot endpoint accepts signed requests only, never Basic credentials.
export async function verifyFabricConnection(secret: string | undefined, authorization: string | null): Promise<boolean> {
  if (!secret || secret.length < 32 || !authorization?.startsWith('Basic ') || authorization.length > 2048) return false;
  let decoded: string;
  try { decoded = atob(authorization.slice(6)); } catch { return false; }
  if (!decoded.startsWith('fabric_loans_ingest:')) return false;
  const candidate = decoded.slice('fabric_loans_ingest:'.length);
  const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(secret)));
  const actual = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(candidate)));
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected[index] ^ actual[index];
  return difference === 0;
}

export interface FabricPushSnapshot {
  snapshotId: string;
  sourceAsOf: string;
  rows: FabricLoanRow[];
}

// Sign the exact transmitted bytes, not a reserialized body. The key never crosses the wire.
export async function verifyFabricSignature(secret: string | undefined, signature: string | null,
  timestamp: string | null, body: string, now = Date.now()): Promise<boolean> {
  if (!secret || secret.length < 32 || !signature || !/^[a-f0-9]{64}$/.test(signature)
    || !timestamp || !/^\d{10}$/.test(timestamp) || Math.abs(now - Number(timestamp) * 1000) > 300000) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.match(/../g)!, (pair) => parseInt(pair, 16));
  return crypto.subtle.verify('HMAC', key, bytes, encoder.encode(`${timestamp}.${body}`));
}

export function validateFabricPush(input: unknown, now = Date.now()): FabricPushSnapshot {
  const invalid = () => { throw new Error('INVALID_SNAPSHOT'); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const snapshot = input as Record<string, unknown>;
  if (Object.keys(snapshot).length !== 4
    || !['snapshot_id', 'source_as_of', 'expected_row_count', 'rows'].every((key) => key in snapshot)
    || typeof snapshot.snapshot_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(snapshot.snapshot_id)
    || typeof snapshot.source_as_of !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(snapshot.source_as_of)
    || !Number.isFinite(Date.parse(snapshot.source_as_of))
    || Date.parse(snapshot.source_as_of) < now - 600000 || Date.parse(snapshot.source_as_of) > now + 60000
    || !Array.isArray(snapshot.rows) || !Number.isInteger(snapshot.expected_row_count)
    || snapshot.expected_row_count !== snapshot.rows.length || snapshot.rows.length > 10000) return invalid();
  const rows = snapshot.rows.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
    const row = value as Record<string, unknown>;
    if (Object.keys(row).length !== wireFields.length || !wireFields.every((key) => key in row)
      || Object.values(row).some((field) => typeof field === 'string' && field.length > 2000)
      || row.source_as_of !== snapshot.source_as_of
      || (row.serial_number !== null && typeof row.serial_number !== 'string')
      || row.serial_number_normalized !== (typeof row.serial_number === 'string' ? row.serial_number.trim().toUpperCase() : null)
      || (row.source_row_number !== null && !/^-?\d+$/.test(String(row.source_row_number)))) return invalid();
    return Object.fromEntries(FABRIC_LOAN_FIELDS.map((key) => [key, row[key]]));
  });
  return { snapshotId: snapshot.snapshot_id, sourceAsOf: snapshot.source_as_of,
    rows: validateFabricLoanSnapshot(rows, [...FABRIC_LOAN_FIELDS]) };
}

export async function readBoundedSnapshot(request: Request): Promise<string> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_SNAPSHOT_BYTES)) throw new Error('PAYLOAD_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('INVALID_SNAPSHOT');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SNAPSHOT_BYTES) { await reader.cancel(); throw new Error('PAYLOAD_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
