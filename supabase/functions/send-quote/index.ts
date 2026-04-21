// Edge Function: server-side proxy for the n8n quote webhook.
// Avoids browser CORS issues and returns structured errors to the client.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const QUOTE_WEBHOOK_URL =
  'https://n8n.srv1509152.hstgr.cloud/webhook/timan-afsend-tilbud';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  console.log('[send-quote] Forwarding to n8n', {
    case_id: payload.case_id,
    quote_number: payload.quote_number,
    recipients: payload.recipients,
    pdf_size:
      typeof payload.pdf_base64 === 'string'
        ? (payload.pdf_base64 as string).length
        : 0,
  });

  try {
    const upstream = await fetch(QUOTE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, document_type: payload.document_type ?? 'Tilbud' }),
    });

    const respText = await upstream.text().catch(() => '');
    console.log('[send-quote] n8n response', upstream.status, respText.slice(0, 500));

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          status: upstream.status,
          statusText: upstream.statusText,
          error: `Webhook returned HTTP ${upstream.status}`,
          response_text: respText.slice(0, 1000),
          requested_url: QUOTE_WEBHOOK_URL,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        status: upstream.status,
        response_text: respText.slice(0, 1000),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-quote] Unexpected fetch error:', message);
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Unexpected error calling webhook',
        error_message: message,
        requested_url: QUOTE_WEBHOOK_URL,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
