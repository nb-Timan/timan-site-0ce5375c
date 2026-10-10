import com.microsoft.spark.fabric
from com.microsoft.spark.fabric.Constants import Constants
from datetime import datetime, timezone
import hashlib
import hmac
import json
import time
import urllib.request
import uuid

# Non-secret notebook parameter: the dedicated encrypted HTTPS connection ID.
# Never reuse the Loans connection implicitly. No credential is stored in this file.
PARTNER_CONNECTION_ID = ''
WORKSPACE_ID = 'fbdf1344-cf96-42fa-9ded-ce8786b4c58b'
INGEST_URL = 'https://rdodyoixxybiozvmuqon.supabase.co/functions/v1/fabric-partner-shadow-sync/ingest'
SOURCE_FIELDS = [
    'DATASET', 'ACCOUNT', 'NAME', 'ADDRESS1', 'ADDRESS2', 'ZIPCITY', 'COUNTRY', 'ISO_LAND',
    'PHONE', 'EMAIL', 'INVOICEACCOUNT', 'GROUP_', 'A_B_KUNDE', 'SALESREP', 'LANGUAGE_',
    'VATNUMBER', 'CURRENCY', 'PAYMENT', 'BLOCKED', 'APPROVED', 'ROWNUMBER', 'LASTCHANGED',
]


def push_partner_shadow():
    assert PARTNER_CONNECTION_ID, 'Dedicated encrypted partner connection required'
    frame = (spark.read.option(Constants.WorkspaceId, WORKSPACE_ID)
             .option(Constants.DatabaseName, 'Staging')
             .synapsesql('SELECT ' + ','.join(SOURCE_FIELDS) + ' FROM C5.partner_master_current'))
    assert set(frame.columns) == set(SOURCE_FIELDS)
    source_rows = frame.limit(10001).collect()
    assert 0 < len(source_rows) <= 10000
    wire_rows = []
    for source in source_rows:
        row = {field: source[field] for field in SOURCE_FIELDS}
        if row['LASTCHANGED'] is not None:
            row['LASTCHANGED'] = row['LASTCHANGED'].isoformat()
        wire_rows.append(row)
    body = json.dumps({
        'snapshot_id': str(uuid.uuid4()),
        'source_as_of': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'expected_row_count': len(wire_rows), 'rows': wire_rows,
    }, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    connection = notebookutils.connections.getCredential(PARTNER_CONNECTION_ID)
    credential = connection.get('credential')
    credential = json.loads(credential) if isinstance(credential, str) else credential
    values = {str(item.get('name', '')).lower(): item.get('value')
              for item in credential.get('credentialData', [])}
    secret = values.get('password') or values.get('pwd')
    assert isinstance(secret, str) and len(secret) >= 32
    timestamp = str(int(time.time()))
    signature = hmac.new(secret.encode(), f'{timestamp}.{body}'.encode(), hashlib.sha256).hexdigest()
    request = urllib.request.Request(INGEST_URL, data=body.encode(), method='POST', headers={
        'Content-Type': 'application/json', 'X-Fabric-Timestamp': timestamp,
        'X-Fabric-Signature': signature,
    })
    # Do not let a failed ingest redirect partner data to another destination.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    with urllib.request.build_opener(NoRedirect).open(request, timeout=90) as response:
        result = json.loads(response.read())
    assert result.get('status') == 'SUCCEEDED' and result.get('rowCount') == len(wire_rows)
    return {'status': 'SUCCEEDED', 'rows': len(wire_rows)}


try:
    print(push_partner_shadow())
except Exception as error:
    print({'shadow_sync': 'FAIL', 'error_type': type(error).__name__,
           'http_status': getattr(error, 'code', None)})
