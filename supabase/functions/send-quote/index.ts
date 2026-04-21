type JsonPayload = Record<string, unknown>;

const QUOTE_WEBHOOK_URL = 'https://n8n.srv1509152.hstgr.cloud/webhook/timan-afsend-tilbud';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: JsonPayload, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const startedAt = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed', status: 405 }, 405);
  }

  let payload: JsonPayload;
  try {
    payload = await req.json();
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: 'Invalid JSON body',
      status: 400,
      error_message: error instanceof Error ? error.message : String(error),
    }, 400);
  }

  console.log('[send-quote] Forwarding quote to n8n', {
    requested_url: QUOTE_WEBHOOK_URL,
    case_id: payload.case_id,
    document_type: payload.document_type ?? 'Tilbud',
    quote_number: payload.quote_number,
    recipients: payload.recipients,
    pdf_filename: payload.pdf_filename,
    pdf_size: typeof payload.pdf_base64 === 'string' ? payload.pdf_base64.length : 0,
  });

  try {
    const upstream = await fetch(QUOTE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        document_type: payload.document_type ?? 'Tilbud',
      }),
    });

    const responseText = await upstream.text().catch(() => '');

    console.log('[send-quote] n8n response', {
      status: upstream.status,
      statusText: upstream.statusText,
      response_preview: responseText.slice(0, 500),
      processing_time_ms: Date.now() - startedAt,
    });

    if (!upstream.ok) {
      return jsonResponse({
        ok: false,
        error: `n8n quote webhook failed with HTTP ${upstream.status}`,
        status: upstream.status,
        statusText: upstream.statusText,
        response_text: responseText,
        requested_url: QUOTE_WEBHOOK_URL,
        diagnostics: {
          error_stage: 'n8n_request_failed',
          processing_time_ms: Date.now() - startedAt,
        },
      });
    }

    return jsonResponse({
      ok: true,
      status: upstream.status,
      statusText: upstream.statusText,
      response_text: responseText,
      requested_url: QUOTE_WEBHOOK_URL,
      diagnostics: {
        processing_time_ms: Date.now() - startedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[send-quote] Edge function fetch error', message);

    return jsonResponse({
      ok: false,
      error: 'Edge function could not call n8n quote webhook',
      error_message: message,
      requested_url: QUOTE_WEBHOOK_URL,
      diagnostics: {
        error_stage: 'edge_fetch_failed',
        processing_time_ms: Date.now() - startedAt,
      },
    });
  }
});
