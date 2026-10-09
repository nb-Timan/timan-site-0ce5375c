import com.microsoft.spark.fabric
from com.microsoft.spark.fabric.Constants import Constants
from datetime import date, datetime, timezone
from decimal import Decimal
import hashlib
import hmac
import json
import time
import urllib.request
import uuid

WORKSPACE_ID = 'fbdf1344-cf96-42fa-9ded-ce8786b4c58b'
DATABASE_NAME = 'Staging'
CONNECTION_ID = '3d5e9001-15ee-4500-9098-854415416dc6'
INGEST_URL = 'https://rdodyoixxybiozvmuqon.supabase.co/functions/v1/fabric-loan-sync/ingest'
SOURCE_FIELDS = [
    'asset_instance_id', 'instance_ordinal', 'company', 'account_number', 'order_number',
    'line_number', 'item_number', 'item_name', 'line_text', 'serial_number',
    'warehouse_location_code', 'warehouse_location_name', 'inventory_qty', 'reserved_qty',
    'stock_last_changed', 'source_row_number', 'classification', 'review_required',
    'review_reason', 'identity_conflict'
]


def json_value(value):
    if isinstance(value, Decimal):
        return format(value, 'f')
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


loan_df = (
    spark.read
    .option(Constants.WorkspaceId, WORKSPACE_ID)
    .option(Constants.DatabaseName, DATABASE_NAME)
    .synapsesql('SELECT ' + ','.join(SOURCE_FIELDS) + ' FROM C5.loan_assets_current')
)
loan_rows = loan_df.collect()
assert len(loan_rows) <= 10000
assert set(loan_df.columns) == set(SOURCE_FIELDS)

source_as_of = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
wire_rows = []
for source_row in loan_rows:
    row = {field: json_value(source_row[field]) for field in SOURCE_FIELDS}
    serial = None if row['serial_number'] is None else str(row['serial_number']).strip()
    row['serial_number'] = serial or None
    row['serial_number_normalized'] = serial.upper() if serial else None
    row['source_as_of'] = source_as_of
    wire_rows.append(row)

payload = {
    'snapshot_id': str(uuid.uuid4()),
    'source_as_of': source_as_of,
    'expected_row_count': len(wire_rows),
    'rows': wire_rows,
}
body = json.dumps(payload, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
connection = notebookutils.connections.getCredential(CONNECTION_ID)
credential = connection.get('credential')
credential = json.loads(credential) if isinstance(credential, str) else credential
credential_items = credential.get('credentialData', [])
credential_values = {str(item.get('name', '')).lower(): item.get('value') for item in credential_items}
ingest_secret = credential_values.get('password') or credential_values.get('pwd')
assert isinstance(ingest_secret, str) and len(ingest_secret) >= 32

timestamp = str(int(time.time()))
signature = hmac.new(
    ingest_secret.encode('utf-8'),
    f'{timestamp}.{body}'.encode('utf-8'),
    hashlib.sha256,
).hexdigest()
request = urllib.request.Request(
    INGEST_URL,
    data=body.encode('utf-8'),
    headers={
        'Content-Type': 'application/json',
        'X-Fabric-Timestamp': timestamp,
        'X-Fabric-Signature': signature,
    },
    method='POST',
)
with urllib.request.urlopen(request, timeout=90) as response:
    result = json.loads(response.read().decode('utf-8'))
assert result.get('status') == 'SUCCEEDED'
assert int(result.get('rowCount', -1)) == len(wire_rows)
print({
    'status': result['status'],
    'rows': len(wire_rows),
    'non_serialized': sum(row['serial_number'] is None for row in wire_rows),
    'accounts': {account: sum(str(row['account_number']) == account for row in wire_rows)
                 for account in ('1010', '1020')},
    'warehouses': {code: sum(str(row['warehouse_location_code']) == code for row in wire_rows)
                   for code in ('2', '4')},
})
del ingest_secret, credential, credential_items, credential_values, connection
