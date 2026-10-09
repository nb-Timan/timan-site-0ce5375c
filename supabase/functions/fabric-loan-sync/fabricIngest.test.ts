import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1.0.14';
import { MAX_SNAPSHOT_BYTES, readBoundedSnapshot, validateFabricPush, verifyFabricSignature, verifyFabricConnection } from './fabricIngest.ts';
import { FABRIC_LOAN_FIELDS } from '../_shared/fabricLoanSnapshot.ts';

const now = Date.parse('2026-10-08T08:00:00Z');
const sourceAsOf = new Date(now).toISOString();
const row = { asset_instance_id: 'SERIAL|TEST|TEST-SERIAL', instance_ordinal: 1,
  company: 'TEST', account_number: '1010', order_number: null, line_number: null,
  item_number: 'TEST', item_name: 'Test', line_text: null, serial_number: ' test-serial ', warehouse_location_code: '2',
  warehouse_location_name: 'Lager 2', inventory_qty: '1.0', reserved_qty: 0, stock_last_changed: null,
  source_row_number: '123', classification: 'LOAN_CANDIDATE', review_required: false, review_reason: null,
  identity_conflict: false, serial_number_normalized: 'TEST-SERIAL', source_as_of: sourceAsOf };
const snapshot = () => ({ snapshot_id: '11111111-1111-4111-8111-111111111111', source_as_of: sourceAsOf,
  expected_row_count: 1, rows: [{ ...row }] });

Deno.test('push accepts exactly the approved operational fields, nullable order, and decimal quantity', () => {
  const parsed = validateFabricPush(snapshot(), now);
  assertEquals(Object.keys(parsed.rows[0]), [...FABRIC_LOAN_FIELDS]);
  assertEquals(parsed.rows[0].order_number, null);
  assertEquals(parsed.rows[0].inventory_qty, '1.0');
  assertEquals(validateFabricPush({ ...snapshot(), rows: [], expected_row_count: 0 }, now).rows, []);
});

Deno.test('push preserves one non-serialized bulk source row and its full quantity', () => {
  const nonSerialized = { ...row, asset_instance_id: 'LINE|TEST|123|1', serial_number: null,
    serial_number_normalized: null, instance_ordinal: 1, inventory_qty: '18' };
  const parsed = validateFabricPush({ ...snapshot(), rows: [nonSerialized] }, now);
  assertEquals(parsed.rows[0].serial_number, null);
  assertEquals(parsed.rows[0].asset_instance_id, 'LINE|TEST|123|1');
  assertEquals(parsed.rows[0].inventory_qty, '18');
  assertThrows(() => validateFabricPush({ ...snapshot(), expected_row_count: 2,
    rows: [nonSerialized, { ...nonSerialized, asset_instance_id: 'LINE|TEST|123|2', instance_ordinal: 2 }] }, now));
});

for (const [name, patch] of Object.entries({ unknown: { sql: 'SELECT 1' }, id: { snapshot_id: 'bad' },
  partial: { expected_row_count: 2 }, stale: { source_as_of: '2026-10-08T07:00:00Z' },
  future: { source_as_of: '2026-10-09T08:00:00Z' }, missingTimezone: { source_as_of: '2026-10-08T08:00:00' } })) {
  Deno.test(`push rejects envelope ${name}`, () => { assertThrows(() => validateFabricPush({ ...snapshot(), ...patch }, now)); });
}
for (const [name, patch] of Object.entries({ finance: { cost_price: 1 }, normalized: { serial_number_normalized: 'OTHER' },
  rowTime: { source_as_of: '2026-10-08T07:59:00Z' }, boolean: { review_required: null },
  quantity: { inventory_qty: 'Infinity' }, rowNumber: { source_row_number: '1.25' },
  classification: { classification: 'GUESS' }, text: { item_name: 'a'.repeat(2001) } })) {
  Deno.test(`push rejects row ${name}`, () => { assertThrows(() => validateFabricPush({ ...snapshot(), rows: [{ ...row, ...patch }] }, now)); });
}
Deno.test('push rejects duplicate normalized company + serial', () => { assertThrows(() => validateFabricPush({
  ...snapshot(), expected_row_count: 2, rows: [row, { ...row, asset_instance_id: 'SERIAL|TEST|OTHER', serial_number: 'TEST-SERIAL' }],
}, now)); });
Deno.test('push rejects duplicate physical instance identities', () => { assertThrows(() => validateFabricPush({
  ...snapshot(), expected_row_count: 2, rows: [row, { ...row, serial_number: null, serial_number_normalized: null }],
}, now)); });

Deno.test('HMAC accepts only the exact signed payload and timestamp, never Portal JWTs', async () => {
  const secret = 'test-only-not-a-production-key-123456789';
  const timestamp = String(now / 1000);
  const body = JSON.stringify(snapshot());
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`)));
  const signature = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  assertEquals(await verifyFabricSignature(secret, signature, timestamp, body, now), true);
  assertEquals(await verifyFabricSignature(secret, signature, timestamp, body + ' ', now), false);
  assertEquals(await verifyFabricSignature(secret, signature, timestamp, body, now + 301000), false);
  assertEquals(await verifyFabricSignature(secret, 'portal-session-jwt', timestamp, body, now), false);
  assertEquals(await verifyFabricSignature(undefined, signature, timestamp, body, now), false);
  assertEquals(await verifyFabricSignature(secret, null, timestamp, body, now), false);
});

Deno.test('bounded stream rejects oversized and invalid UTF-8 input', async () => {
  assertEquals(await readBoundedSnapshot(new Request('https://example.test', { method: 'POST', body: '{}' })), '{}');
  await assertRejects(() => readBoundedSnapshot(new Request('https://example.test', { method: 'POST', body: 'a'.repeat(MAX_SNAPSHOT_BYTES + 1) })));
  await assertRejects(() => readBoundedSnapshot(new Request('https://example.test', { method: 'POST', body: new Uint8Array([255]) })));
});

Deno.test('read-only connection probe accepts only its dedicated encrypted REST credential', async () => {
  const secret = 'test-only-not-a-production-key-123456789';
  assertEquals(await verifyFabricConnection(secret, `Basic ${btoa(`fabric_loans_ingest:${secret}`)}`), true);
  assertEquals(await verifyFabricConnection(secret, `Basic ${btoa('fabric_loans_ingest:wrong')}`), false);
  assertEquals(await verifyFabricConnection(secret, `Basic ${btoa(`other:${secret}`)}`), false);
  assertEquals(await verifyFabricConnection(secret, 'Bearer portal-jwt'), false);
  assertEquals(await verifyFabricConnection(secret, null), false);
  assertEquals(await verifyFabricConnection(secret, 'Basic ***invalid***'), false);
  assertEquals(await verifyFabricConnection(undefined, `Basic ${btoa(`fabric_loans_ingest:${secret}`)}`), false);
});
