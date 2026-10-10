import { afterEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { verifyFabricSignature, readBoundedSnapshot } from '../../supabase/functions/fabric-loan-sync/fabricIngest';
afterEach(() => vi.unstubAllGlobals());
describe('partner shadow signed transport and production boundaries', () => {
  it('authenticates exact bytes and refuses changed or expired payloads', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const secret = 'qa-fixture-only-not-a-production-credential';
    const timestamp = String(Math.floor(Date.now() / 1000)), body = '{"rows":[]}';
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`)))].map(b => b.toString(16).padStart(2, '0')).join('');
    expect(await verifyFabricSignature(secret, signature, timestamp, body)).toBe(true);
    expect(await verifyFabricSignature(secret, signature, timestamp, body + ' ')).toBe(false);
    expect(await verifyFabricSignature(secret, signature, timestamp, body, Date.now() + 400000)).toBe(false);
  });
  it('bounds the body before parsing or storing it', async () => {
    await expect(readBoundedSnapshot(new Request('https://example.invalid', { method: 'POST', body: '{}', headers: { 'content-length': '9999999' } }))).rejects.toThrow('PAYLOAD_TOO_LARGE');
  });
  it('has separate authentication and no browser or Portal masterdata writes', () => {
    const edge = readFileSync('supabase/functions/fabric-partner-shadow-sync/index.ts', 'utf8');
    expect(edge).toContain("Deno.env.get('FABRIC_PARTNER_SHADOW_INGEST_SECRET')");
    expect(edge).toContain("request.headers.has('origin')");
    expect(edge).toContain("request.headers.has('authorization')");
    expect(edge).toContain('verifyFabricSignature');
    expect(edge).not.toContain('.from(');
    expect(edge).not.toContain('console.');
    const migration = readFileSync('supabase/migrations/20261009100017_fabric_partner_master_shadow.sql', 'utf8');
    expect(migration).not.toMatch(/(?:insert into|update|delete from|alter table) public\.(dealer_accounts|app_users|partner_account_relations|loan_cases)/i);
    expect(migration).not.toMatch(/drop\s|grant\s+all/i);
  });
  it('does not reuse Loans credentials or Fabric source permissions', () => {
    const notebook = readFileSync('fabric/partners/notebook.py', 'utf8');
    expect(notebook).toContain("PARTNER_CONNECTION_ID = ''");
    expect(notebook).toContain('C5.partner_master_current');
    expect(notebook).not.toContain('3d5e9001-15ee-4500-9098-854415416dc6');
    const view = readFileSync('fabric/partners/partner_master_current.sql', 'utf8');
    expect(view).not.toMatch(/select\s+\*|grant\s/i);
    expect(view).toContain("WHERE TRIM([DATASET])='DAT'");
  });
});
