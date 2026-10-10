export const PARTNER_SOURCE_FIELDS = [
  'DATASET', 'ACCOUNT', 'NAME', 'ADDRESS1', 'ADDRESS2', 'ZIPCITY', 'COUNTRY', 'ISO_LAND',
  'PHONE', 'EMAIL', 'INVOICEACCOUNT', 'GROUP_', 'A_B_KUNDE', 'SALESREP', 'LANGUAGE_',
  'VATNUMBER', 'CURRENCY', 'PAYMENT', 'BLOCKED', 'APPROVED', 'ROWNUMBER', 'LASTCHANGED',
] as const;

export interface PartnerShadowRow {
  company: 'DAT'; account_number: string; account_raw: string; company_name: string | null;
  address1: string | null; address2: string | null; postal_code: string | null; city: string | null;
  zipcity_raw: string | null; zipcity_validation: 'EMPTY' | 'PARSED_DK' | 'REVIEW_REQUIRED';
  country: string | null; iso_country: string | null; phone: string | null; email: string | null;
  c5_invoice_account_number: string | null; c5_group: string | null; c5_partner_type_code: string | null;
  c5_salesrep: string | null; language: number | null; vat_number: string | null;
  currency: string | null; payment: string | null; c5_blocked: number | null; c5_approved: number | null;
  source_row_number: number; source_last_changed: string | null;
}

export function c5Text(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 2000) throw new Error('INVALID_SOURCE_FIELD');
  const trimmed = value.trim();
  if (!trimmed || trimmed === '\x02') return null;
  if ([...trimmed].some(character => character.charCodeAt(0) < 32)) throw new Error('INVALID_SOURCE_FIELD');
  return trimmed;
}

export function parsePartnerZipCity(raw: string | null, iso: string | null) {
  if (!raw) return { postal_code: null, city: null, zipcity_validation: 'EMPTY' as const };
  const match = iso === 'DK' ? /^(\d{4})\s+([^\d\s].*)$/.exec(raw) : null;
  return match
    ? { postal_code: match[1], city: match[2], zipcity_validation: 'PARSED_DK' as const }
    : { postal_code: null, city: null, zipcity_validation: 'REVIEW_REQUIRED' as const };
}

export function normalizePartnerSource(input: unknown): PartnerShadowRow {
  const invalid = (): never => { throw new Error('INVALID_PARTNER_SOURCE'); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const row = input as Record<string, unknown>;
  if (Object.keys(row).length !== PARTNER_SOURCE_FIELDS.length
    || !PARTNER_SOURCE_FIELDS.every(key => key in row) || c5Text(row.DATASET) !== 'DAT') return invalid();
  const integer = (key: string): number | null => {
    const value = row[key];
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) return invalid();
    return value;
  };
  const account = c5Text(row.ACCOUNT);
  const sourceRow = integer('ROWNUMBER');
  if (!account || sourceRow === null) return invalid();
  const changed = c5Text(row.LASTCHANGED);
  // C5 datetime2 has no timezone. Preserve it; do not label it UTC.
  if (changed && !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,7})?$/.test(changed)) return invalid();
  const iso = c5Text(row.ISO_LAND);
  const zipcity = c5Text(row.ZIPCITY);
  return {
    company: 'DAT', account_number: account, account_raw: row.ACCOUNT as string,
    company_name: c5Text(row.NAME), address1: c5Text(row.ADDRESS1), address2: c5Text(row.ADDRESS2),
    zipcity_raw: zipcity, ...parsePartnerZipCity(zipcity, iso), country: c5Text(row.COUNTRY), iso_country: iso,
    phone: c5Text(row.PHONE), email: c5Text(row.EMAIL), c5_invoice_account_number: c5Text(row.INVOICEACCOUNT),
    c5_group: c5Text(row.GROUP_), c5_partner_type_code: integer('A_B_KUNDE')?.toString() ?? null,
    c5_salesrep: c5Text(row.SALESREP), language: integer('LANGUAGE_'), vat_number: c5Text(row.VATNUMBER),
    currency: c5Text(row.CURRENCY), payment: c5Text(row.PAYMENT), c5_blocked: integer('BLOCKED'),
    c5_approved: integer('APPROVED'), source_row_number: sourceRow, source_last_changed: changed,
  };
}

export function validatePartnerPush(input: unknown, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_SNAPSHOT');
  const snapshot = input as Record<string, unknown>;
  if (Object.keys(snapshot).length !== 4
    || !['snapshot_id', 'source_as_of', 'expected_row_count', 'rows'].every(key => key in snapshot)
    || typeof snapshot.snapshot_id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(snapshot.snapshot_id)
    || typeof snapshot.source_as_of !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(snapshot.source_as_of)
    || !Number.isFinite(Date.parse(snapshot.source_as_of))
    || Date.parse(snapshot.source_as_of) < now - 600000 || Date.parse(snapshot.source_as_of) > now + 60000
    || !Array.isArray(snapshot.rows) || snapshot.rows.length === 0 || snapshot.rows.length > 10000
    || snapshot.expected_row_count !== snapshot.rows.length) throw new Error('INVALID_SNAPSHOT');
  const rows = snapshot.rows.map(normalizePartnerSource);
  if (new Set(rows.map(row => row.source_row_number)).size !== rows.length) throw new Error('DUPLICATE_SOURCE_ROW');
  return { snapshotId: snapshot.snapshot_id, sourceAsOf: snapshot.source_as_of, rows };
}
