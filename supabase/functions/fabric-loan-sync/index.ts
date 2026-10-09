import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.101.1';
import { readBoundedSnapshot, validateFabricPush, verifyFabricSignature, verifyFabricConnection } from './fabricIngest.ts';

const cors = { 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const respond = (body: unknown, status = 200, browser = false) => new Response(JSON.stringify(body), {
  status, headers: { ...(browser ? cors : {}), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

Deno.serve(async (request) => {
  const path = new URL(request.url).pathname;
  if (path.endsWith('/fabric-loan-sync/connection-check')) {
    if (request.method !== 'GET' || request.headers.has('Origin')) return respond({ error: 'UNAUTHORIZED' }, 401);
    const valid = await verifyFabricConnection(Deno.env.get('FABRIC_LOANS_INGEST_SECRET'), request.headers.get('Authorization'));
    return valid ? respond({ status: 'CONNECTED' }) : respond({ error: 'UNAUTHORIZED' }, 401);
  }
  const ingest = path.endsWith('/fabric-loan-sync/ingest');
  if (!ingest && !path.endsWith('/fabric-loan-sync')) return respond({ error: 'NOT_FOUND' }, 404);
  if (request.method === 'OPTIONS' && !ingest) return new Response(null, { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'METHOD_NOT_ALLOWED' }, 405, !ingest);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key || !anon) return respond({ error: 'SERVER_CONFIGURATION' }, 503, !ingest);

  if (ingest) {
    // Portal sessions and browser origins are not accepted at the machine-only ingress.
    if (request.headers.has('Authorization') || request.headers.has('Origin')) return respond({ error: 'UNAUTHORIZED' }, 401);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return respond({ error: 'UNSUPPORTED_MEDIA_TYPE' }, 415);
    let raw: string;
    try { raw = await readBoundedSnapshot(request); }
    catch { return respond({ error: 'INVALID_SNAPSHOT' }, 400); }
    const authorized = await verifyFabricSignature(Deno.env.get('FABRIC_LOANS_INGEST_SECRET'),
      request.headers.get('x-fabric-signature'), request.headers.get('x-fabric-timestamp'), raw);
    if (!authorized) return respond({ error: 'UNAUTHORIZED' }, 401);
    let snapshot;
    try { snapshot = validateFabricPush(JSON.parse(raw)); }
    catch { return respond({ error: 'INVALID_SNAPSHOT' }, 400); }
    const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await service.rpc('fabric_loan_ingest_snapshot', {
      p_snapshot_id: snapshot.snapshotId, p_source_as_of: snapshot.sourceAsOf, p_rows: snapshot.rows,
    });
    if (result.error) {
      const conflict = ['SNAPSHOT_ID_REUSED', 'STALE_SNAPSHOT', 'SYNC_IN_PROGRESS'].includes(result.error.message);
      return respond({ error: conflict ? result.error.message : 'SYNC_FAILED' }, conflict ? 409 : 503);
    }
    return respond(result.data);
  }

  // Backend can only queue the next Fabric-side run; it cannot supply rows or source queries.
  const authorization = request.headers.get('Authorization');
  if (!authorization) return respond({ error: 'UNAUTHORIZED' }, 401, true);
  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const user = await caller.auth.getUser();
  if (user.error || !user.data.user) return respond({ error: 'UNAUTHORIZED' }, 401, true);
  const allowed = await caller.rpc('can_administer_loans');
  if (allowed.error || allowed.data !== true) return respond({ error: 'FORBIDDEN' }, 403, true);
  let body;
  try { body = JSON.parse(await readBoundedSnapshot(request)); }
  catch { return respond({ error: 'INVALID_REQUEST' }, 400, true); }
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).length !== 0) return respond({ error: 'INVALID_REQUEST' }, 400, true);
  const result = await caller.rpc('loan_request_fabric_refresh');
  if (result.error) return respond({ error: 'REFRESH_UNAVAILABLE' }, 503, true);
  return respond(result.data, 202, true);
});
