import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { readBoundedSnapshot, verifyFabricSignature } from '../fabric-loan-sync/fabricIngest.ts';
import { validatePartnerPush } from '../_shared/fabricPartnerSnapshot.ts';

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function handlePartnerShadowRequest(request: Request) {
  // Dedicated machine-to-machine endpoint, never an authenticated browser import.
  if (request.method !== 'POST' || !new URL(request.url).pathname.endsWith('/ingest')
    || request.headers.has('origin') || request.headers.has('authorization')
    || request.headers.get('content-type')?.split(';')[0] !== 'application/json') return json({ error: 'FORBIDDEN' }, 403);
  const secret = Deno.env.get('FABRIC_PARTNER_SHADOW_INGEST_SECRET');
  if (!secret || secret.length < 32) return json({ error: 'INTEGRATION_NOT_CONFIGURED' }, 503);
  let body: string;
  try { body = await readBoundedSnapshot(request); } catch { return json({ error: 'INVALID_SNAPSHOT' }, 400); }
  if (!await verifyFabricSignature(secret, request.headers.get('x-fabric-signature'),
    request.headers.get('x-fabric-timestamp'), body)) return json({ error: 'UNAUTHORIZED' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const snapshot = validatePartnerPush(JSON.parse(body));
    const { data, error } = await admin.rpc('fabric_partner_shadow_ingest', {
      p_snapshot_id: snapshot.snapshotId, p_source_as_of: snapshot.sourceAsOf, p_rows: snapshot.rows,
    });
    if (error) throw new Error('SYNC_FAILED');
    return json({ status: 'SUCCEEDED', rowCount: data }, 200);
  } catch {
    // Failure metadata only. Previous successful rows and freshness remain intact.
    await admin.rpc('fabric_partner_shadow_record_failure');
    return json({ error: 'SYNC_FAILED' }, 400);
  }
}

Deno.serve(handlePartnerShadowRequest);
